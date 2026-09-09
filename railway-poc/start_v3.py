import gc
import importlib.util
import os

import cv2
import uvicorn

import ticket_pipeline as tp
import ticket_pipeline_patch as patch

patch.apply(tp)

# Railway production currently has a 1 GiB memory limit. Loading PaddleOCR in the
# web process pushes RSS close to that limit and can cause the container to be
# OOM-killed during /api/intake/extract. Keep the existing Paddle/Tesseract
# pipeline code available, but default the production web process to a bounded
# Tesseract/OpenCV path. Set OCR_LOW_MEMORY_MODE=0 only after moving OCR to a
# larger/dedicated runtime or increasing the service memory limit.
LOW_MEMORY_MODE = os.getenv('OCR_LOW_MEMORY_MODE', '1').strip().lower() not in {
    '0', 'false', 'no', 'off'
}
OCR_MAX_EDGE = max(1200, min(int(os.getenv('OCR_MAX_EDGE', '1800')), 2400))

if LOW_MEMORY_MODE:
    _decode_original = tp._decode

    def _decode_bounded(raw, max_edge=2400):
        # Decode source photos at a bounded size before perspective correction.
        # The normalized ticket/license canvases remain unchanged, so ROI
        # coordinates and the existing parser continue to work as before.
        return _decode_original(raw, min(int(max_edge or OCR_MAX_EDGE), OCR_MAX_EDGE))

    def _paddle_disabled(im, det=True):
        # Do not instantiate PaddleOCR inside the 1 GiB web container.
        # Existing consensus logic automatically falls back to Tesseract.
        return '', 0.0

    def _getp_disabled():
        return None

    def _runtime_status_lowmem():
        try:
            langs = tp.pytesseract.get_languages(config='')
        except Exception:
            langs = []
        return {
            'pipeline_version': tp.PIPELINE_VERSION,
            'opencv': True,
            'opencv_version': cv2.__version__,
            'paddle_installed': importlib.util.find_spec('paddleocr') is not None,
            'paddle_runtime_enabled': False,
            'paddle_loaded': False,
            'paddle_failed': False,
            'paddle_error': 'disabled by Railway 1GiB memory guard',
            'tesseract_jpn': 'jpn' in langs,
            'external_ai': False,
            'low_memory_mode': True,
            'ocr_max_edge': OCR_MAX_EDGE,
        }

    tp._decode = _decode_bounded
    tp._paddle = _paddle_disabled
    tp._getp = _getp_disabled
    tp._P = None
    tp._PF = False
    tp._PE = 'disabled by Railway 1GiB memory guard'
    tp.PIPELINE_VERSION = '7.1.0-lowmem'
    tp.runtime_status = _runtime_status_lowmem
    cv2.setNumThreads(1)
    gc.collect()

import start_v2

start_v2.APP_VERSION = '2.1.1-poc'

# If the backend ever returns a proxy/platform error, avoid exposing raw JSON to
# the store operator. The technical details remain available in Railway logs.
start_v2.main.HTML = start_v2.main.HTML.replace(
    "catch(e){alert(e.message)}finally{reading=false;readbtn.disabled=false;readbtn.textContent='質札専用読取'}",
    "catch(e){console.error(e);alert('画像認識に失敗しました。画像を1〜2枚ずつに減らして再実行してください。継続する場合は管理者へ連絡してください。')}finally{reading=false;readbtn.disabled=false;readbtn.textContent='質札専用読取'}",
)

if __name__ == '__main__':
    uvicorn.run(
        start_v2.main.app,
        host='0.0.0.0',
        port=int(os.environ.get('PORT', '8000')),
        proxy_headers=True,
    )
