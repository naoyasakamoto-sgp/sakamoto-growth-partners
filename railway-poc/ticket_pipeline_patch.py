import gc
import re
import unicodedata

import cv2
import numpy as np

PATCH_VERSION='7.0.1'
LICENSE_W,LICENSE_H=1400,882
LICENSE_ROIS={
    'name':(.055,.045,.610,.185),
    'address':(.050,.200,.700,.325),
}
_tp=None


def _crop(im,box,inset=0):
    h,w=im.shape[:2]
    x1,y1,x2,y2=box
    return im[max(0,int(y1*h)+inset):min(h,int(y2*h)-inset),max(0,int(x1*w)+inset):min(w,int(x2*w)-inset)]


def _color_crop(im):
    h,w=im.shape[:2]
    b,g,r=cv2.split(im)
    mask=((b.astype(np.int16)-r.astype(np.int16)>18)&(b>80)&(g>65)).astype(np.uint8)
    row=mask.mean(1).astype(np.float32)
    row=cv2.GaussianBlur(row.reshape(-1,1),(1,max(9,(h//80)|1)),0).ravel()
    rb=(row>.28).astype(np.uint8)*255
    rb=cv2.morphologyEx(rb.reshape(-1,1),cv2.MORPH_CLOSE,np.ones((max(11,h//50),1),np.uint8)).ravel()
    ys=np.where(rb>0)[0]
    if not len(ys):return None
    runs=[];start=prev=ys[0]
    for y in ys[1:]:
        if y>prev+1:runs.append((start,prev));start=y
        prev=y
    runs.append((start,prev))
    y1,y2=max(runs,key=lambda z:z[1]-z[0])
    if y2-y1+1<h*.28:return None
    band=mask[max(0,y1):min(h,y2+1)]
    col=band.mean(0)
    cb=(col>.18).astype(np.uint8)*255
    cb=cv2.morphologyEx(cb.reshape(1,-1),cv2.MORPH_CLOSE,np.ones((1,max(11,w//50)),np.uint8)).ravel()
    xs=np.where(cb>0)[0]
    x1,x2=(int(xs[0]),int(xs[-1])) if len(xs) else (0,w-1)
    py=max(4,int((y2-y1+1)*.03));px=max(4,int((x2-x1+1)*.02))
    crop=im[max(0,y1-py):min(h,y2+py+1),max(0,x1-px):min(w,x2+px+1)]
    ch,cw=crop.shape[:2]
    if ch<50 or cw<80 or not 1.25<=cw/ch<=1.85:return None
    return crop


def normalize_license(raw):
    im=_tp._decode(raw,2200)
    crop=_color_crop(im)
    if crop is not None:
        out=cv2.resize(crop,(LICENSE_W,LICENSE_H),interpolation=cv2.INTER_AREA);det=True
    else:
        # Keep the v6 geometric fallback, but use it only when full-card color segmentation fails.
        try:
            out,det=_tp._license_norm(raw)
        except Exception:
            out=cv2.resize(im,(LICENSE_W,LICENSE_H),interpolation=cv2.INTER_AREA);det=False
    rot=cv2.rotate(out,cv2.ROTATE_180)
    try:
        if _tp._anchor(rot,'license')>_tp._anchor(out,'license'):out=rot
    except Exception:
        pass
    del im
    return out,det


def _join(text):
    z=_tp._clean(text or '')
    z=re.sub(r'(?<=[一-龠々ぁ-んァ-ヶ])\s+(?=[一-龠々ぁ-んァ-ヶ])','',z)
    z=re.sub(r'(?<=\d)\s+(?=\d)','',z)
    return z


def _name(text):
    z=_join(text)
    z=re.sub(r'^.*?氏\s*名\s*','',z)
    z=re.sub(r'(昭和|平成|令和|生年月日).*$', '',z)
    compact=re.sub(r'[^一-龠々ぁ-んァ-ヶー]','',z)
    m=re.search(r'([一-龠々]{1,6}[ぁ-んァ-ヶー]{2,10})',compact)
    if m:return m.group(1)
    m=re.search(r'([一-龠々]{2,8})',compact)
    return m.group(1) if m and m.group(1) not in ('氏名','住所','交付','免許','有効') else ''


def _address(text):
    z=_join(text)
    z=re.sub(r'^.*?住\s*所\s*','',z)
    z=re.sub(r'(交付|条件|免許|有効).*$', '',z)
    z=unicodedata.normalize('NFKC',re.sub(r'\s+','',z))
    z=re.sub(r'[^一-龠々ぁ-んァ-ヶー0-9\-]+','',z)
    m=re.search(r'([一-龠々]{2,5}(?:都|道|府|県).+)',z)
    if m:z=m.group(1)
    z=z.lstrip('所')
    return z if len(z)>=6 and _tp._jp(z)>=.25 else ''


def _field_candidate(roi,parser):
    vals=[]
    for psm in (7,6,13):
        t,c=_tp._tess(roi,psm)
        v=parser(t)
        if v:vals.append((v,t,float(c),f'Tesseract-psm{psm}'))
    if not vals:
        try:
            t,c=_tp._paddle(roi,True);v=parser(t)
            if v:vals.append((v,t,float(c),'PaddleOCR'))
        except Exception:pass
    return max(vals,key=lambda x:x[2]) if vals else ('','',0.0,'none')


def recognize_license(raw):
    im,det=normalize_license(raw)
    name,nraw,nc,ne=_field_candidate(_crop(im,LICENSE_ROIS['name'],2),_name)
    addr,araw,ac,ae=_field_candidate(_crop(im,LICENSE_ROIS['address'],2),_address)
    # Full-card fallback only if the fixed printed-field ROI did not resolve.
    if not name or not addr:
        ft,fc=_tp._tess(im,6)
        if not name:
            m=re.search(r'氏\s*名\s*([^住生交条免有番]{2,30}?)(?=住所|生年月日|交付|$)',ft)
            if m:
                v=_name('氏名 '+m.group(1))
                if v:name,nraw,nc,ne=v,m.group(1),fc,'Tesseract-full-fallback'
        if not addr:
            m=re.search(r'住\s*所\s*(.{5,60}?)(?=交付|条件|免許|有効|$)',ft)
            if m:
                v=_address('住所 '+m.group(1))
                if v:addr,araw,ac,ae=v,m.group(1),fc,'Tesseract-full-fallback'
    cs=[x for x in (nc if name else 0,ac if addr else 0) if x>0]
    conf=sum(cs)/len(cs) if cs else 0.0
    del im;gc.collect()
    return {'name':name,'address':addr,'raw':{'name':nraw,'address':araw},'confidence':round(float(conf),3),'engine':f'{ne}/{ae}','document_detected':det}


def mobile_only(text):
    ds=_tp._digits(text)
    m=re.search(r'(070|080|090)\d{8}',ds)
    if not m:return ''
    x=m.group(0)
    return f'{x[:3]}-{x[3:7]}-{x[7:]}'


def apply(module):
    global _tp
    _tp=module
    module.normalize_license=normalize_license
    module.recognize_license=recognize_license
    module._phone=mobile_only
    module.PIPELINE_VERSION=PATCH_VERSION
    return module
