import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
test("Paused Taste route is unlinked and remains archived with noindex",async()=>{
 const home=await read("index.html"),lab=await read("taste-lab/index.html");
 assert.match(lab,/<meta name="robots" content="noindex,nofollow,noarchive">/);
 assert.doesNotMatch(home,/href="\/taste-lab\//);
 assert.match(lab,/\/assets\/sgp-wordmark-v2\.webp/);
 assert.match(lab,/<html lang="ja">/);
});
test("All declared local assets and runtime files exist",async()=>{
 for(const path of ["assets/sgp-wordmark-v2.webp","assets/case-studies/my-jazz-day/hero-mobile.webp","assets/erabu/source/sendai-erabu-main.svg","assets/erabu/source/sendai-ekimae-erabu-map.svg","assets/erabu/source/erabu-live-home-20261102.jpg","taste/engine.mjs","taste-lab/app.mjs","taste-lab/taste.css"]){
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
 assert.match(html,/erabu-live-home-20261102\.jpg/);
 assert.match(html,/sendai-ekimae-erabu-map\.svg/);
 assert.doesNotMatch(html,/class="paper paper-one"/);
 assert.match(html,/src\/lib\/cities\/decision-engine\.ts/);
});

test("Owner-approved A-G copy inventory is recorded and production remains gated",async()=>{
 const manifest=JSON.parse(await read("taste/copy-review.json"));
 assert.equal(manifest.releaseCopyStatus,"approved");
 assert.equal(manifest.approvedAt,"2026-11-02");
 assert.equal(manifest.approvalRecord.decision,"all_groups_approved");
 assert.equal(manifest.approvalRecord.corrections,"none");
 assert.equal(manifest.publishState,"paused_unpublished_2026-11-03");
 assert.equal(manifest.stagedRelease.homepageReplacement,false);
 assert.equal(manifest.stagedRelease.searchIndexing,"noindex");
 assert.equal(manifest.stagedRelease.publicationPaused,true);
 for(const letter of ["A","B","C","D","E","F","G"])assert.equal(manifest.approvalRecord.groups[letter].status,"approved");
 assert.equal(manifest.allNewUserFacingCopyRequiresExplicitApproval,true);
 assert.ok(manifest.groups.html_visible.length>30);
 assert.ok(manifest.groups.html_accessible.length>0);
 assert.ok(manifest.groups.external_ai_prompt.length>0);
});


function sortedUnique(values){return [...new Set(values)].sort()}
test("Release gate rejects new or modified page-visible copy unless owner approves it",async()=>{
 const manifest=JSON.parse(await read("taste/copy-review.json")),html=await read("taste-lab/index.html");
 const actual=sortedUnique([...html.matchAll(/>([^<>]+)</g)].map(m=>m[1].replace(/\s+/g," ").trim()).filter(s=>s.length>1&&s.length<180));
 const accessible=sortedUnique([...html.matchAll(/(?:aria-label|alt|placeholder)="([^"]+)"/g)].map(m=>m[1]));
 const placeholder=[...html.matchAll(/placeholder='([^']+)'/g)].map(m=>m[1]);
 assert.deepEqual(actual,manifest.groups.html_visible,"HTML visible wording changed without approval");
 assert.deepEqual(accessible,manifest.groups.html_accessible,"Accessible wording changed without approval");
 assert.deepEqual(placeholder,manifest.groups.html_placeholder,"Input placeholder changed without approval");
});
test("Release gate rejects new or modified AI prompt, error text and UI labels",async()=>{
 const manifest=JSON.parse(await read("taste/copy-review.json")),js=await read("taste-lab/app.mjs");
 const statuses=sortedUnique([...js.matchAll(/status\("([^"]+)"/g)].map(m=>m[1]));
 assert.deepEqual(statuses,manifest.groups.js_status,"Status copy changed without approval");
 const errorBlock=js.match(/const messages=\{([\s\S]*?)\n\};/)?.[1];
 assert.ok(errorBlock,"Error map was removed");
 const errors=sortedUnique([...errorBlock.matchAll(/^\s*\w+:"([^"]+)",?$/gm)].map(m=>m[1]));
 assert.deepEqual(errors,manifest.groups.js_error,"Error copy changed without approval");
 const promptBlock=js.match(/const prompt=\[([\s\S]*?)\]\.join\("\\n\\n"\);/)?.[1];
 assert.ok(promptBlock,"Prompt code was removed");
 const paragraphs=[...promptBlock.matchAll(/^"([^"]+)",?$/gm)].map(m=>m[1]);
 assert.deepEqual(paragraphs,manifest.groups.js_prompt_paragraphs,"AI prompt changed without approval");
 const editorBlock=js.match(/const experienceNames=\{([^}]+)\}/)?.[1];
 assert.ok(editorBlock,"Experience labels were removed");
 const labels=sortedUnique([...editorBlock.matchAll(/:\s*"([^"]+)"/g)].map(m=>m[1]));
 assert.deepEqual(labels,manifest.groups.js_editor_labels,"Experience labels changed without approval");
 const computed=sortedUnique([...js.matchAll(/\.textContent="([^"]+)"/g)].map(m=>m[1]));
 assert.deepEqual(computed,manifest.groups.js_action_labels,"Dynamic display text changed without approval");
});
test("F-09 approved JSON template matches the active engine schema",async()=>{
 const {emptyWebTaste,parseTasteInput,WEB_SCHEMA}=await import("./engine.mjs");
 const profile=emptyWebTaste();
 assert.equal(profile.schema,WEB_SCHEMA);
 assert.deepEqual(Object.keys(profile),["schema","interests","experience","confidence"]);
 assert.deepEqual(Object.keys(profile.interests),["products","design","engineering","business"]);
 assert.deepEqual(Object.keys(profile.experience),["density","navigation","evidence","interaction","discovery"]);
 assert.deepEqual(Object.keys(profile.confidence),["products","design","engineering","business"]);
 assert.equal(parseTasteInput(JSON.stringify(profile)).ok,true);
});

test("Site artifact excludes paused Taste runtime and dependent screenshots",async()=>{
 const workflow=await read(".github/workflows/deploy-pages.yml");
 for(const exclude of ["taste-lab/","taste/","assets/erabu/source/"]){
  assert.ok(workflow.includes("--exclude '"+exclude+"'"),"Paused path leaked into published artifact: "+exclude);
 }
});
