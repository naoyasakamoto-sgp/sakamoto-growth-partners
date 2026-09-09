(function () {
  "use strict";

  var root = document.querySelector(".insights-page");
  if (!root) return;

  var categoryButtons = Array.prototype.slice.call(
    root.querySelectorAll("[data-insight-category]"),
  );
  var tagSelect = root.querySelector("[data-insight-tag]");
  var cards = Array.prototype.slice.call(
    root.querySelectorAll(".insight-latest-grid [data-insight-card]"),
  );
  var status = root.querySelector("[data-insight-filter-status]");
  var activeCategory = "all";

  function applyFilters() {
    var activeTag = tagSelect ? tagSelect.value : "all";
    var visible = 0;
    cards.forEach(function (card) {
      var tags = (card.getAttribute("data-tags") || "").split("|");
      var categoryMatches =
        activeCategory === "all" ||
        card.getAttribute("data-category") === activeCategory;
      var tagMatches = activeTag === "all" || tags.indexOf(activeTag) >= 0;
      card.hidden = !(categoryMatches && tagMatches);
      if (!card.hidden) visible += 1;
    });
    if (status) status.textContent = visible + "件を表示";
  }

  categoryButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      activeCategory = button.getAttribute("data-insight-category") || "all";
      categoryButtons.forEach(function (candidate) {
        candidate.setAttribute(
          "aria-pressed",
          candidate === button ? "true" : "false",
        );
      });
      applyFilters();
    });
  });
  if (tagSelect) tagSelect.addEventListener("change", applyFilters);

  var toc = root.querySelector(".insight-toc details");
  if (toc && window.matchMedia("(max-width: 900px)").matches) toc.open = false;
})();
