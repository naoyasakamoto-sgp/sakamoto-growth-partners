import { validateCaseStudyFrontmatter } from "../content/case-studies/schema.mjs";

export const caseStudies = [validateCaseStudyFrontmatter({
  slug: "my-jazz-day",
  caseNumber: "001",
  title: "897の演奏枠を、1分で「自分だけの一日」へ。",
  shortTitle: "MY JAZZ DAY",
  description: "音楽の好み、当日の気分、利用可能時間、開始エリア、歩行量、新しい音との距離から、フェスの一日を組み立てるRecommendation Product。",
  client: "仙台えらぶ！",
  product: "MY JAZZ DAY",
  year: 2026,
  publishedAt: "2026-09-02T00:00:00+09:00",
  dataSnapshotAt: "2026-09-02T00:23:00+09:00",
  status: "published",
  featured: true,
  heroImage: "/assets/case-studies/my-jazz-day/hero-mobile.webp",
  ogImage: "/assets/case-studies/my-jazz-day/og-my-jazz-day.webp",
  metrics: [
    { value: "897", label: "PERFORMANCE SLOTS" },
    { value: "50", label: "VENUES" },
    { value: "1 MIN", label: "TO PERSONALIZE" }
  ],
  tags: ["Recommendation", "Decision UX", "PWA", "Map", "Data"],
  capabilities: ["Product Planning", "UX Design", "Data Modeling", "Recommendation", "Verification", "PWA", "Analytics"],
  productUrl: "https://sendai-erabu.jp/sendai-jazz-festival-2026/",
  disclaimer: "本サービスは「仙台えらぶ！」が公開された情報をもとに独自に企画・開発したサービスです。イベント主催者が提供する公式サービスではありません。",
  seo: {
    title: "MY JAZZ DAY 開発事例 | 897の演奏枠から自分だけの一日を1分で | 合同会社SGP",
    description: "897の演奏枠と50会場の情報から、音楽嗜好・気分・時間・開始地点・歩行量などに合わせて一日の鑑賞プランを組み立てるMY JAZZ DAYの企画・設計・開発事例。"
  }
}),
validateCaseStudyFrontmatter({
  slug: "blue-giant-seo",
  caseNumber: "002",
  title: "イベントの検索需要を、実際のWeb流入へ。",
  shortTitle: "BLUE GIANT仙台 SEO事例",
  description: "自社メディア仙台えらぶ！におけるスタンプラリー特集・6地点ルート体験の企画、制作、SEO計測の実証事例。指定検索クエリで平均掲載順位2.57位、CTR35.71%（42表示・15クリック）。",
  client: "自社運営プロジェクト（仙台えらぶ！）",
  product: "BLUE GIANT仙台 特集記事・ルート体験",
  year: 2026,
  publishedAt: "2026-11-14T00:00:00+09:00",
  dataSnapshotAt: "2026-11-13T23:59:59+09:00",
  status: "published",
  featured: true,
  heroImage: "/assets/sgp-wordmark-v2.webp",
  ogImage: "/assets/sgp-wordmark-v2.webp",
  metrics: [
    { value: "2.57", label: "AVG. SEARCH POSITION" },
    { value: "35.71%", label: "SEARCH CTR (15 / 42)" },
    { value: "192", label: "ARTICLE PAGE VIEWS" }
  ],
  tags: ["SEO", "Search Analytics", "Content Strategy", "Event", "Web Experience"],
  capabilities: ["Search Intent", "Content Strategy", "Information Architecture", "Web Engineering", "Verification", "Analytics"],
  productUrl: "https://sendai-erabu.jp/events/blue-giant-sendai-2026/",
  disclaimer: "SGPが自社運営する仙台えらぶ！で独自制作した事例。イベント主催者・権利者からの受託・協賛・公認・提携を示すものではありません。開催は2026年10月31日に終了。検索数値は2026年10月15日〜11月13日のスナップショットで、単一クエリとページ閲覧は別集計です。",
  seo: {
    title: "BLUE GIANT仙台 SEO・Web集客の実証事例 | 合同会社SGP",
    description: "仙台えらぶ！のスタンプラリー特集と6地点ルート体験を自社制作。Google検索の平均掲載順位2.57位・CTR35.71%を計測したSEO・Web実装事例。"
  }
})];
