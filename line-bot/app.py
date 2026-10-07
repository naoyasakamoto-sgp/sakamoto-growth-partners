import json
import os
import secrets
import sqlite3
import sys
from contextlib import contextmanager
from pathlib import Path

import uvicorn
from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials

import line_newsletter_v15

APP_VERSION = "1.0.0-line-bot"
DATA_DIR = Path(os.getenv("DATA_DIR", "/data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "line_bot.sqlite3"

ADMIN_USER = os.getenv("ADMIN_USER", "manager")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
security = HTTPBasic()

app = FastAPI(title="鶴亀屋グループ通信 LINE配信", version=APP_VERSION, docs_url=None, redoc_url=None)

BASE_SCHEMA = """
CREATE TABLE IF NOT EXISTS audit_logs(
  id INTEGER PRIMARY KEY,
  actor TEXT,
  role TEXT,
  action TEXT,
  target_type TEXT,
  target_id TEXT,
  details TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"""


@contextmanager
def db():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    try:
        yield c
        c.commit()
    finally:
        c.close()


def audit(c, actor, role, action, target_type, target_id, details=None):
    c.execute(
        "INSERT INTO audit_logs(actor,role,action,target_type,target_id,details) VALUES(?,?,?,?,?,?)",
        (actor, role, action, target_type, str(target_id), json.dumps(details or {}, ensure_ascii=False)),
    )


@app.on_event("startup")
def startup():
    with db() as c:
        c.executescript(BASE_SCHEMA)


def auth(x: HTTPBasicCredentials = Depends(security)):
    if not ADMIN_PASSWORD:
        raise HTTPException(503, "ADMIN_PASSWORD が未設定です")
    if secrets.compare_digest(x.username, ADMIN_USER) and secrets.compare_digest(x.password, ADMIN_PASSWORD):
        return {"name": x.username, "role": "manager"}
    raise HTTPException(401, "認証に失敗しました", headers={"WWW-Authenticate": "Basic"})


HTML = """<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>鶴亀屋グループ通信｜LINE配信</title>
<style>
:root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17304b;background:#f4f6f8}
*{box-sizing:border-box}body{margin:0}header{background:#12385e;color:white;padding:18px}.w{max-width:1000px;margin:auto;padding:14px}
.c{background:white;padding:16px;border-radius:14px;margin:10px 0;border:1px solid #e5eaf0}.tabs{display:flex;gap:6px;margin:12px 0}
.tabs button,button{padding:9px 12px;border:0;border-radius:8px;cursor:pointer;font-weight:650}.tabs button{background:#e8edf3}
.tabs .on,.p{background:#12385e;color:white}.panel{display:none}.panel.on{display:block}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.muted{color:#7b8797}.small{font-size:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere}
@media(max-width:700px){.w{padding:10px}}
</style></head><body>
<header><b>鶴亀屋グループ通信｜LINE定期配信</b></header>
<div class="w"><div class="tabs"><button class="on" data-x="a">監査</button></div>
<section id="a" class="panel on"><div class="c"><h3>監査ログ</h3><button onclick="loadAudit()">更新</button><pre id="auditOut"></pre></div></section>
<div class="c"><span id="health">確認中...</span></div></div>
<script>
const $=x=>document.getElementById(x);
const api=async(u,o={})=>{let r=await fetch(u,o);if(!r.ok){let t=await r.text();throw Error(t)}return r.json()};
document.querySelectorAll('.tabs button').forEach(q=>q.onclick=()=>{document.querySelectorAll('.tabs button,.panel').forEach(z=>z.classList.remove('on'));q.classList.add('on');$(q.dataset.x).classList.add('on')});
async function loadAudit(){try{$('auditOut').textContent=JSON.stringify(await api('/api/audit'),null,2)}catch(e){$('auditOut').textContent=e.message}}
fetch('/api/health').then(r=>r.json()).then(h=>$('health').textContent='v'+h.version+'｜DB '+(h.persistent_db?'永続':'一時')+'｜LINE '+(h.line_access_token_configured?'接続設定あり':'未設定')).catch(()=>{});
</script></body></html>"""


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "version": APP_VERSION,
        "persistent_db": str(DB_PATH).startswith("/data/"),
        "line_access_token_configured": bool(os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "").strip()),
        "line_channel_secret_configured": bool(os.getenv("LINE_CHANNEL_SECRET", "").strip()),
        "line_cron_secret_configured": bool(os.getenv("LINE_CRON_SECRET", "").strip()),
    }


@app.get("/api/audit")
def audit_log(a=Depends(auth)):
    with db() as c:
        return {"items": [dict(x) for x in c.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100").fetchall()]}


@app.get("/", response_class=HTMLResponse)
def root(a=Depends(auth)):
    return HTMLResponse(HTML)


class RouterTools:
    @staticmethod
    def replace(path, method, fn):
        app.router.routes = [
            r for r in app.router.routes
            if not (getattr(r, "path", None) == path and method in getattr(r, "methods", set()))
        ]
        app.add_api_route(path, fn, methods=[method])


line_newsletter_v15.install(sys.modules[__name__], RouterTools)

# Standalone service opens directly on the LINE panel.
HTML = HTML.replace(
    '<button data-x="l">LINE配信</button><button class="on" data-x="a">監査</button>',
    '<button class="on" data-x="l">LINE配信</button><button data-x="a">監査</button>'
)
HTML = HTML.replace('<section id="l" class="panel">', '<section id="l" class="panel on">')
HTML = HTML.replace('<section id="a" class="panel on">', '<section id="a" class="panel">')


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")), proxy_headers=True)
