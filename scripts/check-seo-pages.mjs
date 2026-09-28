import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { guides, industries } from "../content/seo-pages.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const siteUrl = "https://sakamoto-growth-partners.com";
const failures = [];
const fail = (message) => failures.push(message);
const read = (rel) => readFile(path.join(root, rel), "utf8");

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

function parseSchemas(html, rel) {
  const result = [];
  for (const [, source] of html.matchAll(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)) {
    try { result.push(JSON.parse(source)); }
    catch (error) { fail(`${rel}: invalid JSON-LD ${error.message}`); }
  }
  return result;
}

function schemaTypes(value, result = []) {
  if (!value || typeof value !== "object") return result;
  if (typeof value["@type"] === "string") result.push(value["@type"]);
  for (const nested of Object.values(value)) schemaTypes(nested, result);
  return result;
}

async function checkLinks(html, rel) {
  for (const [, href] of html.matchAll(/<a\s+[^>]*href=["']([^"']+)["']/gi)) {
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("http")) continue;
    const url = new URL(href, `${siteUrl}/`);
    const clean = url.pathname.replace(/^\//, "");
    const target = !clean ? "index.html" : path.extname(clean) ? clean : path.join(clean, "index.html");
    try { await access(path.join(root, target)); }
    catch { fail(`${rel}: broken internal link ${href}`); }
  }
}

async function checkPage(rel, expected) {
  let html;
  try { html = await read(rel); }
  catch { fail(`${rel}: missing`); return; }
  if ([...html.matchAll(/<h1\b/gi)].length !== 1) fail(`${rel}: expected one H1`);
  if (!/<html\s+lang=["']ja["']/i.test(html)) fail(`${rel}: lang=ja missing`);
  if (!metaContent(html, "description")) fail(`${rel}: description missing`);
  if (metaContent(html, "robots").includes("noindex")) fail(`${rel}: unexpected noindex`);
  if (canonical(html) !== expected.canonical) fail(`${rel}: canonical mismatch`);
  if (metaContent(html, "og:url") !== expected.canonical) fail(`${rel}: og:url mismatch`);
  if (metaContent(html, "og:type") !== expected.ogType) fail(`${rel}: og:type mismatch`);
  const types = parseSchemas(html, rel).flatMap((schema) => schemaTypes(schema));
  for (const type of expected.types) if (!types.includes(type)) fail(`${rel}: missing ${type} schema`);
  await checkLinks(html, rel);
}

await checkPage("guides/index.html", {
  canonical:`${siteUrl}/guides/`, ogType:"website", types:["BreadcrumbList","ItemList"]
});
for (const guide of guides) {
  await checkPage(`guides/${guide.slug}/index.html`, {
    canonical:`${siteUrl}/guides/${guide.slug}/`, ogType:"article", types:["Article","FAQPage","BreadcrumbList"]
  });
}

await checkPage("industries/index.html", {
  canonical:`${siteUrl}/industries/`, ogType:"website", types:["BreadcrumbList","ItemList"]
});
for (const industry of industries) {
  await checkPage(`industries/${industry.slug}/index.html`, {
    canonical:`${siteUrl}/industries/${industry.slug}/`, ogType:"website", types:["Service","FAQPage","BreadcrumbList"]
  });
}

const adviser = await read("services/it-adviser/index.html");
for (const token of [
  "仙台の社外IT担当",
  "/guides/",
  "/guides/it-adviser-pricing/",
  "/guides/hire-vs-outsource-it/",
  "/industries/construction/",
  "/industries/electrical/",
  "/industries/exterior/",
  "/industries/hvac/",
  "/industries/remodeling/"
]) {
  if (!adviser.includes(token)) fail(`services/it-adviser/index.html: SEO hub token missing ${token}`);
}

const home = await read("index.html");
if (!home.includes("<title>合同会社SGP｜仙台・宮城の中小企業IT支援・業務改善</title>")) {
  fail("index.html: homepage title must target corporate / IT support intent");
}

const sitemap = await read("sitemap.xml");
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const required = [
  `${siteUrl}/guides/`,
  ...guides.map((g) => `${siteUrl}/guides/${g.slug}/`),
  `${siteUrl}/industries/`,
  ...industries.map((i) => `${siteUrl}/industries/${i.slug}/`)
];
for (const url of required) if (!sitemapUrls.includes(url)) fail(`sitemap.xml: missing ${url}`);
if (new Set(sitemapUrls).size !== sitemapUrls.length) fail("sitemap.xml: duplicate URL after SEO generation");

if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Validated ${guides.length} SEO guides, ${industries.length} industry pages, internal links, schemas and sitemap.`);
}
