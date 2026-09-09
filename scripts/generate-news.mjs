import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newsCategories, newsItems } from "../news/news-data.mjs";
import { extraNewsItems } from "../news/news-extra-data.mjs";
import { insightCategories, publishedInsights } from "../insights/insights-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const siteUrl = "https://sakamoto-growth-partners.com";
const companyName = "合同会社SGP";
const companyDescription = "合同会社SGPは、仙台を拠点に、AI・Web・システム開発を活用して企業の売上・業務・組織課題を「現場で動く仕組み」に変える会社です。受託支援に加えて、地域メディア「仙台えらぶ！」をはじめとする自社プロダクト・データ・IPの開発にも取り組んでいます。";
const baseSitemapPages = [
  "/",
  "/about/",
  "/naoya-sakamoto/",
  "/services/",
  "/services/ai/",
  "/services/business-improvement/",
  "/services/web-marketing/",
  "/cases/",
  "/contact/",
  "/diagnosis/",
  "/faq/",
  "/senior-family-support/",
  "/case-studies/",
  "/case-studies/my-jazz-day/"
];
const allNewsItems = [...newsItems, ...extraNewsItems];

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const escapeXml = escapeHtml;
const jsonForHtml = (value) => JSON.stringify(value, null, 2).replaceAll("<", "\\u003c");
const displayDate = (date) => date.replaceAll("-", ".");
const monthLabel = (date) => new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "Asia/Tokyo" })
  .format(new Date(`${date}T00:00:00+09:00`))
  .toUpperCase();
const dayLabel = (date) => date.slice(8, 10);
const canonicalFor = (slug = "") => `${siteUrl}/news/${slug ? `${slug}/` : ""}`;

function validateNewsData() {
  const slugs = new Set();
  for (const item of allNewsItems) {
    if (!item.slug || !/^[-a-z0-9]+$/.test(item.slug)) throw new Error(`Invalid slug: ${item.slug}`);
    if (slugs.has(item.slug)) throw new Error(`Duplicate slug: ${item.slug}`);
    slugs.add(item.slug);
    if (!/^2026-\d{2}-\d{2}$/.test(item.date)) throw new Error(`Invalid date: ${item.slug}`);
    if (!newsCategories.includes(item.category)) throw new Error(`Invalid category: ${item.slug}`);
    for (const key of ["title", "lead", "description"]) {
      if (!item[key]) throw new Error(`Missing ${key}: ${item.slug}`);
    }
    if (!Array.isArray(item.sections) || item.sections.length === 0) throw new Error(`Missing sections: ${item.slug}`);
  }
  if (allNewsItems.length < 14) throw new Error(`Expected at least 14 news items, received ${allNewsItems.length}`);
}

const sortedNews = [...allNewsItems].sort((a, b) => b.date.localeCompare(a.date));

function renderHeader() {
  return `
  <nav class="sgp-nav" aria-label="メインナビゲーション">
    <div class="sgp-container sgp-nav-inner">
      <a class="sgp-logo" href="/" aria-label="合同会社SGP トップへ">
        <span class="sgp-logo-mark"><img src="/assets/sgp-logo-mark.svg" alt="SGPロゴマーク" /></span>
        <span class="sgp-logo-text"><strong>合同会社SGP</strong><small>Sakamoto Growth Partners</small></span>
      </a>
      <div class="sgp-nav-links">
        <a href="/services/">サービス</a>
        <a href="/insights/">実務ノウハウ</a>
        <a href="/cases/">支援事例</a>
        <a href="/news/" aria-current="page">NEWS</a>
        <a href="/about/">会社情報</a>
        <a href="/faq/">よくある質問</a>
        <a class="sgp-nav-cta" href="/diagnosis/" data-cta-track data-cta-type="diagnosis" data-cta-location="header">無料経営導線診断</a>
      </div>
      <details class="sgp-mobile-menu">
        <summary>メニュー</summary>
        <nav aria-label="スマートフォン用ナビゲーション">
          <a href="/services/">サービス</a>
          <a href="/insights/">実務ノウハウ</a>
          <a href="/cases/">支援事例</a>
          <a href="/case-studies/">開発事例</a>
          <a href="/news/" aria-current="page">NEWS</a>
          <a href="/about/">会社情報</a>
          <a href="/faq/">よくある質問</a>
          <a href="/diagnosis/" data-cta-track data-cta-type="diagnosis" data-cta-location="mobile_menu">無料経営導線診断</a>
        </nav>
      </details>
    </div>
  </nav>`;
}

function renderFooter() {
  return `
  <footer class="sgp-footer">
    <div class="sgp-container sgp-footer-inner">
      <div class="sgp-footer-logo"><img src="/assets/sgp-logo-footer.svg" alt="合同会社SGP ロゴ" loading="lazy" /></div>
      <nav class="sgp-footer-links" aria-label="フッターナビゲーション">
        <a href="/services/">サービス一覧</a><a href="/insights/">実務ノウハウ</a><a href="/cases/">支援事例</a><a href="/case-studies/">開発事例</a><a href="/news/" aria-current="page">NEWS</a><a href="/diagnosis/" data-cta-track data-cta-type="diagnosis" data-cta-location="footer">無料経営導線診断</a><a href="/contact/" data-cta-track data-cta-type="contact" data-cta-location="footer">お問い合わせ</a><a href="/about/">会社情報</a><a href="/naoya-sakamoto/">代表 坂本直哉</a><a href="/faq/">よくある質問</a><a href="/privacy/">プライバシーポリシー</a><a href="https://www.linkedin.com/in/nao329/" target="_blank" rel="noopener noreferrer">LinkedIn</a><a href="https://lin.ee/URIZpwg" target="_blank" rel="noopener noreferrer" data-line-cta data-cta-location="footer">LINEで無料相談する</a>
      </nav>
      <div class="sgp-footer-meta"><span>© 2026 合同会社SGP / Sakamoto Growth Partners</span><span>仙台・宮城｜経営導線を実装するIT工務店</span></div>
    </div>
  </footer>`;
}

function renderBasePage({ title, description, canonical, ogType, content, structuredData, articleDate }) {
  const articleMeta = articleDate
    ? `\n  <meta property="article:published_time" content="${articleDate}" />\n  <meta property="article:modified_time" content="${articleDate}" />`
    : "";
  const schemas = structuredData
    .map((schema) => `  <script type="application/ld+json">\n${jsonForHtml(schema)}\n  </script>`)
    .join("\n");

  return `<!doctype html>
<html lang="ja">
<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-08TBS4LE54"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    window.gtag = window.gtag || gtag;
    gtag('js', new Date());
    gtag('config', 'G-08TBS4LE54');
  </script>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${canonical}" />
  <link rel="alternate" type="application/rss+xml" title="合同会社SGP NEWS" href="${siteUrl}/news/feed.xml" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="${ogType}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:site_name" content="合同会社SGP" />
  <meta property="og:locale" content="ja_JP" />${articleMeta}
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="theme-color" content="#06131a" />
  <link rel="stylesheet" href="/assets/style.css" />
  <link rel="stylesheet" href="/news/news.css" />
${schemas}
</head>
<body style="margin:0">
<section class="sgp-site news-page" id="top" data-page-type="news" data-service-context="general">
${renderHeader()}
${content}
${renderFooter()}
</section>
  <script src="/assets/line-cta-tracking.js"></script>
  <script src="/assets/lead-attribution.js"></script>
  <script src="/assets/site-analytics.js"></script>
</body>
</html>
`;
}

function renderTimeline(items, headingLevel = 3) {
  const groups = new Map();
  for (const item of items) {
    const year = item.date.slice(0, 4);
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(item);
  }
  return [...groups.entries()].map(([year, yearItems]) => `
        <section class="news-year" aria-labelledby="news-year-${year}">
          <h2 id="news-year-${year}">${year}</h2>
          <div class="news-timeline">
${yearItems.map((item) => `            <article class="news-timeline-item">
              <time datetime="${item.date}"><span>${monthLabel(item.date)}</span>${dayLabel(item.date)}</time>
              <p class="news-category">${escapeHtml(item.category)}</p>
              <div>
                <h${headingLevel}><a href="/news/${item.slug}/">${escapeHtml(item.title)}</a></h${headingLevel}>
                <p>${escapeHtml(item.description)}</p>
              </div>
            </article>`).join("\n")}
          </div>
        </section>`).join("\n");
}

function renderNewsIndex() {
  const canonical = canonicalFor();
  const description = "合同会社SGPのサービス、自社プロジェクト、運営メディア、研究開発、IP、会社情報に関する公式発表を掲載しています。";
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "HOME", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: "NEWS", item: canonical }
    ]
  };
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "合同会社SGP NEWS",
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: sortedNews.length,
    itemListElement: sortedNews.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: canonicalFor(item.slug),
      name: item.title
    }))
  };
  const content = `
  <main>
    <header class="news-hero">
      <div class="sgp-container news-hero-inner">
        <nav class="news-breadcrumb" aria-label="パンくずリスト"><a href="/">HOME</a><span aria-hidden="true">/</span><span aria-current="page">NEWS</span></nav>
        <p class="news-eyebrow">NEWS</p>
        <h1>SGPの活動・公開情報</h1>
        <div class="news-hero-copy">
          <p>合同会社SGPのサービス、自社プロジェクト、運営メディア、研究開発、IP、会社情報に関する公式発表を掲載しています。</p>
          <p>完成した実績だけではなく、何をつくり、何を始め、どのように事業を積み上げているのかを、公開可能な事実に基づいて記録します。</p>
        </div>
      </div>
    </header>
    <section class="news-archive" aria-label="NEWS一覧">
      <div class="sgp-container">
${renderTimeline(sortedNews)}
      </div>
    </section>
  </main>`;
  return renderBasePage({
    title: "NEWS｜合同会社SGP",
    description,
    canonical,
    ogType: "website",
    content,
    structuredData: [breadcrumb, itemList]
  });
}

function renderRelatedLinks(links = []) {
  if (!links.length) return "";
  return `
        <section class="news-related" aria-labelledby="related-links-title">
          <h2 id="related-links-title">関連リンク</h2>
          <ul>
${links.map(({ label, href }) => {
    const external = href.startsWith("http");
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : "";
    const suffix = external ? '<span class="visually-hidden">（新しいタブで開きます）</span>' : "";
    return `            <li><a href="${escapeHtml(href)}"${attrs}>${escapeHtml(label)}${suffix}</a></li>`;
  }).join("\n")}
          </ul>
        </section>`;
}

function renderArticle(item) {
  const canonical = canonicalFor(item.slug);
  const newsArticle = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: item.title,
    description: item.description,
    datePublished: item.date,
    dateModified: item.date,
    author: { "@type": "Organization", name: companyName, url: `${siteUrl}/` },
    publisher: { "@type": "Organization", name: companyName, url: `${siteUrl}/` },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    inLanguage: "ja-JP"
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "HOME", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: "NEWS", item: canonicalFor() },
      { "@type": "ListItem", position: 3, name: item.title, item: canonical }
    ]
  };
  const sections = item.sections.map((section) => `
        <section>
          <h2>${escapeHtml(section.heading)}</h2>
${section.body.map((paragraph) => `          <p>${escapeHtml(paragraph)}</p>`).join("\n")}
        </section>`).join("\n");
  const content = `
  <main>
    <article class="news-article">
      <header class="news-article-header">
        <div class="sgp-container news-article-header-inner">
          <nav class="news-breadcrumb" aria-label="パンくずリスト"><a href="/">HOME</a><span aria-hidden="true">/</span><a href="/news/">NEWS</a><span aria-hidden="true">/</span><span aria-current="page">${escapeHtml(item.title)}</span></nav>
          <p class="news-eyebrow">NEWS</p>
          <div class="news-article-meta"><time datetime="${item.date}">${displayDate(item.date)}</time><span class="news-category">${escapeHtml(item.category)}</span></div>
          <h1>${escapeHtml(item.title)}</h1>
          <p class="news-lead">${escapeHtml(item.lead)}</p>
        </div>
      </header>
      <div class="sgp-container news-article-body">
${sections}
${renderRelatedLinks(item.relatedLinks)}
        <aside class="news-company" aria-labelledby="news-company-title">
          <p class="news-eyebrow">COMPANY</p>
          <h2 id="news-company-title">合同会社SGPについて</h2>
          <p>${escapeHtml(companyDescription)}</p>
          <div class="news-company-links">
            <a href="/about/">合同会社SGPの会社概要を見る</a>
            <a href="/services/">合同会社SGPのサービスを見る</a>
            <a href="/contact/">合同会社SGPへ問い合わせる</a>
          </div>
        </aside>
        <p class="news-back"><a href="/news/">← NEWS一覧へ戻る</a></p>
      </div>
    </article>
  </main>`;
  return renderBasePage({
    title: `${item.title}｜合同会社SGP`,
    description: item.description,
    canonical,
    ogType: "article",
    articleDate: item.date,
    content,
    structuredData: [newsArticle, breadcrumb]
  });
}

function renderHomeLatest() {
  const latest = sortedNews.slice(0, 3);
  return `<!-- NEWS_LATEST_START -->
    <section class="sgp-architecture-band sgp-architecture-soft sgp-news-activity" aria-labelledby="home-news-title">
      <div class="sgp-container sgp-news-activity-heading">
        <div>
          <p>Latest News / Activity</p>
          <h2 id="home-news-title">SGPの最新活動</h2>
          <span>会社の設立以降に開始・公開した事業、プロダクト、研究開発を記録しています。</span>
        </div>
        <a class="sgp-news-all" href="/news/">すべてのNEWSを見る<span aria-hidden="true"> →</span></a>
      </div>
      <div class="sgp-container sgp-news-activity-list">
${latest.map((item) => `        <article>
          <div><time datetime="${item.date}">${displayDate(item.date)}</time><span>${escapeHtml(item.category)}</span></div>
          <h3><a href="/news/${item.slug}/">${escapeHtml(item.title)}</a></h3>
        </article>`).join("\n")}
      </div>
    </section>
<!-- NEWS_LATEST_END -->`;
}

function renderAboutActivity() {
  const latest = sortedNews.slice(0, 3);
  return `<!-- NEWS_ACTIVITY_START -->
  <section class="sgp-section sgp-section-soft sgp-news-activity" aria-labelledby="about-news-title">
    <div class="sgp-container">
      <div class="sgp-news-activity-heading">
        <div><p>ACTIVITY</p><h2 id="about-news-title">会社の最新活動</h2><span>合同会社SGPが開始・公開した事業、研究開発、プロダクトの公式記録です。</span></div>
        <a class="sgp-news-all" href="/news/">すべてのNEWSを見る<span aria-hidden="true"> →</span></a>
      </div>
      <div class="sgp-news-activity-list">
${latest.map((item) => `        <article>
          <div><time datetime="${item.date}">${displayDate(item.date)}</time><span>${escapeHtml(item.category)}</span></div>
          <h3><a href="/news/${item.slug}/">${escapeHtml(item.title)}</a></h3>
        </article>`).join("\n")}
      </div>
    </div>
  </section>
<!-- NEWS_ACTIVITY_END -->`;
}

function renderSitemap() {
  const urls = [
    ...baseSitemapPages.map((page) => ({
      loc: `${siteUrl}${page}`,
      lastmod: page.startsWith("/case-studies/") ? "2026-09-02" : "2026-08-31"
    })),
    { loc: canonicalFor(), lastmod: sortedNews[0].date },
    ...sortedNews.map((item) => ({ loc: canonicalFor(item.slug), lastmod: item.date })),
    { loc: `${siteUrl}/insights/`, lastmod: publishedInsights[0].updatedAt || publishedInsights[0].publishedAt },
    ...insightCategories.map((category) => ({
      loc: `${siteUrl}/insights/${category.slug}/`,
      lastmod: publishedInsights
        .filter((article) => article.category === category.slug)
        .reduce((latest, article) => {
          const date = article.updatedAt || article.publishedAt;
          return date > latest ? date : latest;
        }, publishedInsights[0].updatedAt || publishedInsights[0].publishedAt)
    })),
    ...publishedInsights.map((article) => ({
      loc: `${siteUrl}/insights/${article.slug}/`,
      lastmod: article.updatedAt || article.publishedAt
    }))
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(({ loc, lastmod }) => `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`).join("\n")}
</urlset>
`;
}

function renderFeed() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>合同会社SGP NEWS</title>
    <link>${siteUrl}/news/</link>
    <description>合同会社SGPのサービス、自社プロジェクト、運営メディア、研究開発、IP、会社情報に関する公式発表です。</description>
    <language>ja</language>
    <lastBuildDate>${new Date(`${sortedNews[0].date}T00:00:00+09:00`).toUTCString()}</lastBuildDate>
${sortedNews.map((item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${canonicalFor(item.slug)}</link>
      <guid isPermaLink="true">${canonicalFor(item.slug)}</guid>
      <pubDate>${new Date(`${item.date}T00:00:00+09:00`).toUTCString()}</pubDate>
      <description>${escapeXml(item.description)}</description>
      <category>${escapeXml(item.category)}</category>
    </item>`).join("\n")}
  </channel>
</rss>
`;
}

function replaceGeneratedBlock(source, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Generated block markers not found: ${startMarker}`);
  }
  return `${source.slice(0, start)}${replacement}${source.slice(end + endMarker.length)}`;
}

async function main() {
  validateNewsData();
  const newsDir = path.join(rootDir, "news");
  await mkdir(newsDir, { recursive: true });
  await writeFile(path.join(newsDir, "index.html"), renderNewsIndex(), "utf8");

  for (const item of allNewsItems) {
    if (item.renderMode === "custom") continue;
    const articleDir = path.join(newsDir, item.slug);
    await mkdir(articleDir, { recursive: true });
    await writeFile(path.join(articleDir, "index.html"), renderArticle(item), "utf8");
  }

  const indexPath = path.join(rootDir, "index.html");
  const indexSource = await readFile(indexPath, "utf8");
  const nextIndex = replaceGeneratedBlock(
    indexSource,
    "<!-- NEWS_LATEST_START -->",
    "<!-- NEWS_LATEST_END -->",
    renderHomeLatest()
  );
  await writeFile(indexPath, nextIndex, "utf8");
  const aboutPath = path.join(rootDir, "about", "index.html");
  const aboutSource = await readFile(aboutPath, "utf8");
  const nextAbout = replaceGeneratedBlock(
    aboutSource,
    "<!-- NEWS_ACTIVITY_START -->",
    "<!-- NEWS_ACTIVITY_END -->",
    renderAboutActivity()
  );
  await writeFile(aboutPath, nextAbout, "utf8");
  await writeFile(path.join(rootDir, "sitemap.xml"), renderSitemap(), "utf8");
  await writeFile(path.join(newsDir, "feed.xml"), renderFeed(), "utf8");

  console.log(`Generated ${allNewsItems.length} NEWS entries, archive, homepage activity, sitemap and RSS.`);
}

await main();
