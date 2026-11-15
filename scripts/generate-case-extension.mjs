import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extraNewsItems } from "../news/news-extra-data.mjs";
import { newsItems } from "../news/news-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const siteUrl = "https://sakamoto-growth-partners.com";
const item = extraNewsItems[0];
const newsUrl = `${siteUrl}/news/${item.slug}/`;

const timelineArticle = `<article class="news-timeline-item"><time datetime="${item.date}"><span>SEP</span>02</time><p class="news-category">${item.category}</p><div><h3><a href="/news/${item.slug}/">${item.title}</a></h3><p>${item.description}</p></div></article>`;
function ensureNav(html) {
  if (html.includes('href="/case-studies/">CASE STUDY</a>')) return html;
  return html.replace('<a href="/news/">NEWS</a>', '<a href="/case-studies/">CASE STUDY</a>\n        <a href="/news/">NEWS</a>');
}
function ensureAnalytics(html) {
  if (html.includes('src="/analytics.js"')) return html;
  return html.replace('</body>', '  <script src="/analytics.js"></script>\n</body>');
}
function patchItemList(html) {
  return html.replace(/<script type="application\\/ld\\+json">([\\s\\S]*?)<\\/script>/g, (block, jsonText) => {
    let data;
    try { data = JSON.parse(jsonText); } catch { return block; }
    if (data?.["@type"] !== "ItemList" || !Array.isArray(data.itemListElement)) return block;

    if (!data.itemListElement.some((entry) => entry.url === newsUrl)) {
      data.itemListElement.push({ "@type": "ListItem", position: 0, url: newsUrl, name: item.title });
    }

    // The custom MY JAZZ DAY story is from September: keep November stories ahead of it.
    const dateByUrl = new Map([...newsItems, item].map((story) => [
      `${siteUrl}/news/${story.slug}/`, story.date
    ]));
    data.itemListElement.sort((a, b) =>
      (dateByUrl.get(b.url) || "").localeCompare(dateByUrl.get(a.url) || "")
    );
    data.itemListElement = data.itemListElement.map((entry, index) => ({
      ...entry, position: index + 1
    }));
    data.numberOfItems = data.itemListElement.length;
    return `<script type="application/ld+json">\\n${JSON.stringify(data, null, 2).replaceAll("<", "\\u003c")}\\n  </script>`;
  });
}

async function patchNewsIndex() {
  const file = path.join(root, "news/index.html");
  let html = await readFile(file, "utf8");
  if (!html.includes(`/news/${item.slug}/`)) {
    const datedEntries = [...html.matchAll(/<article class="news-timeline-item">\\s*<time datetime="(\\d{4}-\\d{2}-\\d{2})"/g)];
    const firstOlder = datedEntries.find((match) => match[1] < item.date);
    if (firstOlder) {
      html = `${html.slice(0, firstOlder.index)}${timelineArticle}\\n            ${html.slice(firstOlder.index)}`;
    } else {
      html = html.replace('<div class="news-timeline">', `<div class="news-timeline">\\n            ${timelineArticle}`);
    }
  }
  html = patchItemList(html);
  html = ensureNav(html);
  html = ensureAnalytics(html);
  await writeFile(file, html, "utf8");
}

async function patchSitemap() {
  const file = path.join(root, "sitemap.xml");
  let xml = await readFile(file, "utf8");
  const entries = [
    [`${siteUrl}/case-studies/`, "2026-09-02"],
    [`${siteUrl}/case-studies/my-jazz-day/`, "2026-09-02"],
    [`${siteUrl}/case-studies/blue-giant-seo/`, "2026-11-14"],
    [`${siteUrl}/products/my-home-plan/`, "2026-09-16"],
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
    const publishedAt = new Date(`${item.date}T00:00:00+09:00`);
    const published = publishedAt.toUTCString();
    const feedItem = `<item><title>${item.title}</title><link>${newsUrl}</link><guid isPermaLink="true">${newsUrl}</guid><pubDate>${published}</pubDate><description>${item.description}</description><category>${item.category}</category></item>`;

    const existingItems = [...xml.matchAll(/<item>[\\s\\S]*?<\\/item>/g)];
    const older = existingItems.find((match) => {
      const pubDate = match[0].match(/<pubDate>([^<]+)<\\/pubDate>/)?.[1];
      return pubDate && Date.parse(pubDate) < publishedAt.getTime();
    });
    if (older) {
      xml = `${xml.slice(0, older.index)}${feedItem}\\n    ${xml.slice(older.index)}`;
    } else {
      xml = xml.replace('</channel>', `  ${feedItem}\\n  </channel>`);
    }

    // The newest base NEWS (2026-11-15) must remain the RSS lastBuildDate.
    const lastBuild = xml.match(/<lastBuildDate>([^<]+)<\\/lastBuildDate>/)?.[1];
    if (!lastBuild || Date.parse(lastBuild) < publishedAt.getTime()) {
      xml = xml.replace(/<lastBuildDate>[^<]+<\\/lastBuildDate>/, `<lastBuildDate>${published}</lastBuildDate>`);
    }
  }
  await writeFile(file, xml, "utf8");
}

async function main() {
  await access(path.join(root, `news/${item.slug}/index.html`));
  await access(path.join(root, "case-studies/my-jazz-day/index.html"));
  await patchNewsIndex();
  await patchSitemap();
  await patchFeed();
  console.log("Applied MY JAZZ DAY Case Study, NEWS, sitemap and RSS extensions.");
}
await main();
