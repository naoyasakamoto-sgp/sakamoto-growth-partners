from __future__ import annotations

import os

import uvicorn

import start_v9
import start_v2

main = start_v9.main
APP_VERSION = "2.4.2-poc"

# Root cause of the mobile bank-screen breakage:
# the legacy global mobile rule forces every table to min-width:720px, while
# the bank table is not wrapped by .scroll. On iPhone this expands the document
# beyond the viewport, clips the header/tabs and pushes the last columns off-screen.
RESPONSIVE_UI_CSS = r'''
<style id="mobile-responsive-v242">
*{box-sizing:border-box}
html,body{max-width:100%;overflow-x:hidden}
header{width:100%;overflow:hidden}
.w,.c,.panel{min-width:0;max-width:100%}
.tabs{display:flex;gap:4px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding-bottom:4px}
.tabs::-webkit-scrollbar{display:none}
.tabs button{flex:0 0 auto;white-space:nowrap}
#b .c{overflow:hidden}
.bank-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px}
.bank-actions button{flex:0 0 auto;margin:0}
.bank-file{display:flex;align-items:center;gap:8px;min-width:0;flex:1 1 280px}
.bank-file input[type=file]{min-width:0;width:100%;max-width:100%;padding:7px;background:#f6f8fb;border:1px solid #e3e8ef;border-radius:8px}
#bs{width:100%;table-layout:auto}
#bs td{vertical-align:middle;overflow-wrap:anywhere}
#bs td:nth-child(1){white-space:nowrap}
#bs td:nth-child(3){white-space:nowrap;text-align:right}
#bs td:nth-child(4),#bs td:nth-child(5){white-space:nowrap}
@media(max-width:700px){
  .w{width:100%;padding:10px}
  header{padding:16px 12px;font-size:15px;line-height:1.4}
  .c{padding:12px;border-radius:12px}
  .bank-actions{display:grid;grid-template-columns:1fr;gap:8px;margin-bottom:10px}
  .bank-actions button{width:100%;min-height:44px;font-size:15px}
  .bank-file{display:block;width:100%}
  .bank-file input[type=file]{display:block;width:100%;min-height:44px;font-size:14px}
  /* Override legacy @media rule: table{min-width:720px}. */
  #bs,#bs tbody{display:block;width:100%;min-width:0!important;max-width:100%}
  #bs tr{display:grid;width:100%;max-width:100%;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:'sender amount' 'date status' 'contract contract';column-gap:12px;row-gap:5px;padding:12px 2px;border-bottom:1px solid #e8edf3}
  #bs tr:last-child{border-bottom:0}
  #bs td{display:block;width:auto!important;min-width:0;border:0;padding:0;font-size:14px;line-height:1.45}
  #bs td:nth-child(1){grid-area:date;color:#66788a;font-size:12px;white-space:nowrap}
  #bs td:nth-child(2){grid-area:sender;font-weight:650;color:#17304b;overflow-wrap:anywhere}
  #bs td:nth-child(3){grid-area:amount;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
  #bs td:nth-child(4){grid-area:status;justify-self:end;color:#49627a;font-size:12px;white-space:normal;text-align:right}
  #bs td:nth-child(4)::before{content:'照合 ';color:#8a98a8}
  #bs td:nth-child(5){grid-area:contract;color:#49627a;font-size:12px;white-space:normal}
  #bs td:nth-child(5):not(:empty)::before{content:'契約 ';color:#8a98a8}
  #client-ai-status{right:10px!important;left:10px!important;bottom:10px!important;max-width:none!important;width:auto!important}
}
</style>
'''

BANK_OLD = '<section id="b" class="panel"><div class="c"><button onclick="demo()">銀行デモ取得</button><input id="cf" type="file" accept=".csv"><button onclick="cup()">CSV取込</button><table id="bs"></table></div></section>'
BANK_NEW = '<section id="b" class="panel"><div class="c"><div class="bank-actions"><button onclick="demo()">銀行デモ取得</button><div class="bank-file"><input id="cf" type="file" accept=".csv" aria-label="銀行CSVファイル"></div><button onclick="cup()">CSV取込</button></div><table id="bs" aria-label="銀行取引一覧"></table></div></section>'

if "mobile-responsive-v242" not in main.HTML and "</head>" in main.HTML:
    main.HTML = main.HTML.replace("</head>", RESPONSIVE_UI_CSS + "</head>")
main.HTML = main.HTML.replace(BANK_OLD, BANK_NEW)
main.HTML = main.HTML.replace("v2.4.1-poc | Client-owned Gemini v10.1", "v2.4.2-poc | Client-owned Gemini v10.1")
main.HTML = main.HTML.replace("v2.4.1-poc | Client-owned Gemini | 永続DB", "v2.4.2-poc | Client-owned Gemini | 永続DB")
main.HTML = main.HTML.replace("v2.4.0-poc | 永続DB | Gemini設定時のみ Google API送信", "v2.4.2-poc | 永続DB | Gemini設定時のみ Google API送信")


def health_v242():
    x = start_v9.health_v101()
    x.update({
        "version": APP_VERSION,
        "ui_mobile_responsive": True,
        "bank_mobile_layout": "responsive-card-table",
    })
    return x


start_v2.replace("/api/health", "GET", health_v242)

if __name__ == "__main__":
    uvicorn.run(main.app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), proxy_headers=True)
