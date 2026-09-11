import { publishedArticle, qualityScore, sourcesFor } from "./article-utils.mjs";

export default publishedArticle({
  slug: "saas-vs-custom-development",
  title: "SaaSとスクラッチ開発の違い｜中小企業向け判断基準",
  description: "SaaSとスクラッチ開発を、業務の独自性、導入速度、変更、連携、統制、運用体制、総費用で比較します。中小企業がSaaS、設定開発、独自システムを選び分ける判断基準を解説します。",
  category: "business-improvement",
  tags: ["SaaS", "スクラッチ開発", "システム開発", "DX"],
  priority: 78,
  relatedArticles: ["excel-vs-crm", "dx-prioritization", "excel-to-system", "ai-implementation-cost"],
  relatedServices: ["/services/business-improvement/", "/services/ai/"],
  ctaType: "service-business-improvement",
  seoTitle: "SaaSとスクラッチ開発の違い｜中小企業の判断基準｜合同会社SGP",
  seoDescription: "SaaSとスクラッチ開発の違いを、業務の独自性、導入速度、変更頻度、外部連携、権限、運用体制、5年総費用で比較します。設定開発やハイブリッドを含む4方式の境界、SaaSへ業務を合わせる条件、独自開発が必要な条件、ベンダー変更や撤退のしやすさを整理し、中小企業向けの選定手順を解説します。",
  brief: {
    primaryReader: "既製SaaSと独自システムのどちらへ投資すべきか迷う経営者",
    readerSituation: "SaaSでは合わないという現場意見と、独自開発は高いという懸念が対立している",
    primaryProblem: "現行業務をそのまま再現する前提で、独自性の価値と運用責任を評価していない",
    primaryIntent: "SaaS スクラッチ開発 違い 中小企業",
    decision: "SaaS、設定開発、独自開発、組み合わせのどれを選ぶか",
    mainAnswer: "共通業務はSaaSへ合わせ、競争力に関わる独自業務だけを設定・連携・独自開発で補う",
    notToRecommend: "要件未整理のまま現行Excelを完全再現する独自開発",
    relevantService: "業務改善・DX支援",
    primaryCta: "業務改善支援",
    secondaryCta: "AI導入支援",
    parentArticle: "dx-prioritization",
    childArticles: ["kintone-vs-custom-system"],
    siblingArticles: ["excel-vs-crm", "ai-implementation-cost"],
    originalAsset: "4方式の選定マトリクス",
    requiredEvidence: "SaaSの現行費用、段階的DX、運用責任",
  },
  originalAssets: ["7観点比較表", "独自性判定", "4方式マトリクス", "5年TCOモデル", "撤退可能性チェック"],
  qualityScore: qualityScore({ searchIntent: 15, practicalValue: 19, originality: 14, accuracy: 15 }),
  sources: sourcesFor("metiSmeDx", "kintonePricing", "salesforceSmbCrm", "ipaSmeSecurity"),
  whatYouLearn: ["SaaSと独自開発の責任範囲の違い", "独自機能を作る価値の判定方法", "初期費用以外を含む総費用", "SaaSと独自機能を組み合わせる方法"],
  summary: [
    "会計、勤怠、一般的な顧客管理など共通業務は、原則としてSaaSに業務を合わせる方が速く維持しやすいです。",
    "独自開発は、標準化できた独自業務が売上・粗利・品質へ継続的に寄与し、保守責任を持てる場合に検討します。",
    "実務ではSaaSかスクラッチの二択ではなく、SaaS、ノーコード設定、API連携、限定的な独自機能の組み合わせが有効です。",
  ],
  sections: [
    { id: "definition", title: "SaaSとスクラッチ開発の違い", blocks: [
      { type: "paragraph", text: "SaaSは提供会社が共通機能、更新、基盤運用を担い、利用企業は契約範囲で設定して使います。スクラッチ開発は自社の要件に合わせて設計・実装できますが、要件変更、品質、セキュリティ、保守、担当交代まで自社側の責任が大きくなります。" },
      { type: "judgement", title: "自由度は資産であると同時に運用負債になる", text: "作れることと、作る価値があることは別です。独自機能を増やすほど、仕様確認、テスト、障害対応、法改正、OS・API更新への対応が続きます。" },
    ] },
    { id: "comparison", title: "7つの観点で比較する", blocks: [
      { type: "table", caption: "SaaSとスクラッチ開発の比較", headers: ["観点", "SaaS", "スクラッチ開発"], rows: [
        ["導入速度", "標準機能なら短い", "設計・実装・試験が必要"],
        ["業務適合", "製品仕様へ合わせる", "必要範囲を独自設計できる"],
        ["変更", "提供会社の機能・制約に依存", "自社判断で可能だが費用が発生"],
        ["連携", "標準連携・APIの範囲", "技術的には広いが個別保守が必要"],
        ["セキュリティ", "提供会社と利用者で責任分担", "設計・運用責任が自社側へ増える"],
        ["費用", "利用人数・プランに応じた継続費", "初期開発に加え継続保守費"],
        ["撤退", "データ出力と契約条件に依存", "コード・仕様・環境の引継ぎに依存"],
      ] },
    ] },
    { id: "uniqueness", title: "独自開発する価値がある業務か判断する", blocks: [
      { type: "checklist", items: ["その業務が受注率、粗利、納期、品質など競争力へ直結する", "現場の例外を含め、現在の手順を説明できる", "月間件数が多く、改善効果を数値化できる", "標準SaaSとの差が単なる慣れではなく顧客価値を生む", "仕様決定者と運用責任者を社内に置ける", "3年以上の変更・保守費を負担できる"] },
      { type: "paragraph", text: "『今のExcelと画面が違う』『入力順を変えたくない』だけでは独自開発の根拠として弱いです。独自性がなくせない理由を、顧客価値、法令、契約、品質、原価などの事実で説明します。" },
    ] },
    { id: "options", title: "二択ではなく4方式から選ぶ", blocks: [
      { type: "matrix", axes: [
        { title: "標準SaaS", text: "共通業務を製品の標準プロセスへ合わせる。最初に検討する。" },
        { title: "SaaSの設定・ノーコード", text: "項目、画面、承認、通知を設定し、コードを最小化する。" },
        { title: "SaaS + API連携", text: "各システムの責任を分け、必要なデータだけを連携する。" },
        { title: "限定スクラッチ", text: "競争力に関わる独自部分だけ作り、認証や会計等は既製基盤を使う。" },
      ] },
      { type: "architecture", nodes: ["Web・LINEの受付", "CRM/SaaSを顧客・案件の正本にする", "連携基盤でデータ形式を統一", "独自の見積・判定ロジックだけを実装", "会計・請求SaaSへ確定データを渡す", "監視・エラー再処理"] },
    ] },
    { id: "tco", title: "5年総費用で比較する", blocks: [
      { type: "table", caption: "TCOに含める費用", headers: ["時点", "SaaS", "スクラッチ"], rows: [
        ["導入", "選定・設定・移行・教育", "要件・設計・開発・試験・移行"],
        ["毎月", "利用料・管理・追加容量", "クラウド・監視・保守・問い合わせ"],
        ["変更", "上位プラン・設定・連携改修", "仕様変更・再試験・データ移行"],
        ["障害", "提供会社との調整・業務継続", "原因調査・復旧・再発防止"],
        ["終了", "契約終了・データ出力・切替", "環境停止・データ移行・資産引継ぎ"],
      ] },
      { type: "roi", formula: "5年価値 = 削減時間 + 粗利改善 + 損失回避 - 導入・利用・変更・保守・撤退費", assumptions: ["利用人数と業務量の増減を年ごとに置く", "SaaS公開価格は導入時の公式情報で更新する", "独自開発は初期費用だけでなく保守・再試験を含む", "効果は現状値と導入後の実測値で見直す"], result: "初年度が安い方式ではなく、必要機能・運用責任・変更頻度を満たす5年総費用で比較します。" },
    ] },
    { id: "requirements", title: "見積依頼前に決める要件", blocks: [
      { type: "checklist", items: ["対象業務の開始・完了・責任者", "必須機能と、なくても運用できる機能", "顧客・案件・商品等の正本と一意ID", "権限、監査ログ、保存期間、バックアップ", "既存システムとの入出力・API", "月間件数、同時利用者、繁忙期", "受入試験と完了条件", "データと設定・コードの返却条件"] },
      { type: "risk", title: "見積金額が比較不能になる原因", items: ["同じ『連携』でも手動CSVとリアルタイムAPIが混在", "保守範囲と応答時間が未定義", "データ移行の件数・品質・変換ルールが不明", "SaaSのライセンス・外部サービス費が別計上", "検収後の軽微修正が無制限だと誤解している"] },
    ] },
    { id: "pilot", title: "小規模検証から本番へ進む手順", blocks: [
      { type: "steps", items: [
        { title: "業務を簡素化する", text: "不要な例外と承認を減らし、現行業務の完全再現を要件から外します。" },
        { title: "SaaSで代替率を確認する", text: "必須シナリオを実データで試し、標準・設定・連携・不足へ分類します。" },
        { title: "不足部分だけ試作する", text: "売上や品質に関わる不足だけを小さく実装し、利用者と検証します。" },
        { title: "継続責任を確定する", text: "障害、権限、マスタ、変更依頼、ベンダー連絡の担当を決めて本番化します。" },
      ] },
    ] },
    { id: "decision", title: "中小企業向けの最終判断", blocks: [
      { type: "fit", fit: ["共通業務はSaaSへ合わせられる", "独自部分を一文で説明し効果を測れる", "運用責任者と予算を継続配置できる", "データ移行・撤退条件まで比較している"], notFit: ["現行Excelを完全再現することが目的", "製品デモだけで業務適合を判断する", "初期見積だけで5年費用を比較する", "保守や仕様判断をすべて外部へ任せる"] },
      { type: "paragraph", text: "SGPは現場業務を観察し、標準SaaSで足りる部分、設定や連携で補う部分、独自開発に投資する部分を切り分けます。製品名を決める前の要件整理から支援できます。" },
    ] },
  ],
});
