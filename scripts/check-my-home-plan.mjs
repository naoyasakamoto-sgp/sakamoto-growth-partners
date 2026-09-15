import { readFile, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_PLANS } from "../products/my-home-plan/plans.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dir = path.join(root, "products", "my-home-plan");
const required = ["index.html", "app.js", "plans.js", "my-home-plan.css"];

for (const file of required) await access(path.join(dir, file));
execFileSync(process.execPath, ["--check", path.join(dir, "app.js")], { stdio: "pipe" });
execFileSync(process.execPath, ["--check", path.join(dir, "plans.js")], { stdio: "pipe" });

const html = await readFile(path.join(dir, "index.html"), "utf8");
const app = await readFile(path.join(dir, "app.js"), "utf8");
const css = await readFile(path.join(dir, "my-home-plan.css"), "utf8");
const schemas = [...html.matchAll(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)]
  .map((match) => JSON.parse(match[1]));
const schemaTypes = [];
function collectTypes(value) {
  if (!value || typeof value !== "object") return;
  if (typeof value["@type"] === "string") schemaTypes.push(value["@type"]);
  for (const nested of Object.values(value)) collectTypes(nested);
}
schemas.forEach(collectTypes);

const assertions = [
  [html.includes('rel="canonical" href="https://sakamoto-growth-partners.com/products/my-home-plan/"'), "canonical missing"],
  [html.includes('<meta name="robots" content="index, follow"'), "production robots directive missing"],
  [!html.includes("noindex"), "production page must not contain noindex"],
  [(html.match(/googletagmanager\.com\/gtag\/js/g) || []).length === 1, "GA4 tag must appear once"],
  [html.includes('property="og:image"') && html.includes('name="twitter:card"'), "social metadata missing"],
  [schemaTypes.includes("WebPage") && schemaTypes.includes("WebApplication") && schemaTypes.includes("BreadcrumbList"), "structured data incomplete"],
  [html.includes('href="/assets/style.css"') && html.includes('src="/assets/site-analytics.js"'), "production shared assets missing"],
  [html.includes('id="mhp-start"'), "start control missing"],
  [html.includes('id="mhp-results"'), "results region missing"],
  [html.includes('デモデータ'), "demo disclaimer missing"],
  [html.includes('/contact/?source=product&amp;product=my-home-plan&amp;intent=housing-decision-engine'), "attributed contact CTA missing"],
  [!html.includes("github.io"), "temporary GitHub Pages URL must not remain"],
  [(app.match(/\{ key:/g) || []).length === 8, "diagnosis must contain eight questions"],
  [app.includes("Hard Constraint") || app.includes("eligible("), "hard constraint logic missing"],
  [app.includes("regret"), "regret logic missing"],
  [app.includes("criticalPenalty"), "critical penalty missing"],
  [app.includes("pareto"), "pareto filtering missing"],
  [["BEST FIT", "VALUE", "COMFORT", "DISCOVERY"].every((label) => app.includes(label)), "recommendation lanes incomplete"],
  [app.includes("pickDiverse"), "diversity selection missing"],
  [app.includes("mhp_compare_change") && app.includes("sensitivityRecalc"), "comparison or sensitivity logic missing"],
  [app.includes("localStorage.setItem") && app.includes("mhp_result_saved"), "result save missing"],
  [app.includes("mhp_recommendation_generated"), "analytics event missing"],
  [app.includes("window.sgpTrackEvent"), "shared analytics bridge missing"],
  [!app.includes("fetch(") && !app.toLowerCase().includes("openai"), "decision engine must remain deterministic"],
  [css.includes("@media(max-width:980px)") && css.includes("@media(max-width:680px)"), "responsive CSS missing"],
  [DEMO_PLANS.length === 12, "expected twelve demo plans"],
  [DEMO_PLANS.every((plan) => Number.isFinite(plan.price) && Number.isFinite(plan.area) && Number.isFinite(plan.footprintWidth)), "verified plan fields missing"]
];

for (const [ok, message] of assertions) {
  if (!ok) throw new Error("MY HOME PLAN validation failed: " + message);
}
console.log("MY HOME PLAN validation passed:", DEMO_PLANS.length, "demo plans.");
