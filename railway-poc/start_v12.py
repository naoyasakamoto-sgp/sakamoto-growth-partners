from __future__ import annotations

import json
import os
from datetime import datetime

import uvicorn
from fastapi import Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

import bank_matching_engine as bme
import start_v11
import start_v2

main = start_v11.main
APP_VERSION = "2.5.0-poc"
MATCHING_VERSION = bme.ENGINE_VERSION
AUTO_THRESHOLD = float(os.getenv("BANK_AUTO_MATCH_THRESHOLD", "95"))
REVIEW_THRESHOLD = float(os.getenv("BANK_REVIEW_THRESHOLD", "70"))
MARGIN_THRESHOLD = float(os.getenv("BANK_MATCH_MARGIN_THRESHOLD", "10"))

MATCH_SCHEMA = r'''
CREATE TABLE IF NOT EXISTS customer_bank_aliases(
 id INTEGER PRIMARY KEY,
 customer_id INTEGER NOT NULL,
 alias_raw TEXT NOT NULL,
 alias_normalized TEXT NOT NULL,
 source TEXT NOT NULL DEFAULT 'human_confirmed',
 confidence REAL NOT NULL DEFAULT 1.0,
 confirmed_by TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(customer_id,alias_normalized)
);
CREATE INDEX IF NOT EXISTS idx_customer_bank_aliases_customer ON customer_bank_aliases(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_bank_aliases_norm ON customer_bank_aliases(alias_normalized);

CREATE TABLE IF NOT EXISTS bank_match_candidates(
 id INTEGER PRIMARY KEY,
 bank_transaction_id INTEGER NOT NULL,
 customer_id INTEGER NOT NULL,
 contract_id INTEGER NOT NULL,
 name_score REAL NOT NULL DEFAULT 0,
 amount_score REAL NOT NULL DEFAULT 0,
 date_score REAL NOT NULL DEFAULT 0,
 status_score REAL NOT NULL DEFAULT 0,
 history_score REAL NOT NULL DEFAULT 0,
 total_score REAL NOT NULL DEFAULT 0,
 rank INTEGER NOT NULL DEFAULT 0,
 suggested_payment_type TEXT,
 matched_months INTEGER NOT NULL DEFAULT 0,
 reason_json TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(bank_transaction_id,contract_id)
);
CREATE INDEX IF NOT EXISTS idx_bank_match_candidates_tx ON bank_match_candidates(bank_transaction_id,rank);

CREATE TABLE IF NOT EXISTS payment_expectations(
 id INTEGER PRIMARY KEY,
 contract_id INTEGER NOT NULL,
 payment_type TEXT NOT NULL,
 months INTEGER NOT NULL DEFAULT 0,
 expected_amount INTEGER NOT NULL,
 expected_from TEXT,
 expected_until TEXT,
 priority INTEGER NOT NULL DEFAULT 0,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(contract_id,payment_type,months)
);
CREATE INDEX IF NOT EXISTS idx_payment_expectations_contract ON payment_expectations(contract_id);

CREATE TABLE IF NOT EXISTS bank_match_feedback(
 id INTEGER PRIMARY KEY,
 bank_transaction_id INTEGER NOT NULL,
 action TEXT NOT NULL,
 chosen_customer_id INTEGER,
 chosen_contract_id INTEGER,
 actor TEXT,
 note TEXT,
 details TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bank_match_feedback_tx ON bank_match_feedback(bank_transaction_id,created_at);

CREATE TABLE IF NOT EXISTS bank_match_actions(
 id INTEGER PRIMARY KEY,
 bank_transaction_id INTEGER NOT NULL UNIQUE,
 contract_id INTEGER NOT NULL,
 payment_id INTEGER,
 payment_type TEXT NOT NULL,
 months INTEGER NOT NULL DEFAULT 0,
 amount INTEGER NOT NULL,
 before_json TEXT NOT NULL,
 after_json TEXT NOT NULL,
 reversed_at TEXT,
 reversed_by TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bank_match_actions_contract ON bank_match_actions(contract_id,created_at);
'''


def _ensure_column(c, table: str, name: str, ddl: str) -> None:
    cols = {x["name"] for x in c.execute(f"PRAGMA table_info({table})").fetchall()}
    if name not in cols:
        c.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")


def ensure_matching_schema() -> None:
    with main.db() as c:
        c.executescript(MATCH_SCHEMA)
        _ensure_column(c, "bank_transactions", "transaction_type", "TEXT")
        _ensure_column(c, "bank_transactions", "match_confidence", "REAL")
        _ensure_column(c, "bank_transactions", "confirmed_by", "TEXT")
        _ensure_column(c, "bank_transactions", "confirmed_at", "TEXT")
        _ensure_column(c, "bank_transactions", "original_payload", "TEXT")


def _add_months(s: str, months: int) -> str:
    out = s
    for _ in range(max(0, int(months or 0))):
        out = main.add_month(out)
    return out


def _refresh_expectations(c, contract_id: int | None = None) -> None:
    if contract_id is None:
        c.execute("DELETE FROM payment_expectations")
        rows = c.execute("SELECT * FROM contracts").fetchall()
    else:
        c.execute("DELETE FROM payment_expectations WHERE contract_id=?", (contract_id,))
        rows = c.execute("SELECT * FROM contracts WHERE id=?", (contract_id,)).fetchall()
    for r in rows:
        x = dict(r); cid = int(x["id"]); principal = int(x.get("principal_amount") or 0); interest = int(x.get("interest_amount") or 0)
        due = str(x.get("next_interest_due_date") or "")[:10]
        if interest > 0:
            for m in range(1, 7):
                c.execute("INSERT OR REPLACE INTO payment_expectations(contract_id,payment_type,months,expected_amount,expected_from,expected_until,priority) VALUES(?,?,?,?,?,?,?)",
                          (cid, "INTEREST", m, interest*m, due, due, 100-(m-1)))
        if principal > 0:
            c.execute("INSERT OR REPLACE INTO payment_expectations(contract_id,payment_type,months,expected_amount,expected_from,expected_until,priority) VALUES(?,?,?,?,?,?,?)",
                      (cid, "PRINCIPAL", 0, principal, due, due, 70))
            if interest > 0:
                for m in range(1, 7):
                    c.execute("INSERT OR REPLACE INTO payment_expectations(contract_id,payment_type,months,expected_amount,expected_from,expected_until,priority) VALUES(?,?,?,?,?,?,?)",
                              (cid, "REDEMPTION", m, principal+interest*m, due, due, 90-(m-1)))


def _payload(tx: dict) -> dict:
    try:
        return json.loads(tx.get("original_payload") or "{}")
    except Exception:
        return {}


def _summary(tx: dict) -> str:
    return str(_payload(tx).get("summary") or "")


def _aliases(c, customer_id: int) -> list[str]:
    return [x["alias_raw"] for x in c.execute("SELECT alias_raw FROM customer_bank_aliases WHERE customer_id=?", (customer_id,)).fetchall()]


def _history_customers(c, tx: dict) -> set[int]:
    target = bme.normalize_sender(tx.get("sender_name") or "")
    if not target:
        return set()
    out = set()
    rows = c.execute("""
        SELECT bt.sender_name,ct.customer_id
          FROM bank_transactions bt
          JOIN contracts ct ON ct.id=bt.matched_contract_id
         WHERE bt.id<>?
           AND bt.matched_contract_id IS NOT NULL
           AND bt.match_status IN ('AUTO_MATCHED','CONFIRMED','MATCHED')
    """, (tx["id"],)).fetchall()
    for r in rows:
        if bme.normalize_sender(r["sender_name"]) == target:
            out.add(int(r["customer_id"]))
    return out


def _candidate_contracts(c) -> list[dict]:
    return [main.serial(x) for x in main.qcons(c)]


def _persist_candidates(c, tx: dict, allow_auto: bool = False) -> dict:
    txid = int(tx["id"])
    c.execute("DELETE FROM bank_match_candidates WHERE bank_transaction_id=?", (txid,))
    ttype, class_reason = bme.classify_credit(_summary(tx), tx.get("sender_name") or "", int(tx.get("amount") or 0))
    if ttype in {"INVALID", "NON_CUSTOMER"}:
        c.execute("UPDATE bank_transactions SET transaction_type=?,match_status=?,matched_contract_id=NULL,score=0,match_confidence=0 WHERE id=?",
                  (ttype, "NON_CUSTOMER" if ttype == "NON_CUSTOMER" else "REJECTED", txid))
        return {"status": "NON_CUSTOMER" if ttype == "NON_CUSTOMER" else "REJECTED", "reason": class_reason, "candidates": []}

    history = _history_customers(c, tx)
    scored = []
    for contract in _candidate_contracts(c):
        cid = int(contract["customer_id"]); contract_id = int(contract["id"])
        s = bme.score_candidate(tx, contract, _aliases(c, cid), cid in history)
        # Keep candidates that have at least a meaningful name or amount signal.
        if s["name_score"] <= 0 and s["amount_score"] <= 0:
            continue
        s.update({
            "customer_id": cid,
            "contract_id": contract_id,
            "contract_no": contract.get("contract_no"),
            "customer_name": contract.get("customer_name"),
            "effective_status": contract.get("effective_status"),
        })
        scored.append(s)
    scored.sort(key=lambda x: (x["total_score"], x["name_score"], x["amount_score"]), reverse=True)
    scored = scored[:10]
    decision = bme.decide(scored, AUTO_THRESHOLD, REVIEW_THRESHOLD, MARGIN_THRESHOLD)
    for rank, s in enumerate(scored, 1):
        c.execute("""
            INSERT OR REPLACE INTO bank_match_candidates(
                bank_transaction_id,customer_id,contract_id,name_score,amount_score,date_score,status_score,history_score,total_score,rank,
                suggested_payment_type,matched_months,reason_json
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (txid,s["customer_id"],s["contract_id"],s["name_score"],s["amount_score"],s["date_score"],s["status_score"],s["history_score"],s["total_score"],rank,s["payment_type"],s["months"],json.dumps(s,ensure_ascii=False)))

    top = decision.get("top")
    confidence = float(top.get("total_score") or 0) if top else 0.0
    matched_id = int(top["contract_id"]) if top and decision["status"] in {"AUTO_MATCHED", "REVIEW"} else None
    c.execute("UPDATE bank_transactions SET transaction_type='CUSTOMER_PAYMENT',match_status=?,matched_contract_id=?,score=?,match_confidence=? WHERE id=?",
              (decision["status"], matched_id, confidence/100.0, confidence, txid))
    if decision["status"] == "AUTO_MATCHED" and allow_auto and top:
        _apply_payment(c, txid, int(top["contract_id"]), "INTEREST", int(top.get("months") or 1), "system:auto", True, confidence)
    return {"status": decision["status"], "reason": decision["reason"], "margin": decision.get("margin"), "candidates": scored}


def _apply_payment(c, txid: int, contract_id: int, payment_type: str, months: int, actor: str, automatic: bool, confidence: float) -> dict:
    txr = c.execute("SELECT * FROM bank_transactions WHERE id=?", (txid,)).fetchone()
    ctr = c.execute("SELECT * FROM contracts WHERE id=?", (contract_id,)).fetchone()
    if not txr or not ctr:
        raise HTTPException(404, "入金または契約が見つかりません")
    tx = dict(txr); ct = dict(ctr); amount = int(tx.get("amount") or 0)
    existing = c.execute("SELECT * FROM bank_match_actions WHERE bank_transaction_id=? AND reversed_at IS NULL", (txid,)).fetchone()
    if existing:
        raise HTTPException(409, "この入金は既に消込済みです")
    if ct.get("status") in {"FORFEITED", "REDEEMED"}:
        raise HTTPException(409, "終了済み契約には消込できません")

    ptype = str(payment_type or "").upper(); months = max(0, int(months or 0))
    interest = int(ct.get("interest_amount") or 0); principal = int(ct.get("principal_amount") or 0)
    if ptype == "INTEREST":
        if interest <= 0 or months < 1 or amount != interest * months:
            raise HTTPException(422, "入金額と利息月数が一致しません")
    elif ptype == "REDEMPTION":
        if interest <= 0 or months < 1 or amount != principal + interest * months:
            raise HTTPException(422, "入金額と元金＋利息が一致しません")
        if automatic:
            raise HTTPException(422, "返還処理は人間確認が必要です")
    elif ptype == "PRINCIPAL":
        if amount != principal or automatic:
            raise HTTPException(422, "元金処理は人間確認が必要です")
    elif ptype == "PARTIAL":
        if amount <= 0 or amount >= principal or automatic:
            raise HTTPException(422, "部分入金を確認してください")
    else:
        raise HTTPException(422, "支払種別を確認してください")

    before = {"next_interest_due_date": ct.get("next_interest_due_date"), "status": ct.get("status")}
    pid = c.execute("INSERT INTO payments(contract_id,paid_at,amount,payment_type,bank_transaction_id) VALUES(?,?,?,?,?)",
                    (contract_id, tx.get("transaction_date"), amount, ptype, txid)).lastrowid
    if ptype == "INTEREST":
        new_due = _add_months(str(ct.get("next_interest_due_date") or ct.get("contract_date")), months)
        c.execute("UPDATE contracts SET next_interest_due_date=?,status='ACTIVE',updated_at=CURRENT_TIMESTAMP WHERE id=?", (new_due, contract_id))
    elif ptype == "REDEMPTION":
        c.execute("UPDATE contracts SET status='REDEEMED',updated_at=CURRENT_TIMESTAMP WHERE id=?", (contract_id,))
    after_ct = dict(c.execute("SELECT * FROM contracts WHERE id=?", (contract_id,)).fetchone())
    after = {"next_interest_due_date": after_ct.get("next_interest_due_date"), "status": after_ct.get("status")}
    final_status = "AUTO_MATCHED" if automatic else "CONFIRMED"
    c.execute("UPDATE bank_transactions SET match_status=?,matched_contract_id=?,score=?,match_confidence=?,confirmed_by=?,confirmed_at=CURRENT_TIMESTAMP WHERE id=?",
              (final_status, contract_id, float(confidence)/100.0, float(confidence), actor, txid))
    c.execute("INSERT INTO bank_match_actions(bank_transaction_id,contract_id,payment_id,payment_type,months,amount,before_json,after_json) VALUES(?,?,?,?,?,?,?,?)",
              (txid, contract_id, pid, ptype, months, amount, json.dumps(before,ensure_ascii=False), json.dumps(after,ensure_ascii=False)))
    c.execute("INSERT INTO bank_match_feedback(bank_transaction_id,action,chosen_customer_id,chosen_contract_id,actor,details) SELECT ?,?,?,?,?,? FROM contracts WHERE id=?",
              (txid, "AUTO_MATCHED" if automatic else "MATCH_CONFIRMED", int(ct["customer_id"]), contract_id, actor, json.dumps({"payment_type":ptype,"months":months,"confidence":confidence},ensure_ascii=False), contract_id))
    _refresh_expectations(c, contract_id)
    main.audit(c, actor, "system" if automatic else "manager", "BANK_AUTO_MATCHED" if automatic else "BANK_MATCH_CONFIRMED", "bank_transaction", txid,
               {"contract_id":contract_id,"payment_type":ptype,"months":months,"amount":amount,"confidence":confidence,"matching_version":MATCHING_VERSION})
    return {"ok": True, "status": final_status, "contract_id": contract_id, "payment_type": ptype, "months": months}


def _reprocess_open_transactions() -> dict:
    ensure_matching_schema()
    counts = {"reprocessed": 0, "non_customer": 0}
    with main.db() as c:
        _refresh_expectations(c)
        rows = c.execute("SELECT * FROM bank_transactions WHERE match_status IN ('UNMATCHED','REVIEW','NEW','REJECTED') OR match_status IS NULL").fetchall()
        for r in rows:
            result = _persist_candidates(c, dict(r), allow_auto=False)
            counts["reprocessed"] += 1
            if result["status"] == "NON_CUSTOMER": counts["non_customer"] += 1
        main.audit(c,"system","system","BANK_MATCH_REBUILD_STARTUP","bank","batch",counts)
    return counts


@main.app.on_event("startup")
def _startup_matching_v250() -> None:
    _reprocess_open_transactions()


async def bank_import_csv_v250(file: UploadFile = File(...), a=Depends(main.auth)):
    raw = await file.read(2_000_001)
    if len(raw) > 2_000_000:
        raise HTTPException(413, "CSVは2MB以下にしてください")
    parsed, diagnostics = start_v11._parse_csv_bytes(raw)
    imported = []; duplicates = 0; auto = 0; review = 0; unmatched = 0; non_customer = 0
    ensure_matching_schema()
    with main.db() as c:
        _refresh_expectations(c)
        for r in parsed:
            payload = json.dumps({"summary":r.get("summary",""),"source":"csv","matching_version":MATCHING_VERSION},ensure_ascii=False)
            old = c.execute("SELECT * FROM bank_transactions WHERE reference=?", (r["reference"],)).fetchone()
            if old:
                duplicates += 1
                # Safe enrichment of rows imported by v2.4.3 or older importers.
                c.execute("UPDATE bank_transactions SET transaction_date=?,sender_name=?,amount=?,original_payload=? WHERE id=?",
                          (r["date"],r["sender"],r["amount"],payload,int(old["id"])))
                tx = dict(c.execute("SELECT * FROM bank_transactions WHERE id=?",(int(old["id"]),)).fetchone())
                if tx.get("match_status") not in {"AUTO_MATCHED","CONFIRMED","MATCHED"}:
                    res = _persist_candidates(c,tx,allow_auto=False)
                    if res["status"] == "NON_CUSTOMER": non_customer += 1
                continue
            tid = c.execute("INSERT INTO bank_transactions(transaction_date,sender_name,amount,reference,match_status,matched_contract_id,score,transaction_type,match_confidence,original_payload) VALUES(?,?,?,?,?,?,?,?,?,?)",
                            (r["date"],r["sender"],r["amount"],r["reference"],"NEW",None,0,"CUSTOMER_PAYMENT",0,payload)).lastrowid
            tx = dict(c.execute("SELECT * FROM bank_transactions WHERE id=?",(tid,)).fetchone())
            res = _persist_candidates(c,tx,allow_auto=True)
            status = res["status"]
            if status == "AUTO_MATCHED": auto += 1
            elif status == "REVIEW": review += 1
            elif status == "NON_CUSTOMER": non_customer += 1
            else: unmatched += 1
            imported.append({"id":tid,"transaction_date":r["date"],"sender_name":r["sender"],"amount":r["amount"],"match_status":status})
        diagnostics.update({"imported_rows":len(imported),"duplicate_rows_skipped":duplicates,"auto_matched":auto,"review":review,"unmatched":unmatched,"non_customer":non_customer,"matching_version":MATCHING_VERSION})
        main.audit(c,a["name"],a["role"],"BANK_CSV_IMPORTED_V250","bank","batch",diagnostics)
    return {"count":len(imported),"items":imported,"diagnostics":diagnostics}


start_v2.replace("/api/bank/import-csv", "POST", bank_import_csv_v250)


def bank_transactions_v250(a=Depends(main.auth)):
    ensure_matching_schema()
    with main.db() as c:
        rows = c.execute("""
            SELECT bt.*,ct.contract_no,cu.name matched_customer_name,
                   mc.total_score top_score,mc.suggested_payment_type,mc.matched_months,
                   cct.contract_no top_contract_no,ccu.name top_customer_name
              FROM bank_transactions bt
              LEFT JOIN contracts ct ON ct.id=bt.matched_contract_id
              LEFT JOIN customers cu ON cu.id=ct.customer_id
              LEFT JOIN bank_match_candidates mc ON mc.bank_transaction_id=bt.id AND mc.rank=1
              LEFT JOIN contracts cct ON cct.id=mc.contract_id
              LEFT JOIN customers ccu ON ccu.id=mc.customer_id
             ORDER BY bt.transaction_date DESC,bt.id DESC
        """).fetchall()
        return {"items":[dict(x) for x in rows]}


start_v2.replace("/api/bank/transactions", "GET", bank_transactions_v250)


def candidate_list(txid: int, a=Depends(main.auth)):
    ensure_matching_schema()
    with main.db() as c:
        txr = c.execute("SELECT * FROM bank_transactions WHERE id=?",(txid,)).fetchone()
        if not txr: raise HTTPException(404,"入金が見つかりません")
        rows = c.execute("""
            SELECT mc.*,ct.contract_no,ct.principal_amount,ct.interest_amount,ct.next_interest_due_date,ct.status,
                   cu.name customer_name,cu.name_kana
              FROM bank_match_candidates mc
              JOIN contracts ct ON ct.id=mc.contract_id
              JOIN customers cu ON cu.id=mc.customer_id
             WHERE mc.bank_transaction_id=? ORDER BY mc.rank
        """,(txid,)).fetchall()
        items=[]
        for r in rows:
            x=dict(r)
            try:x["reason"]=json.loads(x.pop("reason_json") or "{}")
            except Exception:x["reason"]={}
            items.append(x)
        return {"transaction":dict(txr),"items":items,"thresholds":{"auto":AUTO_THRESHOLD,"review":REVIEW_THRESHOLD,"margin":MARGIN_THRESHOLD}}


main.app.add_api_route("/api/bank/transactions/{txid}/candidates",candidate_list,methods=["GET"])


class ConfirmMatch(BaseModel):
    contract_id: int
    payment_type: str | None = None
    months: int | None = None
    remember_alias: bool = False
    note: str = ""


def confirm_match(txid: int, b: ConfirmMatch, a=Depends(main.auth)):
    ensure_matching_schema()
    with main.db() as c:
        txr=c.execute("SELECT * FROM bank_transactions WHERE id=?",(txid,)).fetchone(); ctr=c.execute("SELECT ct.*,cu.name customer_name,cu.name_kana FROM contracts ct JOIN customers cu ON cu.id=ct.customer_id WHERE ct.id=?",(b.contract_id,)).fetchone()
        if not txr or not ctr: raise HTTPException(404,"入金または契約が見つかりません")
        tx=dict(txr); ct=main.serial(ctr)
        aliases=_aliases(c,int(ct["customer_id"])); score=bme.score_candidate(tx,ct,aliases,int(ct["customer_id"]) in _history_customers(c,tx))
        ptype=(b.payment_type or score["payment_type"] or "").upper(); months=int(b.months if b.months is not None else score.get("months") or 0)
        result=_apply_payment(c,txid,b.contract_id,ptype,months,a["name"],False,float(score["total_score"]))
        if b.remember_alias and str(tx.get("sender_name") or "").strip():
            alias=str(tx["sender_name"]); norm=bme.normalize_sender(alias)
            if norm:
                c.execute("INSERT OR IGNORE INTO customer_bank_aliases(customer_id,alias_raw,alias_normalized,source,confidence,confirmed_by) VALUES(?,?,?,?,?,?)",
                          (int(ct["customer_id"]),alias,norm,"human_confirmed",1.0,a["name"]))
        c.execute("INSERT INTO bank_match_feedback(bank_transaction_id,action,chosen_customer_id,chosen_contract_id,actor,note,details) VALUES(?,?,?,?,?,?,?)",
                  (txid,"HUMAN_CONFIRM",int(ct["customer_id"]),b.contract_id,a["name"],b.note,json.dumps(score,ensure_ascii=False)))
        return result


main.app.add_api_route("/api/bank/transactions/{txid}/confirm",confirm_match,methods=["POST"])


class NoteAction(BaseModel):
    note: str = ""


def reject_match(txid:int,b:NoteAction,a=Depends(main.auth)):
    ensure_matching_schema()
    with main.db() as c:
        if not c.execute("SELECT 1 FROM bank_transactions WHERE id=?",(txid,)).fetchone():raise HTTPException(404,"入金が見つかりません")
        c.execute("UPDATE bank_transactions SET match_status='REJECTED',matched_contract_id=NULL,match_confidence=0,confirmed_by=?,confirmed_at=CURRENT_TIMESTAMP WHERE id=?",(a["name"],txid))
        c.execute("INSERT INTO bank_match_feedback(bank_transaction_id,action,actor,note) VALUES(?,?,?,?)",(txid,"MATCH_REJECTED",a["name"],b.note));main.audit(c,a["name"],a["role"],"BANK_MATCH_REJECTED","bank_transaction",txid,{"note":b.note})
    return {"ok":True,"status":"REJECTED"}


def mark_non_customer(txid:int,b:NoteAction,a=Depends(main.auth)):
    ensure_matching_schema()
    with main.db() as c:
        if not c.execute("SELECT 1 FROM bank_transactions WHERE id=?",(txid,)).fetchone():raise HTTPException(404,"入金が見つかりません")
        c.execute("UPDATE bank_transactions SET transaction_type='NON_CUSTOMER',match_status='NON_CUSTOMER',matched_contract_id=NULL,match_confidence=0,confirmed_by=?,confirmed_at=CURRENT_TIMESTAMP WHERE id=?",(a["name"],txid))
        c.execute("DELETE FROM bank_match_candidates WHERE bank_transaction_id=?",(txid,));c.execute("INSERT INTO bank_match_feedback(bank_transaction_id,action,actor,note) VALUES(?,?,?,?)",(txid,"MARK_NON_CUSTOMER",a["name"],b.note));main.audit(c,a["name"],a["role"],"BANK_MARK_NON_CUSTOMER","bank_transaction",txid,{"note":b.note})
    return {"ok":True,"status":"NON_CUSTOMER"}


main.app.add_api_route("/api/bank/transactions/{txid}/reject",reject_match,methods=["POST"])
main.app.add_api_route("/api/bank/transactions/{txid}/non-customer",mark_non_customer,methods=["POST"])


def reverse_match(txid:int,b:NoteAction,a=Depends(main.auth)):
    ensure_matching_schema()
    with main.db() as c:
        ar=c.execute("SELECT * FROM bank_match_actions WHERE bank_transaction_id=? AND reversed_at IS NULL",(txid,)).fetchone()
        if not ar:raise HTTPException(404,"取消可能な消込がありません")
        later=c.execute("SELECT COUNT(*) n FROM bank_match_actions WHERE contract_id=? AND id>? AND reversed_at IS NULL",(ar["contract_id"],ar["id"])).fetchone()["n"]
        if later:raise HTTPException(409,"後続の入金処理があるため、この入金だけを先に取消できません")
        before=json.loads(ar["before_json"] or "{}")
        if ar["payment_id"]:c.execute("DELETE FROM payments WHERE id=?",(ar["payment_id"],))
        c.execute("UPDATE contracts SET next_interest_due_date=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",(before.get("next_interest_due_date"),before.get("status"),ar["contract_id"]))
        c.execute("UPDATE bank_match_actions SET reversed_at=CURRENT_TIMESTAMP,reversed_by=? WHERE id=?",(a["name"],ar["id"]))
        c.execute("UPDATE bank_transactions SET match_status='REVIEW',matched_contract_id=NULL,confirmed_by=NULL,confirmed_at=NULL WHERE id=?",(txid,))
        c.execute("INSERT INTO bank_match_feedback(bank_transaction_id,action,chosen_contract_id,actor,note) VALUES(?,?,?,?,?)",(txid,"PAYMENT_REVERSED",ar["contract_id"],a["name"],b.note))
        _refresh_expectations(c,int(ar["contract_id"]));tx=dict(c.execute("SELECT * FROM bank_transactions WHERE id=?",(txid,)).fetchone());_persist_candidates(c,tx,allow_auto=False);main.audit(c,a["name"],a["role"],"BANK_PAYMENT_REVERSED","bank_transaction",txid,{"contract_id":ar["contract_id"],"note":b.note})
    return {"ok":True,"status":"REVIEW"}


main.app.add_api_route("/api/bank/transactions/{txid}/reverse",reverse_match,methods=["POST"])


class AliasIn(BaseModel):
    customer_id:int
    alias:str=Field(min_length=1,max_length=120)


def add_alias(b:AliasIn,a=Depends(main.auth)):
    ensure_matching_schema();norm=bme.normalize_sender(b.alias)
    if not norm:raise HTTPException(422,"名義を確認してください")
    with main.db() as c:
        if not c.execute("SELECT 1 FROM customers WHERE id=?",(b.customer_id,)).fetchone():raise HTTPException(404,"顧客が見つかりません")
        c.execute("INSERT OR IGNORE INTO customer_bank_aliases(customer_id,alias_raw,alias_normalized,source,confidence,confirmed_by) VALUES(?,?,?,?,?,?)",(b.customer_id,b.alias,norm,"manual",1.0,a["name"]));main.audit(c,a["name"],a["role"],"BANK_ALIAS_ADDED","customer",b.customer_id,{"alias_normalized":norm})
    return {"ok":True,"alias_normalized":norm}


def list_aliases(customer_id:int,a=Depends(main.auth)):
    ensure_matching_schema()
    with main.db() as c:return {"items":[dict(x) for x in c.execute("SELECT * FROM customer_bank_aliases WHERE customer_id=? ORDER BY id DESC",(customer_id,)).fetchall()]}


main.app.add_api_route("/api/bank/aliases",add_alias,methods=["POST"])
main.app.add_api_route("/api/bank/aliases/{customer_id}",list_aliases,methods=["GET"])


def rebuild_matches(a=Depends(main.auth)):
    ensure_matching_schema();counts={"processed":0,"auto_applied":0,"review":0,"unmatched":0,"non_customer":0}
    with main.db() as c:
        _refresh_expectations(c);rows=c.execute("SELECT * FROM bank_transactions WHERE match_status NOT IN ('AUTO_MATCHED','CONFIRMED','MATCHED') OR match_status IS NULL").fetchall()
        for r in rows:
            res=_persist_candidates(c,dict(r),allow_auto=False);counts["processed"]+=1
            key=res["status"].lower()
            if key in counts:counts[key]+=1
        main.audit(c,a["name"],a["role"],"BANK_MATCH_REBUILT","bank","batch",counts)
    return counts


main.app.add_api_route("/api/bank/rebuild-matches",rebuild_matches,methods=["POST"])


def match_stats(a=Depends(main.auth)):
    ensure_matching_schema()
    with main.db() as c:
        rows=c.execute("SELECT COALESCE(match_status,'NEW') s,COUNT(*) n FROM bank_transactions GROUP BY COALESCE(match_status,'NEW')").fetchall();counts={x["s"]:x["n"] for x in rows}
        auto=int(counts.get("AUTO_MATCHED",0));reversed_auto=c.execute("SELECT COUNT(*) n FROM bank_match_actions WHERE reversed_at IS NOT NULL AND bank_transaction_id IN (SELECT bank_transaction_id FROM bank_match_feedback WHERE action='AUTO_MATCHED')").fetchone()["n"]
        precision_proxy=(auto/(auto+reversed_auto)) if auto+reversed_auto else None
        return {"matching_version":MATCHING_VERSION,"counts":counts,"auto_match_precision_proxy":precision_proxy,"note":"precision_proxy is operational only; validated precision requires labeled ground truth"}


main.app.add_api_route("/api/bank/match-stats",match_stats,methods=["GET"])

MATCH_UI = r'''
<style id="bank-match-v250">
.match-inline{font-size:12px;line-height:1.45;margin-top:4px}.match-inline strong{font-size:12px}.match-btn{padding:6px 9px!important;font-size:12px!important;margin:4px 2px 0 0!important}.match-modal{display:none;position:fixed;inset:0;z-index:9999;background:rgba(8,24,42,.48);padding:18px;overflow:auto}.match-modal.on{display:block}.match-sheet{max-width:680px;margin:7vh auto;background:#fff;border-radius:18px;padding:18px;box-shadow:0 16px 48px rgba(0,0,0,.22)}.match-cand{border:1px solid #dde5ed;border-radius:12px;padding:12px;margin:10px 0}.match-score{font-weight:800;font-size:20px}.match-reason{font-size:12px;color:#60758b;line-height:1.5}.status-NON_CUSTOMER{opacity:.65}@media(max-width:700px){.match-modal{padding:10px}.match-sheet{margin:4vh auto;padding:14px}.match-cand button{min-height:40px}}
</style>
<div id="matchModal" class="match-modal" onclick="if(event.target===this)closeMatch()"><div class="match-sheet"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>入金照合候補</b><button onclick="closeMatch()">閉じる</button></div><div id="matchBody"></div></div></div>
<script>
const ml=x=>({AUTO_MATCHED:'自動照合',CONFIRMED:'確認済',REVIEW:'確認待ち',UNMATCHED:'未照合',NON_CUSTOMER:'対象外',REJECTED:'却下',MATCHED:'照合済'}[x]||x||'新規');
window.lb=async function(){let r=await api('/api/bank/transactions');$('bs').innerHTML=r.items.map(x=>{let cand=x.top_contract_no?`<div class="match-inline"><strong>${esc(x.top_contract_no)} ${esc(x.top_customer_name||'')}</strong> ${Number(x.top_score||0).toFixed(0)}点 / ${esc(x.suggested_payment_type||'')}<br><button class="match-btn" onclick="openMatch(${x.id})">候補を確認</button></div>`:(x.match_status==='NON_CUSTOMER'?'<div class="match-inline">顧客入金の照合対象外</div>':`<div class="match-inline"><button class="match-btn" onclick="openMatch(${x.id})">確認</button></div>`);return `<tr class="status-${esc(x.match_status||'')}"><td>${esc(x.transaction_date)}</td><td>${esc(x.sender_name||'（名義なし）')}</td><td>${y(x.amount)}</td><td>${esc(ml(x.match_status))}</td><td>${cand}</td></tr>`}).join('')};
window.closeMatch=()=>matchModal.classList.remove('on');
window.openMatch=async function(id){let r=await api(`/api/bank/transactions/${id}/candidates`),t=r.transaction;let items=r.items.map(c=>{let z=c.reason||{},blk=(z.auto_blockers||[]).join(', ')||'なし';return `<div class="match-cand"><div><b>${esc(c.contract_no)} / ${esc(c.customer_name)}</b> <span class="match-score">${Number(c.total_score).toFixed(0)}点</span></div><div class="match-reason">名義 ${c.name_score} / 金額 ${c.amount_score} / 日付 ${c.date_score} / 状態 ${c.status_score} / 履歴 ${c.history_score}<br>推奨: ${esc(c.suggested_payment_type||'')} ${c.matched_months||0}ヶ月 / AUTO阻止: ${esc(blk)}</div><button class="p" onclick="confirmCandidate(${id},${c.contract_id},'${esc(c.suggested_payment_type||'')} ',${c.matched_months||0})">この契約に照合</button></div>`}).join('');$('matchBody').innerHTML=`<p><b>${esc(t.sender_name||'')}</b> ${y(t.amount)} / ${esc(t.transaction_date)}</p>${items||'<p>有力候補はありません。</p>'}<hr><button onclick="markNonCustomer(${id})">顧客入金ではない</button> <button onclick="rejectBank(${id})">候補を却下</button>${['AUTO_MATCHED','CONFIRMED','MATCHED'].includes(t.match_status)?` <button onclick="reverseBank(${id})">消込取消</button>`:''}`;matchModal.classList.add('on')};
window.confirmCandidate=async function(tx,ct,ptype,months){ptype=(ptype||'').trim();if(!ptype||ptype==='UNKNOWN')return alert('支払種別を確認してください');let remember=confirm('この振込名義を今後この顧客の名義として記憶しますか？');try{await api(`/api/bank/transactions/${tx}/confirm`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contract_id:ct,payment_type:ptype,months:months,remember_alias:remember,note:''})});closeMatch();await ref()}catch(e){alert(e.message)}};
window.markNonCustomer=async id=>{if(!confirm('顧客入金ではない取引として除外しますか？'))return;await api(`/api/bank/transactions/${id}/non-customer`,{method:'POST',headers:{'content-type':'application/json'},body:'{"note":"UI confirmation"}'});closeMatch();await ref()};
window.rejectBank=async id=>{await api(`/api/bank/transactions/${id}/reject`,{method:'POST',headers:{'content-type':'application/json'},body:'{"note":"UI rejection"}'});closeMatch();await ref()};
window.reverseBank=async id=>{if(!confirm('消込を取り消し、契約期限を処理前に戻しますか？'))return;try{await api(`/api/bank/transactions/${id}/reverse`,{method:'POST',headers:{'content-type':'application/json'},body:'{"note":"UI reversal"}'});closeMatch();await ref()}catch(e){alert(e.message)}};
</script>
'''
if "bank-match-v250" not in main.HTML and "</body>" in main.HTML:
    main.HTML=main.HTML.replace("</body>",MATCH_UI+"</body>")
main.HTML=main.HTML.replace("v2.4.3-poc",APP_VERSION)


def health_v250():
    x=start_v11.health_v243();x.update({"version":APP_VERSION,"bank_matching_engine":MATCHING_VERSION,"bank_matching":{"auto_threshold":AUTO_THRESHOLD,"review_threshold":REVIEW_THRESHOLD,"margin_threshold":MARGIN_THRESHOLD,"explainable_candidates":True,"aliases":True,"multiple_interest_months":True,"redemption_requires_human":True,"reversal":True,"non_customer_classifier":True,"auto_precision_policy":"high-precision"}});return x


start_v2.replace("/api/health","GET",health_v250)


if __name__ == "__main__":
    uvicorn.run(main.app,host="0.0.0.0",port=int(os.environ.get("PORT","8000")),proxy_headers=True)
