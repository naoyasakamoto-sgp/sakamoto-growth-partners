(function () {
  "use strict";

  var form = document.getElementById("contact-form");
  if (!form) return;

  var interest = document.getElementById("contact-interest");
  var submitButton = form.querySelector("button[type='submit']");
  var submitError = document.getElementById("contact-submit-error");
  var attributionBanner = document.getElementById("contact-attribution-banner");
  var attributionContext = {};
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
  var topicIntakes = {
    "business-improvement": {
      section: document.getElementById("business-improvement-intake"),
      requiredFields: [document.getElementById("contact-improvement-target")],
      requiredGroups: [
        {
          name: "currentMethods",
          group: document.getElementById("contact-current-methods-group"),
          output: document.getElementById("contact-current-methods-error"),
        },
        {
          name: "painPoints",
          group: document.getElementById("contact-pain-points-group"),
          output: document.getElementById("contact-pain-points-error"),
        },
      ],
    },
  };

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
    attributionContext =
      window.SGPLeadAttribution.apply(form, currentInterest()) || {};
    if (attributionBanner && attributionContext.lead_case === "my-jazz-day") {
      attributionBanner.hidden = false;
    }
  }

  function contactSubmitParams() {
    var params = {
      form_id: "contact",
      service_interest: currentInterest(),
      contact_method: "form",
    };
    ["lead_source", "lead_case", "lead_intent"].forEach(function (key) {
      if (attributionContext[key]) params[key] = attributionContext[key];
    });
    return params;
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

  function intakeFields(intake) {
    return intake && intake.section
      ? Array.prototype.slice.call(
          intake.section.querySelectorAll("input, select, textarea"),
        )
      : [];
  }

  function setGroupError(config, message) {
    if (!config.group) return;
    config.group.setAttribute("aria-invalid", message ? "true" : "false");
    if (config.output) config.output.textContent = message || "";
  }

  function checkedFields(name) {
    return Array.prototype.slice.call(
      form.querySelectorAll('input[name="' + name + '"]:checked'),
    );
  }

  function validateRequiredGroup(config) {
    var isValid = checkedFields(config.name).length > 0;
    setGroupError(config, isValid ? "" : "1つ以上選択してください。");
    return isValid;
  }

  function updateCurrentMethodOther() {
    var container = document.getElementById("contact-current-method-other");
    var input = document.getElementById("contact-current-method-other-input");
    var other = form.querySelector(
      'input[name="currentMethods"][value="その他"]',
    );
    var isBusinessImprovement =
      interest.value === "business-improvement" &&
      topicIntakes["business-improvement"].section.hidden === false;
    var shouldShow = Boolean(isBusinessImprovement && other && other.checked);
    container.hidden = !shouldShow;
    input.disabled = !shouldShow;
  }

  function updateTopicIntake() {
    Object.keys(topicIntakes).forEach(function (topic) {
      var intake = topicIntakes[topic];
      if (!intake.section) return;
      var isActive = interest.value === topic;

      intake.section.hidden = !isActive;
      intake.section.setAttribute("aria-hidden", isActive ? "false" : "true");
      intakeFields(intake).forEach(function (field) {
        field.disabled = !isActive;
        if (!isActive) setError(field, "");
      });
      intake.requiredFields.forEach(function (field) {
        field.required = isActive;
      });
      intake.requiredGroups.forEach(function (group) {
        group.group.setAttribute("aria-required", isActive ? "true" : "false");
        if (!isActive) setGroupError(group, "");
      });
    });
    updateCurrentMethodOther();
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

    var intake = topicIntakes[interest.value];
    if (intake && intake.section && !intake.section.hidden) {
      intake.requiredFields.forEach(function (field) {
        if (!validateField(field) && !firstInvalid) firstInvalid = field;
      });
      intake.requiredGroups.forEach(function (group) {
        if (!validateRequiredGroup(group) && !firstInvalid) {
          firstInvalid = group.group.querySelector("input");
        }
      });
    }

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

    var params = contactSubmitParams();

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
  updateTopicIntake();
  applyAttribution();
  interest.addEventListener("change", function () {
    updateTopicIntake();
    var serviceInterest = form.querySelector("[name='service_interest']");
    if (serviceInterest) serviceInterest.value = currentInterest();
  });
  form
    .querySelectorAll('input[name="currentMethods"]')
    .forEach(function (field) {
      field.addEventListener("change", function () {
        updateCurrentMethodOther();
        var group = topicIntakes["business-improvement"].requiredGroups[0];
        if (group.group.getAttribute("aria-invalid") === "true")
          validateRequiredGroup(group);
      });
    });
  form.querySelectorAll('input[name="painPoints"]').forEach(function (field) {
    field.addEventListener("change", function () {
      var group = topicIntakes["business-improvement"].requiredGroups[1];
      if (group.group.getAttribute("aria-invalid") === "true")
        validateRequiredGroup(group);
    });
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
        track("contact_submit", contactSubmitParams());
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
