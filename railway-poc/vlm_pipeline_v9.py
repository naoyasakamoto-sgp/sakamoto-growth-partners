from __future__ import annotations

import base64
import io
import json
import os
import re
import urllib.error
import urllib.request
from datetime import date, timedelta
from difflib import SequenceMatcher
from typing import Any

from PIL import Image, ImageOps

VERSION = "9.0.0-vlm-first"
API_URL = os.getenv("OPENAI_RESPONSES_URL", "https://api.openai.com/v1/responses")
MODEL = os.getenv("OPENAI_VISION_MODEL", "gpt-5.6-sol")
MODE = os.getenv("VLM_MODE", "openai").lower()
VERIFY = os.getenv("VLM_VERIFY", "1").lower() not in {"0", "false", "no", "off"}
TIMEOUT = int(os.getenv("VLM_TIMEOUT_SEC", "150"))
MAX_EDGE = int(os.getenv("VLM_IMAGE_MAX_EDGE", "1800"))
JPEG_QUALITY = int(os.getenv("VLM_JPEG_QUALITY", "88"))
INTEREST_RATE = float(os.getenv("PAWN_MONTHLY_INTEREST_RATE", "0.03"))
FIXED_SHOP_PHONES = {"0236748217", "0223027782"}


class VLMUnavailable(RuntimeError):
    pass


class VLMCallError(RuntimeError):
    pass


def status() -> dict[str, Any]:
    key = bool(os.getenv("OPENAI_API_KEY", "").strip())
    enabled = MODE == "openai" and key
    return {
        "pipeline_version": VERSION,
        "mode": MODE,
        "configured": enabled,
        "provider": "OpenAI Responses API" if MODE == "openai" else MODE,
        "model": MODEL,
        "verification_pass": VERIFY,
        "external_ai": enabled,
        "store": False,
        "fallback": "OpenCV/Tesseract v8.2",
    }


def _digits(v: Any) -> str:
    return re.sub(r"\D", "", str(v or ""))


def _norm(v: Any) -> str:
    return re.sub(r"[\s\-ー・,，.。:：/\\()（）]", "", str(v or "").lower())


def _sim(a: Any, b: Any) -> float:
    x, y = _norm(a), _norm(b)
    if not x or not y:
        return 0.0
    if x in y or y in x:
        return .98
    return SequenceMatcher(None, x, y).ratio()


def _mobile(v: Any) -> str:
    ds = _digits(v)
    if ds in FIXED_SHOP_PHONES:
        return ""
    for i in range(max(1, len(ds) - 10)):
        x = ds[i:i + 11]
        if len(x) == 11 and x[:3] in {"070", "080", "090"}:
            return f"{x[:3]}-{x[3:7]}-{x[7:]}"
    return ""


def _valid_pawn_date(v: Any) -> bool:
    try:
        d = date.fromisoformat(str(v or ""))
    except Exception:
        return False
    t = date.today()
    return t - timedelta(days=400) <= d <= t + timedelta(days=31)


def _valid_date_pair(pawn: Any, forfeit: Any) -> bool:
    try:
        a, b = date.fromisoformat(str(pawn or "")), date.fromisoformat(str(forfeit or ""))
    except Exception:
        return False
    return _valid_pawn_date(a.isoformat()) and 1 <= (b - a).days <= 180


def _valid_money_pair(principal: Any, interest: Any) -> bool:
    try:
        p, i = int(principal or 0), int(interest or 0)
    except Exception:
        return False
    if not (1000 <= p <= 10_000_000 and p % 100 == 0 and 100 <= i <= 1_000_000 and i % 10 == 0):
        return False
    expected = p * INTEREST_RATE
    return abs(i - expected) <= max(10.0, expected * .025)


def _image_data_url(raw: bytes, max_edge: int = MAX_EDGE) -> str:
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    if max(im.size) > max_edge:
        ratio = max_edge / max(im.size)
        im = im.resize((max(1, int(im.width * ratio)), max(1, int(im.height * ratio))), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def _schema() -> dict[str, Any]:
    conf = {
        "type": "object", "additionalProperties": False,
        "properties": {
            "pawn_date": {"type": "number", "minimum": 0, "maximum": 1},
            "forfeit_date": {"type": "number", "minimum": 0, "maximum": 1},
            "loan_amount": {"type": "number", "minimum": 0, "maximum": 1},
            "monthly_interest": {"type": "number", "minimum": 0, "maximum": 1},
            "phone": {"type": "number", "minimum": 0, "maximum": 1},
            "items": {"type": "number", "minimum": 0, "maximum": 1},
        },
        "required": ["pawn_date", "forfeit_date", "loan_amount", "monthly_interest", "phone", "items"],
    }
    item = {
        "type": "object", "additionalProperties": False,
        "properties": {
            "raw_text": {"type": "string"},
            "normalized_name": {"type": "string"},
            "category": {"type": "string"},
            "brand": {"type": "string"},
            "model": {"type": "string"},
            "quantity": {"type": "integer", "minimum": 0, "maximum": 99},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        },
        "required": ["raw_text", "normalized_name", "category", "brand", "model", "quantity", "confidence"],
    }
    contract = {
        "type": "object", "additionalProperties": False,
        "properties": {
            "ticket_index": {"type": "integer", "minimum": 0},
            "pawn_date": {"type": "string"},
            "forfeit_date": {"type": "string"},
            "loan_amount": {"type": "integer", "minimum": 0},
            "monthly_interest": {"type": "integer", "minimum": 0},
            "phone": {"type": "string"},
            "staff": {"type": "string"},
            "item_image_indices": {"type": "array", "items": {"type": "integer", "minimum": 0}},
            "items": {"type": "array", "items": item},
            "confidence": conf,
            "evidence": {"type": "array", "items": {"type": "string"}},
            "review_required": {"type": "boolean"},
        },
        "required": ["ticket_index", "pawn_date", "forfeit_date", "loan_amount", "monthly_interest", "phone", "staff", "item_image_indices", "items", "confidence", "evidence", "review_required"],
    }
    product = {
        "type": "object", "additionalProperties": False,
        "properties": {
            "image_index": {"type": "integer", "minimum": 0},
            "category": {"type": "string"}, "brand": {"type": "string"}, "series": {"type": "string"}, "model": {"type": "string"},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "evidence": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["image_index", "category", "brand", "series", "model", "confidence", "evidence"],
    }
    return {
        "type": "object", "additionalProperties": False,
        "properties": {
            "customer": {
                "type": "object", "additionalProperties": False,
                "properties": {
                    "name": {"type": "string"}, "address": {"type": "string"}, "phone": {"type": "string"}, "birth_date": {"type": "string"},
                    "name_confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "address_confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "phone_confidence": {"type": "number", "minimum": 0, "maximum": 1},
                },
                "required": ["name", "address", "phone", "birth_date", "name_confidence", "address_confidence", "phone_confidence"],
            },
            "contracts": {"type": "array", "items": contract},
            "products": {"type": "array", "items": product},
            "document_notes": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["customer", "contracts", "products", "document_notes"],
    }


def _instructions(ticket_count: int, item_count: int, verification: bool = False) -> str:
    mode = "This is an independent verification pass. Re-read the pixels from scratch; do not merely repeat a prior answer." if verification else "Perform primary extraction from the images."
    return f"""You are the document-vision engine for a Japanese pawn-shop intake system. {mode}
You receive exactly one Japanese driving-license image, {ticket_count} pawn-ticket image(s), and {item_count} product image(s), each explicitly labelled before the image.
Use visual understanding, handwriting reading, layout, semantic context, cross-document matching and product-photo evidence together. Do NOT behave like plain OCR.

Critical rules:
1. Extract transaction-variable content only. Printed fixed shop text is not customer/transaction data.
2. These printed shop phone numbers are fixed template noise and MUST NEVER become customer phone, loan amount or interest: 023-674-8217 and 022-302-7782.
3. The customer phone field on this ticket is a mobile number. Accept only 070/080/090 followed by 8 digits; if unreadable or blank, output an empty string. Never invent digits.
4. Dates must be normalized to YYYY-MM-DD. Read Japanese era dates (especially Reiwa) correctly. A forfeit date must be after its pawn date and within 180 days.
5. Read money using the printed digit cells and layout. Use the business constraint monthly_interest approximately equals loan_amount * {INTEREST_RATE:.3f} as a cross-check, not as permission to invent a missing number.
6. Product images are visual evidence, not just OCR targets. Read vertical lettering, logos, model numbers and Japanese numerals. Cross-check each product image against the matching pawn-ticket item line.
7. Known product-name aliases may help only when supported by visible evidence: かちどき/KACHIDOKI; 飛天弓 閃光 L II/閃光LII/閃光LⅡ; 匠絆 忠相. Do not force a master value without image evidence.
8. The license is authoritative for customer name and official address when clearly legible. The ticket can supply the mobile number.
9. Preserve ticket order using ticket_index 0..{max(0, ticket_count-1)} and product order using image_index 0..{max(0, item_count-1)}.
10. When uncertain, return empty string/0 and lower confidence rather than hallucinating. False acceptance of money/date is the highest-risk failure.
11. Output JSON only according to the supplied JSON schema.
"""


def _content(license_raw: bytes, ticket_raws: list[bytes], item_raws: list[bytes], extra_text: str = "") -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = [{"type": "input_text", "text": "Return JSON. Inspect every image at high detail." + ("\n" + extra_text if extra_text else "")}]
    out += [{"type": "input_text", "text": "IMAGE ROLE: identity_document / Japanese driving license"}, {"type": "input_image", "image_url": _image_data_url(license_raw), "detail": "high"}]
    for i, raw in enumerate(ticket_raws):
        out += [{"type": "input_text", "text": f"IMAGE ROLE: pawn_ticket index={i}"}, {"type": "input_image", "image_url": _image_data_url(raw), "detail": "high"}]
    for i, raw in enumerate(item_raws):
        out += [{"type": "input_text", "text": f"IMAGE ROLE: product_photo index={i}"}, {"type": "input_image", "image_url": _image_data_url(raw), "detail": "high"}]
    return out


def _response_text(data: dict[str, Any]) -> str:
    if isinstance(data.get("output_text"), str):
        return data["output_text"]
    for item in data.get("output") or []:
        if not isinstance(item, dict) or item.get("type") != "message":
            continue
        for c in item.get("content") or []:
            if isinstance(c, dict) and c.get("type") == "output_text" and isinstance(c.get("text"), str):
                return c["text"]
    return ""


def _call(license_raw: bytes, ticket_raws: list[bytes], item_raws: list[bytes], verification: bool = False, prior: dict[str, Any] | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
    key = os.getenv("OPENAI_API_KEY", "").strip()
    if MODE != "openai" or not key:
        raise VLMUnavailable("OPENAI_API_KEY is not configured")
    extra = ""
    if verification and prior:
        # Give the verifier the candidate only to identify disagreements, while explicitly
        # instructing it to re-read pixels independently. This is not ground truth.
        extra = "Primary-pass candidate (NOT ground truth; correct it if pixels disagree):\n" + json.dumps(prior, ensure_ascii=False)[:12000]
    payload = {
        "model": MODEL,
        "instructions": _instructions(len(ticket_raws), len(item_raws), verification),
        "input": [{"role": "user", "content": _content(license_raw, ticket_raws, item_raws, extra)}],
        "reasoning": {"effort": os.getenv("VLM_REASONING", "high")},
        "text": {"format": {"type": "json_schema", "name": "pawn_intake_extraction", "strict": True, "schema": _schema()}},
        "store": False,
        "max_output_tokens": int(os.getenv("VLM_MAX_OUTPUT_TOKENS", "7000")),
    }
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(API_URL, data=body, method="POST", headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            data = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            msg = e.read().decode("utf-8")[:1200]
        except Exception:
            msg = str(e)
        raise VLMCallError(f"HTTP {e.code}: {msg}") from e
    except Exception as e:
        raise VLMCallError(f"{type(e).__name__}: {e}") from e
    text = _response_text(data)
    if not text:
        raise VLMCallError("Responses API returned no output_text")
    try:
        parsed = json.loads(text)
    except Exception as e:
        raise VLMCallError("Structured output was not valid JSON") from e
    meta = {"response_id": data.get("id"), "model": data.get("model") or MODEL, "status": data.get("status"), "usage": data.get("usage") or {}, "verification": verification}
    return parsed, meta


def _base_customer(base_response: dict[str, Any]) -> dict[str, Any]:
    return ((base_response.get("extracted") or {}).get("customer") or {}) if isinstance(base_response, dict) else {}


def _choose_identity(a: dict[str, Any], b: dict[str, Any] | None, base: dict[str, Any]) -> dict[str, Any]:
    b = b or {}
    out = dict(a or {})
    for key, ck in (("name", "name_confidence"), ("address", "address_confidence")):
        av, bv, ov = str(a.get(key) or ""), str(b.get(key) or ""), str(base.get(key) or "")
        ac, bc = float(a.get(ck) or 0), float(b.get(ck) or 0)
        if av and bv and _sim(av, bv) >= .90:
            out[key], out[ck] = (av if ac >= bc else bv), min(.995, max(ac, bc, .96))
        elif ov and max(_sim(ov, av), _sim(ov, bv)) >= .72:
            # License OCR is useful as an independent anchor when it agrees semantically.
            candidate = av if _sim(ov, av) >= _sim(ov, bv) else bv
            out[key] = candidate or ov
            out[ck] = min(.985, max(float(base.get("confidence") or 0), ac, bc, .90))
        elif ac >= bc:
            out[key], out[ck] = av, min(.84, ac)
        else:
            out[key], out[ck] = bv, min(.84, bc)
    ap, bp = _mobile(a.get("phone")), _mobile(b.get("phone"))
    ac, bc = float(a.get("phone_confidence") or 0), float(b.get("phone_confidence") or 0)
    if ap and bp and ap == bp:
        out["phone"], out["phone_confidence"] = ap, min(.995, max(ac, bc, .97))
    elif ap and not bp:
        out["phone"], out["phone_confidence"] = ap, min(.82, ac)
    elif bp and not ap:
        out["phone"], out["phone_confidence"] = bp, min(.82, bc)
    else:
        out["phone"], out["phone_confidence"] = "", 0.0
    return out


def _by_ticket(data: dict[str, Any]) -> dict[int, dict[str, Any]]:
    out = {}
    for c in data.get("contracts") or []:
        try:
            out[int(c.get("ticket_index"))] = c
        except Exception:
            continue
    return out


def _choose_contract(a: dict[str, Any], b: dict[str, Any] | None, idx: int) -> dict[str, Any]:
    b = b or {}
    out = dict(a or {})
    out["ticket_index"] = idx
    ca, cb = a.get("confidence") or {}, b.get("confidence") or {}
    # Dates are resolved as a pair, not independently.
    va = _valid_date_pair(a.get("pawn_date"), a.get("forfeit_date"))
    vb = _valid_date_pair(b.get("pawn_date"), b.get("forfeit_date"))
    same_dates = va and vb and a.get("pawn_date") == b.get("pawn_date") and a.get("forfeit_date") == b.get("forfeit_date")
    if same_dates:
        out["pawn_date"], out["forfeit_date"] = a["pawn_date"], a["forfeit_date"]
        date_conf = min(.995, max(float(ca.get("pawn_date") or 0), float(cb.get("pawn_date") or 0), .97))
        due_conf = min(.995, max(float(ca.get("forfeit_date") or 0), float(cb.get("forfeit_date") or 0), .97))
    elif va and not vb:
        out["pawn_date"], out["forfeit_date"] = a.get("pawn_date", ""), a.get("forfeit_date", "")
        date_conf, due_conf = min(.86, float(ca.get("pawn_date") or 0)), min(.86, float(ca.get("forfeit_date") or 0))
    elif vb and not va:
        out["pawn_date"], out["forfeit_date"] = b.get("pawn_date", ""), b.get("forfeit_date", "")
        date_conf, due_conf = min(.86, float(cb.get("pawn_date") or 0)), min(.86, float(cb.get("forfeit_date") or 0))
    else:
        out["pawn_date"], out["forfeit_date"] = "", ""
        date_conf = due_conf = 0.0

    ma = _valid_money_pair(a.get("loan_amount"), a.get("monthly_interest"))
    mb = _valid_money_pair(b.get("loan_amount"), b.get("monthly_interest"))
    same_money = ma and mb and int(a.get("loan_amount") or 0) == int(b.get("loan_amount") or 0) and int(a.get("monthly_interest") or 0) == int(b.get("monthly_interest") or 0)
    if same_money:
        out["loan_amount"], out["monthly_interest"] = int(a["loan_amount"]), int(a["monthly_interest"])
        money_conf = min(.995, max(float(ca.get("loan_amount") or 0), float(cb.get("loan_amount") or 0), .98))
        int_conf = min(.995, max(float(ca.get("monthly_interest") or 0), float(cb.get("monthly_interest") or 0), .98))
    elif ma and not mb:
        out["loan_amount"], out["monthly_interest"] = int(a.get("loan_amount") or 0), int(a.get("monthly_interest") or 0)
        money_conf, int_conf = min(.88, float(ca.get("loan_amount") or 0)), min(.88, float(ca.get("monthly_interest") or 0))
    elif mb and not ma:
        out["loan_amount"], out["monthly_interest"] = int(b.get("loan_amount") or 0), int(b.get("monthly_interest") or 0)
        money_conf, int_conf = min(.88, float(cb.get("loan_amount") or 0)), min(.88, float(cb.get("monthly_interest") or 0))
    else:
        out["loan_amount"], out["monthly_interest"] = 0, 0
        money_conf = int_conf = 0.0

    ap, bp = _mobile(a.get("phone")), _mobile(b.get("phone"))
    if ap and bp and ap == bp:
        out["phone"], phone_conf = ap, min(.995, max(float(ca.get("phone") or 0), float(cb.get("phone") or 0), .97))
    elif ap and not bp:
        out["phone"], phone_conf = ap, min(.80, float(ca.get("phone") or 0))
    elif bp and not ap:
        out["phone"], phone_conf = bp, min(.80, float(cb.get("phone") or 0))
    else:
        out["phone"], phone_conf = "", 0.0

    ai, bi = a.get("items") or [], b.get("items") or []
    a_names = [_norm(x.get("normalized_name")) for x in ai if x.get("normalized_name")]
    b_names = [_norm(x.get("normalized_name")) for x in bi if x.get("normalized_name")]
    item_agree = bool(a_names and b_names and len(a_names) == len(b_names) and all(any(SequenceMatcher(None, x, y).ratio() >= .78 for y in b_names) for x in a_names))
    if item_agree:
        out["items"] = ai
        item_conf = min(.99, max(float(ca.get("items") or 0), float(cb.get("items") or 0), .94))
    else:
        ac, bc = float(ca.get("items") or 0), float(cb.get("items") or 0)
        out["items"] = ai if ac >= bc else bi
        item_conf = min(.84, max(ac, bc))
    out["confidence"] = {"pawn_date": date_conf, "forfeit_date": due_conf, "loan_amount": money_conf, "monthly_interest": int_conf, "phone": phone_conf, "items": item_conf}
    out["review_required"] = min(date_conf, due_conf, money_conf, int_conf) < .90 or item_conf < .85 or (bool(ap and bp) and ap != bp)
    out["evidence"] = list(dict.fromkeys([str(x) for x in (a.get("evidence") or []) + (b.get("evidence") or [])]))[:20]
    if not out.get("item_image_indices"):
        out["item_image_indices"] = b.get("item_image_indices") or []
    return out


def _consensus(primary: dict[str, Any], verifier: dict[str, Any] | None, base_response: dict[str, Any]) -> dict[str, Any]:
    verifier = verifier or {}
    out = dict(primary)
    out["customer"] = _choose_identity(primary.get("customer") or {}, verifier.get("customer") or {}, _base_customer(base_response))
    pa, pb = _by_ticket(primary), _by_ticket(verifier)
    count = max(len((base_response.get("extracted") or {}).get("contracts") or []), len(pa), len(pb))
    out["contracts"] = [_choose_contract(pa.get(i, {}), pb.get(i, {}), i) for i in range(count)]
    # Customer phone should come from a mutually supported contract mobile if available.
    phones = [c.get("phone") for c in out["contracts"] if c.get("phone")]
    if phones and not out["customer"].get("phone"):
        out["customer"]["phone"] = phones[0]
        out["customer"]["phone_confidence"] = max(float(c.get("confidence", {}).get("phone") or 0) for c in out["contracts"] if c.get("phone") == phones[0])
    return out


def extract(license_raw: bytes, ticket_raws: list[bytes], item_raws: list[bytes], base_response: dict[str, Any]) -> dict[str, Any]:
    primary, m1 = _call(license_raw, ticket_raws, item_raws, verification=False)
    verifier = None
    metas = [m1]
    if VERIFY:
        verifier, m2 = _call(license_raw, ticket_raws, item_raws, verification=True, prior=primary)
        metas.append(m2)
    final = _consensus(primary, verifier, base_response)
    final["_meta"] = {"pipeline_version": VERSION, "provider": "OpenAI Responses API", "model": MODEL, "passes": metas, "external_ai": True, "store": False}
    return final


def _field(value: Any, confidence: float, evidence: list[str] | None = None) -> dict[str, Any]:
    ok_value = value not in (None, "", 0)
    status_value = "ok" if ok_value and confidence >= .90 else ("review" if ok_value and confidence >= .55 else "invalid")
    return {"value": value, "confidence": round(float(confidence or 0), 3), "status": status_value, "evidence": [{"value": value, "confidence": confidence, "source": "VLM", "raw": "", "variant": VERSION, "reason": x} for x in (evidence or [])[:12]]}


def apply_to_response(base_response: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    payload = base_response.get("extracted") or {}
    customer = result.get("customer") or {}
    base_customer = payload.get("customer") or {}
    base_customer.update({
        "name": customer.get("name") or base_customer.get("name") or "",
        "address": customer.get("address") or base_customer.get("address") or "",
        "phone": _mobile(customer.get("phone")),
        "confidence": round(max(float(customer.get("name_confidence") or 0), float(customer.get("address_confidence") or 0)), 3),
    })
    payload["customer"] = base_customer
    vlm_by = {int(x.get("ticket_index", i)): x for i, x in enumerate(result.get("contracts") or [])}
    contracts = payload.get("contracts") or []
    qualities = []
    for i, existing in enumerate(contracts):
        x = vlm_by.get(i)
        if not x:
            continue
        cf = x.get("confidence") or {}
        co = existing.get("contract") or {}
        co.update({
            "contract_date": x.get("pawn_date") or "",
            "forfeiture_due_date": x.get("forfeit_date") or "",
            "principal_amount": int(x.get("loan_amount") or 0),
            "interest_amount": int(x.get("monthly_interest") or 0),
        })
        if co.get("contract_date"):
            try:
                d = date.fromisoformat(co["contract_date"]); y = d.year + (d.month == 12); m = 1 if d.month == 12 else d.month + 1
                import calendar
                co["next_interest_due_date"] = date(y, m, min(d.day, calendar.monthrange(y, m)[1])).isoformat()
            except Exception:
                co["next_interest_due_date"] = ""
        existing["contract"] = co
        items = []
        for it in x.get("items") or []:
            desc = " ".join(z for z in [str(it.get("normalized_name") or "").strip(), str(it.get("model") or "").strip()] if z).strip()
            items.append({"category": it.get("category") or "", "brand": it.get("brand") or "", "description": desc or it.get("raw_text") or "画像確認", "confidence": float(it.get("confidence") or 0), "evidence": {"source": "VLM", "raw_text": it.get("raw_text") or "", "model": it.get("model") or ""}})
        if items:
            existing["items"] = items
        if x.get("item_image_indices"):
            existing["item_image_indices"] = [int(v) for v in x.get("item_image_indices") if isinstance(v, int)]
        ev = x.get("evidence") or []
        item_text = " / ".join(str(it.get("raw_text") or it.get("normalized_name") or "") for it in x.get("items") or [] if (it.get("raw_text") or it.get("normalized_name")))
        fields = existing.get("fields") or {}
        fields.update({
            "contract_date": _field(co.get("contract_date") or "", cf.get("pawn_date") or 0, ev),
            "forfeiture_due_date": _field(co.get("forfeiture_due_date") or "", cf.get("forfeit_date") or 0, ev),
            "principal_amount": _field(co.get("principal_amount") or 0, cf.get("loan_amount") or 0, ev),
            "interest_amount": _field(co.get("interest_amount") or 0, cf.get("monthly_interest") or 0, ev),
            "phone": _field(_mobile(x.get("phone")), cf.get("phone") or 0, ev),
            "items": _field(item_text, cf.get("items") or 0, ev),
        })
        existing["fields"] = fields
        vals = [float(cf.get(k) or 0) for k in ("pawn_date", "forfeit_date", "loan_amount", "monthly_interest", "items")]
        existing["quality"] = round(sum(vals) / len(vals), 3)
        existing["false_accept_risk"] = round(1 - min(vals[:4]), 3)
        existing["needs_review"] = bool(x.get("review_required")) or min(vals[:4]) < .90
        existing["review_fields"] = [name for name, key in (("contract_date", "pawn_date"), ("forfeiture_due_date", "forfeit_date"), ("principal_amount", "loan_amount"), ("interest_amount", "monthly_interest"), ("items", "items")) if float(cf.get(key) or 0) < .90]
        existing["pipeline_version"] = VERSION
        qualities.append(existing["quality"])
    payload["contracts"] = contracts
    base_response["extracted"] = payload
    vision = base_response.get("vision") or {}
    vision.update({
        "pipeline_version": VERSION,
        "field_accuracy": round(sum(qualities) / max(1, len(qualities)), 3),
        "needs_review": any(bool(c.get("needs_review")) for c in contracts),
        "external_ai": True,
        "vlm_used": True,
        "vlm": result.get("_meta") or {},
        "architecture": "multi-image VLM primary -> dual-pass consensus -> deterministic date/money/phone rules -> OCR fallback evidence",
    })
    base_response["vision"] = vision
    return base_response
