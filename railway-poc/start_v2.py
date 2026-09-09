import os, json, uuid, asyncio, gc, secrets
from datetime import date
import uvicorn
from fastapi import UploadFile, File, Depends, HTTPException, Request, Header
from pydantic import BaseModel, Field
import main
import ticket_pipeline as tp

APP_VERSION='2.0.0-poc'
MAX_ITEM_FILES=12
MAX_TICKET_FILES=6
MAX_TOTAL_UPLOAD_BYTES=32*1024*1024
OCR_LOCK=asyncio.Lock()

SCHEMA='''
CREATE TABLE IF NOT EXISTS draft_files(
 id INTEGER PRIMARY KEY,draft_id TEXT NOT NULL,kind TEXT NOT NULL,ordinal INTEGER NOT NULL,
 image_path TEXT NOT NULL,source_filename TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(draft_id,kind,ordinal));
CREATE INDEX IF NOT EXISTS idx_draft_files_draft ON draft_files(draft_id,kind,ordinal);
CREATE TABLE IF NOT EXISTS contract_documents(
 id INTEGER PRIMARY KEY,contract_id INTEGER NOT NULL,kind TEXT NOT NULL,ordinal INTEGER NOT NULL,
 image_path TEXT NOT NULL,source_filename TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(contract_id,kind,ordinal));
CREATE INDEX IF NOT EXISTS idx_contract_documents_contract ON contract_documents(contract_id,kind,ordinal);
'''

def ensure_schema():
    with main.db() as c:c.executescript(SCHEMA)

@main.app.on_event('startup')
def _startup():ensure_schema()

def _qcons(c):
    return c.execute('''SELECT ct.*,cu.name customer_name,cu.name_kana,cu.address,cu.phone,
      GROUP_CONCAT(NULLIF(pi.category,''),' / ') category,
      GROUP_CONCAT(NULLIF(pi.brand,''),' / ') brand,
      GROUP_CONCAT(NULLIF(pi.description,''),' / ') description,
      COUNT(pi.id) item_count
      FROM contracts ct JOIN customers cu ON cu.id=ct.customer_id
      LEFT JOIN pawn_items pi ON pi.contract_id=ct.id
      GROUP BY ct.id ORDER BY ct.id DESC''').fetchall()
main.qcons=_qcons

async def _read_one(f,label):
    if f is None:raise HTTPException(422,f'{label}を選択してください')
    raw=await main.read(f)
    if not raw:raise HTTPException(422,f'{label}が空です')
    try:
        im=tp._decode(raw,640); del im; gc.collect()
    except Exception:raise HTTPException(422,f'{label}を画像として読み取れません')
    return raw

async def _read_many(files,label,limit):
    xs=[x for x in (files or []) if x is not None]
    if not xs:raise HTTPException(422,f'{label}を1枚以上選択してください')
    if len(xs)>limit:raise HTTPException(413,f'{label}は最大{limit}枚です')
    out=[];total=0
    for i,f in enumerate(xs):
        raw=await _read_one(f,f'{label}{i+1}');total+=len(raw);out.append((f,raw))
    return out,total

def _val(fields,k,default=''):
    v=(fields.get(k) or {}).get('value',default)
    return v if v is not None else default

def _ticket_contract(r,ticket_index,item_indices):
    f=r.get('fields') or {}
    cd=_val(f,'contract_date','');fd=_val(f,'forfeiture_due_date','') or (r.get('suggestions') or {}).get('forfeiture_due_date','')
    item_lines=list(r.get('item_lines') or [])
    if not item_lines:
        v=_val(f,'items','')
        if v:item_lines=[x.strip() for x in str(v).split('/') if x.strip()]
    items=[{'category':x[:100],'brand':'','description':x[:300]} for x in item_lines] or [{'category':'','brand':'','description':'画像確認'}]
    return {'ticket_index':ticket_index,'item_image_indices':item_indices,
      'contract':{'contract_date':cd,'principal_amount':int(_val(f,'principal_amount',0) or 0),'interest_amount':int(_val(f,'interest_amount',0) or 0),'next_interest_due_date':main.add_month(cd) if cd else '','forfeiture_due_date':fd},
      'items':items,'quality':float(r.get('field_accuracy') or 0),'needs_review':bool(r.get('needs_review')),'fields':f,'money_cells':r.get('money_cells') or {}}

def _pairing(nt,ni):
    if nt==ni:return [[i] for i in range(nt)]
    if nt==1:return [list(range(ni))]
    return [[i] if i<ni else [] for i in range(nt)]

def _extract_core(lr,item_pairs,ticket_pairs,persist=True,actor=None):
    lic=tp.recognize_license(lr);results=[];errors=[]
    for i,(_,raw) in enumerate(ticket_pairs):
        try:results.append(tp.recognize_ticket(raw,lic))
        except Exception as e:errors.append({'index':i,'error':type(e).__name__});results.append({'fields':{},'field_accuracy':0,'needs_review':True,'item_lines':[],'money_cells':{}})
        gc.collect()
    pairs=_pairing(len(ticket_pairs),len(item_pairs));contracts=[_ticket_contract(r,i,pairs[i]) for i,r in enumerate(results)]
    phone=''
    for r in results:
        p=_val(r.get('fields') or {},'phone','')
        if p:phone=p;break
    payload={'customer':{'name':lic.get('name',''),'address':lic.get('address',''),'phone':phone},'contracts':contracts,'documents':{'item_count':len(item_pairs),'ticket_count':len(ticket_pairs)}}
    did=uuid.uuid4().hex
    if persist:
        item_paths=[main.save(raw,'item',f.filename) for f,raw in item_pairs];ticket_paths=[main.save(raw,'ticket',f.filename) for f,raw in ticket_pairs];ensure_schema()
        with main.db() as c:
            c.execute('INSERT INTO drafts(id,payload,item_path,ticket_path)VALUES(?,?,?,?)',(did,json.dumps(payload,ensure_ascii=False),item_paths[0],ticket_paths[0]))
            for i,((f,_),path) in enumerate(zip(item_pairs,item_paths)):c.execute('INSERT INTO draft_files(draft_id,kind,ordinal,image_path,source_filename)VALUES(?,?,?,?,?)',(did,'ITEM',i,path,f.filename))
            for i,((f,_),path) in enumerate(zip(ticket_pairs,ticket_paths)):c.execute('INSERT INTO draft_files(draft_id,kind,ordinal,image_path,source_filename)VALUES(?,?,?,?,?)',(did,'TICKET',i,path,f.filename))
            if actor:main.audit(c,actor['name'],actor['role'],'INTAKE_BATCH_EXTRACTED','draft',did,{'contracts':len(contracts),'items':len(item_pairs),'tickets':len(ticket_pairs),'pipeline':tp.PIPELINE_VERSION,'errors':errors})
    q=sum(c['quality'] for c in contracts)/max(1,len(contracts))
    return {'draft_id':did if persist else None,'extracted':payload,'vision':{'pipeline_version':tp.PIPELINE_VERSION,'field_accuracy':round(q,3),'needs_review':any(c['needs_review'] for c in contracts),'license':{k:lic.get(k) for k in ('name','address','confidence','engine','document_detected')},'ticket_errors':errors,'contract_count':len(contracts),'item_count':len(item_pairs),'ticket_count':len(ticket_pairs),'external_ai':False}}

async def extract_batch(license_image:UploadFile=File(...),item_images:list[UploadFile]|None=File(None),ticket_images:list[UploadFile]|None=File(None),a=Depends(main.auth)):
    lr=await _read_one(license_image,'運転免許証');items,ib=await _read_many(item_images,'質入品',MAX_ITEM_FILES);tickets,tb=await _read_many(ticket_images,'質札',MAX_TICKET_FILES)
    if len(lr)+ib+tb>MAX_TOTAL_UPLOAD_BYTES:raise HTTPException(413,'1回の受付は合計32MB以下にしてください')
    async with OCR_LOCK:
        try:return _extract_core(lr,items,tickets,True,a)
        finally:gc.collect()

class BatchConfirm(BaseModel):
    draft_id:str
    customer:dict
    contracts:list[dict]=Field(default_factory=list)

def _iso(v,label):
    try:return date.fromisoformat(str(v or '')[:10])
    except Exception:raise HTTPException(422,f'{label}をYYYY-MM-DDで確認してください')

def confirm_batch(b:BatchConfirm,a=Depends(main.auth)):
    if not b.contracts:raise HTTPException(422,'契約を1件以上確認してください')
    customer=b.customer or {}
    if not str(customer.get('name','')).strip():raise HTTPException(422,'氏名を確認してください')
    ensure_schema()
    with main.db() as c:
        d=c.execute('SELECT * FROM drafts WHERE id=?',(b.draft_id,)).fetchone()
        if not d:raise HTTPException(404,'下書きなし')
        files=c.execute('SELECT * FROM draft_files WHERE draft_id=? ORDER BY kind,ordinal',(b.draft_id,)).fetchall();item_files={int(x['ordinal']):x for x in files if x['kind']=='ITEM'};ticket_files={int(x['ordinal']):x for x in files if x['kind']=='TICKET'}
        cid=c.execute('INSERT INTO customers(name,address,phone)VALUES(?,?,?)',(customer.get('name'),customer.get('address'),customer.get('phone'))).lastrowid;created=[]
        for idx,entry in enumerate(b.contracts):
            co=entry.get('contract') or {};cd=_iso(co.get('contract_date'),f'契約{idx+1}の質入年月日');fd=_iso(co.get('forfeiture_due_date'),f'契約{idx+1}の流質年月日')
            if fd<=cd or (fd-cd).days>180:raise HTTPException(422,f'契約{idx+1}の流質年月日を確認してください')
            try:p=int(co.get('principal_amount') or 0);it=int(co.get('interest_amount') or 0)
            except Exception:raise HTTPException(422,f'契約{idx+1}の金額を確認してください')
            if p<=0 or p>100_000_000:raise HTTPException(422,f'契約{idx+1}の契約金額を確認してください')
            if it<=0 or it>=p or it/p>.25:raise HTTPException(422,f'契約{idx+1}の利息を確認してください')
            n=c.execute('SELECT COUNT(*) n FROM contracts').fetchone()['n']+1;no=f'P{date.today():%y%m}-{n:04d}';con=c.execute('INSERT INTO contracts(contract_no,customer_id,contract_date,principal_amount,interest_amount,next_interest_due_date,forfeiture_due_date,status)VALUES(?,?,?,?,?,?,?,?)',(no,cid,cd.isoformat(),p,it,co.get('next_interest_due_date') or main.add_month(cd.isoformat()),fd.isoformat(),'ACTIVE')).lastrowid
            ti=int(entry.get('ticket_index',idx));assigned=[int(x) for x in (entry.get('item_image_indices') or []) if str(x).isdigit()];items=entry.get('items') or [{'category':'','brand':'','description':'画像確認'}];first_path=item_files[assigned[0]]['image_path'] if assigned and assigned[0] in item_files else None
            for item in items:c.execute('INSERT INTO pawn_items(contract_id,category,brand,description,image_path)VALUES(?,?,?,?,?)',(con,str(item.get('category') or '').strip(),str(item.get('brand') or '').strip(),str(item.get('description') or '').strip(),first_path))
            if ti in ticket_files:
                x=ticket_files[ti];c.execute('INSERT OR IGNORE INTO contract_documents(contract_id,kind,ordinal,image_path,source_filename)VALUES(?,?,?,?,?)',(con,'TICKET',0,x['image_path'],x['source_filename']))
            for ord_,ii in enumerate(assigned):
                if ii in item_files:
                    x=item_files[ii];c.execute('INSERT OR IGNORE INTO contract_documents(contract_id,kind,ordinal,image_path,source_filename)VALUES(?,?,?,?,?)',(con,'ITEM',ord_,x['image_path'],x['source_filename']))
            main.audit(c,a['name'],a['role'],'CONTRACT_CREATED_BATCH','contract',con,{'contract_no':no,'ticket_index':ti,'item_image_indices':assigned});created.append({'contract_no':no,'contract_id':con})
    return {'ok':True,'contracts':created,'count':len(created)}

def health_v6():
    x=main.health();x.update({'version':APP_VERSION,'pipeline_version':tp.PIPELINE_VERSION,'ocr':'ticket ROI consensus; printed-license OCR; serialized inference','runtime':tp.runtime_status(),'batch_contracts':True,'max_items':MAX_ITEM_FILES,'max_tickets':MAX_TICKET_FILES,'external_ai':False});return x

def vision_v6(a=Depends(main.auth)):return {'ready':True,'runtime':tp.runtime_status(),'batch_contracts':True,'external_ai':False}

def replace(path,method,fn):
    main.app.router.routes=[r for r in main.app.router.routes if not(getattr(r,'path',None)==path and method in getattr(r,'methods',set()))];main.app.add_api_route(path,fn,methods=[method])
replace('/api/intake/extract','POST',extract_batch);replace('/api/intake/confirm','POST',confirm_batch);replace('/api/health','GET',health_v6);replace('/api/vision/status','GET',vision_v6)

@main.app.post('/api/e2e/intake')
async def e2e_intake(request:Request,license_image:UploadFile=File(...),item_images:list[UploadFile]|None=File(None),ticket_images:list[UploadFile]|None=File(None),x_e2e_token:str|None=Header(None)):
    token=os.getenv('E2E_TOKEN','')
    if not token or not x_e2e_token or not secrets.compare_digest(token,x_e2e_token):raise HTTPException(404,'not found')
    lr=await _read_one(license_image,'運転免許証');items,_=await _read_many(item_images,'質入品',MAX_ITEM_FILES);tickets,_=await _read_many(ticket_images,'質札',MAX_TICKET_FILES)
    async with OCR_LOCK:return _extract_core(lr,items,tickets,False,None)

@main.app.middleware('http')
async def headers(request:Request,call_next):
    r=await call_next(request);r.headers['Cache-Control']='no-store, max-age=0';r.headers['Pragma']='no-cache';r.headers['X-Content-Type-Options']='nosniff';r.headers['X-Frame-Options']='DENY';r.headers['Referrer-Policy']='no-referrer';return r

main.HTML=main.HTML.replace('3画像受付','複数契約一括受付').replace('OSS読取','質札専用読取')
old='<div class="u"><input id="li" type="file" accept="image/*"><input id="it" type="file" accept="image/*"><input id="ti" type="file" accept="image/*"></div><button class="p" onclick="ex()">質札専用読取</button>'
new='<div class="u"><label><b>①運転免許証</b><input id="li" type="file" accept="image/*"></label><label><b>②質入品写真（複数可）</b><input id="it" type="file" multiple accept="image/*"></label><label><b>③質札（1枚=1契約、複数可）</b><input id="ti" type="file" multiple accept="image/*"></label></div><button id="readbtn" class="p" onclick="ex()">質札専用読取</button>'
main.HTML=main.HTML.replace(old,new)
start=main.HTML.find('async function ex(){');end=main.HTML.find('async function demo(){')
if start>=0 and end>start:
    js=r'''function esc(v){return String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]))}
let reading=false;
async function ex(){
 if(reading)return;let items=Array.from(it.files),tickets=Array.from(ti.files);if(!li.files[0]||!items.length||!tickets.length)return alert('免許証1枚・質入品写真1枚以上・質札1枚以上を選択');
 reading=true;readbtn.disabled=true;readbtn.textContent='認識中…';let f=new FormData();f.append('license_image',li.files[0]);items.forEach(x=>f.append('item_images',x));tickets.forEach(x=>f.append('ticket_images',x));
 try{dr=await api('/api/intake/extract',{method:'POST',body:f});let x=dr.extracted;$('rv').innerHTML=`<h4>顧客</h4><div class=fields><input id=nm value="${esc(x.customer.name)}" placeholder="氏名"><input id=ad value="${esc(x.customer.address)}" placeholder="住所"><input id=ph value="${esc(x.customer.phone)}" placeholder="電話"></div><p>契約候補 ${x.contracts.length}件（質札1枚=1契約）</p>`+x.contracts.map((c,i)=>{let co=c.contract,opts=items.map((_,j)=>`<option value="${j}" ${(c.item_image_indices||[]).includes(j)?'selected':''}>商品写真${j+1}</option>`).join('');return `<div class="c"><h4>契約 ${i+1}｜認識品質 ${(100*c.quality).toFixed(0)}%</h4><div class=fields><input id=cd_${i} value="${esc(co.contract_date)}" placeholder="質入年月日"><input id=fd_${i} value="${esc(co.forfeiture_due_date)}" placeholder="流質年月日"><input id=pr_${i} value="${esc(co.principal_amount||0)}" placeholder="元金"><input id=ii_${i} value="${esc(co.interest_amount||0)}" placeholder="利息"></div><label>対応する商品写真 <select id=imgs_${i} multiple>${opts}</select></label><div id=items_${i}>${c.items.map((v,j)=>`<div class=itemreview><input id=cat_${i}_${j} value="${esc(v.category)}" placeholder="品目"><input id=br_${i}_${j} value="${esc(v.brand)}" placeholder="ブランド"><textarea id=desc_${i}_${j}>${esc(v.description)}</textarea></div>`).join('')}</div></div>`}).join('')+`<button class=p onclick="cn()">確認して一括登録</button>`}catch(e){alert(e.message)}finally{reading=false;readbtn.disabled=false;readbtn.textContent='質札専用読取'}
}
async function cn(){if(!dr)return;let x=dr.extracted;let cs=x.contracts.map((c,i)=>({...c,contract:{...c.contract,contract_date:$('cd_'+i).value,forfeiture_due_date:$('fd_'+i).value,principal_amount:+$('pr_'+i).value,interest_amount:+$('ii_'+i).value},item_image_indices:Array.from($('imgs_'+i).selectedOptions).map(o=>+o.value),items:c.items.map((v,j)=>({...v,category:$('cat_'+i+'_'+j).value,brand:$('br_'+i+'_'+j).value,description:$('desc_'+i+'_'+j).value}))}));let b={draft_id:dr.draft_id,customer:{...x.customer,name:nm.value,address:ad.value,phone:ph.value},contracts:cs};try{let r=await api('/api/intake/confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});alert(`${r.count}件の契約を登録しました`);$('rv').innerHTML='';li.value='';it.value='';ti.value='';ref()}catch(e){alert(e.message)}}
'''
    main.HTML=main.HTML[:start]+js+main.HTML[end:]

if __name__=='__main__':uvicorn.run(main.app,host='0.0.0.0',port=int(os.environ.get('PORT','8000')),proxy_headers=True)
