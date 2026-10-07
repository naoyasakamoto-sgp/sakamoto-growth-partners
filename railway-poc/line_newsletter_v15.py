from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import sqlite3
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Any

from fastapi import Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

LINE_AUTOMATION_VERSION = "1.0.0"
JST = ZoneInfo("Asia/Tokyo")
WEEKDAY_JA = ["月", "火", "水", "木", "金", "土", "日"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS line_settings(
  id INTEGER PRIMARY KEY CHECK(id=1),
  enabled INTEGER NOT NULL DEFAULT 1,
  approval_required INTEGER NOT NULL DEFAULT 1,
  send_time TEXT NOT NULL DEFAULT '11:45',
  weekdays TEXT NOT NULL DEFAULT '0,1,2,3,4',
  target_id TEXT,
  template TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS line_targets(
  id INTEGER PRIMARY KEY,
  target_id TEXT NOT NULL UNIQUE,
  target_type TEXT NOT NULL,
  display_name TEXT,
  selected INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS line_drafts(
  id INTEGER PRIMARY KEY,
  scheduled_date TEXT NOT NULL UNIQUE,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  approved_by TEXT,
  approved_at TEXT,
  sent_at TEXT,
  line_request_id TEXT,
  error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS line_delivery_logs(
  id INTEGER PRIMARY KEY,
  draft_id INTEGER,
  target_id TEXT,
  status TEXT NOT NULL,
  line_request_id TEXT,
  response TEXT,
  error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"""

DEFAULT_TEMPLATE = """♻️{{date_ja}}

鶴亀屋グループ通信
伊藤工芸

{{body}}

今後ともご愛顧賜りますよう
よろしくお願い申し上げます。

●質屋やまがた
https://pawnshop-yamagata.com/
●質屋せんだい
https://pawnshop-sendai.com/"""


def _now() -> datetime:
    return datetime.now(JST)


def _date_ja(d: date) -> str:
    return f"{d.year}.{d.month}.{d.day}（{WEEKDAY_JA[d.weekday()]}）"


def _clean_body(body: str) -> str:
    body = (body or "").replace("\r\n", "\n").strip()
    if not body:
        raise HTTPException(422, "配信本文を入力してください")
    if len(body) > 3500:
        raise HTTPException(422, "配信本文は3500文字以内にしてください")
    return body


def _render(template: str, scheduled_date: str, body: str) -> str:
    d = date.fromisoformat(scheduled_date)
    text = (template or DEFAULT_TEMPLATE)
    text = text.replace("{{date_ja}}", _date_ja(d)).replace("{{body}}", body.strip())
    if len(text) > 5000:
        raise HTTPException(422, "LINEメッセージが5000文字を超えています")
    return text


def _target_from_source(source: dict[str, Any]) -> tuple[str | None, str | None]:
    kind = source.get("type")
    if kind == "group":
        return source.get("groupId"), "group"
    if kind == "room":
        return source.get("roomId"), "room"
    if kind == "user":
        return source.get("userId"), "user"
    return None, None


def _weekday_set(raw: str) -> set[int]:
    out = set()
    for x in (raw or "").split(","):
        try:
            n = int(x.strip())
            if 0 <= n <= 6:
                out.add(n)
        except Exception:
            pass
    return out or {0, 1, 2, 3, 4}


def _line_request(target_id: str, text: str) -> dict[str, Any]:
    token = os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "").strip()
    if not token:
        raise HTTPException(503, "LINE_CHANNEL_ACCESS_TOKEN が未設定です")
    payload = json.dumps({
        "to": target_id,
        "messages": [{"type": "text", "text": text}],
    }, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        "https://api.line.me/v2/bot/message/push",
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            raw = res.read().decode("utf-8", "replace")
            return {
                "status": int(res.status),
                "request_id": res.headers.get("x-line-request-id", ""),
                "response": raw[:1500],
            }
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        raise HTTPException(502, f"LINE送信エラー HTTP {e.code}: {raw[:400]}")
    except Exception as e:
        raise HTTPException(502, f"LINE送信エラー: {type(e).__name__}")


class LineSettingsIn(BaseModel):
    enabled: bool = True
    approval_required: bool = True
    send_time: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    weekdays: list[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4])


class LineDraftIn(BaseModel):
    scheduled_date: str
    body: str


class LineLabelIn(BaseModel):
    display_name: str = ""


def install(main, router_tools) -> None:
    if getattr(main.app.state, "line_automation_installed", False):
        return
    main.app.state.line_automation_installed = True

    def ensure_schema():
        with main.db() as c:
            c.executescript(SCHEMA)
            c.execute(
                """INSERT OR IGNORE INTO line_settings
                   (id,enabled,approval_required,send_time,weekdays,target_id,template)
                   VALUES(1,1,1,'11:45','0,1,2,3,4',NULL,?)""",
                (DEFAULT_TEMPLATE,),
            )

    @main.app.on_event("startup")
    def _line_startup():
        ensure_schema()

    def read_settings(c):
        row = c.execute("SELECT * FROM line_settings WHERE id=1").fetchone()
        if not row:
            c.execute(
                """INSERT INTO line_settings(id,enabled,approval_required,send_time,weekdays,template)
                   VALUES(1,1,1,'11:45','0,1,2,3,4',?)""",
                (DEFAULT_TEMPLATE,),
            )
            row = c.execute("SELECT * FROM line_settings WHERE id=1").fetchone()
        return dict(row)

    def active_target(c, settings: dict[str, Any]) -> str:
        env_target = os.getenv("LINE_TARGET_ID", "").strip()
        target = env_target or (settings.get("target_id") or "").strip()
        if not target:
            row = c.execute("SELECT target_id FROM line_targets WHERE selected=1 ORDER BY id DESC LIMIT 1").fetchone()
            target = row["target_id"] if row else ""
        if not target:
            raise HTTPException(409, "LINE配信先が未選択です。Webhook受信後に配信先を選択してください")
        return target

    def serialize_settings(c) -> dict[str, Any]:
        s = read_settings(c)
        target = (os.getenv("LINE_TARGET_ID", "").strip() or s.get("target_id") or "")
        next_run = _next_scheduled(s)
        return {
            "enabled": bool(s["enabled"]),
            "approval_required": bool(s["approval_required"]),
            "send_time": s["send_time"],
            "weekdays": sorted(_weekday_set(s["weekdays"])),
            "target_id": target,
            "target_configured": bool(target),
            "token_configured": bool(os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "").strip()),
            "channel_secret_configured": bool(os.getenv("LINE_CHANNEL_SECRET", "").strip()),
            "cron_secret_configured": bool(os.getenv("LINE_CRON_SECRET", "").strip()),
            "next_scheduled_at": next_run.isoformat() if next_run else None,
            "version": LINE_AUTOMATION_VERSION,
        }

    def _next_scheduled(s: dict[str, Any]) -> datetime | None:
        try:
            hh, mm = [int(x) for x in str(s["send_time"]).split(":", 1)]
        except Exception:
            return None
        allowed = _weekday_set(s.get("weekdays", ""))
        now = _now()
        for i in range(8):
            d = now.date() + timedelta(days=i)
            if d.weekday() not in allowed:
                continue
            cand = datetime(d.year, d.month, d.day, hh, mm, tzinfo=JST)
            if cand > now:
                return cand
        return None

    def send_draft(c, draft: sqlite3.Row | dict[str, Any], actor: str, reason: str):
        s = read_settings(c)
        target = active_target(c, s)
        d = dict(draft)
        if d["status"] == "SENT":
            return {"ok": True, "already_sent": True, "draft_id": d["id"]}
        body = _clean_body(d["body"])
        message = _render(s["template"], d["scheduled_date"], body)
        try:
            result = _line_request(target, message)
        except HTTPException as e:
            c.execute(
                "UPDATE line_drafts SET status='FAILED',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (str(e.detail), d["id"]),
            )
            c.execute(
                "INSERT INTO line_delivery_logs(draft_id,target_id,status,error) VALUES(?,?,?,?)",
                (d["id"], target, "FAILED", str(e.detail)),
            )
            main.audit(c, actor, "system" if actor == "cron" else "manager", "LINE_SEND_FAILED", "line_draft", d["id"], {"reason": reason})
            raise
        c.execute(
            """UPDATE line_drafts SET status='SENT',sent_at=CURRENT_TIMESTAMP,
               line_request_id=?,error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?""",
            (result.get("request_id"), d["id"]),
        )
        c.execute(
            """INSERT INTO line_delivery_logs(draft_id,target_id,status,line_request_id,response)
               VALUES(?,?,?,?,?)""",
            (d["id"], target, "SENT", result.get("request_id"), result.get("response")),
        )
        main.audit(c, actor, "system" if actor == "cron" else "manager", "LINE_SENT", "line_draft", d["id"], {"reason": reason, "target_type": "line"})
        return {
            "ok": True,
            "draft_id": d["id"],
            "status": "SENT",
            "request_id": result.get("request_id"),
            "message": message,
        }

    def status(a=Depends(main.auth)):
        ensure_schema()
        with main.db() as c:
            s = serialize_settings(c)
            today = _now().date().isoformat()
            draft = c.execute("SELECT * FROM line_drafts WHERE scheduled_date=?", (today,)).fetchone()
            targets = [dict(x) for x in c.execute(
                "SELECT id,target_id,target_type,display_name,selected,last_seen_at FROM line_targets ORDER BY selected DESC,last_seen_at DESC LIMIT 20"
            ).fetchall()]
            s["today_draft"] = dict(draft) if draft else None
            s["targets"] = targets
            return s

    def get_settings(a=Depends(main.auth)):
        ensure_schema()
        with main.db() as c:
            return serialize_settings(c)

    def update_settings(b: LineSettingsIn, a=Depends(main.auth)):
        ensure_schema()
        weekdays = sorted({int(x) for x in b.weekdays if 0 <= int(x) <= 6})
        if not weekdays:
            raise HTTPException(422, "配信曜日を1日以上選択してください")
        with main.db() as c:
            c.execute(
                """UPDATE line_settings SET enabled=?,approval_required=?,send_time=?,weekdays=?,
                   updated_at=CURRENT_TIMESTAMP WHERE id=1""",
                (int(b.enabled), int(b.approval_required), b.send_time, ",".join(map(str, weekdays))),
            )
            main.audit(c, a["name"], a["role"], "LINE_SETTINGS_UPDATED", "line_settings", 1, {
                "enabled": b.enabled,
                "approval_required": b.approval_required,
                "send_time": b.send_time,
                "weekdays": weekdays,
            })
            return serialize_settings(c)

    def list_drafts(limit: int = 30, a=Depends(main.auth)):
        ensure_schema()
        limit = max(1, min(int(limit), 100))
        with main.db() as c:
            rows = c.execute(
                "SELECT * FROM line_drafts ORDER BY scheduled_date DESC,id DESC LIMIT ?", (limit,)
            ).fetchall()
            return {"items": [dict(x) for x in rows]}

    def save_draft(b: LineDraftIn, a=Depends(main.auth)):
        ensure_schema()
        try:
            date.fromisoformat(b.scheduled_date)
        except Exception:
            raise HTTPException(422, "scheduled_date は YYYY-MM-DD で指定してください")
        body = _clean_body(b.body)
        with main.db() as c:
            old = c.execute("SELECT * FROM line_drafts WHERE scheduled_date=?", (b.scheduled_date,)).fetchone()
            if old and old["status"] == "SENT":
                raise HTTPException(409, "送信済みの配信は編集できません")
            if old:
                c.execute(
                    """UPDATE line_drafts SET body=?,status='DRAFT',approved_by=NULL,approved_at=NULL,
                       error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?""",
                    (body, old["id"]),
                )
                did = old["id"]
            else:
                did = c.execute(
                    "INSERT INTO line_drafts(scheduled_date,body,status) VALUES(?,?,'DRAFT')",
                    (b.scheduled_date, body),
                ).lastrowid
            main.audit(c, a["name"], a["role"], "LINE_DRAFT_SAVED", "line_draft", did, {"scheduled_date": b.scheduled_date})
            row = c.execute("SELECT * FROM line_drafts WHERE id=?", (did,)).fetchone()
            s = read_settings(c)
            return {"item": dict(row), "preview": _render(s["template"], b.scheduled_date, body)}

    def approve_draft(draft_id: int, a=Depends(main.auth)):
        ensure_schema()
        with main.db() as c:
            row = c.execute("SELECT * FROM line_drafts WHERE id=?", (draft_id,)).fetchone()
            if not row:
                raise HTTPException(404, "配信下書きがありません")
            if row["status"] == "SENT":
                raise HTTPException(409, "送信済みです")
            _clean_body(row["body"])
            c.execute(
                """UPDATE line_drafts SET status='APPROVED',approved_by=?,approved_at=CURRENT_TIMESTAMP,
                   error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?""",
                (a["name"], draft_id),
            )
            main.audit(c, a["name"], a["role"], "LINE_DRAFT_APPROVED", "line_draft", draft_id)
            return {"ok": True, "status": "APPROVED", "draft_id": draft_id}

    def skip_draft(draft_id: int, a=Depends(main.auth)):
        ensure_schema()
        with main.db() as c:
            row = c.execute("SELECT * FROM line_drafts WHERE id=?", (draft_id,)).fetchone()
            if not row:
                raise HTTPException(404, "配信下書きがありません")
            if row["status"] == "SENT":
                raise HTTPException(409, "送信済みです")
            c.execute("UPDATE line_drafts SET status='SKIPPED',updated_at=CURRENT_TIMESTAMP WHERE id=?", (draft_id,))
            main.audit(c, a["name"], a["role"], "LINE_DRAFT_SKIPPED", "line_draft", draft_id)
            return {"ok": True, "status": "SKIPPED", "draft_id": draft_id}

    def send_now(draft_id: int, a=Depends(main.auth)):
        ensure_schema()
        with main.db() as c:
            row = c.execute("SELECT * FROM line_drafts WHERE id=?", (draft_id,)).fetchone()
            if not row:
                raise HTTPException(404, "配信下書きがありません")
            return send_draft(c, row, a["name"], "manual")

    def select_target(target_id: int, a=Depends(main.auth)):
        ensure_schema()
        with main.db() as c:
            row = c.execute("SELECT * FROM line_targets WHERE id=?", (target_id,)).fetchone()
            if not row:
                raise HTTPException(404, "配信先がありません")
            c.execute("UPDATE line_targets SET selected=0")
            c.execute("UPDATE line_targets SET selected=1 WHERE id=?", (target_id,))
            c.execute("UPDATE line_settings SET target_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=1", (row["target_id"],))
            main.audit(c, a["name"], a["role"], "LINE_TARGET_SELECTED", "line_target", target_id, {"target_type": row["target_type"]})
            return {"ok": True, "target_id": row["target_id"], "target_type": row["target_type"]}

    def label_target(target_id: int, b: LineLabelIn, a=Depends(main.auth)):
        ensure_schema()
        label = (b.display_name or "").strip()[:100]
        with main.db() as c:
            if not c.execute("SELECT 1 FROM line_targets WHERE id=?", (target_id,)).fetchone():
                raise HTTPException(404, "配信先がありません")
            c.execute("UPDATE line_targets SET display_name=? WHERE id=?", (label, target_id))
            return {"ok": True}

    async def webhook(request: Request, x_line_signature: str | None = Header(None)):
        ensure_schema()
        secret = os.getenv("LINE_CHANNEL_SECRET", "").strip()
        if not secret:
            raise HTTPException(503, "LINE_CHANNEL_SECRET が未設定です")
        raw = await request.body()
        expected = base64.b64encode(hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).digest()).decode("ascii")
        if not x_line_signature or not hmac.compare_digest(expected, x_line_signature):
            raise HTTPException(401, "Invalid LINE signature")
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            raise HTTPException(400, "Invalid JSON")
        captured = []
        with main.db() as c:
            for ev in payload.get("events") or []:
                target, kind = _target_from_source(ev.get("source") or {})
                if not target or not kind:
                    continue
                c.execute(
                    """INSERT INTO line_targets(target_id,target_type,last_seen_at)
                       VALUES(?,?,CURRENT_TIMESTAMP)
                       ON CONFLICT(target_id) DO UPDATE SET target_type=excluded.target_type,last_seen_at=CURRENT_TIMESTAMP""",
                    (target, kind),
                )
                captured.append({"target_id": target, "target_type": kind})
        return {"ok": True, "captured": len(captured)}

    async def cron(request: Request, x_cron_secret: str | None = Header(None)):
        ensure_schema()
        secret = os.getenv("LINE_CRON_SECRET", "").strip()
        if not secret:
            raise HTTPException(503, "LINE_CRON_SECRET が未設定です")
        if not x_cron_secret or not hmac.compare_digest(secret, x_cron_secret):
            raise HTTPException(401, "Invalid cron secret")
        now = _now()
        with main.db() as c:
            s = read_settings(c)
            if not bool(s["enabled"]):
                return {"ok": True, "action": "noop", "reason": "disabled"}
            allowed = _weekday_set(s["weekdays"])
            if now.weekday() not in allowed:
                return {"ok": True, "action": "noop", "reason": "weekday_not_enabled"}
            hh, mm = [int(x) for x in s["send_time"].split(":", 1)]
            due = datetime(now.year, now.month, now.day, hh, mm, tzinfo=JST)
            if now < due:
                return {"ok": True, "action": "noop", "reason": "not_due", "due_at": due.isoformat()}
            row = c.execute("SELECT * FROM line_drafts WHERE scheduled_date=?", (now.date().isoformat(),)).fetchone()
            if not row:
                return {"ok": True, "action": "noop", "reason": "no_draft"}
            if row["status"] == "SENT":
                return {"ok": True, "action": "noop", "reason": "already_sent", "draft_id": row["id"]}
            if row["status"] == "SKIPPED":
                return {"ok": True, "action": "noop", "reason": "skipped", "draft_id": row["id"]}
            if bool(s["approval_required"]) and row["status"] != "APPROVED":
                return {"ok": True, "action": "noop", "reason": "awaiting_approval", "draft_id": row["id"]}
            result = send_draft(c, row, "cron", "scheduled")
            result["action"] = "sent"
            return result

    router_tools.replace("/api/line/status", "GET", status)
    router_tools.replace("/api/line/settings", "GET", get_settings)
    router_tools.replace("/api/line/settings", "POST", update_settings)
    router_tools.replace("/api/line/drafts", "GET", list_drafts)
    router_tools.replace("/api/line/drafts", "POST", save_draft)
    router_tools.replace("/api/line/drafts/{draft_id}/approve", "POST", approve_draft)
    router_tools.replace("/api/line/drafts/{draft_id}/skip", "POST", skip_draft)
    router_tools.replace("/api/line/drafts/{draft_id}/send-now", "POST", send_now)
    router_tools.replace("/api/line/targets/{target_id}/select", "POST", select_target)
    router_tools.replace("/api/line/targets/{target_id}/label", "POST", label_target)
    router_tools.replace("/api/line/webhook", "POST", webhook)
    router_tools.replace("/api/line/cron", "POST", cron)

    LINE_CSS = r"""
<style id="line-newsletter-v1">
#linePanelGrid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(280px,.8fr);gap:12px}
#linePanelGrid textarea{width:100%;min-height:170px;padding:10px;border:1px solid #d6dde6;border-radius:9px;font:inherit;resize:vertical}
#linePanelGrid input,#linePanelGrid select{width:100%;padding:9px;border:1px solid #d6dde6;border-radius:9px;background:#fff}
.line-status{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.line-pill{padding:4px 8px;border-radius:999px;font-size:12px;background:#eef2f6}
.line-ok{background:#e5f7ec;color:#126a35}.line-ng{background:#ffe5e5;color:#9c1c1c}
.line-preview{white-space:pre-wrap;background:#f7f9fb;border:1px solid #e2e7ed;border-radius:10px;padding:12px;min-height:120px}
.line-days{display:flex;gap:4px;flex-wrap:wrap}.line-days label{display:flex;gap:3px;align-items:center;font-size:12px}
.line-days input{width:auto!important}
@media(max-width:760px){#linePanelGrid{grid-template-columns:1fr}}
</style>
"""
    if "line-newsletter-v1" not in main.HTML and "</head>" in main.HTML:
        main.HTML = main.HTML.replace("</head>", LINE_CSS + "</head>")

    tab_anchor = '<button data-x="a">監査</button>'
    if 'data-x="l"' not in main.HTML and tab_anchor in main.HTML:
        main.HTML = main.HTML.replace(tab_anchor, '<button data-x="l">LINE配信</button>' + tab_anchor)

    section_anchor = '<section id="a" class="panel">'
    line_section = r"""<section id="l" class="panel"><div id="linePanelGrid">
<div class="c"><div class="row"><div><h3>鶴亀屋グループ通信</h3><div class="muted small">LINE公式アカウントから定期配信。既定は平日11:45・承認後送信です。</div></div></div>
<div id="lineStatus" class="line-status"></div>
<label>配信日<input id="lineDate" type="date"></label>
<label>今日の内容<textarea id="lineBody" placeholder="例：本日は宮町の残置物撤去です。&#10;繁忙期になってまいりました。"></textarea></label>
<div class="row" style="margin-top:8px"><button class="p" onclick="lineSave()">下書き保存</button><button onclick="lineApprove()">承認</button><button onclick="lineSendNow()">今すぐ送信</button><button onclick="lineSkip()">スキップ</button></div>
<h4>プレビュー</h4><div id="linePreview" class="line-preview">本文を保存するとプレビューが表示されます。</div></div>
<div class="c"><h3>自動配信設定</h3>
<label>送信時刻<input id="lineTime" type="time" value="11:45"></label>
<div class="line-days" id="lineDays">
<label><input type="checkbox" value="0">月</label><label><input type="checkbox" value="1">火</label><label><input type="checkbox" value="2">水</label><label><input type="checkbox" value="3">木</label><label><input type="checkbox" value="4">金</label><label><input type="checkbox" value="5">土</label><label><input type="checkbox" value="6">日</label>
</div>
<label><input id="lineEnabled" type="checkbox" style="width:auto"> 自動配信を有効化</label><br>
<label><input id="lineApproval" type="checkbox" style="width:auto"> 配信前の承認を必須にする</label>
<p><button onclick="lineSaveSettings()">設定を保存</button></p>
<div class="small muted">配信先</div><div id="lineTargets"></div>
<div class="small muted" style="margin-top:8px">次回予定</div><div id="lineNext">-</div></div>
</div></section>"""
    if 'id="linePanelGrid"' not in main.HTML and section_anchor in main.HTML:
        main.HTML = main.HTML.replace(section_anchor, line_section + section_anchor)

    LINE_JS = r"""
<script id="line-newsletter-js-v1">
let lineDraftId=null,lineState=null;
function lineEsc(v){return String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]))}
function linePill(text,ok){return '<span class="line-pill '+(ok?'line-ok':'line-ng')+'">'+lineEsc(text)+'</span>'}
function lineFmtNext(v){if(!v)return '-';try{return new Date(v).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}catch{return v}}
function lineRenderPreview(d,b){let x=new Date(d+'T00:00:00+09:00'),w=['日','月','火','水','木','金','土'][x.getDay()];return '♻️'+x.getFullYear()+'.'+(x.getMonth()+1)+'.'+x.getDate()+'（'+w+'）\n\n鶴亀屋グループ通信\n伊藤工芸\n\n'+b.trim()+'\n\n今後ともご愛顧賜りますよう\nよろしくお願い申し上げます。\n\n●質屋やまがた\nhttps://pawnshop-yamagata.com/\n●質屋せんだい\nhttps://pawnshop-sendai.com/'}
async function lineLoad(){
 try{
  lineState=await api('/api/line/status');
  $('lineStatus').innerHTML=linePill(lineState.token_configured?'Messaging API接続':'Access Token未設定',lineState.token_configured)+linePill(lineState.channel_secret_configured?'Webhook署名OK':'Channel Secret未設定',lineState.channel_secret_configured)+linePill(lineState.target_configured?'配信先選択済み':'配信先未選択',lineState.target_configured);
  $('lineEnabled').checked=!!lineState.enabled;$('lineApproval').checked=!!lineState.approval_required;$('lineTime').value=lineState.send_time||'11:45';
  document.querySelectorAll('#lineDays input').forEach(x=>x.checked=(lineState.weekdays||[]).includes(+x.value));
  $('lineNext').textContent=lineFmtNext(lineState.next_scheduled_at);
  let ts=lineState.targets||[];$('lineTargets').innerHTML=ts.length?ts.map(t=>'<div class="row" style="margin-top:5px"><span class="line-pill '+(t.selected?'line-ok':'')+'">'+lineEsc(t.display_name||t.target_type)+' '+lineEsc((t.target_id||'').slice(0,10))+'…</span><button onclick="lineSelectTarget('+t.id+')">選択</button></div>').join(''):'Webhook受信後に候補が表示されます';
  let td=lineState.today_draft;if(td){lineDraftId=td.id;$('lineDate').value=td.scheduled_date;$('lineBody').value=td.body||'';$('linePreview').textContent=lineRenderPreview(td.scheduled_date,td.body||'')+'\n\n［状態: '+td.status+'］'}else{lineDraftId=null;$('lineDate').value=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});$('lineBody').value='';$('linePreview').textContent='本文を保存するとプレビューが表示されます。'}
 }catch(e){if($('lineStatus'))$('lineStatus').innerHTML=linePill('LINE設定読込失敗',false)}
}
async function lineSave(){
 try{let r=await api('/api/line/drafts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({scheduled_date:$('lineDate').value,body:$('lineBody').value})});lineDraftId=r.item.id;$('linePreview').textContent=r.preview+'\n\n［状態: '+r.item.status+'］';await lineLoad();alert('下書きを保存しました')}catch(e){alert(e.message)}
}
async function lineApprove(){if(!lineDraftId){await lineSave();if(!lineDraftId)return}try{await api('/api/line/drafts/'+lineDraftId+'/approve',{method:'POST'});await lineLoad();alert('承認しました。送信時刻になると自動配信されます')}catch(e){alert(e.message)}}
async function lineSendNow(){if(!lineDraftId)return alert('先に下書きを保存してください');if(!confirm('この内容をLINEへ今すぐ送信しますか？'))return;try{await api('/api/line/drafts/'+lineDraftId+'/send-now',{method:'POST'});await lineLoad();alert('LINEへ送信しました')}catch(e){alert(e.message)}}
async function lineSkip(){if(!lineDraftId)return alert('下書きがありません');try{await api('/api/line/drafts/'+lineDraftId+'/skip',{method:'POST'});await lineLoad();alert('本日の配信をスキップしました')}catch(e){alert(e.message)}}
async function lineSaveSettings(){let days=Array.from(document.querySelectorAll('#lineDays input:checked')).map(x=>+x.value);try{await api('/api/line/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:$('lineEnabled').checked,approval_required:$('lineApproval').checked,send_time:$('lineTime').value,weekdays:days})});await lineLoad();alert('LINE配信設定を保存しました')}catch(e){alert(e.message)}}
async function lineSelectTarget(id){try{await api('/api/line/targets/'+id+'/select',{method:'POST'});await lineLoad()}catch(e){alert(e.message)}}
lineLoad();
</script>
"""
    if "line-newsletter-js-v1" not in main.HTML and "</body>" in main.HTML:
        main.HTML = main.HTML.replace("</body>", LINE_JS + "</body>")
