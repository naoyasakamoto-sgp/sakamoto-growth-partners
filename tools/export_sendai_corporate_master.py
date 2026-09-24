#!/usr/bin/env python3
from __future__ import annotations

import csv
import html
import io
import json
import re
import zipfile
from collections import Counter
from pathlib import Path
from urllib.parse import urlencode

import requests

INDEX_URL = "https://www.houjin-bangou.nta.go.jp/download/zenken/index.html"
DOWNLOAD_URL = "https://www.houjin-bangou.nta.go.jp/download/zenken/index.html"
OUT = Path("generated/sendai_corporate_master")
OUT.mkdir(parents=True, exist_ok=True)

SENDAI_WARDS = {
    "仙台市青葉区": "青葉区",
    "仙台市宮城野区": "宮城野区",
    "仙台市若林区": "若林区",
    "仙台市太白区": "太白区",
    "仙台市泉区": "泉区",
}

NTA_FIELDS = [
    "sequenceNumber",
    "corporateNumber",
    "process",
    "correct",
    "updateDate",
    "changeDate",
    "name",
    "nameImageId",
    "kind",
    "prefectureName",
    "cityName",
    "streetNumber",
    "addressImageId",
    "prefectureCode",
    "cityCode",
    "postCode",
    "addressOutside",
    "addressOutsideImageId",
    "closeDate",
    "closeCause",
    "successorCorporateNumber",
    "changeCause",
    "assignmentDate",
    "latest",
    "enName",
    "enPrefectureName",
    "enCityName",
    "enAddressOutside",
    "furigana",
    "hihyoji",
]

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/140.0.0.0 Safari/537.36"
)


def strip_tags(value: str) -> str:
    value = re.sub(r"<script[\s\S]*?</script>", "", value, flags=re.I)
    value = re.sub(r"<style[\s\S]*?</style>", "", value, flags=re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def discover_miyagi_downloads(page: str) -> tuple[list[str], str]:
    file_nos = []
    for row in re.findall(r"<tr[\s\S]*?</tr>", page, flags=re.I):
        text = strip_tags(row)
        if "宮城県" not in text:
            continue
        m = re.search(r"doDownload\s*\(\s*(\d+)\s*\)", row)
        if m:
            file_nos.append(m.group(1))

    # The page can expose Unicode and Shift-JIS rows. Keep all candidates and
    # choose the one that produces the largest valid Sendai extract.
    file_nos = list(dict.fromkeys(file_nos))

    token = ""
    input_tags = re.findall(r"<input\b[^>]*>", page, flags=re.I)
    for tag in input_tags:
        if "CNSFWTokenProcessor.request.token" not in tag:
            continue
        m = re.search(r'value=["\']([^"\']*)["\']', tag, flags=re.I)
        if m:
            token = html.unescape(m.group(1))
            break
    return file_nos, token


def download_zip(session: requests.Session, file_no: str, token: str) -> bytes:
    params = {
        "event": "download",
        "selDlFileNo": file_no,
        "jp.go.nta.houjin_bangou.framework.web.common.CNSFWTokenProcessor.request.token": token,
    }
    r = session.get(
        DOWNLOAD_URL,
        params=params,
        headers={"User-Agent": UA, "Referer": INDEX_URL},
        timeout=120,
    )
    r.raise_for_status()
    if not r.content.startswith(b"PK"):
        preview = strip_tags(r.text[:1000]) if "text" in r.headers.get("content-type", "") else r.content[:100]
        raise RuntimeError(f"NTA download was not ZIP for fileNo={file_no}: {preview!r}")
    return r.content


def decode_csv(data: bytes) -> tuple[str, str]:
    for encoding in ("utf-8-sig", "cp932", "shift_jis"):
        try:
            text = data.decode(encoding)
            # Sanity check on the known prefecture string.
            if "宮城県" in text:
                return text, encoding
        except UnicodeDecodeError:
            pass
    raise RuntimeError("Could not decode NTA CSV as UTF-8/CP932/Shift-JIS")


def extract_sendai(zip_bytes: bytes) -> tuple[list[dict], str, str]:
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        csv_names = [n for n in zf.namelist() if n.lower().endswith(".csv")]
        if not csv_names:
            raise RuntimeError("ZIP had no CSV")
        member = csv_names[0]
        raw = zf.read(member)

    text, encoding = decode_csv(raw)
    reader = csv.reader(io.StringIO(text))
    rows = []
    for values in reader:
        if len(values) < len(NTA_FIELDS):
            continue
        d = dict(zip(NTA_FIELDS, values))
        ward = SENDAI_WARDS.get(d.get("cityName", ""))
        if not ward:
            continue

        # Full-data downloads can include closed entities. For an outbound
        # prospecting master, keep currently active/public records only.
        if (d.get("closeDate") or "").strip():
            continue
        if (d.get("hihyoji") or "").strip() not in ("", "0"):
            continue
        if d.get("latest") and d.get("latest") not in ("1", "true", "TRUE"):
            continue

        corporate_number = re.sub(r"\D", "", d.get("corporateNumber", ""))
        if len(corporate_number) != 13:
            continue

        address = (
            (d.get("prefectureName") or "")
            + (d.get("cityName") or "")
            + (d.get("streetNumber") or "")
        )
        rows.append(
            {
                "corporate_number": corporate_number,
                "name": d.get("name", ""),
                "furigana": d.get("furigana", ""),
                "kind_code": d.get("kind", ""),
                "ward": ward,
                "city_code": d.get("cityCode", ""),
                "postal_code": d.get("postCode", ""),
                "address": address,
                "assignment_date": d.get("assignmentDate", ""),
                "updated_at": d.get("updateDate", ""),
                "source": "国税庁 法人番号公表サイト 全件データ",
                "source_url": "https://www.houjin-bangou.nta.go.jp/download/zenken/",
            }
        )
    return rows, member, encoding


def main() -> None:
    session = requests.Session()
    page_r = session.get(INDEX_URL, headers={"User-Agent": UA}, timeout=60)
    page_r.raise_for_status()
    file_nos, token = discover_miyagi_downloads(page_r.text)
    print(f"Found Miyagi candidates: {file_nos}", flush=True)
    if not file_nos:
        raise RuntimeError("Could not find Miyagi doDownload() entry on NTA all-record page")

    best = None
    errors = []
    for file_no in file_nos:
        try:
            zip_bytes = download_zip(session, file_no, token)
            rows, member, encoding = extract_sendai(zip_bytes)
            print(
                f"fileNo={file_no} member={member} encoding={encoding} Sendai active={len(rows)}",
                flush=True,
            )
            if best is None or len(rows) > len(best["rows"]):
                best = {
                    "file_no": file_no,
                    "rows": rows,
                    "member": member,
                    "encoding": encoding,
                }
        except Exception as exc:
            errors.append({"file_no": file_no, "error": str(exc)})
            print(f"candidate failed fileNo={file_no}: {exc}", flush=True)

    if not best or not best["rows"]:
        raise RuntimeError(f"No NTA candidate produced Sendai rows: {errors}")

    # Deduplicate by corporate number in case the source includes repeated rows.
    by_number = {}
    for row in best["rows"]:
        by_number[row["corporate_number"]] = row
    rows = sorted(
        by_number.values(),
        key=lambda x: (x["ward"], x["name"], x["corporate_number"]),
    )

    fields = [
        "corporate_number",
        "name",
        "furigana",
        "kind_code",
        "ward",
        "city_code",
        "postal_code",
        "address",
        "assignment_date",
        "updated_at",
        "source",
        "source_url",
    ]
    with (OUT / "sendai_corporate_master.csv").open(
        "w", encoding="utf-8-sig", newline=""
    ) as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    counts = Counter(row["ward"] for row in rows)
    summary = {
        "count": len(rows),
        "by_ward": dict(counts),
        "nta_file_no": best["file_no"],
        "nta_csv_member": best["member"],
        "source_encoding": best["encoding"],
        "candidate_errors": errors,
        "source": "国税庁 法人番号公表サイト 全件データ",
    }
    (OUT / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
