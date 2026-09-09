const requiredString = (value, key) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing ${key}`);
};

export function validateCaseStudyFrontmatter(data) {
  for (const key of ["slug", "caseNumber", "title", "shortTitle", "description", "client", "product", "publishedAt", "heroImage", "ogImage"]) requiredString(data[key], key);
  if (!/^[a-z0-9-]+$/.test(data.slug)) throw new Error(`Invalid slug: ${data.slug}`);
  if (!Number.isInteger(data.year)) throw new Error("year must be an integer");
  if (!Array.isArray(data.metrics) || data.metrics.length === 0) throw new Error("metrics are required");
  if (!Array.isArray(data.tags)) throw new Error("tags must be an array");
  if (!Array.isArray(data.capabilities)) throw new Error("capabilities must be an array");
  if (!data.seo || typeof data.seo !== "object") throw new Error("seo is required");
  requiredString(data.seo.title, "seo.title"); requiredString(data.seo.description, "seo.description");
  return data;
}

export const caseStudyFrontmatterShape = Object.freeze({
  slug: "string", caseNumber: "string", title: "string", shortTitle: "string", description: "string",
  client: "string", product: "string", year: "integer", publishedAt: "ISO-8601 string", updatedAt: "ISO-8601 string | optional",
  dataSnapshotAt: "ISO-8601 string | optional", status: "published | draft", featured: "boolean", heroImage: "path", ogImage: "path",
  metrics: "Array<{value,label}>", tags: "string[]", capabilities: "string[]", productUrl: "URL | optional", disclaimer: "string | optional",
  seo: "{title,description,canonical?,noindex?}"
});
