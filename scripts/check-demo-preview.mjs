import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const pages = ["index.html", "services/it-adviser/index.html", "contact/index.html"];
const failures = [];

const exists = async (p) => {
  try { await access(p); return true; } catch { return false; }
};

function localTarget(page, raw) {
  if (!raw || raw.startsWith("#") || /^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(raw)) return null;
  const noHash = raw.split("#")[0].split("?")[0];
  if (!noHash) return page;
  const pageDir = path.dirname(page);
  let target = path.normalize(path.join(pageDir, noHash));
  if (noHash.endsWith("/")) target = path.join(target, "index.html");
  else if (!path.extname(target)) target = path.join(target, "index.html");
  return target;
}

for (const page of pages) {
  const html = await readFile(path.join(root, page), "utf8");

  if (/<base\b/i.test(html)) failures.push(`${page}: demo must not use <base>`);
  for (const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)) {
    const raw = match[1];
    if (/^\/(?!\/)/.test(raw)) failures.push(`${page}: root-relative ref not allowed in demo: ${raw}`);
    const target = localTarget(page, raw);
    if (target && !(await exists(path.join(root, target)))) {
      failures.push(`${page}: missing local target ${raw} -> ${target}`);
    }
  }
}

const home = await readFile(path.join(root, "index.html"), "utf8");
if (!home.includes("assets/sgp-logo-official.svg")) failures.push("index.html: official supplied logo is not wired into homepage");
if (/advisor-hero-copy[^"]*\breveal\b/.test(home)) failures.push("index.html: hero copy must not depend on reveal JS");
if (/advisor-hero-visual[^"]*\breveal\b/.test(home)) failures.push("index.html: hero visual must not depend on reveal JS");
if (!home.includes('id="home-case-proof"')) failures.push("index.html: static build proof section missing");
if (!home.includes('id="brand-movie"')) failures.push("index.html: brand movie section missing");
if (!home.includes("youtube.com/embed/OBJAqJzNgbc")) failures.push("index.html: requested YouTube brand movie missing");
if (/advisor-hero-visual[\\s\\S]*?sendai-visual/.test(home)) failures.push("index.html: hero must not contain Sendai background image");

const css = await readFile(path.join(root, "styles.css"), "utf8");
// mobile header stabilization
if (!css.includes(".home-it-adviser-v2 .site-header{\n    height:58px")) failures.push("styles.css: mobile header must be fixed at 58px");
if (!css.includes("width:136px;\n    height:34px;\n    flex:0 0 136px")) failures.push("styles.css: mobile official logo geometry must be 136x34");
if (!css.includes("top:calc(100% + 6px)")) failures.push("styles.css: mobile navigation must anchor to actual header height");
if (!css.includes(".home-it-adviser-v2 .advisor-final-cta .final-cta-grid")) failures.push("styles.css: mobile final CTA override missing");
if (!css.includes("grid-template-columns:minmax(0,1fr)!important")) failures.push("styles.css: mobile final CTA must be one column");
if (!css.includes(".home-it-adviser-v2 .network-map{")) failures.push("styles.css: mobile network static layout missing");
if (!css.includes(".home-it-adviser-v2 .operator-trust-grid{")) failures.push("styles.css: representative mobile stack missing");
if (!css.includes(".reveal{opacity:1")) failures.push("styles.css: reveal must be visible by default");
if (!css.includes(".js-reveal .reveal")) failures.push("styles.css: JS opt-in reveal rule missing");

const contactCss = await readFile(path.join(root, "contact/contact.css"), "utf8");
if (!contactCss.includes('input[type="radio"]')) failures.push("contact/contact.css: radio-specific sizing missing");
if (!contactCss.includes("width:20px!important")) failures.push("contact/contact.css: mobile radio width must be fixed");
if (!contactCss.includes("grid-template-columns:20px minmax(0,1fr)!important")) failures.push("contact/contact.css: radio label grid missing");

const runtime = await readFile(path.join(root, "script.js"), "utf8");
if (!runtime.includes("document.currentScript")) failures.push("script.js: runtime root must derive from currentScript");
if (runtime.includes("new URL('/', window.location.origin)")) failures.push("script.js: origin-root URL fallback would break subpath demo");

const logoSvg = await readFile(path.join(root, "assets/sgp-logo-official.svg"), "utf8");
if (logoSvg.includes('id="remove-white"')) failures.push("assets/sgp-logo-official.svg: filtered faux transparency must not return");
if (!logoSvg.includes('data:image/webp;base64,')) failures.push("assets/sgp-logo-official.svg: native transparent logo payload missing");

for (const asset of [
  "assets/sgp-logo-official.svg",
  "assets/sgp-stack.webp",
  "assets/sgp-wordmark.webp",
  "assets/sendai-office.webp",
  "assets/case-studies/my-jazz-day/hero-mobile.webp",
  "styles.css",
  "case-studies/case-study.css",
  "script.js",
  "analytics.js",
  "contact/contact.css",
  "contact/contact.js"
]) {
  if (!(await exists(path.join(root, asset)))) failures.push(`missing required demo asset: ${asset}`);
}

if (failures.length) {
  console.error(failures.map((x) => `- ${x}`).join("\n"));
  process.exit(1);
}
console.log("Demo preview validation passed: paths, assets, fail-open hero and progressive reveal are healthy.");
