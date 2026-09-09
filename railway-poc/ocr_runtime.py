from __future__ import annotations

import asyncio
import gc
import os
import secrets

import uvicorn
from fastapi import FastAPI, File, Header, HTTPException, UploadFile

import ocr_engine_v8 as engine

MAX_ITEM_FILES = 12
MAX_TICKET_FILES = 6
MAX_TOTAL_BYTES = 32 * 1024 * 1024
LOCK = asyncio.Lock()
TOKEN = os.getenv("OCR_INTERNAL_TOKEN", "")
app = FastAPI(title="Shichiya Sendai OCR Runtime", docs_url=None, redoc_url=None)


async def _read_one(f: UploadFile, label: str) -> bytes:
    raw = await f.read(16 * 1024 * 1024 + 1)
    if not raw:
        raise HTTPException(422, f"{label}が空です")
    if len(raw) > 16 * 1024 * 1024:
        raise HTTPException(413, f"{label}が大きすぎます")
    return raw


async def _read_many(files: list[UploadFile] | None, label: str, limit: int) -> list[bytes]:
    xs = [x for x in (files or []) if x is not None]
    if not xs:
        raise HTTPException(422, f"{label}を1枚以上選択してください")
    if len(xs) > limit:
        raise HTTPException(413, f"{label}は最大{limit}枚です")
    return [await _read_one(f, f"{label}{i+1}") for i, f in enumerate(xs)]


def _authorized(value: str | None) -> bool:
    return bool(TOKEN and value and secrets.compare_digest(TOKEN, value))


@app.get("/health")
def health():
    return {"ok": True, **engine.runtime_status()}


@app.post("/v1/extract")
async def extract(
    license_image: UploadFile = File(...),
    item_images: list[UploadFile] | None = File(None),
    ticket_images: list[UploadFile] | None = File(None),
    x_ocr_token: str | None = Header(None),
):
    if not _authorized(x_ocr_token):
        raise HTTPException(404, "not found")

    license_raw = await _read_one(license_image, "運転免許証")
    item_raws = await _read_many(item_images, "質入品", MAX_ITEM_FILES)
    ticket_raws = await _read_many(ticket_images, "質札", MAX_TICKET_FILES)

    if len(license_raw) + sum(map(len, item_raws)) + sum(map(len, ticket_raws)) > MAX_TOTAL_BYTES:
        raise HTTPException(413, "1回の受付は合計32MB以下にしてください")

    async with LOCK:
        try:
            result = await asyncio.to_thread(engine.extract_batch, license_raw, item_raws, ticket_raws)
            return result
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(500, f"OCR runtime error: {type(e).__name__}") from e
        finally:
            gc.collect()


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")), proxy_headers=True)
