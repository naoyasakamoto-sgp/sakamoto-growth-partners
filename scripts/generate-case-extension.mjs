import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extraNewsItems } from "../news/news-extra-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const siteUrl = "https://sakamoto-growth-partners.com";
const item = extraNewsItems[0];
const newsUrl = `${siteUrl}/news/${item.slug}/`;

const timelineArticle = `<article class="news-timeline-item"><time datetime="${item.date}"><span>SEP</span>02</time><p class="news-category">${item.category}</p><div><h3><a href="/news/${item.slug}/">${item.title}</a></h3><p>${item.description}</p></div></article>`;
const homeNewsArticle = `<article><div><time datetime="${item.date}">2026.09.02</time><span>${item.category}</span></div><h3><a href="/news/${item.slug}/">${item.title}</a></h3></article>`;
const homeCase = `<!-- CASE_STUDY_HOME_START -->
    <section class="home-case-proof" aria-labelledby="home-case-title"><div class="container"><div class="home-case-heading"><div><p class="section-label">CASE STUDY</p><h2 id="home-case-title">言葉ではなく、実際につくったもので。</h2><p>SGPが企画・設計・開発したプロダクトから、どのような問題を、どう仕組みに変えたかをご紹介します。</p></div><a href="/case-studies/">すべての開発事例を見る →</a></div><a class="case-feature-card" href="/case-studies/my-jazz-day/"><div class="case-feature-copy"><p class="case-kicker">CASE STUDY 001 / SENDAI ERABU!</p><h2>897の演奏枠を、<br>1分で「自分だけの一日」へ。</h2><p>音楽の好み・気分・時間・開始エリア・歩行量・新しい音との距離から、フェスの一日を構成するMY JAZZ DAY。</p><div class="case-card-metrics"><span><b>897</b> PERFORMANCE SLOTS</span><span><b>50</b> VENUES</span><span><b>1 MIN</b> PERSONALIZATION</span></div></div><div class="case-feature-image"><img src="/assets/case-studies/my-jazz-day/hero-mobile.webp" alt="MY JAZZ DAYの画面" loading="lazy" /></div></a></div></section>
<!-- CASE_STUDY_HOME_END -->`;

function ensureNav(html) {
  if (html.includes('href="/case-studies/">CASE STUDY</a>')) return html;
  return html.replace('<a href="/news/">NEWS</a>', '<a href="/case-studies/">CASE STUDY</a>\n        <a href="/news/">NEWS</a>');
}
function ensureAnalytics(html) {
  if (html.includes('src="/analytics.js"')) return html;
  return html.replace('</body>', '  <script src="/analytics.js"></script>\n</body>');
}
function ensureCaseCss(html) {
  if (html.includes('/case-studies/case-study.css')) return html;
  return html.replace('</head>', '  <link rel="stylesheet" href="/case-studies/case-study.css" />\n</head>');
}
function patchItemList(html) {
  return html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (block, jsonText) => {
    let data;
    try { data = JSON.parse(jsonText); } catch { return block; }
    if (data?.["@type"] !== "ItemList" || !Array.isArray(data.itemListElement)) return block;
    if (!data.itemListElement.some((entry) => entry.url === newsUrl)) {
      data.itemListElement.unshift({ "@type": "ListItem", position: 1, url: newsUrl, name: item.title });
      data.itemListElement = data.itemListElement.map((entry, index) => ({ ...entry, position: index + 1 }));
      data.numberOfItems = data.itemListElement.length;
    }
    return `<script type="application/ld+json">\n${JSON.stringify(data, null, 2).replaceAll("<", "\\u003c")}\n  </script>`;
  });
}

async function patchNewsIndex() {
  const file = path.join(root, "news/index.html");
  let html = await readFile(file, "utf8");
  if (!html.includes(`/news/${item.slug}/`)) html = html.replace('<div class="news-timeline">', `<div class="news-timeline">\n            ${timelineArticle}`);
  html = patchItemList(html);
  html = ensureNav(html);
  html = ensureAnalytics(html);
  await writeFile(file, html, "utf8");
}

async function patchHome() {
  const file = path.join(root, "index.html");
  let html = await readFile(file, "utf8");
  html = ensureNav(html);
  html = ensureCaseCss(html);
  html = ensureAnalytics(html);
  if (!html.includes('<!-- CASE_STUDY_HOME_START -->')) html = html.replace('<!-- NEWS_LATEST_START -->', `${homeCase}\n\n<!-- NEWS_LATEST_START -->`);
  if (!html.includes(`/news/${item.slug}/`)) html = html.replace('<div class="container home-news-list">', `<div class="container home-news-list">\n        ${homeNewsArticle}`);
  await writeFile(file, html, "utf8");
}

async function patchSitemap() {
  const file = path.join(root, "sitemap.xml");
  let xml = await readFile(file, "utf8");
  const entries = [
    [`${siteUrl}/case-studies/`, "2026-09-02"],
    [`${siteUrl}/case-studies/my-jazz-day/`, "2026-09-02"],
    [`${siteUrl}/contact/`, "2026-09-02"],
    [newsUrl, item.date]
  ];
  for (const [loc, lastmod] of entries) {
    if (!xml.includes(`<loc>${loc}</loc>`)) xml = xml.replace('</urlset>', `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>\n</urlset>`);
  }
  await writeFile(file, xml, "utf8");
}

async function patchFeed() {
  const file = path.join(root, "news/feed.xml");
  let xml = await readFile(file, "utf8");
  if (!xml.includes(newsUrl)) {
    const feedItem = `<item><title>${item.title}</title><link>${newsUrl}</link><guid isPermaLink="true">${newsUrl}</guid><pubDate>Tue, 01 Sep 2026 15:00:00 GMT</pubDate><description>${item.description}</description><category>${item.category}</category></item>`;
    xml = xml.replace(/<lastBuildDate>.*?<\/lastBuildDate>/, '<lastBuildDate>Tue, 01 Sep 2026 15:00:00 GMT</lastBuildDate>');
    xml = xml.replace('<item>', `${feedItem}\n    <item>`);
  }
  await writeFile(file, xml, "utf8");
}

async function main() {
  await access(path.join(root, `news/${item.slug}/index.html`));
  await access(path.join(root, "case-studies/my-jazz-day/index.html"));
  await patchNewsIndex();
  await patchHome();
  await patchSitemap();
  await patchFeed();
  console.log("Applied MY JAZZ DAY Case Study, NEWS, homepage, sitemap and RSS extensions.");
}
await main();
