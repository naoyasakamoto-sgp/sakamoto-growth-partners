// SGP product-site interaction: a deliberate choice between curated, source-backed views.
// No personalization, tracking, third-party network activity or generated copy.
(() => {
  const tabs = Array.from(document.querySelectorAll('[role="tab"][data-product-view]'));
  const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));
  if (tabs.length && tabs.every((tab, i) => panels[i])) {
    const select = (next, focus = false) => {
      tabs.forEach((tab, i) => {
        const active = i === next;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        panels[i].hidden = !active;
      });
      if (focus) tabs[next].focus();
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(index));
      tab.addEventListener('keydown', event => {
        const target = event.key === 'ArrowRight' ? (index + 1) % tabs.length
          : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
          : event.key === 'Home' ? 0
          : event.key === 'End' ? tabs.length - 1 : null;
        if (target === null) return;
        event.preventDefault();
        select(target, true);
      });
    });
  }
  // Native <details> menu: close after a visitor selects a same-page target.
  const menu = document.querySelector('.mobile-menu');
  if (menu) {
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { menu.open = false; }));
    document.addEventListener('keydown', event => { if (event.key === 'Escape') menu.open = false; });
  }
})();
