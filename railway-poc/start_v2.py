import os, json, uuid
import uvicorn
from fastapi import UploadFile, File, Depends, HTTPException
import main
import ticket_pipeline as tp

async def extract_v2(
    license_image:UploadFile=File(...),
    item_image:UploadFile=File(...),
    ticket_image:UploadFile=File(...),
    a=Depends(main.auth)
):
    lr,ir,tr=await main.read(license_image),await main.read(item_image),await main.read(ticket_image)
    ticket=tp.recognize_ticket(tr)
    try:ltext,lconf=tp.generic(lr)
    except Exception:ltext,lconf='',0
    try:itext,iconf=tp.generic(ir)
    except Exception:itext,iconf='',0
    f=ticket['fields']
    def val(k,default=''):return f.get(k,{}).get('value',default)
    name=val('name') or main.after(ltext.splitlines(),'氏名')
    address=val('address') or main.after(ltext.splitlines(),'住所')
    phone=val('phone') or main.phone(ltext)
    item_desc=val('items') or itext[:300] or '画像確認'
    cd=val('contract_date');fd=val('forfeiture_due_date')
    principal=val('principal_amount',0) or 0;interest=val('interest_amount',0) or 0
    payload={'customer':{'name':name,'address':address,'phone':phone},
             'contract':{'contract_date':cd,'principal_amount':principal,'interest_amount':interest,
                         'next_interest_due_date':main.add_month(cd) if cd else '',
                         'forfeiture_due_date':fd},
             'item':{'category':item_desc[:80],'brand':'','description':item_desc}}
    did=uuid.uuid4().hex
    ip=main.save(ir,'item',item_image.filename);tpath=main.save(tr,'ticket',ticket_image.filename)
    with main.db() as c:
        c.execute('INSERT INTO drafts(id,payload,item_path,ticket_path)VALUES(?,?,?,?)',
                  (did,json.dumps(payload,ensure_ascii=False),ip,tpath))
        main.audit(c,a['name'],a['role'],'INTAKE_EXTRACTED_V2','draft',did,
                   {'pipeline':ticket['engine'],'field_accuracy':ticket['field_accuracy'],
                    'avg_confidence':ticket['avg_confidence'],'needs_review':ticket['needs_review']})
    return {'draft_id':did,'extracted':payload,
            'vision':{'engine':ticket['engine'],'avg_confidence':ticket['avg_confidence'],
                      'field_accuracy':ticket['field_accuracy'],'needs_review':ticket['needs_review'],
                      'document_detected':ticket['document_detected'],'fields':f,
                      'suggestions':ticket['suggestions'],'license_confidence':round(lconf,3),
                      'item_confidence':round(iconf,3),'privacy':'免許証原画像は保存しません',
                      'external_ai':False}}

def confirm_v2(b,a):
    co=b.contract
    if not str(b.customer.get('name','')).strip():raise HTTPException(422,'氏名を確認してください')
    if not co.get('contract_date'):raise HTTPException(422,'質入年月日を確認してください')
    if not co.get('forfeiture_due_date'):raise HTTPException(422,'流質年月日を確認してください')
    if int(co.get('principal_amount') or 0)<=0:raise HTTPException(422,'契約金額を確認してください')
    if not co.get('next_interest_due_date'):co['next_interest_due_date']=main.add_month(co['contract_date'])
    return main.confirm(b,a)

for route in main.app.routes:
    if getattr(route,'path',None)=='/api/intake/extract' and 'POST' in getattr(route,'methods',set()):
        route.endpoint=extract_v2;route.dependant.call=extract_v2
    if getattr(route,'path',None)=='/api/intake/confirm' and 'POST' in getattr(route,'methods',set()):
        route.endpoint=confirm_v2;route.dependant.call=confirm_v2

main.HTML=main.HTML.replace('OSS読取','質札専用読取').replace('確信度 ','項目OCR確信度 ')

if __name__=='__main__':
    uvicorn.run(main.app,host='0.0.0.0',port=int(os.environ.get('PORT','8000')))
