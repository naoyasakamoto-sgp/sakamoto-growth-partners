import io,re,math,os,gc,threading,unicodedata
from datetime import date,timedelta
import cv2,numpy as np,pytesseract
PIPELINE_VERSION='6.0.0'; CANON_W,CANON_H=1600,850; LICENSE_W,LICENSE_H=1400,882
ROIS={'contract_date':(.115,.115,.49,.19),'forfeiture_due_date':(.115,.17,.49,.245),'address':(.535,.09,.945,.175),'name':(.535,.15,.945,.235),'phone':(.135,.65,.50,.755),'item1':(.555,.30,.915,.39),'item2':(.555,.36,.915,.455),'principal':(.135,.30,.495,.41),'interest':(.135,.395,.495,.505)}
_P=None;_PF=False;_PE='';_PL=threading.Lock()
def _decode(raw,max_edge=2400):
 from PIL import Image,ImageOps
 im=cv2.cvtColor(np.asarray(ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGB')),cv2.COLOR_RGB2BGR);h,w=im.shape[:2]
 if max(h,w)>max_edge:
  s=max_edge/max(h,w);im=cv2.resize(im,(int(w*s),int(h*s)),interpolation=cv2.INTER_AREA)
 return im
def _ord(p):
 p=np.asarray(p,np.float32).reshape(4,2);s=p.sum(1);d=np.diff(p,axis=1).ravel();return np.array([p[np.argmin(s)],p[np.argmin(d)],p[np.argmax(s)],p[np.argmax(d)]],np.float32)
def _warp(im,q,w,h):
 q=_ord(q);tl,tr,br,bl=q;qw=(np.linalg.norm(tr-tl)+np.linalg.norm(br-bl))/2;qh=(np.linalg.norm(bl-tl)+np.linalg.norm(br-tr))/2
 if qh>qw:q=np.array([bl,tl,tr,br],np.float32)
 dst=np.array([[0,0],[w-1,0],[w-1,h-1],[0,h-1]],np.float32);return cv2.warpPerspective(im,cv2.getPerspectiveTransform(q,dst),(w,h),borderValue=(255,255,255))
def _run(mask):
 best=(0,-1);st=None
 for i,v in enumerate(mask):
  if v and st is None:st=i
  if st is not None and ((not v) or i==len(mask)-1):
   en=i if v and i==len(mask)-1 else i-1
   if en-st>best[1]-best[0]:best=(st,en)
   st=None
 return best
def _tess(im,psm=6,lang='jpn+eng',wl=None):
 cfg=f'--oem 1 --psm {psm}'+(f' -c tessedit_char_whitelist={wl}' if wl else '')
 try:d=pytesseract.image_to_data(im,lang=lang,config=cfg,output_type=pytesseract.Output.DICT)
 except:return '',0.
 ts=[];cs=[]
 for t,c in zip(d.get('text',[]),d.get('conf',[])):
  t=(t or '').strip()
  try:c=float(c)
  except:c=-1
  if t:ts.append(t);cs+=([c/100] if c>=0 else [])
 return ' '.join(ts),sum(cs)/len(cs) if cs else 0.
def _anchor(im,kind):
 t,_=_tess(im,11);keys=('質札','質入','流質','住所','氏名','契約') if kind=='ticket' else ('住所','交付','番号','免許','有効')
 z=t.replace(' ','');return sum(k in z for k in keys)
def _white_crop(im):
 h=im.shape[0];hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV);w=((hsv[:,:,2]>135)&(hsv[:,:,1]<95)).mean(1);w=cv2.GaussianBlur(w.astype(np.float32).reshape(-1,1),(1,max(9,(h//75)|1)),0).ravel()
 for th in (.70,.62,.54,.46):
  a,b=_run(w>th)
  if b>a and b-a+1>=h*.34:return im[max(0,a-5):min(h,b+6)],True
 return im,False
def normalize_ticket(raw):
 im=_decode(raw);crop,ok=_white_crop(im)
 if ok:out=cv2.resize(crop,(CANON_W,CANON_H),interpolation=cv2.INTER_AREA)
 else:
  g=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY);e=cv2.Canny(cv2.GaussianBlur(g,(5,5),0),35,120);cnts,_=cv2.findContours(e,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE);best=None
  for c in sorted(cnts,key=cv2.contourArea,reverse=True)[:50]:
   ar=cv2.contourArea(c);r=cv2.minAreaRect(c);rw,rh=r[1]
   if ar<im.shape[0]*im.shape[1]*.18 or min(rw,rh)<1:continue
   asp=max(rw,rh)/min(rw,rh)
   if 1.25<=asp<=1.75:
    sc=ar/(im.shape[0]*im.shape[1])+.18*math.exp(-abs(asp-1.42)*3)
    if best is None or sc>best[0]:best=(sc,cv2.boxPoints(r))
  out=_warp(im,best[1],CANON_W,CANON_H) if best else cv2.resize(im,(CANON_W,CANON_H));ok=bool(best)
 r=cv2.rotate(out,cv2.ROTATE_180)
 if _anchor(r,'ticket')>_anchor(out,'ticket'):out=r
 return out,ok
def _crop(im,b,ins=0):
 h,w=im.shape[:2];x1,y1,x2,y2=b;return im[int(y1*h)+ins:int(y2*h)-ins,int(x1*w)+ins:int(x2*w)-ins]
def _getp():
 global _P,_PF,_PE
 if _P is not None or _PF:return _P
 with _PL:
  if _P is not None or _PF:return _P
  try:
   from paddleocr import PaddleOCR
   try:_P=PaddleOCR(use_angle_cls=False,lang='japan',show_log=False,use_gpu=False,cpu_threads=1,enable_mkldnn=False)
   except TypeError:_P=PaddleOCR(use_angle_cls=False,lang='japan',show_log=False,use_gpu=False)
  except Exception as e:_PF=True;_PE=f'{type(e).__name__}:{e}'[:200]
 return _P
def _paddle(im,det=True):
 p=_getp()
 if p is None:return '',0.
 with _PL:
  try:r=p.ocr(im,cls=False,det=det,rec=True)
  except:return '',0.
 vals=[]
 def walk(o):
  if isinstance(o,(list,tuple)):
   if len(o)==2 and isinstance(o[0],str) and isinstance(o[1],(int,float)):vals.append((o[0],float(o[1])));return
   if len(o)==2 and isinstance(o[1],(list,tuple)) and len(o[1])==2 and isinstance(o[1][0],str):vals.append((o[1][0],float(o[1][1])));return
   for x in o:walk(x)
 walk(r);vals=[x for x in vals if x[0].strip()]
 return (' '.join(x[0] for x in vals),sum(x[1] for x in vals)/len(vals)) if vals else ('',0.)
def _digits(s):return re.sub(r'\D','',unicodedata.normalize('NFKC',s or ''))
def _clean(s):return re.sub(r'\s+',' ',unicodedata.normalize('NFKC',s or '')).strip(' :-|#_')
def _jp(s):return sum(1 for c in s if '\u3040'<=c<='\u30ff' or '\u3400'<=c<='\u9fff')/max(1,len(s))
def _date(s):
 z=unicodedata.normalize('NFKC',s or '');ns=[int(x) for x in re.findall(r'\d+',z)];ds=_digits(z);tr=[]
 if len(ns)>=3:tr.append(ns[:3])
 if len(ds)>=8:tr.append([int(ds[:4]),int(ds[4:6]),int(ds[6:8])])
 for y,m,d in tr:
  try:
   v=date(y,m,d)
   if 2020<=y<=2100:return v.isoformat()
  except:pass
 return ''
def _phone(s):
 ds=_digits(s);m=re.search(r'(070|080|090)\d{8}',ds)
 if m:x=m.group();return f'{x[:3]}-{x[3:7]}-{x[7:]}'
 return ds if 10<=len(ds)<=11 and ds.startswith('0') else ''
def _best(im,kind,parser):
 c=[];pt,pc=_paddle(im,det=kind in ('text','multi'));c+=([(pt,pc,'PaddleOCR')] if pt else [])
 if kind in ('date','phone','money'):
  wl='0123456789-/' if kind!='money' else '0123456789'
  for psm in (6,11):
   t,cf=_tess(im,psm,'eng',wl);c+=([(t,cf,'Tesseract')] if t else [])
 else:
  for psm in (6,11):
   t,cf=_tess(im,psm);c+=([(t,cf,'Tesseract')] if t else [])
 best=None
 for raw,cf,e in c:
  v=parser(raw);sc=cf+(.25 if v else 0)+(min(.15,_jp(str(v))*.2) if kind in ('text','multi') else 0)
  if best is None or sc>best[0]:best=(sc,v,raw,cf,e)
 return ('','',0.,'none') if best is None else best[1:]
def _field(v,r,c,e,valid,src='ticket',th=.62,note=''):
 if not valid:v=0 if isinstance(v,int) else '';c=min(c,.3)
 d={'value':v,'raw':r,'confidence':round(float(c),3),'status':'ok' if valid and c>=th else ('review' if valid else 'invalid'),'engine':e,'source':src}
 if note:d['note']=note
 return d
def _bounds(im):
 g=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY);reg=(g[238:442,:832]<165).astype(np.uint8)*255;v=cv2.morphologyEx(reg,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_RECT,(1,55)));p=(v>0).sum(0);xs=np.where(p>42)[0];cs=[]
 if len(xs):
  s=pr=xs[0]
  for x in xs[1:]:
   if x>pr+1:cs.append((s+pr)//2);s=x
   pr=x
  cs.append((s+pr)//2)
 cs=[int(x) for x in cs if 190<=x<=800]
 for i in range(max(0,len(cs)-8)):
  q=cs[i:i+9];ds=np.diff(q)
  if len(q)==9 and 48<=np.median(ds)<=84 and max(abs(ds-np.median(ds)))<16:return q[1:]
 return [290,358,425,493,560,628,695,762]
def _ink(c):
 g=cv2.cvtColor(c,cv2.COLOR_BGR2GRAY);b=cv2.threshold(g,0,255,cv2.THRESH_BINARY_INV+cv2.THRESH_OTSU)[1];b[:4]=0;b[-4:]=0;b[:,:4]=0;b[:,-4:]=0;return np.count_nonzero(b)/b.size
def _zero(c):
 g=cv2.cvtColor(c,cv2.COLOR_BGR2GRAY);b=cv2.threshold(g,0,255,cv2.THRESH_BINARY_INV+cv2.THRESH_OTSU)[1];b[:4]=0;b[-4:]=0;b[:,:4]=0;b[:,-4:]=0;cs,h=cv2.findContours(b,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_SIMPLE)
 if h is None:return False
 for i,x in enumerate(cs):
  if h[0][i][3]!=-1 or cv2.contourArea(x)<25:continue
  ch=h[0][i][2]
  if ch!=-1 and cv2.contourArea(cs[ch])>12:return True
 return False
def _digit(c):
 if _ink(c)<.018:return None,0.,'blank',False
 out=[];t,cf=_paddle(c,False);d=_digits(t)
 if len(d)==1 and cf>=.28:out.append((int(d),cf,'Paddle-cell'))
 t,cf=_tess(c,13,'eng','0123456789');d=_digits(t)
 if len(d)==1 and cf>=.3:out.append((int(d),cf,'Tess-cell'))
 if out:return max(out,key=lambda x:x[1])+ (True,)
 return None,.15,'unresolved',True
def _money(im,which):
 xs=_bounds(im);y1,y2=((295,342) if which=='principal' else (372,418));wts=[1000000,100000,10000,1000,100,10,1];v=0;started=False;bad=False;cs=[];con=[]
 for i,(a,b) in enumerate(zip(xs[:-1],xs[1:])):
  cell=im[y1:y2,a+7:b-7];d,cf,e,ink=_digit(cell);cs.append({'position':wts[i],'digit':d,'confidence':round(cf,3),'engine':e,'has_ink':ink})
  if d is not None:
   if d!=0:started=True
   if started:v+=d*wts[i];con.append(cf)
  elif started and ink:
   if _zero(cell):cs[-1].update(digit=0,confidence=.55,engine='OpenCV-zero');con.append(.55)
   else:bad=True
 sc=sum(con)/len(con) if con else 0.;sc=min(sc,.4) if bad else sc
 rv,rr,rc,re=_best(_crop(im,ROIS[which],4),'money',lambda s:int(_digits(s)[-8:]) if _digits(s) else 0)
 if v and rv==v:return v,f'cells={v};row={rr}',min(.99,max(sc,rc)+.12),'consensus',cs
 if v and sc>=.55 and not bad:return v,f'cells={v};row={rr}',sc,'cells',cs
 if rv and rc>=.75:return rv,rr,min(rc,.72),re+'-row',cs
 return 0,f'cells={v};row={rr}',0.,'unresolved',cs
def _license_norm(raw):
 im=_decode(raw,2200);h,w=im.shape[:2];g=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY);e=cv2.Canny(cv2.GaussianBlur(g,(5,5),0),40,120);e=cv2.morphologyEx(e,cv2.MORPH_CLOSE,cv2.getStructuringElement(cv2.MORPH_RECT,(11,11)),iterations=2);cs,_=cv2.findContours(e,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE);best=None
 for c in sorted(cs,key=cv2.contourArea,reverse=True)[:80]:
  ar=cv2.contourArea(c);r=cv2.minAreaRect(c);rw,rh=r[1]
  if ar<h*w*.12 or min(rw,rh)<1:continue
  asp=max(rw,rh)/min(rw,rh)
  if 1.35<=asp<=1.82:
   sc=ar/(h*w)+.2*math.exp(-abs(asp-1.586)*3)
   if best is None or sc>best[0]:best=(sc,cv2.boxPoints(r))
 out=_warp(im,best[1],LICENSE_W,LICENSE_H) if best else cv2.resize(im,(LICENSE_W,LICENSE_H));r=cv2.rotate(out,cv2.ROTATE_180)
 return (r if _anchor(r,'license')>_anchor(out,'license') else out),bool(best)
def recognize_license(raw):
 im,det=_license_norm(raw);t,c=_tess(im,6);z=_clean(t);compact=re.sub(r'(?<=[一-龠ぁ-んァ-ヶ])\s+(?=[一-龠ぁ-んァ-ヶ])','',z);spans=re.findall(r'[一-龠々]{1,5}\s*[ぁ-んァ-ヶ]{2,8}',compact);spans=[x for x in spans if not any(b in x for b in ('山形','南陽','公安','委員','運転','免許'))];name=max(spans,key=len) if spans else '';m=re.search(r'([一-龠]{2,5}県.{2,30}?[0-9０-９ ]{2,12}番地)',compact);addr=_clean(m.group(1)) if m else ''
 return {'name':name,'address':addr,'raw':t,'confidence':round(c,3),'engine':'Tesseract-psm6','document_detected':det}
def recognize_ticket(raw,lic=None):
 im,det=normalize_ticket(raw);f={};mc={}
 for k in ('contract_date','forfeiture_due_date'):
  v,r,c,e=_best(_crop(im,ROIS[k],3),'date',_date);f[k]=_field(v,r,c,e,bool(v))
 for k in ('principal','interest'):
  v,r,c,e,cells=_money(im,k);mc[k+'_amount']=cells;f[k+'_amount']=_field(v,r,c,e,v>0)
 v,r,c,e=_best(_crop(im,ROIS['phone'],4),'phone',_phone);f['phone']=_field(v,r,c,e,bool(v))
 for k in ('name','address'):
  v,r,c,e=_best(_crop(im,ROIS[k],4),'text',_clean);f[k]=_field(v,r,c,e,bool(v and _jp(v)>=.08),th=.68)
 lines=[];con=[]
 for rk in ('item1','item2'):
  v,r,c,e=_best(_crop(im,ROIS[rk],4),'text',_clean);zz=v.replace(' ','');noise=('契約','無効','裏面','確認ください','質入品目','数量')
  if v and not any(x in zz for x in noise) and _jp(v)>=.12:lines.append(v);con.append(c)
 f['items']=_field(' / '.join(lines),'',sum(con)/len(con) if con else 0.,'Paddle/Tess',bool(lines))
 if lic:
  for k in ('name','address'):
   if lic.get(k):f[k]=_field(lic[k],lic[k],lic.get('confidence',.7),lic.get('engine','license'),True,'license',.55)
 p=int(f['principal_amount']['value'] or 0);it=int(f['interest_amount']['value'] or 0)
 if not p and it:f['interest_amount'].update(value=0,status='invalid',confidence=0,note='元金未確定')
 elif p and it and (it>=p or it/p>.25):f['interest_amount'].update(value=0,status='invalid',confidence=.1,note='元金との整合性エラー')
 cd=f['contract_date']['value'];fd=f['forfeiture_due_date']['value'];sug={}
 if cd and not fd:sug['forfeiture_due_date']=(date.fromisoformat(cd)+timedelta(days=90)).isoformat()
 req=('contract_date','forfeiture_due_date','principal_amount','interest_amount','name','phone','items');q=round((sum(f[k]['status']=='ok' for k in req)+.45*sum(f[k]['status']=='review' for k in req))/len(req),3);del im;gc.collect()
 return {'fields':f,'document_detected':det,'field_accuracy':q,'needs_review':any(f[k]['status']!='ok' for k in req),'suggestions':sug,'engine':'ROI consensus OCR','pipeline_version':PIPELINE_VERSION,'money_cells':mc,'item_lines':lines}
def runtime_status():
 try:import paddleocr;p=True
 except:p=False
 try:langs=pytesseract.get_languages(config='')
 except:langs=[]
 return {'pipeline_version':PIPELINE_VERSION,'opencv':True,'opencv_version':cv2.__version__,'paddle_import':p,'paddle_loaded':_P is not None,'paddle_failed':_PF,'paddle_error':_PE,'tesseract_jpn':'jpn' in langs,'external_ai':False}
