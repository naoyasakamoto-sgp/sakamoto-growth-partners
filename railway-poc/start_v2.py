import os, json, uuid
from datetime import date
import uvicorn
from fastapi import UploadFile, File, Depends, HTTPException, Request
import main
import ticket_pipeline as tp

APP_VERSION = '1.2.0-poc'
ALLOWED_IMAGE_TYPES = {'image/jpeg','image/png','image/webp','application/octet-stream'}

async def _read_image(f: UploadFile, label: str):
    ct=(f.content_type or '').lower().split(';',1)[0].strip()
    if ct and ct not in ALLOWED_IMAGE_TYPES and not ct.startswith('image/'):
        raise HTTPException(415, f'{label}はJPEG/PNG/WebP画像を選択してください')
    raw=await main.read(f)
    if not raw:
        raise HTTPException(422, f'{label}が空です')
    try:
        tp._decode(raw)
    except Exception:
        raise HTTPException(422, f'{label}を画像として読み取れません')
    return raw

def _safe_license_diag(d):
    if not isinstance(d,dict):
        return None
    return {k:d.get(k) for k in ('name','address','confidence','engine') if k in d}

def _iso_date(v, label):
    try:
        return date.fromisoformat(str(v or '')[:10])
    except Exception:
        raise HTTPException(422, f'{label}をYYYY-MM-DDで確認してください')

async def extract_v4(
    license_image: UploadFile = File(...),
    item_image: UploadFile = File(...),
    ticket_image: UploadFile = File(...),
    a = Depends(main.auth),
):
    # License bytes are held only in memory during OCR. They are intentionally not persisted.
    lr = await _read_image(license_image, '運転免許証')
    ir = await _read_image(item_image, '質入品')
    tr = await _read_image(ticket_image, '質札')

    try:
        ticket = tp.recognize_ticket(tr, lr)
    except Exception as e:
        raise HTTPException(422, f'質札の認識に失敗しました: {type(e).__name__}')

    try:
        itext, iconf, iengine = tp.generic_image_text(ir)
    except Exception:
        itext, iconf, iengine = '', 0.0, 'none'

    f = ticket.get('fields', {})
    def val(k, default=''):
        return f.get(k, {}).get('value', default)

    cd = val('contract_date') or ''
    fd = val('forfeiture_due_date') or ticket.get('suggestions', {}).get('forfeiture_due_date', '')
    principal = int(val('principal_amount', 0) or 0)
    interest = int(val('interest_amount', 0) or 0)
    item_desc = val('items') or itext[:300] or ''
    payload = {
        'customer': {
            'name': val('name') or '',
            'address': val('address') or '',
            'phone': val('phone') or '',
        },
        'contract': {
            'contract_date': cd,
            'principal_amount': principal,
            'interest_amount': interest,
            'next_interest_due_date': main.add_month(cd) if cd else '',
            'forfeiture_due_date': fd,
        },
        'item': {
            'category': item_desc[:80],
            'brand': '',
            'description': itext[:300] or item_desc,
        },
    }

    did = uuid.uuid4().hex
    ip = main.save(ir, 'item', item_image.filename)
    tpath = main.save(tr, 'ticket', ticket_image.filename)
    with main.db() as c:
        c.execute(
            'INSERT INTO drafts(id,payload,item_path,ticket_path)VALUES(?,?,?,?)',
            (did, json.dumps(payload, ensure_ascii=False), ip, tpath)
        )
        main.audit(c, a['name'], a['role'], 'INTAKE_EXTRACTED_V4', 'draft', did, {
            'pipeline': ticket.get('engine'),
            'pipeline_version': ticket.get('pipeline_version'),
            'field_accuracy': ticket.get('field_accuracy'),
            'needs_review': ticket.get('needs_review'),
            'document_detected': ticket.get('document_detected'),
            'external_ai': False,
        })

    return {
        'draft_id': did,
        'extracted': payload,
        'vision': {
            'engine': ticket.get('engine'),
            'pipeline_version': ticket.get('pipeline_version'),
            'avg_confidence': ticket.get('field_accuracy'),
            'field_accuracy': ticket.get('field_accuracy'),
            'needs_review': ticket.get('needs_review'),
            'document_detected': ticket.get('document_detected'),
            'fields': f,
            'suggestions': ticket.get('suggestions', {}),
            'money_cells': ticket.get('money_cells', {}),
            'license_diagnostic': _safe_license_diag(ticket.get('license_diagnostic')),
            'item_confidence': round(float(iconf or 0), 3),
            'item_engine': iengine,
            'privacy': '免許証原画像は保存しません。OCRはサーバー内で処理します。',
            'external_ai': False,
        }
    }

def confirm_v4(b, a):
    customer = b.customer or {}
    co = b.contract or {}
    if not str(customer.get('name', '')).strip():
        raise HTTPException(422, '氏名を確認してください')
    cd = _iso_date(co.get('contract_date'), '質入年月日')
    fd = _iso_date(co.get('forfeiture_due_date'), '流質年月日')
    if fd <= cd:
        raise HTTPException(422, '流質年月日は質入年月日より後の日付にしてください')
    if (fd-cd).days > 180:
        raise HTTPException(422, '流質年月日が質入年月日から180日を超えています。確認してください')
    try:
        principal = int(co.get('principal_amount') or 0)
        interest = int(co.get('interest_amount') or 0)
    except Exception:
        raise HTTPException(422, '契約金額・利息を数値で確認してください')
    if principal <= 0 or principal > 100_000_000:
        raise HTTPException(422, '契約金額を確認してください')
    if interest < 0 or interest >= principal:
        raise HTTPException(422, '利息を確認してください')
    if interest and interest/principal > .25:
        raise HTTPException(422, '利息率が高いため、利息を再確認してください')
    co['contract_date'] = cd.isoformat()
    co['forfeiture_due_date'] = fd.isoformat()
    if not co.get('next_interest_due_date'):
        co['next_interest_due_date'] = main.add_month(cd.isoformat())
    else:
        _iso_date(co.get('next_interest_due_date'), '次回利息期限')
    return main.confirm(b, a)

def health_v4():
    x = main.health()
    x.update({
        'version': APP_VERSION,
        'pipeline_version': tp.PIPELINE_VERSION,
        'ocr': 'PaddleOCR Japanese + Tesseract fallback / structured ticket OCR',
        'runtime': tp.runtime_status(),
        'external_ai': False,
    })
    return x

def vision_v4(a=Depends(main.auth)):
    r=tp.runtime_status()
    return {
        'ready': bool(r.get('opencv') and r.get('tesseract_jpn') and r.get('paddle_import')),
        'engine': 'OpenCV + PaddleOCR Japanese + Tesseract',
        'pipeline_version': tp.PIPELINE_VERSION,
        'runtime': r,
        'external_ai': False,
    }

# Swap POC endpoints without changing the legacy persistence/business layer.
for route in main.app.routes:
    path=getattr(route,'path',None)
    methods=getattr(route,'methods',set())
    if path == '/api/intake/extract' and 'POST' in methods:
        route.endpoint=extract_v4; route.dependant.call=extract_v4
    elif path == '/api/intake/confirm' and 'POST' in methods:
        route.endpoint=confirm_v4; route.dependant.call=confirm_v4
    elif path == '/api/health' and 'GET' in methods:
        route.endpoint=health_v4; route.dependant.call=health_v4
    elif path == '/api/vision/status' and 'GET' in methods:
        route.endpoint=vision_v4; route.dependant.call=vision_v4

# Security/privacy headers for an authenticated POC containing personal information.
@main.app.middleware('http')
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
    return response

# POC copy/UI. Keep inline JS/CSS intact while making the workflow explicit.
main.HTML = main.HTML.replace('OSS読取', '質札専用読取')
main.HTML = main.HTML.replace('項目OCR確信度 ', '業務項目認識品質 ').replace('確信度 ', '業務項目認識品質 ')
main.HTML = main.HTML.replace(
    '<div class="u"><input id="li" type="file" accept="image/*"><input id="it" type="file" accept="image/*"><input id="ti" type="file" accept="image/*"></div>',
    '<div class="u"><label><b>① 運転免許証</b><small> OCR後、原画像は保存しません</small><input id="li" type="file" accept="image/jpeg,image/png,image/webp"></label><label><b>② 質入品</b><input id="it" type="file" accept="image/jpeg,image/png,image/webp"></label><label><b>③ 質札</b><small> 正面から全体が入るよう撮影</small><input id="ti" type="file" accept="image/jpeg,image/png,image/webp"></label></div>'
)

if __name__ == '__main__':
    uvicorn.run(main.app, host='0.0.0.0', port=int(os.environ.get('PORT','8000')), proxy_headers=True)
