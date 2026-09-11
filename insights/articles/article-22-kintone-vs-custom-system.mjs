import { publishedArticle, qualityScore, sourcesFor } from "./article-utils.mjs";

export default publishedArticle({
  slug: "kintone-vs-custom-system",
  title: "kintoneと独自システムはどちらがいい？判断基準を解説",
  description: "kintoneと独自システムを、業務適合、データ構造、画面、処理量、連携、権限、保守で比較します。kintoneで始める条件、プラグインやAPI連携の境界、独自開発が必要な条件を解説します。",
  category: "business-improvement",
  tags: ["kintone", "独自システム", "ノーコード", "業務改善"],
  priority: 77,
  relatedArticles: ["saas-vs-custom-development", "excel-vs-crm", "excel-to-system", "dx-prioritization"],
  relatedServices: ["/services/business-improvement/", "/services/ai/"],
  ctaType: "service-business-improvement",
  seoTitle: "kintoneと独自システムはどちらがいい？判断基準｜合同会社SGP",
  seoDescription: "kintoneと独自システムを、データ構造、画面、処理量、外部連携、権限、保守体制で比較します。標準機能、設定、プラグイン、API連携、独自開発の4方式をどの条件で選ぶか、プラグイン依存や複雑化の兆候、総費用、撤退可能性を整理し、中小企業が段階的に選定・移行する判断基準を解説します。",
  brief: {
    primaryReader: "Excel業務をkintoneへ移すか独自システムを作るか迷う責任者",
    readerSituation: "kintoneの試作はできたが、複雑な要望とプラグインが増え始めている",
    primaryProblem: "初期構築の容易さだけで判断し、データ構造・処理量・変更責任を評価していない",
    primaryIntent: "kintone 独自システム 比較",
    decision: "kintone標準、拡張、外部連携、独自開発の境界を決める",
    mainAnswer: "一覧・申請・案件管理はkintoneを優先し、複雑な計算、専用UI、大量処理、外部公開は別実装を検討する",
    notToRecommend: "プラグインを増やせばすべて解決するという前提",
    relevantService: "業務改善・DX支援",
    primaryCta: "業務改善支援",
    secondaryCta: "AI導入支援",
    parentArticle: "saas-vs-custom-development",
    childArticles: ["line-to-crm"],
    siblingArticles: ["excel-vs-crm", "excel-to-system"],
    originalAsset: "kintone実装方式の境界判定表",
    requiredEvidence: "kintone公式料金・機能条件、運用・セキュリティ責任",
  },
  originalAssets: ["6項目適合診断", "4方式境界表", "データ分割図", "プラグイン負債チェック", "段階移行手順"],
  qualityScore: qualityScore({ searchIntent: 15, practicalValue: 19, originality: 14, accuracy: 15 }),
  sources: sourcesFor("kintonePricing", "metiSmeDx", "ipaSmeSecurity"),
  whatYouLearn: ["kintoneが向く業務", "独自システムが必要になる条件", "標準・プラグイン・APIの境界", "試作から本番へ移す確認事項"],
  summary: [
    "kintoneは、表形式の業務データ、担当、ステータス、申請、一覧を現場で変更しながら運用する業務に向きます。",
    "複雑な計算、専用操作画面、大量・リアルタイム処理、一般顧客向け画面が中心なら、外部連携や独自システムを検討します。",
    "標準機能で試し、設定、プラグイン、API、独自開発の順に必要性を確認すると、保守不能な拡張を避けられます。",
  ],
  sections: [
    { id: "answer", title: "kintoneと独自システムは業務の形で選ぶ", blocks: [
      { type: "paragraph", text: "kintoneは、Excel台帳のようなレコードをアプリとして管理し、担当、ステータス、一覧、通知、権限を設定できる業務基盤です。独自システムは画面・処理・データを自由に設計できますが、開発と継続保守の責任が増えます。" },
      { type: "judgement", title: "『作れるか』ではなく『維持できるか』で決める", text: "JavaScriptやプラグインで実現できても、更新のたびに競合確認が必要なら運用費が増えます。標準機能で何割を満たせるか、残りが競争力に必要かを分けます。" },
    ] },
    { id: "fit", title: "kintoneが向く業務・向かない業務", blocks: [
      { type: "fit", fit: ["顧客、案件、見積依頼、問い合わせなど表形式で管理できる", "担当者とステータスを明確にし、通知や承認を行いたい", "現場管理者が項目・一覧・プロセスを継続改善したい", "少人数から開始し、複数部署へ段階展開したい"], notFit: ["CADや画像編集など専用操作が中心", "複雑な最適化・計算を画面操作ごとに実行する", "一般消費者が大量アクセスする公開サービス", "ミリ秒単位の応答や大規模な連続処理が必要"] },
    ] },
    { id: "criteria", title: "6項目で適合度を確認する", blocks: [
      { type: "table", caption: "kintone・独自システム判定表", headers: ["項目", "kintone寄り", "独自システム寄り"], rows: [
        ["データ", "表・関連台帳が中心", "複雑な階層・高速検索・特殊形式"],
        ["画面", "フォーム・一覧・グラフ", "専用操作・高度な可視化"],
        ["処理", "登録、承認、通知、定期集計", "複雑な計算・大量バッチ・リアルタイム"],
        ["利用者", "社内・限定取引先", "不特定多数の顧客"],
        ["変更", "項目や手順を現場で頻繁に改善", "厳密なリリース管理が必要"],
        ["責任", "SaaS基盤を利用", "基盤・アプリを自社側で維持"],
      ] },
    ] },
    { id: "levels", title: "標準・設定・連携・独自開発の境界", blocks: [
      { type: "steps", items: [
        { title: "標準機能", text: "フォーム、一覧、権限、プロセス、通知で必須シナリオを試します。" },
        { title: "設定・プラグイン", text: "標準で不足する入力補助や帳票を、更新責任と費用を確認して追加します。" },
        { title: "API連携", text: "会計、Webフォーム、LINEなど別システムの正本を保ち、必要データだけ連携します。" },
        { title: "独自システム", text: "専用UI、複雑処理、高負荷など、kintone外で持つ合理性がある部分を実装します。" },
      ] },
      { type: "architecture", nodes: ["Web・LINE受付", "連携APIで検証・重複排除", "kintoneで顧客・案件・担当・進捗管理", "外部処理で複雑な計算・帳票", "会計等へ確定データ連携", "エラーキューと監査ログ"] },
    ] },
    { id: "data", title: "アプリを増やす前にデータを分ける", blocks: [
      { type: "paragraph", text: "一つのアプリへ顧客、担当者、案件、商品、活動履歴を詰め込むと、同じ情報の重複と更新漏れが増えます。何を一件として管理するかを決め、顧客ID・案件IDなどで関連付けます。" },
      { type: "table", caption: "基本的なアプリ分割例", headers: ["アプリ", "一件の単位", "主な項目"], rows: [
        ["顧客", "一社・一世帯", "名称、住所、区分、担当"],
        ["案件", "一つの相談・工事・商談", "顧客ID、金額、ステータス、期限"],
        ["活動", "一回の連絡・訪問", "案件ID、日時、手段、結果"],
        ["タスク", "一つの次回行動", "案件ID、担当、期限、完了"],
      ] },
    ] },
    { id: "plugins", title: "プラグインとカスタマイズの増やしすぎを防ぐ", blocks: [
      { type: "risk", title: "拡張を止めて再設計するサイン", items: ["同じ目的のプラグインが複数ある", "一つの変更で複数アプリのJavaScript修正が必要", "作成者以外が設定理由を説明できない", "アップデート前の検証環境と手順がない", "障害時に標準・プラグイン・個別コードの切り分けができない", "月額追加費用が独自実装の保守費に近づいている"] },
      { type: "paragraph", text: "拡張ごとに所有者、目的、対象アプリ、契約、更新日、依存関係、停止方法を台帳化します。標準機能へ戻せるものや使われていないものは削除し、カスタマイズの総量を管理します。" },
    ] },
    { id: "cost", title: "料金表だけでなく総費用を比較する", blocks: [
      { type: "checklist", items: ["契約プラン、最低契約数、利用人数", "ゲスト・外部利用、ストレージ、API等の条件", "プラグイン・連携サービスの月額", "設計、設定、移行、教育の初期工数", "管理者による権限・アプリ・マスタ保守", "JavaScript・API連携の試験と障害対応"] },
      { type: "paragraph", text: "kintoneのプラン、価格、最小契約数、機能条件は変更される可能性があります。この記事では固定金額を判断根拠にせず、導入時に公式料金ページと契約条件を確認します。" },
      { type: "roi", formula: "年間効果 = 削減工数 + 漏れ・手戻り削減 + 売上機会改善 - 利用・拡張・運用費", assumptions: ["対象人数と月間件数を実測する", "プラグインと外部連携を含む", "管理者の改善・問い合わせ時間を含む", "独自開発案も5年総費用で比較する"], result: "標準機能で高い代替率が得られるほどkintone案が有利です。個別拡張が積み上がる場合は構成を再比較します。" },
    ] },
    { id: "pilot", title: "失敗しにくい導入手順", blocks: [
      { type: "steps", items: [
        { title: "必須シナリオを5〜10本作る", text: "日常、例外、担当変更、差戻し、検索、集計を実データで確認します。" },
        { title: "標準機能だけで試作する", text: "不足をすぐ拡張せず、業務変更で吸収できるか利用者と判断します。" },
        { title: "一部署で4〜8週間運用する", text: "入力時間、漏れ、修正、利用率、問い合わせを記録します。" },
        { title: "拡張理由を審査する", text: "効果、代替案、所有者、費用、停止方法がそろったものだけ追加します。" },
      ] },
      { type: "paragraph", text: "SGPは既存Excelと業務を確認し、kintone標準で始める範囲、APIでつなぐ範囲、独自実装へ分ける範囲を整理します。製品契約前の適合確認から支援できます。" },
    ] },
  ],
});
