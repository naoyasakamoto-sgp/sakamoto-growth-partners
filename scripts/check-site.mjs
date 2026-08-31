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

for (const item of newsItems) {
  await checkPage(`news/${item.slug}/index.html`, {
    canonical: `${siteUrl}/news/${item.slug}/`,
    ogType: "article",
    schemaTypes: ["NewsArticle", "BreadcrumbList"]
  });
}

const home = await read("index.html");
if (!home.includes('href="/news/"')) fail("index.html: NEWS navigation is missing");
for (const item of [...newsItems].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)) {
  if (!home.includes(`/news/${item.slug}/`)) fail(`index.html: latest NEWS missing ${item.slug}`);
}
await checkInternalLinks(home, "index.html");

const sitemap = await read("sitemap.xml");
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const expectedUrls = [
  `${siteUrl}/`,
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
