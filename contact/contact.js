(() => {
  const qs = new URLSearchParams(window.location.search);
  const source = qs.get("source") || "direct";
  const caseSlug = qs.get("case") || "";
  const intent = qs.get("intent") || "general";

  const sourceInput = document.querySelector("[data-lead-source]");
  const caseInput = document.querySelector("[data-lead-case]");
  const intentInput = document.querySelector("[data-lead-intent]");
  if (sourceInput) sourceInput.value = source;
  if (caseInput) caseInput.value = caseSlug;
  if (intentInput) intentInput.value = intent;

  const labels = {
    "my-jazz-day": "MY JAZZ DAY 開発事例"
  };
  const banner = document.querySelector("[data-contact-source-banner]");
  const label = document.querySelector("[data-contact-source-label]");
  if (banner && label && caseSlug && labels[caseSlug]) {
    label.textContent = labels[caseSlug];
    banner.hidden = false;
  }

  const form = document.querySelector("[data-contact-form]");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const topic = data.get("topic") || "ご相談";
    const subject = `[SGP相談] ${topic}`;
    const lines = [
      "合同会社SGP 坂本様",
      "",
      "Webサイトを拝見し、相談したくご連絡しました。",
      "",
      `会社名・屋号: ${data.get("company") || "未記入"}`,
      `お名前: ${data.get("name") || ""}`,
      `メールアドレス: ${data.get("email") || ""}`,
      `相談テーマ: ${topic}`,
      "",
      "現在の状況・相談内容:",
      String(data.get("message") || ""),
      "",
      "--- Web attribution ---",
      `lead_source: ${source}`,
      `lead_case: ${caseSlug || "none"}`,
      `lead_intent: ${intent}`
    ];

    window.sgpAnalytics?.track?.("contact_submit", {
      lead_source: source,
      lead_case: caseSlug || "none",
      lead_intent: intent,
      topic: String(topic)
    });

    const href = `mailto:naoya.sakamoto@sakamoto-growth-partners.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
    window.location.href = href;
  });
})();
