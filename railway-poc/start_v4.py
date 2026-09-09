from __future__ import annotations

import gc
import json
import os
import uuid
from typing import Any

import uvicorn
from fastapi import Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

# Import v3 first so the 1 GiB web-service memory guard remains active. The new
# orchestrator improves accuracy through geometry, preprocessing, cross-document
# matching and business rules rather than loading PaddleOCR in this web process.
import start_v3  # noqa: F401
import start_v2
import ticket_pipeline as tp
import extraction_orchestrator as eo

main = start_v2.main
APP_VERSION = "2.2.0-poc"

EXTRA_SCHEMA = '''
CREATE TABLE IF NOT EXISTS extraction_evidence(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 draft_id TEXT NOT NULL,
 kind TEXT NOT NULL,
 ordinal INTEGER NOT NULL DEFAULT 0,
 result_json TEXT NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(draft_id,kind,ordinal));
CREATE INDEX IF NOT EXISTS idx_extraction_evidence_draft ON extraction_evidence(draft_id,kind,ordinal);
CREATE TABLE IF NOT EXISTS ground_truth(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 draft_id TEXT NOT NULL,
 field_name TEXT NOT NULL,
 predicted_value TEXT,
 corrected_value TEXT NOT NULL,
 operator TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_ground_truth_field ON ground_truth(field_name,created_at);
'''


def ensure_v8_schema() -> None:
    start_v2.ensure_schema()
    with main.db() as c:
        c.executescript(EXTRA_SCHEMA)


@main.app.on_event("startup")
def _startup_v8() -> None:
    ensure_v8_schema()


def _fval(fields: dict[str, Any], key: str, default: Any = "") -> Any:
    v = (fields.get(key) or {}).get("value", default)
    return default if v is None else v


def _pairing(nt: int, ni: int) -> list[list[int]]:
    return start_v2._pairing(nt, ni)


def _ticket_contract_v8(r: dict[str, Any], ticket_index: int, item_indices: list[int], product_results: list[dict[str, Any]]) -> dict[str, Any]:
    f = r.get("fields") or {}
    cd = str(_fval(f, "contract_date", "") or "")
    fd = str(_fval(f, "forfeiture_due_date", "") or "")
    ticket_item_text = str(_fval(f, "items", "") or "")
    items: list[dict[str, Any]] = []
    for idx in item_indices:
        if 0 <= idx < len(product_results):
            merged = eo.merge_item(ticket_item_text, product_results[idx])
            items.append({
                "category": merged["category"],
                "brand": merged["brand"],
                "description": merged["description"],
                "confidence": merged["confidence"],
                "evidence": merged["evidence"],
            })
    if not items:
        items = [{
            "category": ticket_item_text[:100] if ticket_item_text else "",
            "brand": "",
            "description": ticket_item_text[:300] if ticket_item_text else "画像確認",
            "confidence": float((f.get("items") or {}).get("confidence") or 0),
            "evidence": {"ticket_text": ticket_item_text},
        }]
    critical = ["contract_date", "forfeiture_due_date", "principal_amount", "interest_amount", "name", "phone", "items"]
    review_fields = [k for k in critical if (f.get(k) or {}).get("status") != "ok"]
    return {
        "ticket_index": ticket_index,
        "item_image_indices": item_indices,
        "contract": {
            "contract_date": cd,
            "principal_amount": int(_fval(f, "principal_amount", 0) or 0),
            "interest_amount": int(_fval(f, "interest_amount", 0) or 0),
            "next_interest_due_date": main.add_month(cd) if cd else "",
            "forfeiture_due_date": fd,
        },
        "items": items,
        "quality": float(r.get("field_accuracy") or 0),
        "false_accept_risk": float(r.get("false_accept_risk") or 1),
        "needs_review": bool(r.get("needs_review")),
        "review_fields": review_fields,
        "fields": f,
        "quality_metrics": r.get("quality") or {},
        "geometry": r.get("geometry") or {},
        "template_id": r.get("template_id"),
        "pipeline_version": r.get("pipeline_version"),
    }


def _extract_core_v8(lr: bytes, item_pairs: list[tuple[UploadFile, bytes]], ticket_pairs: list[tuple[UploadFile, bytes]], persist: bool = True, actor: dict[str, Any] | None = None) -> dict[str, Any]:
    lic = tp.recognize_license(lr)
    product_results: list[dict[str, Any]] = []
    for _, raw in item_pairs:
        try:
            product_results.append(eo.recognize_product_image(raw))
        except Exception as e:
            product_results.append({"category": "", "brand": "", "series": "", "confidence": 0.0, "error": type(e).__name__})
        gc.collect()

    ticket_results: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    for i, (_, raw) in enumerate(ticket_pairs):
        try:
            ticket_results.append(eo.recognize_ticket(raw, lic))
        except Exception as e:
            errors.append({"index": i, "error": type(e).__name__, "message": str(e)[:200]})
            ticket_results.append({
                "fields": {}, "field_accuracy": 0.0, "false_accept_risk": 1.0,
                "needs_review": True, "quality": {}, "geometry": {},
                "pipeline_version": eo.ENGINE_VERSION,
            })
        gc.collect()

    pairs = _pairing(len(ticket_pairs), len(item_pairs))
    contracts = [_ticket_contract_v8(r, i, pairs[i], product_results) for i, r in enumerate(ticket_results)]
    phone = ""
    for r in ticket_results:
        p = str(_fval(r.get("fields") or {}, "phone", "") or "")
        if p:
            phone = p
            break
    payload = {
        "customer": {
            "name": lic.get("name", ""),
            "address": lic.get("address", ""),
            "phone": phone,
            "confidence": float(lic.get("confidence") or 0),
        },
        "contracts": contracts,
        "documents": {"item_count": len(item_pairs), "ticket_count": len(ticket_pairs)},
    }
    did = uuid.uuid4().hex
    if persist:
        item_paths = [main.save(raw, "item", f.filename) for f, raw in item_pairs]
        ticket_paths = [main.save(raw, "ticket", f.filename) for f, raw in ticket_pairs]
        ensure_v8_schema()
        with main.db() as c:
            c.execute("INSERT INTO drafts(id,payload,item_path,ticket_path)VALUES(?,?,?,?)", (did, json.dumps(payload, ensure_ascii=False), item_paths[0], ticket_paths[0]))
            for i, ((f, _), path) in enumerate(zip(item_pairs, item_paths)):
                c.execute("INSERT INTO draft_files(draft_id,kind,ordinal,image_path,source_filename)VALUES(?,?,?,?,?)", (did, "ITEM", i, path, f.filename))
                c.execute("INSERT OR REPLACE INTO extraction_evidence(draft_id,kind,ordinal,result_json)VALUES(?,?,?,?)", (did, "ITEM", i, json.dumps(product_results[i], ensure_ascii=False)))
            for i, ((f, _), path) in enumerate(zip(ticket_pairs, ticket_paths)):
                c.execute("INSERT INTO draft_files(draft_id,kind,ordinal,image_path,source_filename)VALUES(?,?,?,?,?)", (did, "TICKET", i, path, f.filename))
                c.execute("INSERT OR REPLACE INTO extraction_evidence(draft_id,kind,ordinal,result_json)VALUES(?,?,?,?)", (did, "TICKET", i, json.dumps(ticket_results[i], ensure_ascii=False)))
            c.execute("INSERT OR REPLACE INTO extraction_evidence(draft_id,kind,ordinal,result_json)VALUES(?,?,?,?)", (did, "LICENSE", 0, json.dumps(lic, ensure_ascii=False)))
            if actor:
                main.audit(c, actor["name"], actor["role"], "INTAKE_ORCHESTRATED_V8", "draft", did, {
                    "contracts": len(contracts), "items": len(item_pairs), "tickets": len(ticket_pairs),
                    "pipeline": eo.ENGINE_VERSION, "errors": errors,
                    "review_required": sum(1 for x in contracts if x["needs_review"]),
                })
    overall = sum(float(c["quality"]) for c in contracts) / max(1, len(contracts))
    return {
        "draft_id": did if persist else None,
        "extracted": payload,
        "vision": {
            "pipeline_version": eo.ENGINE_VERSION,
            "field_accuracy": round(overall, 3),
            "needs_review": any(c["needs_review"] for c in contracts),
            "license": {k: lic.get(k) for k in ("name", "address", "confidence", "engine", "document_detected")},
            "ticket_errors": errors,
            "contract_count": len(contracts),
            "item_count": len(item_pairs),
            "ticket_count": len(ticket_pairs),
            "product_vision": product_results,
            "runtime": eo.runtime_status(),
            "external_ai": False,
        },
    }


async def extract_batch_v8(
    license_image: UploadFile = File(...),
    item_images: list[UploadFile] | None = File(None),
    ticket_images: list[UploadFile] | None = File(None),
    a=Depends(main.auth),
):
    lr = await start_v2._read_one(license_image, "運転免許証")
    items, ib = await start_v2._read_many(item_images, "質入品", start_v2.MAX_ITEM_FILES)
    tickets, tb = await start_v2._read_many(ticket_images, "質札", start_v2.MAX_TICKET_FILES)
    if len(lr) + ib + tb > start_v2.MAX_TOTAL_UPLOAD_BYTES:
        raise HTTPException(413, "1回の受付は合計32MB以下にしてください")
    async with start_v2.OCR_LOCK:
        try:
            return _extract_core_v8(lr, items, tickets, True, a)
        finally:
            gc.collect()


start_v2.replace("/api/intake/extract", "POST", extract_batch_v8)


class GroundTruthInput(BaseModel):
    corrections: dict[str, Any] = Field(default_factory=dict)


@main.app.get("/api/extraction/{draft_id}/evidence", dependencies=[Depends(main.auth)])
def get_evidence(draft_id: str):
    ensure_v8_schema()
    with main.db() as c:
        rows = c.execute("SELECT kind,ordinal,result_json,created_at FROM extraction_evidence WHERE draft_id=? ORDER BY kind,ordinal", (draft_id,)).fetchall()
        if not rows:
            raise HTTPException(404, "認識根拠がありません")
        return {"draft_id": draft_id, "items": [{"kind": r["kind"], "ordinal": r["ordinal"], "result": json.loads(r["result_json"]), "created_at": r["created_at"]} for r in rows]}


@main.app.post("/api/extraction/{draft_id}/ground-truth", dependencies=[Depends(main.auth)])
def save_ground_truth(draft_id: str, b: GroundTruthInput, a=Depends(main.auth)):
    ensure_v8_schema()
    with main.db() as c:
        d = c.execute("SELECT payload FROM drafts WHERE id=?", (draft_id,)).fetchone()
        if not d:
            raise HTTPException(404, "下書きがありません")
        predicted = json.loads(d["payload"])
        count = 0
        for field_name, corrected in b.corrections.items():
            # Predicted values may be nested; ground-truth API intentionally keeps
            # a flat field name so operators can submit only corrected fields.
            pv = ""
            if field_name.startswith("customer."):
                pv = str((predicted.get("customer") or {}).get(field_name.split(".", 1)[1], ""))
            c.execute("INSERT INTO ground_truth(draft_id,field_name,predicted_value,corrected_value,operator)VALUES(?,?,?,?,?)", (draft_id, field_name, pv, str(corrected), a["name"]))
            count += 1
        main.audit(c, a["name"], a["role"], "GROUND_TRUTH_SAVED", "draft", draft_id, {"count": count})
    return {"ok": True, "count": count}


@main.app.get("/api/metrics/ocr", dependencies=[Depends(main.auth)])
def ocr_metrics():
    ensure_v8_schema()
    with main.db() as c:
        rows = c.execute("SELECT field_name,predicted_value,corrected_value FROM ground_truth ORDER BY id DESC LIMIT 5000").fetchall()
    total = len(rows)
    exact = sum(1 for r in rows if str(r["predicted_value"]) == str(r["corrected_value"]))
    by_field: dict[str, dict[str, int]] = {}
    for r in rows:
        x = by_field.setdefault(r["field_name"], {"n": 0, "exact": 0})
        x["n"] += 1
        x["exact"] += int(str(r["predicted_value"]) == str(r["corrected_value"]))
    return {
        "ground_truth_count": total,
        "field_exact_match": round(exact / total, 4) if total else None,
        "by_field": {k: {**v, "exact_match": round(v["exact"] / v["n"], 4) if v["n"] else None} for k, v in by_field.items()},
        "kpi": {"false_accept_rate": "requires confirmed-auto decisions dataset", "auto_confirm_rate": "tracked after operator-confirm workflow"},
    }


def health_v8():
    x = main.health()
    x.update({
        "version": APP_VERSION,
        "pipeline_version": eo.ENGINE_VERSION,
        "ocr": "document rectification; template ROI; multi-preprocessing ensemble; cross-document/product/business resolver",
        "runtime": eo.runtime_status(),
        "batch_contracts": True,
        "evidence": True,
        "ground_truth": True,
        "external_ai": False,
    })
    return x


def vision_v8(a=Depends(main.auth)):
    return {"ready": True, "runtime": eo.runtime_status(), "batch_contracts": True, "evidence": True, "ground_truth": True, "external_ai": False}


start_v2.replace("/api/health", "GET", health_v8)
start_v2.replace("/api/vision/status", "GET", vision_v8)

# Human-in-the-loop UI: keep the existing workflow but expose meaningful field
# confidence instead of only one misleading aggregate score. Existing inputs and
# confirm endpoint remain compatible.
main.HTML = main.HTML.replace("v2.0.0-poc", "v2.2.0-poc | Orchestrator v8")
main.HTML = main.HTML.replace(
    "<h4>契約 ${i+1}｜認識品質 ${(100*c.quality).toFixed(0)}%</h4>",
    "<h4>契約 ${i+1}｜認識品質 ${(100*c.quality).toFixed(0)}% ${c.needs_review?'⚠ 要確認':'✓'}</h4><p class=muted>質入日 ${Math.round(100*(c.fields?.contract_date?.confidence||0))}% / 流質日 ${Math.round(100*(c.fields?.forfeiture_due_date?.confidence||0))}% / 元金 ${Math.round(100*(c.fields?.principal_amount?.confidence||0))}% / 利息 ${Math.round(100*(c.fields?.interest_amount?.confidence||0))}% / 品目 ${Math.round(100*(c.fields?.items?.confidence||0))}%</p>",
)

if __name__ == "__main__":
    uvicorn.run(main.app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), proxy_headers=True)
