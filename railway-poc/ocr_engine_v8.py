from __future__ import annotations

import gc
import io
import math
import os
import re
import threading
import unicodedata
from dataclasses import dataclass
from datetime import date
from difflib import SequenceMatcher
from typing import Any

import cv2
import numpy as np
import pytesseract
from PIL import Image, ImageOps

PIPELINE_VERSION = "8.0.0"
TICKET_W, TICKET_H = 1600, 850
LICENSE_W, LICENSE_H = 1400, 882
MAX_EDGE = int(os.getenv("OCR_MAX_EDGE", "2200"))
_PADDLE = None
_PADDLE_LOCK = threading.Lock()

FIELD_ROIS = {
    "contract_date": (.08, .08, .52, .22),
    "forfeiture_due_date": (.08, .15, .52, .29),
    "principal_amount": (.08, .25, .53, .43),
    "interest_amount": (.08, .35, .53, .52),
    "phone": (.08, .60, .55, .79),
    "items": (.50, .25, .96, .50),
}

LABELS = {
    "contract_date": ("質入年月日", "契約日", "質入日", "質入"),
    "forfeiture_due_date": ("流質年月日", "流質期限", "流質日", "流質"),
    "principal_amount": ("契約金額", "質入金額", "元金", "貸付金額", "金額"),
    "interest_amount": ("利息", "利子"),
    "phone": ("電話番号", "電話", "TEL"),
    "items": ("質入品", "質物", "品目", "品名"),
}

BRANDS = {
    "rolex": "ROLEX", "ロレックス": "ROLEX",
    "omega": "OMEGA", "オメガ": "OMEGA",
    "seiko": "SEIKO", "セイコー": "SEIKO",
    "citizen": "CITIZEN", "シチズン": "CITIZEN",
    "casio": "CASIO", "カシオ": "CASIO",
    "tiffany": "Tiffany & Co.", "ティファニー": "Tiffany & Co.",
    "cartier": "Cartier", "カルティエ": "Cartier",
    "bvlgari": "BVLGARI", "ブルガリ": "BVLGARI",
    "louisvuitton": "LOUIS VUITTON", "ルイヴィトン": "LOUIS VUITTON",
    "gucci": "GUCCI", "グッチ": "GUCCI",
    "chanel": "CHANEL", "シャネル": "CHANEL",
    "coach": "COACH", "コーチ": "COACH",
    "hermes": "HERMES", "エルメス": "HERMES",
    "prada": "PRADA", "プラダ": "PRADA",
    "apple": "Apple", "iphone": "Apple", "ipad": "Apple", "macbook": "Apple",
    "sony": "SONY", "ソニー": "SONY",
    "canon": "Canon", "キヤノン": "Canon", "キャノン": "Canon",
    "nikon": "Nikon", "ニコン": "Nikon",
}

CATEGORY_HINTS = {
    "腕時計": ("腕時計", "時計", "watch", "rolex", "omega", "seiko", "citizen", "casio"),
    "バッグ": ("バッグ", "鞄", "bag", "louis", "gucci", "chanel", "coach", "hermes", "prada"),
    "指輪": ("指輪", "リング", "ring"),
    "ネックレス": ("ネックレス", "necklace"),
    "貴金属": ("金", "gold", "pt", "k18", "18k", "プラチナ"),
    "スマートフォン": ("iphone", "スマホ", "phone", "galaxy", "pixel"),
    "PC": ("macbook", "laptop", "notebook", "パソコン", "pc"),
    "カメラ": ("camera", "カメラ", "canon", "nikon", "sony"),
}

@dataclass
class Token:
    text: str
    confidence: float
    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def cx(self) -> float:
        return (self.x1 + self.x2) / 2

    @property
    def cy(self) -> float:
        return (self.y1 + self.y2) / 2


def _norm(s: str) -> str:
    return unicodedata.normalize("NFKC", s or "")


def _compact(s: str) -> str:
    return re.sub(r"[\s:：・|｜_/\\\-\(\)（）]+", "", _norm(s)).lower()


def _digits(s: str) -> str:
    return re.sub(r"\D", "", _norm(s))


def _jp_ratio(s: str) -> float:
    s = s or ""
    n = sum(1 for c in s if ("\u3040" <= c <= "\u30ff") or ("\u3400" <= c <= "\u9fff"))
    return n / max(1, len(s))


def _decode(raw: bytes, max_edge: int = MAX_EDGE) -> np.ndarray:
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    arr = cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2BGR)
    h, w = arr.shape[:2]
    if max(h, w) > max_edge:
        s = max_edge / max(h, w)
        arr = cv2.resize(arr, (max(1, int(w * s)), max(1, int(h * s))), interpolation=cv2.INTER_AREA)
    return arr


def _order_quad(pts: np.ndarray) -> np.ndarray:
    pts = np.asarray(pts, np.float32).reshape(4, 2)
    s = pts.sum(1)
    d = np.diff(pts, axis=1).ravel()
    return np.array([pts[np.argmin(s)], pts[np.argmin(d)], pts[np.argmax(s)], pts[np.argmax(d)]], np.float32)


def _warp(im: np.ndarray, quad: np.ndarray, w: int, h: int) -> np.ndarray:
    q = _order_quad(quad)
    dst = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], np.float32)
    return cv2.warpPerspective(im, cv2.getPerspectiveTransform(q, dst), (w, h), borderValue=(255, 255, 255))


def _document_quad(im: np.ndarray, expected_aspect: float) -> np.ndarray | None:
    h, w = im.shape[:2]
    area_all = h * w
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)

    candidates: list[tuple[float, np.ndarray]] = []
    for source in (
        cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 30, 110),
        cv2.threshold(gray, 170, 255, cv2.THRESH_BINARY)[1],
    ):
        source = cv2.morphologyEx(source, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8), iterations=2)
        cnts, _ = cv2.findContours(source, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        for c in sorted(cnts, key=cv2.contourArea, reverse=True)[:80]:
            ar = cv2.contourArea(c)
            if ar < area_all * .12:
                continue
            peri = cv2.arcLength(c, True)
            ap = cv2.approxPolyDP(c, .018 * peri, True)
            if len(ap) == 4:
                q = _order_quad(ap.reshape(4, 2))
            else:
                rect = cv2.minAreaRect(c)
                rw, rh = rect[1]
                if min(rw, rh) < 40:
                    continue
                q = _order_quad(cv2.boxPoints(rect))
            top = np.linalg.norm(q[1] - q[0])
            bottom = np.linalg.norm(q[2] - q[3])
            left = np.linalg.norm(q[3] - q[0])
            right = np.linalg.norm(q[2] - q[1])
            qw = (top + bottom) / 2
            qh = (left + right) / 2
            if qh <= 1 or qw <= 1:
                continue
            aspect = max(qw, qh) / min(qw, qh)
            target = expected_aspect if expected_aspect >= 1 else 1 / expected_aspect
            if not .8 * target <= aspect <= 1.25 * target:
                continue
            score = ar / area_all + .35 * math.exp(-abs(aspect - target) * 4)
            candidates.append((score, q))
    return max(candidates, key=lambda x: x[0])[1] if candidates else None


def _rotate_score(im: np.ndarray, words: tuple[str, ...]) -> int:
    try:
        d = pytesseract.image_to_string(cv2.resize(im, (800, int(im.shape[0] * 800 / im.shape[1]))), lang="jpn+eng", config="--psm 11")
    except Exception:
        return 0
    c = _compact(d)
    return sum(1 for w in words if _compact(w) in c)


def normalize_ticket(raw: bytes) -> tuple[np.ndarray, bool]:
    im = _decode(raw)
    q = _document_quad(im, TICKET_W / TICKET_H)
    if q is not None:
        out = _warp(im, q, TICKET_W, TICKET_H)
        detected = True
    else:
        hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
        mask = ((hsv[:, :, 2] > 150) & (hsv[:, :, 1] < 105)).astype(np.uint8) * 255
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((17, 17), np.uint8), iterations=2)
        cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if cnts:
            c = max(cnts, key=cv2.contourArea)
            x, y, w, h = cv2.boundingRect(c)
            if w * h > im.shape[0] * im.shape[1] * .15:
                crop = im[y:y+h, x:x+w]
                out = cv2.resize(crop, (TICKET_W, TICKET_H), interpolation=cv2.INTER_CUBIC)
                detected = True
            else:
                out = cv2.resize(im, (TICKET_W, TICKET_H), interpolation=cv2.INTER_AREA)
                detected = False
        else:
            out = cv2.resize(im, (TICKET_W, TICKET_H), interpolation=cv2.INTER_AREA)
            detected = False
    rot = cv2.rotate(out, cv2.ROTATE_180)
    if _rotate_score(rot, ("質札", "質入", "流質", "氏名", "住所")) > _rotate_score(out, ("質札", "質入", "流質", "氏名", "住所")):
        out = rot
    return out, detected


def normalize_license(raw: bytes) -> tuple[np.ndarray, bool]:
    im = _decode(raw)
    q = _document_quad(im, LICENSE_W / LICENSE_H)
    if q is not None:
        out = _warp(im, q, LICENSE_W, LICENSE_H)
        detected = True
    else:
        out = cv2.resize(im, (LICENSE_W, LICENSE_H), interpolation=cv2.INTER_AREA)
        detected = False
    rot = cv2.rotate(out, cv2.ROTATE_180)
    if _rotate_score(rot, ("住所", "氏名", "免許", "交付")) > _rotate_score(out, ("住所", "氏名", "免許", "交付")):
        out = rot
    return out, detected


def get_paddle():
    global _PADDLE
    if _PADDLE is not None:
        return _PADDLE
    with _PADDLE_LOCK:
        if _PADDLE is not None:
            return _PADDLE
        from paddleocr import PaddleOCR
        kwargs = dict(use_angle_cls=False, lang="japan", show_log=False, use_gpu=False, cpu_threads=1, enable_mkldnn=False)
        try:
            _PADDLE = PaddleOCR(**kwargs)
        except TypeError:
            kwargs.pop("enable_mkldnn", None)
            kwargs.pop("cpu_threads", None)
            _PADDLE = PaddleOCR(**kwargs)
        return _PADDLE


def paddle_tokens(im: np.ndarray) -> list[Token]:
    p = get_paddle()
    with _PADDLE_LOCK:
        result = p.ocr(im, cls=False)
    rows = result[0] if isinstance(result, list) and len(result) == 1 and isinstance(result[0], list) else result
    out: list[Token] = []
    for row in rows or []:
        try:
            box, rec = row[0], row[1]
            text, conf = str(rec[0]).strip(), float(rec[1])
            pts = np.asarray(box, np.float32).reshape(-1, 2)
            if not text:
                continue
            out.append(Token(text, conf, float(pts[:, 0].min()), float(pts[:, 1].min()), float(pts[:, 0].max()), float(pts[:, 1].max())))
        except Exception:
            continue
    return out


def _similarity(a: str, b: str) -> float:
    a, b = _compact(a), _compact(b)
    if not a or not b:
        return 0.0
    if a in b or b in a:
        return .98
    return SequenceMatcher(None, a, b).ratio()


def _find_label(tokens: list[Token], aliases: tuple[str, ...]) -> Token | None:
    best: tuple[float, Token] | None = None
    for t in tokens:
        for a in aliases:
            sc = _similarity(t.text, a) * (.7 + .3 * t.confidence)
            if sc > .47 and (best is None or sc > best[0]):
                best = (sc, t)
    return best[1] if best else None


def _nearby_text(tokens: list[Token], label: Token, w: int, h: int, allow_below: bool = True) -> str:
    same = []
    for t in tokens:
        if t is label:
            continue
        if t.x1 >= label.x1 - .02*w and abs(t.cy - label.cy) <= .075*h and t.x2 > label.x2:
            dist = max(0, t.x1 - label.x2) + 1.5 * abs(t.cy - label.cy)
            same.append((dist, t))
    if same:
        same.sort(key=lambda x: x[0])
        return " ".join(x[1].text for x in same[:3])
    if allow_below:
        below = []
        for t in tokens:
            if t is label:
                continue
            if t.y1 >= label.y1 and 0 <= t.y1 - label.y2 <= .12*h and abs(t.cx - label.cx) <= .28*w:
                dist = t.y1 - label.y2 + .5 * abs(t.cx - label.cx)
                below.append((dist, t))
        below.sort(key=lambda x: x[0])
        return " ".join(x[1].text for x in below[:3])
    return ""


def _crop(im: np.ndarray, box: tuple[float, float, float, float]) -> np.ndarray:
    h, w = im.shape[:2]
    x1, y1, x2, y2 = box
    return im[max(0, int(y1*h)):min(h, int(y2*h)), max(0, int(x1*w)):min(w, int(x2*w))]


def _tess_variants(im: np.ndarray, lang: str, whitelist: str | None = None) -> list[tuple[str, float, str]]:
    if im.size == 0:
        return []
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY) if im.ndim == 3 else im
    gray = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    variants = [
        ("gray", gray),
        ("otsu", cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]),
        ("adaptive", cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 11)),
    ]
    out = []
    for vn, x in variants:
        cfg = "--oem 1 --psm 6"
        if whitelist:
            cfg += f" -c tessedit_char_whitelist={whitelist}"
        try:
            d = pytesseract.image_to_data(x, lang=lang, config=cfg, output_type=pytesseract.Output.DICT)
        except Exception:
            continue
        texts, confs = [], []
        for t, c in zip(d.get("text", []), d.get("conf", [])):
            t = (t or "").strip()
            try:
                c = float(c)
            except Exception:
                c = -1
            if t:
                texts.append(t)
                if c >= 0:
                    confs.append(c/100)
        if texts:
            out.append((" ".join(texts), sum(confs)/len(confs) if confs else 0.0, f"Tesseract-{vn}"))
    return out


def parse_date(s: str) -> str:
    z = _norm(s)
    z = z.replace("元年", "1年")
    pats = [
        (r"令和\s*(\d{1,2})\D{0,4}(\d{1,2})\D{0,4}(\d{1,2})", lambda y: 2018 + int(y)),
        (r"\bR\s*(\d{1,2})\D{0,4}(\d{1,2})\D{0,4}(\d{1,2})", lambda y: 2018 + int(y)),
        (r"平成\s*(\d{1,2})\D{0,4}(\d{1,2})\D{0,4}(\d{1,2})", lambda y: 1988 + int(y)),
        (r"(20\d{2})\D{0,4}(\d{1,2})\D{0,4}(\d{1,2})", lambda y: int(y)),
    ]
    for pat, conv in pats:
        m = re.search(pat, z, re.I)
        if m:
            try:
                d = date(conv(m.group(1)), int(m.group(2)), int(m.group(3)))
                if 2020 <= d.year <= date.today().year + 5:
                    return d.isoformat()
            except Exception:
                pass
    nums = [int(x) for x in re.findall(r"\d{1,4}", z)]
    if len(nums) >= 3:
        y, m, d = nums[:3]
        if y < 100:
            ry = date.today().year - 2018
            if 1 <= y <= ry + 2:
                y = 2018 + y
        try:
            x = date(y, m, d)
            if 2020 <= x.year <= date.today().year + 5:
                return x.isoformat()
        except Exception:
            pass
    ds = _digits(z)
    if len(ds) >= 8:
        try:
            x = date(int(ds[:4]), int(ds[4:6]), int(ds[6:8]))
            if 2020 <= x.year <= date.today().year + 5:
                return x.isoformat()
        except Exception:
            pass
    return ""


def parse_money(s: str) -> int:
    z = _norm(s).replace(",", "").replace("，", "")
    vals = []
    for x in re.findall(r"(?<!\d)(\d{3,8})(?!\d)", z):
        try:
            v = int(x)
            if 100 <= v <= 100_000_000:
                vals.append(v)
        except Exception:
            pass
    return max(vals) if vals else 0


def parse_phone(s: str) -> str:
    d = _digits(s)
    m = re.search(r"(070|080|090)\d{8}", d)
    if m:
        x = m.group(0)
        return f"{x[:3]}-{x[3:7]}-{x[7:]}"
    for n in (10, 11):
        for i in range(max(0, len(d)-n+1)):
            x = d[i:i+n]
            if x.startswith("0") and not x.startswith(("0120", "0800")):
                if n == 10:
                    if x.startswith(("03", "06")):
                        return f"{x[:2]}-{x[2:6]}-{x[6:]}"
                    return f"{x[:3]}-{x[3:6]}-{x[6:]}"
                return f"{x[:3]}-{x[3:7]}-{x[7:]}"
    return ""


def _field(value: Any, raw: str, conf: float, engine: str, valid: bool, note: str = "") -> dict[str, Any]:
    if not valid:
        value = 0 if isinstance(value, int) else ""
        conf = min(conf, .25)
    status = "ok" if valid and conf >= .72 else ("review" if valid else "invalid")
    d = {"value": value, "raw": raw[:240], "confidence": round(float(conf), 3), "status": status, "engine": engine}
    if note:
        d["note"] = note
    return d


def _candidate_from_label(tokens: list[Token], key: str, im: np.ndarray) -> tuple[str, float, str]:
    label = _find_label(tokens, LABELS[key])
    h, w = im.shape[:2]
    if label:
        rest = _nearby_text(tokens, label, w, h, allow_below=True)
        joined = f"{label.text} {rest}".strip()
        return joined, max(label.confidence, .55), "Paddle-label"
    return "", 0.0, "none"


def _best_date(tokens: list[Token], key: str, im: np.ndarray) -> dict[str, Any]:
    candidates: list[tuple[str, float, str]] = []
    a = _candidate_from_label(tokens, key, im)
    if a[0]:
        candidates.append(a)
    for raw, conf, eng in _tess_variants(_crop(im, FIELD_ROIS[key]), "jpn+eng", None):
        candidates.append((raw, conf, eng))
    best = ("", "", 0.0, "none")
    for raw, conf, eng in candidates:
        v = parse_date(raw)
        score = conf + (.35 if v else 0)
        if score > best[2]:
            best = (v, raw, score, eng)
    v, raw, score, eng = best
    return _field(v, raw, min(score, .98), eng, bool(v), "和暦/西暦を正規化")


def _best_money(tokens: list[Token], key: str, im: np.ndarray) -> dict[str, Any]:
    candidates: list[tuple[int, str, float, str]] = []
    raw, conf, eng = _candidate_from_label(tokens, key, im)
    if raw:
        candidates.append((parse_money(raw), raw, conf, eng))
    roi = _crop(im, FIELD_ROIS[key])
    if roi.size:
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        inv = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY_INV)[1]
        hlines = cv2.morphologyEx(inv, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (35, 1)))
        vlines = cv2.morphologyEx(inv, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, 25)))
        cleaned = cv2.bitwise_not(cv2.subtract(inv, cv2.bitwise_or(hlines, vlines)))
        cleaned = cv2.cvtColor(cleaned, cv2.COLOR_GRAY2BGR)
        for rr, cc, ee in _tess_variants(cleaned, "eng", "0123456789,"):
            candidates.append((parse_money(rr), rr, cc, ee + "-gridremoved"))
    best = (0, "", 0.0, "none")
    for v, raw, conf, eng in candidates:
        score = conf + (.30 if v else 0)
        if score > best[2]:
            best = (v, raw, score, eng)
    v, raw, score, eng = best
    return _field(v, raw, min(score, .98), eng, v > 0)


def _best_phone(tokens: list[Token], im: np.ndarray) -> dict[str, Any]:
    candidates = []
    raw, conf, eng = _candidate_from_label(tokens, "phone", im)
    if raw:
        candidates.append((raw, conf, eng))
    for rr, cc, ee in _tess_variants(_crop(im, FIELD_ROIS["phone"]), "eng", "0123456789-"):
        candidates.append((rr, cc, ee))
    best = ("", "", 0.0, "none")
    for raw, conf, eng in candidates:
        v = parse_phone(raw)
        sc = conf + (.28 if v else 0)
        if sc > best[2]:
            best = (v, raw, sc, eng)
    v, raw, sc, eng = best
    return _field(v, raw, min(sc, .98), eng, bool(v), "携帯・固定電話対応")


def _item_text_valid(s: str) -> bool:
    z = _norm(s).strip()
    if len(z) < 2:
        return False
    if any(x in z for x in ("確認ください", "裏面", "無効", "契約金額", "流質年月日", "質入年月日")):
        return False
    compact = _compact(z)
    known = any(k in compact for k in BRANDS)
    if _jp_ratio(z) < .08 and not known and len(re.findall(r"[A-Za-z]{2,}", z)) < 2:
        return False
    return True


def _ticket_item_text(tokens: list[Token], im: np.ndarray) -> tuple[str, float, str]:
    label = _find_label(tokens, LABELS["items"])
    cands: list[tuple[str, float, str]] = []
    if label:
        h, w = im.shape[:2]
        txt = _nearby_text(tokens, label, w, h, True)
        if txt:
            cands.append((txt, label.confidence, "Paddle-label"))
    for rr, cc, ee in _tess_variants(_crop(im, FIELD_ROIS["items"]), "jpn+eng"):
        cands.append((rr, cc, ee))
    cands = [x for x in cands if _item_text_valid(x[0])]
    if not cands:
        return "", 0.0, "none"
    return max(cands, key=lambda x: x[1])


def _brand_and_category(text: str) -> tuple[str, str]:
    c = _compact(text)
    brand = ""
    for k, v in BRANDS.items():
        if _compact(k) in c:
            brand = v
            break
    category = ""
    lower = _norm(text).lower()
    for cat, hints in CATEGORY_HINTS.items():
        if any(_compact(h) in c or h.lower() in lower for h in hints):
            category = cat
            break
    return brand, category


def analyze_item_image(raw: bytes) -> dict[str, Any]:
    im = _decode(raw, 1400)
    try:
        toks = paddle_tokens(im)
    except Exception:
        toks = []
    texts = [t.text for t in toks if t.confidence >= .45]
    joined = " / ".join(texts[:12])
    brand, category = _brand_and_category(joined)
    conf = max([t.confidence for t in toks], default=0.0)
    if brand:
        conf = max(conf, .78)
    return {
        "category": category,
        "brand": brand,
        "description": joined[:300],
        "ocr_text": texts[:20],
        "confidence": round(float(conf), 3),
        "engine": "PaddleOCR-product-text",
    }


def recognize_license(raw: bytes) -> dict[str, Any]:
    im, detected = normalize_license(raw)
    toks = paddle_tokens(im)

    def value_after(labels: tuple[str, ...], parser) -> tuple[str, float, str]:
        label = _find_label(toks, labels)
        if label:
            s = _nearby_text(toks, label, im.shape[1], im.shape[0], True)
            v = parser(s)
            if v:
                return v, max(label.confidence, .72), s
        return "", 0.0, ""

    name, nc, nraw = value_after(("氏名", "名前"), lambda s: re.sub(r"[^\u3400-\u9fff\u3040-\u30ffー\s]", "", _norm(s)).strip())
    addr, ac, araw = value_after(("住所",), lambda s: _norm(s).strip())

    if not name:
        candidates = [t for t in toks if t.y1 < im.shape[0]*.32 and _jp_ratio(t.text) >= .45 and 2 <= len(t.text) <= 18]
        if candidates:
            t = max(candidates, key=lambda x: x.confidence)
            name, nc, nraw = t.text, t.confidence, t.text
    if not addr:
        candidates = [t for t in toks if im.shape[0]*.12 <= t.cy <= im.shape[0]*.48 and _jp_ratio(t.text) >= .20 and len(t.text) >= 6]
        if candidates:
            t = max(candidates, key=lambda x: (len(x.text), x.confidence))
            addr, ac, araw = t.text, t.confidence, t.text

    confs = [x for x in (nc if name else 0, ac if addr else 0) if x]
    conf = sum(confs)/len(confs) if confs else 0.0
    del im
    gc.collect()
    return {
        "name": name,
        "address": addr,
        "confidence": round(conf, 3),
        "document_detected": detected,
        "engine": "PaddleOCR-label-spatial",
        "raw": {"name": nraw, "address": araw},
    }


def recognize_ticket(raw: bytes) -> dict[str, Any]:
    im, detected = normalize_ticket(raw)
    toks = paddle_tokens(im)
    fields = {
        "contract_date": _best_date(toks, "contract_date", im),
        "forfeiture_due_date": _best_date(toks, "forfeiture_due_date", im),
        "principal_amount": _best_money(toks, "principal_amount", im),
        "interest_amount": _best_money(toks, "interest_amount", im),
        "phone": _best_phone(toks, im),
    }
    item_text, item_conf, item_eng = _ticket_item_text(toks, im)
    fields["items"] = _field(item_text, item_text, item_conf, item_eng, bool(item_text))

    p = int(fields["principal_amount"]["value"] or 0)
    interest = int(fields["interest_amount"]["value"] or 0)
    if p and interest and (interest >= p or interest / p > .25):
        fields["interest_amount"] = _field(0, str(interest), .1, fields["interest_amount"]["engine"], False, "元金との整合性エラー")

    cd = fields["contract_date"]["value"]
    fd = fields["forfeiture_due_date"]["value"]
    if cd and fd:
        try:
            d1, d2 = date.fromisoformat(cd), date.fromisoformat(fd)
            if d2 <= d1 or (d2-d1).days > 200:
                fields["forfeiture_due_date"] = _field("", fd, .1, fields["forfeiture_due_date"]["engine"], False, "質入日との日付整合性エラー")
        except Exception:
            pass

    weights = {
        "contract_date": .20,
        "forfeiture_due_date": .20,
        "principal_amount": .20,
        "interest_amount": .15,
        "phone": .10,
        "items": .15,
    }
    quality = 0.0
    for k, weight in weights.items():
        f = fields[k]
        if f["status"] == "ok":
            quality += weight * max(.75, float(f["confidence"]))
        elif f["status"] == "review":
            quality += weight * .45 * float(f["confidence"])
    if not detected:
        quality *= .85
    quality = round(min(1.0, quality), 3)
    required = ("contract_date", "forfeiture_due_date", "principal_amount", "interest_amount")
    needs_review = quality < .78 or any(fields[k]["status"] != "ok" for k in required)

    out = {
        "fields": fields,
        "document_detected": detected,
        "field_accuracy": quality,
        "needs_review": needs_review,
        "suggestions": {},
        "engine": "Paddle spatial labels + Tesseract multi-pass",
        "pipeline_version": PIPELINE_VERSION,
        "money_cells": {},
        "item_lines": [item_text] if item_text else [],
        "diagnostics": {
            "token_count": len(toks),
            "tokens": [{"text": t.text, "confidence": round(t.confidence, 3), "box": [round(t.x1), round(t.y1), round(t.x2), round(t.y2)]} for t in toks[:80]],
        },
    }
    del im
    gc.collect()
    return out


def _pairing(nt: int, ni: int) -> list[list[int]]:
    if nt == ni:
        return [[i] for i in range(nt)]
    if nt == 1:
        return [list(range(ni))]
    return [[i] if i < ni else [] for i in range(nt)]


def extract_batch(license_raw: bytes, item_raws: list[bytes], ticket_raws: list[bytes]) -> dict[str, Any]:
    license_result = recognize_license(license_raw)
    item_results = [analyze_item_image(x) for x in item_raws]
    ticket_results = [recognize_ticket(x) for x in ticket_raws]
    pairs = _pairing(len(ticket_results), len(item_results))

    contracts = []
    for i, tr in enumerate(ticket_results):
        f = tr["fields"]
        ticket_text = str((f.get("items") or {}).get("value") or "").strip()
        items = []
        for j in pairs[i]:
            pr = item_results[j]
            combined = " / ".join(x for x in (ticket_text, pr.get("description", "")) if x).strip(" /")
            brand = pr.get("brand", "")
            category = pr.get("category", "")
            if not category or not brand:
                b2, c2 = _brand_and_category(combined)
                brand = brand or b2
                category = category or c2
            items.append({
                "category": category,
                "brand": brand,
                "description": combined[:300] if combined else "画像確認",
                "image_analysis": pr,
            })
        if not items:
            items = [{"category": "", "brand": "", "description": ticket_text or "画像確認", "image_analysis": {}}]

        contracts.append({
            "ticket_index": i,
            "item_image_indices": pairs[i],
            "contract": {
                "contract_date": (f["contract_date"]["value"] or ""),
                "principal_amount": int(f["principal_amount"]["value"] or 0),
                "interest_amount": int(f["interest_amount"]["value"] or 0),
                "next_interest_due_date": "",
                "forfeiture_due_date": (f["forfeiture_due_date"]["value"] or ""),
            },
            "items": items,
            "quality": float(tr["field_accuracy"]),
            "needs_review": bool(tr["needs_review"]),
            "fields": f,
            "money_cells": {},
            "diagnostics": tr.get("diagnostics", {}),
        })

    phone = ""
    for tr in ticket_results:
        p = (tr.get("fields", {}).get("phone") or {}).get("value") or ""
        if p:
            phone = p
            break

    overall = sum(x["quality"] for x in contracts) / max(1, len(contracts))
    return {
        "extracted": {
            "customer": {
                "name": license_result.get("name", ""),
                "address": license_result.get("address", ""),
                "phone": phone,
            },
            "contracts": contracts,
            "documents": {"item_count": len(item_raws), "ticket_count": len(ticket_raws)},
        },
        "vision": {
            "pipeline_version": PIPELINE_VERSION,
            "field_accuracy": round(overall, 3),
            "needs_review": any(x["needs_review"] for x in contracts),
            "license": license_result,
            "contract_count": len(contracts),
            "item_count": len(item_raws),
            "ticket_count": len(ticket_raws),
            "external_ai": False,
            "architecture": "dedicated-ocr-runtime",
        },
    }


def runtime_status() -> dict[str, Any]:
    try:
        langs = pytesseract.get_languages(config="")
    except Exception:
        langs = []
    return {
        "pipeline_version": PIPELINE_VERSION,
        "opencv": True,
        "opencv_version": cv2.__version__,
        "paddle_loaded": _PADDLE is not None,
        "tesseract_jpn": "jpn" in langs,
        "external_ai": False,
        "dedicated_runtime": True,
    }
