(() => {
  const form = document.querySelector("[data-ai-employee-form]");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const company = String(data.get("company") || "").trim();
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const industry = String(data.get("industry") || "").trim();
    const employees = String(data.get("employees") || "").trim();
    const pain = String(data.get("pain") || "").trim();
    const message = String(data.get("message") || "").trim();

    const subject = "SGP AI社員｜30分無料診断の申し込み";
    const body = [
      "合同会社SGP 坂本様",
      "",
      "SGP AI社員の30分無料診断を希望します。",
      "",
      "【会社名・屋号】",
      company || "未入力",
      "",
      "【お名前】",
      name,
      "",
      "【返信先メール】",
      email,
      "",
      "【業種】",
      industry || "未選択",
      "",
      "【従業員数】",
      employees || "未選択",
      "",
      "【一番減らしたい負担】",
      pain,
      "",
      "【現在の状況】",
      message || "未入力",
      "",
      "送信元: https://sakamoto-growth-partners.com/ai-employee/"
    ].join("\n");

    if (window.sgpAnalytics?.track) {
      window.sgpAnalytics.track("ai_employee_diagnosis_submit", {
        industry: industry || "unknown",
        employee_band: employees || "unknown",
        pain: pain || "unknown"
      });
    }

    const status = document.querySelector("[data-ai-employee-status]");
    if (status) status.textContent = "メールアプリを開きます。内容をご確認のうえ送信してください。";
    window.location.href = "mailto:naoya.sakamoto@sakamoto-growth-partners.com?subject=" +
      encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  });
})();
