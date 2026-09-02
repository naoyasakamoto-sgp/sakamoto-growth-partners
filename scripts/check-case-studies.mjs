import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { caseStudies } from "../case-studies/case-study-data.mjs";
import { extraNewsItems } from "../news/news-extra-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const mustExist = [
  "case-studies/index.html",
  "case-studies/my-jazz-day/index.html",
  "news/sendai-erabu-my-jazz-day-2026/index.html",
  "contact/index.html",
  "analytics.js",
  "content/case-studies/my-jazz-day.mdx",
  "assets/case-studies/my-jazz-day/hero-mobile.webp",
  "assets/case-studies/my-jazz-day/jazz-map.webp",
  "assets/case-studies/my-jazz-day/og-my-jazz-day.webp"
];

for (const rel of mustExist) await access(path.join(root, rel));
const read = (rel) => readFile(path.join(root, rel), "utf8");
const detail = await read("case-studies/my-jazz-day/index.html");
const listing = await read("case-studies/index.html");
const news = await read("news/sendai-erabu-my-jazz-day-2026/index.html");
const sitemap = await read("sitemap.xml");
const analytics = await read("analytics.js");

const requiredCase = caseStudies[0];
for (const token of [requiredCase.seo.title, "897", "50", "1 MIN", requiredCase.productUrl, "/contact/?source=case-study&case=my-jazz-day&intent=decision-product"]) {
  if (!detail.includes(token)) throw new Error(`Case detail missing: ${token}`);
}
for (const token of ["TechArticle", "BreadcrumbList", "canonical", "data-analytics-page=\"case-study\""]) {
  if (!detail.includes(token)) throw new Error(`Case SEO/analytics missing: ${token}`);
}
if (!listing.includes("/case-studies/my-jazz-day/")) throw new Error("Case listing does not link detail");
if (!news.includes("NewsArticle") || !news.includes("/case-studies/my-jazz-day/")) throw new Error("News/Case bridge missing");
for (const url of ["/case-studies/", "/case-studies/my-jazz-day/", "/news/sendai-erabu-my-jazz-day-2026/", "/contact/"]) {
  if (!sitemap.includes(`https://sakamoto-growth-partners.com${url}`)) throw new Error(`Sitemap missing ${url}`);
}
for (const eventName of ["case_study_view", "case_study_product_click", "case_study_contact_click", "news_case_study_click", "news_contact_click", "contact_submit"]) {
  if (!analytics.includes(eventName) && !detail.includes(eventName) && !news.includes(eventName)) throw new Error(`Analytics event missing: ${eventName}`);
}
if (/G-[A-Z0-9]{5,}/.test(analytics)) throw new Error("Do not hard-code a GA4 Measurement ID in analytics.js");
if (extraNewsItems[0].slug !== "sendai-erabu-my-jazz-day-2026") throw new Error("Unexpected extra NEWS slug");

for (const html of [detail, listing, news]) {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (!scripts.length) throw new Error("JSON-LD missing");
  for (const match of scripts) JSON.parse(match[1]);
}

console.log("Case Study, NEWS bridge, SEO, analytics, contact attribution and sitemap checks passed.");
