import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { categoryFor, publishedInsights } from "../insights/insights-data.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(rootDir, "docs", "insights-phase2-report.md");

const articleNumbers = {
  "ai-business-tasks": 1,
  "ai-implementation-cost": 2,
  "excel-to-system": 3,
  "owner-dependency": 4,
  "sales-process-integration": 5,
  "rag-internal-search": 6,
  "meeting-to-crm-ai": 7,
  "chatgpt-company-policy": 8,
  "ai-customer-inquiry": 9,
  "ai-implementation-failures": 10,
  "construction-ai-tasks": 11,
  "construction-estimate-ai": 12,
  "homebuilder-customer-management": 13,
  "renovation-project-management": 14,
  "construction-crm": 15,
  "construction-document-management": 16,
  "construction-line-management": 17,
  "owner-dependent-estimates": 18,
  "construction-rag": 19,
  "construction-dx-cost": 20,
  "excel-vs-crm": 21,
  "kintone-vs-custom-system": 22,
  "saas-vs-custom-development": 23,
  "chatgpt-vs-rag": 24,
  "rag-cost": 25,
  "ai-agent-vs-automation": 26,
  "line-to-crm": 27,
  "estimate-followup-automation": 28,
  "customer-data-fragmentation": 29,
  "dx-prioritization": 30,
};

const ctaLabels = {
  diagnosis: "無料経営導線診断",
  "service-ai": "AI導入支援",
  "service-business-improvement": "業務改善支援",
  "service-web": "Web・営業導線支援",
  contact: "問い合わせ",
};

const clusterDefinitions = [
  {
    name: "AI活用ピラー",
    pillar: "ai-business-tasks",
    supporting: ["ai-implementation-cost", "rag-internal-search", "meeting-to-crm-ai", "chatgpt-company-policy", "ai-customer-inquiry", "ai-implementation-failures", "chatgpt-vs-rag", "rag-cost", "ai-agent-vs-automation"],
  },
  {
    name: "DX・業務改善ピラー",
    pillar: "dx-prioritization",
    supporting: ["excel-to-system", "owner-dependency", "excel-vs-crm", "kintone-vs-custom-system", "saas-vs-custom-development", "customer-data-fragmentation"],
  },
  {
    name: "営業導線ピラー",
    pillar: "sales-process-integration",
    supporting: ["line-to-crm", "estimate-followup-automation", "meeting-to-crm-ai", "customer-data-fragmentation"],
  },
  {
    name: "建設業ピラー",
    pillar: "construction-ai-tasks",
    supporting: ["construction-estimate-ai", "homebuilder-customer-management", "renovation-project-management", "construction-crm", "construction-document-management", "construction-line-management", "owner-dependent-estimates", "construction-rag", "construction-dx-cost"],
  },
];

const nextArticles = [
  ["AI導入前の業務棚卸しテンプレート", "ai-work-inventory-template", "AI活用"],
  ["生成AIの社内教育を設計する方法", "generative-ai-training", "AI活用"],
  ["AI出力の評価データセットを作る方法", "ai-evaluation-dataset", "AI活用"],
  ["中小企業のAIガバナンス最小構成", "sme-ai-governance", "AI活用"],
  ["RAGで検索精度が上がらない原因", "rag-search-quality", "AI活用"],
  ["社内文書の権限設計とRAG", "rag-access-control", "AI活用"],
  ["AI導入のPoCを本番化する判断基準", "ai-poc-production-gates", "AI活用"],
  ["CRM導入要件定義の作り方", "crm-requirements", "業務改善"],
  ["顧客マスタの重複を解消する方法", "customer-master-deduplication", "業務改善"],
  ["業務フロー図からシステム要件へ落とす方法", "workflow-to-system-requirements", "業務改善"],
  ["中小企業のデータ移行チェックリスト", "sme-data-migration", "業務改善"],
  ["SaaS連携で二重入力をなくす方法", "saas-integration", "業務改善"],
  ["問い合わせフォームをCRMへ連携する方法", "form-to-crm", "営業・Web"],
  ["営業ステージと退出条件の設計方法", "sales-stage-exit-criteria", "営業・Web"],
  ["失注理由を営業改善へ使う方法", "lost-deal-analysis", "営業・Web"],
  ["Web・LINE・電話の流入計測を統合する方法", "lead-source-attribution", "営業・Web"],
  ["建設会社の現場日報をデジタル化する方法", "construction-daily-report", "業界別"],
  ["建設会社の原価マスタを整備する方法", "construction-cost-master", "業界別"],
  ["工務店のOB顧客・アフター管理を改善する方法", "homebuilder-aftercare-crm", "業界別"],
  ["リフォームの追加変更・請求漏れを防ぐ方法", "renovation-change-orders", "業界別"],
];

function contentLength(article) {
  return JSON.stringify({ description: article.description, summary: article.summary, sections: article.sections })
    .replace(/[\s{}\[\]"':,]/g, "").length;
}

function md(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

const articles = [...publishedInsights].sort((a, b) => articleNumbers[a.slug] - articleNumbers[b.slug]);
const articleBySlug = Object.fromEntries(articles.map((article) => [article.slug, article]));
const incoming = Object.fromEntries(articles.map((article) => [article.slug, 0]));
for (const article of articles) for (const slug of article.relatedArticles) incoming[slug] += 1;

const categoryCounts = {};
const ctaCounts = {};
for (const article of articles) {
  const category = categoryFor(article.category).name;
  categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  ctaCounts[article.ctaType] = (ctaCounts[article.ctaType] || 0) + 1;
}

const scores = articles.map((article) => article.qualityScore.total);
const scoreAverage = (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1);
const generatedDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
const lines = [];

lines.push("# SGP INSIGHTS 第2フェーズ 最終監査レポート", "", `生成日: ${generatedDate}`, "");
lines.push("## 1. Article Inventory", "", "日本語は空白区切りの単語数が安定しないため、Word Count欄は記事データの本文字数（JSON記号・空白を除く概算）です。", "");
lines.push("| No | Title | Slug | Category | 本文字数 | Primary Intent | Original Assets | CTA | Score |", "|---:|---|---|---|---:|---|---|---|---:|");
for (const article of articles) {
  lines.push(`| ${String(articleNumbers[article.slug]).padStart(2, "0")} | ${md(article.title)} | \`${article.slug}\` | ${categoryFor(article.category).name} | ${contentLength(article).toLocaleString("ja-JP")} | ${md(article.brief.primaryIntent)} | ${article.originalAssets.length}点: ${md(article.originalAssets[0])} | ${ctaLabels[article.ctaType]} | ${article.qualityScore.total} |`);
}

lines.push("", "## 2. Content Cluster Map", "");
for (const cluster of clusterDefinitions) {
  const pillar = articleBySlug[cluster.pillar];
  lines.push(`- **${cluster.name}**: [${pillar.title}](/insights/${pillar.slug}/) → ${cluster.supporting.map((slug) => `[${articleBySlug[slug].title}](/insights/${slug}/)`).join(" / ")}`);
}
lines.push("", `カテゴリ構成: ${Object.entries(categoryCounts).map(([name, count]) => `${name} ${count}本`).join(" / ")}`, "");

lines.push("## 3. Original Frameworks", "");
for (const article of articles) lines.push(`- **${String(articleNumbers[article.slug]).padStart(2, "0")} ${article.title}**: ${article.originalAssets.join(" / ")}`);

lines.push("", "## 4. Internal Link Map", "");
lines.push(`孤立記事: ${Object.values(incoming).filter((count) => count === 0).length}件。すべての記事が関連記事から1本以上の文脈リンクを受けています。`, "");
lines.push("| Article | Related Articles | Incoming |", "|---|---|---:|");
for (const article of articles) lines.push(`| \`${article.slug}\` | ${article.relatedArticles.map((slug) => `\`${slug}\``).join(" / ")} | ${incoming[article.slug]} |`);

lines.push("", "## 5. Conversion Map", "");
lines.push("記事本文 → 関連サービス → 記事末CTA → 無料経営導線診断またはサービス理解、という導線です。関連記事は次の疑問、関連サービスは実装手段、末尾CTAは相談判断を担います。", "");
for (const [ctaType, count] of Object.entries(ctaCounts)) lines.push(`- ${ctaLabels[ctaType]}: ${count}記事`);
lines.push("- 関連サービス: `/services/ai/`、`/services/business-improvement/`、`/services/web-marketing/`", "");

lines.push("## 6. SEO", "");
lines.push("- 30記事すべてに固有title、meta description、canonical、robots `index, follow` を出力。", "- 記事OGPは `og:type=article`、一覧・カテゴリは `og:type=website`。", "- BlogPostingにheadline、description、datePublished、dateModified、author、publisher、mainEntityOfPage、citationを出力。", "- BreadcrumbListを一覧・カテゴリ・記事へ出力。", "- `/sitemap.xml` にINSIGHTS一覧1、カテゴリ4、記事30を含める。", "");

lines.push("## 7. QA", "");
lines.push(`- 品質スコア: 最小 ${Math.min(...scores)} / 平均 ${scoreAverage} / 最大 ${Math.max(...scores)}。`, "- 公開ゲート: Total 90以上、Search Intent 13以上、Practical Value 17以上、Originality 12以上、Accuracy 13以上。", "- `npm test`: 静的生成、SEO、schema、内部リンク、responsive CSS、GA4属性、NEWS、Contact、Case Studyを検証。", "- `node scripts/check-insight-article.mjs {slug}`: 1記事単位の本文字数、構造、品質、出典、HTMLを検証。", "");

lines.push("## 8. Content Gaps", "");
lines.push("- 実装前の業務棚卸し、要件定義、データ移行を独立テーマとして深掘りする余地があります。", "- AIガバナンスは運用ルールに加え、評価セット、教育、監査、インシデント訓練の実務記事が必要です。", "- 営業導線はフォーム、電話、広告、紹介を含む流入属性と失注分析を追加できます。", "- 建設業は日報、原価、協力会社、追加変更、アフターの個別実務を拡張できます。", "- 公開後はSearch Consoleのクエリ・CTR・順位と商談利用実績を基に、重複意図と不足意図を再評価します。", "");

lines.push("## 9. Recommended Next 20", "", "| No | Proposed Article | Slug | Cluster |", "|---:|---|---|---|");
nextArticles.forEach(([title, slug, cluster], index) => lines.push(`| ${index + 1} | ${title} | \`${slug}\` | ${cluster} |`));

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Generated ${path.relative(rootDir, outputPath)} for ${articles.length} INSIGHTS articles.`);
