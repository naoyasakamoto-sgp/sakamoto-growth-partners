(() => {
  const qs = new URLSearchParams(window.location.search);
  const source = qs.get("source") || "direct";
  const caseSlug = qs.get("case") || "";
  const intent = qs.get("intent") || "general";
  const plan = qs.get("plan") || "";

  const sourceInput = document.querySelector("[data-lead-source]");
  const caseInput = document.querySelector("[data-lead-case]");
  const intentInput = document.querySelector("[data-lead-intent]");
  const planInput = document.querySelector("[data-lead-plan]");
  if (sourceInput) sourceInput.value = source;
  if (caseInput) caseInput.value = caseSlug;
  if (intentInput) intentInput.value = intent;
  if (planInput) planInput.value = plan;

  const labels = {
    "my-jazz-day": "MY JAZZ DAY 開発事例"
  };
  const planLabels = {
    light: "社外IT担当 Light",
    standard: "社外IT担当 Standard",
    growth: "IT改善顧問 Growth",
    fde: "社外DX責任者 / FDE Partner"
  };
  const intentLabels = {
    "it-adviser-diagnosis": "30分無料IT診断",
    "it-adviser": "社外IT担当・IT顧問",
    "dx-partner": "社外DX責任者",
    "decision-product": "意思決定プロダクト"
  };

  const banner = document.querySelector("[data-contact-source-banner]");
  const label = document.querySelector("[data-contact-source-label]");
  if (banner && label) {
    const sourceLabel = (caseSlug && labels[caseSlug]) || (plan && planLabels[plan]) || intentLabels[intent];
    if (sourceLabel) {
      label.textContent = sourceLabel;
      banner.hidden = false;
    }
  }

  if (intent === "it-adviser" || intent === "it-adviser-diagnosis" || plan) {
    const adviserRadio = document.querySelector('input[name="topic"][value="社外IT担当・IT顧問について"]');
    if (adviserRadio) adviserRadio.checked = true;
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
      "Sakamoto Growth Partners 坂本様",
      "",
      "Webサイトを拝見し、相談したくご連絡しました。",
      "",
      `会社名・屋号: ${data.get("company") || "未記入"}`,
      `お名前: ${data.get("name") || ""}`,
      `メールアドレス: ${data.get("email") || ""}`,
      `業種: ${data.get("industry") || "未記入"}`,
      `従業員規模: ${data.get("employees") || "未記入"}`,
      `相談テーマ: ${topic}`,
      `関心プラン: ${planLabels[plan] || plan || "未指定"}`,
      "",
      "現在の状況・相談内容:",
      String(data.get("message") || ""),
      "",
      "--- Web attribution ---",
      `lead_source: ${source}`,
      `lead_case: ${caseSlug || "none"}`,
      `lead_intent: ${intent}`,
      `lead_plan: ${plan || "none"}`
    ];

    window.sgpAnalytics?.track?.("contact_submit", {
      lead_source: source,
      lead_case: caseSlug || "none",
      lead_intent: intent,
      lead_plan: plan || "none",
      industry: String(data.get("industry") || ""),
      employees: String(data.get("employees") || ""),
      topic: String(topic)
    });

    const href = `mailto:naoya.sakamoto@sakamoto-growth-partners.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
    window.location.href = href;
  });
})();