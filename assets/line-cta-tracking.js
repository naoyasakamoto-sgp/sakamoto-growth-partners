(function () {
  var eventName = "click_line_cta";
  var eventCategory = "cta";
  var eventLabel = "LINEで無料相談する";

  window.dataLayer = window.dataLayer || [];

  function trackLineCta(ctaLocation, link) {
    var params = {
      event_category: eventCategory,
      event_label: eventLabel,
      cta_location: ctaLocation || "unknown"
    };

    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, params);
    } else {
      window.dataLayer.push(Object.assign({ event: eventName }, params));
    }

    var root = document.querySelector("[data-page-type]") || document.body;
    var ctaParams = {
      cta_type: "line",
      cta_location: ctaLocation || "unknown",
      service_context: (link && link.getAttribute("data-service-context")) || root.getAttribute("data-service-context") || "general",
      page_type: root.getAttribute("data-page-type") || "general"
    };

    if (typeof window.sgpTrackEvent === "function") {
      window.sgpTrackEvent("cta_click", ctaParams);
    } else if (typeof window.gtag === "function") {
      window.gtag("event", "cta_click", ctaParams);
    } else {
      window.dataLayer.push(Object.assign({ event: "cta_click" }, ctaParams));
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-line-cta]").forEach(function (link) {
      link.addEventListener("click", function () {
        trackLineCta(link.getAttribute("data-cta-location"), link);
      });
    });
  });

  window.sgpTrackLineCta = trackLineCta;
})();
