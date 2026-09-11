import { publishedArticle, qualityScore, sourcesFor } from "./article-utils.mjs";

export default publishedArticle({
  slug: "chatgpt-vs-rag",
  title: "ChatGPTとRAGの違い｜社内AIを作るならどちらが必要？",
  description: "ChatGPTとRAGを、回答根拠、社内情報、更新性、権限、導入速度、運用責任で比較します。一般業務はChatGPT、社内文書に基づく回答はRAGという基本と、接続機能を含む判断方法を解説します。",
  category: "ai",
  tags: ["ChatGPT", "RAG", "社内AI", "生成AI"],
  priority: 76,
  relatedArticles: ["rag-internal-search", "chatgpt-company-policy", "ai-business-tasks", "ai-implementation-cost"],
  relatedServices: ["/services/ai/", "/services/business-improvement/"],
  ctaType: "service-ai",
  seoTitle: "ChatGPTとRAGの違い｜社内AIに必要なのはどちら？｜合同会社SGP",
  seoDescription: "ChatGPTとRAGの違いを、回答根拠、社内情報、更新性、権限、引用、費用で比較します。一般的な作成・要約ならChatGPT、管理された社内資料に基づく回答ならRAGという基本線に加え、接続型の会社知識機能も含めた選択条件、評価質問、誤回答時の人による確認、小さく検証する方法を解説します。",
  brief: {
    primaryReader: "社内資料をAIで活用したいがChatGPTとRAGの違いが分からない経営者",
    readerSituation: "社員がChatGPTを使い始め、社内文書をアップロードする案とRAG構築案が出ている",
    primaryProblem: "製品であるChatGPTと、情報を検索して回答へ渡す設計方式であるRAGを同列に比較している",
    primaryIntent: "ChatGPT RAG 違い",
    decision: "一般的なAI利用、既製の会社知識接続、個別RAGのどこまで必要か",
    mainAnswer: "一般知識や文章支援はChatGPT、管理された社内情報を根拠付きで使うなら取得機能またはRAGを選ぶ",
    notToRecommend: "社内ファイルを無差別に投入し、回答を正解として扱うこと",
    relevantService: "AI導入・RAG構築支援",
    primaryCta: "AI導入支援",
    secondaryCta: "業務改善支援",
    parentArticle: "rag-internal-search",
    childArticles: ["rag-cost", "construction-rag"],
    siblingArticles: ["chatgpt-company-policy", "ai-agent-vs-automation"],
    originalAsset: "ChatGPT・既製接続・個別RAGの3段階判定",
    requiredEvidence: "OpenAI公式の会社知識、RAGの検索・権限・評価",
  },
  originalAssets: ["6観点比較表", "3段階判定", "RAG回答フロー", "ユースケース選択表", "検証設計"],
  qualityScore: qualityScore({ searchIntent: 15, practicalValue: 19, originality: 14, accuracy: 15 }),
  sources: sourcesFor("openAiCompanyKnowledge", "openAiBusinessData", "microsoftRag", "nistGenerativeAiProfile", "metiAiGuideline"),
  whatYouLearn: ["ChatGPTとRAGが同じ種類のものではない理由", "社内情報への接続が必要な業務", "既製機能と個別RAGの選び分け", "権限・根拠・評価を含む導入手順"],
  summary: [
    "ChatGPTはAIを利用する製品・対話環境、RAGは質問に関連する情報を検索し、回答生成へ渡す設計方式です。",
    "文章の下書きや一般的な発想支援はChatGPT単体、社内規程・案件・製品情報に基づく回答は検索接続やRAGが必要です。",
    "現在のChatGPTにも会社知識へ接続する機能があります。利用可能なプラン・接続先・権限を公式情報で確認し、個別構築と比較します。",
  ],
  sections: [
    { id: "definition", title: "ChatGPTとRAGは比較する階層が違う", blocks: [
      { type: "paragraph", text: "ChatGPTはユーザーが文章生成、要約、分析、対話などを行う製品です。RAG（Retrieval-Augmented Generation）は、質問に関連する文書やデータを検索し、その内容をAIへ渡して回答を作る構成です。ChatGPTや別のAI製品の中でRAGに近い検索機能が使われる場合もあります。" },
      { type: "judgement", title: "『ChatGPTかRAGか』を二者択一にしない", text: "先に、一般知識で足りるか、自社情報が必要か、既製の接続機能で足りるかを順番に判断します。RAGを独自構築するのは、検索・権限・画面・連携・評価に固有要件が残る場合です。" },
    ] },
    { id: "comparison", title: "6つの観点で違いを整理する", blocks: [
      { type: "table", caption: "一般的なChatGPT利用とRAG構成の比較", headers: ["観点", "一般的なChatGPT利用", "RAGを使う社内AI"], rows: [
        ["主な情報", "モデルの知識と会話で渡した情報", "検索対象として管理した社内情報"],
        ["更新", "会話ごとの入力や製品機能に依存", "文書更新・再索引の運用を設計"],
        ["根拠", "一般回答は社内文書と一致しない", "取得文書と該当箇所を提示可能"],
        ["権限", "ワークスペース・会話・接続設定", "検索時に文書・利用者権限を適用"],
        ["導入", "利用開始が速い", "データ整備・検索・評価が必要"],
        ["責任", "利用ルールと人の確認", "加えて索引・検索・監視の運用責任"],
      ] },
    ] },
    { id: "use-cases", title: "業務別に必要な方式を選ぶ", blocks: [
      { type: "table", caption: "ユースケース別の選択", headers: ["業務", "最初の選択", "理由"], rows: [
        ["メールの言い換え", "ChatGPT", "社内固有知識が少ない"],
        ["会議メモの整理", "ChatGPT + 入力ルール", "対象資料を会話内で限定できる"],
        ["就業規則の質問", "検索接続・RAG", "版・根拠・対象者の確認が必要"],
        ["過去見積の類似検索", "個別RAGを検討", "項目検索、権限、案件連携が必要"],
        ["顧客別契約の回答", "RAG + 人の承認", "機密性と誤回答影響が高い"],
      ] },
    ] },
    { id: "levels", title: "3段階で必要十分な構成を選ぶ", blocks: [
      { type: "steps", items: [
        { title: "段階1: 一般的な対話利用", text: "機密情報を入れず、文章・発想・公開情報の整理で業務効果を確認します。" },
        { title: "段階2: 既製の会社知識・ファイル検索", text: "対象プラン、接続元、アクセス権、引用、管理機能が要件を満たすか試します。" },
        { title: "段階3: 個別RAG", text: "独自データ、検索条件、業務画面、監査、他システム連携が必要な部分だけ構築します。" },
      ] },
      { type: "paragraph", text: "OpenAIの公式情報では、対象プランのCompany Knowledgeが対応する知識ソースを検索し、接続元の権限を尊重して回答にソースを示す仕組みを案内しています。名称、利用条件、対応環境は変わるため導入時に最新情報を確認します。" },
    ] },
    { id: "rag-flow", title: "RAGで回答が作られる流れ", blocks: [
      { type: "architecture", nodes: ["利用者の質問", "利用者・部署・案件を認証", "質問を検索用に整形", "権限内の文書だけ検索", "関連箇所とメタデータを取得", "取得内容をAIへ渡す", "回答・引用・不確実性を表示", "評価ログへ保存"] },
      { type: "risk", title: "RAGでも防げないこと", items: ["元文書の誤りや古い版", "検索で重要箇所を取得できない見逃し", "取得した文書中の悪意ある指示", "複数文書の矛盾", "回答生成時の誤解・断定", "利用者が引用を確認せず意思決定すること"] },
    ] },
    { id: "data-security", title: "社内情報を扱う前の確認事項", blocks: [
      { type: "checklist", items: ["入力・出力がモデル学習へ使われる条件", "会話・ファイル・索引・ログの保存期間と削除", "部署・役職・案件ごとのアクセス権", "退職・異動時の権限同期", "国外移転、委託先、監査・契約条件", "個人情報・秘密情報を扱う利用目的", "インシデント時の停止と追跡方法"] },
      { type: "paragraph", text: "OpenAIはBusiness、Enterprise、API等の業務向けデータを既定で学習に使わないと説明していますが、利用製品、接続アプリ、エンドポイントにより保持・設定条件は異なります。採用時に公式の最新条件を確認します。" },
    ] },
    { id: "evaluation", title: "回答品質を検証する方法", blocks: [
      { type: "table", caption: "社内AIの評価セット", headers: ["評価", "確認内容", "不合格例"], rows: [
        ["検索", "正しい文書・版・箇所を取得", "古い規程だけを取得"],
        ["権限", "利用者が閲覧できる情報だけ取得", "他部署の機密を表示"],
        ["根拠", "主張が引用箇所に含まれる", "引用と回答が不一致"],
        ["回答", "質問へ必要十分に答える", "不明点を推測で補う"],
        ["拒否", "答えられない場合に止まる", "根拠なしに断定する"],
      ] },
      { type: "paragraph", text: "日常質問だけでなく、曖昧、誤字、複数条件、権限外、答えがない、文書が矛盾する質問を含めます。正答率だけでなく、危険な誤回答率と根拠確認時間を別に測ります。" },
    ] },
    { id: "decision", title: "社内AIの最終判断", blocks: [
      { type: "fit", fit: ["使う社内情報、利用者、回答後の行動を定義できる", "文書の所有者・版・権限を整備できる", "回答と引用を評価する担当者がいる", "既製機能と個別構築を同じ要件で比較する"], notFit: ["社内ファイルを全部入れれば正解すると考えている", "古い文書・重複・権限を整理できない", "法務・人事・契約判断を無確認で自動化する", "構築後の文書更新と評価担当がいない"] },
      { type: "paragraph", text: "まず20〜50問の評価セットと、対象文書を限定した小規模検証を行います。SGPは既製の会社知識機能で足りる範囲と、個別RAGが必要な検索・権限・連携要件を切り分けます。" },
    ] },
  ],
});
