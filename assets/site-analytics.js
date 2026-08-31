(function () {
  "use strict";

  var allowedCtaTypes = ["contact", "line", "phone", "email", "diagnosis"];

  function rootContext() {
    return document.querySelector("[data-page-type]") || document.body;
  }

  function safeValue(value, fallback) {
    if (typeof value !== "string" || !value.trim()) return fallback;
    return value.trim().slice(0, 80);
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
    return "contact";
  }

  function trackCta(link) {
    var root = rootContext();
    track("cta_click", {
      cta_type: inferType(link),
      cta_location: safeValue(
        link.getAttribute("data-cta-location"),
        "unknown",
      ),
      service_context: safeValue(
        link.getAttribute("data-service-context") ||
          root.getAttribute("data-service-context"),
        "general",
      ),
      page_type: safeValue(root.getAttribute("data-page-type"), "general"),
    });
  }

  document.addEventListener("click", function (event) {
    var link = event.target.closest(
      "[data-cta-track], a[href^='mailto:'], a[href^='tel:']",
    );
    if (!link) return;
    trackCta(link);
  });

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

  setupMobileCtaBar();

  window.sgpTrackEvent = track;
  window.sgpTrackCta = trackCta;
})();
