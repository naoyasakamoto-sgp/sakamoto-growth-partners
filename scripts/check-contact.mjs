import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(rootDir, relativePath), "utf8");

const html = await read("contact/index.html");
const clientScript = await read("assets/contact.js");
const attributionScript = await read("assets/lead-attribution.js");
const css = await read("assets/style.css");

assert.match(
  html,
  /<option value="business-improvement">業務改善・DX<\/option>/,
  "業務改善・DXの相談テーマが必要です。",
);
assert.match(
  html,
  /id="business-improvement-intake"[\s\S]*?aria-hidden="true"[\s\S]*?hidden/,
  "追加ヒアリングは初期状態で非表示にしてください。",
);
assert.equal(
  [...html.matchAll(/data-intake-question="[1-7]"/g)].length,
  7,
  "追加ヒアリングは7問必要です。",
);
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "Contactページのidは重複できません。");
for (const [, target] of html.matchAll(/<label\s+[^>]*for="([^"]+)"/g)) {
  assert.ok(ids.includes(target), `labelの参照先 #${target} が必要です。`);
}
for (const [, target] of html.matchAll(/aria-describedby="([^"]+)"/g)) {
  assert.ok(ids.includes(target), `aria-describedbyの参照先 #${target} が必要です。`);
}
for (const fieldName of [
  "improvementTarget",
  "currentMethods",
  "currentMethodOther",
  "stakeholders",
  "painPoints",
  "frequency",
  "desiredState",
  "currentTools",
  "business_improvement_intake",
  "lead_source",
  "lead_case",
  "lead_intent",
]) {
  assert.match(html, new RegExp(`name="${fieldName}"`), `${fieldName}が必要です。`);
}
assert.match(clientScript, /function updateTopicIntake\(/);
assert.match(clientScript, /function validateRequiredGroup\(/);
assert.match(clientScript, /interest\.addEventListener\("change"/);
assert.match(clientScript, /track\("contact_submit"/);
assert.match(clientScript, /lead_case === "my-jazz-day"/);
assert.match(attributionScript, /LEAD_CONTEXT_KEYS = \["source", "case", "intent"\]/);
assert.match(attributionScript, /leadContext\["lead_" \+ key\]/);
assert.match(attributionScript, /setField\(form, "lead_" \+ key, value\)/);
assert.doesNotMatch(
  clientScript,
  /intakeFields\([^)]*\)[\s\S]{0,300}\.value\s*=\s*["']{2}/,
  "テーマ切替時に入力値を消去しないでください。",
);
assert.match(css, /\.contact-intake\[hidden\]/);
assert.match(css, /@media \(max-width: 1100px\)[\s\S]*?\.contact-layout \{ grid-template-columns: 1fr; \}/);
assert.match(css, /@media \(max-width: 560px\)[\s\S]*?\.contact-option-grid \{ grid-template-columns: 1fr; \}/);

const functionSource = await read("netlify/functions/contact-submit.js");
const submissions = [];
const context = {
  exports: {},
  fetch: async (_url, options) => {
    submissions.push(new URLSearchParams(options.body));
    return { ok: true };
  },
  URLSearchParams,
  Set,
  Map,
  Object,
  String,
  JSON,
};
vm.runInNewContext(functionSource, context, {
  filename: "netlify/functions/contact-submit.js",
});
const handler = context.exports.handler;

function formBody(overrides = {}) {
  const values = {
    "form-name": "contact",
    interest: "business-improvement",
    name: "テスト担当者",
    email: "test@example.com",
    message: "業務改善について相談したいです。",
    privacy_agreed: "同意する",
    ...overrides,
  };
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) body.append(key, item);
  }
  return body.toString();
}

let requestNumber = 0;
async function submit(overrides) {
  requestNumber += 1;
  return handler({
    httpMethod: "POST",
    headers: {
      accept: "application/json",
      "x-nf-client-connection-ip": `192.0.2.${requestNumber}`,
    },
    body: formBody(overrides),
  });
}

const methodResponse = await handler({ httpMethod: "GET", headers: {} });
assert.equal(methodResponse.statusCode, 405);

const missingResponse = await submit();
assert.equal(missingResponse.statusCode, 400);
assert.deepEqual(
  Object.keys(JSON.parse(missingResponse.body).fields).sort(),
  ["currentMethods", "improvementTarget", "painPoints"].sort(),
);
assert.equal(submissions.length, 0, "検証エラー時はNetlify Formsへ転送しません。");

const minimumResponse = await submit({
  improvementTarget: "在庫管理",
  currentMethods: ["紙"],
  painPoints: ["転記作業が多い"],
  lead_source: "case-study",
  lead_case: "my-jazz-day",
  lead_intent: "decision-product",
});
assert.equal(minimumResponse.statusCode, 200);
let stored = submissions.at(-1);
assert.equal(stored.get("improvementTarget"), "在庫管理");
assert.equal(stored.get("currentMethods"), "紙");
assert.equal(stored.get("painPoints"), "転記作業が多い");
assert.match(stored.get("business_improvement_intake"), /【業務改善・DX 事前ヒアリング】/);
assert.equal(stored.get("lead_source"), "case-study");
assert.equal(stored.get("lead_case"), "my-jazz-day");
assert.equal(stored.get("lead_intent"), "decision-product");

const fullResponse = await submit({
  improvementTarget: "店舗間の在庫・顧客情報共有",
  currentMethods: ["Excel / スプレッドシート", "LINE / メール", "その他"],
  currentMethodOther: "紙の日報",
  stakeholders: ["経営者", "店長・管理者", "現場スタッフ"],
  painPoints: [
    "転記作業が多い",
    "ミス・確認漏れが起きる",
    "状況をリアルタイムで把握できない",
  ],
  frequency: "毎日",
  desiredState: "店舗入力を本部で即時確認したい",
  currentTools: "Excel、LINE",
});
assert.equal(fullResponse.statusCode, 200);
stored = submissions.at(-1);
assert.equal(
  stored.get("currentMethods"),
  "Excel / スプレッドシート\nLINE / メール\nその他",
);
assert.equal(stored.get("stakeholders"), "経営者\n店長・管理者\n現場スタッフ");
assert.match(stored.get("business_improvement_intake"), /■ 理想の状態\n店舗入力を本部で即時確認したい/);

const otherThemeResponse = await submit({
  interest: "ai",
  improvementTarget: "送信対象外",
  currentMethods: ["紙"],
  painPoints: ["作業に時間がかかる"],
});
assert.equal(otherThemeResponse.statusCode, 200);
stored = submissions.at(-1);
assert.equal(stored.has("improvementTarget"), false);
assert.equal(stored.has("business_improvement_intake"), false);

for (const theme of ["web-marketing", "system-development", "meo-line", "other"]) {
  const response = await submit({ interest: theme });
  assert.equal(response.statusCode, 200, `${theme}の既存送信を維持してください。`);
  stored = submissions.at(-1);
  assert.equal(stored.has("business_improvement_intake"), false);
}

console.log(
  "Validated Contact intake, MY JAZZ DAY attribution, click-safe analytics and Netlify Forms forwarding.",
);
