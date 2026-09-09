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
COPY bank_matching_engine.py .
COPY ground_truth_v1_public.json .
COPY start_v2.py .
COPY start_v3.py .
COPY start_v4.py .
COPY start_v5.py .
COPY start_v6.py .
COPY start_v7.py .
COPY start_v8.py .
COPY start_v9.py .
COPY start_v10.py .
COPY start_v11.py .
COPY start_v12.py .
COPY start_v13.py .
RUN python -m py_compile main.py ticket_pipeline.py ticket_pipeline_patch.py extraction_orchestrator.py orchestrator_patch_v8_1.py orchestrator_patch_v8_2.py vlm_pipeline_v9.py gemini_pipeline_v10.py client_ai_ops_v101.py bank_matching_engine.py start_v2.py start_v3.py start_v4.py start_v5.py start_v6.py start_v7.py start_v8.py start_v9.py start_v10.py start_v11.py start_v12.py start_v13.py \
 && python - <<'PY'
import json
import extraction_orchestrator as eo
import orchestrator_patch_v8_1 as p1
import orchestrator_patch_v8_2 as p2
import vlm_pipeline_v9 as v9
import gemini_pipeline_v10 as g10
import client_ai_ops_v101 as ops
import bank_matching_engine as bme
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
import start_v10 as ui
assert ui.APP_VERSION=='2.4.2-poc' and 'mobile-responsive-v242' in ui.main.HTML
import start_v11 as bank
assert bank.APP_VERSION=='2.4.3-poc'
sample='"日付","摘要","摘要内容","支払い金額","預かり金額","差引残高","メモ","未資金化区分","入払区分"\n"2026/5/6","デビット１","SHOP","7,700","","1,588,671","","","振替支払い"\n"2026/5/25","Ｄ現金還元","８ネン　４ガツブン","","54","1,356,672","","","振替入金"\n"2026/5/29","振込１","カ）ギブリ－","","1,056,000","2,205,172","","","振替入金"\n'
rows,diag=bank._parse_csv_bytes(sample.encode('cp932'))
assert diag['total_rows']==3 and diag['inbound_rows']==2 and diag['outgoing_rows_skipped']==1
assert rows[0]['date']=='2026-05-25' and rows[0]['amount']==54
assert rows[1]['date']=='2026-05-29' and rows[1]['sender']=='カ)ギブリ-' and rows[1]['amount']==1056000
assert bme.classify_credit('Ｄ現金還元','8ネン 4ガツブン',54)[0]=='NON_CUSTOMER'
assert bme.normalize_sender('ｻﾄｳ ﾊﾙｶ') == bme.normalize_sender('サトウ ハルカ')
contract={'customer_name':'佐藤 はるか','name_kana':'サトウ ハルカ','principal_amount':40000,'interest_amount':1200,'contract_date':'2026-08-01','next_interest_due_date':'2026-09-01','effective_status':'DUE_SOON'}
tx={'sender_name':'サトウ ハルカ','amount':1200,'transaction_date':'2026-09-02'}
sc=bme.score_candidate(tx,contract)
assert sc['total_score']==95 and sc['name_exact'] and sc['payment_type']=='INTEREST' and sc['months']==1
sc['contract_id']=1
assert bme.decide([sc])['status']=='AUTO_MATCHED'
sc2=dict(sc);sc2['contract_id']=2
assert bme.decide([sc,sc2])['status']=='REVIEW'
red=bme.score_candidate({'sender_name':'サトウ ハルカ','amount':41200,'transaction_date':'2026-09-02'},contract)
assert red['payment_type']=='REDEMPTION' and 'payment_type_requires_human_review' in red['auto_blockers']
import start_v12 as matchapp
assert matchapp.APP_VERSION=='2.5.0-poc'
assert matchapp.MATCHING_VERSION=='1.0.1-deterministic-high-precision'
assert 'bank-match-v250' in matchapp.main.HTML
assert matchapp.AUTO_THRESHOLD==95 and matchapp.REVIEW_THRESHOLD==70 and matchapp.MARGIN_THRESHOLD==10
import start_v13 as integrity
assert integrity.APP_VERSION=='2.5.1-poc'
assert integrity.start_v12._persist_candidates is integrity._persist
assert 'v2.5.1-poc' in integrity.main.HTML
print('Bank matching v2.5.1 regression test OK; Gemini configured=', st['configured'])
PY
EXPOSE 8000
CMD ["python","start_v13.py"]
