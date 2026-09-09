import io, re, unicodedata, math
from datetime import date, timedelta
import cv2
import numpy as np
import pytesseract

ROIS = {
    "contract_date": (0.135,0.115,0.480,0.190),
    "forfeiture_due_date": (0.135,0.190,0.480,0.260),
    "principal_amount": (0.135,0.300,0.490,0.405),
    "interest_amount": (0.135,0.405,0.490,0.505),
    "address": (0.575,0.105,0.905,0.180),
    "name": (0.575,0.175,0.905,0.250),
    "phone": (0.130,0.650,0.455,0.750),
    "items": (0.565,0.300,0.890,0.520),
}

def decode(raw):
    im=cv2.imdecode(np.frombuffer(raw,np.uint8),cv2.IMREAD_COLOR)
    if im is None: raise ValueError("画像をデコードできません")
    return im

def normalize_sheet(im):
    """White-sheet detection + skew correction + fixed canonical size."""
    h,w=im.shape[:2]
    hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV)
    mask=((hsv[:,:,2]>125)&(hsv[:,:,1]<100)).astype(np.uint8)
    row=mask.mean(axis=1); runs=[]; st=None
    for i,v in enumerate(row):
        if v>0.55 and st is None: st=i
        if (v<=0.55 or i==h-1) and st is not None:
            en=i if v<=0.55 else i+1
            if en-st>h*.25:runs.append((st,en))
            st=None
    detected=bool(runs)
    if runs:
        y1,y2=max(runs,key=lambda x:x[1]-x[0])
        col=mask[y1:y2].mean(axis=0); xs=np.where(col>.45)[0]
        x1,x2=(int(xs[0]),int(xs[-1])+1) if len(xs) else (0,w)
        im=im[max(0,y1-8):min(h,y2+8),max(0,x1-8):min(w,x2+8)]
    if im.shape[0]>im.shape[1]: im=cv2.rotate(im,cv2.ROTATE_90_CLOCKWISE)
    gray=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY)
    lines=cv2.HoughLinesP(cv2.Canny(gray,50,150),1,np.pi/180,80,
                          minLineLength=max(100,int(im.shape[1]*.35)),maxLineGap=25)
    angles=[]
    if lines is not None:
        for l in lines[:,0]:
            x1,y1,x2,y2=map(int,l); a=math.degrees(math.atan2(y2-y1,x2-x1))
            if abs(a)<6: angles.append(a)
    if angles:
        a=float(np.median(angles))
        M=cv2.getRotationMatrix2D((im.shape[1]/2,im.shape[0]/2),a,1)
        im=cv2.warpAffine(im,M,(im.shape[1],im.shape[0]),borderValue=(255,255,255))
    return cv2.resize(im,(1600,850)),detected

def crop(im,box):
    h,w=im.shape[:2];x1,y1,x2,y2=box
    return im[int(y1*h):int(y2*h),int(x1*w):int(x2*w)]

def variants(c):
    g=cv2.cvtColor(c,cv2.COLOR_BGR2GRAY) if c.ndim==3 else c
    if max(g.shape)<900:g=cv2.resize(g,None,fx=2,fy=2,interpolation=cv2.INTER_CUBIC)
    cl=cv2.createCLAHE(2.2,(8,8)).apply(g)
    bl=cv2.GaussianBlur(cl,(3,3),0)
    return [cl,cv2.threshold(bl,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)[1],
            cv2.adaptiveThreshold(bl,255,cv2.ADAPTIVE_THRESH_GAUSSIAN_C,cv2.THRESH_BINARY,31,11)]

def tess(im,lang="jpn+eng",psm=7,whitelist=None):
    cfg=f"--oem 1 --psm {psm}"
    if whitelist: cfg+=f" -c tessedit_char_whitelist={whitelist}"
    d=pytesseract.image_to_data(im,lang=lang,config=cfg,output_type=pytesseract.Output.DICT)
    out=[]; conf=[]
    for t,c in zip(d["text"],d["conf"]):
        t=(t or "").strip()
        try:cf=float(c)
        except:cf=-1
        if t:
            out.append(t)
            if cf>=0:conf.append(cf/100)
    return " ".join(out),sum(conf)/len(conf) if conf else 0

def multi(c,kind):
    cfg={
      "date":[("eng",6,None),("jpn+eng",7,None),("eng",11,None)],
      "money":[("eng",11,"0123456789"),("eng",7,"0123456789"),("jpn+eng",13,"0123456789")],
      "phone":[("eng",7,"0123456789-"),("eng",11,"0123456789-")],
      "text":[("jpn+eng",7,None),("jpn+eng",6,None),("jpn+eng",11,None)],
      "multi":[("jpn+eng",6,None),("jpn+eng",11,None)]
    }[kind]
    ans=[]
    for v in variants(c):
        for lang,psm,wl in cfg:
            try:
                t,cf=tess(v,lang,psm,wl)
                if t:ans.append((t,cf))
            except:pass
    if not ans:return "",0
    ans.sort(key=lambda x:x[1]+min(len(x[0]),25)*.002,reverse=True)
    return ans[0]

def clean(s):
    s=unicodedata.normalize("NFKC",s or "")
    s=re.sub(r"[|#_=~^<>]+"," ",s)
    return re.sub(r"\s+"," ",s).strip(" :-")

def digits(s):return re.sub(r"\D","",unicodedata.normalize("NFKC",s or ""))

def parse_date(s):
    z=unicodedata.normalize("NFKC",s or "")
    ns=[int(x) for x in re.findall(r"\d+",z)]
    if len(ns)>=3:
        y,m,d=ns[0],ns[1],ns[2]
        if y<100:y+=2000
        try:return date(y,m,d).isoformat()
        except:pass
    ds=digits(z)
    for n in (8,6):
        if len(ds)>=n:
            x=ds[:n]
            try:
                return date(int(x[:4]),int(x[4:6]),int(x[6:8])).isoformat() if n==8 else date(2000+int(x[:2]),int(x[2:4]),int(x[4:6])).isoformat()
            except:pass
    return ""

def parse_money(s):
    z=digits(s)
    if not z:return 0
    vals=[int(x) for x in re.findall(r"\d{1,8}",z)]
    return vals[0] if vals else 0

def parse_phone(s):
    ds=digits(s)
    if len(ds)==11 and ds[:3] in ("070","080","090"):return f"{ds[:3]}-{ds[3:7]}-{ds[7:]}"
    if len(ds)==10:return ds
    return ""

def field(value,raw,cf,valid):
    cf=cf if valid else min(cf,.35)
    return {"value":value,"raw":raw,"confidence":round(cf,3),
            "status":"ok" if valid and cf>=.80 else ("review" if valid else "invalid")}

def recognize_ticket(raw):
    sheet,det=normalize_sheet(decode(raw))
    specs={
      "contract_date":("date",parse_date),"forfeiture_due_date":("date",parse_date),
      "principal_amount":("money",parse_money),"interest_amount":("money",parse_money),
      "address":("text",clean),"name":("text",clean),"phone":("phone",parse_phone),"items":("multi",clean)
    }
    fs={}
    for k,(kind,parser) in specs.items():
        txt,cf=multi(crop(sheet,ROIS[k]),kind); val=parser(txt)
        if k=="name":valid=bool(val and 2<=len(val)<=30 and not re.fullmatch(r"[\d\W_]+",val))
        elif k=="address":valid=bool(val and len(val)>=4)
        elif k=="phone":valid=bool(val)
        elif k=="principal_amount":valid=bool(isinstance(val,int) and 100<=val<=100_000_000)
        elif k=="interest_amount":valid=bool(isinstance(val,int) and val>0)
        elif k in ("contract_date","forfeiture_due_date"):valid=bool(val)
        else:valid=bool(val and len(val)>=2)
        fs[k]=field(val,txt,cf,valid)
    p=fs["principal_amount"]["value"] or 0;i=fs["interest_amount"]["value"] or 0
    if p and i and i>=p:
        fs["interest_amount"]["status"]="invalid";fs["interest_amount"]["confidence"]=min(fs["interest_amount"]["confidence"],.25)
    needed=["contract_date","forfeiture_due_date","principal_amount","interest_amount","name","phone","items"]
    score=sum(fs[k]["status"]=="ok" for k in needed)/len(needed)
    suggestion={}
    cd=fs["contract_date"]["value"];fd=fs["forfeiture_due_date"]["value"]
    if cd and not fd:suggestion["forfeiture_due_date"]=(date.fromisoformat(cd)+timedelta(days=90)).isoformat()
    return {"fields":fs,"document_detected":det,"field_accuracy":round(score,3),
            "avg_confidence":round(sum(fs[k]["confidence"] for k in needed)/len(needed),3),
            "needs_review":any(fs[k]["status"]!="ok" for k in needed),
            "suggestions":suggestion,"engine":"OpenCV固定帳票ROI + multi-pass Tesseract"}

def generic(raw):
    im=decode(raw)
    if max(im.shape[:2])>1800:
        r=1800/max(im.shape[:2]);im=cv2.resize(im,None,fx=r,fy=r)
    txt,cf=multi(im,"multi")
    return txt,cf
