(() => {
  const pendingGa4Events = [];
  const analyticsScript = document.currentScript;
  const analyticsConfigUrl = analyticsScript?.src
    ? new URL("analytics-config.js", analyticsScript.src).href
    : "/analytics-config.js";

  function initGa4(measurementId) {
    if (!measurementId || window.__sgpGa4Initialized) return;
    window.__sgpGa4Initialized = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() {
      window.dataLayer.push(arguments);
    };

    const selector = `script[src*="googletagmanager.com/gtag/js?id=${measurementId}"]`;
    if (!document.querySelector(selector)) {
      const gaScript = document.createElement("script");
      gaScript.async = true;
      gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      gaScript.dataset.sgpGa4 = measurementId;
      document.head.appendChild(gaScript);
    }

    window.gtag("js", new Date());
    window.gtag("config", measurementId);
    window.__sgpGa4Configured = true;

    for (const [name, params] of pendingGa4Events.splice(0)) {
      window.gtag("event", name, params);
    }
  }

  function loadGa4Config() {
    const currentId = window.SGP_ANALYTICS_CONFIG?.ga4MeasurementId;
    if (currentId) {
      initGa4(currentId);
      return;
    }

    const existing = document.querySelector("script[data-sgp-analytics-config]");
    if (existing) {
      existing.addEventListener("load", () => initGa4(window.SGP_ANALYTICS_CONFIG?.ga4MeasurementId), { once: true });
      return;
    }

    const configScript = document.createElement("script");
    configScript.src = analyticsConfigUrl;
    configScript.dataset.sgpAnalyticsConfig = "true";
    configScript.addEventListener("load", () => initGa4(window.SGP_ANALYTICS_CONFIG?.ga4MeasurementId), { once: true });
    document.head.appendChild(configScript);
  }

  loadGa4Config();

  const safeParams = (params = {}) => Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );

  function emit(name, params = {}) {
    const payload = safeParams(params);
    if (window.__sgpGa4Configured && typeof window.gtag === "function") {
      window.gtag("event", name, payload);
    } else {
      pendingGa4Events.push([name, payload]);
    }
    document.dispatchEvent(new CustomEvent("sgp:analytics", { detail: { name, params: payload } }));
  }

  window.sgpAnalytics = { track: emit };

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-analytics-event]").forEach((el) => {
      el.addEventListener("click", () => {
        const params = {};
        for (const [key, value] of Object.entries(el.dataset)) {
          if (key === "analyticsEvent") continue;
          params[key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] = value;
        }
        emit(el.dataset.analyticsEvent, params);
      });
    });

    const page = document.body.dataset.analyticsPage;
    if (page === "case-study") {
      emit("case_study_view", {
        case_id: document.body.dataset.caseId,
        case_slug: document.body.dataset.caseSlug,
        case_title: document.body.dataset.caseTitle
      });
    }
    if (page === "news") {
      emit("news_view", {
        news_slug: document.body.dataset.newsSlug,
        category: document.body.dataset.newsCategory
      });
    }
  });
})();
