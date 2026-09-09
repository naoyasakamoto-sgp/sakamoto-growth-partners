import os, json, uuid
import uvicorn
from fastapi import UploadFile, File, Depends, HTTPException
import main
import ticket_pipeline as tp

async def extract_v3(
    license_image: UploadFile = File(...),
    item_image: UploadFile = File(...),
    ticket_image: UploadFile = File(...),
    a = Depends(main.auth),
):
    lr, ir, tr = await main.read(license_image), await main.read(item_image), await main.read(ticket_image)
    ticket = tp.recognize_ticket(tr, lr)
    try:
        itext, iconf, iengine = tp.generic_image_text(ir)
    except Exception:
        itext, iconf, iengine = '', 0, 'none'
    f = ticket['fields']
    def val(k, default=''):
        return f.get(k, {}).get('value', default)
    cd = val('contract_date') or ''
    fd = val('forfeiture_due_date') or ticket.get('suggestions', {}).get('forfeiture_due_date', '')
    principal = int(val('principal_amount', 0) or 0)
    interest = int(val('interest_amount', 0) or 0)
    item_desc = val('items') or itext[:300] or ''
    payload = {
        'customer': {'name': val('name') or '', 'address': val('address') or '', 'phone': val('phone') or ''},
        'contract': {
            'contract_date': cd,
            'principal_amount': principal,
            'interest_amount': interest,
            'next_interest_due_date': main.add_month(cd) if cd else '',
            'forfeiture_due_date': fd,
        },
        'item': {'category': item_desc[:80], 'brand': '', 'description': itext[:300] or item_desc},
    }
    did = uuid.uuid4().hex
    ip = main.save(ir, 'item', item_image.filename)
    tpath = main.save(tr, 'ticket', ticket_image.filename)
    with main.db() as c:
        c.execute('INSERT INTO drafts(id,payload,item_path,ticket_path)VALUES(?,?,?,?)',
                  (did, json.dumps(payload, ensure_ascii=False), ip, tpath))
        main.audit(c, a['name'], a['role'], 'INTAKE_EXTRACTED_V3', 'draft', did,
                   {'pipeline': ticket['engine'], 'pipeline_version': ticket.get('pipeline_version'),
                    'field_accuracy': ticket['field_accuracy'], 'needs_review': ticket['needs_review']})
    return {
        'draft_id': did,
        'extracted': payload,
        'vision': {
            'engine': ticket['engine'],
            'pipeline_version': ticket.get('pipeline_version'),
            'avg_confidence': ticket['field_accuracy'],
            'field_accuracy': ticket['field_accuracy'],
            'needs_review': ticket['needs_review'],
            'document_detected': ticket['document_detected'],
            'fields': f,
            'suggestions': ticket.get('suggestions', {}),
            'license_diagnostic': ticket.get('license_diagnostic'),
            'item_confidence': round(iconf, 3),
            'item_engine': iengine,
            'privacy': '免許証原画像は保存しません',
            'external_ai': False,
        }
    }

def confirm_v3(b, a):
    co = b.contract
    if not str(b.customer.get('name', '')).strip(): raise HTTPException(422, '氏名を確認してください')
    if not co.get('contract_date'): raise HTTPException(422, '質入年月日を確認してください')
    if not co.get('forfeiture_due_date'): raise HTTPException(422, '流質年月日を確認してください')
    if int(co.get('principal_amount') or 0) <= 0: raise HTTPException(422, '契約金額を確認してください')
    if not co.get('next_interest_due_date'): co['next_interest_due_date'] = main.add_month(co['contract_date'])
    return main.confirm(b, a)

for route in main.app.routes:
    if getattr(route, 'path', None) == '/api/intake/extract' and 'POST' in getattr(route, 'methods', set()):
        route.endpoint = extract_v3; route.dependant.call = extract_v3
    if getattr(route, 'path', None) == '/api/intake/confirm' and 'POST' in getattr(route, 'methods', set()):
        route.endpoint = confirm_v3; route.dependant.call = confirm_v3
    if getattr(route, 'path', None) == '/api/health' and 'GET' in getattr(route, 'methods', set()):
        def health_v3():
            x = main.health(); x.update({'version':'1.1.0-poc','pipeline_version':tp.PIPELINE_VERSION,
                                         'ocr':'PaddleOCR優先 + Tesseract fallback','external_ai':False})
            return x
        route.endpoint = health_v3; route.dependant.call = health_v3

main.HTML = main.HTML.replace('OSS読取', '質札専用読取').replace('項目OCR確信度 ', '業務項目認識品質 ').replace('確信度 ', '業務項目認識品質 ')
main.HTML = main.HTML.replace(
    '<div class="u"><input id="li" type="file" accept="image/*"><input id="it" type="file" accept="image/*"><input id="ti" type="file" accept="image/*"></div>',
    '<div class="u"><label><b>① 運転免許証</b><input id="li" type="file" accept="image/*"></label><label><b>② 質入品</b><input id="it" type="file" accept="image/*"></label><label><b>③ 質札</b><input id="ti" type="file" accept="image/*"></label></div>'
)

if __name__ == '__main__':
    uvicorn.run(main.app, host='0.0.0.0', port=int(os.environ.get('PORT', '8000')))
