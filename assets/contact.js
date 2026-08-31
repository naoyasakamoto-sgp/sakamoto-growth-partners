(function () {
  "use strict";

  var form = document.getElementById("contact-form");
  if (!form) return;

  var interest = document.getElementById("contact-interest");
  var submitButton = form.querySelector("button[type='submit']");
  var submitError = document.getElementById("contact-submit-error");
  var hasStarted = false;
  var isSubmitting = false;
  var allowedInterests = [
    "ai",
    "business-improvement",
    "web-marketing",
    "system-development",
    "meo-line",
    "other",
  ];

  function track(eventName, params) {
    if (typeof window.sgpTrackEvent === "function") {
      window.sgpTrackEvent(eventName, params);
      return;
    }
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag === "function")
      window.gtag("event", eventName, params || {});
    else
      window.dataLayer.push(Object.assign({ event: eventName }, params || {}));
  }

  function currentInterest() {
    return allowedInterests.indexOf(interest.value) >= 0
      ? interest.value
      : "other";
  }

  function applyInterestFromUrl() {
    var requested = new URLSearchParams(window.location.search).get("interest");
    if (allowedInterests.indexOf(requested) >= 0) interest.value = requested;
  }

  function applyAttribution() {
    if (!window.SGPLeadAttribution) return;
    window.SGPLeadAttribution.apply(form, currentInterest());
  }

  function markStarted() {
    if (hasStarted) return;
    hasStarted = true;
    track("form_start", {
      form_id: "contact",
      service_interest: currentInterest(),
    });
  }

  function errorElement(field) {
    return document.getElementById(field.id + "-error");
  }

  function setError(field, message) {
    field.setAttribute("aria-invalid", message ? "true" : "false");
    var output = errorElement(field);
    if (output) output.textContent = message || "";
  }

  function validateField(field) {
    var message = "";
    var value = field.type === "checkbox" ? field.checked : field.value.trim();

    if (field.required && !value) message = "必須項目です。";
    if (
      !message &&
      field.type === "email" &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value.trim())
    )
      message = "正しいメールアドレスを入力してください。";
    if (
      !message &&
      field.id === "contact-interest" &&
      allowedInterests.indexOf(field.value) < 0
    )
      message = "相談テーマを選択してください。";

    setError(field, message);
    return !message;
  }

  function validateForm() {
    var fields = [
      document.getElementById("contact-interest"),
      document.getElementById("contact-name"),
      document.getElementById("contact-email"),
      document.getElementById("contact-message"),
      document.getElementById("contact-privacy"),
    ];
    var firstInvalid = null;

    fields.forEach(function (field) {
      if (!validateField(field) && !firstInvalid) firstInvalid = field;
    });

    if (firstInvalid) {
      firstInvalid.focus();
      track("form_validation_error", {
        form_id: "contact",
        service_interest: currentInterest(),
        field_name: firstInvalid.name,
      });
      return false;
    }
    return true;
  }

  function redirectAfterLeadEvent() {
    var completed = false;
    function finish() {
      if (completed) return;
      completed = true;
      window.location.assign("/contact/thanks/");
    }

    var params = {
      form_id: "contact",
      service_interest: currentInterest(),
      contact_method: "form",
    };

    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag === "function") {
      window.gtag(
        "event",
        "generate_lead",
        Object.assign({}, params, {
          event_callback: finish,
          event_timeout: 1200,
        }),
      );
      window.setTimeout(finish, 1400);
    } else {
      window.dataLayer.push(Object.assign({ event: "generate_lead" }, params));
      finish();
    }
  }

  applyInterestFromUrl();
  applyAttribution();
  interest.addEventListener("change", function () {
    var serviceInterest = form.querySelector("[name='service_interest']");
    if (serviceInterest) serviceInterest.value = currentInterest();
  });
  form.addEventListener("input", markStarted, { once: true });
  form.addEventListener("change", markStarted, { once: true });

  form.querySelectorAll("input, select, textarea").forEach(function (field) {
    field.addEventListener("blur", function () {
      if (field.required || field.value) validateField(field);
    });
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (isSubmitting || !validateForm()) return;

    isSubmitting = true;
    submitError.textContent = "";
    submitButton.disabled = true;
    submitButton.textContent = "送信中...";

    var body = new URLSearchParams();
    new FormData(form).forEach(function (value, key) {
      body.append(key, String(value));
    });

    fetch(form.getAttribute("action"), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: body.toString(),
    })
      .then(function (response) {
        if (!response.ok) throw new Error("submit_failed");
        return response.json();
      })
      .then(function () {
        redirectAfterLeadEvent();
      })
      .catch(function () {
        isSubmitting = false;
        submitButton.disabled = false;
        submitButton.textContent =
          submitButton.getAttribute("data-submit-label") ||
          "無料相談を送信する";
        submitError.textContent =
          "送信できませんでした。時間をおいて再度お試しいただくか、LINEまたはメールでご連絡ください。";
      });
  });
})();
