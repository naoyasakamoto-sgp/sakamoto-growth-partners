import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { insightArticles } from "../insights/insights-data.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2];
assert.ok(slug, "Usage: node scripts/check-insight-article.mjs <slug>");
const article = insightArticles.find((item) => item.slug === slug);
assert.ok(article, `Unknown insight: ${slug}`);

const qualityKeys = ["searchIntent", "practicalValue", "originality", "accuracy", "readability", "businessRelevance", "internalLinking", "seoAiSearch", "uxTechnical"];
const textLength = JSON.stringify({ description: article.description, summary: article.summary, sections: article.sections }).replace(/[\s{}\[\]"':,]/g, "").length;
assert.ok(textLength >= 2200, `${slug}: practical article text is too short (${textLength})`);
assert.ok(article.sections.length >= 7, `${slug}: needs at least seven decision-focused sections`);
assert.equal(new Set(article.sections.map((section) => section.id)).size, article.sections.length, `${slug}: duplicate section id`);
assert.ok(article.brief?.primaryIntent && article.brief?.decision && article.brief?.mainAnswer, `${slug}: Article Brief incomplete`);
assert.ok(article.originalAssets.length >= (article.featured ? 4 : 2), `${slug}: original assets incomplete`);
const scoreTotal = qualityKeys.reduce((sum, key) => sum + article.qualityScore[key], 0);
assert.equal(scoreTotal, article.qualityScore.total, `${slug}: score total mismatch`);
assert.ok(scoreTotal >= 90 && article.qualityScore.searchIntent >= 13 && article.qualityScore.practicalValue >= 17 && article.qualityScore.originality >= 12 && article.qualityScore.accuracy >= 13, `${slug}: quality gate failed`);

const html = await readFile(path.join(rootDir, "insights", slug, "index.html"), "utf8");
assert.equal((html.match(/<h1\b/gi) || []).length, 1, `${slug}: exactly one h1 is required`);
assert.match(html, new RegExp(`<link rel="canonical" href="https://sakamoto-growth-partners.com/insights/${slug}/"`));
assert.match(html, /<meta name="robots" content="index, follow"/);
assert.match(html, /"@type": "BlogPosting"/);
assert.match(html, /"@type": "BreadcrumbList"/);
assert.match(html, /data-analytics-event="insight_cta_click"/);
assert.match(html, /data-analytics-event="insight_service_click"/);
assert.match(html, /class="insight-related"/);
if (article.sources?.length) {
  assert.match(html, /class="insight-sources"/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /"citation": \[/);
}
assert.doesNotMatch(html, /Lorem ipsum|架空の支援実績|架空の顧客|絶対に成功|売上爆増/i);

console.log(`${slug}: ${textLength} chars, ${article.sections.length} sections, ${article.originalAssets.length} original assets, score ${scoreTotal}/100.`);
