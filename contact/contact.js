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
    "free-consult": "30分無料相談",
    "free-improvement": "初回1業務改善無料",
    "it-adviser-diagnosis": "初回IT相談",
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

  if (intent === "free-consult") {
    document.querySelector('input[name="topic"][value="30分無料相談"]')?.click();
  } else if (intent === "free-improvement") {
    document.querySelector('input[name="topic"][value="初回1業務改善無料について"]')?.click();
  } else if (intent === "it-adviser" || intent === "it-adviser-diagnosis" || plan) {
    document.querySelector('input[name="topic"][value="社外IT担当・IT顧問について"]')?.click();
  }

  const form = document.querySelector("[data-contact-form]");
  if (!form) return;

  const fields = form.querySelector("[data-contact-form-fields]");
  const status = form.querySelector("[data-contact-status]");
  const submit = form.querySelector("[data-contact-submit]");
  const endpoint = "https://formsubmit.co/ajax/naoya.sakamoto@sakamoto-growth-partners.com";

  const showStatus = (kind, html) => {
    if (!status) return;
    status.dataset.kind = kind;
    status.innerHTML = html;
    status.hidden = false;
    status.focus?.();
  };

  const setSubmitting = (isSubmitting) => {
    if (!submit) return;
    submit.disabled = isSubmitting;
    submit.setAttribute("aria-busy", String(isSubmitting));
    submit.textContent = isSubmitting ? "送信しています…" : "無料相談を送信する →";
  };

  if (qs.get("submitted") === "1") {
    if (fields) fields.hidden = true;
    showStatus(
      "success",
      "<strong>送信しました。</strong><br>ご相談ありがとうございます。内容を確認し、入力いただいたメールアドレスへ返信します。"
    );
  }

  let formStarted = false;
  form.addEventListener("focusin", () => {
    if (formStarted) return;
    formStarted = true;
    window.sgpAnalytics?.track?.("contact_form_start", {
      lead_source: source,
      lead_intent: intent,
      lead_plan: plan || "none"
    });
  }, { once: true });

  form.addEventListener("submit", async (event) => {
    if (!window.fetch) return;
    event.preventDefault();
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const topic = String(data.get("topic") || "30分無料相談");

    const payload = {
      name: String(data.get("name") || ""),
      email: String(data.get("email") || ""),
      company: String(data.get("company") || "未記入"),
      topic,
      message: String(data.get("message") || "未記入"),
      lead_source: source,
      lead_case: caseSlug || "none",
      lead_intent: intent,
      lead_plan: planLabels[plan] || plan || "none",
      _subject: `[SGP相談] ${topic}`,
      _template: "table",
      _captcha: "false",
      _honey: String(data.get("_honey") || ""),
      _url: window.location.href
    };

    window.sgpAnalytics?.track?.("contact_submit_attempt", {
      lead_source: source,
      lead_case: caseSlug || "none",
      lead_intent: intent,
      lead_plan: plan || "none",
      topic
    });

    setSubmitting(true);
    if (status) status.hidden = true;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false || result.success === "false") {
        throw new Error(result.message || "Form submission failed");
      }

      window.sgpAnalytics?.track?.("contact_submit", {
        lead_source: source,
        lead_case: caseSlug || "none",
        lead_intent: intent,
        lead_plan: plan || "none",
        topic
      });

      if (fields) fields.hidden = true;
      showStatus(
        "success",
        "<strong>送信しました。</strong><br>ご相談ありがとうございます。内容を確認し、入力いただいたメールアドレスへ返信します。"
      );
      form.reset();
      window.history.replaceState({}, "", "/contact/?submitted=1");
    } catch (error) {
      console.error("Contact form submission failed", error);
      window.sgpAnalytics?.track?.("contact_submit_error", {
        lead_source: source,
        lead_intent: intent,
        lead_plan: plan || "none",
        topic
      });
      showStatus(
        "error",
        '<strong>送信できませんでした。</strong><br>通信状況を確認してもう一度お試しいただくか、<a href="mailto:naoya.sakamoto@sakamoto-growth-partners.com">直接メール</a>でご連絡ください。'
      );
    } finally {
      setSubmitting(false);
    }
  });
})();
