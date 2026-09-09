FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DEBIAN_FRONTEND=noninteractive OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr tesseract-ocr-jpn libglib2.0-0 libgomp1 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements-web.txt .
RUN pip install --no-cache-dir -r requirements-web.txt
RUN python - <<'PY'
import cv2
print('OpenCV headless OK', cv2.__version__)
PY
COPY main.py .
COPY ticket_pipeline.py .
COPY ticket_pipeline_patch.py .
COPY extraction_orchestrator.py .
COPY orchestrator_patch_v8_1.py .
COPY orchestrator_patch_v8_2.py .
COPY vlm_pipeline_v9.py .
COPY gemini_pipeline_v10.py .
COPY client_ai_ops_v101.py .
COPY ground_truth_v1_public.json .
COPY start_v2.py .
COPY start_v3.py .
COPY start_v4.py .
COPY start_v5.py .
COPY start_v6.py .
COPY start_v7.py .
COPY start_v8.py .
COPY start_v9.py .
RUN python -m py_compile main.py ticket_pipeline.py ticket_pipeline_patch.py extraction_orchestrator.py orchestrator_patch_v8_1.py orchestrator_patch_v8_2.py vlm_pipeline_v9.py gemini_pipeline_v10.py client_ai_ops_v101.py start_v2.py start_v3.py start_v4.py start_v5.py start_v6.py start_v7.py start_v8.py start_v9.py \
 && python - <<'PY'
import json
import extraction_orchestrator as eo
import orchestrator_patch_v8_1 as p1
import orchestrator_patch_v8_2 as p2
import vlm_pipeline_v9 as v9
import gemini_pipeline_v10 as g10
import client_ai_ops_v101 as ops
assert eo.parse_date_value('令和8年9月2日') == '2026-09-02'
assert eo.parse_date_value('R8.10.2') == '2026-10-02'
assert eo.parse_money_value('40,000円') == 40000
p1.apply(eo); p2.apply(eo)
assert eo.ENGINE_VERSION == '8.2.0-ground-truth-calibrated'
assert eo.PARSERS['phone']('070-2292-7017') == '070-2292-7017'
assert eo.PARSERS['phone']('022-302-7782') == ''
assert p2._valid_contract_date('2026-09-02')
assert not p2._valid_contract_date('2022-07-03')
assert p2._semantic_item_text('匠絆 忠相')
assert not p2._semantic_item_text('a')
assert any(x.get('series') == '匠絆 忠相' for x in eo.PRODUCT_MASTER)
with open('ground_truth_v1_public.json', encoding='utf-8') as f: gt=json.load(f)
assert gt['pawn_ticket_A']['loan_amount'] == 40000
assert gt['pawn_ticket_A']['monthly_interest'] == 1200
assert gt['pawn_ticket_B']['loan_amount'] == 40000
assert gt['fixed_template_noise']['must_never_be_customer_phone'] is True
assert v9._mobile('022-302-7782') == ''
assert v9._mobile('070-2292-7017') == '070-2292-7017'
assert v9._valid_date_pair('2026-09-02','2026-10-02')
assert v9._valid_money_pair(40000,1200)
assert not v9._valid_money_pair(7782,7782)
s=g10._sanitize_schema(v9._schema())
assert s['type']=='object' and 'additionalProperties' not in s
st=g10.status()
assert st['pipeline_version']=='10.0.0-gemini-3.8-flash'
assert st['model']=='gemini-3.8-flash'
assert ops.VERSION=='10.1.0-client-owned'
assert ops.BILLING_OWNER=='client'
bs=ops.budget_state()
assert bs['soft_limit_jpy'] >= 0 and bs['hard_limit_jpy'] >= 0
print('Client-owned Gemini v10.1 regression test OK; configured=', st['configured'])
PY
EXPOSE 8000
CMD ["python","start_v9.py"]
