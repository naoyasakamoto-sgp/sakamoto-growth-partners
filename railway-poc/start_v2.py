import os, json, uuid
from datetime import date, timedelta
import uvicorn
from fastapi import UploadFile, File, Depends, HTTPException, Request
from pydantic import BaseModel, Field
import main
import ticket_pipeline as tp

APP_VERSION = '1.3.0-poc'
ALLOWED_IMAGE_TYPES = {'image/jpeg','image/png','image/webp','application/octet-stream'}
MAX_ITEM_FILES = 12
MAX_TICKET_FILES = 6
MAX_TOTAL_UPLOAD_BYTES = 48 * 1024 * 1024

MULTI_SCHEMA = '''
CREATE TABLE IF NOT EXISTS draft_files(
    id INTEGER PRIMARY KEY,
    draft_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    image_path TEXT NOT NULL,
    source_filename TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(draft_id,kind,ordinal)
);
CREATE INDEX IF NOT EXISTS idx_draft_files_draft ON draft_files(draft_id,kind,ordinal);
CREATE TABLE IF NOT EXISTS contract_documents(
    id INTEGER PRIMARY KEY,
    contract_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    image_path TEXT NOT NULL,
    source_filename TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(contract_id,kind,ordinal)
);
CREATE INDEX IF NOT EXISTS idx_contract_documents_contract ON contract_documents(contract_id,kind,ordinal);
'''

def _ensure_multi_schema():
    with main.db() as c:
        c.executescript(MULTI_SCHEMA)

@main.app.on_event('startup')
def _startup_multi_schema():
    _ensure_multi_schema()

def _qcons_multi(c):
    return c.execute('''
        SELECT
            ct.*,
            cu.name customer_name,
            cu.name_kana,
            cu.address,
            cu.phone,
            GROUP_CONCAT(NULLIF(pi.category,''), ' / ') category,
            GROUP_CONCAT(NULLIF(pi.brand,''), ' / ') brand,
            GROUP_CONCAT(NULLIF(pi.description,''), ' / ') description,
            COUNT(pi.id) item_count
        FROM contracts ct
        JOIN customers cu ON cu.id=ct.customer_id
        LEFT JOIN pawn_items pi ON pi.contract_id=ct.id
        GROUP BY ct.id
        ORDER BY ct.id DESC
    ''').fetchall()

main.qcons = _qcons_multi

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

async def _read_many(files, label, max_count):
    xs=[f for f in (files or []) if f is not None]
    if not xs:
        raise HTTPException(422, f'{label}を1枚以上選択してください')
    if len(xs) > max_count:
        raise HTTPException(413, f'{label}は最大{max_count}枚までです')
    out=[]
    total=0
    for i,f in enumerate(xs,1):
        raw=await _read_image(f, f'{label}{i}')
        total += len(raw)
        out.append((f,raw))
    return out,total

def _safe_license_diag(d):
    if not isinstance(d,dict):
        return None
    return {k:d.get(k) for k in ('name','address','confidence','engine') if k in d}

def _iso_date(v, label):
    try:
        return date.fromisoformat(str(v or '')[:10])
    except Exception:
        raise HTTPException(422, f'{label}をYYYY-MM-DDで確認してください')

def _field_rank(field):
    if not isinstance(field,dict):
        return (-1,-1.0,0)
    status_rank={'ok':3,'review':2,'invalid':1}.get(field.get('status'),0)
    conf=float(field.get('confidence') or 0)
    value=field.get('value')
    return (status_rank,conf,1 if value not in ('',None,0) else 0)

def _merge_ticket_results(results):
    if not results:
        raise HTTPException(422,'質札を認識できませんでした')
    best_index=max(range(len(results)),key=lambda i:float(results[i].get('field_accuracy') or 0))
    best=results[best_index]
    keys=set()
    for r in results:
        keys.update((r.get('fields') or {}).keys())
    merged_fields={}
    for key in keys:
        candidates=[]
        for i,r in enumerate(results):
            field=(r.get('fields') or {}).get(key)
            if isinstance(field,dict):
                candidates.append((i,field))
        if not candidates:
            continue
        i,chosen=max(candidates,key=lambda z:_field_rank(z[1]))
        merged_fields[key]=dict(chosen)
        merged_fields[key]['source_ticket_index']=i

    item_values=[]
    for r in results:
        v=((r.get('fields') or {}).get('items') or {}).get('value')
        if v and v not in item_values:
            item_values.append(v)
    if item_values:
        cur=dict(merged_fields.get('items') or {})
        cur['value']=' / '.join(item_values)[:500]
        cur['status']=cur.get('status') or 'review'
        merged_fields['items']=cur

    cd=((merged_fields.get('contract_date') or {}).get('value') or '')
    fd=((merged_fields.get('forfeiture_due_date') or {}).get('value') or '')
    suggestions=dict(best.get('suggestions') or {})
    if cd and not fd:
        try:
            suggestions['forfeiture_due_date']=(date.fromisoformat(cd)+timedelta(days=90)).isoformat()
        except Exception:
            pass

    required=['contract_date','forfeiture_due_date','principal_amount','interest_amount','name','phone','items']
    ok_count=sum((merged_fields.get(k) or {}).get('status')=='ok' for k in required)
    review_count=sum((merged_fields.get(k) or {}).get('status')=='review' for k in required)
    quality=round((ok_count+.45*review_count)/len(required),3)
    diags=[_safe_license_diag(r.get('license_diagnostic')) for r in results]
    diags=[d for d in diags if d]
    diag=max(diags,key=lambda x:float(x.get('confidence') or 0),default=None)
    return {
        'fields':merged_fields,
        'field_accuracy':quality,
        'needs_review':any((merged_fields.get(k) or {}).get('status')!='ok' for k in required),
        'document_detected':any(bool(r.get('document_detected')) for r in results),
        'suggestions':suggestions,
        'money_cells':best.get('money_cells',{}),
        'license_diagnostic':diag,
        'engine':'Multi-ticket fusion / OpenCV + PaddleOCR Japanese + Tesseract',
        'pipeline_version':tp.PIPELINE_VERSION,
        'primary_ticket_index':best_index,
    }

class ConfirmMulti(BaseModel):
    draft_id: str
    customer: dict
    contract: dict
    item: dict = Field(default_factory=dict)
    items: list[dict] = Field(default_factory=list)

async def extract_v5(
    license_image: UploadFile = File(...),
    item_images: list[UploadFile] | None = File(None),
    ticket_images: list[UploadFile] | None = File(None),
    item_image: UploadFile | None = File(None),
    ticket_image: UploadFile | None = File(None),
    a = Depends(main.auth),
):
    item_files=list(item_images or [])
    ticket_files=list(ticket_images or [])
    if item_image is not None:
        item_files.append(item_image)
    if ticket_image is not None:
        ticket_files.append(ticket_image)

    lr=await _read_image(license_image,'運転免許証')
    item_pairs,item_bytes=await _read_many(item_files,'質入品',MAX_ITEM_FILES)
    ticket_pairs,ticket_bytes=await _read_many(ticket_files,'質札',MAX_TICKET_FILES)
    if len(lr)+item_bytes+ticket_bytes > MAX_TOTAL_UPLOAD_BYTES:
        raise HTTPException(413,'1回の受付は合計48MB以下にしてください')

    ticket_results=[]
    ticket_errors=[]
    for i,(_,raw) in enumerate(ticket_pairs):
        try:
            ticket_results.append(tp.recognize_ticket(raw,lr))
        except Exception as e:
            ticket_errors.append({'index':i,'error':type(e).__name__})
    if not ticket_results:
        raise HTTPException(422,'質札の認識に失敗しました。画像を確認してください')
    ticket=_merge_ticket_results(ticket_results)

    item_results=[]
    for i,(_,raw) in enumerate(item_pairs):
        try:
            text,conf,engine=tp.generic_image_text(raw)
        except Exception:
            text,conf,engine='',0.0,'none'
        item_results.append({
            'category':'',
            'brand':'',
            'description':(text or '画像確認')[:300],
            'source_image_index':i,
            'ocr_confidence':round(float(conf or 0),3),
            'ocr_engine':engine,
        })

    f=ticket.get('fields',{})
    def val(k,default=''):
        return (f.get(k) or {}).get('value',default)

    cd=val('contract_date') or ''
    fd=val('forfeiture_due_date') or ticket.get('suggestions',{}).get('forfeiture_due_date','')
    principal=int(val('principal_amount',0) or 0)
    interest=int(val('interest_amount',0) or 0)
    ticket_item_text=val('items') or ''
    if len(item_results)==1 and ticket_item_text:
        item_results[0]['category']=ticket_item_text[:80]
        if item_results[0]['description']=='画像確認':
            item_results[0]['description']=ticket_item_text[:300]

    payload={
        'customer':{
            'name':val('name') or '',
            'address':val('address') or '',
            'phone':val('phone') or '',
        },
        'contract':{
            'contract_date':cd,
            'principal_amount':principal,
            'interest_amount':interest,
            'next_interest_due_date':main.add_month(cd) if cd else '',
            'forfeiture_due_date':fd,
        },
        'items':item_results,
        'item':item_results[0] if item_results else {},
        'documents':{
            'item_count':len(item_pairs),
            'ticket_count':len(ticket_pairs),
        },
    }

    did=uuid.uuid4().hex
    item_paths=[main.save(raw,'item',fobj.filename) for fobj,raw in item_pairs]
    ticket_paths=[main.save(raw,'ticket',fobj.filename) for fobj,raw in ticket_pairs]
    _ensure_multi_schema()
    with main.db() as c:
        c.execute(
            'INSERT INTO drafts(id,payload,item_path,ticket_path)VALUES(?,?,?,?)',
            (did,json.dumps(payload,ensure_ascii=False),item_paths[0],ticket_paths[0])
        )
        for i,((fobj,_),path) in enumerate(zip(item_pairs,item_paths)):
            c.execute(
                'INSERT INTO draft_files(draft_id,kind,ordinal,image_path,source_filename)VALUES(?,?,?,?,?)',
                (did,'ITEM',i,path,fobj.filename)
            )
        for i,((fobj,_),path) in enumerate(zip(ticket_pairs,ticket_paths)):
            c.execute(
                'INSERT INTO draft_files(draft_id,kind,ordinal,image_path,source_filename)VALUES(?,?,?,?,?)',
                (did,'TICKET',i,path,fobj.filename)
            )
        main.audit(c,a['name'],a['role'],'INTAKE_EXTRACTED_V5_MULTI','draft',did,{
            'pipeline':ticket.get('engine'),
            'pipeline_version':ticket.get('pipeline_version'),
            'field_accuracy':ticket.get('field_accuracy'),
            'needs_review':ticket.get('needs_review'),
            'document_detected':ticket.get('document_detected'),
            'item_count':len(item_pairs),
            'ticket_count':len(ticket_pairs),
            'ticket_errors':ticket_errors,
            'external_ai':False,
        })

    return {
        'draft_id':did,
        'extracted':payload,
        'vision':{
            'engine':ticket.get('engine'),
            'pipeline_version':ticket.get('pipeline_version'),
            'avg_confidence':ticket.get('field_accuracy'),
            'field_accuracy':ticket.get('field_accuracy'),
            'needs_review':ticket.get('needs_review'),
            'document_detected':ticket.get('document_detected'),
            'fields':f,
            'suggestions':ticket.get('suggestions',{}),
            'money_cells':ticket.get('money_cells',{}),
            'license_diagnostic':ticket.get('license_diagnostic'),
            'primary_ticket_index':ticket.get('primary_ticket_index'),
            'ticket_results':[{
                'index':i,
                'field_accuracy':r.get('field_accuracy'),
                'needs_review':r.get('needs_review'),
                'document_detected':r.get('document_detected'),
            } for i,r in enumerate(ticket_results)],
            'ticket_errors':ticket_errors,
            'item_results':[{
                'index':i,
                'confidence':x.get('ocr_confidence'),
                'engine':x.get('ocr_engine'),
            } for i,x in enumerate(item_results)],
            'item_count':len(item_pairs),
            'ticket_count':len(ticket_pairs),
            'privacy':'免許証原画像は保存しません。質入品・質札は契約証跡として保存します。',
            'external_ai':False,
        }
    }

def confirm_v5(b: ConfirmMulti, a=Depends(main.auth)):
    customer=b.customer or {}
    co=b.contract or {}
    if not str(customer.get('name','')).strip():
        raise HTTPException(422,'氏名を確認してください')
    cd=_iso_date(co.get('contract_date'),'質入年月日')
    fd=_iso_date(co.get('forfeiture_due_date'),'流質年月日')
    if fd <= cd:
        raise HTTPException(422,'流質年月日は質入年月日より後の日付にしてください')
    if (fd-cd).days > 180:
        raise HTTPException(422,'流質年月日が質入年月日から180日を超えています。確認してください')
    try:
        principal=int(co.get('principal_amount') or 0)
        interest=int(co.get('interest_amount') or 0)
    except Exception:
        raise HTTPException(422,'契約金額・利息を数値で確認してください')
    if principal <= 0 or principal > 100_000_000:
        raise HTTPException(422,'契約金額を確認してください')
    if interest < 0 or interest >= principal:
        raise HTTPException(422,'利息を確認してください')
    if interest and interest/principal > .25:
        raise HTTPException(422,'利息率が高いため、利息を再確認してください')
    co['contract_date']=cd.isoformat()
    co['forfeiture_due_date']=fd.isoformat()
    if not co.get('next_interest_due_date'):
        co['next_interest_due_date']=main.add_month(cd.isoformat())
    else:
        _iso_date(co.get('next_interest_due_date'),'次回利息期限')

    items=list(b.items or [])
    if not items and b.item:
        items=[b.item]
    if not items:
        raise HTTPException(422,'質入品を1点以上確認してください')
    if len(items) > MAX_ITEM_FILES:
        raise HTTPException(422,f'質入品は最大{MAX_ITEM_FILES}点までです')

    _ensure_multi_schema()
    with main.db() as c:
        d=c.execute('SELECT * FROM drafts WHERE id=?',(b.draft_id,)).fetchone()
        if not d:
            raise HTTPException(404,'下書きなし')
        files=c.execute(
            'SELECT * FROM draft_files WHERE draft_id=? ORDER BY kind,ordinal',
            (b.draft_id,)
        ).fetchall()
        item_files=[x for x in files if x['kind']=='ITEM']
        ticket_files=[x for x in files if x['kind']=='TICKET']
        if not item_files and d['item_path']:
            item_files=[{'image_path':d['item_path'],'source_filename':None,'ordinal':0,'kind':'ITEM'}]
        if not ticket_files and d['ticket_path']:
            ticket_files=[{'image_path':d['ticket_path'],'source_filename':None,'ordinal':0,'kind':'TICKET'}]

        cid=c.execute(
            'INSERT INTO customers(name,address,phone)VALUES(?,?,?)',
            (customer.get('name'),customer.get('address'),customer.get('phone'))
        ).lastrowid
        n=c.execute('SELECT COUNT(*) n FROM contracts').fetchone()['n']+1
        no=f'P{date.today():%y%m}-{n:04d}'
        con=c.execute(
            '''INSERT INTO contracts(
                contract_no,customer_id,contract_date,principal_amount,interest_amount,
                next_interest_due_date,forfeiture_due_date,status
            )VALUES(?,?,?,?,?,?,?,?)''',
            (
                no,cid,co['contract_date'],principal,interest,
                co.get('next_interest_due_date') or main.add_month(co['contract_date']),
                co['forfeiture_due_date'],'ACTIVE'
            )
        ).lastrowid

        for i,item in enumerate(items):
            path=item_files[i]['image_path'] if i < len(item_files) else None
            c.execute(
                'INSERT INTO pawn_items(contract_id,category,brand,description,image_path)VALUES(?,?,?,?,?)',
                (
                    con,
                    str(item.get('category') or '').strip(),
                    str(item.get('brand') or '').strip(),
                    str(item.get('description') or '').strip(),
                    path,
                )
            )
        for row in item_files:
            c.execute(
                'INSERT OR IGNORE INTO contract_documents(contract_id,kind,ordinal,image_path,source_filename)VALUES(?,?,?,?,?)',
                (con,'ITEM',row['ordinal'],row['image_path'],row['source_filename'])
            )
        for row in ticket_files:
            c.execute(
                'INSERT OR IGNORE INTO contract_documents(contract_id,kind,ordinal,image_path,source_filename)VALUES(?,?,?,?,?)',
                (con,'TICKET',row['ordinal'],row['image_path'],row['source_filename'])
            )
        main.audit(c,a['name'],a['role'],'CONTRACT_CREATED_MULTI','contract',con,{
            'contract_no':no,
            'item_count':len(items),
            'item_image_count':len(item_files),
            'ticket_count':len(ticket_files),
        })
    return {
        'ok':True,
        'contract_no':no,
        'contract_id':con,
        'item_count':len(items),
        'item_image_count':len(item_files),
        'ticket_count':len(ticket_files),
    }

def health_v5():
    x=main.health()
    x.update({
        'version':APP_VERSION,
        'pipeline_version':tp.PIPELINE_VERSION,
        'ocr':'PaddleOCR Japanese + Tesseract fallback / multi-ticket fusion',
        'runtime':tp.runtime_status(),
        'multi_upload':{
            'items':True,
            'tickets':True,
            'max_items':MAX_ITEM_FILES,
            'max_tickets':MAX_TICKET_FILES,
            'max_total_mb':MAX_TOTAL_UPLOAD_BYTES//1024//1024,
        },
        'external_ai':False,
    })
    return x

def vision_v5(a=Depends(main.auth)):
    r=tp.runtime_status()
    return {
        'ready':bool(r.get('opencv') and r.get('tesseract_jpn') and r.get('paddle_import')),
        'engine':'OpenCV + PaddleOCR Japanese + Tesseract / multi-ticket fusion',
        'pipeline_version':tp.PIPELINE_VERSION,
        'runtime':r,
        'multi_upload':{'items':True,'tickets':True},
        'external_ai':False,
    }

def _replace_api_route(path, method, endpoint):
    main.app.router.routes=[
        r for r in main.app.router.routes
        if not (getattr(r,'path',None)==path and method in getattr(r,'methods',set()))
    ]
    main.app.add_api_route(path,endpoint,methods=[method])

_replace_api_route('/api/intake/extract','POST',extract_v5)
_replace_api_route('/api/intake/confirm','POST',confirm_v5)
_replace_api_route('/api/health','GET',health_v5)
_replace_api_route('/api/vision/status','GET',vision_v5)

@main.app.middleware('http')
async def security_headers(request: Request, call_next):
    response=await call_next(request)
    response.headers['Cache-Control']='no-store, max-age=0'
    response.headers['Pragma']='no-cache'
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['X-Frame-Options']='DENY'
    response.headers['Referrer-Policy']='no-referrer'
    response.headers['Permissions-Policy']='camera=(), microphone=(), geolocation=()'
    return response

main.HTML=main.HTML.replace('OSS読取','質札専用読取')
main.HTML=main.HTML.replace('3画像受付','複数画像受付')
main.HTML=main.HTML.replace(
    '<div class="u"><input id="li" type="file" accept="image/*"><input id="it" type="file" accept="image/*"><input id="ti" type="file" accept="image/*"></div>',
    '<div class="u"><label><b>① 運転免許証</b><small> 1枚・OCR後に原画像破棄</small><input id="li" type="file" accept="image/jpeg,image/png,image/webp" onchange="filesChanged()"></label><label><b>② 質入品</b><small> 複数可（最大12点）</small><input id="it" type="file" multiple accept="image/jpeg,image/png,image/webp" onchange="filesChanged()"></label><label><b>③ 質札</b><small> 複数可（最大6枚）</small><input id="ti" type="file" multiple accept="image/jpeg,image/png,image/webp" onchange="filesChanged()"></label></div><div id="fc" class="filecount">免許証1枚＋質入品1点以上＋質札1枚以上を選択</div>'
)
main.HTML=main.HTML.replace(
    '</style>',
    '.filecount{font-size:13px;color:#51687f;margin:8px 0}.itemreview{border:1px solid #dfe6ee;border-radius:10px;padding:10px;margin:8px 0;background:#fafbfd}.itemreview textarea{width:100%;min-height:64px;padding:8px;box-sizing:border-box}.itemreview input{box-sizing:border-box}.multiinfo{padding:8px;background:#eef5fb;border-radius:8px;margin:8px 0}</style>'
)

_ui_start=main.HTML.find('async function ex(){')
_ui_end=main.HTML.find('async function demo(){')
if _ui_start >= 0 and _ui_end > _ui_start:
    _multi_js=r'''function esc(v){return String(v??'').replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[s]))}
function filesChanged(){let a=li.files.length?1:0,b=it.files.length,c=ti.files.length;$('fc').textContent=`選択中：免許証 ${a}枚｜質入品 ${b}点｜質札 ${c}枚`}
async function ex(){
    let items=Array.from(it.files),tickets=Array.from(ti.files);
    if(!li.files[0]||!items.length||!tickets.length)return alert('免許証1枚・質入品1点以上・質札1枚以上を選択してください');
    if(items.length>12)return alert('質入品は最大12点までです');
    if(tickets.length>6)return alert('質札は最大6枚までです');
    let f=new FormData();
    f.append('license_image',li.files[0]);
    items.forEach(z=>f.append('item_images',z));
    tickets.forEach(z=>f.append('ticket_images',z));
    $('rv').innerHTML='<p>複数画像を統合認識中です…</p>';
    try{dr=await api('/api/intake/extract',{method:'POST',body:f})}catch(e){$('rv').innerHTML='';alert(e.message);return}
    let x=dr.extracted,its=x.items||[x.item||{}],q=Number(dr.vision.field_accuracy||0);
    $('rv').innerHTML=`<div class="multiinfo">統合認識品質 ${(q*100).toFixed(0)}%（店長確認）｜質入品 ${dr.vision.item_count||its.length}点｜質札 ${dr.vision.ticket_count||tickets.length}枚</div>
    <div class=fields>
      <input id=nm value="${esc(x.customer.name||'')}" placeholder="氏名">
      <input id=ad value="${esc(x.customer.address||'')}" placeholder="住所">
      <input id=ph value="${esc(x.customer.phone||'')}" placeholder="電話">
      <input id=cd value="${esc(x.contract.contract_date||'')}" placeholder="質入年月日">
      <input id=pr value="${esc(x.contract.principal_amount||0)}" placeholder="元金">
      <input id=ii value="${esc(x.contract.interest_amount||0)}" placeholder="利息">
      <input id=fd value="${esc(x.contract.forfeiture_due_date||'')}" placeholder="流質年月日">
    </div>
    <h4>質入品（1画像＝1品）</h4>
    ${its.map((v,i)=>`<div class="itemreview"><b>質入品 ${i+1}</b><div class=fields><input id="cat_${i}" value="${esc(v.category||'')}" placeholder="品目"><input id="br_${i}" value="${esc(v.brand||'')}" placeholder="ブランド"></div><textarea id="desc_${i}" placeholder="説明">${esc(v.description||'')}</textarea></div>`).join('')}
    <button class=p onclick="cn()">確認して登録</button>`;
}
async function cn(){
    if(!dr)return;
    let x=dr.extracted,src=x.items||[x.item||{}];
    let its=src.map((v,i)=>({...v,category:$('cat_'+i).value,brand:$('br_'+i).value,description:$('desc_'+i).value}));
    let b={
      draft_id:dr.draft_id,
      customer:{...x.customer,name:nm.value,address:ad.value,phone:ph.value},
      contract:{...x.contract,contract_date:cd.value,principal_amount:+pr.value,interest_amount:+ii.value,forfeiture_due_date:fd.value},
      items:its,
      item:its[0]||{}
    };
    try{
      let r=await api('/api/intake/confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
      alert(`${r.contract_no} を登録しました（質入品${r.item_count}点・質札${r.ticket_count}枚）`);
      $('rv').innerHTML='';li.value='';it.value='';ti.value='';filesChanged();ref();
    }catch(e){alert(e.message)}
}
'''
    main.HTML=main.HTML[:_ui_start]+_multi_js+main.HTML[_ui_end:]

main.HTML=main.HTML.replace('項目OCR確信度 ','業務項目認識品質 ').replace('確信度 ','業務項目認識品質 ')

if __name__ == '__main__':
    uvicorn.run(main.app,host='0.0.0.0',port=int(os.environ.get('PORT','8000')),proxy_headers=True)
