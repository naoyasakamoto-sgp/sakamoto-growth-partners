from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any

import start_v4

main = start_v4.main
VERSION = "10.1.0-client-owned"
BILLING_OWNER = "client"
SOFT_LIMIT_JPY = float(os.getenv("AI_MONTHLY_SOFT_LIMIT_JPY", "500"))
HARD_LIMIT_JPY = float(os.getenv("AI_MONTHLY_HARD_LIMIT_JPY", "1000"))
HARD_LIMIT_ACTION = os.getenv("AI_HARD_LIMIT_ACTION", "warn").strip().lower()

SCHEMA = '''
CREATE TABLE IF NOT EXISTS ai_usage(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 draft_id TEXT,
 provider TEXT NOT NULL,
 model TEXT NOT NULL,
 image_count INTEGER NOT NULL DEFAULT 0,
 pass_count INTEGER NOT NULL DEFAULT 0,
 input_tokens INTEGER NOT NULL DEFAULT 0,
 output_tokens INTEGER NOT NULL DEFAULT 0,
 thinking_tokens INTEGER NOT NULL DEFAULT 0,
 total_tokens INTEGER NOT NULL DEFAULT 0,
 estimated_cost_jpy REAL NOT NULL DEFAULT 0,
 latency_ms INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL,
 error_type TEXT,
 billing_owner TEXT NOT NULL DEFAULT 'client',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_draft ON ai_usage(draft_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_status ON ai_usage(status,created_at);
'''


def ensure_schema() -> None:
    start_v4.ensure_v8_schema()
    with main.db() as c:
        c.executescript(SCHEMA)


def current_month() -> str:
    return datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m")


def _month_expr() -> str:
    # SQLite CURRENT_TIMESTAMP is UTC; reporting is JST for the shop.
    return "strftime('%Y-%m', created_at, '+9 hours')"


def usage_summary(month: str | None = None) -> dict[str, Any]:
    ensure_schema()
    month = (month or current_month())[:7]
    with main.db() as c:
        r = c.execute(
            f'''SELECT
                  COUNT(*) calls,
                  COUNT(DISTINCT CASE WHEN draft_id IS NOT NULL AND draft_id<>'' THEN draft_id END) intakes,
                  COALESCE(SUM(image_count),0) images,
                  COALESCE(SUM(input_tokens),0) input_tokens,
                  COALESCE(SUM(output_tokens),0) output_tokens,
                  COALESCE(SUM(thinking_tokens),0) thinking_tokens,
                  COALESCE(SUM(total_tokens),0) total_tokens,
                  COALESCE(SUM(estimated_cost_jpy),0) estimated_cost_jpy,
                  COALESCE(AVG(CASE WHEN status='SUCCESS' THEN latency_ms END),0) avg_latency_ms,
                  SUM(CASE WHEN status='SUCCESS' THEN 1 ELSE 0 END) success_calls,
                  SUM(CASE WHEN status<>'SUCCESS' THEN 1 ELSE 0 END) failed_calls
                FROM ai_usage WHERE {_month_expr()}=?''',
            (month,),
        ).fetchone()
    cost = round(float(r["estimated_cost_jpy"] or 0), 3)
    intakes = int(r["intakes"] or 0)
    images = int(r["images"] or 0)
    return {
        "month": month,
        "calls": int(r["calls"] or 0),
        "intakes": intakes,
        "images": images,
        "input_tokens": int(r["input_tokens"] or 0),
        "output_tokens": int(r["output_tokens"] or 0),
        "thinking_tokens": int(r["thinking_tokens"] or 0),
        "total_tokens": int(r["total_tokens"] or 0),
        "estimated_cost_jpy": cost,
        "average_cost_per_intake_jpy": round(cost / intakes, 3) if intakes else 0,
        "average_cost_per_image_jpy": round(cost / images, 3) if images else 0,
        "average_latency_ms": int(float(r["avg_latency_ms"] or 0)),
        "success_calls": int(r["success_calls"] or 0),
        "failed_calls": int(r["failed_calls"] or 0),
        "billing_owner": BILLING_OWNER,
        "estimate_only": True,
    }


def budget_state(month: str | None = None) -> dict[str, Any]:
    s = usage_summary(month)
    cost = float(s["estimated_cost_jpy"] or 0)
    soft = SOFT_LIMIT_JPY > 0 and cost >= SOFT_LIMIT_JPY
    hard = HARD_LIMIT_JPY > 0 and cost >= HARD_LIMIT_JPY
    return {
        "month": s["month"],
        "estimated_cost_jpy": cost,
        "soft_limit_jpy": SOFT_LIMIT_JPY,
        "hard_limit_jpy": HARD_LIMIT_JPY,
        "soft_limit_exceeded": soft,
        "hard_limit_exceeded": hard,
        "hard_limit_action": HARD_LIMIT_ACTION,
        "allow_gemini": not (hard and HARD_LIMIT_ACTION == "fallback"),
        "warning": "月次AI利用額が設定目安を超えています" if soft else "",
    }


def record_usage(
    *,
    draft_id: str | None,
    result: dict[str, Any] | None,
    image_count: int,
    latency_ms: int,
    status: str,
    error_type: str | None = None,
    provider: str = "Google Gemini Developer API",
    model: str = "gemini-3.8-flash",
) -> dict[str, Any]:
    ensure_schema()
    meta = (result or {}).get("_meta") or {}
    passes = meta.get("passes") or []
    input_tokens = output_tokens = thinking_tokens = total_tokens = 0
    for p in passes:
        u = (p or {}).get("usage") or {}
        input_tokens += int(u.get("prompt_tokens") or 0)
        output_tokens += int(u.get("candidate_tokens") or 0)
        thinking_tokens += int(u.get("thinking_tokens") or 0)
        total_tokens += int(u.get("total_tokens") or 0)
    cost = float(meta.get("estimated_cost_jpy") or 0)
    with main.db() as c:
        c.execute(
            '''INSERT INTO ai_usage(
               draft_id,provider,model,image_count,pass_count,input_tokens,output_tokens,
               thinking_tokens,total_tokens,estimated_cost_jpy,latency_ms,status,error_type,billing_owner
               )VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
            (
                draft_id, provider, model, int(image_count), len(passes), input_tokens, output_tokens,
                thinking_tokens, total_tokens, cost, int(latency_ms), status, error_type, BILLING_OWNER,
            ),
        )
    return {
        "draft_id": draft_id,
        "image_count": int(image_count),
        "pass_count": len(passes),
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "thinking_tokens": thinking_tokens,
        "total_tokens": total_tokens,
        "estimated_cost_jpy": round(cost, 3),
        "latency_ms": int(latency_ms),
        "status": status,
    }


def _last_event(status: str) -> dict[str, Any] | None:
    ensure_schema()
    with main.db() as c:
        r = c.execute(
            "SELECT created_at,error_type,model FROM ai_usage WHERE status=? ORDER BY id DESC LIMIT 1",
            (status,),
        ).fetchone()
    return dict(r) if r else None


def status_payload(gemini_status: dict[str, Any]) -> dict[str, Any]:
    success = _last_event("SUCCESS")
    ensure_schema()
    with main.db() as c:
        err = c.execute(
            "SELECT created_at,error_type,model FROM ai_usage WHERE status<>'SUCCESS' ORDER BY id DESC LIMIT 1"
        ).fetchone()
    error = dict(err) if err else None
    reachable: bool | None = None
    if gemini_status.get("configured"):
        if success and (not error or str(success["created_at"]) >= str(error["created_at"])):
            reachable = True
        elif error:
            reachable = False
    return {
        "provider": "Google Gemini Developer API",
        "model": gemini_status.get("model"),
        "pipeline_version": VERSION,
        "configured": bool(gemini_status.get("configured")),
        "reachable": reachable,
        "reachability_note": "直近の実処理結果から判定。未実行時はnull。",
        "billing_owner": BILLING_OWNER,
        "billing_label": "お客様",
        "direct_billing": True,
        "key_storage": "Railway Secret / environment variable",
        "key_exposed": False,
        "key_rotation_requires_code_change": False,
        "fallback_ready": True,
        "last_success_at": success.get("created_at") if success else None,
        "last_error_at": error.get("created_at") if error else None,
        "last_error_type": error.get("error_type") if error else None,
        "budget": budget_state(),
        "usage": usage_summary(),
    }
