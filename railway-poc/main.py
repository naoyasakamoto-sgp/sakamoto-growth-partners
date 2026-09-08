import os, io, re, secrets
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from PIL import Image, ImageOps, ImageEnhance
import pytesseract

app=FastAPI(title='質屋せんだい 質札管理AIエージェント POC')
security=HTTPBasic()
USER=os.getenv('POC_USER','manager')
PASSWORD=os.getenv('POC_PASSWORD','change-me')

def auth(c:HTTPBasicCredentials=Depends(security)):
    ok=secrets.compare_digest(c.username,USER) and secrets.compare_digest(c.password,PASSWORD)
    if not ok: raise HTTPException(401,'認証が必要です',headers={'WWW-Authenticate':'Basic'})
    return c.username

@app.get('/api/health')
def health():
    return {'ok':True,'service':'shichiya-sendai-poc','ocr':'Tesseract jpn','time':datetime.now().isoformat(timespec='seconds')}

@app.get('/api/vision/status')
def vision(user=Depends(auth)):
    try:
        v=str(pytesseract.get_tesseract_version()); ready=True
    except Exception as e:
        v=str(e); ready=False
    return {'ready':ready,'engine':'Tesseract OSS','japanese':True,'external_ai':False,'version':v}

def ocr_image(img:Image.Image):
    img=ImageOps.exif_transpose(img).convert('L')
    img=ImageOps.autocontrast(img)
    img=ImageEnhance.Contrast(img).enhance(1.7)
    if max(img.size)>1800:
        r=1800/max(img.size); img=img.resize((int(img.width*r),int(img.height*r)))
    return pytesseract.image_to_string(img,lang='jpn+eng',config='--psm 6').strip()

def parse_ticket(text:str):
    compact=text.replace(' ','')
    dates=re.findall(r'(20\d{2})\D{0,3}(\d{1,2})\D{0,3}(\d{1,2})',compact)
    nums=[]
    for x in re.findall(r'(?<!\d)(\d{4,7})(?!\d)',compact):
        n=int(x)
        if 1000<=n<=10000000: nums.append(n)
    phone=''
    m=re.search(r'0\d{1,4}[-ー]?\d{1,4}[-ー]?\d{3,4}',text)
    if m: phone=m.group(0).replace('ー','-')
    return {
      'contract_date':f'{dates[0][0]}-{int(dates[0][1]):02d}-{int(dates[0][2]):02d}' if len(dates)>0 else '',
      'forfeiture_date':f'{dates[1][0]}-{int(dates[1][1]):02d}-{int(dates[1][2]):02d}' if len(dates)>1 else '',
      'principal':max(nums) if nums else 0,
      'monthly_interest':min(nums) if len(nums)>1 else 0,
      'phone':phone,'raw_text':text}

@app.post('/api/vision/extract')
async def extract(ticket:UploadFile=File(...),license:UploadFile|None=File(None),item:UploadFile|None=File(None),user=Depends(auth)):
    out={'ticket':{},'license':{},'item':{},'warnings':[]}
    try:
        out['ticket']=parse_ticket(ocr_image(Image.open(io.BytesIO(await ticket.read()))))
    except Exception as e: out['warnings'].append('質札OCR: '+str(e))
    if license:
        try: out['license']={'raw_text':ocr_image(Image.open(io.BytesIO(await license.read()))),'note':'本人情報は店長確認後に確定'}
        except Exception as e: out['warnings'].append('免許証OCR: '+str(e))
    if item:
        try:
            im=Image.open(io.BytesIO(await item.read())); out['item']={'width':im.width,'height':im.height,'status':'画像受付済','note':'ブランド・型番はローカルVLM追加予定'}
        except Exception as e: out['warnings'].append('質入品画像: '+str(e))
    return out

HTML='''<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>質屋せんだい POC</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f7fb;color:#172b45;font-family:-apple-system,BlinkMacSystemFont,"Noto Sans JP",sans-serif}header{background:linear-gradient(135deg,#102c50,#174f84);color:#fff;padding:20px}header b{font-size:21px}header small{display:block;margin-top:5px;opacity:.8}.wrap{max-width:1100px;margin:auto;padding:16px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.card,.stat{background:#fff;border-radius:16px;padding:16px;box-shadow:0 4px 18px #17375b12}.stat small{color:#667085}.stat strong{display:block;font-size:28px;margin-top:6px}.flow{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:15px 0}.step{background:#eaf2fb;border-radius:12px;padding:10px;text-align:center;font-size:12px;font-weight:700}.drop{border:2px dashed #aabdd1;border-radius:14px;padding:16px;background:#f9fbfe}.fields{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}label{font-size:13px;font-weight:700}input{width:100%;margin-top:5px;padding:10px;border:1px solid #ccd6e2;border-radius:9px;font-size:16px}button{border:0;background:#0d6efd;color:#fff;border-radius:10px;padding:12px 16px;font-weight:800}.raw{background:#0e1d2f;color:#dbe8f5;padding:12px;border-radius:10px;white-space:pre-wrap;max-height:260px;overflow:auto}.badge{display:inline-block;background:#e8f7ee;color:#067647;border-radius:999px;padding:7px 10px;font-size:12px}.warn{background:#fff4df;color:#a65b00}.red{background:#fee9e7;color:#b42318}@media(max-width:750px){.grid{grid-template-columns:1fr 1fr}.flow{grid-template-columns:1fr 1fr 1fr}.fields{grid-template-columns:1fr}}</style></head><body><header><b>質屋せんだい｜質札管理AIエージェント</b><small>OSS画像認識POC — 外部生成AIへ本人確認画像を送信しない構成</small></header><div class="wrap"><div class="flow"><div class="step">① 3画像撮影</div><div class="step">② OCR抽出</div><div class="step">③ 店長確認</div><div class="step">④ 契約DB</div><div class="step">⑤ 入金照合</div><div class="step">⑥ 流質判断</div></div><div class="grid"><div class="stat"><small>契約中</small><strong>128</strong></div><div class="stat"><small>期限接近</small><strong>12</strong></div><div class="stat"><small>支払い遅延</small><strong>8</strong></div><div class="stat"><small>流質判断待ち</small><strong>3</strong></div></div><div class="card" style="margin-top:14px"><h2>スマホ新規受付</h2><p>免許証・質入品・質札を撮影して、質札と本人確認情報をローカルOSS OCRで読み取ります。</p><div class="drop"><div class="fields"><label>免許証<input id="license" type="file" accept="image/*" capture="environment"></label><label>質入品<input id="item" type="file" accept="image/*" capture="environment"></label><label>質札<input id="ticket" type="file" accept="image/*" capture="environment"></label></div><p><button onclick="runOCR()">OSSで画像認識する</button></p></div><div id="result" style="display:none;margin-top:15px"><div class="fields"><label>質入年月日<input id="contract_date"></label><label>流質年月日<input id="forfeiture_date"></label><label>契約金額<input id="principal"></label><label>1ヶ月利息<input id="interest"></label><label>電話番号<input id="phone"></label></div><h3>OCR原文</h3><pre id="raw" class="raw"></pre></div></div><div class="card" style="margin-top:14px"><h2>実装ステータス</h2><p><span class="badge">✓ HTTPS / Railway</span> <span class="badge">✓ Tesseract 日本語OCR</span> <span class="badge">✓ Basic認証</span> <span class="badge warn">次: PaddleOCR</span></p><pre id="status" class="raw">確認中...</pre></div></div><script>
async function api(u,o){let r=await fetch(u,o);if(!r.ok)throw new Error(await r.text());return r.json()}async function status(){try{document.getElementById('status').textContent=JSON.stringify(await api('/api/vision/status'),null,2)}catch(e){document.getElementById('status').textContent=e.message}}async function runOCR(){let t=document.getElementById('ticket').files[0];if(!t){alert('質札を選択してください');return}let f=new FormData();f.append('ticket',t);let l=document.getElementById('license').files[0];let i=document.getElementById('item').files[0];if(l)f.append('license',l);if(i)f.append('item',i);document.getElementById('raw').textContent='OCR処理中...';document.getElementById('result').style.display='block';try{let r=await api('/api/vision/extract',{method:'POST',body:f});let x=r.ticket||{};document.getElementById('contract_date').value=x.contract_date||'';document.getElementById('forfeiture_date').value=x.forfeiture_date||'';document.getElementById('principal').value=x.principal||'';document.getElementById('interest').value=x.monthly_interest||'';document.getElementById('phone').value=x.phone||'';document.getElementById('raw').textContent=x.raw_text||JSON.stringify(r,null,2)}catch(e){document.getElementById('raw').textContent='エラー: '+e.message}}status();
</script></body></html>'''

@app.get('/',response_class=HTMLResponse)
def root(user=Depends(auth)): return HTMLResponse(HTML)
