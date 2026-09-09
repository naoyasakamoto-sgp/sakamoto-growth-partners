import os
import uvicorn
import start_v13, start_v2

main = start_v13.main
APP_VERSION = '2.5.2-poc'

CONTRACT_RESPONSIVE_CSS = r'''
<style id="contract-mobile-responsive-v252">
#k .c{overflow:hidden;min-width:0;max-width:100%}
#ks{width:100%;max-width:100%}
#ks td{vertical-align:middle;overflow-wrap:anywhere}
#ks td:nth-child(1),#ks td:nth-child(4),#ks td:nth-child(5){white-space:nowrap}
#ks td:nth-child(4){text-align:right;font-variant-numeric:tabular-nums;font-weight:700}
@media(max-width:700px){
  /* Legacy CSS forces every table to min-width:720px. The contract table had no
     scroll wrapper, so it widened the whole document and clipped right columns. */
  #k .c{padding:10px 12px;margin-left:0;margin-right:0}
  #ks,#ks tbody{display:block;width:100%;min-width:0!important;max-width:100%!important}
  #ks tr{display:grid;width:100%;max-width:100%;min-width:0;
    grid-template-columns:minmax(0,1fr) auto;
    grid-template-areas:'contract status' 'customer amount' 'item item';
    column-gap:12px;row-gap:7px;padding:13px 2px;border-bottom:1px solid #e6ebf1}
  #ks tr:last-child{border-bottom:0}
  #ks td{display:block;width:auto!important;min-width:0;max-width:100%;border:0;padding:0;line-height:1.4}
  #ks td:nth-child(1){grid-area:contract;font-size:13px;font-weight:650;color:#17304b;white-space:nowrap}
  #ks td:nth-child(1)::before{content:'契約 ';font-size:11px;font-weight:500;color:#8a98a8}
  #ks td:nth-child(2){grid-area:customer;font-size:15px;font-weight:650;color:#17304b;overflow-wrap:anywhere}
  #ks td:nth-child(3){grid-area:item;font-size:13px;color:#607387;overflow-wrap:anywhere;white-space:normal}
  #ks td:nth-child(3)::before{content:'品目 ';font-size:11px;color:#8a98a8}
  #ks td:nth-child(4){grid-area:amount;justify-self:end;text-align:right;font-size:15px;font-weight:750;white-space:nowrap;color:#17304b}
  #ks td:nth-child(5){grid-area:status;justify-self:end;width:max-content!important;max-width:140px;
    padding:4px 8px!important;border-radius:999px;background:#eef2f6;color:#49627a;
    font-size:11px;font-weight:650;white-space:normal;text-align:center;line-height:1.25}
}
@media(max-width:380px){
  #ks tr{grid-template-columns:minmax(0,1fr) minmax(88px,auto);column-gap:8px}
  #ks td:nth-child(2),#ks td:nth-child(4){font-size:14px}
}
</style>
'''

if 'contract-mobile-responsive-v252' not in main.HTML and '</head>' in main.HTML:
    main.HTML = main.HTML.replace('</head>', CONTRACT_RESPONSIVE_CSS + '</head>')
main.HTML = main.HTML.replace('<table id="ks"></table>', '<table id="ks" aria-label="契約一覧"></table>')
main.HTML = main.HTML.replace('v2.5.1-poc', APP_VERSION)


def health_v252():
    x = start_v13.health()
    x.update({
        'version': APP_VERSION,
        'contract_mobile_responsive': True,
        'contract_mobile_layout': 'responsive-card-table',
        'contract_overflow_fix': 'override-legacy-table-min-width',
    })
    return x

start_v2.replace('/api/health', 'GET', health_v252)

if __name__ == '__main__':
    uvicorn.run(main.app, host='0.0.0.0', port=int(os.environ.get('PORT', '8000')), proxy_headers=True)
