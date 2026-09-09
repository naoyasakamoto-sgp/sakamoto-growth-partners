from __future__ import annotations

import csv
import hashlib
import io
import os
import re
import unicodedata

import uvicorn
from fastapi import Depends, File, HTTPException, UploadFile

import start_v10
import start_v2

main = start_v10.main
APP_VERSION = "2.4.3-poc"


def _norm_text(v) -> str:
    return unicodedata.normalize("NFKC", str(v or "")).strip()


def _norm_header(v) -> str:
    return _norm_text(v).replace(" ", "").replace("\u3000", "")


def _parse_amount(v) -> int:
    s = _norm_text(v)
    if not s:
        return 0
    s = s.replace(",", "").replace("¥", "").replace("￥", "").replace("円", "")
    s = re.sub(r"[^0-9.\-]", "", s)
    if s in {"", "-", "."}:
        return 0
    try:
        return int(float(s))
    except ValueError:
        return 0


def _iso_date(v) -> str:
    s = _norm_text(v).replace(".", "/").replace("-", "/")
    m = re.match(r"^(20\d{2})/(\d{1,2})/(\d{1,2})", s)
    if not m:
        return ""
    y, mo, d = map(int, m.groups())
    try:
        from datetime import date
        return date(y, mo, d).isoformat()
    except ValueError:
        return ""


def _decode_csv(raw: bytes) -> tuple[str, str]:
    for enc in ("utf-8-sig", "cp932", "shift_jis"):
        try:
            return raw.decode(enc), enc
        except UnicodeDecodeError:
            continue
    raise HTTPException(422, "CSVの文字コードを判定できません（UTF-8/CP932/Shift-JIS対応）")


def _fingerprint(row: dict) -> str:
    keys = ("日付", "摘要", "摘要内容", "支払い金額", "預かり金額", "差引残高", "入払区分")
    canonical = "|".join(_norm_text(row.get(k, "")) for k in keys)
    return "CSV:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


def _parse_csv_bytes(raw: bytes) -> tuple[list[dict], dict]:
    text, encoding = _decode_csv(raw)
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(422, "CSVヘッダーを確認できません")

    # Normalize headers because exported banking CSVs may contain BOM/full-width whitespace.
    field_map = {_norm_header(x): x for x in reader.fieldnames if x is not None}
    native = "預かり金額" in field_map and "支払い金額" in field_map
    parsed: list[dict] = []
    total = 0
    outgoing = 0
    invalid = 0

    for original in reader:
        total += 1
        row = {_norm_header(k): _norm_text(v) for k, v in original.items() if k is not None}

        if native:
            inbound_amount = _parse_amount(row.get("預かり金額"))
            direction = row.get("入払区分", "")
            is_inbound = inbound_amount > 0 or "入金" in direction
            if not is_inbound:
                outgoing += 1
                continue
            amount = inbound_amount
            sender = row.get("摘要内容") or row.get("振込名義") or row.get("名義") or row.get("摘要") or ""
            transaction_date = _iso_date(row.get("日付"))
            reference = _fingerprint(row)
            summary = row.get("摘要", "")
        else:
            amount = _parse_amount(row.get("amount") or row.get("金額") or row.get("入金額") or row.get("預かり金額"))
            sender = row.get("sender") or row.get("名義") or row.get("振込名義") or row.get("摘要内容") or ""
            transaction_date = _iso_date(row.get("date") or row.get("日付") or row.get("入金日"))
            canonical = "|".join([transaction_date, sender, str(amount), row.get("reference", ""), row.get("摘要", "")])
            reference = "CSV:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]
            summary = row.get("摘要", "")

        if not transaction_date or amount <= 0:
            invalid += 1
            continue
        parsed.append({
            "date": transaction_date,
            "sender": sender,
            "amount": amount,
            "reference": reference,
            "summary": summary,
        })

    return parsed, {
        "encoding": encoding,
        "format": "native-bank-csv" if native else "generic-csv",
        "total_rows": total,
        "inbound_rows": len(parsed),
        "outgoing_rows_skipped": outgoing,
        "invalid_rows_skipped": invalid,
    }


def _cleanup_invalid_zero_rows() -> int:
    # Legacy importer produced blank-sender/zero-amount UNMATCHED rows because it
    # did not understand 支払い金額/預かり金額/摘要内容. Such rows cannot represent
    # a valid payment, and we never remove rows linked to a payment or contract.
    with main.db() as c:
        ids = [x["id"] for x in c.execute(
            """
            SELECT bt.id
              FROM bank_transactions bt
             WHERE COALESCE(bt.amount,0)=0
               AND TRIM(COALESCE(bt.sender_name,''))=''
               AND COALESCE(bt.match_status,'')='UNMATCHED'
               AND bt.matched_contract_id IS NULL
               AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.bank_transaction_id=bt.id)
            """
        ).fetchall()]
        if ids:
            marks = ",".join("?" for _ in ids)
            c.execute(f"DELETE FROM bank_transactions WHERE id IN ({marks})", ids)
            main.audit(c, "system", "system", "BANK_LEGACY_ZERO_ROWS_CLEANED", "bank", "batch", {"count": len(ids)})
        return len(ids)


@main.app.on_event("startup")
def _startup_bank_v243() -> None:
    _cleanup_invalid_zero_rows()


async def bank_import_csv_v243(file: UploadFile = File(...), a=Depends(main.auth)):
    raw = await file.read(2_000_001)
    if len(raw) > 2_000_000:
        raise HTTPException(413, "CSVは2MB以下にしてください")
    parsed, diagnostics = _parse_csv_bytes(raw)

    imported = []
    duplicates = 0
    with main.db() as c:
        contracts = [main.serial(x) for x in main.qcons(c)]
        for r in parsed:
            if c.execute("SELECT 1 FROM bank_transactions WHERE reference=?", (r["reference"],)).fetchone():
                duplicates += 1
                continue
            status, cid, score = main.match(r["sender"], r["amount"], contracts)
            tid = c.execute(
                "INSERT INTO bank_transactions(transaction_date,sender_name,amount,reference,match_status,matched_contract_id,score) VALUES(?,?,?,?,?,?,?)",
                (r["date"], r["sender"], r["amount"], r["reference"], status, cid, score),
            ).lastrowid
            if status == "AUTO_MATCHED" and cid:
                main.apply(c, tid, cid, r["date"], r["amount"])
            imported.append({
                "id": tid,
                "transaction_date": r["date"],
                "sender_name": r["sender"],
                "amount": r["amount"],
                "match_status": status,
                "contract_id": cid,
                "score": score,
            })
        diagnostics["imported_rows"] = len(imported)
        diagnostics["duplicate_rows_skipped"] = duplicates
        main.audit(c, a["name"], a["role"], "BANK_CSV_IMPORTED_V243", "bank", "batch", diagnostics)

    return {"count": len(imported), "items": imported, "diagnostics": diagnostics}


start_v2.replace("/api/bank/import-csv", "POST", bank_import_csv_v243)

# Make the result explicit on mobile: total rows / incoming rows / outgoing skips.
BANK_IMPORT_UI = r'''
<script id="bank-import-v243">
window.cup=async function(){
  if(!cf.files[0]) return alert('CSVファイルを選択してください');
  try{
    const f=new FormData(); f.append('file',cf.files[0]);
    const r=await api('/api/bank/import-csv',{method:'POST',body:f});
    const d=r.diagnostics||{};
    alert(`${d.total_rows??'-'}行中、入金${d.inbound_rows??r.count}件を検出\n新規取込：${r.count}件\n出金除外：${d.outgoing_rows_skipped??0}件\n重複除外：${d.duplicate_rows_skipped??0}件`);
    await ref();
  }catch(e){alert('CSV取込エラー：'+e.message)}
};
</script>
'''
if "bank-import-v243" not in main.HTML and "</body>" in main.HTML:
    main.HTML = main.HTML.replace("</body>", BANK_IMPORT_UI + "</body>")
main.HTML = main.HTML.replace("v2.4.2-poc", APP_VERSION)


def health_v243():
    x = start_v10.health_v242()
    x.update({
        "version": APP_VERSION,
        "bank_csv_adapter": "2.4.3-native-inbound-only",
        "bank_csv_inbound_only": True,
        "bank_csv_fingerprint_dedupe": True,
        "legacy_zero_row_cleanup": True,
    })
    return x


start_v2.replace("/api/health", "GET", health_v243)


if __name__ == "__main__":
    uvicorn.run(main.app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), proxy_headers=True)
