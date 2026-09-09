import io, re, math, threading, unicodedata, os
from datetime import date, timedelta
import cv2
import numpy as np
import pytesseract

PIPELINE_VERSION = '4.0.0'
CANON_W, CANON_H = 1600, 850
EXPECTED_ASPECT = CANON_W / CANON_H

# Current ticket layout after perspective normalization.
ROIS = {
    'contract_date_row': (0.118, 0.128, 0.470, 0.205),
    'forfeiture_date_row': (0.118, 0.180, 0.470, 0.258),
    'address': (0.555, 0.110, 0.925, 0.188),
    'name': (0.555, 0.168, 0.925, 0.242),
    'phone': (0.135, 0.665, 0.485, 0.755),
    'item_row1': (0.565, 0.342, 0.900, 0.404),
    'item_row2': (0.565, 0.402, 0.900, 0.463),
    'principal_row': (0.135, 0.318, 0.485, 0.406),
    'interest_row': (0.135, 0.405, 0.485, 0.493),
}

_PADDLE = None
_PADDLE_FAILED = False
_LOCK = threading.Lock()

def _decode(raw):
    # PIL handles iPhone EXIF orientation. Fallback to OpenCV if Pillow cannot decode.
    try:
        from PIL import Image, ImageOps
        pil = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGB')
        return cv2.cvtColor(np.asarray(pil), cv2.COLOR_RGB2BGR)
    except Exception:
        im = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        if im is None:
            raise ValueError('画像をデコードできません')
        return im

def _order_pts(pts):
    pts = np.asarray(pts, dtype=np.float32).reshape(4, 2)
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).reshape(-1)
    return np.array([
        pts[np.argmin(s)], pts[np.argmin(d)],
        pts[np.argmax(s)], pts[np.argmax(d)]
    ], dtype=np.float32)

def _quad_aspect(q):
    tl,tr,br,bl = _order_pts(q)
    w = (np.linalg.norm(tr-tl) + np.linalg.norm(br-bl)) / 2
    h = (np.linalg.norm(bl-tl) + np.linalg.norm(br-tr)) / 2
    return max(w,h) / max(1.0, min(w,h))

def _longest_run(mask):
    best=(0,-1); start=None
    for i,v in enumerate(mask):
        if bool(v) and start is None:
            start=i
        if start is not None and ((not bool(v)) or i==len(mask)-1):
            end=i if bool(v) and i==len(mask)-1 else i-1
            if end-start > best[1]-best[0]:
                best=(start,end)
            start=None
    return best

def _page_quad_white_band(im):
    """Find a nearly-white ticket even when the desk is also partly bright.
    The critical trick is to identify the long horizontal band where most pixels
    are paper-like before looking for the contour.
    """
    h,w = im.shape[:2]
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    white = ((hsv[:,:,2] > 125) & (hsv[:,:,1] < 105)).astype(np.uint8)
    rr = white.mean(axis=1).astype(np.float32).reshape(-1,1)
    ky = max(9, (h//80)|1)
    rr = cv2.GaussianBlur(rr, (1,ky), 0).reshape(-1)
    best = None
    for thr in (0.52, 0.44, 0.36):
        y1,y2 = _longest_run(rr > thr)
        if y2 <= y1 or (y2-y1+1) < h*.28:
            continue
        pad = int(h*.015)
        y1=max(0,y1-pad); y2=min(h-1,y2+pad)
        m=np.zeros_like(white,np.uint8)
        m[y1:y2+1]=white[y1:y2+1]*255
        kx=max(15,(int(w*.02)|1)); ky2=max(9,(int(h*.012)|1))
        m=cv2.morphologyEx(m,cv2.MORPH_CLOSE,cv2.getStructuringElement(cv2.MORPH_RECT,(kx,ky2)),iterations=2)
        cnts,_=cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        for c in cnts:
            area=cv2.contourArea(c)
            if area < h*w*.20:
                continue
            q=_order_pts(cv2.boxPoints(cv2.minAreaRect(c)))
            asp=_quad_aspect(q)
            area_ratio=area/(h*w)
            aspect_score=math.exp(-abs(math.log(max(asp,1e-6)/EXPECTED_ASPECT))*2.3)
            score=area_ratio*.67 + aspect_score*.33
            if best is None or score>best[0]:
                best=(score,q)
        if best and best[0]>.55:
            break
    return best[1] if best else None

def _page_quad_edges(im):
    h,w=im.shape[:2]
    g=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY)
    g=cv2.GaussianBlur(g,(5,5),0)
    e=cv2.Canny(g,45,135)
    e=cv2.morphologyEx(e,cv2.MORPH_CLOSE,cv2.getStructuringElement(cv2.MORPH_RECT,(15,15)),iterations=1)
    cnts,_=cv2.findContours(e,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
    best=None
    for c in sorted(cnts,key=cv2.contourArea,reverse=True)[:35]:
        area=cv2.contourArea(c)
        if area < h*w*.16:
            continue
        peri=cv2.arcLength(c,True)
        for eps in (.012,.02,.03,.04):
            a=cv2.approxPolyDP(c,eps*peri,True)
            if len(a)!=4:
                continue
            q=_order_pts(a.reshape(4,2))
            asp=_quad_aspect(q)
            if not (1.25<=asp<=2.7):
                continue
            score=(area/(h*w))*.65 + math.exp(-abs(math.log(asp/EXPECTED_ASPECT))*2.2)*.35
            if best is None or score>best[0]:
                best=(score,q)
            break
    return best[1] if best else None

def _desk_crop_fallback(im):
    """Fallback for near-frontal photos: crop to the long row band that is mostly paper."""
    h,w=im.shape[:2]
    hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV)
    white=((hsv[:,:,2]>120)&(hsv[:,:,1]<115)).astype(np.uint8)
    rr=white.mean(axis=1).astype(np.float32).reshape(-1,1)
    rr=cv2.GaussianBlur(rr,(1,max(9,(h//70)|1)),0).reshape(-1)
    y1,y2=_longest_run(rr>.34)
    if y2-y1+1>=h*.30:
        pad=max(2,int(h*.008))
        return im[max(0,y1-pad):min(h,y2+pad+1)]
    return im

def normalize_ticket(raw):
    im=_decode(raw)
    if im.shape[0] > im.shape[1]:
        im=cv2.rotate(im,cv2.ROTATE_90_CLOCKWISE)
    q=_page_quad_white_band(im)
    if q is None:
        q=_page_quad_edges(im)
    detected=q is not None
    if q is not None:
        tl,tr,br,bl=q
        qw=(np.linalg.norm(tr-tl)+np.linalg.norm(br-bl))/2
        qh=(np.linalg.norm(bl-tl)+np.linalg.norm(br-tr))/2
        if qh>qw:
            q=np.array([bl,tl,tr,br],dtype=np.float32)
        dst=np.array([[0,0],[CANON_W-1,0],[CANON_W-1,CANON_H-1],[0,CANON_H-1]],dtype=np.float32)
        M=cv2.getPerspectiveTransform(q,dst)
        out=cv2.warpPerspective(im,M,(CANON_W,CANON_H),borderValue=(255,255,255))
    else:
        im=_desk_crop_fallback(im)
        out=cv2.resize(im,(CANON_W,CANON_H),interpolation=cv2.INTER_AREA)

    # Deskew from long horizontal printed/grid lines.
    gray=cv2.cvtColor(out,cv2.COLOR_BGR2GRAY)
    lines=cv2.HoughLinesP(cv2.Canny(gray,60,150),1,np.pi/180,100,minLineLength=450,maxLineGap=35)
    angles=[]
    if lines is not None:
        for x1,y1,x2,y2 in lines[:,0]:
            a=math.degrees(math.atan2(y2-y1,x2-x1))
            if abs(a)<2.8:
                angles.append(a)
    if angles:
        a=float(np.median(angles))
        if abs(a)>.08:
            M=cv2.getRotationMatrix2D((CANON_W/2,CANON_H/2),a,1)
            out=cv2.warpAffine(out,M,(CANON_W,CANON_H),borderValue=(255,255,255))
    return out,detected

def _crop(im,box,inset=0):
    h,w=im.shape[:2]
    x1,y1,x2,y2=box
    x1=int(x1*w)+inset; x2=int(x2*w)-inset
    y1=int(y1*h)+inset; y2=int(y2*h)-inset
    return im[max(0,y1):min(h,y2),max(0,x1):min(w,x2)]

def _get_paddle():
    global _PADDLE,_PADDLE_FAILED
    if _PADDLE is not None or _PADDLE_FAILED:
        return _PADDLE
    with _LOCK:
        if _PADDLE is not None or _PADDLE_FAILED:
            return _PADDLE
        try:
            from paddleocr import PaddleOCR
            _PADDLE=PaddleOCR(use_angle_cls=False,lang='japan',show_log=False,use_gpu=False)
        except Exception:
            _PADDLE_FAILED=True
    return _PADDLE

def _flatten_paddle(obj,out):
    if obj is None:
        return
    if isinstance(obj,(list,tuple)):
        if len(obj)==2 and isinstance(obj[0],str) and isinstance(obj[1],(int,float)):
            out.append((obj[0],float(obj[1]))); return
        if len(obj)==2 and isinstance(obj[1],(list,tuple)) and len(obj[1])==2 and isinstance(obj[1][0],str):
            try:
                out.append((obj[1][0],float(obj[1][1]))); return
            except Exception:
                pass
        for x in obj:
            _flatten_paddle(x,out)

def paddle_text(im,det=True):
    ocr=_get_paddle()
    if ocr is None or im is None or im.size==0:
        return '',0.0
    try:
        res=ocr.ocr(im,cls=False,det=det,rec=True)
        vals=[]; _flatten_paddle(res,vals)
        vals=[x for x in vals if x[0].strip()]
        if not vals:
            return '',0.0
        return ' '.join(x[0].strip() for x in vals),float(sum(x[1] for x in vals)/len(vals))
    except Exception:
        return '',0.0

def _prepare_ocr(im,scale=3.4):
    g=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY) if im.ndim==3 else im.copy()
    inv=cv2.threshold(g,0,255,cv2.THRESH_BINARY_INV+cv2.THRESH_OTSU)[1]
    # Remove long form lines while preserving handwriting.
    horiz=cv2.morphologyEx(inv,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_RECT,(max(24,g.shape[1]//4),1)))
    vert=cv2.morphologyEx(inv,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_RECT,(1,max(18,g.shape[0]//2))))
    ink=cv2.subtract(inv,cv2.bitwise_or(horiz,vert))
    clean=cv2.bitwise_not(ink)
    clean=cv2.copyMakeBorder(clean,12,12,12,12,cv2.BORDER_CONSTANT,value=255)
    return cv2.resize(clean,None,fx=scale,fy=scale,interpolation=cv2.INTER_CUBIC)

def _tess(im,psm=7,whitelist=None,lang='jpn+eng'):
    if im is None or im.size==0:
        return '',0.0
    clean=_prepare_ocr(im)
    cfg=f'--oem 1 --psm {psm}'
    if whitelist:
        cfg+=f' -c tessedit_char_whitelist={whitelist}'
    try:
        d=pytesseract.image_to_data(clean,lang=lang,config=cfg,output_type=pytesseract.Output.DICT)
    except Exception:
        return '',0.0
    ts=[]; cs=[]
    for t,c in zip(d.get('text',[]),d.get('conf',[])):
        t=(t or '').strip()
        try: cf=float(c)
        except Exception: cf=-1
        if t:
            ts.append(t)
            if cf>=0: cs.append(cf/100)
    return ' '.join(ts),(sum(cs)/len(cs) if cs else 0.0)

def _digits(s):
    return re.sub(r'\D','',unicodedata.normalize('NFKC',s or ''))

def _parse_date(s):
    z=unicodedata.normalize('NFKC',s or '')
    ns=[int(x) for x in re.findall(r'\d+',z)]
    trials=[]
    if len(ns)>=3:
        trials.append((ns[0],ns[1],ns[2]))
    ds=_digits(z)
    if len(ds)>=8:
        trials.append((int(ds[:4]),int(ds[4:6]),int(ds[6:8])))
    if len(ds)>=6:
        trials.append((2000+int(ds[:2]),int(ds[2:4]),int(ds[4:6])))
    for y,m,d in trials:
        if y<100: y+=2000
        try:
            v=date(y,m,d)
            if 2020<=v.year<=2100:
                return v.isoformat()
        except Exception:
            pass
    return ''

def _parse_money(s):
    ds=_digits(s)
    if not ds:
        return 0
    try:
        return int(ds[-8:])
    except Exception:
        return 0

def _parse_phone(s):
    ds=_digits(s)
    # Mobile first.
    m=re.search(r'(070|080|090)\d{8}',ds)
    if m:
        x=m.group(0)
        return f'{x[:3]}-{x[3:7]}-{x[7:]}'
    # Japanese landline: retain digits; formatting is left to operator review.
    if 10<=len(ds)<=11 and ds.startswith('0'):
        return ds
    return ''

def _clean_text(s):
    s=unicodedata.normalize('NFKC',s or '')
    s=re.sub(r'[|#_=~^<>]+',' ',s)
    s=re.sub(r'\s+',' ',s).strip(' :-')
    return s

def _jp_ratio(s):
    if not s:
        return 0.0
    j=sum(1 for ch in s if '\u3040'<=ch<='\u30ff' or '\u3400'<=ch<='\u9fff')
    return j/max(1,len(s))

def _candidates(im,kind):
    out=[]
    pt,pc=paddle_text(im,det=(kind in ('text','multi')))
    if pt:
        out.append((pt,pc,'PaddleOCR'))
    if kind in ('money','phone','date'):
        wl='0123456789-/' if kind!='money' else '0123456789'
        for psm in (7,11,13):
            t,c=_tess(im,psm,wl,'eng')
            if t:
                out.append((t,c,'Tesseract'))
    else:
        for psm in (6,7,11):
            t,c=_tess(im,psm,None,'jpn+eng')
            if t:
                out.append((t,c,'Tesseract'))
    return out

def _best(im,kind,parser):
    best=None
    for raw,cf,engine in _candidates(im,kind):
        val=parser(raw)
        valid=bool(val)
        score=cf + (.25 if valid else 0)
        if kind in ('text','multi'):
            score+=min(.18,_jp_ratio(str(val))*.22)
            if _jp_ratio(str(val))<.10 and len(str(val))>4:
                score-=.22
        if kind=='phone' and valid: score+=.30
        if kind=='money' and isinstance(val,int) and 100<=val<=100_000_000: score+=.20
        if kind=='date' and valid: score+=.30
        if best is None or score>best[0]:
            best=(score,val,raw,cf,engine)
    if best is None:
        return '', '',0.0,'none'
    _,val,raw,cf,engine=best
    return val,raw,float(cf),engine

def _field(value,raw,cf,engine,valid,source='ticket',threshold=.74,note=''):
    if not valid:
        value='' if not isinstance(value,int) else 0
        cf=min(cf,.30)
    status='ok' if valid and cf>=threshold else ('review' if valid else 'invalid')
    d={'value':value,'raw':raw,'confidence':round(float(cf),3),'status':status,'engine':engine,'source':source}
    if note:
        d['note']=note
    return d

def _recognize_date_row(im,roi):
    r=_crop(im,roi,2)
    return _best(r,'date',_parse_date)

def _detect_money_x_bounds(im):
    """Locate the seven equal-width monetary cells.
    Returns 8 x-boundaries. Falls back to calibrated template positions.
    """
    g=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY)
    inv=(g<165).astype(np.uint8)*255
    y1,y2=int(CANON_H*.30),int(CANON_H*.50)
    reg=inv[y1:y2,:int(CANON_W*.52)]
    vert=cv2.morphologyEx(reg,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_RECT,(1,55)))
    p=(vert>0).sum(axis=0)
    xs=np.where(p>42)[0]
    centers=[]
    if len(xs):
        s=xs[0]; prev=xs[0]
        for x in xs[1:]:
            if x>prev+1:
                centers.append((s+prev)//2); s=x
            prev=x
        centers.append((s+prev)//2)
    centers=[x for x in centers if int(CANON_W*.14)<=x<=int(CANON_W*.50)]
    # Collapse and find the boundary nearest template start (~290 px).
    if len(centers)>=7:
        start_idx=min(range(len(centers)),key=lambda i:abs(centers[i]-int(CANON_W*.181)))
        seq=centers[start_idx:start_idx+8]
        if len(seq)>=7:
            diffs=np.diff(seq)
            med=float(np.median(diffs)) if len(diffs) else CANON_W*.042
            if 48<=med<=84:
                while len(seq)<8:
                    seq.append(int(round(seq[-1]+med)))
                if max(abs(d-med) for d in np.diff(seq))<18:
                    return [int(x) for x in seq[:8]]
    return [290,358,425,492,560,628,695,762]

def _ink_ratio(cell):
    g=cv2.cvtColor(cell,cv2.COLOR_BGR2GRAY) if cell.ndim==3 else cell
    bw=cv2.threshold(g,0,255,cv2.THRESH_BINARY_INV+cv2.THRESH_OTSU)[1]
    if min(bw.shape)>8:
        bw[:4]=0; bw[-4:]=0; bw[:,:4]=0; bw[:,-4:]=0
    return float(np.count_nonzero(bw)/max(1,bw.size))

def _zero_like(cell):
    """Conservative zero detector used only when OCR leaves an inked money cell unresolved."""
    g=cv2.cvtColor(cell,cv2.COLOR_BGR2GRAY) if cell.ndim==3 else cell
    bw=cv2.threshold(g,0,255,cv2.THRESH_BINARY_INV+cv2.THRESH_OTSU)[1]
    if min(bw.shape)>10:
        bw[:5]=0; bw[-5:]=0; bw[:,:5]=0; bw[:,-5:]=0
    bw=cv2.morphologyEx(bw,cv2.MORPH_CLOSE,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5)),iterations=1)
    cnts,hier=cv2.findContours(bw,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_SIMPLE)
    if hier is None:
        return False
    hier=hier[0]
    for i,c in enumerate(cnts):
        if hier[i][3]!=-1:
            continue
        area=cv2.contourArea(c)
        if area<30:
            continue
        x,y,w,h=cv2.boundingRect(c)
        if w<10 or h<12:
            continue
        child=hier[i][2]
        hole_area=0.0
        while child!=-1:
            hole_area+=cv2.contourArea(cnts[child])
            child=hier[child][0]
        if hole_area>20 and .45<=w/max(1,h)<=1.8 and hole_area/max(area,1)>.12:
            return True
    return False

def _digit_cell(cell):
    cand=[]
    # Paddle recognition-only is useful for handwritten single digits.
    pt,pc=paddle_text(cell,det=False)
    ds=_digits(pt)
    if len(ds)==1 and pc>=.30:
        cand.append((ds,pc,'PaddleOCR-cell'))
    for psm in (10,13):
        t,c=_tess(cell,psm,'0123456789','eng')
        ds=_digits(t)
        if len(ds)==1 and c>=.22:
            cand.append((ds,c,'Tesseract-cell'))
    if cand:
        cand.sort(key=lambda z:z[1],reverse=True)
        d,cf,e=cand[0]
        return int(d),float(cf),e,False
    ir=_ink_ratio(cell)
    if ir<.018:
        return None,0.0,'blank',False
    # Do not infer zero here: characters such as handwritten 4/9 can contain a loop.
    # Zero-shape fallback is applied only *after* a reliable non-zero digit was seen.
    return None,.18,'unresolved-ink',True

def _structured_money(im,which):
    xb=_detect_money_x_bounds(im)
    if which=='principal':
        y1,y2=int(CANON_H*.343),int(CANON_H*.402)
    else:
        y1,y2=int(CANON_H*.432),int(CANON_H*.487)
    weights=[1_000_000,100_000,10_000,1_000,100,10,1]
    cells=[]; value=0; seen=False; unresolved=False; confs=[]
    for i,(x1,x2) in enumerate(zip(xb[:-1],xb[1:])):
        cell=im[y1:y2,max(0,x1+6):min(CANON_W,x2-6)]
        d,cf,e,has_ink=_digit_cell(cell)
        cells.append({'position':weights[i],'digit':d,'confidence':round(cf,3),'engine':e,'has_ink':has_ink})
        if d is not None:
            if d!=0:
                seen=True
            if seen or d!=0:
                value += int(d)*weights[i]
                confs.append(cf)
        elif seen and has_ink:
            # Once the first reliable non-zero digit establishes the amount, an
            # unresolved loop-shaped trailing cell may safely be treated as zero.
            if _zero_like(cell):
                cells[-1].update(digit=0,confidence=.52,engine='OpenCV-zero-after-digit')
                confs.append(.52)
            else:
                unresolved=True
    if not seen:
        value=0
    cf=(sum(confs)/len(confs) if confs else 0.0)
    if unresolved:
        cf=min(cf,.45)
    return value,cf,cells,unresolved

def _recognize_money_row(im,roi,which):
    structured,sc,cells,unresolved=_structured_money(im,which)
    row=_crop(im,roi,3)
    rv,rr,rc,re=_best(row,'money',_parse_money)
    candidates=[]
    if structured>0:
        candidates.append((sc+.28,structured,'cells',sc))
    if isinstance(rv,int) and rv>0:
        candidates.append((rc+.20,rv,re,rc))
    if not candidates:
        return 0,rr,0.0,'none',cells
    # Agreement gets a confidence bonus.
    if structured>0 and isinstance(rv,int) and rv>0 and structured==rv:
        return structured,f'cells={structured}; row={rr}',min(.99,max(sc,rc)+.12),'structured+row',cells
    candidates.sort(key=lambda x:x[0],reverse=True)
    _,v,e,cf=candidates[0]
    note='; unresolved cell' if unresolved else ''
    return v,f'cells={structured}; row={rr}{note}',float(cf),e,cells

def _license_fields(raw):
    im=_decode(raw)
    # Normalize orientation only; license layouts vary enough that full-document OCR + label parsing is safer.
    if im.shape[0]>im.shape[1]:
        im=cv2.rotate(im,cv2.ROTATE_90_CLOCKWISE)
    txt,cf=paddle_text(im,det=True)
    engine='PaddleOCR'
    if not txt:
        txt,cf=_tess(im,6,None,'jpn+eng')
        engine='Tesseract'
    txt=_clean_text(txt)
    # Remove common label noise and use label-anchored spans.
    name=''; address=''
    for pat in (
        r'氏名\s*[:：]?\s*([^住生交条免有番]{2,35}?)(?=住所|生年月日|交付|条件|免許|有効|番号|$)',
        r'名\s*[:：]?\s*([^住生交条免有番]{2,25}?)(?=住所|生年月日|交付|条件|免許|有効|番号|$)',
    ):
        m=re.search(pat,txt)
        if m:
            name=_clean_text(m.group(1)); break
    for pat in (
        r'住所\s*[:：]?\s*(.{4,70}?)(?=生年月日|交付|条件|免許|有効|番号|$)',
        r'住\s*所\s*[:：]?\s*(.{4,70}?)(?=生年月日|交付|条件|免許|有効|番号|$)',
    ):
        m=re.search(pat,txt)
        if m:
            address=_clean_text(m.group(1)); break
    return {'name':name,'address':address,'raw':txt,'confidence':float(cf),'engine':engine}

def recognize_ticket(ticket_raw,license_raw=None):
    sheet,det=normalize_ticket(ticket_raw)
    fields={}

    for key,roi in (
        ('contract_date',ROIS['contract_date_row']),
        ('forfeiture_due_date',ROIS['forfeiture_date_row']),
    ):
        v,r,c,e=_recognize_date_row(sheet,roi)
        fields[key]=_field(v,r,c,e,bool(v),'ticket',.68)

    money_cells={}
    for key,roi,which in (
        ('principal_amount',ROIS['principal_row'],'principal'),
        ('interest_amount',ROIS['interest_row'],'interest'),
    ):
        v,r,c,e,cells=_recognize_money_row(sheet,roi,which)
        money_cells[key]=cells
        valid=isinstance(v,int) and (100<=v<=100_000_000 if key=='principal_amount' else 1<=v<=10_000_000)
        fields[key]=_field(v,r,c,e,valid,'ticket',.66)

    v,r,c,e=_best(_crop(sheet,ROIS['phone'],4),'phone',_parse_phone)
    fields['phone']=_field(v,r,c,e,bool(v),'ticket',.66)

    for key in ('address','name'):
        v,r,c,e=_best(_crop(sheet,ROIS[key],4),'text',_clean_text)
        valid=bool(v and len(v)>=2 and (_jp_ratio(v)>=.10 or c>=.88))
        fields[key]=_field(v,r,c,e,valid,'ticket',.74)

    item_parts=[]; item_raw=[]; item_conf=[]; item_engines=[]
    for rk in ('item_row1','item_row2'):
        v,r,c,e=_best(_crop(sheet,ROIS[rk],4),'text',_clean_text)
        if r:
            item_raw.append(r)
        if v and len(v)>=1 and (_jp_ratio(v)>=.08 or c>=.86):
            item_parts.append(v); item_conf.append(c); item_engines.append(e)
    item=' / '.join(item_parts)
    ic=sum(item_conf)/len(item_conf) if item_conf else 0.0
    fields['items']=_field(item,' | '.join(item_raw),ic,','.join(sorted(set(item_engines))) or 'none',bool(item),'ticket',.68)

    license_diag=None
    if license_raw:
        license_diag=_license_fields(license_raw)
        for key in ('name','address'):
            lv=license_diag.get(key) or ''
            # Printed license data wins if it was actually extracted.
            if lv and len(lv)>=2 and license_diag['confidence']>=.42:
                fields[key]=_field(lv,lv,license_diag['confidence'],license_diag['engine'],True,'license',.60)

    # Cross-field business validations.
    p=int(fields['principal_amount']['value'] or 0)
    it=int(fields['interest_amount']['value'] or 0)
    if p and it and it>=p:
        fields['interest_amount'].update(status='invalid',confidence=min(fields['interest_amount']['confidence'],.20),value=0,note='利息が元金以上')
    if p and it and it/p>.25:
        fields['interest_amount'].update(status='review',confidence=min(fields['interest_amount']['confidence'],.55),note='利息率が高いため要確認')

    cd=fields['contract_date']['value']; fd=fields['forfeiture_due_date']['value']
    suggestions={}
    if cd and not fd:
        suggestions['forfeiture_due_date']=(date.fromisoformat(cd)+timedelta(days=90)).isoformat()
    if cd and fd:
        try:
            d1=date.fromisoformat(cd); d2=date.fromisoformat(fd)
            if d2<=d1 or (d2-d1).days>180:
                fields['forfeiture_due_date'].update(status='review',confidence=min(fields['forfeiture_due_date']['confidence'],.50),note='契約日との日付関係を確認')
        except Exception:
            pass

    required=['contract_date','forfeiture_due_date','principal_amount','interest_amount','name','phone','items']
    ok=sum(fields[k]['status']=='ok' for k in required)
    review=sum(fields[k]['status']=='review' for k in required)
    quality=(ok+.45*review)/len(required)
    return {
        'fields':fields,
        'document_detected':det,
        'field_accuracy':round(float(quality),3),
        'needs_review':any(fields[k]['status']!='ok' for k in required),
        'suggestions':suggestions,
        'engine':'OpenCV document normalization + structured ticket ROI + PaddleOCR/Tesseract hybrid',
        'pipeline_version':PIPELINE_VERSION,
        'license_diagnostic':({k:license_diag.get(k) for k in ('name','address','confidence','engine')} if license_diag else None),
        'money_cells':money_cells,
    }

def generic_image_text(raw):
    im=_decode(raw)
    t,c=paddle_text(im,det=True)
    if t:
        return t,c,'PaddleOCR'
    t,c=_tess(im,6,None,'jpn+eng')
    return t,c,'Tesseract'

def runtime_status():
    try:
        import cv2 as _cv2
        cv_ok=True; cv_ver=_cv2.__version__
    except Exception:
        cv_ok=False; cv_ver=''
    try:
        import paddleocr as _po
        paddle_import=True
    except Exception:
        paddle_import=False
    try:
        langs=pytesseract.get_languages(config='')
    except Exception:
        langs=[]
    model_dir=os.path.expanduser('~/.paddleocr/whl/rec/japan')
    return {
        'pipeline_version':PIPELINE_VERSION,
        'opencv':cv_ok,
        'opencv_version':cv_ver,
        'paddle_import':paddle_import,
        'paddle_japan_model_cached':os.path.isdir(model_dir),
        'tesseract_jpn':'jpn' in langs,
        'external_ai':False,
    }
