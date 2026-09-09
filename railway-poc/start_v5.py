from __future__ import annotations

import json
import os
import re
from typing import Any

import uvicorn

import extraction_orchestrator as eo
import orchestrator_patch_v8_1 as layout_patch
layout_patch.apply(eo)

import start_v4

main = start_v4.main
start_v4.APP_VERSION = "2.2.1-poc"

_original_core = start_v4._extract_core_v8


def _digits(v: str) -> str:
    return re.sub(r"\D", "", str(v or ""))


def _customer_match(customer: dict[str, Any]) -> dict[str, Any] | None:
    name = str(customer.get("name") or "")
    address = str(customer.get("address") or "")
    phone = str(customer.get("phone") or "")
    best = None
    with main.db() as c:
        rows = c.execute("SELECT id,name,address,phone FROM customers ORDER BY id DESC LIMIT 1000").fetchall()
    for r in rows:
        ns = eo._similarity(name, str(r["name"] or "")) if name else 0.0
        ads = eo._similarity(address, str(r["address"] or "")) if address else 0.0
        pd, rd = _digits(phone), _digits(str(r["phone"] or ""))
        ps = 1.0 if pd and rd and pd == rd else (eo._similarity(pd, rd) if pd and rd else 0.0)
        present = [bool(name and r["name"]), bool(address and r["address"]), bool(phone and r["phone"])]
        weights = [0.42, 0.36, 0.22]
        scores = [ns, ads, ps]
        denom = sum(w for w, ok in zip(weights, present) if ok)
        score = sum(w * s for w, s, ok in zip(weights, scores, present) if ok) / denom if denom else 0.0
        if best is None or score > best[0]:
            best = (score, r, ns, ads, ps)
    if not best or best[0] < .76:
        return None
    score, r, ns, ads, ps = best
    return {
        "customer_id": int(r["id"]),
        "name": r["name"],
        "address": r["address"],
        "phone": r["phone"],
        "confidence": round(float(score), 3),
        "evidence": {"name_similarity": round(ns, 3), "address_similarity": round(ads, 3), "phone_similarity": round(ps, 3)},
        "auto_merge": bool(score >= .985 and ps >= .99),
    }


def _core_enriched(lr, item_pairs, ticket_pairs, persist=True, actor=None):
    response = _original_core(lr, item_pairs, ticket_pairs, persist, actor)
    customer = (response.get("extracted") or {}).get("customer") or {}
    match = _customer_match(customer)
    response["extracted"]["customer_match"] = match
    response["vision"]["customer_master_match"] = match
    response["vision"]["pipeline_version"] = eo.ENGINE_VERSION
    response["vision"]["runtime"] = eo.runtime_status()
    if persist and response.get("draft_id"):
        with main.db() as c:
            d = c.execute("SELECT payload FROM drafts WHERE id=?", (response["draft_id"],)).fetchone()
            if d:
                payload = json.loads(d["payload"])
                payload["customer_match"] = match
                c.execute("UPDATE drafts SET payload=? WHERE id=?", (json.dumps(payload, ensure_ascii=False), response["draft_id"]))
            main.audit(c, actor["name"] if actor else "system", actor["role"] if actor else "system", "CUSTOMER_MASTER_MATCHED", "draft", response["draft_id"], {"match": match})
    return response


start_v4._extract_core_v8 = _core_enriched

# The v4 route resolves its module-global _extract_core_v8 at request time, so no
# route replacement is needed. Update visible build identifiers and health data.
main.HTML = main.HTML.replace("v2.2.0-poc | Orchestrator v8", "v2.2.1-poc | Orchestrator v8.1")


if __name__ == "__main__":
    uvicorn.run(main.app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), proxy_headers=True)
