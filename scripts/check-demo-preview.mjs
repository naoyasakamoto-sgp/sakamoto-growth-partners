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
if (!home.includes("assets/sgp-wordmark-transparent.webp")) failures.push("index.html: transparent horizontal wordmark is not wired into homepage");
if (home.includes("assets/sgp-wordmark.webp")) failures.push("index.html: legacy opaque wordmark must not be used");
if (home.includes("sgp-logo-official.svg")) failures.push("index.html: SVG-wrapped logo must not be used");
if (/advisor-hero-copy[^"]*\breveal\b/.test(home)) failures.push("index.html: hero copy must not depend on reveal JS");
if (/advisor-hero-visual[^"]*\breveal\b/.test(home)) failures.push("index.html: hero visual must not depend on reveal JS");
if (!home.includes('id="home-case-proof"')) failures.push("index.html: static build proof section missing");
if (!home.includes('id="brand-movie"')) failures.push("index.html: brand movie section missing");
if (!home.includes("youtube.com/embed/OBJAqJzNgbc")) failures.push("index.html: requested YouTube brand movie missing");
if (/advisor-hero-visual[\\s\\S]*?sendai-visual/.test(home)) failures.push("index.html: hero must not contain Sendai background image");

const css = await readFile(path.join(root, "styles.css"), "utf8");
// mobile header stabilization
if (!css.includes(".home-it-adviser-v2 .site-header{height:58px;min-height:58px}")) failures.push("styles.css: mobile header must be fixed at 58px");
if (!css.includes("width:136px;\n    height:auto;\n    flex:0 0 136px")) failures.push("styles.css: mobile transparent wordmark width must be 136px with intrinsic height");
if (!/brand-logo-wrap\.brand-logo-official \.brand-logo\s*\{[^}]*height:\s*auto/i.test(css)) failures.push("styles.css: wordmark image must preserve intrinsic aspect ratio");
if (!css.includes("top:calc(100% + 6px)")) failures.push("styles.css: mobile navigation must anchor to actual header height");
if (!css.includes(".home-it-adviser-v2 .advisor-final-cta .final-cta-grid")) failures.push("styles.css: mobile final CTA override missing");
if (!css.includes("grid-template-columns:minmax(0,1fr)!important")) failures.push("styles.css: mobile final CTA must be one column");
if (!css.includes(".home-it-adviser-v2 .network-map{")) failures.push("styles.css: mobile network static layout missing");
if (!css.includes(".operator-trust-grid{display:block;width:100%}")) failures.push("styles.css: representative mobile stack missing");
if (!css.includes(".reveal{opacity:1")) failures.push("styles.css: reveal must be visible by default");
if (!css.includes(".js-reveal .reveal")) failures.push("styles.css: JS opt-in reveal rule missing");

const contactCss = await readFile(path.join(root, "contact/contact.css"), "utf8");
if (!contactCss.includes('input[type="radio"]')) failures.push("contact/contact.css: radio-specific sizing missing");
if (!contactCss.includes("width:20px!important")) failures.push("contact/contact.css: radio width must be fixed at 20px");
if (!contactCss.includes("grid-template-columns:20px minmax(0,1fr)")) failures.push("contact/contact.css: radio label grid missing");
if (/contact-gold|contact-cream|#c99439|#f4f0e5/i.test(contactCss)) failures.push("contact/contact.css: legacy gold/cream theme leaked back in");
if (!contactCss.includes("--contact-cyan:#10c4d2")) failures.push("contact/contact.css: SGP cyan design token missing");

const runtime = await readFile(path.join(root, "script.js"), "utf8");
if (!runtime.includes("document.currentScript")) failures.push("script.js: runtime root must derive from currentScript");
if (runtime.includes("new URL('/', window.location.origin)")) failures.push("script.js: origin-root URL fallback would break subpath demo");
if (!runtime.includes("function setupMobileActionBar()")) failures.push("script.js: conditional mobile CTA controller missing");
if (!runtime.includes("document.querySelector('.expert-network')")) failures.push("script.js: mobile CTA must stop before expert network");

for (const legacyMarker of ["Brand polish v5","Header stabilization v6","Mobile layout hardening v7","Official supplied Sakamoto Growth Partners logo"]) {
  if (css.includes(legacyMarker)) failures.push(`styles.css: obsolete patch layer remains: ${legacyMarker}`);
}
if (!css.includes("SGP Responsive System v8")) failures.push("styles.css: consolidated responsive system missing");
if ((css.match(/\.home-it-adviser-v2 \.advisor-final-cta \.final-cta-grid/g) || []).length > 4) failures.push("styles.css: final CTA selector duplicated excessively");
if ((css.match(/\.home-it-adviser-v2 \.brand-v2 \.brand-logo-wrap\.brand-logo-official/g) || []).length > 5) failures.push("styles.css: header logo selector duplicated excessively");

for (const asset of [
  "assets/sgp-stack.webp",
  "assets/sgp-wordmark-transparent.webp",
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
