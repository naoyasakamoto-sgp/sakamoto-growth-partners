import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
test("Preview remains unlinked and noindex until copy is approved",async()=>{
 const home=await read("index.html"),lab=await read("taste-lab/index.html");
 assert.match(lab,/<meta name="robots" content="noindex,nofollow,noarchive">/);
 assert.doesNotMatch(home,/href="\/taste-lab\//);
 assert.match(lab,/\/assets\/sgp-wordmark-v2\.webp/);
 assert.match(lab,/<html lang="ja">/);
});
test("All declared local assets and runtime files exist",async()=>{
 for(const path of ["assets/sgp-wordmark-v2.webp","assets/case-studies/my-jazz-day/hero-mobile.webp","taste/engine.mjs","taste-lab/app.mjs","taste-lab/taste.css"]){
  await assert.doesNotReject(()=>access(new URL("../"+path,import.meta.url)),path);
 }
});
test("Untrusted input has no executable HTML sink or network transmission",async()=>{
 const app=await read("taste-lab/app.mjs"),engine=await read("taste/engine.mjs");
 assert.doesNotMatch(app,/\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\s*\(|\.innerHTML\s*=/);
 assert.doesNotMatch(engine,/\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\s*\(|\.innerHTML\s*=/);
 assert.match(engine,/unknown/);
 assert.match(app,/confirm-taste/);
 assert.match(app,/save-taste/);
});
test("Keyboard and reduced-motion accommodations are present",async()=>{
 const html=await read("taste-lab/index.html"),css=await read("taste-lab/taste.css");
 assert.match(html,/<main id="content">/);
 assert.match(html,/role="status"/);
 assert.match(html,/aria-live="polite"/);
 assert.match(html,/type="file"/);
 assert.match(css,/:focus-visible/);
 assert.match(css, /prefers-reduced-motion/);
 assert.match(css, /\[hidden\]/);
 assert.match(css,/max-width:500px/);
});
test("Source separates conceptual figures from real product images",async()=>{
 const html=await read("taste-lab/index.html");
 assert.match(html,/CONCEPT/);
 assert.match(html,/設計段階の模式図/);
 assert.match(html,/assets\/case-studies\/my-jazz-day\/hero-mobile\.webp/);
});
