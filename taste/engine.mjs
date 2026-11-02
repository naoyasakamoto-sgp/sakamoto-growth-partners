// SGP Taste: strict, deterministic, client-only; external AI data is never executable.
export const WEB_SCHEMA="sgp-web-taste@1", ERABU_SCHEMA="erabu-ai-taste-seed@1", STORAGE_KEY="sgp:adaptive-taste:v1";
export const INTERESTS=["products","design","engineering","business"];
export const EXPERIENCE_FIELDS={density:["low","balanced","detailed","unknown"],navigation:["explore","guided","unknown"],evidence:["actual_ui","diagrams","process","unknown"],interaction:["observe","participate","unknown"],discovery:["low","balanced","high","unknown"]};
export const ERABU_AXES=["stimulation","density","social","discovery","aesthetic","nature","culture","novelty","activity","locality","spontaneity","night"];
export const EXHIBITS=[
{id:"erabu-live",type:"live",interests:{products:3,design:1,engineering:1,business:1},evidence:"actual_ui",editorial:4},
{id:"erabu-process",type:"process",interests:{products:1,design:3,engineering:1,business:0},evidence:"process",editorial:2},
{id:"erabu-system",type:"system",interests:{products:1,design:1,engineering:3,business:1},evidence:"diagrams",editorial:3},
{id:"my-jazz-day",type:"case",interests:{products:2,design:2,engineering:1,business:0},evidence:"actual_ui",editorial:1}
];
function isRecord(x){return x!==null&&typeof x==="object"&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype}
function keysOK(x,allowed){return Object.keys(x).every(key=>allowed.includes(key))}
function bad(code){return {ok:false,code}}
export function emptyWebTaste(){return {schema:WEB_SCHEMA,interests:{products:null,design:null,engineering:null,business:null},experience:{density:"unknown",navigation:"unknown",evidence:"unknown",interaction:"unknown",discovery:"unknown"},confidence:{products:"unknown",design:"unknown",engineering:"unknown",business:"unknown"}}}
export function parseTasteInput(raw){
 if(typeof raw!=="string")return bad("not_text");
 if(raw.length>12000)return bad("too_large");
 let source=raw.trim().replace(/^\uFEFF/,"");
 if(!source)return bad("empty");
 const fence=String.fromCharCode(96).repeat(3);
 if(source.startsWith(fence)){source=source.replace(new RegExp("^"+fence+"(?:json)?\\s*","i"),"").replace(new RegExp("\\s*"+fence+"$"),"").trim()}
 let value;try{value=JSON.parse(source)}catch{return bad("invalid_json")}
 if(!isRecord(value))return bad("invalid_root");
 if(value.schema===ERABU_SCHEMA){
  if(!keysOK(value,["schema","taste","contexts","confidence"])||!isRecord(value.taste)||!keysOK(value.taste,ERABU_AXES))return bad("invalid_erabu");
  if(!ERABU_AXES.every(k=>Number.isInteger(value.taste[k])&&value.taste[k]>=0&&value.taste[k]<=100))return bad("missing_erabu_axes");
  return {ok:true,kind:"erabu",domainTaste:Object.fromEntries(ERABU_AXES.map(k=>[k,value.taste[k]]))};
 }
 if(value.schema!==WEB_SCHEMA)return bad("schema_mismatch");
 if(!keysOK(value,["schema","interests","experience","confidence"]))return bad("unexpected_field");
 if(!isRecord(value.interests)||!keysOK(value.interests,INTERESTS)||!INTERESTS.every(k=>Object.hasOwn(value.interests,k)))return bad("invalid_interests");
 if(!isRecord(value.experience)||!keysOK(value.experience,Object.keys(EXPERIENCE_FIELDS))||!Object.keys(EXPERIENCE_FIELDS).every(k=>Object.hasOwn(value.experience,k)))return bad("invalid_experience");
 if(!isRecord(value.confidence)||!keysOK(value.confidence,INTERESTS))return bad("invalid_confidence");
 for(const key of INTERESTS){
  const score=value.interests[key];
  if(score!==null&&(!Number.isInteger(score)||score<0||score>3))return bad("invalid_score");
  if(!["explicit","inferred","unknown"].includes(value.confidence[key]??"unknown"))return bad("invalid_confidence");
 }
 for(const [key,values] of Object.entries(EXPERIENCE_FIELDS))if(!values.includes(value.experience[key]))return bad("invalid_experience_value");
 return {ok:true,kind:"web",profile:{
  schema:WEB_SCHEMA,
  interests:Object.fromEntries(INTERESTS.map(k=>[k,value.interests[k]])),
  experience:Object.fromEntries(Object.keys(EXPERIENCE_FIELDS).map(k=>[k,value.experience[k]])),
  confidence:Object.fromEntries(INTERESTS.map(k=>[k,value.confidence[k]??"unknown"]))
 }};
}
export function amendWebTaste(profile,changes){
 const candidate={schema:WEB_SCHEMA,interests:{...profile.interests,...(changes?.interests??{})},experience:{...profile.experience,...(changes?.experience??{})},confidence:{...profile.confidence,...(changes?.confidence??{})}};
 const p=parseTasteInput(JSON.stringify(candidate));if(!p.ok||p.kind!=="web")throw Error("Invalid Taste update");return p.profile
}
export function planExperience(profile=emptyWebTaste(),options={}){
 const result=parseTasteInput(JSON.stringify(profile)),safe=result.ok&&result.kind==="web"?result.profile:emptyWebTaste();
 const focus=INTERESTS.includes(options.focus)?options.focus:null;
 const value=k=>focus?(focus===k?3:0):(safe.interests[k]??0);
 const ranked=EXHIBITS.map(item=>{
  const similarity=INTERESTS.reduce((sum,k)=>sum+value(k)*item.interests[k],0);
  const bonus=item.evidence===safe.experience.evidence?2:0;
  const certainty=INTERESTS.reduce((sum,k)=>sum+(safe.confidence[k]==="explicit"?.2:0)*value(k)*item.interests[k],0);
  return {...item,score:similarity*4+bonus+certainty+item.editorial}
 }).sort((a,b)=>b.score-a.score||EXHIBITS.findIndex(x=>x.id===a.id)-EXHIBITS.findIndex(x=>x.id===b.id));
 const personalized=Boolean(focus||INTERESTS.some(k=>safe.interests[k]!==null));
 const view=!personalized?"standard":safe.experience.evidence==="process"?"process":safe.experience.evidence==="diagrams"?"system":safe.experience.navigation==="guided"?"guided":"gallery";
 const discovery=safe.experience.discovery==="low"?null:(ranked.find((x,i)=>i>0&&x.type!==ranked[0].type)?.id??null);
 return {ranked,orderedIds:ranked.map(x=>x.id),view,discovery,personalized,focus}
}
export function exportWebTaste(profile){
 const r=parseTasteInput(JSON.stringify(profile));if(!r.ok||r.kind!=="web")throw Error("Invalid profile");return JSON.stringify(r.profile,null,2)
}
export function loadSavedTaste(storage){try{const raw=storage.getItem(STORAGE_KEY);const r=raw?parseTasteInput(raw):null;return r?.ok&&r.kind==="web"?r.profile:null}catch{return null}}
export function persistTaste(storage,profile){storage.setItem(STORAGE_KEY,exportWebTaste(profile))}
export function forgetTaste(storage){try{storage.removeItem(STORAGE_KEY)}catch{}}
