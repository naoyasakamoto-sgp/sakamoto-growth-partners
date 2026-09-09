from __future__ import annotations

import io
import math
import os
import re
import unicodedata
from dataclasses import asdict, dataclass
from datetime import date
from difflib import SequenceMatcher
from typing import Any, Callable

import cv2
import numpy as np
import pytesseract
from PIL import Image, ImageOps

ENGINE_VERSION = "8.0.0-orchestrator"
CANON_W = int(os.getenv("TICKET_CANON_W", "1600"))
CANON_H = int(os.getenv("TICKET_CANON_H", "1100"))
INTEREST_RATE = float(os.getenv("PAWN_MONTHLY_INTEREST_RATE", "0.03"))

# Yamagata-area ticket used in the current POC. BBoxes are deliberately a bit
# generous; document rectification + multi-preprocessing + value validation
# reduces dependence on one exact pixel crop.
TEMPLATES: dict[str, dict[str, Any]] = {
    "shichiya_yamagata_v1": {
        "canonical": [CANON_W, CANON_H],
        "fields": {
            "contract_date": {"bbox": (.07, .08, .49, .205), "type": "date", "labels": ["質入年月日", "契約日"]},
            "forfeiture_due_date": {"bbox": (.07, .155, .49, .285), "type": "date", "labels": ["流質年月日", "流質期限"]},
            "principal_amount": {"bbox": (.055, .285, .50, .445), "type": "money", "labels": ["契約金額", "質入金額", "元金"]},
            "interest_amount": {"bbox": (.055, .375, .50, .555), "type": "money", "labels": ["利息", "質料"]},
            "phone": {"bbox": (.055, .60, .52, .79), "type": "phone", "labels": ["電話", "TEL"]},
            "name": {"bbox": (.49, .105, .955, .275), "type": "name", "labels": ["氏名", "名前"]},
            "address": {"bbox": (.49, .035, .965, .205), "type": "address", "labels": ["住所"]},
            "items": {"bbox": (.47, .25, .97, .86), "type": "items", "labels": ["質入品", "品名", "品目"]},
        },
    }
}

PRODUCT_MASTER = [
    {
        "category": "へら竿",
        "manufacturer": "シマノ",
        "brand": "シマノ",
        "series": "飛天弓 閃光 L II",
        "aliases": ["飛天弓閃光LII", "飛天弓 閃光 L II", "閃光LII", "閃光 LII", "閃光L2", "閃光 LⅡ"],
    },
    {
        "category": "へら竿",
        "manufacturer": "かちどき",
        "brand": "かちどき",
        "series": "かちどき",
        "aliases": ["かちどき", "KACHIDOKI", "勝鬨"],
    },
]


@dataclass
class Candidate:
    value: Any
    confidence: float
    source: str
    raw: str = ""
    variant: str = ""
    reason: str = ""


def _nfkc(s: str) -> str:
    return unicodedata.normalize("NFKC", s or "")


def _compact(s: str) -> str:
    return re.sub(r"\s+", "", _nfkc(s))


def _similarity(a: str, b: str) -> float:
    a = re.sub(r"[\s\-ー・,，.。]", "", _nfkc(a).lower())
    b = re.sub(r"[\s\-ー・,，.。]", "", _nfkc(b).lower())
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def _decode(raw: bytes, max_edge: int = 2600) -> np.ndarray:
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    arr = cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2BGR)
    h, w = arr.shape[:2]
    if max(h, w) > max_edge:
        scale = max_edge / max(h, w)
        arr = cv2.resize(arr, (max(1, int(w * scale)), max(1, int(h * scale))), interpolation=cv2.INTER_AREA)
    return arr


def image_quality(raw: bytes) -> dict[str, Any]:
    im = _decode(raw, 1800)
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    blur_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    blur_score = max(0.0, min(1.0, math.log1p(blur_var) / math.log1p(900.0)))
    mean = float(gray.mean())
    exposure_score = max(0.0, 1.0 - abs(mean - 150.0) / 150.0)
    glare_ratio = float(((hsv[:, :, 2] > 245) & (hsv[:, :, 1] < 35)).mean())
    dark_ratio = float((gray < 30).mean())
    resolution_score = min(1.0, min(im.shape[:2]) / 900.0)
    overall = 0.34 * blur_score + 0.24 * exposure_score + 0.22 * resolution_score + 0.20 * max(0.0, 1.0 - glare_ratio * 5)
    issues: list[str] = []
    if blur_score < .42:
        issues.append("ピンぼけ/手ブレ")
    if glare_ratio > .08:
        issues.append("反射/白飛び")
    if dark_ratio > .18:
        issues.append("黒つぶれ")
    if resolution_score < .55:
        issues.append("解像度不足")
    return {
        "blur_score": round(blur_score, 3),
        "exposure_score": round(exposure_score, 3),
        "glare_score": round(max(0.0, 1.0 - glare_ratio * 5), 3),
        "resolution_score": round(resolution_score, 3),
        "overall": round(overall, 3),
        "issues": issues,
        "capture_action": "再撮影推奨" if overall < .46 else ("要確認" if overall < .64 else "OK"),
    }


def _order_quad(pts: np.ndarray) -> np.ndarray:
    p = np.asarray(pts, np.float32).reshape(4, 2)
    s = p.sum(axis=1)
    d = np.diff(p, axis=1).ravel()
    return np.array([p[np.argmin(s)], p[np.argmin(d)], p[np.argmax(s)], p[np.argmax(d)]], np.float32)


def _find_document_quad(im: np.ndarray) -> tuple[np.ndarray | None, float]:
    h, w = im.shape[:2]
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 35, 120)
    edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8), iterations=2)
    cnts, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    best: tuple[float, np.ndarray] | None = None
    area_img = h * w
    for c in sorted(cnts, key=cv2.contourArea, reverse=True)[:80]:
        area = cv2.contourArea(c)
        if area < area_img * .12:
            continue
        peri = cv2.arcLength(c, True)
        poly = cv2.approxPolyDP(c, .018 * peri, True)
        if len(poly) != 4:
            rect = cv2.minAreaRect(c)
            pts = cv2.boxPoints(rect)
        else:
            pts = poly.reshape(4, 2)
        q = _order_quad(pts)
        tl, tr, br, bl = q
        ww = (np.linalg.norm(tr - tl) + np.linalg.norm(br - bl)) / 2
        hh = (np.linalg.norm(bl - tl) + np.linalg.norm(br - tr)) / 2
        if min(ww, hh) < 1:
            continue
        aspect = max(ww, hh) / min(ww, hh)
        if not 1.15 <= aspect <= 2.25:
            continue
        rectangularity = min(1.0, area / max(1.0, ww * hh))
        score = area / area_img + .18 * rectangularity - .10 * abs(aspect - 1.45)
        if best is None or score > best[0]:
            best = (score, q)
    return (best[1], float(best[0])) if best else (None, 0.0)


def rectify_ticket(raw: bytes) -> tuple[np.ndarray, dict[str, Any]]:
    im = _decode(raw, 2600)
    quad, qscore = _find_document_quad(im)
    detected = quad is not None
    if quad is not None:
        tl, tr, br, bl = _order_quad(quad)
        if ((np.linalg.norm(tr - tl) + np.linalg.norm(br - bl)) / 2) < ((np.linalg.norm(bl - tl) + np.linalg.norm(br - tr)) / 2):
            quad = np.array([bl, tl, tr, br], np.float32)
        dst = np.array([[0, 0], [CANON_W - 1, 0], [CANON_W - 1, CANON_H - 1], [0, CANON_H - 1]], np.float32)
        out = cv2.warpPerspective(im, cv2.getPerspectiveTransform(_order_quad(quad), dst), (CANON_W, CANON_H), borderValue=(255, 255, 255))
    else:
        # Bright-paper fallback crops both axes; the previous pipeline only
        # cropped vertically which distorted the template coordinates.
        hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
        mask = (((hsv[:, :, 2] > 125) & (hsv[:, :, 1] < 120)).astype(np.uint8) * 255)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((19, 19), np.uint8), iterations=2)
        cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if cnts:
            c = max(cnts, key=cv2.contourArea)
            x, y, w, h = cv2.boundingRect(c)
            if w * h > im.shape[0] * im.shape[1] * .15:
                pad = max(4, int(min(w, h) * .01))
                crop = im[max(0, y - pad):min(im.shape[0], y + h + pad), max(0, x - pad):min(im.shape[1], x + w + pad)]
            else:
                crop = im
        else:
            crop = im
        out = cv2.resize(crop, (CANON_W, CANON_H), interpolation=cv2.INTER_CUBIC)
    # Orientation resolver: only two inexpensive sparse-text passes.
    rot = cv2.rotate(out, cv2.ROTATE_180)
    keys = ("質", "流", "契約", "住所", "氏名", "電話")
    def anchor_score(x: np.ndarray) -> int:
        try:
            t = pytesseract.image_to_string(x, lang="jpn+eng", config="--oem 1 --psm 11")
        except Exception:
            return 0
        z = _compact(t)
        return sum(k in z for k in keys)
    s0 = anchor_score(out)
    s1 = anchor_score(rot)
    if s1 > s0:
        out = rot
    return out, {"document_detected": detected, "geometry_score": round(qscore, 3), "orientation_score": max(s0, s1)}


def _crop(im: np.ndarray, bbox: tuple[float, float, float, float], expand: float = .012) -> np.ndarray:
    h, w = im.shape[:2]
    x1, y1, x2, y2 = bbox
    dx, dy = expand, expand
    return im[max(0, int((y1 - dy) * h)):min(h, int((y2 + dy) * h)), max(0, int((x1 - dx) * w)):min(w, int((x2 + dx) * w))]


def _variants(roi: np.ndarray, field_type: str) -> list[tuple[str, np.ndarray]]:
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8)).apply(gray)
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    adaptive = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 13)
    sharp = cv2.addWeighted(gray, 1.65, cv2.GaussianBlur(gray, (0, 0), 1.1), -0.65, 0)
    base: list[tuple[str, np.ndarray]] = [("gray", gray), ("clahe", clahe), ("otsu", otsu)]
    if field_type in {"money", "date", "phone"}:
        base.append(("adaptive", adaptive))
    else:
        base.append(("sharp", sharp))
    out: list[tuple[str, np.ndarray]] = []
    for name, v in base:
        h, w = v.shape[:2]
        if min(h, w) < 120:
            v = cv2.resize(v, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
        out.append((name, v))
    return out


def _tess_candidate(im: np.ndarray, lang: str, psm: int, whitelist: str | None = None) -> tuple[str, float]:
    cfg = f"--oem 1 --psm {psm}"
    if whitelist:
        cfg += f" -c tessedit_char_whitelist={whitelist}"
    try:
        d = pytesseract.image_to_data(im, lang=lang, config=cfg, output_type=pytesseract.Output.DICT)
    except Exception:
        return "", 0.0
    texts: list[str] = []
    confs: list[float] = []
    for t, c in zip(d.get("text", []), d.get("conf", [])):
        t = (t or "").strip()
        if not t:
            continue
        texts.append(t)
        try:
            cf = float(c)
            if cf >= 0:
                confs.append(cf / 100.0)
        except Exception:
            pass
    return " ".join(texts), (sum(confs) / len(confs) if confs else 0.0)


def parse_date_value(raw: str) -> str:
    z = _nfkc(raw).replace("元年", "1年")
    z = re.sub(r"\s+", "", z)
    # Japanese era formats: 令和8年9月2日 / R8.9.2 / 8年9月2日 when labels are in a date ROI.
    m = re.search(r"(?:令和|R)\s*(\d{1,2})\D{0,3}(\d{1,2})\D{0,3}(\d{1,2})", z, re.I)
    if m:
        y, mo, d = 2018 + int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return date(y, mo, d).isoformat()
        except Exception:
            pass
    m = re.search(r"(?:平成|H)\s*(\d{1,2})\D{0,3}(\d{1,2})\D{0,3}(\d{1,2})", z, re.I)
    if m:
        y, mo, d = 1988 + int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return date(y, mo, d).isoformat()
        except Exception:
            pass
    nums = [int(x) for x in re.findall(r"\d+", z)]
    triples: list[tuple[int, int, int]] = []
    if len(nums) >= 3:
        triples.append(tuple(nums[:3]))
    digits = re.sub(r"\D", "", z)
    if len(digits) >= 8:
        triples.append((int(digits[:4]), int(digits[4:6]), int(digits[6:8])))
    # Date ROI with a 1-2 digit year is most likely Reiwa for current tickets.
    if len(nums) >= 3 and 1 <= nums[0] <= 30 and ("年" in z or len(str(nums[0])) <= 2):
        triples.append((2018 + nums[0], nums[1], nums[2]))
    for y, mo, d in triples:
        try:
            v = date(y, mo, d)
            if 2020 <= y <= 2100:
                return v.isoformat()
        except Exception:
            continue
    return ""


def parse_money_value(raw: str) -> int:
    z = _nfkc(raw)
    groups = re.findall(r"\d[\d,，.\s]{1,12}", z)
    vals: list[int] = []
    for g in groups:
        ds = re.sub(r"\D", "", g)
        if ds:
            try:
                v = int(ds)
                if 100 <= v <= 100_000_000:
                    vals.append(v)
            except Exception:
                pass
    if not vals:
        ds = re.sub(r"\D", "", z)
        if ds:
            try:
                v = int(ds[-9:])
                if 100 <= v <= 100_000_000:
                    vals.append(v)
            except Exception:
                pass
    return max(vals) if vals else 0


def parse_phone_value(raw: str) -> str:
    ds = re.sub(r"\D", "", _nfkc(raw))
    for n in (11, 10):
        for i in range(max(1, len(ds) - n + 1)):
            x = ds[i:i+n]
            if len(x) != n or not x.startswith("0"):
                continue
            if n == 11 and x[:3] in {"070", "080", "090"}:
                return f"{x[:3]}-{x[3:7]}-{x[7:]}"
            if n == 10:
                if x.startswith(("03", "06")):
                    return f"{x[:2]}-{x[2:6]}-{x[6:]}"
                # Generic Japanese fixed-line formatting. Keep all digits even
                # if the exact area-code split is uncertain.
                return f"{x[:3]}-{x[3:6]}-{x[6:]}"
    return ""


def parse_name_value(raw: str) -> str:
    z = _nfkc(raw)
    z = re.sub(r".*?(氏\s*名|名\s*前)[:：]?", "", z)
    z = re.sub(r"(生年月日|住所|電話|交付|免許).*$", "", z)
    z = re.sub(r"[^一-龠々ぁ-んァ-ヶー\s]", "", z)
    z = re.sub(r"\s+", " ", z).strip()
    return z if 2 <= len(z.replace(" ", "")) <= 24 else ""


def parse_address_value(raw: str) -> str:
    z = _nfkc(raw)
    z = re.sub(r".*?住\s*所[:：]?", "", z)
    z = re.sub(r"(氏名|電話|交付|免許).*$", "", z)
    z = re.sub(r"\s+", "", z)
    z = re.sub(r"[^一-龠々ぁ-んァ-ヶー0-9\-丁目番地号ノの]", "", z)
    return z if len(z) >= 6 else ""


def parse_items_value(raw: str) -> str:
    z = _nfkc(raw)
    z = re.sub(r"\s+", " ", z).strip()
    noise = ("契約", "流質", "年月日", "住所", "氏名", "電話")
    if not z or any(x in z for x in noise):
        return ""
    return z[:300]


PARSERS: dict[str, Callable[[str], Any]] = {
    "date": parse_date_value,
    "money": parse_money_value,
    "phone": parse_phone_value,
    "name": parse_name_value,
    "address": parse_address_value,
    "items": parse_items_value,
}


def _recognize_candidates(roi: np.ndarray, field_type: str) -> list[Candidate]:
    parser = PARSERS[field_type]
    candidates: list[Candidate] = []
    lang = "eng" if field_type in {"date", "money", "phone"} else "jpn+eng"
    whitelist = None
    if field_type == "money":
        whitelist = "0123456789,"
    elif field_type == "phone":
        whitelist = "0123456789-"
    # Deliberately use different segmentation assumptions rather than repeating
    # the same OCR call. This is an ensemble of weak but diverse observations.
    psms = [7, 6] if field_type in {"date", "money", "phone", "name"} else [6, 11]
    for vname, v in _variants(roi, field_type):
        psm = psms[0] if vname in {"gray", "clahe"} else psms[-1]
        raw, conf = _tess_candidate(v, lang, psm, whitelist)
        value = parser(raw)
        valid = bool(value) if not isinstance(value, int) else value > 0
        if valid:
            candidates.append(Candidate(value, max(.05, min(.99, conf)), "Tesseract", raw, vname))
    return candidates


def _resolve(cands: list[Candidate], field_type: str) -> dict[str, Any]:
    if not cands:
        return {"value": 0 if field_type == "money" else "", "confidence": 0.0, "status": "invalid", "evidence": []}
    groups: dict[str, list[Candidate]] = {}
    for c in cands:
        k = str(c.value)
        groups.setdefault(k, []).append(c)
    ranked: list[tuple[float, str, list[Candidate]]] = []
    for k, xs in groups.items():
        # Independent repeated agreement should raise confidence, but cap below
        # auto-confirm unless another document or business rule also supports it.
        fused = 1.0
        for x in xs:
            fused *= (1.0 - min(.92, max(.05, x.confidence)))
        fused = 1.0 - fused
        agreement = min(.14, .045 * (len(xs) - 1))
        score = min(.965, fused + agreement)
        ranked.append((score, k, xs))
    ranked.sort(reverse=True, key=lambda x: x[0])
    score, _, xs = ranked[0]
    value = xs[0].value
    return {
        "value": value,
        "confidence": round(score, 3),
        "status": "ok" if score >= .90 else ("review" if score >= .60 else "invalid"),
        "evidence": [asdict(x) for x in sorted(cands, key=lambda c: c.confidence, reverse=True)[:12]],
    }


def _field_result(im: np.ndarray, spec: dict[str, Any]) -> dict[str, Any]:
    roi = _crop(im, spec["bbox"])
    cands = _recognize_candidates(roi, spec["type"])
    out = _resolve(cands, spec["type"])
    out["bbox"] = list(spec["bbox"])
    out["type"] = spec["type"]
    return out


def recognize_ticket(raw: bytes, license_data: dict[str, Any] | None = None, template_id: str = "shichiya_yamagata_v1") -> dict[str, Any]:
    quality = image_quality(raw)
    im, geometry = rectify_ticket(raw)
    template = TEMPLATES[template_id]
    fields = {name: _field_result(im, spec) for name, spec in template["fields"].items()}

    # Cross-document resolver: identity document is the source of truth for
    # customer identity when the ticket is blank/weak or fuzzy-matches it.
    lic = license_data or {}
    for key in ("name", "address"):
        lv = str(lic.get(key) or "").strip()
        if not lv:
            continue
        tf = fields[key]
        tv = str(tf.get("value") or "")
        sim = _similarity(tv, lv) if tv else 0.0
        lconf = float(lic.get("confidence") or .92)
        if not tv or sim >= .62 or float(tf.get("confidence") or 0) < .72:
            tf["evidence"].append({"value": lv, "confidence": lconf, "source": "identity_document", "raw": lv, "variant": "cross_document", "reason": f"fuzzy_similarity={sim:.3f}"})
            tf["value"] = lv
            tf["confidence"] = round(min(.995, max(float(tf.get("confidence") or 0), .80 * lconf + .20 * max(sim, .5))), 3)
            tf["status"] = "ok" if tf["confidence"] >= .90 else "review"

    # Date consistency constraints.
    cd = str(fields["contract_date"].get("value") or "")
    fd = str(fields["forfeiture_due_date"].get("value") or "")
    if cd and fd:
        try:
            cdd, fdd = date.fromisoformat(cd), date.fromisoformat(fd)
            delta = (fdd - cdd).days
            if 1 <= delta <= 180:
                for k in ("contract_date", "forfeiture_due_date"):
                    fields[k]["confidence"] = round(min(.985, float(fields[k]["confidence"]) + .07), 3)
                    fields[k]["evidence"].append({"value": fields[k]["value"], "confidence": 1.0, "source": "business_rule", "raw": "", "variant": "date_order", "reason": f"forfeit-after-contract:{delta}d"})
            else:
                fields["forfeiture_due_date"]["status"] = "review"
                fields["forfeiture_due_date"]["confidence"] = min(.49, float(fields["forfeiture_due_date"]["confidence"]))
        except Exception:
            pass

    # Interest constraint searches all OCR candidates, not just top-1. This is
    # the same reasoning used manually: amount * configured monthly rate.
    pf = fields["principal_amount"]
    inf = fields["interest_amount"]
    pvals: dict[int, float] = {}
    ivals: dict[int, float] = {}
    for e in pf.get("evidence", []):
        try:
            v = int(e.get("value") or 0)
            if v > 0: pvals[v] = max(pvals.get(v, 0), float(e.get("confidence") or 0))
        except Exception:
            pass
    for e in inf.get("evidence", []):
        try:
            v = int(e.get("value") or 0)
            if v > 0: ivals[v] = max(ivals.get(v, 0), float(e.get("confidence") or 0))
        except Exception:
            pass
    best_pair: tuple[float, int, int] | None = None
    for p, pc in pvals.items():
        expected = int(round(p * INTEREST_RATE))
        for it, ic in ivals.items():
            tol = max(10, int(expected * .025))
            if abs(it - expected) <= tol:
                score = .45 * pc + .35 * ic + .20
                if best_pair is None or score > best_pair[0]:
                    best_pair = (score, p, it)
    if best_pair:
        _, p, it = best_pair
        pf["value"], inf["value"] = p, it
        pf["confidence"] = round(min(.995, max(float(pf["confidence"]), .93)), 3)
        inf["confidence"] = round(min(.995, max(float(inf["confidence"]), .93)), 3)
        for f, val in ((pf, p), (inf, it)):
            f["status"] = "ok"
            f["evidence"].append({"value": val, "confidence": 1.0, "source": "business_rule", "raw": "", "variant": "interest_constraint", "reason": f"{p}*{INTEREST_RATE:.3f}≈{it}"})

    critical = ["contract_date", "forfeiture_due_date", "principal_amount", "interest_amount", "name", "phone", "items"]
    weighted = []
    for k in critical:
        conf = float(fields[k].get("confidence") or 0)
        # False-accept-aware score: invalid values contribute zero even if an OCR
        # engine was confident in meaningless text.
        if fields[k].get("status") == "invalid":
            conf = 0.0
        weighted.append(conf)
    field_accuracy = sum(weighted) / len(weighted)
    min_critical = min(float(fields[k].get("confidence") or 0) for k in ("contract_date", "forfeiture_due_date", "principal_amount"))
    false_accept_risk = max(0.0, 1.0 - min_critical)
    review_required = any(fields[k].get("status") != "ok" for k in critical) or false_accept_risk > .08
    return {
        "template_id": template_id,
        "pipeline_version": ENGINE_VERSION,
        "fields": fields,
        "item_lines": [str(fields["items"].get("value") or "")] if fields["items"].get("value") else [],
        "quality": quality,
        "geometry": geometry,
        "field_accuracy": round(field_accuracy, 3),
        "false_accept_risk": round(false_accept_risk, 3),
        "needs_review": review_required,
        "document_detected": geometry["document_detected"],
        "suggestions": {},
        "money_cells": {},
        "engine": "OpenCV rectification + multi-preprocess Tesseract ensemble + cross-document/business resolver",
    }


def recognize_product_image(raw: bytes) -> dict[str, Any]:
    quality = image_quality(raw)
    im = _decode(raw, 1900)
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    variants = [
        ("gray", gray),
        ("clahe", cv2.createCLAHE(2.0, (8, 8)).apply(gray)),
        ("sharp", cv2.addWeighted(gray, 1.7, cv2.GaussianBlur(gray, (0, 0), 1.2), -0.7, 0)),
    ]
    observations: list[Candidate] = []
    texts: list[str] = []
    for name, v in variants:
        t, c = _tess_candidate(v, "jpn+eng", 11)
        if t:
            texts.append(t)
            observations.append(Candidate(t, c, "Tesseract-product", t, name))
    merged = " ".join(texts)
    best: tuple[float, dict[str, Any], str] | None = None
    for p in PRODUCT_MASTER:
        for alias in p["aliases"]:
            sc = _similarity(merged, alias)
            # Substring presence is stronger than whole-string similarity because
            # product photos contain lots of unrelated packaging/background text.
            if _compact(alias).lower() in _compact(merged).lower():
                sc = max(sc, .96)
            if best is None or sc > best[0]:
                best = (sc, p, alias)
    if best and best[0] >= .45:
        sc, p, alias = best
        return {
            "category": p["category"],
            "brand": p["brand"],
            "series": p["series"],
            "confidence": round(min(.98, .55 + .45 * sc), 3),
            "matched_alias": alias,
            "raw_text": merged[:1200],
            "quality": quality,
            "evidence": [asdict(x) for x in observations],
        }
    return {"category": "", "brand": "", "series": "", "confidence": 0.0, "matched_alias": "", "raw_text": merged[:1200], "quality": quality, "evidence": [asdict(x) for x in observations]}


def merge_item(ticket_text: str, product: dict[str, Any]) -> dict[str, Any]:
    pc = float(product.get("confidence") or 0)
    if pc >= .72:
        series = str(product.get("series") or "")
        ticket_sim = _similarity(ticket_text, series) if ticket_text else 0.0
        conf = min(.995, pc + (.06 if ticket_sim >= .55 else 0))
        return {
            "category": product.get("category") or "",
            "brand": product.get("brand") or "",
            "description": series,
            "confidence": round(conf, 3),
            "evidence": {"ticket_text": ticket_text, "ticket_similarity": round(ticket_sim, 3), "product": product},
        }
    return {
        "category": ticket_text[:100] if ticket_text else "",
        "brand": "",
        "description": ticket_text[:300] if ticket_text else "画像確認",
        "confidence": round(max(.0, pc), 3),
        "evidence": {"ticket_text": ticket_text, "product": product},
    }


class OCRProvider:
    """Adapter contract for swapping OCR engines without changing the resolver."""

    name = "abstract"

    def recognize(self, image: np.ndarray, field_type: str) -> list[Candidate]:
        raise NotImplementedError


class TesseractProvider(OCRProvider):
    name = "tesseract"

    def recognize(self, image: np.ndarray, field_type: str) -> list[Candidate]:
        return _recognize_candidates(image, field_type)


class VLMResolverAdapter:
    """VLM seam. Production remains privacy-safe until a local/cloud adapter is explicitly configured."""

    def __init__(self) -> None:
        self.mode = os.getenv("VLM_MODE", "disabled")

    def resolve(self, image: np.ndarray, field_name: str, candidates: list[Candidate]) -> list[Candidate]:
        # Interface is intentionally implemented now; no external transmission is
        # performed by default. A local VLM can be plugged in without touching the
        # orchestration or evidence schema.
        return []

    def status(self) -> dict[str, Any]:
        return {"mode": self.mode, "external_transmission": False if self.mode == "disabled" else None}


def runtime_status() -> dict[str, Any]:
    try:
        langs = pytesseract.get_languages(config="")
    except Exception:
        langs = []
    return {
        "pipeline_version": ENGINE_VERSION,
        "template_registry": list(TEMPLATES.keys()),
        "multi_preprocessing": True,
        "cross_document_matching": True,
        "product_master": len(PRODUCT_MASTER),
        "business_rule_interest_rate": INTEREST_RATE,
        "evidence_retained": True,
        "tesseract_jpn": "jpn" in langs,
        "vlm": VLMResolverAdapter().status(),
        "external_ai": False,
    }
