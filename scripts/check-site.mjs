import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newsItems } from "../news/news-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const siteUrl = "https://sakamoto-growth-partners.com";
const failures = [];

const fail = (message) => failures.push(message);
const read = (relativePath) => readFile(path.join(rootDir, relativePath), "utf8");
const readBinary = (relativePath) => readFile(path.join(rootDir, relativePath));

async function checkWebpIntegrity(relativePath) {
  let buffer;
  try {
    buffer = await readBinary(relativePath);
  } catch {
    fail(`${relativePath}: file missing`);
    return;
  }
  if (buffer.length < 20) {
    fail(`${relativePath}: WebP file too small`);
    return;
  }
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    fail(`${relativePath}: invalid RIFF/WEBP signature`);
    return;
  }
  const declaredTotal = buffer.readUInt32LE(4) + 8;
  if (declaredTotal !== buffer.length) {
    fail(`${relativePath}: truncated WebP (declared ${declaredTotal} bytes, actual ${buffer.length})`);
  }
}

function hasSiteHref(html, href) {
  const clean = href.replace(/^\//, "");
  return html.includes(`href="/${clean}`) || html.includes(`href="${clean}`);
}

function count(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function metaContent(html, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta\\s+(?:[^>]*?\\s)?(?:name|property)=["']${escaped}["'][^>]*?content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta\\s+(?:[^>]*?\\s)?content=["']([^"']*)["'][^>]*?(?:name|property)=["']${escaped}["'][^>]*>`, "i")
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function canonical(html) {
  return html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1]
    ?? "";
}

function schemaTypes(value, result = []) {
  if (!value || typeof value !== "object") return result;
  if (typeof value["@type"] === "string") result.push(value["@type"]);
  for (const nested of Object.values(value)) schemaTypes(nested, result);
  return result;
}

function parseSchemas(html, pagePath) {
  const scripts = [...html.matchAll(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)];
  const parsed = [];
  for (const [, source] of scripts) {
    try {
      parsed.push(JSON.parse(source));
    } catch (error) {
      fail(`${pagePath}: invalid JSON-LD (${error.message})`);
    }
  }
  return parsed;
}

function htmlPathForUrl(href) {
  const url = new URL(href, `${siteUrl}/`);
  if (url.origin !== siteUrl) return null;
  const cleanPath = url.pathname.replace(/^\//, "");
  if (!cleanPath) return "index.html";
  if (path.extname(cleanPath)) return cleanPath;
  return path.join(cleanPath, "index.html");
}

async function checkInternalLinks(html, pagePath) {
  for (const [, href] of html.matchAll(/<a\s+[^>]*href=["']([^"']+)["']/gi)) {
    if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#")) continue;
    const targetPath = htmlPathForUrl(href);
    if (!targetPath) continue;
    try {
      await access(path.join(rootDir, targetPath));
    } catch {
      fail(`${pagePath}: broken internal link ${href} -> ${targetPath}`);
      continue;
    }
    const hash = new URL(href, `${siteUrl}/`).hash.slice(1);
    if (hash) {
      const target = await read(targetPath);
      if (!new RegExp(`\\bid=["']${hash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(target)) {
        fail(`${pagePath}: missing fragment target ${href}`);
      }
    }
  }
}

async function checkPage(relativePath, expected) {
  let html;
  try {
    html = await read(relativePath);
  } catch {
    fail(`${relativePath}: file missing`);
    return;
  }
  if (count(html, /<h1\b/gi) !== 1) fail(`${relativePath}: expected exactly one H1`);
  if (!/<html\s+lang=["']ja["']/i.test(html)) fail(`${relativePath}: lang must be ja`);
  if (/noindex/i.test(metaContent(html, "robots"))) fail(`${relativePath}: unexpected noindex`);
  if (!/<title>[^<]+<\/title>/i.test(html)) fail(`${relativePath}: missing title`);
  if (!metaContent(html, "description")) fail(`${relativePath}: missing description`);
  if (canonical(html) !== expected.canonical) fail(`${relativePath}: canonical mismatch`);
  if (metaContent(html, "og:url") !== expected.canonical) fail(`${relativePath}: og:url mismatch`);
  if (metaContent(html, "og:type") !== expected.ogType) fail(`${relativePath}: og:type mismatch`);
  for (const name of ["og:title", "og:description", "twitter:card", "twitter:title", "twitter:description"]) {
    if (!metaContent(html, name)) fail(`${relativePath}: missing ${name}`);
  }
  const types = parseSchemas(html, relativePath).flatMap((schema) => schemaTypes(schema));
  for (const type of expected.schemaTypes) {
    if (!types.includes(type)) fail(`${relativePath}: missing ${type} JSON-LD`);
  }
  await checkInternalLinks(html, relativePath);
}

await checkPage("news/index.html", {
  canonical: `${siteUrl}/news/`,
  ogType: "website",
  schemaTypes: ["BreadcrumbList", "ItemList"]
});

await checkPage("ai-employee/index.html", {
  canonical: `${siteUrl}/ai-employee/`,
  ogType: "website",
  schemaTypes: ["Service", "FAQPage", "BreadcrumbList"]
});

await checkPage("services/pawn-bpo/index.html", {
  canonical: `${siteUrl}/services/pawn-bpo/`,
  ogType: "website",
  schemaTypes: ["Service", "FAQPage", "BreadcrumbList"]
});

await checkPage("services/it-adviser/index.html", {
  canonical: `${siteUrl}/services/it-adviser/`,
  ogType: "website",
  schemaTypes: ["Service", "FAQPage", "BreadcrumbList"]
});

await checkPage("brand/index.html", {
  canonical: `${siteUrl}/brand/`,
  ogType: "website",
  schemaTypes: ["Organization", "BreadcrumbList"]
});

await checkPage("mvv/index.html", {
  canonical: `${siteUrl}/mvv/`,
  ogType: "website",
  schemaTypes: ["WebPage"]
});

const mvvPage = await read("mvv/index.html");
for (const token of [
  'id="vision"',
  'id="mission"',
  'id="value"',
  "世界一の時価総額企業をつくる。",
  "売上を増やす。",
  "コストを下げる。",
  "時間を返す。",
  "まず動く。",
  "最後までやる。",
  "難しいを、簡単に。"
]) {
  if (!mvvPage.includes(token)) fail(`mvv/index.html: MVV token missing: ${token}`);
}
for (const forbidden of ["mvv-mission-grid", "mvv-icon-svg", "mvv-vision-svg", "mvv-value-grid"]) {
  if (mvvPage.includes(forbidden)) fail(`mvv/index.html: visual card token must not remain: ${forbidden}`);
}

await checkPage("naoya-sakamoto/index.html", {
  canonical: `${siteUrl}/naoya-sakamoto/`,
  ogType: "profile",
  schemaTypes: ["Person", "BreadcrumbList"]
});

await checkPage("career/index.html", {
  canonical: `${siteUrl}/career/`,
  ogType: "profile",
  schemaTypes: ["ProfilePage", "Person", "BreadcrumbList"]
});

const careerPage = await read("career/index.html");
const naoyaProfilePage = await read("naoya-sakamoto/index.html");
for (const [pagePath, source, forbidden] of [
  ["career/index.html", careerPage, "要件整理、実装、テスト、運用改善、進捗・品質管理まで見ました。"],
  ["career/index.html", careerPage, "社内計測で一次回答率80%まで改善しました。"],
  ["career/index.html", careerPage, "商談議事録の作成時間を80%削減しました（社内計測）。"],
  ["naoya-sakamoto/index.html", naoyaProfilePage, "RAGの一次回答率80%（社内計測）、議事録作成時間80%削減（PoC期間内・社内計測）など、実際の業務で改善を重ねてきました。"]
]) {
  if (source.includes(forbidden)) fail(`${pagePath}: removed career/profile copy must not remain: ${forbidden}`);
}
for (const token of [
  "2023–2025　会社員時代。",
  "2025–2026　個人事業主時代。",
  "2026–　合同会社SGP。",
  "大手通信事業者向けAIプラットフォーム",
  "扱ってきた技術。"
]) {
  if (!careerPage.includes(token)) fail(`career/index.html: career proof token missing: ${token}`);
}

const brandPage = await read("brand/index.html");
for (const token of [
  "人と企業が、",
  "より良く判断し、行動できる仕組みをつくる。",
  "企業には、利益と時間を。",
  "売上を増やす。",
  "コストを下げる。",
  "時間を返す。",
  "仙台・一番町から。"
]) {
  if (!brandPage.includes(token)) fail(`brand/index.html: purpose token missing: ${token}`);
}
for (const forbidden of ["local-service-grid", "local-human-grid", "local-person-card", "local-call-card"]) {
  if (brandPage.includes(forbidden)) fail(`brand/index.html: card layout token must not remain: ${forbidden}`);
}

for (const item of newsItems) {
  await checkPage(`news/${item.slug}/index.html`, {
    canonical: `${siteUrl}/news/${item.slug}/`,
    ogType: "article",
    schemaTypes: ["NewsArticle", "BreadcrumbList"]
  });
}

await checkWebpIntegrity("assets/sgp-wordmark-v2.webp");
await checkWebpIntegrity("assets/sgp-wordmark-transparent.webp");

const home = await read("index.html");
for (const token of [
  "月1万円から、",
  "社外IT担当。",
  "仙台・一番町",
  "だいたい、いつも同じ服を着ています。",
  "SEIKO Presage",
  "サバ缶",
  "ラムネとコーヒー",
  "クライアントの送迎はできません。キーボードならかなり速く打てます。",
  "寿司打で測ったら約6.5キー／秒でした。",
  "送迎はできませんが、文字は送れます。",
  "仙台の美味しい店には、あまり詳しくありません。",
  "英語で会議も、英語で交渉もできます。",
  "交渉は日本語でもまだ修行中です。",
  "お酒も、タバコも、ギャンブルもしません。",
  "浪費もあまりしません。",
  "コスパとタイパが悪いと、だいたい途中で「これ改善できないかな」と考え始めます。",
  "売上、いくら上がるの？",
  "利益はどれくらい増えるの？",
  "コストはどれくらい下がるの？",
  "その業務に、毎月何時間使ってるの？",
  "普段、実際に使っている道具。",
  "Codex",
  "Cursor",
  "Claude Code",
  "Google Sheets",
  "Google Docs",
  "Google Drive",
  "Google Meet",
  "Cloudflare / GitHub Pages / Netlify",
  "これまでの仕事。",
  "会社員時代。",
  "個人事業主時代。",
  'id="career"',
  'id="price"',
  'id="works"',
  "Purpose",
  "Mission",
  "Sakamoto Growth Partners"
]) {
  if (!home.includes(token)) fail(`index.html: plain merchant-site token missing: ${token}`);
}
for (const forbidden of [
  "RAGでは一次回答率80%（社内計測）。議事録アプリでは、PoC期間中に議事録作成時間を80%削減（社内計測）しました。"
]) {
  if (home.includes(forbidden)) fail(`index.html: removed copy must not remain: ${forbidden}`);
}
const homeSchemaTypes = parseSchemas(home, "index.html").flatMap((schema) => schemaTypes(schema));
for (const type of ["Organization", "Service"]) {
  if (!homeSchemaTypes.includes(type)) fail(`index.html: missing ${type} JSON-LD`);
}
for (const href of ["brand/", "mvv/", "naoya-sakamoto/", "career/", "case-studies/", "services/it-adviser/"]) {
  if (!hasSiteHref(home, href)) fail(`index.html: required site link missing ${href}`);
}
for (const forbidden of [
  "local-fact-grid",
  "local-service-grid",
  "local-tools",
  "local-price-card",
  "local-person-card",
  "local-life-grid",
  "local-philosophy-grid",
  "OUTSIDE THE DESK",
  "WHAT I DO",
  "MY TOOLS"
]) {
  if (home.includes(forbidden)) fail(`index.html: card/SaaS layout token must not remain ${forbidden}`);
}
await checkInternalLinks(home, "index.html");

const contactPage = await read("contact/index.html");
const contactScript = await read("contact/contact.js");
for (const token of [
  'name="_honey"',
  'name="non_solicitation_confirmed"',
  "営業・勧誘目的ではありません。",
  "営業・勧誘を目的としたご連絡には返信しておりません。"
]) {
  if (!contactPage.includes(token)) fail(`contact/index.html: spam guard token missing: ${token}`);
}
for (const token of [
  'const formLoadedAt = Date.now();',
  'const honey = String(data.get("_honey") || "").trim();',
  'lead_type: "consultation"',
  'non_solicitation_confirmed: String(data.get("non_solicitation_confirmed") || "no")'
]) {
  if (!contactScript.includes(token)) fail(`contact/contact.js: spam guard token missing: ${token}`);
}

await checkPage("free-improvement/index.html", { canonical: `${siteUrl}/free-improvement/`, ogType: "website", schemaTypes: ["Service"] });


const subsitePages = [
  ["news/index.html", await read("news/index.html")]
];
for (const [pagePath, html] of subsitePages) {
  const header = html.match(/<header\s+class=["'][^"']*site-header[^"']*["'][\s\S]*?<\/header>/i)?.[0] ?? "";
  if (!header.includes("subsite-header")) fail(`${pagePath}: unified subsite header class missing`);
  if (!header.includes("sgp-wordmark-v2.webp")) fail(`${pagePath}: subsite header must use new horizontal wordmark`);
  if (header.includes("sgp-wordmark.webp")) fail(`${pagePath}: legacy square wordmark must not be used in header`);
  if (header.includes("brand-text")) fail(`${pagePath}: legacy company-name text block must not remain in header`);
}
for (const cssPath of ["case-studies/case-study.css", "news/news.css"]) {
  const css = await read(cssPath);
  if (!css.includes("Unified SGP Subsite Header v11")) fail(`${cssPath}: unified subsite header styles missing`);
  if (!css.includes(".subsite-header .brand-logo-wrap.brand-logo-official")) fail(`${cssPath}: new wordmark sizing rule missing`);
}

const netlifyConfig = await read("netlify.toml");
for (const [from, to] of [
  ["/about/", "/brand/"],
  ["/cases/", "/case-studies/"],
  ["/faq/", "/#faq"],
  ["/diagnosis/", "/contact/"],
  ["/services/ai/", "/ai-employee/"],
  ["/services/business-improvement/", "/services/it-adviser/"],
  ["/services/web-marketing/", "/services/it-adviser/"]
]) {
  if (!netlifyConfig.includes(`from = "${from}"`) || !netlifyConfig.includes(`to = "${to}"`)) {
    fail(`netlify.toml: legacy redirect missing ${from} -> ${to}`);
  }
}
const notFound = await read("404.html");
if (!/noindex/i.test(metaContent(notFound, "robots"))) fail("404.html: must be noindex");
for (const href of ["/", "/brand/", "/contact/"]) {
  if (!notFound.includes(`href="${href}"`)) fail(`404.html: recovery link missing ${href}`);
}

const sitemap = await read("sitemap.xml");
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const expectedUrls = [
  `${siteUrl}/`,
  `${siteUrl}/services/it-adviser/`,
  `${siteUrl}/brand/`,
  `${siteUrl}/mvv/`,
  `${siteUrl}/naoya-sakamoto/`,
  `${siteUrl}/career/`,
  `${siteUrl}/services/pawn-bpo/`,
  `${siteUrl}/news/`,
  ...newsItems.map((item) => `${siteUrl}/news/${item.slug}/`)
];
for (const url of expectedUrls) {
  if (!sitemapUrls.includes(url)) fail(`sitemap.xml: missing ${url}`);
}
if (new Set(sitemapUrls).size !== sitemapUrls.length) fail("sitemap.xml: duplicate URL");

const robots = await read("robots.txt");
if (!robots.includes("Allow: /")) fail("robots.txt: Allow directive missing");
if (!robots.includes(`Sitemap: ${siteUrl}/sitemap.xml`)) fail("robots.txt: sitemap directive missing");

if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Validated NEWS archive, ${newsItems.length} articles, metadata, structured data, internal links and sitemap.`);
}


const styles = await read("styles.css");
for (const token of [
  "Specialist Network Mobile v10",
  'grid-template-areas:',
  '"tax labor"',
  '"hub hub"',
  '"legal finance"',
  "display:flex;",
  "flex-direction:column;",
  "gap:6px;",
  "rotate(31deg)",
  "rotate(-31deg)"
]) {
  if (!styles.includes(token)) fail(`styles.css: specialist network mobile token missing: ${token}`);
}
