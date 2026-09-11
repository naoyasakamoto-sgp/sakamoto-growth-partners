import { publishedArticle, qualityScore, sourcesFor } from "./article-utils.mjs";

export default publishedArticle({
  slug: "line-to-crm",
  title: "LINE問い合わせをCRMに連携する方法",
  description: "LINE公式アカウントの問い合わせをCRMへ連携する方法を、Webhook、署名検証、顧客照合、案件作成、担当割当、返信、ログの順に解説します。連携方式と安全な段階導入も整理します。",
  category: "sales",
  tags: ["LINE公式アカウント", "CRM", "API連携", "問い合わせ"],
  priority: 62,
  relatedArticles: ["customer-data-fragmentation", "sales-process-integration", "construction-line-management", "excel-vs-crm"],
  relatedServices: ["/services/web-marketing/", "/services/business-improvement/"],
  ctaType: "service-web",
  seoTitle: "LINE問い合わせをCRMに連携する方法｜実装手順｜合同会社SGP",
  seoDescription: "LINE公式アカウントからCRMへ問い合わせを連携する方法を、Webhook受信、署名検証、顧客照合、案件作成、担当割当、返信、ログ保存の順に解説します。3つの連携方式、友だちと既存顧客を結び付けるルール、重複・送信失敗・担当不在時の処理、権限、同意、導入前テストを具体化します。",
  brief: {
    primaryReader: "LINE問い合わせの転記・担当割当・履歴管理を改善したい責任者",
    readerSituation: "LINE公式は運用しているが、CRM更新が手作業で対応漏れや重複がある",
    primaryProblem: "メッセージ転送だけを連携と考え、顧客照合・案件・失敗処理・正式記録を設計していない",
    primaryIntent: "LINE CRM 連携 方法",
    decision: "手動・連携サービス・API実装のどれを選び、どこまで自動化するか",
    mainAnswer: "LINE受信を受付IDで保存し、安全に顧客・案件を照合して活動と次回タスクとしてCRMへ登録する",
    notToRecommend: "表示名による自動統合と、重要回答の完全自動送信",
    relevantService: "LINE公式・CRM・営業導線構築支援",
    primaryCta: "Web・営業導線改善",
    secondaryCta: "業務改善支援",
    parentArticle: "sales-process-integration",
    childArticles: ["estimate-followup-automation"],
    siblingArticles: ["customer-data-fragmentation", "construction-line-management"],
    originalAsset: "LINEからCRMへの10段階連携フロー",
    requiredEvidence: "LINE公式Webhook・署名・非同期処理・アカウント連携、CRMデータ設計",
  },
  originalAssets: ["10段階連携フロー", "3方式比較", "顧客照合ルール", "エラー処理表", "導入テスト計画"],
  qualityScore: qualityScore({ searchIntent: 15, practicalValue: 20, originality: 14, accuracy: 15 }),
  sources: sourcesFor("lineWebhooks", "lineAccountLinking", "salesforceSmbCrm", "ipaSmeSecurity"),
  whatYouLearn: ["LINEとCRMを連携する3方式", "WebhookからCRM保存までの処理", "顧客・案件の安全な照合", "重複・失敗・権限を含む運用方法"],
  summary: [
    "LINEとCRMの連携は、メッセージをコピーするだけでなく、顧客・案件・活動・次回タスクへ分けて保存することです。",
    "Webhook受信では署名を検証し、受付をすぐ返して重い処理を非同期化し、重複イベントと再試行へ備えます。",
    "表示名だけで顧客を結び付けず、認証済みのアカウント連携、候補提示、人の確認、未照合を使い分けます。",
  ],
  sections: [
    { id: "goal", title: "LINE・CRM連携で改善する業務", blocks: [
      { type: "checklist", items: ["LINE受信を担当者がCRMへ転記する", "新規・既存顧客の判断に時間がかかる", "同じ顧客を複数担当が対応する", "案件と会話・写真が結び付かない", "返信期限と次回行動が残らない", "担当不在時に未対応を検知できない", "流入から商談・受注まで集計できない"] },
      { type: "judgement", title: "CRMに保存するのは会話全文だけではない", text: "受付、顧客、案件、活動、要点、添付、次回タスク、送信結果を分けます。会話全文の保存は利用目的、必要性、期間、権限を確認します。" },
    ] },
    { id: "options", title: "3つの連携方式を選ぶ", blocks: [
      { type: "table", caption: "LINE・CRM連携方式", headers: ["方式", "向く条件", "注意点"], rows: [
        ["手動運用", "件数少・担当少・検証段階", "転記基準と期限を統一"],
        ["連携サービス", "標準のCRM・項目・通知で足りる", "対応機能、権限、費用、データ保持"],
        ["Messaging API + CRM API", "独自の照合・案件・担当・画面が必要", "開発、監視、仕様変更、保守"],
      ] },
      { type: "paragraph", text: "最初に必須シナリオを作り、連携サービスの標準機能で満たせるか確認します。独自APIは、競争力や運用上必要な不足だけに限定します。" },
    ] },
    { id: "flow", title: "LINEからCRMまでの10段階フロー", blocks: [
      { type: "architecture", nodes: ["1. LINE公式で受信", "2. Webhook署名を検証", "3. イベントIDで重複防止", "4. 受付を返しキューへ保存", "5. 顧客・連絡先候補を照合", "6. 案件・相談種別を確認", "7. CRMへ活動・添付を登録", "8. 担当と次回期限を作成", "9. LINEで受付・回答を送信", "10. 成否・修正・監査ログを保存"] },
      { type: "paragraph", text: "LINE公式ドキュメントでは、Webhook署名の検証と非同期処理が案内されています。受信中にCRMやAIの完了を待ち続けず、検証後にキューへ保存し、失敗時に安全に再処理します。" },
    ] },
    { id: "mapping", title: "CRMへ保存する項目", blocks: [
      { type: "table", caption: "LINEイベントとCRMデータの対応", headers: ["LINE側", "CRM側", "ルール"], rows: [
        ["ユーザーID", "連絡先の外部ID", "認証連携後に保持"],
        ["メッセージID", "活動の外部ID", "重複登録防止"],
        ["本文・種別", "活動・問い合わせ要点", "原文と要約を区別"],
        ["画像・ファイル", "添付・文書ID", "保存目的・期限・権限"],
        ["受信日時", "活動日時・受付時刻", "タイムゾーンを統一"],
        ["担当・期限", "所有者・次回タスク", "分類後に確定"],
        ["送信結果", "対応履歴", "成功・失敗・再試行"],
      ] },
    ] },
    { id: "identity", title: "顧客・案件を誤結合しない", blocks: [
      { type: "process", beforeLabel: "危険な照合", before: ["表示名を見る", "同名顧客を選ぶ", "自動統合", "誤送信後に発覚"], afterLabel: "安全な照合", after: ["未照合で受付", "認証または複数情報で候補", "人・顧客が確認", "統合履歴と解除を保存"] },
      { type: "risk", title: "照合ルール", items: ["表示名・アイコンは本人確認に使わない", "確実な一意IDがない場合は候補提示に留める", "家族・代理人・法人担当者を同一人物にしない", "同じ顧客の複数案件は都度選択する", "誤結合を分離し元へ戻せる履歴を持つ", "認証用トークン・nonceは短時間・一回限りにする"] },
    ] },
    { id: "automation", title: "自動化してよい処理・人が確認する処理", blocks: [
      { type: "matrix", axes: [
        { title: "自動化しやすい", text: "受付ID、重複確認、定型受付、担当通知、営業時間案内。" },
        { title: "候補に留める", text: "顧客・案件照合、相談分類、要約、返信下書き。" },
        { title: "承認後に実行", text: "日程確定、見積説明、個別提案、顧客情報変更。" },
        { title: "人が最終判断", text: "契約、価格確約、苦情、返金、法律・安全・医療等。" },
      ] },
      { type: "paragraph", text: "AIを使う場合は、個人情報を渡す範囲、根拠、誤り、保存、学習利用、停止条件を確認します。AIが作った要約は原文や正式文書の代わりにしません。" },
    ] },
    { id: "errors", title: "連携失敗と再処理を設計する", blocks: [
      { type: "table", caption: "主なエラー処理", headers: ["失敗", "処理", "監視"], rows: [
        ["署名不一致", "処理せず拒否", "件数・送信元調査"],
        ["CRM一時停止", "キューで上限付き再試行", "滞留・最古時刻"],
        ["顧客未照合", "未照合キューへ", "担当者・期限"],
        ["重複Webhook", "外部IDで登録を省略", "重複件数"],
        ["添付取得失敗", "本文を先に保存し再取得", "欠損添付"],
        ["返信失敗", "CRMに失敗を記録し有人通知", "未送信件数"],
      ] },
      { type: "checklist", items: ["秘密情報をログ本文へ無制限に残さない", "再試行回数と間隔に上限を置く", "同じイベントを二重登録しない", "担当者が手動修正・再処理できる", "障害中の代替受付・返信方法を用意する"] },
    ] },
    { id: "pilot", title: "小さく導入して効果を測る", blocks: [
      { type: "steps", items: [
        { title: "手動基準を統一", text: "LINE受信後にCRMへ残す項目、担当、期限を決めます。" },
        { title: "受付・通知だけ連携", text: "本文転送より先に、受付IDと担当キューを自動化します。" },
        { title: "顧客・案件照合を追加", text: "人の確認を残し、誤結合と未照合を記録します。" },
        { title: "活動・タスクを自動登録", text: "重複防止とエラーキューを確認して範囲を広げます。" },
      ] },
      { type: "table", caption: "導入後のKPI", headers: ["KPI", "目的", "注意"], rows: [
        ["初回返信時間", "顧客対応", "営業時間内外を分ける"],
        ["未対応・期限超過", "漏れ", "担当不在も確認"],
        ["転記時間", "効率", "レビュー時間を差し引く"],
        ["誤結合・未照合", "データ品質", "低さだけで自動統合しない"],
        ["商談化・受注", "営業成果", "流入や案件差を分ける"],
      ] },
    ] },
  ],
});
