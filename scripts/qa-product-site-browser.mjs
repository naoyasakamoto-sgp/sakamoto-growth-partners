// Real headless Chrome QA for SGP Product Studio; Node 22 without browser npm dependencies.
import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {createServer} from "node:http";
import {readFile,mkdir,mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve,join,extname,sep} from "node:path";
import {setTimeout as sleep} from "node:timers/promises";
const root=process.cwd(),out=join(root,"qa","product-site"),browserErrors=[];
const mime={".html":"text/html",".css":"text/css",".js":"text/javascript",".mjs":"text/javascript",".svg":"image/svg+xml",".webp":"image/webp",".jpg":"image/jpeg"};
const server=createServer(async(req,res)=>{
 try{
  let path=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
  if(path.endsWith("/"))path+="index.html";
  const file=resolve(root,"."+path);
  if(!file.startsWith(root+sep))throw Error("outside repository");
  const bytes=await readFile(file);
  res.writeHead(200,{"Content-Type":mime[extname(file)]||"application/octet-stream","Cache-Control":"no-store"});res.end(bytes);
 }catch{res.writeHead(404);res.end("Not found")}
});
function chromePath(){
 for(const name of ["google-chrome","google-chrome-stable","chromium","chromium-browser"]){
  const p=spawnSync("which",[name],{encoding:"utf8"});
  if(p.status===0&&p.stdout.trim())return p.stdout.trim();
 }
 throw Error("Chrome unavailable");
}
class CDP{
 constructor(url){
  this.ws=new WebSocket(url);this.id=0;this.pending=new Map();this.listeners=[];
  this.ws.addEventListener("message",event=>{
   const d=JSON.parse(event.data);
   if(d.id&&this.pending.has(d.id)){
    const p=this.pending.get(d.id);clearTimeout(p.timer);this.pending.delete(d.id);
    d.error?p.reject(Error(JSON.stringify(d.error))):p.resolve(d.result||{});
   }else if(d.method)this.listeners.forEach(fn=>fn(d));
  });
 }
 async connect(){await new Promise((ok,no)=>{const timer=setTimeout(()=>no(Error("Chrome connect timeout")),12000);this.ws.addEventListener("open",()=>{clearTimeout(timer);ok()},{once:true});this.ws.addEventListener("error",()=>{clearTimeout(timer);no(Error("WebSocket error"))},{once:true})})}
 send(method,params={}){const id=++this.id;return new Promise((ok,no)=>{const timer=setTimeout(()=>{this.pending.delete(id);no(Error("CDP timeout "+method))},17000);this.pending.set(id,{resolve:ok,reject:no,timer});this.ws.send(JSON.stringify({id,method,params}))})}
 async eval(expression){const r=await this.send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result?.value}
 close(){this.ws.close()}
}
async function poll(fn,name,tries=70){for(let i=0;i<tries;i++){try{const value=await fn();if(value)return value}catch{}await sleep(180)}throw Error("Timeout "+name)}
const observe='(()=>{const images=[...document.images].map(i=>({ok:i.complete&&i.naturalWidth>0,src:i.getAttribute("src")}));const im=document.querySelector(".product-photo-frame img");const rect=im?.getBoundingClientRect();return {ready:document.readyState,width:document.documentElement.scrollWidth,h1:document.querySelectorAll("h1").length,images,photo:im?.naturalWidth>0,ratio:rect?rect.width/rect.height:null,intrinsic:im?.naturalHeight?im.naturalWidth/im.naturalHeight:null,tasteLink:!!document.querySelector("a[href=\\"/taste-lab/\\"]")}})()';
let page,chrome,tmp,origin;
async function navigate(path){
 await page.send("Page.navigate",{url:origin+path});
 await poll(()=>page.eval("document.readyState==='complete' && !!document.querySelector('main')"),"navigation "+path);
 await page.eval("document.querySelectorAll('img[loading=lazy]').forEach(i=>i.loading='eager')");
 await poll(async()=>{const v=await page.eval(observe);return v.images.every(i=>i.ok)},"media "+path,90);
}
async function capture(name,log=false){
 const r=await page.send("Page.captureScreenshot",{format:log?"jpeg":"png",quality:log?33:undefined,captureBeyondViewport:false});
 if(log){
  console.log("SGP_THUMB_BEGIN "+name);
  for(let i=0;i<r.data.length;i+=3800)console.log("SGP_THUMB_DATA "+r.data.slice(i,i+3800));
  console.log("SGP_THUMB_END "+name);
 }else await writeFile(join(out,name+".png"),Buffer.from(r.data,"base64"));
}
try{
 await mkdir(out,{recursive:true});
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 origin="http://127.0.0.1:"+server.address().port;
 tmp=await mkdtemp(join(tmpdir(),"sgp-product-"));
 chrome=spawn(chromePath(),["--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--no-first-run","--no-default-browser-check","--disable-background-networking","--remote-debugging-port=0","--user-data-dir="+tmp,"--window-size=1565,950","about:blank"],{stdio:"ignore"});
 const port=await poll(async()=>Number((await readFile(join(tmp,"DevToolsActivePort"),"utf8")).split("\n")[0]),"Chrome port",80);
 const websocket=await poll(async()=>{const t=await(await fetch("http://127.0.0.1:"+port+"/json/list")).json();return t.find(x=>x.type==="page")?.webSocketDebuggerUrl},"Chrome page");
 page=new CDP(websocket);await page.connect();
 page.listeners.push(event=>{if(event.method==="Runtime.exceptionThrown")browserErrors.push(event.params?.exceptionDetails?.exception?.description||event.params?.exceptionDetails?.text||"script error")});
 await page.send("Page.enable");await page.send("Runtime.enable");
 for(const width of [320,390,768,1280,1565]){
  await page.send("Emulation.setDeviceMetricsOverride",{width,height:width<500?844:950,deviceScaleFactor:1,mobile:width<500});
  await navigate("/");
  const v=await page.eval(observe);
  assert.equal(v.h1,1);assert.equal(v.tasteLink,false);
  assert.ok(v.width<=width+1,"Homepage horizontal overflow "+width+": "+v.width);
  assert.ok(v.photo,"ERABU original screen not loaded");
  assert.ok(v.images.some(i=>i.src==="/assets/erabu/source/erabu-three-choices-20261102.png"&&i.ok),"Experience must load the owner-provided three-choice screenshot at "+width+"px");
  assert.equal(v.images.some(i=>i.src==="/assets/erabu/source/sendai-ekimae-erabu-map.svg"),false,"The old map must not appear on the homepage");
  const choice=await page.eval("(()=>{const img=document.querySelector('#view-experience .visual-sheet img');const r=img?.getBoundingClientRect();return {src:img?.getAttribute('src'),width:img?.naturalWidth,height:img?.naturalHeight,displayRatio:r?r.width/r.height:null}})()");
  assert.equal(choice.width,1028);
  assert.equal(choice.height,747);
  assert.ok(Math.abs(choice.displayRatio-1028/747)<.02,"Experience screenshot is distorted at "+width+"px");
  assert.ok(Math.abs(v.ratio-v.intrinsic)<.015,"ERABU real screen is cropped at "+width);
  await page.eval("window.scrollTo({top:0,behavior:'instant'})");
  await capture("home-"+width);
  if(width===390||width===1280)await capture("home-"+width,true);
  console.log("PASS homepage "+width+": original ERABU screen ratio, no horizontal overflow");
 }
 await page.send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await navigate("/");
 await page.eval("document.querySelector('.mobile-menu summary').click()");
 assert.equal(await page.eval("document.querySelector('.mobile-menu').open"),true);
 await page.eval("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
 assert.equal(await page.eval("document.querySelector('.mobile-menu').open"),false);
 await page.eval("document.querySelector('#tab-technology').click()");
 assert.equal(await page.eval("document.querySelector('#tab-technology').getAttribute('aria-selected')"),"true");
 assert.equal(await page.eval("document.querySelector('#view-technology').hidden"),false);
 assert.equal(await page.eval("document.querySelector('#view-experience').hidden"),true);
 await page.eval("document.querySelector('#tab-technology').focus()");
 await page.send("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"ArrowRight",code:"ArrowRight",windowsVirtualKeyCode:39});
 await page.send("Input.dispatchKeyEvent",{type:"keyUp",key:"ArrowRight",code:"ArrowRight",windowsVirtualKeyCode:39});
 assert.equal(await page.eval("document.querySelector('#tab-development').getAttribute('aria-selected')"),"true");
 await page.eval("document.querySelector('#tab-technology').click();document.querySelector('#technology').scrollIntoView({behavior:'instant'})");
 await capture("technology-390");
 for(const width of [320,390,768,1280,1565]){
  await page.send("Emulation.setDeviceMetricsOverride",{width,height:width<500?844:950,deviceScaleFactor:1,mobile:width<500});
  for(const path of ["/products/","/products/erabu/","/engineering/"]){
   await navigate(path);
   const v=await page.eval(observe);
   assert.equal(v.h1,1,path+" H1");
   assert.ok(v.width<=width+1,path+" horizontal overflow at "+width+": "+v.width);
   assert.equal(v.tasteLink,false);
   if(width===390||width===1280){await page.eval("window.scrollTo({top:0,behavior:'instant'})");await capture(path.replaceAll("/","").replace("productserabu","erabu")+"-"+width)}
  }
  console.log("PASS new product and Engineering pages "+width);
 }
 await page.send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
 assert.equal(await page.eval("matchMedia('(prefers-reduced-motion: reduce)').matches"),true);
 assert.equal(await page.eval("getComputedStyle(document.documentElement).scrollBehavior"),"auto");
 assert.deepEqual(browserErrors,[],"JavaScript exceptions");
 console.log("SGP PRODUCT BROWSER QA SUCCESS");
}catch(e){console.error("SGP PRODUCT BROWSER QA FAILED",e.stack||e);process.exitCode=1}
finally{try{page?.close()}catch{}try{chrome?.kill()}catch{}try{await new Promise(ok=>server.close(ok))}catch{}try{if(tmp)await rm(tmp,{recursive:true,force:true})}catch{}}
