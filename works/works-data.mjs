export const workCategories = [
  { slug: "all", label: "すべて" },
  { slug: "self-developed", label: "自社開発" },
  { slug: "ai", label: "AI" },
  { slug: "business-improvement", label: "業務改善" },
  { slug: "web", label: "Web" },
  { slug: "system-development", label: "システム開発" },
  { slug: "sgp-lab", label: "SGP Lab" },
];

const visibilityValues = new Set(["public", "anonymous", "private"]);
const categoryValues = new Set(workCategories.filter(({ slug }) => slug !== "all").map(({ slug }) => slug));

function validateWork(work) {
  const requiredText = [
    "slug",
    "title",
    "projectName",
    "type",
    "industry",
    "area",
    "summary",
    "lead",
    "publishedAt",
    "visibility",
  ];
  for (const key of requiredText) {
    if (!work[key] || typeof work[key] !== "string") throw new Error(`${work.slug || "work"}: ${key} is required`);
  }
  if (!/^[-a-z0-9]+$/.test(work.slug)) throw new Error(`${work.slug}: invalid slug`);
  if (!visibilityValues.has(work.visibility)) throw new Error(`${work.slug}: invalid visibility`);
  if (!work.categories?.length || work.categories.some((category) => !categoryValues.has(category))) {
    throw new Error(`${work.slug}: invalid categories`);
  }
  for (const key of ["roles", "technologies", "background", "problems", "solutions", "implementation", "results", "future"]) {
    if (!Array.isArray(work[key]) || !work[key].length) throw new Error(`${work.slug}: ${key} is required`);
  }
  return work;
}

export const works = [
  validateWork({
    slug: "sendai-erabu",
    title: "地域店舗・企業情報を構造化し、仙台での「選ぶ」を支援する地域メディアを開発",
    projectName: "仙台えらぶ！",
    type: "自社開発",
    categories: ["self-developed", "web", "system-development"],
    industry: "地域メディア / Local Data / Web Platform",
    area: "宮城県仙台市",
    summary: "仙台の店舗・企業・暮らしに関する情報を整理し、検索・比較・意思決定を支援する地域情報プラットフォーム。SGPが企画・設計・開発・運用まで一貫して行っています。",
    lead: "SGPが企画・設計・開発・運用する地域メディアです。記事を掲載するだけではなく、仙台の店舗・企業・地域情報を構造化し、「どこを選ぶか」「何を選ぶか」を支援するデータ基盤を目指しています。",
    roles: [
      { name: "企画", description: "メディアコンセプト、対象ユーザー、情報構造を設計。" },
      { name: "UI / UX", description: "情報を検索・閲覧・比較しやすいサイト構造を設計。" },
      { name: "Development", description: "Next.jsを中心にWebサイトを実装。" },
      { name: "Data Design", description: "店舗・企業情報を将来的に再利用できる形で整理。" },
      { name: "SEO", description: "ページ構造、内部リンク、構造化データを設計。" },
      { name: "Operation", description: "GA4・Search Consoleを活用しながら継続改善。" },
    ],
    technologies: ["Next.js", "Cloudflare Pages", "GA4", "Google Search Console", "Structured Data"],
    background: [
      "一般的な地域メディアでは、記事単位で情報が蓄積される一方、店舗・企業・場所・カテゴリなどの情報が構造化されず、検索・比較・再利用しにくいケースがあります。",
      "仙台えらぶ！では、コンテンツそのものだけではなく、地域情報を継続的にデータとして蓄積できる構造を重視しています。",
    ],
    problems: [
      "地域情報が複数サイトへ分散している",
      "店舗・企業情報の形式が統一されていない",
      "地域メディアの記事が単発コンテンツになりやすい",
      "SEOコンテンツとデータベースが分断されやすい",
      "店舗情報の更新・比較・再利用が難しい",
    ],
    concept: {
      title: "「記事を増やす」のではなく、「地域データを蓄積する」",
      body: "記事コンテンツを増やすことだけを目的とせず、店舗、企業、エリア、価格帯、サービス、予約方法などの情報を、再利用可能なデータとして整理する設計を進めています。",
    },
    solutions: [
      "地域記事・店舗紹介・比較記事・暮らし情報を共通の情報設計でつなぐ",
      "店舗・企業・エリア・カテゴリ・サービス等の公開情報を構造化する",
      "構造化データ、内部リンク、サイトマップを検索導線へ接続する",
    ],
    architecture: [
      { name: "Content Layer", status: "current", items: ["地域記事", "店舗紹介", "比較記事", "暮らし情報"] },
      { name: "Local Data Layer", status: "current", items: ["店舗", "企業", "エリア", "カテゴリ", "サービス", "価格", "予約", "Webサイト", "公開情報"] },
      { name: "Search / SEO Layer", status: "current", items: ["構造化データ", "内部リンク", "Sitemap", "Search Console"] },
      { name: "Future Use", status: "future", items: ["地域検索", "比較", "レコメンド", "AI検索", "地域企業分析"] },
    ],
    implementation: [
      "Next.jsを用いたWebサイト",
      "Cloudflare Pagesによる配信",
      "GA4",
      "Google Search Console",
      "Sitemap",
      "SEO設計",
      "地域コンテンツ",
      "店舗・企業情報の構造化",
    ],
    results: ["現在も継続開発・運用中"],
    future: [
      "Local Data Factory",
      "より大規模な店舗・企業データベース",
      "条件検索",
      "比較機能",
      "AI検索",
      "地域企業向けデータ活用",
    ],
    featured: true,
    publishedAt: "2026-09-12",
    visibility: "public",
    projectUrl: "https://sendai-erabu.jp/",
    heroImage: "/assets/case-studies/my-jazz-day/hero-mobile.webp",
    heroImageAlt: "仙台えらぶ！内で公開しているMY JAZZ DAYのスマートフォン画面",
    ogImage: "/ogp.png",
  }),
];

export const publicWorks = works.filter(({ visibility }) => visibility === "public");

export function workForSlug(slug) {
  return publicWorks.find((work) => work.slug === slug);
}
