import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publicWorks, workCategories } from "../works/works-data.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteUrl = "https://sakamoto-growth-partners.com";
const company = {
  "@type": "Organization",
  "@id": `${siteUrl}/#organization`,
  name: "合同会社SGP",
  alternateName: "Sakamoto Growth Partners",
  url: `${siteUrl}/`,
};

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");
const jsonForHtml = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
const absoluteUrl = (pathname) => new URL(pathname, `${siteUrl}/`).href;
const canonicalFor = (slug = "") => `${siteUrl}/works/${slug ? `${slug}/` : ""}`;
const categoryLabel = (slug) => workCategories.find((category) => category.slug === slug)?.label || slug;

function renderGoogleTag() {
  return `<!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-08TBS4LE54"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=window.gtag||gtag;gtag("js",new Date());gtag("config","G-08TBS4LE54");</script>`;
}

function renderHeader() {
  return `<nav class="sgp-nav" aria-label="メインナビゲーション">
    <div class="sgp-container sgp-nav-inner">
      <a class="sgp-logo" href="/" aria-label="合同会社SGP トップへ"><span class="sgp-logo-mark"><img src="/assets/sgp-logo-mark.svg" alt="" /></span><span class="sgp-logo-text"><strong>合同会社SGP</strong><small>Sakamoto Growth Partners</small></span></a>
      <div class="sgp-nav-links"><a href="/services/">サービス</a><a href="/insights/">実務ノウハウ</a><a href="/works/" aria-current="page">制作・開発実績</a><a href="/news/">NEWS</a><a href="/about/">会社情報</a><a class="sgp-nav-cta" href="/contact/?source=works&intent=project-development" data-cta-track data-cta-type="contact" data-cta-location="header">相談する</a></div>
      <details class="sgp-mobile-menu"><summary>メニュー</summary><nav aria-label="スマートフォン用ナビゲーション"><a href="/services/">サービス</a><a href="/insights/">実務ノウハウ</a><a href="/works/" aria-current="page">制作・開発実績</a><a href="/cases/">顧客事例の公開方針</a><a href="/case-studies/">開発事例</a><a href="/news/">NEWS</a><a href="/about/">会社情報</a><a href="/faq/">よくある質問</a><a href="/contact/?source=works&intent=project-development" data-cta-track data-cta-type="contact" data-cta-location="mobile_menu">相談する</a></nav></details>
    </div>
  </nav>`;
}

function renderFooter() {
  return `<footer class="sgp-footer"><div class="sgp-container sgp-footer-inner"><div class="sgp-footer-logo"><img src="/assets/sgp-logo-footer.svg" alt="合同会社SGP ロゴ" loading="lazy" /></div><nav class="sgp-footer-links" aria-label="フッターナビゲーション"><a href="/services/">サービス一覧</a><a href="/insights/">実務ノウハウ</a><a href="/works/" aria-current="page">制作・開発実績</a><a href="/cases/">顧客事例の公開方針</a><a href="/case-studies/">開発事例</a><a href="/news/">NEWS</a><a href="/diagnosis/" data-cta-track data-cta-type="diagnosis" data-cta-location="footer">無料経営導線診断</a><a href="/contact/?source=works&intent=project-development" data-cta-track data-cta-type="contact" data-cta-location="footer">お問い合わせ</a><a href="/about/">会社情報</a><a href="/naoya-sakamoto/">代表 坂本直哉</a><a href="/faq/">よくある質問</a><a href="/privacy/">プライバシーポリシー</a></nav><div class="sgp-footer-meta"><span>© 2026 合同会社SGP / Sakamoto Growth Partners</span><span>仙台・宮城｜経営導線を実装するIT工務店</span></div></div></footer>`;
}

function renderPage({ title, description, canonical, content, schemas, pageType, pageAttributes = "" }) {
  return `<!doctype html>
<html lang="ja" prefix="og: https://ogp.me/ns#">
<head>
  ${renderGoogleTag()}
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${siteUrl}/ogp.png" />
  <meta property="og:site_name" content="合同会社SGP / Sakamoto Growth Partners" />
  <meta property="og:locale" content="ja_JP" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${siteUrl}/ogp.png" />
  <meta name="theme-color" content="#06324a" />
  <link rel="icon" href="/assets/sgp-logo-mark.svg" />
  <link rel="stylesheet" href="/assets/style.css" />
  <link rel="stylesheet" href="/works/works.css" />
${schemas.map((schema) => `  <script type="application/ld+json">${jsonForHtml(schema)}</script>`).join("\n")}
</head>
<body class="works-body">
<section class="sgp-site works-page" data-page-type="${pageType}"${pageAttributes} id="top">
${renderHeader()}
${content}
${renderFooter()}
</section>
<script src="/assets/line-cta-tracking.js"></script><script src="/assets/lead-attribution.js"></script><script src="/assets/site-analytics.js"></script>
</body>
</html>
`;
}

function renderWorkCard(work) {
  return `<article class="works-card" data-work-card data-categories="${work.categories.join(" ")}">
    <a href="/works/${work.slug}/" aria-label="${escapeHtml(work.projectName)}の実績を詳しく見る" data-analytics-event="works_detail_click" data-work-slug="${work.slug}">
      <div class="works-card-copy"><p class="works-card-type">${escapeHtml(work.type)}</p><h2>${escapeHtml(work.title)}</h2><p class="works-card-name">${escapeHtml(work.projectName)}</p><p>${escapeHtml(work.summary)}</p><ul aria-label="技術タグ">${work.technologies.map((technology) => `<li>${escapeHtml(technology)}</li>`).join("")}</ul><strong>詳しく見る<span aria-hidden="true"> →</span></strong></div>
      <figure class="works-card-media"><img src="${work.heroImage}" alt="${escapeHtml(work.heroImageAlt)}" loading="lazy" width="720" height="1280" /><figcaption>公開中の自社開発プロダクト画面</figcaption></figure>
    </a>
  </article>`;
}

function renderWorksIndex() {
  const canonical = canonicalFor();
  const title = "制作実績・自社開発｜合同会社SGP";
  const description = "SGPが企画・設計・開発したWeb、AI、業務システム、自社開発プロジェクトをご紹介します。";
  const collectionPage = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${canonical}#webpage`,
    name: title,
    description,
    url: canonical,
    isPartOf: { "@type": "WebSite", "@id": `${siteUrl}/#website`, name: "合同会社SGP", url: `${siteUrl}/` },
    about: company,
  };
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "合同会社SGP 制作・開発実績",
    numberOfItems: publicWorks.length,
    itemListElement: publicWorks.map((work, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: work.projectName,
      url: canonicalFor(work.slug),
    })),
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "HOME", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: "制作・開発実績", item: canonical },
    ],
  };
  const filters = workCategories.map((category) => {
    const count = category.slug === "all" ? publicWorks.length : publicWorks.filter((work) => work.categories.includes(category.slug)).length;
    return `<button type="button" data-work-filter="${category.slug}" aria-pressed="${category.slug === "all"}">${escapeHtml(category.label)}<span>${count}</span></button>`;
  }).join("");
  const content = `<main>
    <header class="works-index-hero"><div class="works-shell"><nav class="works-breadcrumb" aria-label="パンくずリスト"><a href="/">HOME</a><span aria-hidden="true">/</span><span aria-current="page">WORKS</span></nav><p class="works-eyebrow">WORKS</p><h1>つくったものではなく、<br />業務や体験がどう変わるかまで。</h1><p>SGPでは、AI・Web・業務改善・システム開発について、実際に企画・設計・実装したプロジェクトを掲載しています。</p><p>現時点では自社開発プロジェクトを中心に公開しています。</p></div></header>
    <section class="works-type-guide" aria-labelledby="works-type-title"><div class="works-shell"><div class="works-section-heading"><p class="works-eyebrow">CLASSIFICATION</p><h2 id="works-type-title">実績の種類を明確に分けて掲載します</h2></div><div class="works-type-grid"><article><span>01</span><h3>自社開発</h3><p>SGPが自ら企画・開発・運用し、実装と改善の知見を蓄積するプロジェクト。</p></article><article><span>02</span><h3>顧客事例</h3><p>事実確認と公開許可がそろった案件のみ、合意した範囲で掲載します。</p></article><article><span>03</span><h3>SGP Lab</h3><p>仮説検証や技術調査を目的とした研究開発。実運用中の成果とは区別します。</p></article></div></div></section>
    <section class="works-list-section" aria-labelledby="works-list-title"><div class="works-shell"><div class="works-section-heading"><p class="works-eyebrow">PROJECTS</p><h2 id="works-list-title">制作・開発実績</h2></div><div class="works-filters" role="group" aria-label="実績カテゴリで絞り込む">${filters}</div><p class="works-filter-status" data-work-status aria-live="polite">${publicWorks.length}件を表示</p><div class="works-grid">${publicWorks.map(renderWorkCard).join("\n")}</div><div class="works-empty" data-work-empty hidden><h3>該当カテゴリの公開実績は準備中です</h3><p>公開許可と事実確認が完了したプロジェクトから追加します。</p></div></div></section>
    <section class="works-final"><div class="works-shell works-final-inner"><div><p class="works-eyebrow">PROJECT CONSULTATION</p><h2>構想を、動く仕組みへ。</h2><p>Web、AI、データ、業務システムのどこから着手すべきかを、現在の業務から整理します。</p></div><a class="works-button works-button-primary" href="/contact/?source=works&intent=project-development" data-cta-track data-cta-type="contact" data-cta-location="final" data-analytics-event="works_contact_click">SGPに相談する</a></div></section>
  </main><script src="/works/works.js"></script>`;
  return renderPage({ title, description, canonical, content, schemas: [collectionPage, itemList, breadcrumb], pageType: "works-index" });
}

function renderDataList(label, values) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${values.map((value) => `<span>${escapeHtml(value)}</span>`).join("")}</dd></div>`;
}

function renderWorkDetail(work) {
  const canonical = canonicalFor(work.slug);
  const title = `${work.projectName}｜自社開発実績｜合同会社SGP`;
  const description = `SGPが企画・開発・運用する地域情報プラットフォーム「${work.projectName}」。Next.js、Local Data、SEO、構造化データを活用した自社開発事例です。`;
  const webPage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${canonical}#webpage`,
    name: title,
    description,
    url: canonical,
    inLanguage: "ja-JP",
    isPartOf: { "@type": "WebSite", "@id": `${siteUrl}/#website`, name: "合同会社SGP", url: `${siteUrl}/` },
    about: { "@id": `${canonical}#creative-work` },
  };
  const creativeWork = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "@id": `${canonical}#creative-work`,
    name: work.projectName,
    headline: work.title,
    description: work.summary,
    url: canonical,
    image: absoluteUrl(work.heroImage),
    datePublished: work.publishedAt,
    creator: company,
    publisher: company,
    about: ["地域メディア", "Local Data", "Web Platform", "SEO", "Structured Data"],
    inLanguage: "ja-JP",
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "HOME", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: "制作・開発実績", item: canonicalFor() },
      { "@type": "ListItem", position: 3, name: work.projectName, item: canonical },
    ],
  };
  const content = `<main>
    <header class="works-detail-hero"><div class="works-shell"><nav class="works-breadcrumb" aria-label="パンくずリスト"><a href="/">HOME</a><span aria-hidden="true">/</span><a href="/works/">WORKS</a><span aria-hidden="true">/</span><span aria-current="page">${escapeHtml(work.projectName)}</span></nav><div class="works-detail-hero-grid"><div><p class="works-eyebrow">WORKS 001 / ${escapeHtml(work.type)}</p><h1>仙台の店舗・企業・暮らしの情報を構造化する<br />地域情報プラットフォーム「${escapeHtml(work.projectName)}」</h1><p class="works-lead">${escapeHtml(work.lead)}</p><dl class="works-hero-meta"><div><dt>PROJECT</dt><dd>${escapeHtml(work.projectName)}</dd></div><div><dt>TYPE</dt><dd>${escapeHtml(work.type)}</dd></div></dl><div class="works-actions"><a class="works-button works-button-primary" href="${work.projectUrl}" target="_blank" rel="noopener noreferrer" data-analytics-event="works_project_click" data-work-slug="${work.slug}">仙台えらぶ！を見る<span aria-hidden="true"> ↗</span></a><a class="works-button works-button-secondary" href="/contact/?source=works&case=${work.slug}&intent=project-development" data-cta-track data-cta-type="contact" data-cta-location="hero" data-analytics-event="works_contact_click">開発について相談する</a></div></div><figure class="works-device"><img src="${work.heroImage}" alt="${escapeHtml(work.heroImageAlt)}" width="720" height="1280" /><figcaption>仙台えらぶ！内の公開プロダクト「MY JAZZ DAY」</figcaption></figure></div></div></header>
    <section class="works-section" aria-labelledby="project-data"><div class="works-shell works-reading-grid"><div><p class="works-section-number">01 / PROJECT DATA</p></div><div><h2 id="project-data">プロジェクトデータ</h2><dl class="works-project-data">${renderDataList("Project", [work.projectName])}${renderDataList("Type", [work.type])}${renderDataList("Area", [work.area])}${renderDataList("Role", work.roles.map(({ name }) => name))}${renderDataList("Technology", work.technologies)}</dl></div></div></section>
    <section class="works-section works-soft" aria-labelledby="background"><div class="works-shell works-reading-grid"><p class="works-section-number">02 / BACKGROUND</p><div class="works-reading"><h2 id="background">地域情報を、比較・再利用できる形へ。</h2>${work.background.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</div></div></section>
    <section class="works-section" aria-labelledby="problem"><div class="works-shell works-reading-grid"><p class="works-section-number">03 / PROBLEM</p><div><h2 id="problem">整理した5つの課題</h2><ul class="works-problem-list">${work.problems.map((problem, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(problem)}</li>`).join("")}</ul></div></div></section>
    <section class="works-section works-concept" aria-labelledby="concept"><div class="works-shell works-reading-grid"><p class="works-section-number">04 / CONCEPT</p><div class="works-reading"><h2 id="concept">${escapeHtml(work.concept.title)}</h2><p>${escapeHtml(work.concept.body)}</p></div></div></section>
    <section class="works-section" aria-labelledby="architecture"><div class="works-shell works-reading-grid"><p class="works-section-number">05 / ARCHITECTURE</p><div><h2 id="architecture">コンテンツから地域データ活用まで</h2><p class="works-section-lead">実装・運用中の層と、今後の拡張構想を区別して表示しています。</p><div class="works-architecture"><div class="works-architecture-root">仙台えらぶ！</div>${work.architecture.map((layer) => `<div class="works-architecture-arrow" aria-hidden="true">↓</div><article class="works-layer works-layer-${layer.status}"><div><p>${layer.status === "future" ? "今後の拡張 / 構想" : "現在実装・運用中"}</p><h3>${escapeHtml(layer.name)}</h3></div><ul>${layer.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article>`).join("")}</div></div></div></section>
    <section class="works-section works-soft" aria-labelledby="implementation"><div class="works-shell works-reading-grid"><p class="works-section-number">06 / IMPLEMENTATION</p><div><h2 id="implementation">実装済みと、今後の拡張</h2><div class="works-status-grid"><article class="works-status-current"><p>現在実装・運用中</p><ul>${work.implementation.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article><article class="works-status-future"><p>今後の拡張候補</p><ul>${work.future.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article></div></div></div></section>
    <section class="works-section" aria-labelledby="role"><div class="works-shell works-reading-grid"><p class="works-section-number">07 / SGP ROLE</p><div><h2 id="role">SGPが担当したこと</h2><div class="works-role-grid">${work.roles.map((role, index) => `<article><span>${String(index + 1).padStart(2, "0")}</span><h3>${escapeHtml(role.name)}</h3><p>${escapeHtml(role.description)}</p></article>`).join("")}</div></div></div></section>
    <section class="works-section works-self" aria-labelledby="self-development"><div class="works-shell works-reading-grid"><p class="works-section-number">08 / SELF DEVELOPMENT</p><div class="works-reading"><h2 id="self-development">「自分たちでも、実際につくる。」</h2><p>SGPでは、顧客向けの提案だけでなく、自社でもWebサービスやデータ基盤を企画・開発・運用しています。</p><p>自らサービスを運営することで、実装、SEO、データ管理、運用、改善まで含めた現場経験を蓄積し、顧客支援へ還元します。</p></div></div></section>
    <section class="works-section" aria-labelledby="technology"><div class="works-shell works-reading-grid"><p class="works-section-number">09 / TECHNOLOGY</p><div><h2 id="technology">技術スタック</h2><ul class="works-tech-list">${work.technologies.map((technology) => `<li>${escapeHtml(technology)}</li>`).join("")}</ul></div></div></section>
    <section class="works-section works-soft" aria-labelledby="status"><div class="works-shell works-reading-grid"><p class="works-section-number">10 / STATUS</p><div class="works-status-note"><p class="works-eyebrow">CURRENT STATUS</p><h2 id="status">${escapeHtml(work.results[0])}</h2><p>確認できないPV、検索順位、データ件数、CV数は掲載していません。公開できる事実を確認しながら、このページも継続して更新します。</p><div class="works-text-links"><a href="/case-studies/my-jazz-day/">関連するMY JAZZ DAY開発事例を見る</a><a href="${work.projectUrl}" target="_blank" rel="noopener noreferrer">仙台えらぶ！公式サイトを見る<span class="works-sr-only">（新しいタブで開きます）</span></a></div></div></div></section>
    <section class="works-final"><div class="works-shell works-final-inner"><div><p class="works-eyebrow">PROJECT CONSULTATION</p><h2>同じように、自社の構想をWeb・AI・業務システムとして形にしたい方へ</h2><p>企画段階でも構いません。目的、利用者、必要なデータ、最初に検証する範囲から整理します。</p></div><a class="works-button works-button-primary" href="/contact/?source=works&case=${work.slug}&intent=project-development" data-cta-track data-cta-type="contact" data-cta-location="final" data-analytics-event="works_contact_click">SGPに相談する</a></div></section>
  </main>`;
  return renderPage({ title, description, canonical, content, schemas: [webPage, creativeWork, breadcrumb], pageType: "works-detail", pageAttributes: ` data-work-slug="${work.slug}"` });
}

await mkdir(path.join(rootDir, "works"), { recursive: true });
await writeFile(path.join(rootDir, "works", "index.html"), renderWorksIndex(), "utf8");
for (const work of publicWorks) {
  const targetDir = path.join(rootDir, "works", work.slug);
  await mkdir(targetDir, { recursive: true });
  await writeFile(path.join(targetDir, "index.html"), renderWorkDetail(work), "utf8");
}

console.log(`Generated WORKS index and ${publicWorks.length} public work detail page.`);
