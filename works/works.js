(() => {
  const filters = [...document.querySelectorAll("[data-work-filter]")];
  const cards = [...document.querySelectorAll("[data-work-card]")];
  const status = document.querySelector("[data-work-status]");
  const empty = document.querySelector("[data-work-empty]");
  if (!filters.length || !cards.length || !status || !empty) return;

  function applyFilter(filter) {
    let visibleCount = 0;
    for (const card of cards) {
      const categories = card.dataset.categories?.split(" ") || [];
      const visible = filter === "all" || categories.includes(filter);
      card.hidden = !visible;
      if (visible) visibleCount += 1;
    }
    for (const button of filters) button.setAttribute("aria-pressed", String(button.dataset.workFilter === filter));
    status.textContent = `${visibleCount}件を表示`;
    empty.hidden = visibleCount !== 0;
  }

  for (const button of filters) {
    button.addEventListener("click", () => applyFilter(button.dataset.workFilter));
  }
})();
