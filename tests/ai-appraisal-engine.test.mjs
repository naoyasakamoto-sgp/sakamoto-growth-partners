import assert from 'node:assert/strict';import{appraise}from'../products/ai-appraisal/engine.js';
const rows=[
{sold_at:'2026-08-01',category:'工具',brand:'Makita',model:'TD173DRGX',name:'インパクト',condition:'B',sale_price:39800,days_to_sell:12},
{sold_at:'2026-07-02',category:'工具',brand:'Makita',model:'TD173DRGX',name:'インパクト',condition:'A',sale_price:43800,days_to_sell:9},
{sold_at:'2026-05-13',category:'工具',brand:'Makita',model:'TD173DRGX',name:'インパクト',condition:'B',sale_price:40500,days_to_sell:17},
{sold_at:'2026-04-10',category:'工具',brand:'Makita',model:'TD173DRGX',name:'インパクト',condition:'C',sale_price:35000,days_to_sell:23},
{sold_at:'2026-03-20',category:'工具',brand:'Makita',model:'TD173DRGX',name:'インパクト',condition:'B',sale_price:41000,days_to_sell:14}
];const r=appraise({category:'工具',brand:'Makita',model:'TD173DRGX',name:'18V インパクト',condition:'B'},rows,{feeRate:10,targetMarginRate:20,riskRate:5,shipping:900,offeredPrice:24000},{now:new Date('2026-09-16')});assert.equal(r.status,'ok');assert.ok(r.stats.median>=35000&&r.stats.median<=45000);assert.ok(r.economics.recommendedMaxBuy>0);assert.ok(['BUY','REVIEW','PASS'].includes(r.economics.decision));console.log('AI appraisal engine OK',r.stats,r.economics);