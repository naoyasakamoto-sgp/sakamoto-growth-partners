import json
import os
import sys
import urllib.error
import urllib.request

base = os.getenv("LINE_BOT_URL", "").rstrip("/")
secret = os.getenv("LINE_CRON_SECRET", "")
if not base or not secret:
    print(json.dumps({"ok": False, "error": "LINE_BOT_URL/LINE_CRON_SECRET missing"}))
    sys.exit(1)

req = urllib.request.Request(
    base + "/api/line/cron",
    data=b"{}",
    method="POST",
    headers={
        "Content-Type": "application/json",
        "X-Cron-Secret": secret,
    },
)
try:
    with urllib.request.urlopen(req, timeout=20) as res:
        body = res.read().decode("utf-8", "replace")
        print(body)
        if not 200 <= int(res.status) < 300:
            sys.exit(1)
except urllib.error.HTTPError as e:
    print(e.read().decode("utf-8", "replace"))
    sys.exit(1)
except Exception as e:
    print(json.dumps({"ok": False, "error": type(e).__name__}))
    sys.exit(1)
