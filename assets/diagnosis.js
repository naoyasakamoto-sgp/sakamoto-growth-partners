(function () {
  "use strict";

  var form = document.getElementById("diagnosis-form");
  var page = document.querySelector(".diagnosis-page");
  if (!page || !form) return;

  var currentStep = 1;
  var hasStarted = false;
  var hasSubmitted = false;
  var completedSteps = {};
  var allowedServices = ["ai", "business-improvement", "web-marketing", "diagnosis"];
  var requestedService = new URLSearchParams(window.location.search).get("service");
  var serviceInterest = allowedServices.indexOf(requestedService) >= 0 ? requestedService : "diagnosis";

  function track(eventName, params) {
    if (typeof window.sgpTrackEvent === "function") {
      window.sgpTrackEvent(eventName, params || {});
      return;
    }
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag === "function") window.gtag("event", eventName, params || {});
    else window.dataLayer.push(Object.assign({ event: eventName }, params || {}));
  }

  function applyAttribution() {
    if (window.SGPLeadAttribution) {
      window.SGPLeadAttribution.apply(form, serviceInterest);
      return;
    }
    var landing = form.querySelector("[name='landing_page']");
    var referrer = form.querySelector("[name='referrer']");
    if (landing) landing.value = window.location.origin + window.location.pathname;
    if (referrer) referrer.value = document.referrer || "";
  }

  function startOnce() {
    if (hasStarted) return;
    hasStarted = true;
    track("diagnosis_start", {
      form_id: "diagnosis",
      service_interest: serviceInterest,
    });
  }

  function setStep(step) {
    currentStep = step;
    document.querySelectorAll("[data-step]").forEach(function (fieldset) {
      var active = Number(fieldset.getAttribute("data-step")) === step;
      fieldset.hidden = !active;
      fieldset.classList.toggle("is-active", active);
      if (active) {
        var legend = fieldset.querySelector("legend");
        if (legend) window.setTimeout(function () { legend.focus(); }, 0);
      }
    });
    document.querySelectorAll("[data-step-tab]").forEach(function (button) {
      var active = Number(button.getAttribute("data-step-tab")) === step;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
  }

  function field(name) {
    return form.querySelector("[name='" + name + "']");
  }

  function clearError(name) {
    var input = field(name);
    var output = document.getElementById(name + "-error");
    if (output) output.textContent = "";
    if (input) {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    }
  }

  function setError(name, message) {
    var input = field(name);
    var output = document.getElementById(name + "-error");
    if (output) output.textContent = message;
    if (input) {
      input.setAttribute("aria-invalid", "true");
      if (output) input.setAttribute("aria-describedby", output.id);
    }
  }

  function value(name) {
    var input = field(name);
    return input ? input.value.trim() : "";
  }

  function validateStep(step) {
    var firstInvalid = null;
    var required = {
      1: ["company_name", "employee_range"],
      2: ["challenge_detail"],
      3: ["name", "email", "contact_method", "privacy_agreed"],
    };

    (required[step] || []).forEach(function (name) {
      clearError(name);
      var input = field(name);
      if (!input) return;
      var valid = input.type === "checkbox" ? input.checked : Boolean(input.value.trim());
      if (!valid) {
        setError(name, "入力してください。");
        firstInvalid = firstInvalid || input;
      }
    });

    if (step === 1) {
      clearError("industry_other");
      if (value("industry") === "その他" && !value("industry_other")) {
        setError("industry_other", "業種を入力してください。");
        firstInvalid = firstInvalid || field("industry_other");
      }
    }

    if (step === 2) {
      clearError("issues");
      if (!form.querySelector("[name='issues']:checked")) {
        setError("issues", "最低1つ選択してください。");
        firstInvalid = firstInvalid || field("issues");
      }
    }

    if (step === 3) {
      var email = value("email");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError("email", "正しいメールアドレスを入力してください。");
        firstInvalid = firstInvalid || field("email");
      }
    }

    if (firstInvalid) {
      firstInvalid.focus();
      track("form_validation_error", {
        form_id: "diagnosis",
        step_number: step,
        field_name: firstInvalid.name,
      });
      return false;
    }
    return true;
  }

  function completeStep(step) {
    if (completedSteps[step]) return;
    completedSteps[step] = true;
    track("diagnosis_step", { step_number: step });
  }

  function finishLeadEvent() {
    var finished = false;
    function redirect() {
      if (finished) return;
      finished = true;
      window.location.assign("/diagnosis/thanks/");
    }

    var params = {
      form_id: "diagnosis",
      service_interest: serviceInterest,
      contact_method: "form",
    };
    if (typeof window.gtag === "function") {
      window.gtag("event", "generate_lead", Object.assign({}, params, {
        event_callback: redirect,
        event_timeout: 1200,
      }));
      window.setTimeout(redirect, 1400);
    } else {
      track("generate_lead", params);
      redirect();
    }
  }

  function submit(event) {
    event.preventDefault();
    if (hasSubmitted || !validateStep(3)) return;
    completeStep(3);
    hasSubmitted = true;

    var button = form.querySelector("[data-submit-button]");
    var submitError = form.querySelector(".diagnosis-submit-error");
    if (submitError) {
      submitError.hidden = true;
      submitError.textContent = "";
    }
    if (button) {
      button.disabled = true;
      button.textContent = "送信中...";
    }

    var body = new URLSearchParams();
    new FormData(form).forEach(function (item, key) {
      body.append(key, String(item));
    });

    fetch(form.getAttribute("action"), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json",
      },
      body: body.toString(),
    })
      .then(function (response) {
        if (!response.ok) throw new Error("submit_failed");
        return response.json();
      })
      .then(finishLeadEvent)
      .catch(function () {
        hasSubmitted = false;
        if (button) {
          button.disabled = false;
          button.textContent = "無料経営導線診断を申し込む";
        }
        if (submitError) {
          submitError.hidden = false;
          submitError.textContent = "送信できませんでした。時間をおいて再度お試しいただくか、LINEよりお問い合わせください。";
        }
      });
  }

  function setupIndustry() {
    var select = field("industry");
    var wrap = document.querySelector(".diagnosis-industry-other");
    var input = field("industry_other");
    if (!select || !wrap || !input) return;
    select.addEventListener("change", function () {
      var show = select.value === "その他";
      wrap.hidden = !show;
      input.required = show;
      if (!show) {
        input.value = "";
        clearError("industry_other");
      }
    });
  }

  function setupSteps() {
    form.querySelectorAll("[data-next-step]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (!validateStep(currentStep)) return;
        completeStep(currentStep);
        setStep(Math.min(currentStep + 1, 3));
      });
    });
    form.querySelectorAll("[data-prev-step]").forEach(function (button) {
      button.addEventListener("click", function () {
        setStep(Math.max(currentStep - 1, 1));
      });
    });
    form.querySelectorAll("[data-step-tab]").forEach(function (button) {
      button.addEventListener("click", function () {
        var target = Number(button.getAttribute("data-step-tab"));
        if (target < currentStep) setStep(target);
      });
    });
  }

  function setupStickyVisibility() {
    var sticky = document.querySelector(".diagnosis-mobile-sticky");
    var apply = document.getElementById("apply");
    if (!sticky || !apply || typeof window.IntersectionObserver !== "function") return;
    var observer = new IntersectionObserver(function (entries) {
      sticky.classList.toggle("is-hidden", entries[0].isIntersecting);
    }, { threshold: [0.1] });
    observer.observe(apply);
  }

  applyAttribution();
  setupIndustry();
  setupSteps();
  setupStickyVisibility();
  form.addEventListener("input", startOnce, { once: true });
  form.addEventListener("change", startOnce, { once: true });
  form.addEventListener("submit", submit);
  setStep(1);
})();
