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
if (/advisor-hero-copy[^"]*\breveal\b/.test(home)) failures.push("index.html: hero copy must not depend on reveal JS");
if (/advisor-hero-visual[^"]*\breveal\b/.test(home)) failures.push("index.html: hero visual must not depend on reveal JS");
if (!home.includes('id="home-case-proof"')) failures.push("index.html: static build proof section missing");

const css = await readFile(path.join(root, "styles.css"), "utf8");
if (!css.includes(".reveal{opacity:1")) failures.push("styles.css: reveal must be visible by default");
if (!css.includes(".js-reveal .reveal")) failures.push("styles.css: JS opt-in reveal rule missing");

const runtime = await readFile(path.join(root, "script.js"), "utf8");
if (!runtime.includes("document.currentScript")) failures.push("script.js: runtime root must derive from currentScript");
if (runtime.includes("new URL('/', window.location.origin)")) failures.push("script.js: origin-root URL fallback would break subpath demo");

for (const asset of [
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
