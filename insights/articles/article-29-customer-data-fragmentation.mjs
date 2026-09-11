import { publishedArticle, qualityScore, sourcesFor } from "./article-utils.mjs";

export default publishedArticle({
  slug: "customer-data-fragmentation",
  title: "顧客情報がLINE・メール・Excelに散らばる場合の改善方法",
  description: "LINE、メール、Excel、フォームに散らばる顧客情報を、顧客ID、正本、接点履歴、案件、次回行動へ整理する方法を解説します。重複統合、本人照合、権限、段階移行まで具体化します。",
  category: "business-improvement",
  tags: ["顧客情報", "データ統合", "CRM", "LINE"],
  priority: 63,
  relatedArticles: ["sales-process-integration", "excel-vs-crm", "dx-prioritization", "construction-crm"],
  relatedServices: ["/services/business-improvement/", "/services/web-marketing/"],
  ctaType: "service-business-improvement",
  seoTitle: "顧客情報がLINE・メール・Excelに散らばる時の改善｜合同会社SGP",
  seoDescription: "LINE、メール、Excel、問い合わせフォームに分散する顧客情報を、顧客ID、正本、接点履歴、案件、次回行動へ統合する方法を解説します。どのシステムを正本にするか、同一人物をどう照合するか、重複・表記ゆれをどう直すか、権限と履歴をどう残すかを整理し、業務を止めない段階移行を示します。",
  brief: {
    primaryReader: "顧客情報の分散で対応漏れと二重入力に悩む中小企業責任者",
    readerSituation: "担当者は顧客を知っているが、会社として最新状況・履歴・次回行動を把握できない",
    primaryProblem: "すべてのデータを一か所へコピーすることを統合と考え、正本・ID・更新責任を決めていない",
    primaryIntent: "顧客情報 LINE メール Excel 散らばる 改善",
    decision: "どの情報をどこへ集め、何を連携し、何を残すか決める",
    mainAnswer: "顧客・案件・活動・タスクの正本を定め、チャネルは受付として一意IDへ関連付ける",
    notToRecommend: "名前・電話番号の曖昧一致だけで顧客を自動統合すること",
    relevantService: "顧客・営業プロセス改善支援",
    primaryCta: "業務改善支援",
    secondaryCta: "Web・営業導線改善",
    parentArticle: "sales-process-integration",
    childArticles: ["line-to-crm", "estimate-followup-automation"],
    siblingArticles: ["excel-vs-crm", "construction-crm"],
    originalAsset: "顧客情報の正本・接点・案件モデル",
    requiredEvidence: "CRMの役割、LINEアカウント照合、情報セキュリティ・個人情報",
  },
  originalAssets: ["分散原因マップ", "正本設計表", "顧客ID照合ルール", "段階統合フロー", "データ品質KPI"],
  qualityScore: qualityScore({ searchIntent: 15, practicalValue: 20, originality: 14, accuracy: 15 }),
  sources: sourcesFor("salesforceSmbCrm", "lineAccountLinking", "ipaSmeSecurity", "ppcGenerativeAi", "metiSmeDx"),
  whatYouLearn: ["顧客情報が分散する原因", "顧客・案件・活動・タスクの正本設計", "重複顧客を安全に照合する方法", "業務を止めず段階統合する手順"],
  summary: [
    "顧客情報の統合は、全データをコピーすることではなく、顧客・案件・活動・次回タスクの正本と更新責任を決めることです。",
    "LINE・メール・フォームは接点として残し、受信時に受付IDを付け、確認後に顧客ID・案件IDへ関連付けます。",
    "名前や電話番号だけの自動統合は避け、確実一致、候補提示、人の確認、未照合の4状態で安全に処理します。",
  ],
  sections: [
    { id: "symptoms", title: "顧客情報が散らばると何が起きるか", blocks: [
      { type: "table", caption: "情報分散の症状", headers: ["症状", "原因", "影響"], rows: [
        ["同じ顧客へ別担当が連絡", "重複・担当・履歴が不明", "顧客体験悪化"],
        ["問い合わせへ返信できない", "個人LINE・メールだけで受信", "機会損失"],
        ["最新住所・連絡先が違う", "各台帳が正本を主張", "誤送信"],
        ["見積後の追客が漏れる", "活動と次回タスクが分離", "案件停滞"],
        ["退職者しか経緯を知らない", "会話が個人アカウントに残る", "引継ぎ不能"],
        ["集計値が合わない", "顧客と案件を一行で上書き", "経営判断遅延"],
      ] },
    ] },
    { id: "root", title: "ツール数より正本と責任の欠如が問題", blocks: [
      { type: "judgement", title: "一つの画面に集めても統合とは限らない", text: "コピーされたデータの更新元、重複時の優先、誤りの修正先が不明なら分散は残ります。項目ごとに正本、更新者、連携方向、更新頻度を決めます。" },
      { type: "checklist", items: ["顧客基本情報の正本", "案件ステージ・金額・担当の正本", "メール・LINE等の接点履歴の保存先", "次回行動・期限の正本", "見積・契約・請求の正式版", "同意・配信停止・保存期限の管理先", "重複・誤結合を修正する責任者"] },
    ] },
    { id: "model", title: "顧客・案件・活動・タスクを分ける", blocks: [
      { type: "architecture", nodes: ["顧客: 一意ID・名称・基本属性", "連絡先: 氏名・所属・連絡手段・同意", "案件: 相談・商談・工事ごとの担当・ステージ", "活動: LINE・メール・電話・面談・フォーム", "次回タスク: 行動・担当・期限・完了", "文書: 見積・契約・提出版", "請求・継続: 確定データ・次回提案"] },
      { type: "paragraph", text: "一顧客が複数案件を持ち、一案件へ複数担当者・活動が紐づく構造にします。『最終連絡内容』を顧客行へ上書きせず、活動履歴から最終接触日を計算します。" },
    ] },
    { id: "identity", title: "顧客IDと重複照合ルール", blocks: [
      { type: "table", caption: "顧客照合の4状態", headers: ["状態", "処理", "例"], rows: [
        ["確実一致", "既存顧客へ関連付け", "認証済みID・一意の会員番号"],
        ["候補あり", "担当者へ比較表示", "電話・メールは一致、氏名表記が違う"],
        ["新規", "新しい顧客IDを発行", "照合候補なし"],
        ["未照合", "受付IDのまま保留", "情報不足・家族・代理人"],
      ] },
      { type: "risk", title: "自動統合してはいけない条件", items: ["氏名・会社名の部分一致だけ", "共有電話・代表メールだけ", "LINE表示名・アイコンだけ", "家族・同一世帯を同一人物とみなす", "旧担当者の記憶だけ", "統合後に元へ戻す履歴がない"] },
    ] },
    { id: "integration", title: "チャネルから正本へつなぐ流れ", blocks: [
      { type: "architecture", nodes: ["LINE・メール・フォーム・電話", "チャネル固有IDと受付IDを保存", "入力形式・必須項目を検証", "顧客候補・案件候補を照合", "担当者が誤結合を確認", "活動履歴と添付を保存", "次回タスク・期限を作成", "返信・送信結果を記録", "失敗・未照合キューを監視"] },
      { type: "paragraph", text: "LINEのアカウント連携が必要な場合は、LINE公式ドキュメントのトークンとnonceを用いる方式等を確認します。表示名から推測せず、顧客本人が認証済みの自社導線から連携を開始できるようにします。" },
    ] },
    { id: "migration", title: "業務を止めない段階移行", blocks: [
      { type: "steps", items: [
        { title: "進行中案件を集める", text: "全顧客ではなく、現在対応中の顧客・案件・次回行動から整理します。" },
        { title: "正本とIDを決める", text: "項目ごとの更新元、重複ルール、責任者を定義します。" },
        { title: "一チャネルを連携する", text: "フォームなど構造化しやすい入口から受付IDと案件登録を試します。" },
        { title: "LINE・メールを追加する", text: "照合・権限・失敗処理を確認し、活動履歴へ広げます。" },
        { title: "旧台帳を参照専用にする", text: "移行後は二重更新を止め、必要な過去情報だけ段階移行します。" },
      ] },
    ] },
    { id: "governance", title: "個人情報・権限・保存を管理する", blocks: [
      { type: "checklist", items: ["顧客情報を利用する目的と取得経路", "本人・家族・法人担当者の区別", "営業・工事・経理・管理者の閲覧・編集権限", "同意、配信停止、連絡希望手段の記録", "退職・異動・委託終了時の権限停止", "チャネル原文・添付・要約・ログの保存期間", "誤送信・誤結合・漏えい時の停止・報告・修正"] },
      { type: "paragraph", text: "必要以上の個人情報を集約せず、利用目的に必要な範囲へ限定します。AIで要約・分類する場合は、入力情報、学習利用、保存、委託、削除、監督を採用サービスの最新条件で確認します。" },
    ] },
    { id: "kpi", title: "統合後の品質と効果を測る", blocks: [
      { type: "table", caption: "顧客データ統合KPI", headers: ["KPI", "意味", "改善先"], rows: [
        ["重複率", "同一顧客の複数登録", "照合・入力"],
        ["未照合率", "受付が顧客・案件へ未接続", "質問・本人確認"],
        ["次回行動設定率", "追客可能性", "必須項目"],
        ["初回返信時間", "受付・担当割当", "通知・キュー"],
        ["転記時間", "二重入力", "連携"],
        ["誤送信・誤結合", "安全性", "権限・レビュー"],
      ] },
      { type: "fit", fit: ["複数チャネルと担当で顧客対応する", "顧客・案件・活動・タスクを分けられる", "正本・ID・更新責任を決められる", "進行中案件から段階移行できる"], notFit: ["すべてを一括コピーすれば統合と考える", "名前・電話だけで自動統合する", "旧ExcelとCRMを永久に二重更新する", "個人情報の目的・権限・削除を決めない"] },
    ] },
  ],
});
