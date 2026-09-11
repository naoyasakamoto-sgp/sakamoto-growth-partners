(function () {
  "use strict";

  var allowedCtaTypes = ["contact", "line", "phone", "email", "diagnosis", "service"];

  function rootContext() {
    return document.querySelector("[data-page-type]") || document.body;
  }

  function safeValue(value, fallback, maxLength) {
    if (typeof value !== "string" || !value.trim()) return fallback;
    return value.trim().slice(0, maxLength || 120);
  }

  function track(eventName, params) {
    var payload = Object.assign({}, params || {});
    window.dataLayer = window.dataLayer || [];

    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, payload);
    } else {
      window.dataLayer.push(Object.assign({ event: eventName }, payload));
    }
  }

  function inferType(link) {
    var explicitType = link.getAttribute("data-cta-type");
    if (allowedCtaTypes.indexOf(explicitType) >= 0) return explicitType;

    var href = link.getAttribute("href") || "";
    if (href.indexOf("mailto:") === 0) return "email";
    if (href.indexOf("tel:") === 0) return "phone";
    if (href.indexOf("/diagnosis/") >= 0) return "diagnosis";
    if (href.indexOf("/services/") >= 0) return "service";
    return "contact";
  }

  function eventContext(element) {
    var root = rootContext();
    var href = element && element.getAttribute ? element.getAttribute("href") : "";
    var values = {
      article_slug: element && element.getAttribute("data-article-slug") || root.getAttribute("data-article-slug"),
      article_title: element && element.getAttribute("data-article-title") || root.getAttribute("data-article-title"),
      category: element && element.getAttribute("data-category") || root.getAttribute("data-category") || root.getAttribute("data-news-category"),
      cta_type: element && element.getAttribute("data-cta-type"),
      destination: element && element.getAttribute("data-destination") || href,
      cta_location: element && element.getAttribute("data-cta-location"),
      case_id: element && element.getAttribute("data-case-id") || root.getAttribute("data-case-id"),
      case_slug: element && element.getAttribute("data-case-slug") || root.getAttribute("data-case-slug"),
      case_title: root.getAttribute("data-case-title"),
      target_case_id: element && element.getAttribute("data-target-case-id"),
      work_slug: element && element.getAttribute("data-work-slug") || root.getAttribute("data-work-slug"),
      news_slug: element && element.getAttribute("data-news-slug") || root.getAttribute("data-news-slug"),
      intent: element && element.getAttribute("data-intent"),
    };
    var result = {};
    Object.keys(values).forEach(function (key) {
      var value = safeValue(values[key], "", key === "article_title" || key === "case_title" ? 180 : 120);
      if (value) result[key] = value;
    });
    return result;
  }

  function trackCta(link) {
    var root = rootContext();
    track("cta_click", {
      cta_type: inferType(link),
      cta_location: safeValue(link.getAttribute("data-cta-location"), "unknown"),
      service_context: safeValue(
        link.getAttribute("data-service-context") || root.getAttribute("data-service-context"),
        "general",
      ),
      page_type: safeValue(root.getAttribute("data-page-type"), "general"),
    });
  }

  document.addEventListener("click", function (event) {
    var analyticsLink = event.target.closest("[data-analytics-event]");
    if (analyticsLink) {
      var eventName = analyticsLink.getAttribute("data-analytics-event");
      var params = eventContext(analyticsLink);
      track(eventName, params);
      if (eventName === "insight_cta_click" && params.cta_type === "diagnosis") {
        track("diagnosis_click", params);
      }
    }

    var ctaLink = event.target.closest(
      "[data-cta-track], a[href^='mailto:'], a[href^='tel:']",
    );
    if (ctaLink) trackCta(ctaLink);
  });

  function trackContentView() {
    var root = rootContext();
    var pageType = root.getAttribute("data-page-type");
    var analyticsPage = root.getAttribute("data-analytics-page");
    if (pageType === "insight") track("insight_view", eventContext(root));
    if (analyticsPage === "case-study") track("case_study_view", eventContext(root));
    if (analyticsPage === "news") track("news_view", eventContext(root));
  }

  function setupInsightProgress() {
    var root = rootContext();
    var article = document.querySelector("[data-insight-article]");
    if (!article || root.getAttribute("data-page-type") !== "insight") return;

    var sent = { 50: false, 90: false };
    var progressEventNames = {
      50: "insight_50_percent",
      90: "insight_90_percent",
    };
    var ticking = false;
    function measure() {
      ticking = false;
      var rect = article.getBoundingClientRect();
      var top = window.scrollY + rect.top;
      var height = Math.max(article.offsetHeight, 1);
      var depth = Math.max(0, Math.min(1, (window.scrollY + window.innerHeight - top) / height));
      [50, 90].forEach(function (threshold) {
        if (sent[threshold] || depth < threshold / 100) return;
        sent[threshold] = true;
        track(progressEventNames[threshold], eventContext(root));
      });
    }
    function schedule() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(measure);
    }
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
  }

  function setupMobileCtaBar() {
    var bar = document.querySelector(".sgp-mobile-cta-bar");
    var hero = document.querySelector(".sgp-architecture-hero");
    if (!bar || !hero) return;
    if (typeof window.IntersectionObserver !== "function") {
      bar.classList.add("is-visible");
      return;
    }
    var observer = new window.IntersectionObserver(function (entries) {
      bar.classList.toggle("is-visible", !entries[0].isIntersecting);
    }, { threshold: [0.05] });
    observer.observe(hero);
  }

  trackContentView();
  setupInsightProgress();
  setupMobileCtaBar();

  window.sgpTrackEvent = track;
  window.sgpTrackCta = trackCta;
})();
