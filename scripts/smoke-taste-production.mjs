/**
 * Post-deploy production smoke test. Does not send Taste, visitor data or cookies.
 * Run after GitHub Pages confirms a deployed artifact.
 */
import assert from "node:assert/strict";
import {setTimeout as sleep} from "node:timers/promises";
const origin="https://sakamoto-growth-partners.com";
const cacheKey=(process.env.GITHUB_SHA||"production").slice(0,12);
const targets=[
 {path:"/",expected:['id="works"','/assets/sgp-wordmark-v2.webp'],forbidden:['href="/taste-lab/"']},
 {path:"/assets/sgp-wordmark-v2.webp",binary:true,minBytes:1000},
 {path:"/contact/",expected:["<html"]},
 {path:"/brand/",expected:["<html"]},
 {path:"/career/",expected:["<html"]},
 {path:"/case-studies/",expected:["<html"]},
 {path:"/taste-lab/",absent:true},
 {path:"/taste-lab/index.html",absent:true},
 {path:"/taste-lab/app.mjs",absent:true},
 {path:"/taste-lab/taste.css",absent:true},
 {path:"/taste/engine.mjs",absent:true},
 {path:"/assets/erabu/source/erabu-live-home-20261102.jpg",absent:true}
];
async function verify(target){
 const url=new URL(target.path,origin);
 url.searchParams.set("_sgp_release",cacheKey);
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(url,{redirect:"follow",cache:"no-store",signal:controller.signal,headers:{"Cache-Control":"no-cache","Accept":"*/*"}});
  assert.equal(new URL(response.url).origin,origin,target.path+": redirected away from official domain");
  if(target.absent){
   assert.equal(response.status,404,target.path+": retired page still reachable (HTTP "+response.status+")");
   return {path:target.path,status:404};
  }
  assert.equal(response.status,200,target.path+": HTTP "+response.status);
  const bytes=Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length>(target.minBytes||300),target.path+": unexpectedly empty");
  if(!target.binary){
   const source=bytes.toString("utf8");
   for(const expected of target.expected||[])assert.ok(source.includes(expected),target.path+": missing "+expected);
   for(const forbidden of target.forbidden||[])assert.ok(!source.includes(forbidden),target.path+": forbidden public link "+forbidden);
  }
  return {path:target.path,bytes:bytes.length,status:200};
 }finally{clearTimeout(timer)}
}
for(let attempt=1;attempt<=12;attempt++){
 try{
  const results=await Promise.all(targets.map(verify));
  for(const row of results)console.log("PASS "+row.path+": HTTP "+row.status+(row.bytes?" ("+row.bytes+" bytes)":""));
  console.log("PRODUCTION SMOKE SUCCESS: "+results.length+" active and retired routes verified; Taste endpoints return 404");
  process.exit(0);
 }catch(error){
  if(attempt===12){console.error("PRODUCTION SMOKE FAILED:",error.stack||error);process.exit(1)}
  console.log("Attempt "+attempt+": deployment propagation pending: "+error.message);
  await sleep(5000);
 }
}
