import { publishedArticle, qualityScore, sourcesFor } from "./article-utils.mjs";

export default publishedArticle({
  slug: "excel-vs-crm",
  title: "ExcelとCRMの違い｜中小企業はどちらを使うべきか",
  description: "ExcelとCRMを、人数、更新頻度、履歴、権限、営業プロセス、連携、費用の観点で比較します。Excelを続けられる条件、CRMへ移すサイン、段階的な移行方法を中小企業向けに解説します。",
  category: "business-improvement",
  tags: ["Excel", "CRM", "顧客管理", "営業管理"],
  priority: 79,
  relatedArticles: ["excel-to-system", "sales-process-integration", "dx-prioritization", "owner-dependency"],
  relatedServices: ["/services/business-improvement/", "/services/web-marketing/"],
  ctaType: "service-business-improvement",
  seoTitle: "ExcelとCRMの違い｜中小企業向け選び方と移行判断｜合同会社SGP",
  seoDescription: "ExcelとCRMの違いを、共有、履歴、権限、営業プロセス、通知、外部連携、総費用の7観点で比較します。中小企業がExcelを続けられる条件と、複数担当、追客漏れ、最新版不明、履歴不足からCRMへ移行すべきサインを整理し、顧客・案件・活動データを分けて段階移行する方法を解説します。",
  brief: {
    primaryReader: "顧客・案件管理をExcelのまま続けるかCRMへ移すか迷う経営者",
    readerSituation: "一覧表は使えているが、更新漏れ、ファイル重複、追客遅れが増えている",
    primaryProblem: "機能数や製品価格だけを比較し、業務上必要な共有・履歴・責任を定義していない",
    primaryIntent: "Excel CRM 違い 中小企業",
    decision: "Excel継続、併用、CRM移行のどれを選ぶか",
    mainAnswer: "単独・低頻度・単純集計はExcel、複数人・継続追客・履歴・権限・自動化が必要ならCRMを選ぶ",
    notToRecommend: "既存Excelを整理せず、そのままCRMへ全件移行すること",
    relevantService: "業務改善・DX支援",
    primaryCta: "業務改善支援",
    secondaryCta: "Web・営業導線改善",
    parentArticle: "excel-to-system",
    childArticles: ["kintone-vs-custom-system", "saas-vs-custom-development"],
    siblingArticles: ["sales-process-integration", "customer-data-fragmentation"],
    originalAsset: "Excel継続・併用・CRM移行の判定表",
    requiredEvidence: "CRMの役割、現行SaaSの費用構造、段階的DX",
  },
  originalAssets: ["7観点比較表", "移行サイン診断", "データ役割分担図", "3段階移行手順", "総費用モデル"],
  qualityScore: qualityScore({ searchIntent: 15, practicalValue: 19, originality: 14, accuracy: 15 }),
  sources: sourcesFor("salesforceSmbCrm", "kintonePricing", "metiSmeDx"),
  whatYouLearn: ["ExcelとCRMの役割の違い", "Excelのままでよい条件", "CRMへ移すべき具体的なサイン", "データを壊さず段階移行する方法"],
  summary: [
    "Excelは柔軟な計算・分析に強く、CRMは顧客との接点・案件・次回行動を複数人で継続管理する仕組みです。",
    "複数人更新、履歴、権限、通知、チャネル連携が必要になったら、Excelだけで支えるコストが増えています。",
    "CRM導入後も集計や一時分析にExcelを使えます。顧客・案件の正本をどちらに置くか明確にすることが重要です。",
  ],
  sections: [
    { id: "difference", title: "ExcelとCRMの違いを一言で整理する", blocks: [
      { type: "paragraph", text: "Excelは表計算の道具で、自由な計算、並べ替え、グラフ、一時的な分析に向きます。CRMは顧客、担当者、商談、活動履歴、次回行動を関連付け、営業プロセスを複数人で運用するための仕組みです。" },
      { type: "judgement", title: "優劣ではなく『正本の役割』を決める", text: "CRMを導入してもExcelは不要になりません。顧客・案件・活動履歴の正本はCRM、月次の追加分析はExcelという役割分担ができます。両方で同じ顧客情報を更新する状態を避けます。" },
    ] },
    { id: "comparison", title: "7つの観点で比較する", blocks: [
      { type: "table", caption: "ExcelとCRMの実務比較", headers: ["観点", "Excel", "CRM"], rows: [
        ["更新", "自由だが上書き・版違いが起きやすい", "入力項目と更新履歴を統制しやすい"],
        ["複数人共有", "共有設定とファイル運用に依存", "同じ顧客・案件を役割別に共有"],
        ["履歴", "行やシートを手動で追加", "メール・電話・商談を時系列化"],
        ["権限", "ファイル・シート単位が中心", "担当・部署・項目単位を設計可能"],
        ["営業プロセス", "列と色で表現しやすい", "ステージ、必須項目、期限を運用"],
        ["通知・連携", "マクロや別ツールが必要", "標準機能・API・自動処理を利用"],
        ["費用", "初期は低いが属人運用を含む", "利用料に設計・移行・教育が加わる"],
      ] },
    ] },
    { id: "excel-fit", title: "Excelを続けてもよい条件", blocks: [
      { type: "checklist", items: ["更新者が1〜2人で責任者が明確", "管理対象が単純な一覧で関連データが少ない", "月次など更新頻度が低い", "顧客への次回連絡や期限を別の仕組みで確実に管理できる", "個人情報の共有・権限・バックアップを管理できる", "ファイル名、保存先、入力規則が統一されている"] },
      { type: "paragraph", text: "この条件を満たすなら、Excelの入力規則、テーブル、共有場所、バックアップ、責任者を整えるだけで十分な場合があります。CRM導入そのものを目的にしないことが重要です。" },
    ] },
    { id: "crm-signs", title: "CRMへ移すべき8つのサイン", blocks: [
      { type: "checklist", items: ["誰が最新ファイルを持つか分からない", "同じ顧客が複数行・複数ファイルに存在する", "担当変更で過去のやり取りが引き継げない", "見積提出後の次回行動が空欄になる", "案件確度や売上予測を毎回集計し直す", "個人LINE・メールに履歴が残る", "閲覧させたくない情報を分けられない", "転記・照合・督促に毎週時間を使う"] },
      { type: "paragraph", text: "サインが複数ある場合、問題はExcelの行数より、複数人の行動と顧客履歴を同時に管理していることです。CRM候補を探す前に、顧客、案件、活動、次回タスクの定義を統一します。" },
    ] },
    { id: "design", title: "移行前に決める最小データモデル", blocks: [
      { type: "architecture", nodes: ["顧客企業: 一意ID・名称・所在地", "担当者: 所属企業・連絡先・同意", "案件: 商品・金額・担当・ステージ", "活動: 日時・手段・内容・実施者", "次回タスク: 期限・担当・完了条件", "見積・契約: 案件IDで関連付け"] },
      { type: "risk", title: "そのまま移行してはいけないデータ", items: ["同じ顧客の表記揺れと重複", "一つのセルに複数の意味が入った自由記述", "色だけで管理している確度・期限", "退職者しか意味を説明できない列", "保存根拠が不明な古い個人情報"] },
    ] },
    { id: "migration", title: "失敗しにくい3段階の移行", blocks: [
      { type: "steps", items: [
        { title: "正本と対象範囲を決める", text: "進行中案件など必要範囲へ絞り、移行後はCRMだけを更新する項目を決めます。" },
        { title: "1チームで並行検証する", text: "短期間だけ照合用Excelを残し、入力時間、漏れ、現場の修正点を確認します。" },
        { title: "集計と連携を後から追加する", text: "基本入力が定着してから、メール、フォーム、見積、会計との連携を段階的に追加します。" },
      ] },
      { type: "judgement", title: "全履歴の移行を完了条件にしない", text: "古いデータの整形に費用を使うより、現行案件と必要な顧客だけを正確に移し、過去ファイルは検索可能な参照用として保管する方が合理的な場合があります。" },
    ] },
    { id: "cost", title: "比較すべき総費用", blocks: [
      { type: "table", caption: "年間総費用に含める項目", headers: ["費用", "Excel継続", "CRM導入"], rows: [
        ["利用料", "表計算・ストレージ", "人数・機能・追加製品の利用料"],
        ["初期整備", "入力規則・台帳統合", "要件整理・設定・データ移行"],
        ["日常運用", "転記・集計・版管理", "入力・管理・権限・マスタ更新"],
        ["変更", "担当者による修正", "設定変更・連携保守・教育"],
        ["損失", "漏れ・重複・引継ぎ不全", "未定着・過剰機能・契約固定"],
      ] },
      { type: "paragraph", text: "CRMの料金は製品、プラン、利用人数で変わります。公開価格は変更されるため、導入時に公式料金と必要機能を確認し、最低契約数、容量、API、サポート、追加製品も含めて比較します。" },
    ] },
    { id: "fit", title: "Excel・併用・CRMの最終判断", blocks: [
      { type: "matrix", axes: [
        { title: "Excel継続", text: "少人数、低頻度、単純一覧。入力統制とバックアップを改善する。" },
        { title: "役割を分けて併用", text: "CRMを正本とし、Excelは一時分析・提出資料に限定する。" },
        { title: "CRMへ移行", text: "複数人の追客、履歴、権限、通知、予測が経営上必要。" },
        { title: "先に業務整理", text: "顧客・案件・ステージ・責任が曖昧。製品選定を止めて定義する。" },
      ] },
      { type: "paragraph", text: "判断に迷う場合は、現在のExcelを見ながら、誰が、いつ、何のために各列を更新するかを確認します。SGPは現行台帳と営業フローを整理し、Excel改善で足りる範囲とCRMが必要な範囲を切り分けます。" },
    ] },
  ],
});
