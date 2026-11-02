/**
 * Post-deploy production smoke test. Does not send Taste, visitor data or cookies.
 * Run after GitHub Pages confirms a deployed artifact.
 */
import assert from "node:assert/strict";
import {setTimeout as sleep} from "node:timers/promises";
const origin="https://sakamoto-growth-partners.com";
const cacheKey=(process.env.GITHUB_SHA||"production").slice(0,12);
const targets=[
 {path:"/",expected:['href="/taste-lab/"','id="works"','/assets/sgp-wordmark-v2.webp']},
 {path:"/taste-lab/",expected:["noindex,nofollow,noarchive",'src="/taste-lab/app.mjs"',"erabu-live-home-20261102.jpg","sendai-ekimae-erabu-map.svg",'id="taste-input"']},
 {path:"/taste-lab/app.mjs",expected:["discardPendingReview","transitionExperience","confirm-taste","save-taste"]},
 {path:"/taste/engine.mjs",expected:["hasKnownExperience","focusView","sgp-web-taste@1"]},
 {path:"/taste-lab/taste.css",expected:["Approved Taste traits reshape curated work","data-density","data-view"]},
 {path:"/assets/erabu/source/erabu-live-home-20261102.jpg",binary:true,minBytes:12000},
 {path:"/assets/erabu/source/sendai-ekimae-erabu-map.svg",expected:["<svg","仙台駅前"],minBytes:1000},
 {path:"/assets/sgp-wordmark-v2.webp",binary:true,minBytes:1000},
 {path:"/contact/",expected:["<html"]},
 {path:"/brand/",expected:["<html"]}
];
async function verify(target){
 const url=new URL(target.path,origin);
 url.searchParams.set("_sgp_release",cacheKey);
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(url,{redirect:"follow",cache:"no-store",signal:controller.signal,headers:{"Cache-Control":"no-cache","Accept":"*/*"}});
  assert.equal(response.status,200,target.path+": HTTP "+response.status);
  assert.equal(new URL(response.url).origin,origin,target.path+": redirected away from official domain");
  const bytes=Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length>(target.minBytes||300),target.path+": unexpectedly empty");
  if(!target.binary){
   const source=bytes.toString("utf8");
   for(const expected of target.expected)assert.ok(source.includes(expected),target.path+": missing "+expected);
  }
  return {path:target.path,bytes:bytes.length};
 }finally{clearTimeout(timer)}
}
for(let attempt=1;attempt<=12;attempt++){
 try{
  const results=await Promise.all(targets.map(verify));
  for(const row of results)console.log("PASS "+row.path+": "+row.bytes+" bytes");
  console.log("PRODUCTION SMOKE SUCCESS: "+results.length+" resources, Taste link, media, noindex and legacy routes");
  process.exit(0);
 }catch(error){
  if(attempt===12){console.error("PRODUCTION SMOKE FAILED:",error.stack||error);process.exit(1)}
  console.log("Attempt "+attempt+": deployment propagation pending: "+error.message);
  await sleep(5000);
 }
}
