import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = String(process.argv[2] || "").replace(/\/$/, "");
if (!/^https:\/\/[a-z0-9.-]+$/i.test(baseUrl)) {
  throw new Error("Usage: node scripts/check-deploy.mjs https://deploy-host");
}

const sitemap = await readFile(path.join(rootDir, "sitemap.xml"), "utf8");
const pagePaths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((match) => new URL(match[1]).pathname);
const assetPaths = [
  "/assets/style.css",
  "/assets/site-analytics.js",
  "/assets/contact.js",
  "/assets/lead-attribution.js",
  "/news/news.css",
  "/insights/insights.css",
  "/insights/insights.js",
  "/works/works.css",
  "/works/works.js",
  "/products/my-home-plan/my-home-plan.css",
  "/products/my-home-plan/app.js",
  "/products/my-home-plan/plans.js",
  "/case-studies/case-study.css",
  "/assets/case-studies/my-jazz-day/hero-mobile.webp",
  "/assets/case-studies/my-jazz-day/question-taste.webp",
  "/assets/case-studies/my-jazz-day/question-time-area.webp",
  "/assets/case-studies/my-jazz-day/jazz-map.webp",
  "/assets/case-studies/my-jazz-day/pwa-navigator.webp",
  "/assets/case-studies/my-jazz-day/og-my-jazz-day.webp",
];

async function request(pathName) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    headers: { "user-agent": "SGP-Deploy-QA/1.0" },
    signal: AbortSignal.timeout(20000),
  });
  const buffer = await response.arrayBuffer();
  if (response.status !== 200) throw new Error(`${response.status} ${pathName}`);
  if (!buffer.byteLength) throw new Error(`Empty response ${pathName}`);
  return {
    path: pathName,
    bytes: buffer.byteLength,
    contentType: response.headers.get("content-type") || "",
    text: response.headers.get("content-type")?.includes("text/html")
      ? new TextDecoder().decode(buffer)
      : "",
  };
}

const results = await Promise.all([...pagePaths, ...assetPaths].map(request));
const resultFor = (pathName) => results.find((result) => result.path === pathName);
for (const pathName of [
  "/",
  "/insights/",
  "/insights/ai-business-tasks/",
  "/insights/excel-to-system/",
  "/insights/owner-dependency/",
  "/works/",
  "/works/sendai-erabu/",
  "/case-studies/",
  "/case-studies/my-jazz-day/",
  "/news/sendai-erabu-my-jazz-day-2026/",
  "/contact/",
  "/products/my-home-plan/",
]) {
  const html = resultFor(pathName).text;
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1] || "";
  const canonical = html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1] || "";
  const h1Count = [...html.matchAll(/<h1\b/gi)].length;
  const gaCount = [...html.matchAll(/googletagmanager\.com\/gtag\/js/gi)].length;
  if (!title || !canonical || h1Count !== 1 || gaCount !== 1) {
    throw new Error(`${pathName}: title=${Boolean(title)} canonical=${Boolean(canonical)} h1=${h1Count} ga=${gaCount}`);
  }
  console.log(`${pathName}\tH1=${h1Count}\tGA=${gaCount}\t${title}`);
}

for (const pathName of assetPaths.filter((item) => item.endsWith(".webp"))) {
  if (!resultFor(pathName).contentType.includes("image/webp")) {
    throw new Error(`${pathName}: expected image/webp, received ${resultFor(pathName).contentType}`);
  }
}

const functionResponse = await fetch(`${baseUrl}/.netlify/functions/contact-submit`, {
  headers: { "user-agent": "SGP-Deploy-QA/1.0" },
  signal: AbortSignal.timeout(20000),
});
if (functionResponse.status !== 405) {
  throw new Error(`Contact Function GET guard: expected 405, received ${functionResponse.status}`);
}

const diagnosisFunctionResponse = await fetch(`${baseUrl}/.netlify/functions/diagnosis-submit`, {
  headers: { "user-agent": "SGP-Deploy-QA/1.0" },
  signal: AbortSignal.timeout(20000),
});
if (diagnosisFunctionResponse.status !== 405) {
  throw new Error(`Diagnosis Function GET guard: expected 405, received ${diagnosisFunctionResponse.status}`);
}

console.log(`Deployment HTTP checks passed: ${pagePaths.length} sitemap URLs and ${assetPaths.length} assets returned 200; both Function GET guards returned 405.`);
