import os,io,re,csv,json,secrets,sqlite3,uuid,calendar,unicodedata
from datetime import date,datetime,timedelta
from pathlib import Path
from difflib import SequenceMatcher
from contextlib import contextmanager
from fastapi import FastAPI,UploadFile,File,Depends,HTTPException
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPBasic,HTTPBasicCredentials
from pydantic import BaseModel,Field
from PIL import Image,ImageOps,ImageEnhance
import pytesseract

VERSION='1.0.0-poc'; security=HTTPBasic()
DATA=Path(os.getenv('DATA_DIR','/data'))
try:
    DATA.mkdir(parents=True,exist_ok=True); q=DATA/'.probe'; q.write_text('ok'); q.unlink()
except Exception:
    DATA=Path('/tmp/shichiya-data'); DATA.mkdir(parents=True,exist_ok=True)
UP=DATA/'uploads'; UP.mkdir(exist_ok=True); DB=DATA/'poc.sqlite3'; MARK=DATA/'persistence.marker'
if not MARK.exists(): MARK.write_text(uuid.uuid4().hex)
MU=os.getenv('POC_USER','manager'); MP=os.getenv('POC_PASSWORD','change-me'); OU=os.getenv('POC_OWNER_USER','owner'); OP=os.getenv('POC_OWNER_PASSWORD','change-me-owner'); PIN=os.getenv('OWNER_PIN','000000')
app=FastAPI(title='質屋せんだい｜質札管理AIエージェント',version=VERSION,docs_url=None)
SCHEMA='''
CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY,name TEXT NOT NULL,name_kana TEXT,address TEXT,phone TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS contracts(id INTEGER PRIMARY KEY,contract_no TEXT UNIQUE,customer_id INTEGER,contract_date TEXT,principal_amount INTEGER,interest_amount INTEGER,next_interest_due_date TEXT,forfeiture_due_date TEXT,status TEXT DEFAULT 'ACTIVE',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS pawn_items(id INTEGER PRIMARY KEY,contract_id INTEGER,category TEXT,brand TEXT,description TEXT,image_path TEXT);
CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY,payload TEXT,item_path TEXT,ticket_path TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS bank_transactions(id INTEGER PRIMARY KEY,transaction_date TEXT,sender_name TEXT,amount INTEGER,reference TEXT UNIQUE,match_status TEXT,matched_contract_id INTEGER,score REAL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY,contract_id INTEGER,paid_at TEXT,amount INTEGER,payment_type TEXT,bank_transaction_id INTEGER UNIQUE,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS decisions(id INTEGER PRIMARY KEY,contract_id INTEGER,decision TEXT,decided_by TEXT,note TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY,actor TEXT,role TEXT,action TEXT,target_type TEXT,target_id TEXT,details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
'''
LABEL={'ACTIVE':'契約中','DUE_SOON':'期限接近','OVERDUE':'支払い遅延','FORFEITURE_REVIEW':'流質判断待ち','FORFEITURE_HOLD':'流質保留','FORFEITED':'流質済み','REDEEMED':'返還済み'}
@contextmanager
def db():
    c=sqlite3.connect(DB); c.row_factory=sqlite3.Row
    try: yield c; c.commit()
    finally: c.close()
def audit(c,a,r,act,t,i,d=None): c.execute('INSERT INTO audit_logs(actor,role,action,target_type,target_id,details)VALUES(?,?,?,?,?,?)',(a,r,act,t,str(i),json.dumps(d or {},ensure_ascii=False)))
def add_month(s):
    d=date.fromisoformat(s[:10]); y=d.year+(d.month==12); m=1 if d.month==12 else d.month+1
    return date(y,m,min(d.day,calendar.monthrange(y,m)[1])).isoformat()
def st(x):
    if x['status'] in ('FORFEITED','REDEEMED','FORFEITURE_HOLD'): return x['status']
    t=date.today(); f=date.fromisoformat(x['forfeiture_due_date']); p=date.fromisoformat(x['next_interest_due_date'])
    if t>=f:return 'FORFEITURE_REVIEW'
    if t>p:return 'OVERDUE'
    if (p-t).days<=7:return 'DUE_SOON'
    return 'ACTIVE'
def seed(c):
    if c.execute('SELECT COUNT(*) n FROM contracts').fetchone()['n']: return
    t=date.today(); rows=[('佐藤 はるか','サトウ ハルカ','仙台市青葉区（デモ）','090-0000-1001','腕時計','SEIKO',40000,1200,4,34),('鈴木 健','スズキ ケン','仙台市泉区（デモ）','090-0000-1002','バッグ','COACH',80000,2400,-3,14),('高橋 芽衣','タカハシ メイ','仙台市太白区（デモ）','090-0000-1003','指輪','',100000,3000,-20,-1),('伊藤 航太','イトウ コウタ','名取市（デモ）','090-0000-1004','ネックレス','Tiffany & Co.',55000,1650,22,52)]
    for i,(n,k,ad,ph,cat,br,p,it,di,df) in enumerate(rows,1):
        cid=c.execute('INSERT INTO customers(name,name_kana,address,phone)VALUES(?,?,?,?)',(n,k,ad,ph)).lastrowid; co=c.execute('INSERT INTO contracts(contract_no,customer_id,contract_date,principal_amount,interest_amount,next_interest_due_date,forfeiture_due_date,status)VALUES(?,?,?,?,?,?,?,?)',(f'P{t:%y%m}-{i:04d}',cid,(t-timedelta(days=30+i)).isoformat(),p,it,(t+timedelta(days=di)).isoformat(),(t+timedelta(days=df)).isoformat(),'ACTIVE')).lastrowid; c.execute('INSERT INTO pawn_items(contract_id,category,brand,description)VALUES(?,?,?,?)',(co,cat,br,cat+' / デモ'))
    audit(c,'system','system','DEMO_SEEDED','system','seed')
@app.on_event('startup')
def startup():
    with db() as c: c.executescript(SCHEMA); seed(c)
def auth(x:HTTPBasicCredentials=Depends(security)):
    if secrets.compare_digest(x.username,MU) and secrets.compare_digest(x.password,MP): return {'name':x.username,'role':'manager'}
    if secrets.compare_digest(x.username,OU) and secrets.compare_digest(x.password,OP): return {'name':x.username,'role':'owner'}
    raise HTTPException(401,'認証に失敗しました',headers={'WWW-Authenticate':'Basic'})
def owner(a=Depends(auth)):
    if a['role']!='owner': raise HTTPException(403,'オーナー権限が必要です')
    return a
def qcons(c): return c.execute('SELECT ct.*,cu.name customer_name,cu.name_kana,cu.address,cu.phone,pi.category,pi.brand,pi.description FROM contracts ct JOIN customers cu ON cu.id=ct.customer_id LEFT JOIN pawn_items pi ON pi.contract_id=ct.id ORDER BY ct.id DESC').fetchall()
def serial(r):
    x=dict(r); x['effective_status']=st(x); x['status_label']=LABEL[x['effective_status']]; return x
@app.get('/api/health')
def health(): return {'ok':True,'version':VERSION,'ocr':'Tesseract jpn+eng','external_ai':False,'data_dir':str(DATA),'persistent_mount':str(DATA).startswith('/data'),'persistence_marker':MARK.read_text().strip(),'db_exists':DB.exists()}
@app.get('/api/vision/status')
def vision(a=Depends(auth)):
    try: langs=pytesseract.get_languages(config=''); return {'ready':'jpn' in langs,'engine':'Tesseract OSS','languages':langs,'external_ai':False}
    except Exception as e:return {'ready':False,'error':str(e),'external_ai':False}
@app.get('/api/dashboard')
def dashboard(a=Depends(auth)):
    with db() as c:
        xs=[serial(r) for r in qcons(c)]; counts={k:0 for k in LABEL}
        for x in xs: counts[x['effective_status']]+=1
        return {'counts':counts,'action_list':[x for x in xs if x['effective_status'] in ('DUE_SOON','OVERDUE','FORFEITURE_REVIEW','FORFEITURE_HOLD')],'overdue_list':[x for x in xs if x['effective_status']=='OVERDUE'],'total':len(xs),'unmatched_bank_transactions':c.execute("SELECT COUNT(*) n FROM bank_transactions WHERE match_status IN('UNMATCHED','REVIEW')").fetchone()['n']}
@app.get('/api/contracts')
def contracts(a=Depends(auth)):
    with db() as c:return {'items':[serial(r) for r in qcons(c)]}
def ocr(raw):
    im=ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('L'); im=ImageOps.autocontrast(im); im=ImageEnhance.Contrast(im).enhance(1.6)
    if max(im.size)>2000:r=2000/max(im.size); im=im.resize((int(im.width*r),int(im.height*r)))
    d=pytesseract.image_to_data(im,lang='jpn+eng',config='--psm 6',output_type=pytesseract.Output.DICT); ts=[]; cs=[]
    for t,c in zip(d['text'],d['conf']):
        t=(t or '').strip()
        try:f=float(c)
        except:f=-1
        if t:ts.append(t); cs.append(max(0,f)/100)
    return '\n'.join(ts),sum(cs)/len(cs) if cs else 0
def nd(s):return unicodedata.normalize('NFKC',s or '').replace(',','').replace(' ','')
def pdate(t,label):
    z=nd(t); i=z.find(label); z=z[i:i+50] if i>=0 else z; m=re.search(r'(20\d{2})\D{0,4}(\d{1,2})\D{0,4}(\d{1,2})',z); return f'{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}' if m else ''
def pmoney(t,label):
    z=nd(t); i=z.find(label); z=z[i:i+35] if i>=0 else ''; n=re.findall(r'(?<!\d)(\d{3,8})(?!\d)',z); return int(n[0]) if n else 0
def after(lines,label):
    for i,x in enumerate(lines):
        if label in x:
            v=re.sub(rf'.*?{label}[:：]?','',x).strip(); return v or(lines[i+1].strip() if i+1<len(lines) else '')
    return ''
def phone(t):
    m=re.search(r'0\d{1,4}[-ー]?\d{1,4}[-ー]?\d{3,4}',nd(t)); return m.group(0).replace('ー','-') if m else ''
async def read(f):
    b=await f.read(12*1024*1024+1)
    if len(b)>12*1024*1024:raise HTTPException(413,'12MB以下にしてください')
    return b
def save(b,k,fn):
    p=UP/f'{k}-{uuid.uuid4().hex}{Path(fn or ".jpg").suffix or ".jpg"}'; p.write_bytes(b); return str(p)
@app.post('/api/intake/extract')
async def extract(license_image:UploadFile=File(...),item_image:UploadFile=File(...),ticket_image:UploadFile=File(...),a=Depends(auth)):
    lr,ir,tr=await read(license_image),await read(item_image),await read(ticket_image)
    try:lt,lc=ocr(lr)
    except:lt,lc='',0
    try:tt,tc=ocr(tr)
    except:tt,tc='',0
    try:it,ic=ocr(ir)
    except:it,ic='',0
    cd=pdate(tt,'質入年月日') or date.today().isoformat(); fd=pdate(tt,'流質年月日') or(date.today()+timedelta(days=90)).isoformat(); ll=lt.splitlines(); tl=tt.splitlines(); payload={'customer':{'name':after(ll,'氏名') or after(tl,'氏名'),'address':after(ll,'住所'),'phone':phone(lt) or phone(tt)},'contract':{'contract_date':cd,'principal_amount':pmoney(tt,'契約金額'),'interest_amount':pmoney(tt,'利息'),'next_interest_due_date':add_month(cd),'forfeiture_due_date':fd},'item':{'category':'','brand':'','description':it[:300] or '画像確認'}}; conf=round((lc+tc)/2,3); did=uuid.uuid4().hex; ip=save(ir,'item',item_image.filename); tp=save(tr,'ticket',ticket_image.filename)
    with db() as c:c.execute('INSERT INTO drafts(id,payload,item_path,ticket_path)VALUES(?,?,?,?)',(did,json.dumps(payload,ensure_ascii=False),ip,tp));audit(c,a['name'],a['role'],'INTAKE_EXTRACTED','draft',did,{'confidence':conf})
    return {'draft_id':did,'extracted':payload,'vision':{'engine':'Tesseract OSS','avg_confidence':conf,'needs_review':conf<.78 or not payload['customer']['name'] or payload['contract']['principal_amount']<=0,'ocr':{'license':lt,'ticket':tt,'item':it},'privacy':'免許証原画像は保存しません'}}
class Confirm(BaseModel):draft_id:str;customer:dict;contract:dict;item:dict
@app.post('/api/intake/confirm')
def confirm(b:Confirm,a=Depends(auth)):
    if not b.customer.get('name'):raise HTTPException(422,'氏名を確認してください')
    with db() as c:
        d=c.execute('SELECT * FROM drafts WHERE id=?',(b.draft_id,)).fetchone()
        if not d:raise HTTPException(404,'下書きなし')
        cid=c.execute('INSERT INTO customers(name,address,phone)VALUES(?,?,?)',(b.customer.get('name'),b.customer.get('address'),b.customer.get('phone'))).lastrowid; n=c.execute('SELECT COUNT(*) n FROM contracts').fetchone()['n']+1; no=f'P{date.today():%y%m}-{n:04d}'; co=b.contract; con=c.execute('INSERT INTO contracts(contract_no,customer_id,contract_date,principal_amount,interest_amount,next_interest_due_date,forfeiture_due_date,status)VALUES(?,?,?,?,?,?,?,?)',(no,cid,co['contract_date'],int(co.get('principal_amount') or 0),int(co.get('interest_amount') or 0),co.get('next_interest_due_date') or add_month(co['contract_date']),co['forfeiture_due_date'],'ACTIVE')).lastrowid;c.execute('INSERT INTO pawn_items(contract_id,category,brand,description,image_path)VALUES(?,?,?,?,?)',(con,b.item.get('category'),b.item.get('brand'),b.item.get('description'),d['item_path']));audit(c,a['name'],a['role'],'CONTRACT_CREATED','contract',con,{'contract_no':no})
    return {'ok':True,'contract_no':no,'contract_id':con}
def norm(s):return re.sub(r'[^0-9A-Zァ-ヶ一-龠]','',unicodedata.normalize('NFKC',s or '').upper())
def match(sender,amt,cs):
    best=None
    for c in cs:
        ns=max(SequenceMatcher(None,norm(sender),norm(c['customer_name'])).ratio(),SequenceMatcher(None,norm(sender),norm(c.get('name_kana') or '')).ratio()); sc=.72*ns+.28*(int(amt)==int(c['interest_amount']))
        if best is None or sc>best[0]:best=(sc,c)
    if not best:return 'UNMATCHED',None,0
    sc,c=best; s='AUTO_MATCHED' if sc>=.88 else 'REVIEW' if sc>=.64 else 'UNMATCHED'; return s,(c['id'] if s!='UNMATCHED' else None),round(sc,3)
def apply(c,tid,cid,dt,amt):
    ct=c.execute('SELECT * FROM contracts WHERE id=?',(cid,)).fetchone(); typ='INTEREST' if int(amt)==int(ct['interest_amount']) else 'UNCLASSIFIED';c.execute('INSERT OR IGNORE INTO payments(contract_id,paid_at,amount,payment_type,bank_transaction_id)VALUES(?,?,?,?,?)',(cid,dt,amt,typ,tid));
    if typ=='INTEREST':c.execute('UPDATE contracts SET next_interest_due_date=?,status="ACTIVE" WHERE id=?',(add_month(ct['next_interest_due_date']),cid))
    c.execute('UPDATE bank_transactions SET match_status="MATCHED",matched_contract_id=? WHERE id=?',(cid,tid))
def import_rows(rows,a):
    z=[]
    with db() as c:
        cs=[serial(x) for x in qcons(c)]
        for r in rows:
            dt=str(r.get('date') or r.get('日付') or r.get('入金日') or date.today().isoformat())[:10].replace('/','-'); sender=str(r.get('sender') or r.get('名義') or r.get('振込名義') or '')
            try:amt=int(float(str(r.get('amount') or r.get('金額') or 0).replace(',','').replace('¥','')))
            except:continue
            ref=str(r.get('reference') or r.get('摘要') or 'CSV-'+uuid.uuid4().hex[:10])
            if c.execute('SELECT 1 FROM bank_transactions WHERE reference=?',(ref,)).fetchone():continue
            s,cid,sc=match(sender,amt,cs); tid=c.execute('INSERT INTO bank_transactions(transaction_date,sender_name,amount,reference,match_status,matched_contract_id,score)VALUES(?,?,?,?,?,?,?)',(dt,sender,amt,ref,s,cid,sc)).lastrowid
            if s=='AUTO_MATCHED' and cid:apply(c,tid,cid,dt,amt)
            z.append({'id':tid,'sender_name':sender,'amount':amt,'match_status':s,'contract_id':cid,'score':sc})
        audit(c,a['name'],a['role'],'BANK_IMPORTED','bank','batch',{'count':len(z)})
    return z
@app.post('/api/bank/pull-demo')
def bd(a=Depends(auth)):
    t=date.today().isoformat(); z=import_rows([{'date':t,'sender':'サトウ ハルカ','amount':1200,'reference':f'D-{t}-1'},{'date':t,'sender':'スズキ ケン','amount':2400,'reference':f'D-{t}-2'},{'date':t,'sender':'タカハシ','amount':3000,'reference':f'D-{t}-3'},{'date':t,'sender':'ミヤギ タロウ','amount':9999,'reference':f'D-{t}-4'}],a);return {'count':len(z),'items':z}
@app.post('/api/bank/import-csv')
async def bc(file:UploadFile=File(...),a=Depends(auth)):
    raw=await file.read(2_000_000); text=None
    for enc in ('utf-8-sig','cp932','shift_jis'):
        try:text=raw.decode(enc);break
        except:pass
    if text is None:raise HTTPException(422,'CSVを読めません')
    z=import_rows(list(csv.DictReader(io.StringIO(text))),a);return {'count':len(z),'items':z}
@app.get('/api/bank/transactions')
def btx(a=Depends(auth)):
    with db() as c:return {'items':[dict(x) for x in c.execute('SELECT bt.*,ct.contract_no FROM bank_transactions bt LEFT JOIN contracts ct ON ct.id=bt.matched_contract_id ORDER BY bt.id DESC').fetchall()]}
class Dec(BaseModel):action:str=Field(pattern='^(approve|hold)$');owner_pin:str;note:str=''
@app.post('/api/contracts/{cid}/decision')
def dec(cid:int,b:Dec,a=Depends(owner)):
    if not secrets.compare_digest(b.owner_pin,PIN):raise HTTPException(403,'PINが違います')
    with db() as c:
        ct=c.execute('SELECT * FROM contracts WHERE id=?',(cid,)).fetchone(); s=st(dict(ct)) if ct else None
        if not ct:raise HTTPException(404,'契約なし')
        if s not in ('FORFEITURE_REVIEW','FORFEITURE_HOLD'):raise HTTPException(409,'流質判断対象ではありません')
        n='FORFEITED' if b.action=='approve' else 'FORFEITURE_HOLD';c.execute('UPDATE contracts SET status=? WHERE id=?',(n,cid));c.execute('INSERT INTO decisions(contract_id,decision,decided_by,note)VALUES(?,?,?,?)',(cid,b.action,a['name'],b.note));audit(c,a['name'],a['role'],'FORFEITURE_'+b.action.upper(),'contract',cid)
    return {'ok':True,'status':n}
@app.get('/api/audit')
def al(a=Depends(owner)):
    with db() as c:return {'items':[dict(x) for x in c.execute('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100').fetchall()]}
HTML='''<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>質屋せんだい</title><style>body{font-family:-apple-system,sans-serif;background:#f5f7fa;margin:0;color:#17304b}header{background:#12385e;color:white;padding:18px}.w{max-width:1100px;margin:auto;padding:14px}.g{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.c{background:white;padding:14px;border-radius:12px;margin:10px 0}.tabs button,button{padding:9px;border:0;border-radius:8px;margin:2px}.tabs button{background:#e8edf3}.tabs .on,.p{background:#12385e;color:white}.panel{display:none}.panel.on{display:block}table{width:100%;border-collapse:collapse;font-size:13px}td{padding:8px;border-bottom:1px solid #eee}.scroll{overflow:auto}.u{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}input{width:100%;padding:8px}.b{padding:4px 7px;border-radius:20px;background:#eee}.OVERDUE,.FORFEITURE_REVIEW{background:#ffdede}.fields{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}@media(max-width:700px){.g{grid-template-columns:1fr 1fr}.u,.fields{grid-template-columns:1fr}table{min-width:720px}}</style></head><body><header><b>質屋せんだい × SGP｜質札管理AIエージェント</b></header><div class="w"><div id="m" class="g"></div><div class="tabs"><button class="on" data-x="d">要対応</button><button data-x="i">新規受付</button><button data-x="k">契約</button><button data-x="b">銀行</button><button data-x="a">監査</button></div><section id="d" class="panel on"><div class="c"><h3>本日の要対応</h3><div class="scroll"><table id="act"></table></div></div></section><section id="i" class="panel"><div class="c"><h3>3画像受付</h3><div class="u"><input id="li" type="file" accept="image/*"><input id="it" type="file" accept="image/*"><input id="ti" type="file" accept="image/*"></div><button class="p" onclick="ex()">OSS読取</button><div id="rv"></div></div></section><section id="k" class="panel"><div class="c"><table id="ks"></table></div></section><section id="b" class="panel"><div class="c"><button onclick="demo()">銀行デモ取得</button><input id="cf" type="file" accept=".csv"><button onclick="cup()">CSV取込</button><table id="bs"></table></div></section><section id="a" class="panel"><div class="c"><button onclick="aud()">監査ログ</button><pre id="ao"></pre></div></section><div class="c" id="h"></div></div><script>const $=x=>document.getElementById(x),api=async(u,o)=>{let r=await fetch(u,o);if(!r.ok)throw Error(await r.text());return r.json()},y=x=>'¥'+Number(x||0).toLocaleString();document.querySelectorAll('.tabs button').forEach(q=>q.onclick=()=>{document.querySelectorAll('.tabs button,.panel').forEach(z=>z.classList.remove('on'));q.classList.add('on');$(q.dataset.x).classList.add('on')});let dr;async function ref(){let h=await api('/api/health');$('h').textContent=`v${h.version}｜${h.persistent_mount?'永続DB':'一時DB'}｜外部AI送信なし`;let d=await api('/api/dashboard');$('m').innerHTML=[['契約中',d.counts.ACTIVE],['期限接近',d.counts.DUE_SOON],['遅延',d.counts.OVERDUE],['流質判断',d.counts.FORFEITURE_REVIEW]].map(x=>`<div class=c>${x[0]}<h2>${x[1]||0}</h2></div>`).join('');$('act').innerHTML=d.action_list.map(x=>`<tr><td>${x.contract_no}</td><td>${x.customer_name}</td><td>${x.category||''}</td><td>${y(x.principal_amount)}</td><td><span class="b ${x.effective_status}">${x.status_label}</span></td><td>${x.effective_status.includes('FORFEITURE')?`<button onclick="dc(${x.id})">判断</button>`:''}</td></tr>`).join('');let c=await api('/api/contracts');$('ks').innerHTML=c.items.map(x=>`<tr><td>${x.contract_no}</td><td>${x.customer_name}</td><td>${x.category||''}</td><td>${y(x.principal_amount)}</td><td>${x.status_label}</td></tr>`).join('');lb()}async function ex(){if(!li.files[0]||!it.files[0]||!ti.files[0])return alert('3画像を選択');let f=new FormData();f.append('license_image',li.files[0]);f.append('item_image',it.files[0]);f.append('ticket_image',ti.files[0]);dr=await api('/api/intake/extract',{method:'POST',body:f});let x=dr.extracted;$('rv').innerHTML=`<p>確信度 ${(dr.vision.avg_confidence*100).toFixed(0)}%（店長確認）</p><div class=fields><input id=nm value="${x.customer.name||''}" placeholder=氏名><input id=ad value="${x.customer.address||''}" placeholder=住所><input id=ph value="${x.customer.phone||''}" placeholder=電話><input id=cd value="${x.contract.contract_date}"><input id=pr value="${x.contract.principal_amount}" placeholder=元金><input id=ii value="${x.contract.interest_amount}" placeholder=利息><input id=fd value="${x.contract.forfeiture_due_date}"><input id=cat placeholder=品目></div><button class=p onclick="cn()">確認して登録</button>`}async function cn(){let x=dr.extracted,b={draft_id:dr.draft_id,customer:{...x.customer,name:nm.value,address:ad.value,phone:ph.value},contract:{...x.contract,contract_date:cd.value,principal_amount:+pr.value,interest_amount:+ii.value,forfeiture_due_date:fd.value},item:{...x.item,category:cat.value}};let r=await api('/api/intake/confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});alert(r.contract_no);$('rv').innerHTML='';ref()}async function demo(){await api('/api/bank/pull-demo',{method:'POST'});ref()}async function cup(){let f=new FormData();f.append('file',cf.files[0]);let r=await api('/api/bank/import-csv',{method:'POST',body:f});alert(r.count+'件');ref()}async function lb(){let r=await api('/api/bank/transactions');$('bs').innerHTML=r.items.map(x=>`<tr><td>${x.transaction_date}</td><td>${x.sender_name}</td><td>${y(x.amount)}</td><td>${x.match_status}</td><td>${x.contract_no||''}</td></tr>`).join('')}async function dc(id){let p=prompt('関口さんPIN');if(p===null)return;let ac=confirm('OK=流質確定 / キャンセル=保留')?'approve':'hold';try{await api('/api/contracts/'+id+'/decision',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:ac,owner_pin:p,note:''})});ref()}catch(e){alert(e.message)}}async function aud(){try{$('ao').textContent=JSON.stringify(await api('/api/audit'),null,2)}catch(e){$('ao').textContent=e.message}}ref()</script></body></html>'''
@app.get('/',response_class=HTMLResponse)
def root(a=Depends(auth)):return HTMLResponse(HTML)
