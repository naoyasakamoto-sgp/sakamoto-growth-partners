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
})];
