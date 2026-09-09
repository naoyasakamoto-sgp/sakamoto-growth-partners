from __future__ import annotations

import re
import unicodedata
from datetime import date
from difflib import SequenceMatcher

ENGINE_VERSION = "1.0.1-deterministic-high-precision"
PAYABLE_STATUSES = {"ACTIVE", "DUE_SOON", "OVERDUE", "FORFEITURE_HOLD", "FORFEITURE_REVIEW"}
NON_CUSTOMER_KEYWORDS = (
    "現金還元", "キャッシュバック", "ポイント還元", "預金利息", "普通預金利息",
    "定期預金利息", "受取利息", "利子", "キャンペーン還元", "特典還元",
)


def _text(v) -> str:
    return unicodedata.normalize("NFKC", str(v or "")).strip()


def _kata(s: str) -> str:
    out = []
    for ch in s:
        o = ord(ch)
        out.append(chr(o + 0x60) if 0x3041 <= o <= 0x3096 else ch)
    return "".join(out)


def normalize_sender(v) -> str:
    s = _kata(_text(v).upper())
    reps = (
        ("株式会社", ""), ("有限会社", ""), ("合同会社", ""),
        ("(株)", ""), ("(有)", ""), ("(同)", ""),
        ("カ)", ""), ("ユ)", ""), ("ド)", ""),
    )
    for a, b in reps:
        s = s.replace(a, b)
    s = re.sub(r"(?:サマ|様)$", "", s)
    s = re.sub(r"[\s\u3000・･\-ー_.,，．/\\()（）\[\]【】「」『』]+", "", s)
    return re.sub(r"[^0-9A-Zァ-ヶ一-龠々]", "", s)


def classify_credit(summary: str = "", sender: str = "", amount: int = 0) -> tuple[str, str]:
    amount = int(amount or 0)
    if amount <= 0:
        return "INVALID", "amount_non_positive"
    hay = _text(summary) + " " + _text(sender)
    for kw in NON_CUSTOMER_KEYWORDS:
        if kw in hay:
            return "NON_CUSTOMER", f"non_customer_keyword:{kw}"
    # Some bank exports put only a reward-period label (e.g. 8ネン 4ガツブン)
    # in 摘要内容. A sub-100-yen credit with that shape is bank-generated, not a pawn payment.
    if amount < 100 and re.search(r"\d+\s*ネン.*\d+\s*ガツ(?:ブン)?", _text(sender)):
        return "NON_CUSTOMER", "bank_reward_period_label"
    return "CUSTOMER_PAYMENT", "credit_candidate"


def name_fit(sender: str, customer_name: str, name_kana: str = "", aliases: list[str] | None = None) -> dict:
    s = normalize_sender(sender)
    names = [normalize_sender(customer_name), normalize_sender(name_kana)]
    names = [x for x in names if x]
    als = [normalize_sender(x) for x in (aliases or []) if normalize_sender(x)]
    if not s:
        return {"score": 0.0, "kind": "missing", "similarity": 0.0, "exact": False}
    if s in als:
        return {"score": 35.0, "kind": "alias_exact", "similarity": 1.0, "exact": True}
    if s in names:
        return {"score": 35.0, "kind": "name_exact", "similarity": 1.0, "exact": True}
    best = 0.0
    for n in names + als:
        if not n:
            continue
        r = SequenceMatcher(None, s, n).ratio()
        if min(len(s), len(n)) >= 4 and (s in n or n in s):
            r = max(r, min(len(s), len(n)) / max(len(s), len(n)))
        best = max(best, r)
    if best >= .94:
        score = 32.0
    elif best >= .88:
        score = 28.0
    elif best >= .80:
        score = 23.0
    elif best >= .70:
        score = 16.0
    elif best >= .60:
        score = 9.0
    else:
        score = 0.0
    return {"score": score, "kind": "fuzzy" if score else "no_match", "similarity": round(best, 4), "exact": False}


def amount_fit(amount: int, principal: int, monthly_interest: int, max_interest_months: int = 6) -> dict:
    amount = int(amount or 0); principal = int(principal or 0); monthly_interest = int(monthly_interest or 0)
    if amount <= 0:
        return {"score": 0.0, "payment_type": "UNKNOWN", "months": 0, "kind": "invalid"}
    if monthly_interest > 0:
        for months in range(1, max_interest_months + 1):
            if amount == monthly_interest * months:
                score = 30.0 if months == 1 else max(25.0, 30.0 - (months - 1))
                return {"score": score, "payment_type": "INTEREST", "months": months, "kind": f"interest_{months}m"}
    if principal > 0 and monthly_interest > 0:
        for months in range(1, max_interest_months + 1):
            if amount == principal + monthly_interest * months:
                return {"score": 30.0, "payment_type": "REDEMPTION", "months": months, "kind": f"principal_plus_interest_{months}m"}
    if principal > 0 and amount == principal:
        return {"score": 24.0, "payment_type": "PRINCIPAL", "months": 0, "kind": "principal_exact"}
    if principal > 0 and amount < principal:
        return {"score": 8.0, "payment_type": "PARTIAL", "months": 0, "kind": "partial_amount"}
    return {"score": 0.0, "payment_type": "UNKNOWN", "months": 0, "kind": "amount_no_match"}


def date_fit(transaction_date: str, contract_date: str, next_due: str) -> dict:
    try:
        tx = date.fromisoformat(str(transaction_date)[:10])
        cd = date.fromisoformat(str(contract_date)[:10])
    except Exception:
        return {"score": 0.0, "days_from_due": None, "before_contract": True, "kind": "invalid_date"}
    if tx < cd:
        return {"score": 0.0, "days_from_due": None, "before_contract": True, "kind": "before_contract"}
    try:
        due = date.fromisoformat(str(next_due)[:10])
        delta = (tx - due).days
        ad = abs(delta)
    except Exception:
        return {"score": 4.0, "days_from_due": None, "before_contract": False, "kind": "no_due_date"}
    if ad <= 3:
        score = 20.0
    elif ad <= 7:
        score = 15.0
    elif ad <= 14:
        score = 8.0
    elif ad <= 30:
        score = 4.0
    else:
        score = 0.0
    return {"score": score, "days_from_due": delta, "before_contract": False, "kind": "due_proximity"}


def status_fit(status: str) -> dict:
    s = str(status or "")
    if s in {"DUE_SOON", "OVERDUE"}:
        return {"score": 10.0, "allowed": True}
    if s == "ACTIVE":
        return {"score": 6.0, "allowed": True}
    if s in {"FORFEITURE_HOLD", "FORFEITURE_REVIEW"}:
        return {"score": 3.0, "allowed": True}
    return {"score": 0.0, "allowed": False}


def score_candidate(transaction: dict, contract: dict, aliases: list[str] | None = None, history_hit: bool = False) -> dict:
    nf = name_fit(transaction.get("sender_name", ""), contract.get("customer_name", ""), contract.get("name_kana", ""), aliases)
    af = amount_fit(transaction.get("amount", 0), contract.get("principal_amount", 0), contract.get("interest_amount", 0))
    df = date_fit(transaction.get("transaction_date", ""), contract.get("contract_date", ""), contract.get("next_interest_due_date", ""))
    sf = status_fit(contract.get("effective_status") or contract.get("status"))
    hf = 5.0 if history_hit else 0.0
    total = min(100.0, nf["score"] + af["score"] + df["score"] + sf["score"] + hf)
    auto_blockers = []
    if not nf["exact"]:
        auto_blockers.append("name_not_exact_or_confirmed_alias")
    if af["payment_type"] != "INTEREST":
        auto_blockers.append("payment_type_requires_human_review")
    if not sf["allowed"]:
        auto_blockers.append("contract_not_payable")
    if df["before_contract"]:
        auto_blockers.append("payment_before_contract")
    if af["score"] <= 0:
        auto_blockers.append("amount_not_expected")
    return {
        "total_score": round(total, 2),
        "name_score": nf["score"], "name_kind": nf["kind"], "name_similarity": nf["similarity"], "name_exact": nf["exact"],
        "amount_score": af["score"], "amount_kind": af["kind"], "payment_type": af["payment_type"], "months": af["months"],
        "date_score": df["score"], "days_from_due": df["days_from_due"], "before_contract": df["before_contract"],
        "status_score": sf["score"], "status_allowed": sf["allowed"], "history_score": hf,
        "auto_blockers": auto_blockers,
    }


def decide(candidates: list[dict], auto_threshold: float = 95.0, review_threshold: float = 70.0, margin_threshold: float = 10.0) -> dict:
    xs = sorted(candidates, key=lambda x: x.get("total_score", 0), reverse=True)
    if not xs:
        return {"status": "UNMATCHED", "top": None, "margin": None, "reason": "no_candidates"}
    top = xs[0]
    second_score = xs[1].get("total_score", 0) if len(xs) > 1 else 0.0
    margin = round(top.get("total_score", 0) - second_score, 2)
    blockers = list(top.get("auto_blockers") or [])
    if top.get("total_score", 0) >= auto_threshold and margin >= margin_threshold and not blockers:
        return {"status": "AUTO_MATCHED", "top": top, "margin": margin, "reason": "high_precision_rules_passed"}
    if top.get("total_score", 0) >= review_threshold:
        return {"status": "REVIEW", "top": top, "margin": margin, "reason": "human_review_required"}
    return {"status": "UNMATCHED", "top": top, "margin": margin, "reason": "score_below_review_threshold"}
