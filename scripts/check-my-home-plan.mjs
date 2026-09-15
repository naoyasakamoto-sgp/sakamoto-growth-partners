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

const assertions = [
  [html.includes('rel="canonical" href="https://sakamoto-growth-partners.com/products/my-home-plan/"'), "canonical missing"],
  [html.includes('id="mhp-start"'), "start control missing"],
  [html.includes('id="mhp-results"'), "results region missing"],
  [html.includes('デモデータ'), "demo disclaimer missing"],
  [html.includes('/contact/?source=product&product=my-home-plan'), "attributed contact CTA missing"],
  [app.includes("Hard Constraint") || app.includes("eligible("), "hard constraint logic missing"],
  [app.includes("regret"), "regret logic missing"],
  [app.includes("pareto"), "pareto filtering missing"],
  [app.includes("DISCOVERY"), "discovery composition missing"],
  [app.includes("mhp_recommendation_generated"), "analytics event missing"],
  [css.includes("@media"), "responsive CSS missing"],
  [DEMO_PLANS.length >= 10, "insufficient demo plan coverage"]
];

for (const [ok, message] of assertions) {
  if (!ok) throw new Error("MY HOME PLAN validation failed: " + message);
}
console.log("MY HOME PLAN validation passed:", DEMO_PLANS.length, "demo plans.");
