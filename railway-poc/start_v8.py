from __future__ import annotations

import json
import os

import uvicorn
from fastapi import Depends

import start_v7
import start_v4
import start_v2
import gemini_pipeline_v10 as gp

main = start_v7.main
APP_VERSION = "2.4.0-poc"
# Important: bypass the OpenAI v9 wrapper and keep the proven v8.2 local OCR
# path as an independent fallback/evidence source.
_base_core = start_v7._base_core


def _persist_gemini(response, gemini_result, actor):
    did = response.get("draft_id")
    if not did:
        return
    try:
        start_v4.ensure_v8_schema()
        with main.db() as c:
            c.execute("UPDATE drafts SET payload=? WHERE id=?", (json.dumps(response.get("extracted") or {}, ensure_ascii=False), did))
            c.execute(
                "INSERT OR REPLACE INTO extraction_evidence(draft_id,kind,ordinal,result_json)VALUES(?,?,?,?)",
                (did, "GEMINI_VLM", 0, json.dumps(gemini_result, ensure_ascii=False)),
            )
            if actor:
                meta = gemini_result.get("_meta") or {}
                main.audit(c, actor["name"], actor["role"], "INTAKE_GEMINI_V10", "draft", did, {
                    "pipeline": gp.VERSION,
                    "provider": meta.get("provider"),
                    "model": meta.get("model"),
                    "passes": len(meta.get("passes") or []),
                    "external_ai": True,
                    "estimated_cost_jpy": meta.get("estimated_cost_jpy"),
                    "needs_review": bool((response.get("vision") or {}).get("needs_review")),
                })
    except Exception as e:
        response.setdefault("vision", {})["gemini_persist_warning"] = type(e).__name__


def _core_v10(lr, item_pairs, ticket_pairs, persist=True, actor=None):
    # Always generate local OCR evidence first. If Gemini is unavailable or fails,
    # intake remains usable and all uncertain fields stay review-oriented.
    response = _base_core(lr, item_pairs, ticket_pairs, persist, actor)
    stat = gp.status()
    response.setdefault("vision", {})["vlm_status"] = stat
    response["vision"]["pipeline_version"] = gp.VERSION if stat.get("configured") else "8.2.0-fallback"
    response["vision"]["vlm_used"] = False
    response["vision"]["external_ai"] = False
    response["vision"]["provider"] = "Google Gemini Developer API"
    response["vision"]["model"] = gp.MODEL
    if not stat.get("configured"):
        response["vision"]["vlm_reason"] = "GEMINI_API_KEY未設定のためGeminiを使用せずローカルOCR fallback"
        return response
    try:
        result = gp.extract(lr, [raw for _, raw in ticket_pairs], [raw for _, raw in item_pairs], response)
        response = gp.apply_to_response(response, result)
        if persist:
            _persist_gemini(response, result, actor)
        return response
    except Exception as e:
        response["vision"].update({
            "vlm_used": False,
            "external_ai": False,
            "pipeline_version": "8.2.0-fallback",
            "gemini_error": type(e).__name__,
            "vlm_reason": str(e)[:700],
            "needs_review": True,
        })
        if os.getenv("VLM_REQUIRED", "0").lower() in {"1", "true", "yes"}:
            raise
        return response


start_v4._extract_core_v8 = _core_v10
start_v4.APP_VERSION = APP_VERSION


def health_v10():
    x = main.health()
    s = gp.status()
    x.update({
        "version": APP_VERSION,
        "pipeline_version": gp.VERSION,
        "architecture": "Gemini 3.8 Flash multi-image structured extraction + deterministic validator + local OCR fallback",
        "vlm": s,
        "external_ai": bool(s.get("configured")),
        "ground_truth": True,
        "evidence": True,
        "batch_contracts": True,
        "cost_tracking": True,
    })
    return x


def vision_v10(a=Depends(main.auth)):
    s = gp.status()
    return {
        "ready": True,
        "pipeline_version": gp.VERSION,
        "vlm": s,
        "vlm_ready": bool(s.get("configured")),
        "fallback_ready": True,
        "external_ai": bool(s.get("configured")),
        "provider": "Google Gemini Developer API",
        "model": gp.MODEL,
        "privacy_note": "Gemini有効時のみ受付画像をGoogle Gemini APIへ送信。画像はアプリ側で縮小後にインライン送信。",
        "cost_tracking": "Gemini usageMetadataから1受付あたり概算JPYをevidenceに保存",
    }


start_v2.replace("/api/health", "GET", health_v10)
start_v2.replace("/api/vision/status", "GET", vision_v10)

main.HTML = main.HTML.replace("v2.3.0-poc | VLM-first v9", "v2.4.0-poc | Gemini 3.8 Flash v10")
main.HTML = main.HTML.replace("VLM設定時のみ外部AI送信", "Gemini設定時のみGoogle API送信")
main.HTML = main.HTML.replace("v2.3.0-poc | VLM-first v9 | 永続DB", "v2.4.0-poc | Gemini 3.8 Flash | 永続DB")

if __name__ == "__main__":
    uvicorn.run(main.app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), proxy_headers=True)
