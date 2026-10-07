FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY line-bot/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY railway-poc/line_newsletter_v15.py ./
COPY line-bot/app.py ./
RUN python -m py_compile app.py line_newsletter_v15.py \
 && python - <<'PY'
import line_newsletter_v15 as ln
msg=ln._render(ln.DEFAULT_TEMPLATE,'2026-10-08','本日は宮町の残置物撤去です。')
assert '2026.10.8（木）' in msg
assert '鶴亀屋グループ通信' in msg
import app
paths={getattr(r,'path',None) for r in app.app.router.routes}
assert '/api/line/webhook' in paths and '/api/line/cron' in paths and '/api/line/drafts' in paths
assert 'LINE配信' in app.HTML
print('LINE bot smoke test OK')
PY
EXPOSE 8000
CMD ["python","app.py"]
