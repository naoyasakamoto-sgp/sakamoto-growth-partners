from __future__ import annotations

import os
import time

import uvicorn
from fastapi import Depends

import start_v8
import start_v4
import start_v2
import gemini_pipeline_v10 as gp
import client_ai_ops_v101 as aiops

main = start_v8.main
APP_VERSION = "2.4.1-poc"
_base_core = start_v8._base_core


@main.app.on_event("startup")
def _startup_v101() -> None:
    aiops.ensure_schema()


def _annotate_client_policy(response: dict, *, stat: dict, budget: dict) -> None:
    v = response.setdefault("vision", {})
    v["vlm_status"] = stat
    v["billing_owner"] = "client"
    v["billing_label"] = "お客様"
    v["direct_billing"] = True
    v["api_key_exposed"] = False
    v["budget"] = budget


def _core_v101(lr, item_pairs, ticket_pairs, persist=True, actor=None):
    # Local OCR is always executed first so the shop can continue even when the
    # client-owned Gemini credential is missing, rotated, rate-limited or down.
    response = _base_core(lr, item_pairs, ticket_pairs, persist, actor)
    stat = gp.status()
    budget = aiops.budget_state()
    _annotate_client_policy(response, stat=stat, budget=budget)
    v = response["vision"]
    v.update({
        "pipeline_version": aiops.VERSION if stat.get("configured") else "8.2.0-fallback",
        "vlm_used": False,
        "external_ai": False,
        "provider": "Google Gemini Developer API",
        "model": gp.MODEL,
    })

    if not stat.get("configured"):
        v.update({
            "vlm_reason": "クライアント所有のGEMINI_API_KEY未設定。ローカルOCRへfallback。",
            "needs_review": True,
        })
        return response

    if not budget.get("allow_gemini", True):
        v.update({
            "vlm_reason": "AI月次Hard Limit到達のため設定に従いローカルOCRへfallback。",
            "budget_guard": "hard_limit_fallback",
            "needs_review": True,
        })
        return response

    image_count = 1 + len(ticket_pairs) + len(item_pairs)
    started = time.monotonic()
    result = None
    try:
        result = gp.extract(lr, [raw for _, raw in ticket_pairs], [raw for _, raw in item_pairs], response)
        latency_ms = int((time.monotonic() - started) * 1000)
        response = gp.apply_to_response(response, result)
        usage = aiops.record_usage(
            draft_id=response.get("draft_id"),
            result=result,
            image_count=image_count,
            latency_ms=latency_ms,
            status="SUCCESS",
            provider="Google Gemini Developer API",
            model=gp.MODEL,
        )
        if persist:
            start_v8._persist_gemini(response, result, actor)
        post_budget = aiops.budget_state()
        _annotate_client_policy(response, stat=stat, budget=post_budget)
        response["vision"].update({
            "pipeline_version": aiops.VERSION,
            "vlm_used": True,
            "external_ai": True,
            "usage": usage,
            "estimated_cost_jpy": usage.get("estimated_cost_jpy", 0),
            "cost_is_estimate": True,
        })
        if post_budget.get("soft_limit_exceeded"):
            response["vision"]["budget_warning"] = post_budget.get("warning")
        return response
    except Exception as e:
        latency_ms = int((time.monotonic() - started) * 1000)
        # Never expose request headers, API keys or provider error bodies to the UI/log evidence.
        aiops.record_usage(
            draft_id=response.get("draft_id"),
            result=result,
            image_count=image_count,
            latency_ms=latency_ms,
            status="ERROR",
            error_type=type(e).__name__,
            provider="Google Gemini Developer API",
            model=gp.MODEL,
        )
        v = response.setdefault("vision", {})
        _annotate_client_policy(response, stat=stat, budget=aiops.budget_state())
        v.update({
            "vlm_used": False,
            "external_ai": False,
            "pipeline_version": "8.2.0-fallback",
            "gemini_error": type(e).__name__,
            "vlm_reason": "Gemini認識に失敗したためローカルOCRへfallback。詳細は秘密情報を含まない運用ログで確認してください。",
            "needs_review": True,
        })
        if os.getenv("VLM_REQUIRED", "0").lower() in {"1", "true", "yes"}:
            raise
        return response


# start_v4.extract_batch_v8 resolves this module global at runtime.
start_v4._extract_core_v8 = _core_v101
start_v4.APP_VERSION = APP_VERSION


def ai_status(a=Depends(main.auth)):
    return aiops.status_payload(gp.status())


def ai_usage(month: str | None = None, a=Depends(main.auth)):
    return {
        "usage": aiops.usage_summary(month),
        "budget": aiops.budget_state(month),
        "billing": {
            "owner": "client",
            "label": "お客様",
            "direct_to_provider": True,
            "provider": "Google",
            "note": "Gemini API利用料はお客様のGoogle Cloud/AI Studio契約へ直接請求。SGPはAPI実費を立替請求しません。",
        },
    }


def health_v101():
    x = main.health()
    s = gp.status()
    x.update({
        "version": APP_VERSION,
        "pipeline_version": aiops.VERSION,
        "architecture": "client-owned Gemini 3.8 Flash + deterministic validation + local OCR fallback",
        "vlm": {
            "configured": bool(s.get("configured")),
            "provider": s.get("provider"),
            "model": s.get("model"),
        },
        "external_ai": bool(s.get("configured")),
        "billing_owner": "client",
        "fallback_ready": True,
        "usage_tracking": True,
        "budget_guard": True,
        "api_key_exposed": False,
    })
    return x


def vision_v101(a=Depends(main.auth)):
    s = aiops.status_payload(gp.status())
    return {
        "ready": True,
        "pipeline_version": aiops.VERSION,
        "vlm": s,
        "vlm_ready": bool(s.get("configured")),
        "fallback_ready": True,
        "external_ai": bool(s.get("configured")),
        "provider": "Google Gemini Developer API",
        "model": gp.MODEL,
        "billing_owner": "client",
        "billing_label": "お客様",
        "privacy_note": "Gemini有効時のみ受付画像をGoogle APIへ送信。APIキー値はレスポンス・DB・Evidence・画面へ保存/表示しません。",
        "rotation_note": "GEMINI_API_KEYをRailway Secretで差し替えるだけでローテーション可能。コード変更不要。",
    }


start_v2.replace("/api/health", "GET", health_v101)
start_v2.replace("/api/vision/status", "GET", vision_v101)
start_v2.replace("/api/ai/status", "GET", ai_status)
start_v2.replace("/api/ai/usage", "GET", ai_usage)

# Compact operator-facing status: ownership and spend are visible; the secret is not.
AI_WIDGET = r'''
<div id="client-ai-status" style="position:fixed;right:14px;bottom:14px;z-index:9999;background:#fff;border:1px solid #dbe6e9;border-radius:12px;padding:10px 12px;box-shadow:0 4px 18px #0002;font:12px/1.45 system-ui;color:#17324d;max-width:260px">
  <b>AI認識：Gemini 3.8 Flash</b><br>
  <span>API契約者：<b>お客様</b></span><br>
  <span id="ai-client-state">接続状態を確認中…</span><br>
  <span id="ai-client-cost">今月概算：--</span>
</div>
<script>
(async()=>{try{const r=await fetch('/api/ai/status',{cache:'no-store'});if(!r.ok)return;const x=await r.json();
const st=document.getElementById('ai-client-state'),co=document.getElementById('ai-client-cost');
if(st)st.textContent=x.configured?(x.reachable===false?'接続：要確認':'接続：設定済み'):'接続：APIキー未設定';
if(co)co.textContent='今月概算：¥'+Number((x.usage||{}).estimated_cost_jpy||0).toFixed(1)+'（Google直接請求）';
}catch(e){}})();
</script>
'''
if "</body>" in main.HTML and "client-ai-status" not in main.HTML:
    main.HTML = main.HTML.replace("</body>", AI_WIDGET + "</body>")
main.HTML = main.HTML.replace("v2.4.0-poc | Gemini 3.8 Flash v10", "v2.4.1-poc | Client-owned Gemini v10.1")
main.HTML = main.HTML.replace("v2.4.0-poc | Gemini 3.8 Flash | 永続DB", "v2.4.1-poc | Client-owned Gemini | 永続DB")

if __name__ == "__main__":
    uvicorn.run(main.app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), proxy_headers=True)
