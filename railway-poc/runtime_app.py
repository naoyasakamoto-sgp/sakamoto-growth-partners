from __future__ import annotations

import os
import threading
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile

app = FastAPI(title="shichiya-sendai-ocr-runtime", version="1.0.0")
_lock = threading.Lock()
_model = None
_model_error = ""


def get_model():
    global _model, _model_error
    if _model is not None:
        return _model
    with _lock:
        if _model is not None:
            return _model
        try:
            from paddleocr import PaddleOCR
            try:
                _model = PaddleOCR(
                    use_angle_cls=False,
                    lang="japan",
                    show_log=False,
                    use_gpu=False,
                    cpu_threads=1,
                    enable_mkldnn=False,
                )
            except TypeError:
                _model = PaddleOCR(use_angle_cls=False, lang="japan", show_log=False, use_gpu=False)
            return _model
        except Exception as e:
            _model_error = f"{type(e).__name__}: {e}"[:300]
            return None


def parse_result(result: Any) -> list[dict[str, Any]]:
    vals: list[dict[str, Any]] = []
    def walk(o: Any):
        if isinstance(o, (list, tuple)):
            if len(o) == 2 and isinstance(o[0], str) and isinstance(o[1], (int, float)):
                vals.append({"text": o[0], "confidence": float(o[1])})
                return
            if len(o) == 2 and isinstance(o[1], (list, tuple)) and len(o[1]) == 2 and isinstance(o[1][0], str):
                vals.append({"text": o[1][0], "confidence": float(o[1][1])})
                return
            for x in o:
                walk(x)
    walk(result)
    return [x for x in vals if str(x.get("text") or "").strip()]


@app.on_event("startup")
def warmup():
    # Preload once in the dedicated container. If memory is insufficient Railway
    # will fail this service rather than taking down the customer-facing web app.
    get_model()


@app.get("/health")
def health():
    m = get_model()
    return {
        "ok": m is not None,
        "service": "shichiya-sendai-ocr-runtime",
        "paddle_loaded": m is not None,
        "error": _model_error,
        "external_ai": False,
    }


@app.post("/v1/paddle/ocr")
async def paddle_ocr(file: UploadFile = File(...), det: bool = True):
    raw = await file.read(8 * 1024 * 1024 + 1)
    if not raw or len(raw) > 8 * 1024 * 1024:
        raise HTTPException(413, "image too large")
    arr = np.frombuffer(raw, np.uint8)
    im = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if im is None:
        raise HTTPException(422, "invalid image")
    h, w = im.shape[:2]
    if max(h, w) > 1800:
        s = 1800 / max(h, w)
        im = cv2.resize(im, (max(1, int(w * s)), max(1, int(h * s))), interpolation=cv2.INTER_AREA)
    model = get_model()
    if model is None:
        raise HTTPException(503, _model_error or "paddle unavailable")
    with _lock:
        try:
            r = model.ocr(im, cls=False, det=det, rec=True)
        except TypeError:
            r = model.ocr(im, cls=False)
        except Exception as e:
            raise HTTPException(500, f"{type(e).__name__}: {e}"[:300])
    tokens = parse_result(r)
    text = " ".join(x["text"] for x in tokens)
    confidence = sum(float(x["confidence"]) for x in tokens) / len(tokens) if tokens else 0.0
    return {"text": text, "confidence": round(confidence, 4), "tokens": tokens, "engine": "PaddleOCR", "external_ai": False}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
