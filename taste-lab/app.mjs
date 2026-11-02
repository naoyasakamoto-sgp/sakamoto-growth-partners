import { WEB_SCHEMA,INTERESTS,EXPERIENCE_FIELDS,emptyWebTaste,parseTasteInput,amendWebTaste,planExperience,exportWebTaste,loadSavedTaste,persistTaste,forgetTaste } from "/taste/engine.mjs";

const $=id=>document.getElementById(id);
const state={active:emptyWebTaste(),candidate:null,focus:null,source:"manual",domainTaste:null};
const getStorage=()=>{try{return window.localStorage}catch{return null}};
const names={products:"Products",design:"Design",engineering:"Engineering",business:"Business"};
const experienceNames={density:"density",navigation:"navigation",evidence:"evidence",interaction:"interaction",discovery:"discovery"};
const messages={
 empty:"JSONを入力するか、ファイルを選択してください。",
 invalid_json:"JSONの構文を確認してください。",
 too_large:"JSONのサイズが上限を超えています。",
 schema_mismatch:"Tasteのスキーマが一致しません。",
 unexpected_field:"定義されていない項目があります。会話内容や個人情報を含めないでください。",
 invalid_interests:"関心の項目が不足しています。",
 invalid_experience:"閲覧の設定が不足しています。",
 invalid_confidence:"信頼度の値が正しくありません。",
 invalid_score:"関心の値は0〜3、またはnullにしてください。",
 invalid_experience_value:"指定外の閲覧設定があります。",
 missing_erabu_axes:"ERABU Tasteの12軸が不足しています。",
 invalid_erabu:"ERABU Tasteの形式が正しくありません。",
 invalid_root:"JSONはオブジェクト形式にしてください。",
 not_text:"テキストを入力してください。"
};
const status=(message,isError=false)=>{const node=$("status");node.textContent=message;node.classList.toggle("error",isError)};
const prompt=[
"あなたが実際にアクセスできる私との会話や明示的な好みだけを根拠に、私のWebサイト閲覧のTasteを整理してください。",
"知らないことは推測で埋めずnullまたはunknownにしてください。会話の引用や自由記述は出力しないでください。",
"氏名・所在地・メール・健康・宗教・政治・家族・仕事の機密情報などを含めないでください。",
"用途はSGPのWebサイト上で、本人の確認後に作品の表示順や閲覧方法を変えることです。",
"interestsは各0（関心が低い）〜3（関心が高い）、根拠がなければnullです。",
"confidenceはexplicit（本人が明言）、inferred（根拠からの推定）、unknown（不明）です。",
"density=low|balanced|detailed|unknown, navigation=explore|guided|unknown, evidence=actual_ui|diagrams|process|unknown, interaction=observe|participate|unknown, discovery=low|balanced|high|unknown。",
"以下の完全な構造と値以外を出力しないでください。コードブロックも説明文も不要です。",
JSON.stringify(emptyWebTaste(),null,2)
].join("\n\n");
$("prompt-content").textContent=prompt;

function makeOption(value,label){const option=document.createElement("option");option.value=value;option.textContent=label;return option}
function createEditors(profile){
 const interestEditors=$("interest-editors");interestEditors.replaceChildren();
 for(const key of INTERESTS){
  const row=document.createElement("div");row.className="interest-editor";
  const label=document.createElement("label");label.htmlFor="interest-"+key;label.textContent=names[key];
  const select=document.createElement("select");select.id="interest-"+key;select.name=key;
  select.append(makeOption("unknown","unknown"));
  for(let n=0;n<=3;n++)select.append(makeOption(String(n),String(n)));
  select.value=profile.interests[key]===null?"unknown":String(profile.interests[key]);
  select.setAttribute("aria-label",names[key]+" 0〜3 / unknown");
  const output=document.createElement("output");output.htmlFor=select.id;output.textContent=select.value==="unknown"?"—":select.value;
  select.addEventListener("change",()=>{
   output.textContent=select.value==="unknown"?"—":select.value;
   const confidence={...state.candidate.confidence,[key]:select.value==="unknown"?"unknown":"explicit"};
   const interests={...state.candidate.interests,[key]:select.value==="unknown"?null:Number(select.value)};
   state.candidate=amendWebTaste(state.candidate,{interests,confidence});
  });
  row.append(label,select,output);interestEditors.append(row);
 }
 const container=$("experience-editors");container.replaceChildren();
 for(const [key,choices] of Object.entries(EXPERIENCE_FIELDS)){
  const row=document.createElement("div");row.className="experience-editor";
  const label=document.createElement("label");label.htmlFor="exp-"+key;label.textContent=experienceNames[key];
  const select=document.createElement("select");select.id="exp-"+key;
  for(const value of choices)select.append(makeOption(value,value));
  select.value=profile.experience[key];select.addEventListener("change",()=>{
   state.candidate=amendWebTaste(state.candidate,{experience:{[key]:select.value}});
  });
  row.append(label,select);container.append(row);
 }
}
function showReview(profile,source){
 state.candidate=profile;state.source=source;
 $("profile-empty").hidden=true;$("review").hidden=false;
 $("review-kind").textContent="Web Taste";
 $("review-source").textContent=source;
 $("confirm-taste").checked=false;$("save-taste").checked=false;
 createEditors(profile);
 status("内容を確認・修正してから反映してください。");
}
function importJson(raw,source="AI / JSON"){
 const result=parseTasteInput(raw);
 if(!result.ok){status(messages[result.code]||"Tasteを読み込めませんでした。",true);return false}
 if(result.kind==="erabu"){
  state.domainTaste=result.domainTaste;
  $("review").hidden=true;$("profile-empty").hidden=false;
  status("ERABUの12軸を検証しました。Web閲覧用Tasteとは別のため、ホームページは変更されません。");
  return true;
 }
 state.domainTaste=null;showReview(result.profile,source);return true;
}
$("validate-taste").addEventListener("click",()=>importJson($("taste-input").value));
$("taste-file").addEventListener("change",async event=>{
 const file=event.target.files?.[0];if(!file)return;
 if(file.size>12000){status(messages.too_large,true);event.target.value="";return}
 try{$("taste-input").value=await file.text();importJson($("taste-input").value,"JSON File")}
 catch{status("JSONファイルを読み込めません。",true)}
 event.target.value="";
});
$("copy-prompt").addEventListener("click",async()=>{
 try{await navigator.clipboard.writeText(prompt);status("Promptをコピーしました。")}
 catch{const range=document.createRange();range.selectNodeContents($("prompt-content"));window.getSelection()?.removeAllRanges();window.getSelection()?.addRange(range);status("テキストを選択しました。コピーしてください。")}
});
$("apply-taste").addEventListener("click",()=>{
 if(!state.candidate){status("Tasteを読み込んでください。",true);return}
 if(!$("confirm-taste").checked){status("反映する前に内容を確認してください。",true);$("confirm-taste").focus();return}
 state.active=structuredClone(state.candidate);state.focus=null;
 const storage=getStorage();
 if($("save-taste").checked){
  try{if(!storage)throw Error();persistTaste(storage,state.active)}
  catch{status("反映しました。端末への保存はできませんでした。",true);renderExperience();return}
 }else if(storage)forgetTaste(storage);
 transitionExperience();status("Tasteを反映しました。いつでもResetできます。");
 $("works").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
});
$("reset-taste").addEventListener("click",()=>{
 state.active=emptyWebTaste();state.candidate=null;state.focus=null;state.domainTaste=null;
 $("taste-input").value="";$("review").hidden=true;$("profile-empty").hidden=false;
 const storage=getStorage();if(storage)forgetTaste(storage);
 transitionExperience();status("標準表示に戻しました。保存されていたTasteも削除しました。")
});
$("forget-taste").addEventListener("click",()=>{
 const storage=getStorage();if(storage)forgetTaste(storage);
 state.active=emptyWebTaste();state.candidate=null;state.focus=null;state.domainTaste=null;
 $("review").hidden=true;$("profile-empty").hidden=false;$("taste-input").value="";
 transitionExperience();status("Tasteを削除しました。標準表示に戻りました。")
});
$("export-taste").addEventListener("click",()=>{
 if(!state.candidate)return;
 const blob=new Blob([exportWebTaste(state.candidate)],{type:"application/json"});
 const url=URL.createObjectURL(blob);const a=document.createElement("a");
 a.href=url;a.download="sgp-web-taste.json";document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
 status("TasteをJSONファイルに書き出しました。");
});
$("taste-open").addEventListener("click",()=>$("taste-panel").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"}));
document.querySelectorAll("button.focus").forEach(button=>button.addEventListener("click",()=>{
 const key=button.dataset.focus;
 state.focus=state.focus===key?null:key;
 transitionExperience();
}));
function drawTasteShape(profile,focus){
 const values=INTERESTS.map(key=>focus?(focus===key?3:0):profile.interests[key]??1.5);
 const distance=value=>55+value*48;
 const coordinates=[
 [300,270-distance(values[0])],[300+distance(values[1]),270],
 [300,270+distance(values[2])],[300-distance(values[3]),270]
 ];
 const path="M"+coordinates.map(p=>p.map(x=>Math.round(x)).join(" ")).join(" L")+" Z";
 $("taste-shape").setAttribute("d",path);
 INTERESTS.forEach((key,index)=>{
  const point=$("point-"+key);point.setAttribute("cx",coordinates[index][0]);point.setAttribute("cy",coordinates[index][1]);
 });
}
function renderExperience(){
 const plan=planExperience(state.active,{focus:state.focus});
 const grid=$("exhibitions");
 grid.dataset.view=plan.view;
 document.body.dataset.view=plan.view;
 document.body.dataset.density=state.active.experience.density;
 for(const [position,id] of plan.orderedIds.entries()){
  const card=grid.querySelector('[data-id="'+id+'"]');
  if(!card)continue;
  card.style.order=String(position);card.classList.toggle("spotlight",position===0);card.classList.toggle("companion",position===1);grid.append(card);
  if(plan.discovery===id)card.dataset.discovery="true";else delete card.dataset.discovery;
 }
 document.querySelectorAll("button.focus").forEach(button=>button.setAttribute("aria-pressed",String(state.focus===button.dataset.focus)));
 $("active-mode").textContent=(plan.personalized?"TASTE / ":"STANDARD / ")+plan.view.toUpperCase();
 $("adapt-reason").textContent=plan.focus?"FOCUS / "+names[plan.focus]:(plan.personalized?"TASTE / "+plan.orderedIds[0]:"STANDARD");
 drawTasteShape(state.active,state.focus);
}
function transitionExperience(){
 const reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
 if(!reduce&&typeof document.startViewTransition==="function"){
  const transition=document.startViewTransition(()=>renderExperience());
  // Rapid input, navigation or a second update can cancel the visual animation.
  // Cancellation is expected: the DOM update is still applied.
  void transition.ready.catch(()=>{});
  void transition.finished.catch(()=>{renderExperience()});
 }else renderExperience();
}
const saved=loadSavedTaste(getStorage()||{getItem:()=>null});
if(saved){state.active=saved;status("保存されたTasteをこのブラウザーから読み込みました。")}
renderExperience();
