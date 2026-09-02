const menuButton = document.querySelector('[data-menu-button]');
const nav = document.querySelector('[data-nav]');
if (menuButton && nav) {
  menuButton.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(isOpen));
  });
  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    nav.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
  }));
}

const reveals = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  reveals.forEach((el) => observer.observe(el));
} else {
  reveals.forEach((el) => el.classList.add('visible'));
}

function ensureCaseStudyNav() {
  document.querySelectorAll('[data-nav]').forEach((menu) => {
    if (menu.querySelector('a[href="/case-studies/"]')) return;
    const newsLink = menu.querySelector('a[href="/news/"]');
    if (!newsLink) return;
    const link = document.createElement('a');
    link.href = '/case-studies/';
    link.textContent = 'CASE STUDY';
    newsLink.before(link);
  });
}

function ensureCaseStudyStyles() {
  if (document.querySelector('link[href="/case-studies/case-study.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/case-studies/case-study.css';
  document.head.append(link);
}

function ensureHomeCaseStudy() {
  if (location.pathname !== '/' && location.pathname !== '/index.html') return;
  const newsSection = document.querySelector('.home-news');
  if (!newsSection || document.querySelector('#home-case-proof')) return;
  ensureCaseStudyStyles();
  const section = document.createElement('section');
  section.className = 'home-case-proof';
  section.id = 'home-case-proof';
  section.setAttribute('aria-labelledby', 'home-case-title');
  section.innerHTML = `
    <div class="container">
      <div class="home-case-heading">
        <div><p class="section-label">CASE STUDY</p><h2 id="home-case-title">言葉ではなく、実際につくったもので。</h2><p>SGPが企画・設計・開発したプロダクトから、どのような問題を、どう仕組みに変えたかをご紹介します。</p></div>
        <a href="/case-studies/">すべての開発事例を見る →</a>
      </div>
      <a class="case-feature-card" href="/case-studies/my-jazz-day/">
        <div class="case-feature-copy"><p class="case-kicker">CASE STUDY 001 / SENDAI ERABU!</p><h2>897の演奏枠を、<br>1分で「自分だけの一日」へ。</h2><p>音楽の好み・気分・時間・開始エリア・歩行量・新しい音との距離から、フェスの一日を構成するMY JAZZ DAY。</p><div class="case-card-metrics"><span><b>897</b> PERFORMANCE SLOTS</span><span><b>50</b> VENUES</span><span><b>1 MIN</b> PERSONALIZATION</span></div></div>
        <div class="case-feature-image"><img src="/assets/case-studies/my-jazz-day/hero-mobile.webp" alt="MY JAZZ DAYの画面" loading="lazy"></div>
      </a>
    </div>`;
  newsSection.before(section);
}

function ensureLatestNews() {
  const list = document.querySelector('.home-news-list');
  if (!list || list.querySelector('a[href="/news/sendai-erabu-my-jazz-day-2026/"]')) return;
  const article = document.createElement('article');
  article.innerHTML = '<div><time datetime="2026-09-02">2026.09.02</time><span>PRODUCT</span></div><h3><a href="/news/sendai-erabu-my-jazz-day-2026/">「仙台えらぶ！」にて、897の演奏枠から自分だけの一日を組む「MY JAZZ DAY」を開発</a></h3>';
  list.prepend(article);
  while (list.children.length > 3) list.lastElementChild.remove();
}

function ensureNewsArchiveEntry() {
  if (location.pathname !== '/news/' && location.pathname !== '/news/index.html') return;
  if (document.querySelector('a[href="/news/sendai-erabu-my-jazz-day-2026/"]')) return;
  const timeline = document.querySelector('.news-timeline');
  if (!timeline) return;
  const article = document.createElement('article');
  article.className = 'news-timeline-item';
  article.innerHTML = '<time datetime="2026-09-02"><span>SEP</span>02</time><p class="news-category">PRODUCT</p><div><h3><a href="/news/sendai-erabu-my-jazz-day-2026/">「仙台えらぶ！」にて、897の演奏枠から自分だけの一日を組む「MY JAZZ DAY」を開発</a></h3><p>897の演奏枠と50会場の情報から、利用者の音楽嗜好・気分・時間・開始エリアなどに合わせて鑑賞プランを組み立てるMY JAZZ DAYを開発しました。</p></div>';
  timeline.prepend(article);
}

function ensureAnalytics() {
  if (window.sgpAnalytics || document.querySelector('script[src="/analytics.js"]')) return;
  const script = document.createElement('script');
  script.src = '/analytics.js';
  script.defer = true;
  document.head.append(script);
}

ensureCaseStudyNav();
ensureHomeCaseStudy();
ensureLatestNews();
ensureNewsArchiveEntry();
ensureAnalytics();
