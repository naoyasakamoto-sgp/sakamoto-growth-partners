import { publishedArticle, qualityScore, sourcesFor } from "./article-utils.mjs";

export default publishedArticle({
  slug: "construction-estimate-ai",
  title: "建設会社の見積業務を効率化する方法｜Excel・AI・システムの使い分け",
  description: "建設会社の見積業務を、受付、現調、数量、単価、原価、承認、提出に分解し、Excel・AI・業務システムの役割を解説します。見積精度を落とさず作成時間と属人化を減らす方法です。",
  category: "industry",
  tags: ["建設業", "見積", "Excel", "AI活用"],
  priority: 72,
  relatedArticles: ["owner-dependent-estimates", "construction-rag", "construction-dx-cost", "construction-document-management"],
  relatedServices: ["/services/business-improvement/", "/services/ai/"],
  ctaType: "service-business-improvement",
  seoTitle: "建設会社の見積業務を効率化｜Excel・AI・システム｜合同会社SGP",
  seoDescription: "建設会社の見積業務を、受付、現地調査、数量、単価、原価、承認、提出に分解し、Excel、AI、業務システムの使い分けを解説します。原価マスタと見積データを整え、AIは入力・検索補助に限定し、人が数量、条件、粗利を確認することで、精度と利益を守りながら作成時間を短縮する手順を示します。",
  brief: {
    primaryReader: "見積作成の遅れ・転記・属人化に悩む建設会社経営者",
    readerSituation: "現調メモ、図面、過去見積、単価表が分散し、一部社員へ見積が集中",
    primaryProblem: "見積書作成だけを自動化し、入力情報・原価・承認・変更履歴を整理していない",
    primaryIntent: "建設会社 見積 効率化 AI Excel",
    decision: "Excel改善、AI支援、システム化の範囲を決める",
    mainAnswer: "計算はExcel、候補抽出・類似検索はAI、案件・マスタ・承認・履歴はシステムで管理する",
    notToRecommend: "AIが数量・単価・原価・法的条件を無確認で確定すること",
    relevantService: "建設業向け業務改善・AI支援",
    primaryCta: "業務改善支援",
    secondaryCta: "AI導入支援",
    parentArticle: "construction-ai-tasks",
    childArticles: ["owner-dependent-estimates", "construction-rag"],
    siblingArticles: ["construction-crm", "construction-dx-cost"],
    originalAsset: "見積工程別ツール分担表",
    requiredEvidence: "建設見積の契約・工期情報、内訳、AIの人による確認",
  },
  originalAssets: ["見積工程分解", "ツール分担表", "見積データモデル", "レビューゲート", "ROI式"],
  qualityScore: qualityScore({ searchIntent: 15, practicalValue: 20, originality: 14, accuracy: 15 }),
  sources: sourcesFor("mlitEstimate", "mlitBidBreakdown", "metiAiGuideline", "ipaSmeSecurity"),
  whatYouLearn: ["見積業務を改善する順番", "Excel・AI・システムの役割分担", "見積データとマスタの整え方", "誤見積を防ぐレビューと評価"],
  summary: [
    "Excelは計算と明細編集、AIは文書からの候補抽出と類似案件検索、システムは案件・マスタ・承認・履歴管理に使い分けます。",
    "見積書の自動作成より先に、現調情報、工種、数量、単位、単価、原価、利益、前提・除外、版を構造化します。",
    "数量・単価・工法・契約条件はAIで確定せず、根拠と変更差分を表示して見積責任者が承認します。",
  ],
  sections: [
    { id: "root-cause", title: "建設見積が遅い原因を工程で分ける", blocks: [
      { type: "process", beforeLabel: "分散した見積", before: ["問い合わせを個別受信", "現調メモが紙・写真", "過去見積を探す", "Excelへ再入力", "社長が全件確認"], afterLabel: "改善後", after: ["案件IDで受付", "現調項目を統一", "類似・単価候補を提示", "差分を確認", "基準超過だけ承認"] },
      { type: "paragraph", text: "遅れの原因が検索なのか、採寸待ちなのか、単価判断なのか、承認待ちなのかで手段は変わります。見積依頼から提出までの各工程について件数、作業時間、待ち時間、差戻しを測ります。" },
    ] },
    { id: "tool-split", title: "Excel・AI・システムをどう使い分けるか", blocks: [
      { type: "table", caption: "見積工程別のツール分担", headers: ["手段", "向く役割", "向かない役割"], rows: [
        ["Excel", "明細編集、計算、原価・利益シミュレーション", "複数人の正本・履歴・権限管理"],
        ["AI", "現調メモ整理、項目候補、類似検索、説明文下書き", "数量・単価・利益・契約の確定"],
        ["業務システム", "案件、顧客、単価マスタ、版、承認、進捗", "未整理な判断を自動で正しくすること"],
      ] },
      { type: "judgement", title: "計算式をAIへ置き換えない", text: "決められた算式はExcelやプログラムで再現可能に計算し、AIは非構造なメモ・文書から候補を出す部分に使います。計算結果とAI提案を分離すると検証しやすくなります。" },
    ] },
    { id: "data", title: "見積データを7つに分ける", blocks: [
      { type: "architecture", nodes: ["案件: 顧客・現場・工事種別・期限", "現調: 部位・寸法・状態・写真・要望", "工種・品目マスタ: コード・単位・仕様", "価格: 材料・労務・外注・経費・適用日", "見積明細: 数量・単価・原価・利益", "条件: 前提・除外・有効期限・工期", "版・承認: 作成者・変更理由・承認者・日時"] },
      { type: "risk", title: "マスタ整備で決めること", items: ["同義の工種・品目名を統一する", "単価へ適用開始日と仕入先・地域条件を持たせる", "上書きせず旧単価と見積時点の値を残す", "標準原価と案件固有原価を分ける", "値引き・利益率・例外承認の基準を決める"] },
    ] },
    { id: "ai", title: "AIを使いやすい4つの作業", blocks: [
      { type: "table", caption: "見積AIの使いどころ", headers: ["作業", "入力", "出力と確認"], rows: [
        ["現調整理", "音声・メモ・写真説明", "部位、寸法、不明点の候補を現場担当が確認"],
        ["図書要約", "仕様書・質疑・依頼文", "見積条件候補を設計・積算担当が確認"],
        ["類似検索", "工種、規模、地域、条件", "過去案件と差異を見積責任者が確認"],
        ["提出文下書き", "確定明細・前提・除外", "説明文を営業・責任者が確認"],
      ] },
      { type: "paragraph", text: "図面・画像から数量候補を扱う場合も、解像度、縮尺、版、対象範囲を確認し、正式な拾い・現地確認・設計図書と照合します。AI結果だけを契約数量にしません。" },
    ] },
    { id: "review", title: "誤見積を防ぐ4つのレビューゲート", blocks: [
      { type: "steps", items: [
        { title: "入力確認", text: "図面版、現調日、寸法、顧客要望、提出期限、不足情報を確認します。" },
        { title: "明細確認", text: "工種、数量、単位、単価適用日、原価根拠、重複・抜けを確認します。" },
        { title: "採算確認", text: "粗利、値引き、共通費、リスク、外注見積の有効性を責任者が判断します。" },
        { title: "提出確認", text: "工期、支払、前提、除外、有効期限、変更理由を確定して版を固定します。" },
      ] },
      { type: "paragraph", text: "建設業法等の見積・契約に関する制度は改正されます。材料費・労務費等の内訳や工期情報など、必要事項は工事・取引条件に応じて最新の国土交通省資料と専門家の確認を行います。" },
    ] },
    { id: "implementation", title: "段階的な実装方法", blocks: [
      { type: "steps", items: [
        { title: "Excel標準化", text: "入力欄、計算欄、マスタ、出力を分け、保護、版、保存先を統一します。" },
        { title: "案件台帳と連携", text: "顧客・案件ID、期限、担当、ステータスを一度だけ入力する状態にします。" },
        { title: "AI支援を追加", text: "現調整理または類似検索の一業務で、根拠表示と人の確認を試します。" },
        { title: "承認と履歴をシステム化", text: "金額・利益・例外条件で承認を分け、変更前後を記録します。" },
      ] },
    ] },
    { id: "kpi", title: "見積改善の効果を測る", blocks: [
      { type: "table", caption: "見積業務の評価指標", headers: ["指標", "測り方", "目的"], rows: [
        ["作成時間", "受付から初稿・提出まで", "検索・転記・待ちを分ける"],
        ["差戻し率", "修正件数と理由", "入力・承認の問題を特定"],
        ["提出遅延", "期限超過件数", "案件機会損失を把握"],
        ["粗利差", "見積時と完工時", "原価・追加変更の精度を改善"],
        ["再利用率", "標準明細・類似案件の利用", "属人作成を減らす"],
      ] },
      { type: "roi", formula: "月間効果 = 削減できた検索・転記・確認時間 × 時間単価 + 提出漏れ削減 - 利用・保守費", assumptions: ["見積件数と工程別時間を実測", "AI結果の確認・修正時間を差し引く", "受注率は価格・営業等の影響を分けて扱う", "粗利は完工後の実績原価で確認"], result: "最初は売上予測より、作成時間、提出遅延、差戻し、粗利差の改善で評価します。" },
    ] },
    { id: "fit", title: "どの手段から始めるべきか", blocks: [
      { type: "matrix", axes: [
        { title: "Excel改善", text: "少人数・件数少・計算中心。テンプレートと版管理を整える。" },
        { title: "AI支援", text: "現調メモ・仕様書・過去見積の探索に時間がかかる。人が確認する。" },
        { title: "システム化", text: "複数人・複数案件でマスタ、承認、履歴、進捗が必要。" },
        { title: "先に業務整理", text: "工種・単価・原価・承認基準が担当者ごとに異なる。" },
      ] },
      { type: "paragraph", text: "SGPは現在の見積書、単価表、現調メモ、承認フローを確認し、Excelで残す計算、AIで支援する非構造情報、システムで正本化するデータを切り分けます。" },
    ] },
  ],
});
