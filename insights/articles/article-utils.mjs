import { sourcesFor } from "../insight-sources.mjs";

const baseScore = {
  searchIntent: 14,
  practicalValue: 18,
  originality: 13,
  accuracy: 14,
  readability: 9,
  businessRelevance: 9,
  internalLinking: 5,
  seoAiSearch: 5,
  uxTechnical: 5,
};

export function qualityScore(overrides = {}) {
  const values = { ...baseScore, ...overrides };
  return { ...values, total: Object.values(values).reduce((sum, value) => sum + value, 0) };
}

export function publishedArticle(article) {
  return {
    publishedAt: "2026-09-09",
    author: "naoya-sakamoto",
    status: "published",
    featured: false,
    priority: 50,
    ...article,
  };
}

export { sourcesFor };
