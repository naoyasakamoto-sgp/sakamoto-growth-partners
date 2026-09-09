from __future__ import annotations

import json
import os

import uvicorn
from fastapi import Depends

import start_v6
import start_v4
import start_v2
import vlm_pipeline_v9 as vp

main = start_v6.main
APP_VERSION = "2.3.0-poc"
_base_core = start_v4._extract_core_v8


def _persist_vlm(response, vlm_result, actor):
    did = response.get("draft_id")
    if not did:
        return
    try:
        start_v4.ensure_v8_schema()
        with main.db() as c:
            c.execute("UPDATE drafts SET payload=? WHERE id=?", (json.dumps(response.get("extracted") or {}, ensure_ascii=False), did))
            c.execute("INSERT OR REPLACE INTO extraction_evidence(draft_id,kind,ordinal,result_json)VALUES(?,?,?,?)", (did, "VLM", 0, json.dumps(vlm_result, ensure_ascii=False)))
            if actor:
                meta = vlm_result.get("_meta") or {}
                main.audit(c, actor["name"], actor["role"], "INTAKE_VLM_V9", "draft", did, {
                    "pipeline": vp.VERSION,
                    "provider": meta.get("provider"),
                    "model": meta.get("model"),
                    "passes": len(meta.get("passes") or []),
                    "external_ai": True,
                    "needs_review": bool((response.get("vision") or {}).get("needs_review")),
                })
    except Exception as e:
        response.setdefault("vision", {})["vlm_persist_warning"] = type(e).__name__


def _core_v9(lr, item_pairs, ticket_pairs, persist=True, actor=None):
    # Keep v8.2 as independent OCR evidence and a zero-external-AI fallback.
    response = _base_core(lr, item_pairs, ticket_pairs, persist, actor)
    stat = vp.status()
    response.setdefault("vision", {})["vlm_status"] = stat
    response["vision"]["pipeline_version"] = vp.VERSION if stat.get("configured") else "8.2.0-fallback"
    response["vision"]["vlm_used"] = False
    response["vision"]["external_ai"] = False
    if not stat.get("configured"):
        response["vision"]["vlm_reason"] = "OPENAI_API_KEY未設定のためVLMを使用せずOCR fallback"
        return response
    try:
        result = vp.extract(lr, [raw for _, raw in ticket_pairs], [raw for _, raw in item_pairs], response)
        response = vp.apply_to_response(response, result)
        if persist:
            _persist_vlm(response, result, actor)
        return response
    except Exception as e:
        # Never turn an upstream model/network incident into lost intake. Surface
        # the mode explicitly and keep the human-review-oriented v8.2 result.
        response["vision"].update({
            "vlm_used": False,
            "external_ai": False,
            "pipeline_version": "8.2.0-fallback",
            "vlm_error": type(e).__name__,
            "vlm_reason": str(e)[:500],
            "needs_review": True,
        })
        if os.getenv("VLM_REQUIRED", "0").lower() in {"1", "true", "yes"}:
            raise
        return response


start_v4._extract_core_v8 = _core_v9
start_v4.APP_VERSION = APP_VERSION


def health_v9():
    x = main.health()
    s = vp.status()
    x.update({
        "version": APP_VERSION,
        "pipeline_version": vp.VERSION,
        "architecture": "VLM-first multi-image structured extraction + dual-pass verification + deterministic validator + OCR fallback",
        "vlm": s,
        "external_ai": bool(s.get("configured")),
        "ground_truth": True,
        "evidence": True,
        "batch_contracts": True,
    })
    return x


def vision_v9(a=Depends(main.auth)):
    s = vp.status()
    return {
        "ready": True,
        "pipeline_version": vp.VERSION,
        "vlm": s,
        "vlm_ready": bool(s.get("configured")),
        "fallback_ready": True,
        "external_ai": bool(s.get("configured")),
        "privacy_note": "VLM有効時のみ受付画像を設定済みAPIへ送信。Responses API request uses store=false.",
    }


start_v2.replace("/api/health", "GET", health_v9)
start_v2.replace("/api/vision/status", "GET", vision_v9)

# Do not claim that images are never externally transmitted: v9 intentionally
# supports a high-accuracy external multimodal model when the secret is configured.
main.HTML = main.HTML.replace("v2.2.2-poc | Orchestrator v8.2", "v2.3.0-poc | VLM-first v9")
main.HTML = main.HTML.replace("v2.2.2-poc | 永続DB | 外部AI送信なし", "v2.3.0-poc | VLM-first v9 | 永続DB")
main.HTML = main.HTML.replace("外部AI送信なし", "VLM設定時のみ外部AI送信")

if __name__ == "__main__":
    uvicorn.run(main.app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), proxy_headers=True)
