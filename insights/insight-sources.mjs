export const insightSources = {
  metiAiGuideline: {
    title: "AI事業者ガイドライン",
    publisher: "経済産業省・総務省",
    url: "https://www.meti.go.jp/press/2024/04/20240419004/20240419004.html",
  },
  ipaSmeSecurity: {
    title: "中小企業の情報セキュリティ対策ガイドライン",
    publisher: "独立行政法人情報処理推進機構（IPA）",
    url: "https://www.ipa.go.jp/security/guide/sme/about.html",
  },
  ppcGenerativeAi: {
    title: "生成AIサービスの利用に関する注意喚起等について",
    publisher: "個人情報保護委員会",
    url: "https://www.ppc.go.jp/news/careful_information/230602_AI_utilize_alert/",
  },
  openAiBusinessData: {
    title: "Business data privacy, security, and compliance",
    publisher: "OpenAI",
    url: "https://openai.com/business-data/",
  },
  openAiCompanyKnowledge: {
    title: "Company knowledge in ChatGPT",
    publisher: "OpenAI Help Center",
    url: "https://help.openai.com/en/articles/12628342",
  },
  openAiDataControls: {
    title: "Data controls in the OpenAI platform",
    publisher: "OpenAI",
    url: "https://platform.openai.com/docs/models/default-usage-policies-by-endpoint",
  },
  nistGenerativeAiProfile: {
    title: "Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile",
    publisher: "NIST",
    url: "https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf",
  },
  microsoftRag: {
    title: "Retrieval augmented generation (RAG) and indexes in Microsoft Foundry",
    publisher: "Microsoft Learn",
    url: "https://learn.microsoft.com/en-us/azure/foundry/concepts/retrieval-augmented-generation",
  },
  kintonePricing: {
    title: "kintone 料金",
    publisher: "サイボウズ株式会社",
    url: "https://kintone.cybozu.co.jp/price/",
  },
  salesforceSmbCrm: {
    title: "中堅・中小企業向けCRM",
    publisher: "Salesforce",
    url: "https://www.salesforce.com/jp/small-business/",
  },
  lineWebhooks: {
    title: "メッセージ（Webhook）を受信する",
    publisher: "LINE Developers",
    url: "https://developers.line.biz/ja/docs/messaging-api/receiving-messages/",
  },
  lineAccountLinking: {
    title: "User account linking",
    publisher: "LINE Developers",
    url: "https://developers.line.biz/en/docs/messaging-api/linking-accounts/",
  },
  metiSmeDx: {
    title: "中堅・中小企業等向けDX推進の手引き",
    publisher: "経済産業省",
    url: "https://www.meti.go.jp/policy/it_policy/investment/dx-chukenchushotebiki/dx-chukenchushotebiki.html",
  },
  metiDxIndex: {
    title: "DX推進指標 2026改訂",
    publisher: "経済産業省・IPA",
    url: "https://www.meti.go.jp/press/2025/02/20260213001/20260213001.html",
  },
  mlitEstimate: {
    title: "建設業法・入契法改正（令和6年法律第49号）について",
    publisher: "国土交通省",
    url: "https://www.mlit.go.jp/tochi_fudousan_kensetsugyo/const/tochi_fudousan_kensetsugyo_const_tk1_000001_00033.html",
  },
  mlitBidBreakdown: {
    title: "公共工事の発注における入札金額の内訳について",
    publisher: "国土交通省",
    url: "https://www.mlit.go.jp/totikensangyo/const/totikensangyo_const_tk1_000101.html",
  },
  mlitBimCim: {
    title: "BIM/CIM関連基準要領等（令和7年3月）",
    publisher: "国土交通省",
    url: "https://www.mlit.go.jp/tec/tec_fr_000158.html",
  },
};

export function sourcesFor(...keys) {
  return keys.map((key) => {
    const source = insightSources[key];
    if (!source) throw new Error(`Unknown insight source: ${key}`);
    return { ...source, checkedAt: "2026-09-09" };
  });
}
