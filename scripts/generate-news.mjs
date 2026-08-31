import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newsCategories, newsItems } from "../news/news-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const siteUrl = "https://sakamoto-growth-partners.com";
const companyName = "合同会社SGP";
const companyDescription = "合同会社SGPは、仙台を拠点に、AI・Web・システム開発を活用して企業の売上・業務・組織課題を「現場で動く仕組み」に変える会社です。受託支援に加えて、地域メディア「仙台えらぶ！」をはじめとする自社プロダクト・データ・IPの開発にも取り組んでいます。";

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
  for (const item of newsItems) {
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
  if (newsItems.length !== 13) throw new Error(`Expected 13 news items, received ${newsItems.length}`);
}

const sortedNews = [...newsItems].sort((a, b) => b.date.localeCompare(a.date));

function renderHeader() {
  return `
  <header class="site-header" id="top">
    <div class="container nav-wrap">
      <a class="brand" href="/" aria-label="合同会社SGP トップへ戻る">
        <span class="brand-logo-wrap"><img class="brand-logo" src="/assets/sgp-wordmark.webp" alt="SGP Sakamoto Growth Partners" /></span>
        <span class="brand-text"><strong>合同会社SGP</strong><small>AIとWebで、地域企業の未来を支える</small></span>
      </a>
      <button class="menu-button" type="button" aria-label="メニューを開く" aria-expanded="false" aria-controls="global-navigation" data-menu-button>
        <span></span><span></span><span></span>
      </button>
      <nav class="nav" id="global-navigation" aria-label="メインナビゲーション" data-nav>
        <a href="/#services">サービス</a>
        <a href="/#cases">支援・事例</a>
        <a href="/news/" aria-current="page">NEWS</a>
        <a href="/#company">会社概要</a>
        <a href="/#faq">よくある質問</a>
        <a class="nav-cta" href="mailto:naoya.sakamoto@sakamoto-growth-partners.com?subject=無料30分相談の申し込み">無料30分相談する</a>
      </nav>
    </div>
  </header>`;
}

function renderFooter() {
  return `
  <footer class="site-footer">
    <div class="container news-footer-grid">
      <p>© 2026 合同会社SGP / Sakamoto Growth Partners</p>
      <nav class="news-footer-links" aria-label="フッターナビゲーション">
        <a href="/news/">NEWS</a>
        <a href="/#services">サービス</a>
        <a href="/#company">会社概要</a>
        <a href="mailto:naoya.sakamoto@sakamoto-growth-partners.com">お問い合わせ</a>
      </nav>
      <a href="#top">ページ上部へ</a>
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
  <link rel="stylesheet" href="/styles.css" />
  <link rel="stylesheet" href="/news/news.css" />
${schemas}
</head>
<body class="news-page">
${renderHeader()}
${content}
${renderFooter()}
  <script src="/script.js"></script>
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
      <div class="container news-hero-inner">
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
      <div class="container">
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
        <div class="container news-article-header-inner">
          <nav class="news-breadcrumb" aria-label="パンくずリスト"><a href="/">HOME</a><span aria-hidden="true">/</span><a href="/news/">NEWS</a><span aria-hidden="true">/</span><span aria-current="page">${escapeHtml(item.title)}</span></nav>
          <p class="news-eyebrow">NEWS</p>
          <div class="news-article-meta"><time datetime="${item.date}">${displayDate(item.date)}</time><span class="news-category">${escapeHtml(item.category)}</span></div>
          <h1>${escapeHtml(item.title)}</h1>
          <p class="news-lead">${escapeHtml(item.lead)}</p>
        </div>
      </header>
      <div class="container news-article-body">
${sections}
${renderRelatedLinks(item.relatedLinks)}
        <aside class="news-company" aria-labelledby="news-company-title">
          <p class="news-eyebrow">COMPANY</p>
          <h2 id="news-company-title">合同会社SGPについて</h2>
          <p>${escapeHtml(companyDescription)}</p>
          <div class="news-company-links">
            <a href="/#company">合同会社SGPの会社概要を見る</a>
            <a href="/#services">合同会社SGPのサービスを見る</a>
            <a href="mailto:naoya.sakamoto@sakamoto-growth-partners.com">合同会社SGPへ問い合わせる</a>
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
    <section class="section home-news" aria-labelledby="home-news-title">
      <div class="container home-news-heading">
        <div>
          <p class="section-label">Latest News / Activity</p>
          <h2 id="home-news-title">SGPの最新活動</h2>
          <p>会社の設立以降に開始・公開した事業、プロダクト、研究開発を記録しています。</p>
        </div>
        <a class="home-news-all" href="/news/">すべてのNEWSを見る<span aria-hidden="true"> →</span></a>
      </div>
      <div class="container home-news-list">
${latest.map((item) => `        <article>
          <div><time datetime="${item.date}">${displayDate(item.date)}</time><span>${escapeHtml(item.category)}</span></div>
          <h3><a href="/news/${item.slug}/">${escapeHtml(item.title)}</a></h3>
        </article>`).join("\n")}
      </div>
    </section>
<!-- NEWS_LATEST_END -->`;
}

function renderSitemap() {
  const urls = [
    { loc: `${siteUrl}/`, lastmod: "2026-08-31" },
    { loc: canonicalFor(), lastmod: sortedNews[0].date },
    ...sortedNews.map((item) => ({ loc: canonicalFor(item.slug), lastmod: item.date }))
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

  for (const item of newsItems) {
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
  await writeFile(path.join(rootDir, "sitemap.xml"), renderSitemap(), "utf8");
  await writeFile(path.join(rootDir, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`, "utf8");
  await writeFile(path.join(newsDir, "feed.xml"), renderFeed(), "utf8");

  console.log(`Generated ${newsItems.length} NEWS articles, archive, homepage activity, sitemap and RSS.`);
}

await main();
