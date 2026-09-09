import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const excludedDirectories = new Set([".git", "node_modules", "_backups"]);

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith("_deploy_") || excludedDirectories.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(target));
    if (entry.isFile() && entry.name.endsWith(".html")) files.push(target);
  }
  return files;
}

function addInsightsLink(block, link) {
  if (block.includes('href="/insights/"')) return block;
  const serviceLink = /<a\s+([^>]*?)href="\/services\/"([^>]*)>サービス(?:一覧)?<\/a>/;
  if (!serviceLink.test(block)) return block;
  return block.replace(serviceLink, (match) => `${match}${link}`);
}

function updateNavigation(html) {
  let next = html.replace(
    /<div class="sgp-nav-links">[\s\S]*?<\/div>/g,
    (block) => addInsightsLink(block, '<a href="/insights/">実務ノウハウ</a>'),
  );
  next = next.replace(
    /<details class="sgp-mobile-menu">[\s\S]*?<\/details>/g,
    (block) => addInsightsLink(block, '<a href="/insights/">実務ノウハウ</a>'),
  );
  next = next.replace(
    /<nav class="sgp-footer-links"[\s\S]*?<\/nav>/g,
    (block) => addInsightsLink(block, '<a href="/insights/">実務ノウハウ</a>'),
  );
  return next;
}

let modified = 0;
for (const file of await htmlFiles(rootDir)) {
  const html = await readFile(file, "utf8");
  if (!html.includes("sgp-nav-links") && !html.includes("sgp-footer-links")) continue;
  const next = updateNavigation(html);
  if (next === html) continue;
  await writeFile(file, next, "utf8");
  modified += 1;
}

console.log(`Synchronized INSIGHTS navigation in ${modified} HTML files.`);
