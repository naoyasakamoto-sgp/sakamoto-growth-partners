(() => {
  document.addEventListener("DOMContentLoaded", () => {
    if (window.sgpAnalytics?.track) {
      window.sgpAnalytics.track("pawn_bpo_view", {
        page_path: window.location.pathname,
        service: "pawn-bpo"
      });
    }

    const form = document.querySelector("[data-pawn-bpo-form]");
    if (!form) return;

    let started = false;
    form.addEventListener("focusin", () => {
      if (started) return;
      started = true;
      window.sgpAnalytics?.track?.("pawn_bpo_form_start", {
        form_name: "pawn-bpo-diagnosis"
      });
    });

    form.addEventListener("submit", () => {
      window.sgpAnalytics?.track?.("pawn_bpo_form_submit", {
        form_name: "pawn-bpo-diagnosis"
      });
    });
  });
})();
