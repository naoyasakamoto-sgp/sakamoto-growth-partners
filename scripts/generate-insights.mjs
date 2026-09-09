import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  categoryFor,
  insightArticles,
  insightAuthors,
  insightCategories,
  insightFor,
  publishedInsights,
} from "../insights/insights-data.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteUrl = "https://sakamoto-growth-partners.com";
const organizationId = `${siteUrl}/#organization`;

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");
const jsonForHtml = (value) => JSON.stringify(value, null, 2).replaceAll("<", "\\u003c");
const displayDate = (date) => date.replaceAll("-", ".");
const canonicalFor = (pathName = "") => `${siteUrl}/insights/${pathName ? `${pathName}/` : ""}`;

const serviceLabels = {
  "/services/ai/": "AI導入・生成AI活用支援",
  "/services/business-improvement/": "業務改善・DX支援",
  "/services/web-marketing/": "Web集客・営業導線支援",
};

const ctaPresets = {
  diagnosis: {
    eyebrow: "NEXT STEP / DIAGNOSIS",
    title: "自社では、どこから改善すべきか分からない方へ",
    text: "現在の認知、問い合わせ、商談、見積、受注、案件、継続の流れを整理し、改善優先順位を確認します。",
    label: "無料経営導線診断を受ける",
    href: "/diagnosis/?source=insights",
  },
  "service-ai": {
    eyebrow: "RELATED SERVICE",
    title: "AIを業務へ組み込む方法を具体化したい方へ",
    text: "業務整理、データ、権限、人の確認を含めて、現場で使えるAI導入を設計します。",
    label: "AI導入・生成AI活用支援を見る",
    href: "/services/ai/",
  },
  "service-business-improvement": {
    eyebrow: "RELATED SERVICE",
    title: "Excel・紙・転記を、現場で動く仕組みに変えたい方へ",
    text: "現在の業務を分解し、既存SaaS・CRM・個別開発を比較して、必要な範囲から実装します。",
    label: "業務改善・DX支援を見る",
    href: "/services/business-improvement/",
  },
  "service-web": {
    eyebrow: "RELATED SERVICE",
    title: "問い合わせから受注までの導線を整理したい方へ",
    text: "Web、フォーム、LINE、CRMを接続し、次の行動が分かる営業導線を設計します。",
    label: "Web集客・営業導線支援を見る",
    href: "/services/web-marketing/",
  },
  contact: {
    eyebrow: "CONTACT",
    title: "具体的な課題について相談する",
    text: "要件が固まっていない段階から、現在の状況と優先順位を一緒に整理します。",
    label: "合同会社SGPへ相談する",
    href: "/contact/?source=insights",
  },
};

function validateData() {
  const categorySlugs = new Set(insightCategories.map((category) => category.slug));
  const slugs = new Set();
  for (const article of insightArticles) {
    if (!/^[-a-z0-9]+$/.test(article.slug) || slugs.has(article.slug)) throw new Error(`Invalid or duplicate insight slug: ${article.slug}`);
    slugs.add(article.slug);
    if (!categorySlugs.has(article.category)) throw new Error(`Unknown insight category: ${article.slug}`);
    if (!insightAuthors[article.author]) throw new Error(`Unknown insight author: ${article.slug}`);
    if (!["draft", "published"].includes(article.status)) throw new Error(`Invalid insight status: ${article.slug}`);
    if (!Array.isArray(article.sections) || !article.sections.length) throw new Error(`Insight sections missing: ${article.slug}`);
    if (!ctaPresets[article.ctaType]) throw new Error(`Unknown CTA type: ${article.slug}`);
    for (const relatedSlug of article.relatedArticles || []) {
      if (!insightArticles.some((candidate) => candidate.slug === relatedSlug)) throw new Error(`Unknown related insight ${relatedSlug}: ${article.slug}`);
    }
  }
}

function readingMinutes(article) {
  const textLength = JSON.stringify({ summary: article.summary, sections: article.sections })
    .replace(/[\s{}\[\]":,]/g, "").length;
  return Math.max(5, Math.ceil(textLength / 500));
}

function renderHeader(active = "insights") {
  const current = (key) => active === key ? ' aria-current="page"' : "";
  return `<nav class="sgp-nav" aria-label="メインナビゲーション">
    <div class="sgp-container sgp-nav-inner">
      <a class="sgp-logo" href="/" aria-label="合同会社SGP トップへ"><span class="sgp-logo-mark"><img src="/assets/sgp-logo-mark.svg" alt="" /></span><span class="sgp-logo-text"><strong>合同会社SGP</strong><small>Sakamoto Growth Partners</small></span></a>
      <div class="sgp-nav-links">
        <a href="/services/">サービス</a><a href="/insights/"${current("insights")}>実務ノウハウ</a><a href="/cases/">支援事例</a><a href="/news/"${current("news")}>NEWS</a><a href="/about/">会社情報</a><a class="sgp-nav-cta" href="/diagnosis/" data-cta-track data-cta-type="diagnosis" data-cta-location="header">無料診断</a>
      </div>
      <details class="sgp-mobile-menu"><summary>メニュー</summary><nav aria-label="スマートフォン用ナビゲーション"><a href="/services/">サービス</a><a href="/insights/"${current("insights")}>実務ノウハウ</a><a href="/cases/">支援事例</a><a href="/case-studies/">開発事例</a><a href="/news/"${current("news")}>NEWS</a><a href="/about/">会社情報</a><a href="/faq/">よくある質問</a><a href="/diagnosis/" data-cta-track data-cta-type="diagnosis" data-cta-location="mobile_menu">無料経営導線診断</a></nav></details>
    </div>
  </nav>`;
}

function renderFooter() {
  return `<footer class="sgp-footer"><div class="sgp-container sgp-footer-inner"><div class="sgp-footer-logo"><img src="/assets/sgp-logo-footer.svg" alt="合同会社SGP ロゴ" loading="lazy" /></div><nav class="sgp-footer-links" aria-label="フッターナビゲーション"><a href="/services/">サービス一覧</a><a href="/insights/">実務ノウハウ</a><a href="/cases/">支援事例</a><a href="/case-studies/">開発事例</a><a href="/news/">NEWS</a><a href="/diagnosis/" data-cta-track data-cta-type="diagnosis" data-cta-location="footer">無料経営導線診断</a><a href="/contact/">お問い合わせ</a><a href="/about/">会社情報</a><a href="/naoya-sakamoto/">代表 坂本直哉</a><a href="/faq/">よくある質問</a><a href="/privacy/">プライバシーポリシー</a></nav><div class="sgp-footer-meta"><span>© 2026 合同会社SGP / Sakamoto Growth Partners</span><span>仙台・宮城｜経営導線を実装するIT工務店</span></div></div></footer>`;
}

function renderBasePage({ title, description, canonical, content, schemas, pageType, bodyData = "" }) {
  return `<!doctype html>
<html lang="ja">
<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-08TBS4LE54"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=window.gtag||gtag;gtag("js",new Date());gtag("config","G-08TBS4LE54");</script>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:type" content="${pageType === "insight" ? "article" : "website"}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${siteUrl}/ogp.png" />
  <meta property="og:site_name" content="合同会社SGP" />
  <meta property="og:locale" content="ja_JP" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${siteUrl}/ogp.png" />
  <meta name="theme-color" content="#06293d" />
  <link rel="icon" href="/assets/sgp-logo-mark.svg" />
  <link rel="stylesheet" href="/assets/style.css" />
  <link rel="stylesheet" href="/insights/insights.css" />
${schemas.map((schema) => `  <script type="application/ld+json">\n${jsonForHtml(schema)}\n  </script>`).join("\n")}
</head>
<body style="margin:0">
<section class="sgp-site insights-page" id="top" data-page-type="${pageType}" data-service-context="general" ${bodyData}>
${renderHeader("insights")}
${content}
${renderFooter()}
</section>
  <script src="/assets/line-cta-tracking.js"></script>
  <script src="/assets/lead-attribution.js"></script>
  <script src="/assets/site-analytics.js"></script>
  <script src="/insights/insights.js"></script>
</body>
</html>\n`;
}

function renderInsightCard(article, context) {
  const category = categoryFor(article.category);
  return `<article class="insight-card" data-insight-card data-category="${article.category}" data-tags="${escapeHtml(article.tags.join("|"))}"><p class="insight-card-meta"><span>${escapeHtml(category.name)}</span><time datetime="${article.publishedAt}">${displayDate(article.publishedAt)}</time><small>${readingMinutes(article)}分</small></p><h3><a href="/insights/${article.slug}/" data-analytics-event="${context === "related" ? "insight_related_article_click" : "insight_article_click"}" data-article-slug="${article.slug}" data-destination="/insights/${article.slug}/">${escapeHtml(article.title)}</a></h3><p>${escapeHtml(article.description)}</p><ul aria-label="タグ">${article.tags.slice(0, 3).map((tag) => `<li>${escapeHtml(tag)}</li>`).join("")}</ul></article>`;
}

function renderBlock(block) {
  if (block.type === "paragraph") return `<p>${escapeHtml(block.text)}</p>`;
  if (block.type === "checklist") return `<div class="insight-checklist"><ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`;
  if (block.type === "judgement") return `<aside class="insight-judgement"><p>SGP JUDGEMENT</p><h3>${escapeHtml(block.title)}</h3><p>${escapeHtml(block.text)}</p></aside>`;
  if (block.type === "framework") return `<figure class="insight-framework"><figcaption>${escapeHtml(block.title)}</figcaption><ol>${block.factors.map((factor) => `<li>${escapeHtml(factor)}</li>`).join("")}</ol></figure>`;
  if (block.type === "table") return `<div class="insight-table-wrap" tabindex="0" role="region" aria-label="${escapeHtml(block.caption)}"><table><caption>${escapeHtml(block.caption)}</caption><thead><tr>${block.headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${block.rows.map((row) => `<tr>${row.map((cell, index) => index === 0 ? `<th scope="row">${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  if (block.type === "matrix") return `<div class="insight-matrix">${block.axes.map((axis) => `<section><h3>${escapeHtml(axis.title)}</h3><p>${escapeHtml(axis.text)}</p></section>`).join("")}</div>`;
  if (block.type === "process") return `<figure class="insight-process"><div><figcaption>${escapeHtml(block.beforeLabel)}</figcaption><ol>${block.before.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol></div><span aria-hidden="true">→</span><div><figcaption>${escapeHtml(block.afterLabel)}</figcaption><ol>${block.after.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol></div></figure>`;
  if (block.type === "architecture") return `<figure class="insight-architecture"><figcaption>実装構成</figcaption><ol>${block.nodes.map((node) => `<li>${escapeHtml(node)}</li>`).join("")}</ol></figure>`;
  if (block.type === "risk") return `<aside class="insight-risk"><h3>${escapeHtml(block.title)}</h3><ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></aside>`;
  if (block.type === "fit") return `<div class="insight-fit"><section><h3>向いている</h3><ul>${block.fit.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section><section><h3>向いていない・先に整理が必要</h3><ul>${block.notFit.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section></div>`;
  if (block.type === "roi") return `<aside class="insight-roi"><p>MODEL CASE / 試算</p><h3>ROIの計算方法</h3><code>${escapeHtml(block.formula)}</code><dl><dt>仮定</dt><dd>${block.assumptions.map((item) => escapeHtml(item)).join(" / ")}</dd><dt>計算例</dt><dd>${escapeHtml(block.result)}</dd></dl><small>以下はモデルケースによる試算です。実際の効果を保証するものではありません。</small></aside>`;
  throw new Error(`Unknown insight block: ${block.type}`);
}

function breadcrumb(items) {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: item.url })) };
}

function renderIndex() {
  const canonical = canonicalFor();
  const featured = publishedInsights.filter((article) => article.featured).slice(0, 3);
  const tags = [...new Set(publishedInsights.flatMap((article) => article.tags))].sort((a, b) => a.localeCompare(b, "ja"));
  const content = `<main><header class="insights-hero"><div class="sgp-container"><nav class="insight-breadcrumb" aria-label="パンくずリスト"><a href="/">HOME</a><span>/</span><span aria-current="page">実務ノウハウ</span></nav><p class="insight-eyebrow">INSIGHTS</p><h1>経営と現場で使える<br />実務ノウハウ</h1><p>AI・業務改善・Web・営業について、「何ができるか」ではなく「どう仕事を変えるか」から解説します。</p></div></header>
  <section class="insight-band" aria-labelledby="featured-title"><div class="sgp-container"><div class="insight-heading"><p>FEATURED</p><h2 id="featured-title">最初に読んでほしい記事</h2></div><div class="insight-card-grid">${featured.map((article) => renderInsightCard(article, "featured")).join("")}</div></div></section>
  <section class="insight-band insight-soft" aria-labelledby="category-title"><div class="sgp-container"><div class="insight-heading"><p>CATEGORIES</p><h2 id="category-title">課題から探す</h2></div><div class="insight-category-grid">${insightCategories.map((category) => `<a href="/insights/${category.slug}/"><span>${escapeHtml(category.name)}</span><p>${escapeHtml(category.description)}</p><small>${publishedInsights.filter((article) => article.category === category.slug).length}記事</small></a>`).join("")}</div></div></section>
  <section class="insight-band" aria-labelledby="latest-title"><div class="sgp-container"><div class="insight-heading"><p>LATEST</p><h2 id="latest-title">実務ノウハウ一覧</h2></div><div class="insight-filters" aria-label="記事の絞り込み"><div><button type="button" data-insight-category="all" aria-pressed="true">すべて</button>${insightCategories.map((category) => `<button type="button" data-insight-category="${category.slug}" aria-pressed="false">${escapeHtml(category.name)}</button>`).join("")}</div><label>タグ<select data-insight-tag><option value="all">すべてのタグ</option>${tags.map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join("")}</select></label><p data-insight-filter-status aria-live="polite">${publishedInsights.length}件を表示</p></div><div class="insight-card-grid insight-latest-grid">${publishedInsights.map((article) => renderInsightCard(article, "latest")).join("")}</div></div></section>
  ${renderEndCta(ctaPresets.diagnosis, "insights-index")}</main>`;
  const itemList = { "@context": "https://schema.org", "@type": "ItemList", name: "合同会社SGP 実務ノウハウ", numberOfItems: publishedInsights.length, itemListElement: publishedInsights.map((article, index) => ({ "@type": "ListItem", position: index + 1, url: canonicalFor(article.slug), name: article.title })) };
  return renderBasePage({ title: "実務ノウハウ｜AI・業務改善・営業を仕事から考える｜合同会社SGP", description: "中小企業のAI活用、業務改善、Excel・CRM、Web・営業導線について、経営課題と現場の仕事から具体的に解説する合同会社SGPの実務ナレッジです。", canonical, content, pageType: "insights-index", schemas: [breadcrumb([{ name: "HOME", url: `${siteUrl}/` }, { name: "実務ノウハウ", url: canonical }]), itemList] });
}

function renderCategoryPage(category) {
  const canonical = canonicalFor(category.slug);
  const articles = publishedInsights.filter((article) => article.category === category.slug);
  const list = articles.length ? `<div class="insight-card-grid">${articles.map((article) => renderInsightCard(article, "category")).join("")}</div>` : `<div class="insight-empty"><h2>公開準備中です</h2><p>このカテゴリの記事は、事実確認と実務上の判断基準を整えたうえで順次公開します。</p><a href="/insights/">公開中の実務ノウハウを見る</a></div>`;
  const content = `<main><header class="insight-category-hero"><div class="sgp-container"><nav class="insight-breadcrumb" aria-label="パンくずリスト"><a href="/">HOME</a><span>/</span><a href="/insights/">実務ノウハウ</a><span>/</span><span aria-current="page">${escapeHtml(category.name)}</span></nav><p class="insight-eyebrow">INSIGHTS / CATEGORY</p><h1>${escapeHtml(category.name)}</h1><p>${escapeHtml(category.description)}</p></div></header><section class="insight-band"><div class="sgp-container">${list}<nav class="insight-category-nav" aria-label="実務ノウハウのカテゴリ">${insightCategories.map((item) => `<a href="/insights/${item.slug}/"${item.slug === category.slug ? ' aria-current="page"' : ""}>${escapeHtml(item.name)}</a>`).join("")}</nav></div></section>${renderEndCta(ctaPresets.diagnosis, `category-${category.slug}`)}</main>`;
  const collection = { "@context": "https://schema.org", "@type": "CollectionPage", name: `${category.name}の実務ノウハウ`, description: category.description, url: canonical, mainEntity: { "@type": "ItemList", numberOfItems: articles.length, itemListElement: articles.map((article, index) => ({ "@type": "ListItem", position: index + 1, url: canonicalFor(article.slug), name: article.title })) } };
  return renderBasePage({ title: `${category.name}の実務ノウハウ｜合同会社SGP`, description: category.description, canonical, content, pageType: "insights-category", schemas: [breadcrumb([{ name: "HOME", url: `${siteUrl}/` }, { name: "実務ノウハウ", url: canonicalFor() }, { name: category.name, url: canonical }]), collection] });
}

function renderEndCta(cta, location) {
  const ctaType = cta.href.startsWith("/diagnosis/") ? "diagnosis" : cta.href.startsWith("/contact/") ? "contact" : "service";
  return `<section class="insight-end-cta"><div class="sgp-container"><p>${escapeHtml(cta.eyebrow)}</p><h2>${escapeHtml(cta.title)}</h2><span>${escapeHtml(cta.text)}</span><a href="${cta.href}" data-analytics-event="insight_cta_click" data-cta-type="${ctaType}" data-cta-location="${location}" data-destination="${cta.href}">${escapeHtml(cta.label)}<span aria-hidden="true"> →</span></a></div></section>`;
}

function renderArticle(article) {
  const category = categoryFor(article.category);
  const author = insightAuthors[article.author];
  const canonical = canonicalFor(article.slug);
  const minutes = readingMinutes(article);
  const related = (article.relatedArticles || []).map(insightFor).filter(Boolean);
  const relatedServices = (article.relatedServices || []).filter((href) => serviceLabels[href]);
  const middleIndex = Math.ceil(article.sections.length / 2);
  const sections = article.sections.map((section, index) => `${index === middleIndex ? `<aside class="insight-mid-link"><p>関連サービス</p><a href="${relatedServices[0] || "/services/"}" data-analytics-event="insight_service_click" data-article-slug="${article.slug}" data-destination="${relatedServices[0] || "/services/"}">${escapeHtml(serviceLabels[relatedServices[0]] || "合同会社SGPのサービスを見る")}<span aria-hidden="true"> →</span></a></aside>` : ""}<section id="${section.id}" class="insight-article-section"><h2>${escapeHtml(section.title)}</h2>${section.blocks.map(renderBlock).join("")}</section>`).join("");
  const content = `<main><article class="insight-article" data-insight-article><header class="insight-article-header"><div class="sgp-container"><nav class="insight-breadcrumb" aria-label="パンくずリスト"><a href="/">HOME</a><span>/</span><a href="/insights/">実務ノウハウ</a><span>/</span><a href="/insights/${category.slug}/">${escapeHtml(category.name)}</a></nav><p class="insight-eyebrow">INSIGHTS / ${escapeHtml(category.name)}</p><h1>${escapeHtml(article.title)}</h1><p class="insight-article-description">${escapeHtml(article.description)}</p><dl class="insight-byline"><div><dt>執筆</dt><dd><a href="${author.profileUrl}">${escapeHtml(author.name)}</a> / ${escapeHtml(author.role)}</dd></div><div><dt>公開</dt><dd><time datetime="${article.publishedAt}">${displayDate(article.publishedAt)}</time></dd></div><div><dt>更新</dt><dd><time datetime="${article.updatedAt || article.publishedAt}">${displayDate(article.updatedAt || article.publishedAt)}</time></dd></div><div><dt>読了目安</dt><dd>${minutes}分</dd></div></dl></div></header><div class="sgp-container insight-article-layout"><aside class="insight-toc"><details open><summary>目次</summary><ol>${article.sections.map((section) => `<li><a href="#${section.id}">${escapeHtml(section.title)}</a></li>`).join("")}</ol></details></aside><div class="insight-reading"><section class="insight-learn"><h2>この記事で分かること</h2><ul>${article.whatYouLearn.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section><section class="insight-summary"><p>SUMMARY / 3行結論</p><h2>先に結論</h2><ol>${article.summary.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol></section>${sections}<section class="insight-related-services"><h2>関連サービス</h2><ul>${relatedServices.map((href) => `<li><a href="${href}" data-analytics-event="insight_service_click" data-article-slug="${article.slug}" data-destination="${href}">${escapeHtml(serviceLabels[href])}</a></li>`).join("")}</ul></section><section class="insight-related"><h2>関連記事</h2><div class="insight-card-grid">${related.map((item) => renderInsightCard(item, "related")).join("")}</div></section></div></div></article>${renderEndCta(ctaPresets[article.ctaType], `article-${article.slug}`)}</main>`;
  const blogPosting = { "@context": "https://schema.org", "@type": "BlogPosting", "@id": `${canonical}#article`, headline: article.title, description: article.description, datePublished: article.publishedAt, dateModified: article.updatedAt || article.publishedAt, author: { "@type": "Person", name: author.name, url: `${siteUrl}${author.profileUrl}` }, publisher: { "@type": "Organization", "@id": organizationId, name: "合同会社SGP", url: `${siteUrl}/` }, mainEntityOfPage: { "@type": "WebPage", "@id": canonical }, inLanguage: "ja-JP", keywords: article.tags.join(", ") };
  return renderBasePage({ title: article.seoTitle, description: article.seoDescription, canonical, content, pageType: "insight", bodyData: `data-article-slug="${article.slug}" data-article-title="${escapeHtml(article.title)}" data-category="${article.category}"`, schemas: [blogPosting, breadcrumb([{ name: "HOME", url: `${siteUrl}/` }, { name: "実務ノウハウ", url: canonicalFor() }, { name: category.name, url: canonicalFor(category.slug) }, { name: article.title, url: canonical }])] });
}

function renderHomeBlock() {
  const featured = publishedInsights.slice(0, 3);
  return `<!-- INSIGHTS_HOME_START -->
    <section class="sgp-architecture-band sgp-insights-home" aria-labelledby="home-insights-title"><div class="sgp-container"><div class="sgp-architecture-heading"><p>INSIGHTS</p><h2 id="home-insights-title">経営と現場で使える実務ノウハウ</h2><span>AI・Web・CRM・業務改善について、「何ができるか」ではなく「どう仕事を変えるか」から解説します。</span></div><div class="sgp-insights-home-grid">${featured.map((article) => `<article><p><span>${escapeHtml(categoryFor(article.category).name)}</span><time datetime="${article.publishedAt}">${displayDate(article.publishedAt)}</time></p><h3><a href="/insights/${article.slug}/">${escapeHtml(article.title)}</a></h3><span>${escapeHtml(article.description)}</span></article>`).join("")}</div><a class="sgp-insights-home-all" href="/insights/">すべての実務ノウハウを見る<span aria-hidden="true"> →</span></a></div></section>
<!-- INSIGHTS_HOME_END -->`;
}

function replaceGeneratedBlock(source, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start < 0 || end < start) throw new Error(`Missing generated marker: ${startMarker}`);
  return `${source.slice(0, start)}${replacement}${source.slice(end + endMarker.length)}`;
}

async function main() {
  validateData();
  const insightsDir = path.join(rootDir, "insights");
  await mkdir(insightsDir, { recursive: true });
  await writeFile(path.join(insightsDir, "index.html"), renderIndex(), "utf8");
  for (const category of insightCategories) {
    const categoryDir = path.join(insightsDir, category.slug);
    await mkdir(categoryDir, { recursive: true });
    await writeFile(path.join(categoryDir, "index.html"), renderCategoryPage(category), "utf8");
  }
  for (const article of publishedInsights) {
    const articleDir = path.join(insightsDir, article.slug);
    await mkdir(articleDir, { recursive: true });
    await writeFile(path.join(articleDir, "index.html"), renderArticle(article), "utf8");
  }
  const unpublished = insightArticles.filter((article) => article.status !== "published");
  for (const article of unpublished) {
    try { await access(path.join(insightsDir, article.slug, "index.html")); throw new Error(`Draft output exists: ${article.slug}`); } catch (error) { if (!String(error.message).includes("ENOENT")) throw error; }
  }
  const homePath = path.join(rootDir, "index.html");
  const home = await readFile(homePath, "utf8");
  await writeFile(homePath, replaceGeneratedBlock(home, "<!-- INSIGHTS_HOME_START -->", "<!-- INSIGHTS_HOME_END -->", renderHomeBlock()), "utf8");
  console.log(`Generated INSIGHTS index, ${insightCategories.length} categories and ${publishedInsights.length} published articles.`);
}

await main();
