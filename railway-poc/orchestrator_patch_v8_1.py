from __future__ import annotations

import math
import re
from datetime import date
from typing import Any

import pytesseract

PATCH_VERSION = "8.1.0-layout-aware"


def _layout_lines(im) -> list[dict[str, Any]]:
    try:
        d = pytesseract.image_to_data(im, lang="jpn+eng", config="--oem 1 --psm 11", output_type=pytesseract.Output.DICT)
    except Exception:
        return []
    groups: dict[tuple[int, int, int, int], list[dict[str, Any]]] = {}
    n = len(d.get("text", []))
    for i in range(n):
        t = str((d.get("text") or [""])[i] or "").strip()
        if not t:
            continue
        try:
            cf = max(0.0, float((d.get("conf") or [-1])[i]) / 100.0)
        except Exception:
            cf = 0.0
        key = (
            int((d.get("page_num") or [1])[i] or 1),
            int((d.get("block_num") or [0])[i] or 0),
            int((d.get("par_num") or [0])[i] or 0),
            int((d.get("line_num") or [0])[i] or 0),
        )
        groups.setdefault(key, []).append({
            "text": t,
            "confidence": cf,
            "left": int((d.get("left") or [0])[i] or 0),
            "top": int((d.get("top") or [0])[i] or 0),
            "width": int((d.get("width") or [0])[i] or 0),
            "height": int((d.get("height") or [0])[i] or 0),
        })
    out = []
    h, w = im.shape[:2]
    for xs in groups.values():
        xs.sort(key=lambda x: x["left"])
        text = " ".join(x["text"] for x in xs)
        confs = [float(x["confidence"]) for x in xs if float(x["confidence"]) > 0]
        left = min(x["left"] for x in xs)
        right = max(x["left"] + x["width"] for x in xs)
        top = min(x["top"] for x in xs)
        bottom = max(x["top"] + x["height"] for x in xs)
        out.append({
            "text": text,
            "confidence": sum(confs) / len(confs) if confs else 0.0,
            "x": ((left + right) / 2) / max(1, w),
            "y": ((top + bottom) / 2) / max(1, h),
            "left": left / max(1, w),
            "right": right / max(1, w),
        })
    return sorted(out, key=lambda x: (x["y"], x["x"]))


def _existing_candidates(eo, field: dict[str, Any]) -> list[Any]:
    out = []
    for e in field.get("evidence") or []:
        try:
            out.append(eo.Candidate(
                e.get("value"), float(e.get("confidence") or 0),
                str(e.get("source") or "existing"), str(e.get("raw") or ""),
                str(e.get("variant") or ""), str(e.get("reason") or ""),
            ))
        except Exception:
            pass
    return out


def _line_candidate(eo, spec: dict[str, Any], field_name: str, line: dict[str, Any]):
    ftype = spec["type"]
    parser = eo.PARSERS[ftype]
    value = parser(line["text"])
    if isinstance(value, int):
        if value <= 0:
            return None
    elif not value:
        return None
    # Dates should not be mistaken for money merely because they contain digits.
    if ftype == "money":
        if value < 1000:
            return None
        z = eo._nfkc(line["text"])
        if ("年" in z or "月" in z or "日" in z) and eo.parse_date_value(z):
            return None
    y1, y2 = float(spec["bbox"][1]), float(spec["bbox"][3])
    yc = (y1 + y2) / 2
    dy = abs(float(line["y"]) - yc)
    proximity = math.exp(-7.0 * dy)
    label_boost = 0.0
    compact = eo._compact(line["text"])
    for lab in spec.get("labels") or []:
        ll = eo._compact(lab)
        if ll and (ll in compact or any(part in compact for part in re.findall(r"[一-龠ぁ-んァ-ヶA-Za-z]{2,}", ll))):
            label_boost = .12
            break
    x1, x2 = float(spec["bbox"][0]), float(spec["bbox"][2])
    xok = (x1 - .18) <= float(line["x"]) <= (x2 + .18)
    if not xok and ftype not in {"address", "items"}:
        proximity *= .72
    conf = min(.91, .52 * float(line["confidence"]) + .38 * proximity + label_boost)
    if conf < .32:
        return None
    return eo.Candidate(value, conf, "Tesseract-layout", line["text"], "full-layout", f"spatial_proximity={proximity:.3f}")


def _reapply_rules(eo, result: dict[str, Any]) -> None:
    fields = result.get("fields") or {}
    cd = str((fields.get("contract_date") or {}).get("value") or "")
    fd = str((fields.get("forfeiture_due_date") or {}).get("value") or "")
    if cd and fd:
        try:
            delta = (date.fromisoformat(fd) - date.fromisoformat(cd)).days
            if 1 <= delta <= 180:
                for key in ("contract_date", "forfeiture_due_date"):
                    f = fields[key]
                    f["confidence"] = round(min(.99, float(f.get("confidence") or 0) + .06), 3)
                    f["status"] = "ok" if f["confidence"] >= .90 else "review"
                    f.setdefault("evidence", []).append({"value": f["value"], "confidence": 1.0, "source": "business_rule", "raw": "", "variant": "date_order", "reason": f"forfeit-after-contract:{delta}d"})
            else:
                fields["forfeiture_due_date"]["status"] = "review"
                fields["forfeiture_due_date"]["confidence"] = min(.49, float(fields["forfeiture_due_date"].get("confidence") or 0))
        except Exception:
            pass

    pfield = fields.get("principal_amount") or {}
    ifield = fields.get("interest_amount") or {}
    pvals: dict[int, float] = {}
    ivals: dict[int, float] = {}
    for e in pfield.get("evidence") or []:
        try:
            v = int(e.get("value") or 0)
            if 1000 <= v <= 100_000_000:
                pvals[v] = max(pvals.get(v, 0.0), float(e.get("confidence") or 0))
        except Exception:
            pass
    for e in ifield.get("evidence") or []:
        try:
            v = int(e.get("value") or 0)
            if 100 <= v <= 10_000_000:
                ivals[v] = max(ivals.get(v, 0.0), float(e.get("confidence") or 0))
        except Exception:
            pass
    best = None
    for p, pc in pvals.items():
        expected = p * eo.INTEREST_RATE
        for it, ic in ivals.items():
            rel = abs(it - expected) / max(1.0, expected)
            if rel <= .025:
                score = .42 * pc + .38 * ic + .20
                if best is None or score > best[0]:
                    best = (score, p, it)
    if best:
        _, p, it = best
        for f, v in ((pfield, p), (ifield, it)):
            f["value"] = v
            f["confidence"] = round(min(.995, max(float(f.get("confidence") or 0), .94)), 3)
            f["status"] = "ok"
            f.setdefault("evidence", []).append({"value": v, "confidence": 1.0, "source": "business_rule", "raw": "", "variant": "interest_constraint", "reason": f"{p}*{eo.INTEREST_RATE:.3f}≈{it}"})

    critical = ("contract_date", "forfeiture_due_date", "principal_amount", "interest_amount", "name", "phone", "items")
    vals = []
    for key in critical:
        f = fields.get(key) or {}
        c = float(f.get("confidence") or 0)
        vals.append(0.0 if f.get("status") == "invalid" else c)
    result["field_accuracy"] = round(sum(vals) / len(vals), 3)
    min_critical = min(float((fields.get(k) or {}).get("confidence") or 0) for k in ("contract_date", "forfeiture_due_date", "principal_amount"))
    result["false_accept_risk"] = round(max(0.0, 1.0 - min_critical), 3)
    result["needs_review"] = any((fields.get(k) or {}).get("status") != "ok" for k in critical) or result["false_accept_risk"] > .08


def apply(eo):
    if getattr(eo, "_layout_patch_applied", False):
        return eo
    original = eo.recognize_ticket

    def recognize_ticket_layout(raw: bytes, license_data: dict[str, Any] | None = None, template_id: str = "shichiya_yamagata_v1"):
        result = original(raw, license_data, template_id)
        fields = result.get("fields") or {}
        weak = any(float((fields.get(k) or {}).get("confidence") or 0) < .72 for k in ("contract_date", "forfeiture_due_date", "principal_amount", "interest_amount", "phone", "items"))
        if weak:
            im, geometry = eo.rectify_ticket(raw)
            lines = _layout_lines(im)
            specs = eo.TEMPLATES[template_id]["fields"]
            for key in ("contract_date", "forfeiture_due_date", "principal_amount", "interest_amount", "phone", "items"):
                f = fields.get(key) or {"value": 0 if specs[key]["type"] == "money" else "", "confidence": 0, "status": "invalid", "evidence": []}
                cands = _existing_candidates(eo, f)
                for line in lines:
                    cand = _line_candidate(eo, specs[key], key, line)
                    if cand is not None:
                        cands.append(cand)
                resolved = eo._resolve(cands, specs[key]["type"])
                resolved["bbox"] = list(specs[key]["bbox"])
                resolved["type"] = specs[key]["type"]
                fields[key] = resolved
            result["layout_lines"] = [{"text": x["text"][:180], "confidence": round(float(x["confidence"]), 3), "x": round(float(x["x"]), 3), "y": round(float(x["y"]), 3)} for x in lines[:120]]
            result["geometry"] = geometry
            _reapply_rules(eo, result)
        q = result.get("quality") or {}
        if float(q.get("overall") or 0) < .46:
            result["needs_review"] = True
            result["capture_action"] = q.get("capture_action") or "再撮影推奨"
        else:
            result["capture_action"] = q.get("capture_action") or "OK"
        result["pipeline_version"] = PATCH_VERSION
        result["engine"] = str(result.get("engine") or "") + " + layout-aware fallback"
        return result

    old_status = eo.runtime_status
    def status():
        x = old_status()
        x["pipeline_version"] = PATCH_VERSION
        x["layout_aware_fallback"] = True
        x["false_accept_revalidation"] = True
        x["quality_capture_gate"] = True
        return x

    eo.recognize_ticket = recognize_ticket_layout
    eo.runtime_status = status
    eo.ENGINE_VERSION = PATCH_VERSION
    eo._layout_patch_applied = True
    return eo
