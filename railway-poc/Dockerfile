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
print('PaddleOCR Japanese model preloaded for future dedicated runtime')
PY
COPY main.py .
COPY ticket_pipeline.py .
COPY ticket_pipeline_patch.py .
COPY extraction_orchestrator.py .
COPY orchestrator_patch_v8_1.py .
COPY start_v2.py .
COPY start_v3.py .
COPY start_v4.py .
COPY start_v5.py .
RUN python -m py_compile main.py ticket_pipeline.py ticket_pipeline_patch.py extraction_orchestrator.py orchestrator_patch_v8_1.py start_v2.py start_v3.py start_v4.py start_v5.py \
 && python - <<'PY'
import extraction_orchestrator as eo
import orchestrator_patch_v8_1 as p
assert eo.parse_date_value('令和8年9月2日') == '2026-09-02'
assert eo.parse_date_value('R8.10.2') == '2026-10-02'
assert eo.parse_money_value('40,000円') == 40000
assert eo.parse_phone_value('070-2292-7017') == '070-2292-7017'
p.apply(eo)
assert eo.ENGINE_VERSION == '8.1.0-layout-aware'
assert eo.runtime_status()['layout_aware_fallback']
assert eo.runtime_status()['tesseract_jpn']
print('Orchestrator smoke test OK', eo.ENGINE_VERSION)
PY
EXPOSE 8000
CMD ["python","start_v5.py"]
