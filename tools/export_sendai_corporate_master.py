#!/usr/bin/env python3
from __future__ import annotations
import csv, json, time
from collections import Counter
from pathlib import Path
import requests

ENDPOINT="https://api.info.gbiz.go.jp/sparql"
CITY_CODES={"04101":"青葉区","04102":"宮城野区","04103":"若林区","04104":"太白区","04105":"泉区"}
PAGE=1000
OUT=Path("generated/sendai_corporate_master")
OUT.mkdir(parents=True,exist_ok=True)

def get(query):
    last=None
    for i in range(5):
        try:
            r=requests.get(ENDPOINT,params={"query":query},headers={"Accept":"application/sparql-results+json","User-Agent":"SGP-public-data-export/1.0"},timeout=120)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            last=e
            time.sleep(min(2**i,10))
    raise RuntimeError(last)

def v(b,k):
    x=b.get(k)
    return x.get("value","") if isinstance(x,dict) else ""

rows=[]
seen=set()
counts=Counter()
for code,ward in CITY_CODES.items():
    offset=0
    while True:
        q=f"""
PREFIX hj: <http://hojin-info.go.jp/ns/domain/biz/1#>
PREFIX ic: <http://imi.go.jp/ns/core/rdf#>
SELECT DISTINCT ?corporateID ?corporateType ?corporateName ?corporateKana ?location ?borndate ?moddate
FROM <http://hojin-info.go.jp/graph/hojin>
WHERE {{
  ?s hj:法人基本情報 ?key .
  ?key ic:ID/ic:識別値 ?corporateID .
  ?key ic:住所 ?address .
  ?address ic:市区町村コード <http://imi.go.jp/ns/code_id/code/jisx0402#{code}> .
  OPTIONAL {{ ?key ic:名称 ?n . ?n ic:種別 '商号又は名称' . ?n ic:表記 ?corporateName . }}
  OPTIONAL {{ ?key ic:名称 ?kn . ?kn ic:種別 '商号又は名称' . ?kn ic:カナ表記 ?corporateKana . }}
  OPTIONAL {{ ?address ic:種別 '住所' . ?address ic:表記 ?location . }}
  OPTIONAL {{ ?key ic:組織種別 ?corporateType . }}
  OPTIONAL {{ ?key ic:設立日/ic:標準型日付 ?borndate . }}
  OPTIONAL {{ ?key hj:更新日時/ic:標準型日時 ?moddate . }}
  ?key hj:区分 ?st . ?st ic:種別 '処理区分' . ?st ic:表記 ?classSType .
  FILTER(?classSType != "21" && ?classSType != "81" && ?classSType != "99")
}}
ORDER BY ?corporateID
LIMIT {PAGE} OFFSET {offset}
"""
        data=get(q)
        bs=data.get("results",{}).get("bindings",[])
        print(ward,offset,len(bs),flush=True)
        for b in bs:
            cid=v(b,"corporateID")
            if not cid or cid in seen: continue
            seen.add(cid)
            rows.append({
                "corporate_number":cid,
                "corporate_type":v(b,"corporateType"),
                "name":v(b,"corporateName"),
                "kana":v(b,"corporateKana"),
                "ward":ward,
                "city_code":code,
                "address":v(b,"location"),
                "founded_date":v(b,"borndate"),
                "updated_at":v(b,"moddate"),
                "source":"gBizINFO public SPARQL",
                "source_url":"https://info.gbiz.go.jp/",
            })
            counts[ward]+=1
        if len(bs)<PAGE: break
        offset+=PAGE
        time.sleep(.2)

rows.sort(key=lambda x:(x["ward"],x["name"],x["corporate_number"]))
fields=["corporate_number","corporate_type","name","kana","ward","city_code","address","founded_date","updated_at","source","source_url"]
with (OUT/"sendai_corporate_master.csv").open("w",encoding="utf-8-sig",newline="") as f:
    w=csv.DictWriter(f,fieldnames=fields)
    w.writeheader(); w.writerows(rows)
summary={"count":len(rows),"by_ward":dict(counts)}
(OUT/"summary.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps(summary,ensure_ascii=False),flush=True)
