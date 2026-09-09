import re, unicodedata
import cv2
import numpy as np

HOTFIX_VERSION='6.1.0'

def _run(mask):
    best=(0,-1); start=None
    for i,v in enumerate(mask):
        if bool(v) and start is None: start=i
        if start is not None and ((not bool(v)) or i==len(mask)-1):
            end=i if bool(v) and i==len(mask)-1 else i-1
            if end-start > best[1]-best[0]: best=(start,end)
            start=None
    return best

def _license_band(tp, raw):
    im=tp._decode(raw,2200)
    h,w=im.shape[:2]
    hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV)
    # Japanese licenses are a large cyan/blue card. Use row density instead of the
    # outer contour, because glass reflections can hide the upper card edge.
    m=((hsv[:,:,0]>=85)&(hsv[:,:,0]<=118)&(hsv[:,:,1]>=18)&(hsv[:,:,1]<=170)&(hsv[:,:,2]>=95)).astype(np.uint8)
    rr=m.mean(axis=1).astype(np.float32)
    rr=cv2.GaussianBlur(rr.reshape(-1,1),(1,max(9,(h//80)|1)),0).reshape(-1)
    b=(rr>.35).astype(np.uint8)*255
    k=max(31,int(h*.09))
    b=cv2.morphologyEx(b.reshape(-1,1),cv2.MORPH_CLOSE,np.ones((k,1),np.uint8)).reshape(-1)>0
    y1,y2=_run(b)
    if y2<=y1 or (y2-y1+1)<h*.25 or (y2-y1+1)>h*.75:
        idx=np.where((rr>.35)&(np.arange(h)>h*.15)&(np.arange(h)<h*.82))[0]
        if len(idx): y1,y2=int(idx.min()),int(idx.max())
        else: return tp._license_norm(raw)
    pad=int(h*.018); y1=max(0,y1-pad); y2=min(h-1,y2+pad)
    cc=m[y1:y2+1].mean(axis=0); xs=np.where(cc>.18)[0]
    x1=max(0,int(xs.min()-w*.015)) if len(xs) else 0
    x2=min(w-1,int(xs.max()+w*.015)) if len(xs) else w-1
    crop=im[y1:y2+1,x1:x2+1]
    if crop.shape[0]>crop.shape[1]: crop=cv2.rotate(crop,cv2.ROTATE_90_CLOCKWISE)
    out=cv2.resize(crop,(tp.LICENSE_W,tp.LICENSE_H),interpolation=cv2.INTER_AREA)
    rot=cv2.rotate(out,cv2.ROTATE_180)
    if tp._anchor(rot,'license')>tp._anchor(out,'license'): out=rot
    return out,True

def _cropf(im,b):
    h,w=im.shape[:2]; x1,y1,x2,y2=b
    return im[int(y1*h):int(y2*h),int(x1*w):int(x2*w)]

def _clean_text(s):
    s=unicodedata.normalize('NFKC',s or '')
    s=re.sub(r'(?<=\d)\s+(?=\d)','',s)
    s=re.sub(r'\s+',' ',s).strip(' |:-_')
    return s

def _pick_name(text):
    z=_clean_text(text)
    z=re.sub(r'^.*?氏\s*名\s*','',z)
    z=re.split(r'生年月日|昭和|平成|令和|住所|交付',z)[0]
    # Prefer a normal Japanese surname + given-name span.
    ms=re.findall(r'([一-龠々]{1,6})\s*([ぁ-んァ-ヶ一-龠々]{1,10})',z)
    bad=('氏名','山形県','公安委員会','運転免許証')
    vals=[]
    for a,b in ms:
        v=(a+' '+b).strip()
        if not any(x in v for x in bad) and 2<=len(v.replace(' ',''))<=14: vals.append(v)
    return max(vals,key=len) if vals else z[:30]

def _pick_address(text):
    z=_clean_text(text)
    z=re.sub(r'^.*?住\s*所\s*','',z)
    z=re.split(r'交付|有効|免許|番号|条件',z)[0]
    m=re.search(r'((?:北海道|東京都|(?:京都|大阪)府|.{2,3}県).{2,50})',z)
    return _clean_text(m.group(1) if m else z[:60])

def _roi_ocr(tp, roi, psm=7):
    # Printed license text is handled first by Tesseract to avoid loading Paddle
    # just for the ID card. Paddle is used only as a fallback.
    t,tc=tp._tess(roi,psm)
    pt,pc=' ',0.0
    if tc<.55:
        pt,pc=tp._paddle(roi,True)
    if pc>tc+.08 and pt.strip(): return pt,pc,'PaddleOCR'
    return t,tc,'Tesseract'

def recognize_license(tp, raw):
    im,det=_license_band(tp,raw)
    # Empirically calibrated against the supplied Japanese license photo.
    name_roi=_cropf(im,(.01,.025,.64,.18))
    addr_roi=_cropf(im,(.01,.17,.95,.32))
    nt,nc,ne=_roi_ocr(tp,name_roi,7)
    at,ac,ae=_roi_ocr(tp,addr_roi,6)
    name=_pick_name(nt); addr=_pick_address(at)
    # Full-card fallback only if one of the structured ROIs failed.
    full='';fc=0.0
    if not name or len(name.replace(' ',''))<2 or not addr or len(addr)<5:
        full,fc=tp._tess(im,6)
        if not name or len(name.replace(' ',''))<2:
            m=re.search(r'氏\s*名\s*([^住交有免番]{2,30})',full)
            if m: name=_pick_name(m.group(1))
        if not addr or len(addr)<5:
            m=re.search(r'住\s*所\s*(.{5,70}?)(?=交付|有効|免許|番号|$)',full)
            if m: addr=_pick_address(m.group(1))
    conf=max(0.0,min(1.0,(nc+ac)/2 if name and addr else max(nc,ac,fc)*.7))
    return {'name':name,'address':addr,'raw':full or (nt+' | '+at),'confidence':round(conf,3),'engine':f'{ne}+{ae}-ROI','document_detected':det}

def apply(tp):
    original_recognize=tp.recognize_ticket
    tp._license_norm=lambda raw:_license_band(tp,raw)
    tp.recognize_license=lambda raw:recognize_license(tp,raw)
    def recognize_ticket_safe(raw,lic=None):
        r=original_recognize(raw,lic)
        # Never invent a legal/operational deadline when OCR failed.
        r['suggestions']={}
        f=r.get('fields') or {}
        p=int((f.get('principal_amount') or {}).get('value') or 0)
        it=int((f.get('interest_amount') or {}).get('value') or 0)
        if p<=0 and 'interest_amount' in f:
            f['interest_amount'].update(value=0,status='invalid',confidence=0,note='元金未確定のため利息も要確認')
        elif p>0 and it>0 and (it>=p or it/p>.25):
            f['interest_amount'].update(value=0,status='invalid',confidence=.1,note='元金との整合性エラー')
        r['pipeline_version']=HOTFIX_VERSION
        return r
    tp.recognize_ticket=recognize_ticket_safe
    old_status=tp.runtime_status
    def status():
        x=old_status(); x['pipeline_version']=HOTFIX_VERSION; x['license_roi_hotfix']=True; return x
    tp.runtime_status=status
    tp.PIPELINE_VERSION=HOTFIX_VERSION
    return tp
