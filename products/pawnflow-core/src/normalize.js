export function normalizePayerName(value) {
  if (value == null) return "";
  return String(value)
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s　._・･\-ー]/g, "")
    .replace(/(カブシキガイシャ|ユウゲンガイシャ|ゴウドウガイシャ|\(カ\)|\(ユ\)|\(ド\))/g, "");
}

export function normalizeMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new TypeError("amount must be a finite number");
  return Math.round(n);
}
