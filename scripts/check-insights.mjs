import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { insightArticles, insightCategories, publishedInsights } from "../insights/insights-data.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteUrl = "https://sakamoto-growth-partners.com";
const read = (relativePath) => readFile(path.join(rootDir, relativePath), "utf8");

function meta(html, key) {
  return html.match(new RegExp(`<meta\\s+[^>]*(?:name|property)=["']${key}["'][^>]*content=["']([^"']+)["']`, "i"))?.[1]
    || html.match(new RegExp(`<meta\\s+[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']${key}["']`, "i"))?.[1]
    || "";
}

function canonical(html) {
  return html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1]
    || html.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1]
    || "";
}

function schemas(html) {
  return [...html.matchAll(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)]
    .map((match) => JSON.parse(match[1]));
}

function findSchema(items, type) {
  return items.find((item) => item && item["@type"] === type);
}

function localPath(href) {
  const url = new URL(href, `${siteUrl}/`);
  if (url.origin !== siteUrl) return null;
  if (url.pathname === "/") return "index.html";
  const pathname = url.pathname.replace(/^\//, "");
  return path.extname(pathname) ? pathname : path.join(pathname, "index.html");
}

async function checkLinks(html, sourcePath) {
  for (const [, href] of html.matchAll(/<a\s+[^>]*href=["']([^"']+)["']/gi)) {
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    const target = localPath(href);
    if (!target) continue;
    await assert.doesNotReject(access(path.join(rootDir, target)), `${sourcePath}: broken link ${href}`);
  }
}

assert.equal(publishedInsights.length, 30, "初期公開記事は30件必要です。");
assert.equal(insightCategories.length, 4, "カテゴリは4件必要です。");
assert.equal(new Set(publishedInsights.map((article) => article.slug)).size, publishedInsights.length);
assert.equal(new Set(publishedInsights.map((article) => article.seoTitle)).size, publishedInsights.length, "SEO title must be unique");
assert.equal(new Set(publishedInsights.map((article) => article.seoDescription)).size, publishedInsights.length, "Meta description must be unique");
const incomingLinks = Object.fromEntries(publishedInsights.map((article) => [article.slug, 0]));
for (const article of publishedInsights) {
  for (const relatedSlug of article.relatedArticles) incomingLinks[relatedSlug] += 1;
}
for (const [slug, count] of Object.entries(incomingLinks)) assert.ok(count >= 1, `${slug}: at least one contextual incoming article link is required`);

const index = await read("insights/index.html");
assert.equal(canonical(index), `${siteUrl}/insights/`);
assert.equal(meta(index, "robots"), "index, follow");
assert.equal(meta(index, "og:type"), "website");
assert.ok(findSchema(schemas(index), "ItemList"), "INSIGHTS一覧にItemListが必要です。");
assert.ok(findSchema(schemas(index), "BreadcrumbList"), "INSIGHTS一覧にBreadcrumbListが必要です。");
for (const article of publishedInsights) assert.match(index, new RegExp(`/insights/${article.slug}/`));
await checkLinks(index, "insights/index.html");

for (const category of insightCategories) {
  const relativePath = `insights/${category.slug}/index.html`;
  const html = await read(relativePath);
  assert.equal(canonical(html), `${siteUrl}/insights/${category.slug}/`);
  assert.equal(meta(html, "robots"), "index, follow");
  assert.equal((html.match(/<h1\b/gi) || []).length, 1);
  assert.ok(findSchema(schemas(html), "CollectionPage"), `${relativePath}: CollectionPageが必要です。`);
  assert.ok(findSchema(schemas(html), "BreadcrumbList"), `${relativePath}: BreadcrumbListが必要です。`);
  await checkLinks(html, relativePath);
}

const requiredComponents = [
  "insight-summary",
  "insight-checklist",
  "insight-judgement",
  "insight-table-wrap",
  "insight-roi",
  "insight-architecture",
  "insight-risk",
  "insight-fit",
  "insight-matrix",
  "insight-process",
  "insight-steps",
  "insight-sources",
  "insight-related-services",
  "insight-related",
  "insight-end-cta",
];

const qualityKeys = [
  "searchIntent",
  "practicalValue",
  "originality",
  "accuracy",
  "readability",
  "businessRelevance",
  "internalLinking",
  "seoAiSearch",
  "uxTechnical",
];

for (const article of publishedInsights) {
  const descriptionLength = [...article.seoDescription].length;
  assert.ok(descriptionLength >= 120 && descriptionLength <= 160, `${article.slug}: meta description should be 120-160 characters (${descriptionLength})`);
  const textLength = JSON.stringify({ description: article.description, summary: article.summary, sections: article.sections }).replace(/[\s{}\[\]"':,]/g, "").length;
  assert.ok(textLength >= 2200, `${article.slug}: practical article text is too short (${textLength})`);
  assert.ok(article.sections.length >= 7, `${article.slug}: needs at least seven sections`);
  assert.equal(new Set(article.sections.map((section) => section.id)).size, article.sections.length, `${article.slug}: duplicate section id`);
  assert.ok(article.brief?.primaryIntent && article.brief?.decision && article.brief?.mainAnswer, `${article.slug}: Article Brief incomplete`);
  assert.ok(article.originalAssets.length >= (article.featured ? 4 : 2), `${article.slug}: original assets incomplete`);
  const scoreTotal = qualityKeys.reduce((sum, key) => sum + article.qualityScore[key], 0);
  assert.equal(scoreTotal, article.qualityScore.total, `${article.slug}: score total mismatch`);
  assert.ok(scoreTotal >= 90, `${article.slug}: quality score must be at least 90`);
  assert.ok(article.qualityScore.searchIntent >= 13, `${article.slug}: search intent gate failed`);
  assert.ok(article.qualityScore.practicalValue >= 17, `${article.slug}: practical value gate failed`);
  assert.ok(article.qualityScore.originality >= 12, `${article.slug}: originality gate failed`);
  assert.ok(article.qualityScore.accuracy >= 13, `${article.slug}: accuracy gate failed`);
  assert.ok(article.sources?.length >= 2, `${article.slug}: at least two primary or authoritative sources are required`);
  assert.ok(article.relatedArticles?.length >= 2 && article.relatedArticles.length <= 4, `${article.slug}: related article count must be 2-4`);
  const relativePath = `insights/${article.slug}/index.html`;
  const html = await read(relativePath);
  const expectedCanonical = `${siteUrl}/insights/${article.slug}/`;
  assert.equal(canonical(html), expectedCanonical);
  assert.equal(meta(html, "robots"), "index, follow");
  assert.equal(meta(html, "og:type"), "article");
  assert.equal(meta(html, "og:url"), expectedCanonical);
  for (const key of ["description", "og:title", "og:description", "og:image", "twitter:card", "twitter:title", "twitter:description", "twitter:image"]) {
    assert.ok(meta(html, key), `${relativePath}: ${key}が必要です。`);
  }
  assert.equal((html.match(/<h1\b/gi) || []).length, 1);
  assert.match(html, new RegExp(`data-article-slug="${article.slug}"`));
  assert.match(html, /data-analytics-event="insight_cta_click"/);
  assert.match(html, /data-analytics-event="insight_service_click"/);
  const hasRoiBlock = article.sections.some((section) => section.blocks.some((block) => block.type === "roi"));
  if (hasRoiBlock) assert.match(html, /以下はモデルケースによる試算です。実際の効果を保証するものではありません。/);
  assert.doesNotMatch(html, /Lorem ipsum|架空の支援実績|架空の顧客/i);
  const parsed = schemas(html);
  const blogPosting = findSchema(parsed, "BlogPosting");
  assert.ok(blogPosting, `${relativePath}: BlogPostingが必要です。`);
  for (const key of ["headline", "description", "datePublished", "dateModified", "author", "publisher", "mainEntityOfPage"]) {
    assert.ok(blogPosting[key], `${relativePath}: BlogPosting.${key}が必要です。`);
  }
  assert.equal(blogPosting.mainEntityOfPage["@id"], expectedCanonical);
  assert.equal(blogPosting.author["@type"], "Person");
  assert.equal(blogPosting.publisher["@id"], `${siteUrl}/#organization`);
  assert.ok(findSchema(parsed, "BreadcrumbList"), `${relativePath}: BreadcrumbListが必要です。`);
  assert.ok(Array.isArray(blogPosting.citation) && blogPosting.citation.length === article.sources.length, `${relativePath}: citations must match sources`);
  assert.match(html, /class="insight-sources"/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  await checkLinks(html, relativePath);
}

const combinedArticles = (await Promise.all(publishedInsights.map((article) => read(`insights/${article.slug}/index.html`)))).join("\n");
for (const component of requiredComponents) assert.match(combinedArticles, new RegExp(component), `${component}が必要です。`);

for (const draft of insightArticles.filter((article) => article.status !== "published")) {
  await assert.rejects(access(path.join(rootDir, "insights", draft.slug, "index.html")), `draft ${draft.slug} must not be generated`);
}

const sitemap = await read("sitemap.xml");
for (const url of [
  `${siteUrl}/insights/`,
  ...insightCategories.map((category) => `${siteUrl}/insights/${category.slug}/`),
  ...publishedInsights.map((article) => `${siteUrl}/insights/${article.slug}/`),
]) assert.match(sitemap, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `sitemap missing ${url}`);

const home = await read("index.html");
assert.match(home, /<!-- INSIGHTS_HOME_START -->[\s\S]*?<!-- INSIGHTS_HOME_END -->/);
for (const article of publishedInsights.slice(0, 3)) assert.match(home, new RegExp(`/insights/${article.slug}/`));

const css = await read("insights/insights.css");
assert.match(css, /\.insight-table-wrap[\s\S]*?overflow-x:\s*auto/);
assert.match(css, /@media \(max-width: 900px\)/);
assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.insight-card-grid[\s\S]*?grid-template-columns:\s*1fr/);
const filterScript = await read("insights/insights.js");
assert.match(filterScript, /\.insight-latest-grid \[data-insight-card\]/, "絞り込み対象は全記事グリッドに限定してください。");

const analytics = await read("assets/site-analytics.js");
for (const eventName of ["insight_view", "insight_50_percent", "insight_90_percent", "insight_cta_click", "insight_related_article_click", "insight_service_click", "diagnosis_click"]) {
  assert.match(analytics + combinedArticles, new RegExp(eventName), `${eventName}が必要です。`);
}

console.log(`Validated INSIGHTS data model, ${publishedInsights.length + insightCategories.length + 1} generated URLs, metadata, JSON-LD, internal links, responsive CSS, quality gates, sources, draft exclusion and GA4 events.`);
