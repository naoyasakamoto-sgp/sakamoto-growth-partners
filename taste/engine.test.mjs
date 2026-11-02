import {test} from "node:test";
import assert from "node:assert/strict";
import {WEB_SCHEMA,ERABU_SCHEMA,ERABU_AXES,EXHIBITS,STORAGE_KEY,emptyWebTaste,parseTasteInput,amendWebTaste,planExperience,exportWebTaste,persistTaste,loadSavedTaste,forgetTaste} from "./engine.mjs";
const makeProfile=()=>amendWebTaste(emptyWebTaste(),{interests:{products:3,design:2},confidence:{products:"explicit",design:"inferred"},experience:{density:"low",navigation:"explore",evidence:"actual_ui",interaction:"participate",discovery:"balanced"}});
test("default profile is privacy-neutral and non-personalized",()=>{
 const p=emptyWebTaste();assert.equal(p.schema,WEB_SCHEMA);
 assert.ok(Object.values(p.interests).every(value=>value===null));
 const plan=planExperience(p);assert.equal(plan.personalized,false);assert.equal(plan.view,"standard");assert.equal(plan.orderedIds.length,EXHIBITS.length);
});
test("Web Taste round-trip excludes all non-schema fields",()=>{
 const p=makeProfile();const input=exportWebTaste(p);
 const result=parseTasteInput(input);assert.equal(result.ok,true);assert.equal(result.kind,"web");assert.deepEqual(result.profile,p);
 assert.deepEqual(Object.keys(result.profile),["schema","interests","experience","confidence"]);
});
test("copying fenced AI JSON is accepted but never executed",()=>{
 const p=makeProfile();const fence=String.fromCharCode(96).repeat(3);
 const r=parseTasteInput(fence+"json\n"+JSON.stringify(p)+"\n"+fence);
 assert.equal(r.ok,true);assert.deepEqual(r.profile,p);
});
test("rejects malformed and oversized input",()=>{
 for(const text of ["", "{", "[]", "null", " ".repeat(12001)]){
  const r=parseTasteInput(text);assert.equal(r.ok,false,text);
 }
});
test("rejects unknown root or nested data, including personal information",()=>{
 const p=makeProfile();p.name="Example";assert.equal(parseTasteInput(JSON.stringify(p)).ok,false);
 const q=makeProfile();q.experience.identity="private";assert.equal(parseTasteInput(JSON.stringify(q)).ok,false);
 const v=JSON.stringify(makeProfile()).replace('"interests":{','"interests":{"__proto__":{"admin":true},');
 assert.equal(parseTasteInput(v).ok,false);
});
test("rejects incorrect scores and enums",()=>{
 for(const score of [-1,3.7,4,"3",{},true]){
  const p=makeProfile();p.interests.design=score;assert.equal(parseTasteInput(JSON.stringify(p)).ok,false);
 }
 for(const value of ["fast","<script>alert(1)</script>",null]){
  const p=makeProfile();p.experience.density=value;assert.equal(parseTasteInput(JSON.stringify(p)).ok,false);
 }
});
test("ERABU source requires all 12 axes and is kept separate from Web Taste",()=>{
 const valid={schema:ERABU_SCHEMA,taste:Object.fromEntries(ERABU_AXES.map(k=>[k,50])),contexts:{solo:{social:10}},confidence:{overall:.4}};
 const result=parseTasteInput(JSON.stringify(valid));
 assert.equal(result.ok,true);assert.equal(result.kind,"erabu");assert.equal(Object.keys(result.domainTaste).length,12);
 assert.equal(result.profile,undefined);
 delete valid.taste.night;assert.equal(parseTasteInput(JSON.stringify(valid)).ok,false);
});
test("explicit current focus overrides historical Taste",()=>{
 const p=amendWebTaste(makeProfile(),{interests:{products:3,engineering:0,design:2}});
 const normal=planExperience(p);
 const focused=planExperience(p,{focus:"engineering"});
 assert.notDeepEqual(normal.orderedIds,focused.orderedIds);
 assert.equal(focused.orderedIds[0],"erabu-system");
 assert.equal(focused.explicitFocus??focused.focus,"engineering");
});
test("all content remains accessible; results are deterministic and discovery may be disabled",()=>{
 const p=makeProfile();
 const first=planExperience(p),again=planExperience(p);
 assert.deepEqual(first,again);
 assert.equal(new Set(first.orderedIds).size,EXHIBITS.length);
 assert.deepEqual([...first.orderedIds].sort(),EXHIBITS.map(x=>x.id).sort());
 assert.equal(planExperience(amendWebTaste(p,{experience:{discovery:"low"}})).discovery,null);
});
test("invalid or missing Taste leaves the site in standard mode",()=>{
 const bad={...emptyWebTaste(),schema:"unknown"};
 const result=planExperience(bad);
 assert.equal(result.personalized,false);
 assert.equal(result.view,"standard");
});
test("storage only records explicitly saved whitelisted Taste; delete works",()=>{
 const memory=new Map();
 const storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
 assert.equal(loadSavedTaste(storage),null);
 const p=makeProfile();persistTaste(storage,p);assert.equal(memory.has(STORAGE_KEY),true);
 assert.deepEqual(loadSavedTaste(storage),p);
 forgetTaste(storage);assert.equal(loadSavedTaste(storage),null);
});
test("blocked storage never breaks the experience",()=>{
 const blocked={getItem(){throw Error("denied")},removeItem(){throw Error("denied")}};
 assert.equal(loadSavedTaste(blocked),null);
 assert.doesNotThrow(()=>forgetTaste(blocked));
});
