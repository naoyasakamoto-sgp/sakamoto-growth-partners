(function () {
  "use strict";

  var STORAGE_KEY = "sgp_first_touch_v1";
  var UTM_KEYS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
  ];
  var LEAD_CONTEXT_KEYS = ["source", "case", "intent"];

  function safe(value, maxLength) {
    return String(value || "")
      .replace(/\0/g, "")
      .trim()
      .slice(0, maxLength || 500);
  }

  function referrerHost() {
    if (!document.referrer) return "";
    try {
      return new URL(document.referrer).hostname.replace(/^www\./, "");
    } catch (_error) {
      return "";
    }
  }

  function inferredSource(searchParams) {
    var campaignSource = searchParams.get("utm_source");
    if (campaignSource) return safe(campaignSource, 200);
    var host = referrerHost();
    if (!host) return "direct";
    if (/google\./.test(host)) return "google";
    if (/bing\./.test(host)) return "bing";
    if (/yahoo\./.test(host)) return "yahoo";
    return safe(host, 200);
  }

  function inferredMedium(searchParams, source) {
    var campaignMedium = searchParams.get("utm_medium");
    if (campaignMedium) return safe(campaignMedium, 200);
    if (source === "direct") return "none";
    if (["google", "bing", "yahoo"].indexOf(source) >= 0) return "organic";
    return "referral";
  }

  function loadFirstTouch() {
    try {
      return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    } catch (_error) {
      return null;
    }
  }

  function firstTouch() {
    var stored = loadFirstTouch();
    if (stored && stored.first_source && stored.landing_page) return stored;

    var searchParams = new URLSearchParams(window.location.search);
    var source = inferredSource(searchParams);
    var data = {
      first_source: source,
      first_medium: inferredMedium(searchParams, source),
      first_campaign: safe(searchParams.get("utm_campaign"), 200),
      landing_page: safe(window.location.origin + window.location.pathname, 500),
      referrer: safe(document.referrer, 500),
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (_error) {
      // The form still receives the current first-touch values when storage is unavailable.
    }
    return data;
  }

  function submissionId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "sgp-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
  }

  function setField(form, name, value) {
    var field = form.querySelector("[name='" + name + "']");
    if (field) field.value = safe(value, name === "referrer" || name === "landing_page" ? 500 : 200);
  }

  function apply(form, serviceInterest) {
    if (!form) return null;
    var data = firstTouch();
    var searchParams = new URLSearchParams(window.location.search);

    Object.keys(data).forEach(function (key) {
      setField(form, key, data[key]);
    });
    UTM_KEYS.forEach(function (key) {
      setField(form, key, searchParams.get(key));
    });
    var leadContext = {};
    LEAD_CONTEXT_KEYS.forEach(function (key) {
      var value = safe(searchParams.get(key), 120);
      leadContext["lead_" + key] = value;
      setField(form, "lead_" + key, value);
    });
    setField(form, "service_interest", serviceInterest || "general");
    setField(form, "submission_id", submissionId());
    return Object.assign({}, data, leadContext);
  }

  window.SGPLeadAttribution = {
    apply: apply,
    getFirstTouch: firstTouch,
  };
})();
