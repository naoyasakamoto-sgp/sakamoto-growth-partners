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
  const formLoadedAt = Date.now();

  const showStatus = (kind, html) => {
    if (!status) return;
    status.dataset.kind = kind;
    status.innerHTML = html;
    status.hidden = false;
    status.focus?.();
  };

  const successMarkup =
    "<strong>送信しました。</strong><br>ご相談ありがとうございます。内容を確認し、入力いただいたメールアドレスへ返信します。";

  // AJAXではなくFormSubmit標準POSTを使い、標準reCAPTCHAを有効にする。
  if (qs.get("submitted") === "1") {
    if (fields) fields.hidden = true;
    showStatus("success", successMarkup);
    try {
      const stored = window.sessionStorage.getItem("sgp_contact_pending");
      if (stored) {
        window.sgpAnalytics?.track?.("contact_submit", JSON.parse(stored));
        window.sessionStorage.removeItem("sgp_contact_pending");
      }
    } catch {
      // Storageが使えない環境でも完了画面は表示する。
    }
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

  form.addEventListener("submit", (event) => {
    if (!form.reportValidity()) {
      event.preventDefault();
      return;
    }

    const data = new FormData(form);
    const honey = String(data.get("_honey") || "").trim();

    // honeypotはFormSubmit側でも検証される。
    if (honey) {
      event.preventDefault();
      if (fields) fields.hidden = true;
      showStatus("success", successMarkup);
      form.reset();
      window.history.replaceState({}, "", "/contact/?submitted=1");
      return;
    }

    if (Date.now() - formLoadedAt < 1200) {
      event.preventDefault();
      showStatus("error", "<strong>入力内容をご確認ください。</strong><br>少し時間をおいて、もう一度送信してください。");
      return;
    }

    // 空白だけの送信を防止。依頼内容自体は未確定で構わない。
    if (!String(data.get("message") || "").trim()) {
      event.preventDefault();
      showStatus("error", "<strong>相談内容をご入力ください。</strong><br>相談テーマが未定でも、気になっていることをひとこと記入してください。");
      form.querySelector("#message")?.focus();
      return;
    }

    const topic = String(data.get("topic") || "30分無料相談");
    const subject = form.querySelector('input[name="_subject"]');
    if (subject) subject.value = `[SGP相談] ${topic}`;

    const dimensions = {
      lead_source: source,
      lead_case: caseSlug || "none",
      lead_intent: intent,
      lead_plan: plan || "none",
      topic
    };
    window.sgpAnalytics?.track?.("contact_submit_attempt", dimensions);
    try {
      window.sessionStorage.setItem("sgp_contact_pending", JSON.stringify(dimensions));
    } catch {
      // Storageが使えなくてもフォーム送信は続行する。
    }
    if (status) status.hidden = true;
    if (submit) {
      submit.disabled = true;
      submit.setAttribute("aria-busy", "true");
      submit.textContent = "送信画面に進んでいます…";
    }
    // preventDefaultせず、FormSubmitの認証画面と_next遷移に委ねる。
  });
})();
