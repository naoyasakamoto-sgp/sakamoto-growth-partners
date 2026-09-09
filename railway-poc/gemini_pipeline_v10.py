from __future__ import annotations

import base64
import io
import json
import os
import urllib.error
import urllib.request
from typing import Any

from PIL import Image, ImageOps

import vlm_pipeline_v9 as base

VERSION = "10.0.0-gemini-3.8-flash"
MODEL = os.getenv("GEMINI_VISION_MODEL", "gemini-3.8-flash")
API_BASE = os.getenv("GEMINI_API_BASE", "https://generativelanguage.googleapis.com/v1beta")
TIMEOUT = int(os.getenv("VLM_TIMEOUT_SEC", "150"))
MAX_EDGE = int(os.getenv("VLM_IMAGE_MAX_EDGE", "1800"))
JPEG_QUALITY = int(os.getenv("VLM_JPEG_QUALITY", "86"))
THINKING_LEVEL = os.getenv("GEMINI_THINKING_LEVEL", "medium").lower()
VERIFY = os.getenv("GEMINI_VERIFY", "0").lower() in {"1", "true", "yes", "on"}
INPUT_USD_PER_MTOK = float(os.getenv("GEMINI_INPUT_USD_PER_MTOK", "0.75"))
OUTPUT_USD_PER_MTOK = float(os.getenv("GEMINI_OUTPUT_USD_PER_MTOK", "3.75"))
USDJPY = float(os.getenv("AI_COST_USDJPY", "150"))


class GeminiUnavailable(RuntimeError):
    pass


class GeminiCallError(RuntimeError):
    pass


def status() -> dict[str, Any]:
    configured = bool(os.getenv("GEMINI_API_KEY", "").strip())
    return {
        "pipeline_version": VERSION,
        "mode": "gemini",
        "configured": configured,
        "provider": "Google Gemini Developer API",
        "model": MODEL,
        "verification_pass": VERIFY,
        "thinking_level": THINKING_LEVEL,
        "external_ai": configured,
        "fallback": "OpenCV/Tesseract v8.2",
        "estimated_pricing_usd_per_mtok": {
            "input": INPUT_USD_PER_MTOK,
            "output_including_thinking": OUTPUT_USD_PER_MTOK,
        },
    }


def _jpeg_b64(raw: bytes) -> str:
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    if max(im.size) > MAX_EDGE:
        ratio = MAX_EDGE / max(im.size)
        im = im.resize((max(1, int(im.width * ratio)), max(1, int(im.height * ratio))), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _sanitize_schema(obj: Any) -> Any:
    # Gemini structured output supports a useful subset of JSON Schema. Remove
    # strictness-only keywords that are not required for the response contract.
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if k in {"additionalProperties", "$schema"}:
                continue
            out[k] = _sanitize_schema(v)
        return out
    if isinstance(obj, list):
        return [_sanitize_schema(x) for x in obj]
    return obj


def _parts(license_raw: bytes, ticket_raws: list[bytes], item_raws: list[bytes], verification: bool, prior: dict[str, Any] | None) -> list[dict[str, Any]]:
    mode = "Independent verification pass: re-read pixels from scratch and correct any disagreement." if verification else "Primary extraction pass."
    prompt = base._instructions(len(ticket_raws), len(item_raws), verification)
    prompt += "\n" + mode + " Return only data supported by visible evidence. Printed fixed shop text is template noise."
    if verification and prior:
        prompt += "\nPrimary candidate is NOT ground truth; use it only to spot disagreements:\n" + json.dumps(prior, ensure_ascii=False)[:10000]
    parts: list[dict[str, Any]] = [{"text": prompt}]
    parts += [{"text": "IMAGE ROLE: identity_document / Japanese driving license"}, {"inline_data": {"mime_type": "image/jpeg", "data": _jpeg_b64(license_raw)}}]
    for i, raw in enumerate(ticket_raws):
        parts += [{"text": f"IMAGE ROLE: pawn_ticket index={i}"}, {"inline_data": {"mime_type": "image/jpeg", "data": _jpeg_b64(raw)}}]
    for i, raw in enumerate(item_raws):
        parts += [{"text": f"IMAGE ROLE: product_photo index={i}"}, {"inline_data": {"mime_type": "image/jpeg", "data": _jpeg_b64(raw)}}]
    return parts


def _response_text(data: dict[str, Any]) -> str:
    for cand in data.get("candidates") or []:
        content = cand.get("content") or {}
        texts = [p.get("text") for p in content.get("parts") or [] if isinstance(p, dict) and isinstance(p.get("text"), str)]
        if texts:
            return "".join(texts).strip()
    return ""


def _usage_meta(data: dict[str, Any]) -> dict[str, Any]:
    u = data.get("usageMetadata") or {}
    prompt = int(u.get("promptTokenCount") or 0)
    candidates = int(u.get("candidatesTokenCount") or 0)
    thoughts = int(u.get("thoughtsTokenCount") or 0)
    total = int(u.get("totalTokenCount") or (prompt + candidates + thoughts))
    output_billable = max(candidates + thoughts, max(0, total - prompt))
    usd = (prompt * INPUT_USD_PER_MTOK + output_billable * OUTPUT_USD_PER_MTOK) / 1_000_000
    return {
        "prompt_tokens": prompt,
        "candidate_tokens": candidates,
        "thinking_tokens": thoughts,
        "total_tokens": total,
        "estimated_cost_usd": round(usd, 6),
        "estimated_cost_jpy": round(usd * USDJPY, 3),
        "raw": u,
    }


def _call(license_raw: bytes, ticket_raws: list[bytes], item_raws: list[bytes], verification: bool = False, prior: dict[str, Any] | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        raise GeminiUnavailable("GEMINI_API_KEY is not configured")
    if THINKING_LEVEL not in {"low", "medium", "high"}:
        raise GeminiCallError("GEMINI_THINKING_LEVEL must be low, medium, or high")
    url = f"{API_BASE}/models/{MODEL}:generateContent"
    payload = {
        "contents": [{"role": "user", "parts": _parts(license_raw, ticket_raws, item_raws, verification, prior)}],
        "generationConfig": {
            "thinkingConfig": {"thinkingLevel": THINKING_LEVEL},
            "responseFormat": {
                "text": {
                    "mimeType": "application/json",
                    "schema": _sanitize_schema(base._schema()),
                }
            },
        },
    }
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST", headers={"x-goog-api-key": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            data = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            msg = e.read().decode("utf-8")[:1600]
        except Exception:
            msg = str(e)
        raise GeminiCallError(f"HTTP {e.code}: {msg}") from e
    except Exception as e:
        raise GeminiCallError(f"{type(e).__name__}: {e}") from e
    text = _response_text(data)
    if not text:
        finish = [x.get("finishReason") for x in data.get("candidates") or [] if isinstance(x, dict)]
        raise GeminiCallError(f"Gemini returned no JSON text; finish={finish}")
    try:
        parsed = json.loads(text)
    except Exception as e:
        raise GeminiCallError("Gemini structured output was not valid JSON") from e
    meta = {
        "model": data.get("modelVersion") or MODEL,
        "provider": "Google Gemini Developer API",
        "verification": verification,
        "usage": _usage_meta(data),
    }
    return parsed, meta


def extract(license_raw: bytes, ticket_raws: list[bytes], item_raws: list[bytes], base_response: dict[str, Any]) -> dict[str, Any]:
    primary, m1 = _call(license_raw, ticket_raws, item_raws, verification=False)
    verifier = None
    metas = [m1]
    if VERIFY:
        verifier, m2 = _call(license_raw, ticket_raws, item_raws, verification=True, prior=primary)
        metas.append(m2)
    final = base._consensus(primary, verifier, base_response)
    cost_jpy = sum(float((m.get("usage") or {}).get("estimated_cost_jpy") or 0) for m in metas)
    final["_meta"] = {
        "pipeline_version": VERSION,
        "provider": "Google Gemini Developer API",
        "model": MODEL,
        "passes": metas,
        "external_ai": True,
        "estimated_cost_jpy": round(cost_jpy, 3),
    }
    return final


def apply_to_response(base_response: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    response = base.apply_to_response(base_response, result)
    response.setdefault("vision", {})["provider"] = "Google Gemini Developer API"
    response["vision"]["model"] = MODEL
    response["vision"]["pipeline_version"] = VERSION
    response["vision"]["vlm_used"] = True
    response["vision"]["external_ai"] = True
    response["vision"]["estimated_cost_jpy"] = float((result.get("_meta") or {}).get("estimated_cost_jpy") or 0)
    return response
