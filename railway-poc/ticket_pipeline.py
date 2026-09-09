import io, re, math, threading, unicodedata
from datetime import date, timedelta
import cv2
import numpy as np
import pytesseract

PIPELINE_VERSION = '3.0.0'
CANON_W, CANON_H = 1600, 850

# Calibrated from the current 質屋やまがた ticket. Values are normalized after perspective correction.
ROIS = {
    'contract_date_row': (0.125, 0.105, 0.485, 0.196),
    'forfeiture_date_row': (0.125, 0.166, 0.485, 0.257),
    'address': (0.565, 0.110, 0.925, 0.190),
    'name': (0.565, 0.174, 0.925, 0.252),
    'principal': (0.140, 0.315, 0.485, 0.405),
    'interest': (0.140, 0.405, 0.485, 0.493),
    'phone': (0.132, 0.660, 0.505, 0.754),
    'item_row1': (0.560, 0.344, 0.900, 0.405),
    'item_row2': (0.560, 0.405, 0.900, 0.462),
}

_PADDLE = None
_PADDLE_FAILED = False
_LOCK = threading.Lock()

def _decode(raw):
    im = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if im is None:
        raise ValueError('画像をデコードできません')
    return im

def _order_pts(pts):
    pts = np.asarray(pts, dtype=np.float32).reshape(4, 2)
    s = pts.sum(axis=1); d = np.diff(pts, axis=1).reshape(-1)
    return np.array([pts[np.argmin(s)], pts[np.argmin(d)], pts[np.argmax(s)], pts[np.argmax(d)]], dtype=np.float32)

def _quad_from_image(im):
    h, w = im.shape[:2]
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    white = (((hsv[:,:,2] > 135) & (hsv[:,:,1] < 105)).astype(np.uint8) * 255)
    white = cv2.morphologyEx(white, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT,(21,21)), iterations=2)
    cnts, _ = cv2.findContours(white, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates = []
    for c in cnts:
        area = cv2.contourArea(c)
        if area < h*w*.25: continue
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, .02*peri, True)
        if len(approx) == 4:
            candidates.append((area, approx.reshape(4,2)))
    if candidates:
        return _order_pts(max(candidates, key=lambda z:z[0])[1])
    if cnts:
        c = max(cnts, key=cv2.contourArea)
        if cv2.contourArea(c) > h*w*.20:
            return _order_pts(cv2.boxPoints(cv2.minAreaRect(c)))
    return None

def normalize_ticket(raw):
    im = _decode(raw)
    q = _quad_from_image(im)
    detected = q is not None
    if q is not None:
        tl,tr,br,bl = q
        width = max(np.linalg.norm(tr-tl), np.linalg.norm(br-bl))
        height = max(np.linalg.norm(bl-tl), np.linalg.norm(br-tr))
        if height > width:
            q = np.array([bl,tl,tr,br], dtype=np.float32)
        dst = np.array([[0,0],[CANON_W-1,0],[CANON_W-1,CANON_H-1],[0,CANON_H-1]], dtype=np.float32)
        M = cv2.getPerspectiveTransform(q, dst)
        out = cv2.warpPerspective(im, M, (CANON_W, CANON_H), borderValue=(255,255,255))
    else:
        if im.shape[0] > im.shape[1]:
            im = cv2.rotate(im, cv2.ROTATE_90_CLOCKWISE)
        hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
        mask = ((hsv[:,:,2] > 130) & (hsv[:,:,1] < 110)).astype(np.uint8)
        ys,xs = np.where(mask > 0)
        if len(xs) > 1000:
            x1,x2 = np.percentile(xs,[1,99]).astype(int); y1,y2=np.percentile(ys,[1,99]).astype(int)
            im = im[max(0,y1-5):min(im.shape[0],y2+5), max(0,x1-5):min(im.shape[1],x2+5)]
        out = cv2.resize(im,(CANON_W,CANON_H))
    gray=cv2.cvtColor(out,cv2.COLOR_BGR2GRAY)
    lines=cv2.HoughLinesP(cv2.Canny(gray,60,150),1,np.pi/180,90,minLineLength=500,maxLineGap=30)
    angles=[]
    if lines is not None:
        for x1,y1,x2,y2 in lines[:,0]:
            a=math.degrees(math.atan2(y2-y1,x2-x1))
            if abs(a)<3: angles.append(a)
    if angles:
        a=float(np.median(angles))
        M=cv2.getRotationMatrix2D((CANON_W/2,CANON_H/2),a,1)
        out=cv2.warpAffine(out,M,(CANON_W,CANON_H),borderValue=(255,255,255))
    return out, detected

def _crop(im, box, inset=0):
    h,w=im.shape[:2]; x1,y1,x2,y2=box
    x1=int(x1*w)+inset; x2=int(x2*w)-inset; y1=int(y1*h)+inset; y2=int(y2*h)-inset
    return im[max(0,y1):min(h,y2), max(0,x1):min(w,x2)]

def _get_paddle():
    global _PADDLE, _PADDLE_FAILED
    if _PADDLE is not None or _PADDLE_FAILED: return _PADDLE
    with _LOCK:
        if _PADDLE is not None or _PADDLE_FAILED: return _PADDLE
        try:
            from paddleocr import PaddleOCR
            _PADDLE = PaddleOCR(use_angle_cls=False, lang='japan', show_log=False, use_gpu=False)
        except Exception:
            _PADDLE_FAILED = True
    return _PADDLE

def _flatten_paddle(obj, out):
    if obj is None: return
    if isinstance(obj, (list,tuple)):
        if len(obj)==2 and isinstance(obj[0],str) and isinstance(obj[1],(int,float)):
            out.append((obj[0], float(obj[1]))); return
        if len(obj)==2 and isinstance(obj[1],(list,tuple)) and len(obj[1])==2 and isinstance(obj[1][0],str):
            try: out.append((obj[1][0], float(obj[1][1]))); return
            except: pass
        for x in obj: _flatten_paddle(x,out)

def paddle_text(im, det=True):
    ocr=_get_paddle()
    if ocr is None: return '',0.0
    try:
        res=ocr.ocr(im, cls=False, det=det, rec=True)
        vals=[]; _flatten_paddle(res,vals)
        vals=[x for x in vals if x[0].strip()]
        if not vals:return '',0.0
        return ' '.join(x[0].strip() for x in vals), float(sum(x[1] for x in vals)/len(vals))
    except Exception:
        return '',0.0

def _tess(im, psm=7, whitelist=None, lang='jpn+eng'):
    if im is None or im.size==0:return '',0.0
    g=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY) if im.ndim==3 else im.copy()
    inv=cv2.threshold(g,0,255,cv2.THRESH_BINARY_INV+cv2.THRESH_OTSU)[1]
    horiz=cv2.morphologyEx(inv,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_RECT,(max(20,g.shape[1]//5),1)))
    vert=cv2.morphologyEx(inv,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_RECT,(1,max(15,g.shape[0]//2))))
    clean=cv2.bitwise_not(cv2.subtract(inv,cv2.bitwise_or(horiz,vert)))
    clean=cv2.copyMakeBorder(clean,12,12,12,12,cv2.BORDER_CONSTANT,value=255)
    clean=cv2.resize(clean,None,fx=3.5,fy=3.5,interpolation=cv2.INTER_CUBIC)
    cfg=f'--oem 1 --psm {psm}'
    if whitelist:cfg+=f' -c tessedit_char_whitelist={whitelist}'
    try:
        d=pytesseract.image_to_data(clean,lang=lang,config=cfg,output_type=pytesseract.Output.DICT)
    except Exception:return '',0.0
    ts=[]; cs=[]
    for t,c in zip(d['text'],d['conf']):
        t=(t or '').strip()
        try:cf=float(c)
        except:cf=-1
        if t:
            ts.append(t)
            if cf>=0:cs.append(cf/100)
    return ' '.join(ts), (sum(cs)/len(cs) if cs else 0.0)

def _candidates(im, kind):
    out=[]
    pt,pc=paddle_text(im,det=(kind in ('text','multi')))
    if pt:out.append((pt,pc,'PaddleOCR'))
    if kind in ('money','phone','date'):
        wl='0123456789-/' if kind!='money' else '0123456789'
        for psm in (7,11,13):
            t,c=_tess(im,psm,wl,'eng')
            if t:out.append((t,c,'Tesseract'))
    else:
        for psm in (7,11):
            t,c=_tess(im,psm,None,'jpn+eng')
            if t:out.append((t,c,'Tesseract'))
    return out

def _digits(s):return re.sub(r'\D','',unicodedata.normalize('NFKC',s or ''))

def _parse_date(s):
    z=unicodedata.normalize('NFKC',s or '')
    ns=[int(x) for x in re.findall(r'\d+',z)]
    trials=[]
    if len(ns)>=3: trials.append((ns[0],ns[1],ns[2]))
    ds=_digits(z)
    if len(ds)>=8:trials.append((int(ds[:4]),int(ds[4:6]),int(ds[6:8])))
    if len(ds)>=6:trials.append((2000+int(ds[:2]),int(ds[2:4]),int(ds[4:6])))
    for y,m,d in trials:
        if y<100:y+=2000
        try:
            v=date(y,m,d)
            if 2020<=v.year<=2100:return v.isoformat()
        except:pass
    return ''

def _parse_money(s):
    ds=_digits(s)
    if not ds:return 0
    try:v=int(ds[-8:])
    except:return 0
    return v

def _parse_phone(s):
    ds=_digits(s)
    m=re.search(r'(070|080|090)\d{8}',ds)
    if m:
        x=m.group(0);return f'{x[:3]}-{x[3:7]}-{x[7:]}'
    if len(ds)==10 and ds.startswith('0'):return ds
    return ''

def _clean_text(s):
    s=unicodedata.normalize('NFKC',s or '')
    s=re.sub(r'[|#_=~^<>]+',' ',s)
    s=re.sub(r'\s+',' ',s).strip(' :-')
    return s

def _jp_ratio(s):
    if not s:return 0
    j=sum(1 for ch in s if '\u3040'<=ch<='\u30ff' or '\u3400'<=ch<='\u9fff')
    return j/max(1,len(s))

def _best(im, kind, parser):
    best=None
    for raw,cf,engine in _candidates(im,kind):
        val=parser(raw)
        valid=bool(val)
        score=cf
        if valid:score+=.25
        if kind in ('text','multi'):
            score+=min(.2,_jp_ratio(str(val))*.25)
            if _jp_ratio(str(val))<.12 and len(str(val))>4: score-=.25
        if kind=='phone' and valid: score+=.3
        if kind=='money' and isinstance(val,int) and 100<=val<=100_000_000:score+=.2
        if kind=='date' and valid:score+=.3
        if best is None or score>best[0]: best=(score,val,raw,cf,engine)
    if best is None:return '', '', 0.0, 'none'
    _,val,raw,cf,engine=best
    return val,raw,float(cf),engine

def _field(value,raw,cf,engine,valid,source='ticket',threshold=.76):
    if not valid:
        value='' if not isinstance(value,int) else 0
        cf=min(cf,.30)
    status='ok' if valid and cf>=threshold else ('review' if valid else 'invalid')
    return {'value':value,'raw':raw,'confidence':round(cf,3),'status':status,'engine':engine,'source':source}

def _recognize_date_row(im, roi):
    r=_crop(im,roi,2)
    return _best(r,'date',_parse_date)

def _recognize_money_row(im, roi):
    r=_crop(im,roi,3)
    val,raw,cf,engine=_best(r,'money',_parse_money)
    if isinstance(val,int) and val<100:
        return 0,raw,min(cf,.25),engine
    return val,raw,cf,engine

def _license_fields(raw):
    im=_decode(raw)
    txt,cf=paddle_text(im,det=True)
    if not txt:
        txt,cf=_tess(im,6,None,'jpn+eng')
        engine='Tesseract'
    else:engine='PaddleOCR'
    txt=_clean_text(txt)
    name='';address=''
    m=re.search(r'氏名\s*([^住生交条免有]{2,30}?)(?=住所|生年月日|交付|条件|免許|有効|$)',txt)
    if m:name=_clean_text(m.group(1))
    m=re.search(r'住所\s*(.{4,60}?)(?=生年月日|交付|条件|免許|有効|$)',txt)
    if m:address=_clean_text(m.group(1))
    return {'name':name,'address':address,'raw':txt,'confidence':cf,'engine':engine}

def recognize_ticket(ticket_raw, license_raw=None):
    sheet,det=normalize_ticket(ticket_raw)
    fields={}
    for key,roi in [('contract_date',ROIS['contract_date_row']),('forfeiture_due_date',ROIS['forfeiture_date_row'])]:
        v,r,c,e=_recognize_date_row(sheet,roi)
        fields[key]=_field(v,r,c,e,bool(v),'ticket',.72)
    for key,roi in [('principal_amount',ROIS['principal']),('interest_amount',ROIS['interest'])]:
        v,r,c,e=_recognize_money_row(sheet,roi)
        valid=isinstance(v,int) and (100<=v<=100_000_000 if key=='principal_amount' else 1<=v<=10_000_000)
        fields[key]=_field(v,r,c,e,valid,'ticket',.70)
    v,r,c,e=_best(_crop(sheet,ROIS['phone'],3),'phone',_parse_phone)
    fields['phone']=_field(v,r,c,e,bool(v),'ticket',.70)
    for key in ('address','name'):
        v,r,c,e=_best(_crop(sheet,ROIS[key],3),'text',_clean_text)
        valid=bool(v and len(v)>=2 and (_jp_ratio(v)>=.12 or c>=.88))
        fields[key]=_field(v,r,c,e,valid,'ticket',.78)
    item_parts=[]; item_conf=[]; item_raw=[]; item_engine=[]
    for rk in ('item_row1','item_row2'):
        v,r,c,e=_best(_crop(sheet,ROIS[rk],3),'text',_clean_text)
        if v and (_jp_ratio(v)>=.10 or c>=.90):
            item_parts.append(v);item_conf.append(c);item_engine.append(e)
        if r:item_raw.append(r)
    item=' / '.join(item_parts)
    ic=sum(item_conf)/len(item_conf) if item_conf else 0
    fields['items']=_field(item,' | '.join(item_raw),ic,','.join(sorted(set(item_engine))) or 'none',bool(item),'ticket',.72)
    license_diag=None
    if license_raw:
        license_diag=_license_fields(license_raw)
        for key in ('name','address'):
            val=license_diag.get(key) or ''
            if val and license_diag['confidence']>=.45:
                fields[key]=_field(val,license_diag['raw'],license_diag['confidence'],license_diag['engine'],True,'license',.65)
    p=fields['principal_amount']['value'] or 0; it=fields['interest_amount']['value'] or 0
    if p and it and it>=p:
        fields['interest_amount'].update(status='invalid',confidence=min(fields['interest_amount']['confidence'],.20),value=0)
    cd=fields['contract_date']['value']; fd=fields['forfeiture_due_date']['value']
    suggestions={}
    if cd and not fd:
        suggestions['forfeiture_due_date']=(date.fromisoformat(cd)+timedelta(days=90)).isoformat()
    required=['contract_date','forfeiture_due_date','principal_amount','interest_amount','name','phone','items']
    valid_count=sum(fields[k]['status']=='ok' for k in required)
    review_count=sum(fields[k]['status']=='review' for k in required)
    quality=(valid_count + .45*review_count)/len(required)
    return {
        'fields':fields,'document_detected':det,'field_accuracy':round(quality,3),
        'needs_review':any(fields[k]['status']!='ok' for k in required),
        'suggestions':suggestions,
        'engine':'OpenCV perspective + fixed ROI + PaddleOCR/Tesseract hybrid',
        'pipeline_version':PIPELINE_VERSION,
        'license_diagnostic':license_diag,
    }

def generic_image_text(raw):
    im=_decode(raw)
    t,c=paddle_text(im,det=True)
    if t:return t,c,'PaddleOCR'
    t,c=_tess(im,6,None,'jpn+eng')
    return t,c,'Tesseract'
