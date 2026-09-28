import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { guides, industries, seoPublishedDate } from "../content/seo-pages.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const siteUrl = "https://sakamoto-growth-partners.com";

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");
const jsonForHtml = (value) => JSON.stringify(value, null, 2).replaceAll("<", "\\u003c");

function header(active) {
  return `
  <header class="site-header subsite-header brand-header" id="top">
    <div class="container nav-wrap">
      <a class="brand brand-v2" href="/" aria-label="Sakamoto Growth Partners トップへ戻る">
        <span class="brand-logo-wrap brand-logo-official"><img class="brand-logo" src="/assets/sgp-wordmark-v2.webp" alt="Sakamoto Growth Partners" /></span>
      </a>
      <button class="menu-button" type="button" aria-label="メニューを開く" aria-expanded="false" aria-controls="global-navigation" data-menu-button><span></span><span></span><span></span></button>
      <nav class="nav nav-v2" id="global-navigation" aria-label="メインナビゲーション" data-nav>
        <a href="/services/it-adviser/">社外IT担当</a>
        <a href="/guides/"${active === "guides" ? ' aria-current="page"' : ""}>実務ガイド</a>
        <a href="/industries/"${active === "industries" ? ' aria-current="page"' : ""}>業種別支援</a>
        <a href="/case-studies/">事例</a>
        <a href="/brand/">会社・ブランド</a>
        <a class="nav-cta" href="/free-improvement/">1業務改善無料</a>
      </nav>
    </div>
  </header>`;
}

function footer() {
  return `
  <footer class="site-footer">
    <div class="container news-footer-grid">
      <p>© 2026 合同会社SGP / Sakamoto Growth Partners</p>
      <nav class="news-footer-links" aria-label="フッターナビゲーション">
        <a href="/services/it-adviser/">社外IT担当</a>
        <a href="/guides/">実務ガイド</a>
        <a href="/industries/">業種別支援</a>
        <a href="/case-studies/">事例</a>
        <a href="/contact/?source=seo-footer&intent=it-adviser-diagnosis">お問い合わせ</a>
      </nav>
      <a href="#top">ページ上部へ</a>
    </div>
  </footer>`;
}

function basePage({ title, description, canonical, ogType = "website", schemas, body, active }) {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="${ogType}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:site_name" content="Sakamoto Growth Partners" />
  <meta property="og:locale" content="ja_JP" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="theme-color" content="#062b49" />
  <link rel="stylesheet" href="/styles.css?v=20260929-seo-v1" />
  <link rel="stylesheet" href="/news/news.css?v=20260929-seo-v1" />
  <link rel="stylesheet" href="/seo/seo.css?v=20260929-seo-v1" />
${schemas.map((schema) => `  <script type="application/ld+json">\n${jsonForHtml(schema)}\n  </script>`).join("\n")}
</head>
<body class="news-page seo-page">
${header(active)}
${body}
${footer()}
  <script src="/script.js"></script>
  <script src="/analytics.js"></script>
</body>
</html>
`;
}

function guideSchema(guide, canonical) {
  return {
    "@context":"https://schema.org",
    "@type":"Article",
    headline:guide.title,
    description:guide.description,
    datePublished:seoPublishedDate,
    dateModified:seoPublishedDate,
    inLanguage:"ja-JP",
    author:{"@type":"Organization","name":"合同会社SGP","url":`${siteUrl}/`},
    publisher:{"@type":"Organization","name":"合同会社SGP","url":`${siteUrl}/`},
    mainEntityOfPage:{"@type":"WebPage","@id":canonical},
    about:guide.intent
  };
}

function breadcrumb(items) {
  return {
    "@context":"https://schema.org",
    "@type":"BreadcrumbList",
    itemListElement:items.map((item, index) => ({"@type":"ListItem","position":index + 1,"name":item.name,"item":item.item}))
  };
}

function faqSchema(faqs) {
  return {
    "@context":"https://schema.org",
    "@type":"FAQPage",
    mainEntity:faqs.map(([question, answer]) => ({
      "@type":"Question",
      name:question,
      acceptedAnswer:{"@type":"Answer","text":answer}
    }))
  };
}

function renderGuideCard(guide) {
  return `<article class="seo-card"><p class="seo-card-intent">${escapeHtml(guide.intent)}</p><h2><a href="/guides/${guide.slug}/">${escapeHtml(guide.shortTitle)}</a></h2><p>${escapeHtml(guide.description)}</p><a class="seo-card-link" href="/guides/${guide.slug}/">詳しく読む →</a></article>`;
}

function renderGuidesIndex() {
  const canonical = `${siteUrl}/guides/`;
  const body = `
  <main>
    <header class="seo-hero">
      <div class="container seo-hero-inner">
        <nav class="news-breadcrumb" aria-label="パンくずリスト"><a href="/">HOME</a><span>/</span><span>実務ガイド</span></nav>
        <p class="news-eyebrow">PRACTICAL IT GUIDES / SENDAI</p>
        <h1>中小企業のITを、<br>判断できる言葉に。</h1>
        <p>社外IT担当、IT顧問、業務改善、生成AI、建設DX。仙台・宮城の中小企業が「何から始めるか」を決めるための実務ガイドです。</p>
        <div class="seo-hero-actions"><a class="button advisor-primary" href="/services/it-adviser/">社外IT担当を見る</a><a class="button advisor-secondary" href="/free-improvement/">1業務改善無料 →</a></div>
      </div>
    </header>
    <section class="seo-listing"><div class="container"><div class="seo-card-grid">${guides.map(renderGuideCard).join("\n")}</div></div></section>
    <section class="seo-cta"><div class="container"><div><p class="news-eyebrow">NEED A SECOND OPINION?</p><h2>自社の場合は、何からやるべきか。</h2><p>30分で「今やる / 後でやる / やらない」を整理します。</p></div><a class="button advisor-primary" href="/contact/?source=guides&intent=it-adviser-diagnosis">無料相談 →</a></div></section>
  </main>`;
  return basePage({
    title:"中小企業IT・DX実務ガイド｜仙台・宮城｜合同会社SGP",
    description:"仙台・宮城の中小企業向けに、社外IT担当、IT顧問、業務改善、生成AI、建設DXの実務ガイドを公開しています。",
    canonical, active:"guides", body,
    schemas:[
      breadcrumb([{name:"HOME",item:`${siteUrl}/`},{name:"実務ガイド",item:canonical}]),
      {"@context":"https://schema.org","@type":"ItemList","name":"合同会社SGP 実務ガイド","numberOfItems":guides.length,"itemListElement":guides.map((g,i)=>({"@type":"ListItem","position":i+1,"url":`${siteUrl}/guides/${g.slug}/`,"name":g.title}))}
    ]
  });
}

function renderGuide(guide) {
  const canonical = `${siteUrl}/guides/${guide.slug}/`;
  const related = guide.related.map((slug) => guides.find((item) => item.slug === slug)).filter(Boolean);
  const body = `
  <main>
    <article class="seo-article">
      <header class="seo-article-header"><div class="container seo-article-header-inner">
        <nav class="news-breadcrumb" aria-label="パンくずリスト"><a href="/">HOME</a><span>/</span><a href="/guides/">実務ガイド</a><span>/</span><span>${escapeHtml(guide.shortTitle)}</span></nav>
        <p class="news-eyebrow">PRACTICAL GUIDE</p>
        <p class="seo-search-intent">${escapeHtml(guide.intent)}</p>
        <h1>${escapeHtml(guide.title)}</h1>
        <p class="seo-lead">${escapeHtml(guide.lead)}</p>
      </div></header>
      <div class="container seo-article-layout">
        <div class="seo-article-body">
          <nav class="seo-toc" aria-label="目次"><strong>この記事の内容</strong><ol>${guide.sections.map(([heading],i)=>`<li><a href="#section-${i+1}">${escapeHtml(heading)}</a></li>`).join("")}</ol></nav>
          ${guide.sections.map(([heading, paragraphs],i)=>`<section id="section-${i+1}"><h2>${escapeHtml(heading)}</h2>${paragraphs.map(p=>`<p>${escapeHtml(p)}</p>`).join("")}</section>`).join("\n")}
          <section class="seo-faq"><h2>よくある質問</h2>${guide.faqs.map(([q,a])=>`<details><summary>${escapeHtml(q)}</summary><p>${escapeHtml(a)}</p></details>`).join("")}</section>
          <section class="seo-related"><h2>関連ガイド</h2><div class="seo-related-grid">${related.map(g=>`<a href="/guides/${g.slug}/"><strong>${escapeHtml(g.shortTitle)}</strong><span>${escapeHtml(g.description)}</span></a>`).join("")}</div></section>
        </div>
        <aside class="seo-side-cta"><p>仙台・宮城の中小企業向け</p><h2>IT担当を雇う前に。</h2><strong>月1万円から、社外IT担当。</strong><span>相談から必要時の実装まで、窓口を一本に。</span><a class="button advisor-primary" href="/services/it-adviser/">サービス詳細 →</a><a href="/free-improvement/">1業務改善無料</a></aside>
      </div>
    </article>
  </main>`;
  return basePage({
    title:`${guide.title}｜合同会社SGP`,
    description:guide.description,
    canonical, ogType:"article", active:"guides", body,
    schemas:[
      guideSchema(guide, canonical),
      faqSchema(guide.faqs),
      breadcrumb([{name:"HOME",item:`${siteUrl}/`},{name:"実務ガイド",item:`${siteUrl}/guides/`},{name:guide.shortTitle,item:canonical}])
    ]
  });
}

function renderIndustryCard(industry) {
  return `<article class="seo-card industry-card"><p class="seo-card-intent">LOCAL INDUSTRY DX</p><h2><a href="/industries/${industry.slug}/">${escapeHtml(industry.name)}</a></h2><p>${escapeHtml(industry.description)}</p><a class="seo-card-link" href="/industries/${industry.slug}/">支援内容を見る →</a></article>`;
}

function renderIndustriesIndex() {
  const canonical = `${siteUrl}/industries/`;
  const body = `
  <main>
    <header class="seo-hero"><div class="container seo-hero-inner">
      <nav class="news-breadcrumb" aria-label="パンくずリスト"><a href="/">HOME</a><span>/</span><span>業種別支援</span></nav>
      <p class="news-eyebrow">INDUSTRY PLAYBOOKS / SENDAI</p>
      <h1>現場の仕事に合わせて、<br>ITを小さく実装する。</h1>
      <p>業種ごとの業務フローから、売上・コスト・時間に効く改善テーマを整理します。既存のExcelやLINEを全部捨てる前提ではありません。</p>
    </div></header>
    <section class="seo-listing"><div class="container"><div class="seo-card-grid">${industries.map(renderIndustryCard).join("\n")}</div></div></section>
  </main>`;
  return basePage({
    title:"仙台・宮城の業種別IT・DX支援｜合同会社SGP",
    description:"建設、電気工事、外構、空調設備、リフォームなど、仙台・宮城の現場型中小企業向けIT・DX支援。",
    canonical, active:"industries", body,
    schemas:[
      breadcrumb([{name:"HOME",item:`${siteUrl}/`},{name:"業種別支援",item:canonical}]),
      {"@context":"https://schema.org","@type":"ItemList","name":"合同会社SGP 業種別IT・DX支援","numberOfItems":industries.length,"itemListElement":industries.map((x,i)=>({"@type":"ListItem","position":i+1,"url":`${siteUrl}/industries/${x.slug}/`,"name":x.name}))}
    ]
  });
}

function renderIndustry(industry) {
  const canonical = `${siteUrl}/industries/${industry.slug}/`;
  const guide = guides.find((g) => g.slug === industry.guide);
  const faqs = [
    ["今のExcelやLINEを残したまま改善できますか？","可能です。既存運用を確認し、二重入力や属人化が大きい部分から段階的に改善します。"],
    ["小規模な会社でも依頼できますか？","はい。SGPの社外IT担当は、IT専任者を置きにくい中小企業を主な対象としています。"],
    ["システム開発まで必要ですか？","必ずしも必要ありません。運用整理や既存SaaSの設定で解決できる場合は、開発を前提にしません。"]
  ];
  const serviceSchema = {
    "@context":"https://schema.org","@type":"Service",
    name:`${industry.name}向けIT・DX支援`,
    description:industry.description,
    provider:{"@type":"Organization","name":"合同会社SGP","url":`${siteUrl}/`},
    areaServed:[{"@type":"City","name":"仙台市"},{"@type":"AdministrativeArea","name":"宮城県"}],
    audience:{"@type":"BusinessAudience","audienceType":industry.name}
  };
  const body = `
  <main>
    <header class="seo-hero industry-hero"><div class="container seo-hero-inner">
      <nav class="news-breadcrumb" aria-label="パンくずリスト"><a href="/">HOME</a><span>/</span><a href="/industries/">業種別支援</a><span>/</span><span>${escapeHtml(industry.name)}</span></nav>
      <p class="news-eyebrow">INDUSTRY DX / SENDAI</p>
      <h1>${escapeHtml(industry.title.replace("｜合同会社SGP",""))}</h1>
      <p>${escapeHtml(industry.description)}</p>
      <div class="seo-hero-actions"><a class="button advisor-primary" href="/free-improvement/">1業務改善無料 →</a><a class="button advisor-secondary" href="/services/it-adviser/">社外IT担当を見る</a></div>
    </div></header>
    <section class="seo-industry-section"><div class="container seo-two-column">
      <div><p class="news-eyebrow">COMMON BOTTLENECKS</p><h2>よく起きる詰まり</h2><ul class="seo-check-list">${industry.pain.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></div>
      <div><p class="news-eyebrow">SUPPORT</p><h2>SGPが支援すること</h2><ul class="seo-check-list support">${industry.support.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></div>
    </div></section>
    <section class="seo-industry-process"><div class="container"><p class="news-eyebrow">PROCESS</p><h2>大きなDXより、1業務ずつ。</h2><div class="seo-process-grid"><article><b>01</b><h3>現場を見る</h3><p>実際の入力・連絡・確認・集計を確認します。</p></article><article><b>02</b><h3>詰まりを測る</h3><p>時間、ミス、二重入力、社長依存を整理します。</p></article><article><b>03</b><h3>最小改善</h3><p>既存ツールで直せる範囲から実装します。</p></article><article><b>04</b><h3>必要なら開発</h3><p>効果が確認できた部分だけ自動化・システム化します。</p></article></div></div></section>
    ${guide ? `<section class="seo-industry-guide"><div class="container"><div><p class="news-eyebrow">RELATED GUIDE</p><h2>${escapeHtml(guide.title)}</h2><p>${escapeHtml(guide.description)}</p></div><a class="button advisor-secondary" href="/guides/${guide.slug}/">実務ガイドを読む →</a></div></section>` : ""}
    <section class="seo-faq-wide"><div class="container"><h2>よくある質問</h2>${faqs.map(([q,a])=>`<details><summary>${escapeHtml(q)}</summary><p>${escapeHtml(a)}</p></details>`).join("")}</div></section>
    <section class="seo-cta"><div class="container"><div><p class="news-eyebrow">FIRST STEP</p><h2>まず1業務だけ、改善してみる。</h2><p>契約前提ではありません。現場の困りごとを一つ選んで、改善余地を確認します。</p></div><a class="button advisor-primary" href="/free-improvement/">1業務改善無料 →</a></div></section>
  </main>`;
  return basePage({
    title:industry.title, description:industry.description, canonical, active:"industries", body,
    schemas:[
      serviceSchema,
      faqSchema(faqs),
      breadcrumb([{name:"HOME",item:`${siteUrl}/`},{name:"業種別支援",item:`${siteUrl}/industries/`},{name:industry.name,item:canonical}])
    ]
  });
}

async function patchSitemap() {
  const file = path.join(root, "sitemap.xml");
  let xml = await readFile(file, "utf8");
  const urls = [
    `${siteUrl}/guides/`,
    ...guides.map((g) => `${siteUrl}/guides/${g.slug}/`),
    `${siteUrl}/industries/`,
    ...industries.map((i) => `${siteUrl}/industries/${i.slug}/`)
  ];
  for (const loc of urls) {
    if (!xml.includes(`<loc>${loc}</loc>`)) {
      xml = xml.replace("</urlset>", `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${seoPublishedDate}</lastmod>\n  </url>\n</urlset>`);
    }
  }
  await writeFile(file, xml, "utf8");
}

async function main() {
  if (new Set(guides.map((x) => x.slug)).size !== guides.length) throw new Error("Duplicate guide slug");
  if (new Set(industries.map((x) => x.slug)).size !== industries.length) throw new Error("Duplicate industry slug");

  await mkdir(path.join(root, "guides"), { recursive:true });
  await mkdir(path.join(root, "industries"), { recursive:true });
  await writeFile(path.join(root, "guides/index.html"), renderGuidesIndex(), "utf8");
  await writeFile(path.join(root, "industries/index.html"), renderIndustriesIndex(), "utf8");

  for (const guide of guides) {
    const dir = path.join(root, "guides", guide.slug);
    await mkdir(dir, { recursive:true });
    await writeFile(path.join(dir, "index.html"), renderGuide(guide), "utf8");
  }
  for (const industry of industries) {
    const dir = path.join(root, "industries", industry.slug);
    await mkdir(dir, { recursive:true });
    await writeFile(path.join(dir, "index.html"), renderIndustry(industry), "utf8");
  }
  await patchSitemap();
  console.log(`Generated ${guides.length} SEO guides and ${industries.length} industry pages.`);
}

await main();
