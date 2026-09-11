import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publicWorks, workCategories, works } from "../works/works-data.mjs";

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

function schemaTypes(value, result = []) {
  if (!value || typeof value !== "object") return result;
  if (typeof value["@type"] === "string") result.push(value["@type"]);
  for (const nested of Object.values(value)) schemaTypes(nested, result);
  return result;
}

assert.equal(publicWorks.length, 1, "Only the approved self-developed work should be public in the first release");
assert.equal(publicWorks[0].slug, "sendai-erabu");
assert.equal(new Set(works.map(({ slug }) => slug)).size, works.length, "Work slugs must be unique");
assert.ok(workCategories.length >= 7, "Future Works filters are required");

for (const work of works) {
  for (const key of ["slug", "title", "projectName", "type", "categories", "industry", "area", "summary", "lead", "roles", "technologies", "background", "problems", "concept", "solutions", "implementation", "results", "future", "featured", "publishedAt", "visibility"]) {
    assert.notEqual(work[key], undefined, `${work.slug}: ${key} is required`);
  }
  if (work.visibility !== "public") {
    await assert.rejects(access(path.join(rootDir, "works", work.slug, "index.html")), `${work.slug}: non-public work must not be generated`);
  }
}

const index = await read("works/index.html");
assert.equal(canonical(index), `${siteUrl}/works/`);
assert.equal(meta(index, "robots"), "index, follow");
assert.equal(meta(index, "og:type"), "website");
assert.equal((index.match(/<h1\b/gi) || []).length, 1);
assert.equal((index.match(/googletagmanager\.com\/gtag\/js/gi) || []).length, 1);
assert.doesNotMatch(index, /article:(?:author|published_time|modified_time)/i);
for (const category of workCategories) assert.match(index, new RegExp(`data-work-filter="${category.slug}"`));
for (const work of publicWorks) assert.match(index, new RegExp(`/works/${work.slug}/`));
const indexTypes = schemas(index).flatMap((schema) => schemaTypes(schema));
for (const type of ["CollectionPage", "ItemList", "BreadcrumbList"]) assert.ok(indexTypes.includes(type), `Works index missing ${type}`);

for (const work of publicWorks) {
  const relativePath = `works/${work.slug}/index.html`;
  const html = await read(relativePath);
  const expectedCanonical = `${siteUrl}/works/${work.slug}/`;
  assert.equal(canonical(html), expectedCanonical);
  assert.equal(meta(html, "robots"), "index, follow");
  assert.equal(meta(html, "og:type"), "website");
  assert.equal(meta(html, "og:url"), expectedCanonical);
  assert.ok(meta(html, "description"));
  assert.ok(meta(html, "og:image"));
  assert.equal((html.match(/<h1\b/gi) || []).length, 1);
  assert.equal((html.match(/googletagmanager\.com\/gtag\/js/gi) || []).length, 1);
  assert.doesNotMatch(html, /article:(?:author|published_time|modified_time)/i);
  for (const id of ["project-data", "background", "problem", "concept", "architecture", "implementation", "role", "self-development", "technology", "status"]) {
    assert.match(html, new RegExp(`id="${id}"`), `${relativePath}: missing ${id}`);
  }
  assert.match(html, /現在実装・運用中/);
  assert.match(html, /今後の拡張(?:候補| \/ 構想)/);
  assert.match(html, /現在も継続開発・運用中/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /data-analytics-event="works_contact_click"/);
  assert.match(html, /data-analytics-event="works_project_click"/);
  assert.match(html, new RegExp(`data-work-slug="${work.slug}"`));
  const types = schemas(html).flatMap((schema) => schemaTypes(schema));
  for (const type of ["WebPage", "CreativeWork", "BreadcrumbList"]) assert.ok(types.includes(type), `${relativePath}: missing ${type}`);
  await access(path.join(rootDir, work.heroImage.replace(/^\//, "")));
}

const sitemap = await read("sitemap.xml");
for (const url of [`${siteUrl}/works/`, ...publicWorks.map(({ slug }) => `${siteUrl}/works/${slug}/`)]) {
  assert.match(sitemap, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `sitemap missing ${url}`);
}

const css = await read("works/works.css");
assert.match(css, /@media \(max-width: 900px\)/);
assert.match(css, /@media \(max-width: 640px\)/);
assert.match(css, /\.works-page a:focus-visible/);
const script = await read("works/works.js");
assert.match(script, /aria-pressed/);
assert.match(script, /dataset\.categories/);
const analytics = await read("assets/site-analytics.js");
assert.match(analytics, /work_slug:/);

for (const relativePath of ["index.html", "about/index.html", "services/index.html", "insights/index.html", "news/index.html"]) {
  const html = await read(relativePath);
  assert.match(html, /href="\/works\/"/, `${relativePath}: global Works navigation missing`);
}

const home = await read("index.html");
assert.match(home, /href="\/works\/sendai-erabu\/"/, "Homepage self-developed work must link to the Works detail page");

console.log(`Validated Works Engine, ${publicWorks.length} public project, metadata, JSON-LD, visibility, filters, navigation, sitemap and responsive CSS.`);
