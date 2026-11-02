// Run actual Chrome for desktop/mobile QA without paid browser services.
import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {createServer} from "node:http";
import {mkdir,mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve,sep,extname} from "node:path";
import {setTimeout as sleep} from "node:timers/promises";
const root=process.cwd(), output=join(root,"qa","screenshots");
const externalRequests=[],pageErrors=[];
const mime={".html":"text/html",".css":"text/css",".mjs":"text/javascript",".js":"text/javascript",".svg":"image/svg+xml",".webp":"image/webp",".png":"image/png",".json":"application/json"};
const http=createServer(async(req,res)=>{
 try{
  let pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
  if(pathname.endsWith("/"))pathname+="index.html";
  const file=resolve(root,"."+pathname);
  if(!file.startsWith(root+sep))throw Error("Outside repository");
  const buf=await readFile(file);res.writeHead(200,{"Content-Type":(mime[extname(file)]||"application/octet-stream"),"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(buf);
 }catch{res.writeHead(404);res.end("Not found")}
});
function chromeExecutable(){
 for(const name of ["google-chrome","google-chrome-stable","chromium","chromium-browser"]){
  const r=spawnSync("which",[name],{encoding:"utf8"});
  if(r.status===0&&r.stdout.trim())return r.stdout.trim();
 }
 throw Error("No Chrome browser in CI runner");
}
class CDP{
 constructor(url){
  this.ws=new WebSocket(url);this.nextId=0;this.pending=new Map();this.listeners=[];
  this.ws.addEventListener("message",event=>{
   const data=JSON.parse(event.data);
   if(data.id&&this.pending.has(data.id)){const p=this.pending.get(data.id);clearTimeout(p.timer);this.pending.delete(data.id);data.error?p.reject(Error(JSON.stringify(data.error))):p.resolve(data.result||{})}
   else if(data.method)this.listeners.forEach(fn=>fn(data));
  });
 }
 async connect(){await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error("CDP connect timeout")),12000);this.ws.addEventListener("open",()=>{clearTimeout(timer);resolve()},{once:true});this.ws.addEventListener("error",()=>{clearTimeout(timer);reject(Error("CDP error"))},{once:true})})}
 send(method,params={}){const id=++this.nextId;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error("CDP timeout: "+method))},16000);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params}))})}
 async eval(expression){const r=await this.send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result?.value}
 close(){this.ws.close()}
}
async function waitFor(fn,reason,tries=60){
 for(let i=0;i<tries;i++){try{const result=await fn();if(result)return result}catch{}await sleep(200)}
 throw Error("Timeout: "+reason);
}
const state='(()=>{const paths={sgpLogo:"/assets/sgp-wordmark-v2.webp",erabuLogo:"/assets/erabu/source/sendai-erabu-main.svg",erabuMap:"/assets/erabu/source/sendai-ekimae-erabu-map.svg",jazz:"/assets/case-studies/my-jazz-day/hero-mobile.webp"};const assets={};for(const [k,v] of Object.entries(paths)){const img=[...document.images].find(x=>x.getAttribute("src")===v);assets[k]=!!img&&img.complete&&img.naturalWidth>0}return{ready:document.readyState,width:document.documentElement.scrollWidth,exhibits:document.querySelectorAll("#exhibitions .exhibit").length,assets,interactive:!!document.querySelector("#validate-taste")&&!!document.querySelector("#taste-input"),hero:document.querySelector("#hero-title")?.getBoundingClientRect().width>0}})()';
const valid={schema:"sgp-web-taste@1",interests:{products:1,design:0,engineering:3,business:null},experience:{density:"balanced",navigation:"guided",evidence:"diagrams",interaction:"observe",discovery:"balanced"},confidence:{products:"inferred",design:"explicit",engineering:"explicit",business:"unknown"}};
let chrome,page,tmp,base;
async function capture(name){const shot=await page.send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});await writeFile(join(output,name+".png"),Buffer.from(shot.data,"base64"))}
async function navigate(url){await page.send("Page.navigate",{url});await waitFor(async()=>page.eval("document.readyState==='complete'&&!!document.querySelector('#exhibitions')"),"page navigation")}
async function run(code){return page.eval("(()=>{"+code+"})()")}
try{
 await mkdir(output,{recursive:true});
 await new Promise(resolve=>http.listen(0,"127.0.0.1",resolve));base="http://127.0.0.1:"+http.address().port;
 tmp=await mkdtemp(join(tmpdir(),"taste-chrome-"));
 chrome=spawn(chromeExecutable(),["--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage","--no-first-run","--no-default-browser-check","--disable-background-networking","--remote-debugging-port=0","--user-data-dir="+tmp,"--window-size=1565,940","about:blank"],{stdio:"ignore"});
 const port=await waitFor(async()=>Number((await readFile(join(tmp,"DevToolsActivePort"),"utf8")).split("\n")[0]),"Chrome port",80);
 const ws=await waitFor(async()=>{const list=await(await fetch("http://127.0.0.1:"+port+"/json/list")).json();return list.find(x=>x.type==="page")?.webSocketDebuggerUrl},"Chrome page");
 page=new CDP(ws);await page.connect();
 page.listeners.push(message=>{
  if(message.method==="Runtime.exceptionThrown")pageErrors.push(message.params?.exceptionDetails?.text||"exception");
  if(message.method==="Network.requestWillBeSent")externalRequests.push(message.params?.request?.url||"");
 });
 await page.send("Page.enable");await page.send("Runtime.enable");await page.send("Network.enable");
 for(const width of [320,390,768,1280,1565]){
  const height=width<=390?844:920;
  await page.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<=500});
  await navigate(base+"/taste-lab/");
  await page.eval("document.querySelector('#works').scrollIntoView()");
  await waitFor(async()=>{const p=await page.eval(state);return Object.values(p.assets).every(Boolean)},"loaded images "+width);
  const p=await page.eval(state);
  assert.equal(p.ready,"complete");assert.equal(p.exhibits,4);assert.ok(p.interactive&&p.hero);
  assert.ok(p.width<=width+2,"Horizontal overflow "+p.width+" at "+width);
  await page.eval("document.querySelector('.hero').scrollIntoView()");
  await capture("taste-"+width);
  console.log("PASS layout width "+width+"; 4 works; images loaded; no overflow");
 }
 await page.send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await navigate(base+"/taste-lab/");
 assert.equal(await page.eval("document.querySelector('#active-mode').textContent"),"STANDARD / STANDARD");
 const invalid={...valid,privateEmail:"should-not-be-shared"};
 await run("document.querySelector('#taste-input').value="+JSON.stringify(JSON.stringify(invalid))+";document.querySelector('#validate-taste').click()");
 assert.equal(await page.eval("document.querySelector('#review').hidden"),true);
 assert.ok((await page.eval("document.querySelector('#status').textContent")).includes("定義されていない"));
 await run("document.querySelector('#taste-input').value="+JSON.stringify(JSON.stringify(valid))+";document.querySelector('#validate-taste').click()");
 assert.equal(await page.eval("document.querySelector('#review').hidden"),false);
 await run("document.querySelector('#confirm-taste').checked=true;document.querySelector('#apply-taste').click()");
 assert.equal(await page.eval("document.querySelector('#active-mode').textContent"),"TASTE / SYSTEM");
 assert.equal(await page.eval("document.querySelector('#exhibitions .exhibit:first-child').dataset.id"),"erabu-system");
 assert.equal(await page.eval("localStorage.getItem('sgp:adaptive-taste:v1')"),null);
 await page.eval("document.querySelector('#works').scrollIntoView()");
 await capture("taste-personalized-390");
 await run("document.querySelector('#works button[data-focus=design]').click()");
 assert.equal(await page.eval("document.querySelector('#exhibitions .exhibit:first-child').dataset.id"),"erabu-process");
 await run("document.querySelector('#taste-input').value="+JSON.stringify(JSON.stringify(valid))+";document.querySelector('#validate-taste').click();document.querySelector('#confirm-taste').checked=true;document.querySelector('#save-taste').checked=true;document.querySelector('#apply-taste').click()");
 assert.ok(await page.eval("!!localStorage.getItem('sgp:adaptive-taste:v1')"));
 await run("document.querySelector('#reset-taste').click()");
 assert.equal(await page.eval("localStorage.getItem('sgp:adaptive-taste:v1')"),null);
 assert.equal(await page.eval("document.querySelector('#active-mode').textContent"),"STANDARD / STANDARD");
 await navigate(base+"/taste-lab/");
 await page.send("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"Tab",code:"Tab",windowsVirtualKeyCode:9});
 await page.send("Input.dispatchKeyEvent",{type:"keyUp",key:"Tab",code:"Tab",windowsVirtualKeyCode:9});
 assert.equal(await page.eval("document.activeElement?.className"),"skip");
 await page.send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
 assert.equal(await page.eval("matchMedia('(prefers-reduced-motion: reduce)').matches"),true);
 assert.equal(await page.eval("getComputedStyle(document.documentElement).scrollBehavior"),"auto");
 const leaked=externalRequests.filter(url=>!url.startsWith(base)&&!url.startsWith("data:")&&!url.startsWith("about:"));
 assert.deepEqual(leaked,[],"External network request(s)");
 assert.deepEqual(pageErrors,[],"Unexpected browser errors");
 console.log("PASS interaction: invalid input, confirmed import, priority, focus, opt-in storage, reset, keyboard, reduced motion, zero third-party requests");
 console.log("PASS 6 screenshot artifacts");
}catch(e){console.error("BROWSER QA FAILED:",e.stack||e);process.exitCode=1}
finally{try{page?.close()}catch{}try{chrome?.kill()}catch{}try{await new Promise(ok=>http.close(ok))}catch{}try{if(tmp)await rm(tmp,{recursive:true,force:true})}catch{}}
