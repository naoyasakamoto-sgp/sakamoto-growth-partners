(() => {
  const GA4_MEASUREMENT_ID = "G-08TBS4LE54";

  function initGa4() {
    if (window.__sgpGa4Initialized) return;
    window.__sgpGa4Initialized = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() {
      window.dataLayer.push(arguments);
    };

    const selector = `script[src*="googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}"]`;
    if (!document.querySelector(selector)) {
      const gaScript = document.createElement("script");
      gaScript.async = true;
      gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA4_MEASUREMENT_ID)}`;
      gaScript.dataset.sgpGa4 = GA4_MEASUREMENT_ID;
      document.head.appendChild(gaScript);
    }

    window.gtag("js", new Date());
    window.gtag("config", GA4_MEASUREMENT_ID);
  }

  initGa4();

  const safeParams = (params = {}) => Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );

  function emit(name, params = {}) {
    const payload = safeParams(params);
    if (typeof window.gtag === "function") {
      window.gtag("event", name, payload);
    } else {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: name, ...payload });
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
