FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DEBIAN_FRONTEND=noninteractive OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr tesseract-ocr-jpn libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements-v2.txt .
RUN pip install --no-cache-dir -r requirements-v2.txt \
 && pip uninstall -y opencv-python opencv-contrib-python opencv-python-headless \
 && pip install --no-cache-dir opencv-python-headless==4.10.0.84
RUN python - <<'PY'
import cv2
from paddleocr import PaddleOCR
print('OpenCV headless OK', cv2.__version__)
PaddleOCR(use_angle_cls=False, lang='japan', show_log=False, use_gpu=False)
print('PaddleOCR Japanese model preloaded')
PY
COPY main.py .
COPY ticket_pipeline.py .
COPY ticket_pipeline_patch.py .
COPY start_v2.py .
COPY start_v3.py .
RUN python -m py_compile main.py ticket_pipeline.py ticket_pipeline_patch.py start_v2.py start_v3.py \
 && python - <<'PY'
import cv2, numpy as np
import ticket_pipeline as tp
import ticket_pipeline_patch as patch
patch.apply(tp)
img=np.full((700,1200,3),235,np.uint8)
cv2.rectangle(img,(60,90),(1140,610),(252,252,252),-1)
cv2.rectangle(img,(60,90),(1140,610),(40,40,40),3)
for y in (170,240,320,400,480): cv2.line(img,(80,y),(1120,y),(120,120,120),2)
ok,buf=cv2.imencode('.jpg',img); assert ok
norm,det=tp.normalize_ticket(buf.tobytes())
assert norm.shape==(tp.CANON_H,tp.CANON_W,3),norm.shape
status=tp.runtime_status()
assert status['opencv'] and status['paddle_import'] and status['tesseract_jpn'],status
assert status['pipeline_version']=='7.0.2',status
assert status['license_full_card_roi'] and status['mobile_only'] and status['deadline_suggestion_disabled'],status
print('POC build smoke test OK',tp.PIPELINE_VERSION,'document_detected=',det)
PY
EXPOSE 8000
CMD ["python","start_v3.py"]
