import { DEMO_PLANS, STYLE_LABELS } from './plans.js';

(function () {
  'use strict';

  var state = {
    step: 0,
    household: { adults: 2, children: 1, futureChildren: 2 },
    remote: 'sometimes',
    pains: ['laundry', 'storage'],
    priorities: ['housework', 'storage', 'thermal'],
    laundry: 'night',
    lifestyle: ['family', 'cooking'],
    budgetIdeal: 34,
    budgetMax: 38,
    land: 'none',
    siteWidth: 8,
    floorPreference: 'either',
    style: 'natural',
    results: [],
    compare: []
  };

  var steps = [
    { key:'household', kicker:'01 / HOUSEHOLD', title:'誰と、これから暮らしますか？', desc:'今だけではなく、5〜10年後の家族構成まで見ます。' },
    { key:'pain', kicker:'02 / PAIN', title:'今の住まいで、二度と繰り返したくないことは？', desc:'理想よりも、現在の不満には強い意思決定情報があります。最大3つ選んでください。' },
    { key:'priority', kicker:'03 / PRIORITY', title:'家づくりで、何を最優先にしますか？', desc:'「全部大事」ではなく、上位3つを順位づけします。' },
    { key:'laundry', kicker:'04 / HOUSEWORK', title:'洗濯を、どこまで短く終わらせたいですか？', desc:'洗う・干す・しまうの距離を住宅プランの動線評価へ変換します。' },
    { key:'life', kicker:'05 / LIFESTYLE', title:'家で大切にしたい時間は？', desc:'暮らし方を、部屋の有無ではなく空間の関係性へ変換します。' },
    { key:'budget', kicker:'06 / BUDGET', title:'暮らしを圧迫しない総額は？', desc:'理想予算と絶対上限を分けて、予算超過リスクを明示します。' },
    { key:'land', kicker:'07 / SITE', title:'土地の状況を教えてください。', desc:'建てられない候補は、ランキングする前に除外します。' },
    { key:'style', kicker:'08 / STYLE', title:'どんな空気感に惹かれますか？', desc:'デザインは主役ではなく、暮らし適合を補完する要素として扱います。' }
  ];

  var painOptions = [
    ['laundry','洗濯が面倒'],['storage','収納が足りない'],['cold','冬の洗面所が寒い'],
    ['work','在宅勤務場所がない'],['morning','朝の洗面が混む'],['mess','子どもの物が散らかる'],
    ['kitchen','キッチンが使いにくい'],['privacy','一人になれる場所がない']
  ];

  var priorityOptions = [
    ['housework','家事'],['storage','収納'],['thermal','冬の快適性'],['budget','価格'],
    ['work','仕事'],['family','家族時間'],['future','将来性'],['privacy','プライバシー'],['outdoor','庭・外']
  ];

  var lifeOptions = [
    ['family','家族で食事'],['cooking','料理'],['work','家で仕事'],['alone','一人時間'],
    ['kids','子どもと過ごす'],['guest','友人を招く'],['garden','庭で過ごす'],['hobby','趣味']
  ];

  var $ = function (id) { return document.getElementById(id); };
  var clamp = function (n,min,max) { return Math.max(min, Math.min(max,n)); };
  var round = function (n) { return Math.round(n); };

  function track(name, params) {
    var payload = Object.assign({ product_slug:'my-home-plan' }, params || {});
    if (typeof window.sgpTrackEvent === 'function') {
      window.sgpTrackEvent(name, payload);
      return;
    }
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag === 'function') window.gtag('event', name, payload);
    else window.dataLayer.push(Object.assign({ event:name }, payload));
  }

  function optionButton(value, label, selected, attr) {
    return '<button type="button" class="mhp-choice' + (selected ? ' is-selected' : '') + '" data-' + attr + '="' + value + '">' +
      '<span class="mhp-choice-dot"></span><strong>' + label + '</strong></button>';
  }

  function renderStep() {
    var s = steps[state.step];
    $('mhp-progress-bar').style.width = ((state.step + 1) / steps.length * 100) + '%';
    $('mhp-progress-text').textContent = (state.step + 1) + ' / ' + steps.length;
    $('mhp-step-kicker').textContent = s.kicker;
    $('mhp-step-title').textContent = s.title;
    $('mhp-step-desc').textContent = s.desc;
    $('mhp-message').textContent = '';
    $('mhp-back').disabled = state.step === 0;
    $('mhp-next').textContent = state.step === steps.length - 1 ? '提案を見る →' : '次へ →';
    var body = $('mhp-step-body');
    body.innerHTML = buildStepBody(s.key);
    bindStepEvents(s.key);
    track('mhp_question_view', { step:state.step + 1, question:s.key });
  }

  function buildStepBody(key) {
    if (key === 'household') {
      return '<div class="mhp-grid-2">' +
        '<label class="mhp-field"><span>大人</span><select id="mhp-adults"><option value="1">1人</option><option value="2">2人</option><option value="3">3人以上</option></select></label>' +
        '<label class="mhp-field"><span>現在の子ども</span><select id="mhp-children"><option value="0">0人</option><option value="1">1人</option><option value="2">2人</option><option value="3">3人以上</option></select></label>' +
        '<label class="mhp-field"><span>将来想定する子ども</span><select id="mhp-future-children"><option value="0">0人</option><option value="1">1人</option><option value="2">2人</option><option value="3">3人以上</option></select></label>' +
        '<label class="mhp-field"><span>在宅勤務</span><select id="mhp-remote"><option value="none">ほぼしない</option><option value="sometimes">週1〜3日</option><option value="often">ほぼ毎日</option></select></label>' +
        '</div>';
    }
    if (key === 'pain') {
      return '<div class="mhp-choice-grid">' + painOptions.map(function(o){ return optionButton(o[0],o[1],state.pains.indexOf(o[0])>=0,'pain'); }).join('') + '</div><p class="mhp-help">最大3つ。選択した不満は、通常の希望より強めに評価します。</p>';
    }
    if (key === 'priority') {
      var rows = priorityOptions.map(function(o){
        var idx = state.priorities.indexOf(o[0]);
        return '<button type="button" class="mhp-rank-item' + (idx>=0?' is-selected':'') + '" data-priority="' + o[0] + '">' +
          '<span class="mhp-rank-number">' + (idx>=0 ? idx+1 : '—') + '</span><strong>' + o[1] + '</strong><small>' + (idx>=0?'優先順位 '+(idx+1):'選択する') + '</small></button>';
      }).join('');
      return '<div class="mhp-rank-grid">' + rows + '</div><p class="mhp-help">選び直す場合は、選択済み項目を押して解除してください。</p>';
    }
    if (key === 'laundry') {
      var opts = [['compact','洗う→干す→しまうを、できるだけ1か所で'],['night','夜にまとめて、室内で完結したい'],['dryer','乾燥機中心。干す動線は短くてよい'],['normal','標準的でよい']];
      return '<div class="mhp-choice-stack">' + opts.map(function(o){ return optionButton(o[0],o[1],state.laundry===o[0],'laundry'); }).join('') + '</div>';
    }
    if (key === 'life') {
      return '<div class="mhp-choice-grid">' + lifeOptions.map(function(o){ return optionButton(o[0],o[1],state.lifestyle.indexOf(o[0])>=0,'life'); }).join('') + '</div><p class="mhp-help">複数選択できます。</p>';
    }
    if (key === 'budget') {
      return '<div class="mhp-budget-panel">' +
        '<label><span>理想の総額</span><strong id="mhp-budget-ideal-label">' + state.budgetIdeal.toFixed(1) + '百万円</strong><input id="mhp-budget-ideal" type="range" min="26" max="45" step="0.5" value="' + state.budgetIdeal + '"></label>' +
        '<label><span>絶対に超えたくない上限</span><strong id="mhp-budget-max-label">' + state.budgetMax.toFixed(1) + '百万円</strong><input id="mhp-budget-max" type="range" min="28" max="50" step="0.5" value="' + state.budgetMax + '"></label>' +
        '<p>土地費を含める／含めないは導入企業の価格マスターに合わせて設定できます。デモでは建物・標準付帯・基本諸費用を想定した比較用価格です。</p></div>';
    }
    if (key === 'land') {
      var land = [['none','土地はまだない'],['candidate','候補地がある'],['owned','土地を持っている']];
      var floors = [['either','どちらでも'],['two','2階建て希望'],['one','平屋希望']];
      return '<div class="mhp-subsection"><h3>土地</h3><div class="mhp-choice-grid">' + land.map(function(o){ return optionButton(o[0],o[1],state.land===o[0],'land'); }).join('') + '</div></div>' +
        '<div class="mhp-subsection"><label class="mhp-field"><span>敷地の有効間口（分かる場合）</span><input id="mhp-site-width" type="number" min="5" max="20" step="0.1" value="' + state.siteWidth + '"><small>不明なら8mの仮値。正式提案では配置確認が必要です。</small></label></div>' +
        '<div class="mhp-subsection"><h3>階数</h3><div class="mhp-choice-grid">' + floors.map(function(o){ return optionButton(o[0],o[1],state.floorPreference===o[0],'floor'); }).join('') + '</div></div>';
    }
    if (key === 'style') {
      return '<div class="mhp-style-grid">' + Object.keys(STYLE_LABELS).map(function(k){
        return '<button type="button" class="mhp-style-card' + (state.style===k?' is-selected':'') + '" data-style="' + k + '"><span class="mhp-style-swatch mhp-style-' + k + '"></span><strong>' + STYLE_LABELS[k] + '</strong></button>';
      }).join('') + '</div>';
    }
    return '';
  }

  function bindStepEvents(key) {
    if (key === 'household') {
      $('mhp-adults').value = state.household.adults;
      $('mhp-children').value = state.household.children;
      $('mhp-future-children').value = state.household.futureChildren;
      $('mhp-remote').value = state.remote;
      ['adults','children','future-children'].forEach(function(k){
        $('mhp-' + k).addEventListener('change', function(e){
          if (k === 'future-children') state.household.futureChildren = Number(e.target.value);
          else state.household[k] = Number(e.target.value);
        });
      });
      $('mhp-remote').addEventListener('change', function(e){ state.remote = e.target.value; });
    }
    if (key === 'pain') {
      document.querySelectorAll('[data-pain]').forEach(function(el){ el.addEventListener('click', function(){
        var v = el.dataset.pain, i = state.pains.indexOf(v);
        if (i >= 0) state.pains.splice(i,1); else if (state.pains.length < 3) state.pains.push(v);
        renderStep();
      });});
    }
    if (key === 'priority') {
      document.querySelectorAll('[data-priority]').forEach(function(el){ el.addEventListener('click', function(){
        var v = el.dataset.priority, i = state.priorities.indexOf(v);
        if (i >= 0) state.priorities.splice(i,1); else if (state.priorities.length < 3) state.priorities.push(v);
        renderStep();
      });});
    }
    if (key === 'laundry') {
      document.querySelectorAll('[data-laundry]').forEach(function(el){ el.addEventListener('click', function(){ state.laundry = el.dataset.laundry; renderStep(); });});
    }
    if (key === 'life') {
      document.querySelectorAll('[data-life]').forEach(function(el){ el.addEventListener('click', function(){
        var v = el.dataset.life, i = state.lifestyle.indexOf(v);
        if (i >= 0) state.lifestyle.splice(i,1); else state.lifestyle.push(v);
        renderStep();
      });});
    }
    if (key === 'budget') {
      $('mhp-budget-ideal').addEventListener('input', function(e){
        state.budgetIdeal = Number(e.target.value);
        if (state.budgetMax < state.budgetIdeal) state.budgetMax = state.budgetIdeal;
        $('mhp-budget-ideal-label').textContent = state.budgetIdeal.toFixed(1) + '百万円';
        $('mhp-budget-max').value = state.budgetMax;
        $('mhp-budget-max-label').textContent = state.budgetMax.toFixed(1) + '百万円';
      });
      $('mhp-budget-max').addEventListener('input', function(e){
        state.budgetMax = Math.max(Number(e.target.value), state.budgetIdeal);
        e.target.value = state.budgetMax;
        $('mhp-budget-max-label').textContent = state.budgetMax.toFixed(1) + '百万円';
      });
    }
    if (key === 'land') {
      document.querySelectorAll('[data-land]').forEach(function(el){ el.addEventListener('click', function(){ state.land = el.dataset.land; renderStep(); });});
      document.querySelectorAll('[data-floor]').forEach(function(el){ el.addEventListener('click', function(){ state.floorPreference = el.dataset.floor; renderStep(); });});
      $('mhp-site-width').addEventListener('input', function(e){ state.siteWidth = Number(e.target.value || 8); });
    }
    if (key === 'style') {
      document.querySelectorAll('[data-style]').forEach(function(el){ el.addEventListener('click', function(){ state.style = el.dataset.style; renderStep(); });});
    }
  }

  function validateStep() {
    if (steps[state.step].key === 'pain' && state.pains.length === 0) return '少なくとも1つ選んでください。';
    if (steps[state.step].key === 'priority' && state.priorities.length !== 3) return '優先順位を3つ選んでください。';
    if (steps[state.step].key === 'life' && state.lifestyle.length === 0) return '少なくとも1つ選んでください。';
    if (steps[state.step].key === 'budget' && state.budgetMax < state.budgetIdeal) return '絶対上限は理想予算以上にしてください。';
    return '';
  }

  function inferWeights() {
    var w = { housework:.10, storage:.10, thermal:.10, budget:.14, work:.08, family:.10, future:.10, privacy:.08, outdoor:.05, design:.07, site:.08 };
    var boosts = [0.18,0.12,0.08];
    state.priorities.forEach(function(k,i){ w[k] = (w[k] || 0) + boosts[i]; });
    state.pains.forEach(function(p){
      if (p === 'laundry') w.housework += .12;
      if (p === 'storage' || p === 'mess') w.storage += .12;
      if (p === 'cold') w.thermal += .12;
      if (p === 'work') w.work += .12;
      if (p === 'privacy') w.privacy += .10;
      if (p === 'morning') w.housework += .06;
      if (p === 'kitchen') w.housework += .05;
    });
    if (state.remote === 'often') w.work += .12;
    if (state.remote === 'sometimes') w.work += .05;
    if (state.household.futureChildren > state.household.children) w.future += .08;
    if (state.laundry === 'compact' || state.laundry === 'night') w.housework += .08;
    if (state.lifestyle.indexOf('garden') >= 0) w.outdoor += .10;
    if (state.lifestyle.indexOf('alone') >= 0) w.privacy += .08;
    if (state.lifestyle.indexOf('kids') >= 0 || state.lifestyle.indexOf('family') >= 0) w.family += .06;
    w.design += .05;
    var sum = Object.keys(w).reduce(function(a,k){ return a + w[k]; },0);
    Object.keys(w).forEach(function(k){ w[k] = w[k] / sum; });
    return w;
  }

  function requiredBedrooms() {
    var kids = Math.max(state.household.children, state.household.futureChildren);
    if (kids >= 2) return 3;
    if (kids === 1) return 2;
    return 1;
  }

  function budgetFit(price) {
    if (price > state.budgetMax) return 0;
    if (price <= state.budgetIdeal) return 1;
    var span = Math.max(.5, state.budgetMax - state.budgetIdeal);
    var t = (price - state.budgetIdeal) / span;
    return clamp(1 - .82 * Math.pow(t,1.35), .18, 1);
  }

  function siteFit(plan) {
    if (state.land === 'none') return .76;
    var margin = state.siteWidth - plan.footprintWidth;
    return clamp(.55 + margin * .16, .18, 1);
  }

  function floorFit(plan) {
    if (state.floorPreference === 'either') return 1;
    if (state.floorPreference === 'one') return plan.floors === 1 ? 1 : .45;
    return plan.floors === 2 ? 1 : .62;
  }

  function designFit(plan) {
    return plan.styles.indexOf(state.style) >= 0 ? 1 : .68;
  }

  function eligible(plan) {
    if (plan.price > state.budgetMax) return { ok:false, reason:'予算絶対上限超過' };
    if (plan.bedrooms < requiredBedrooms()) return { ok:false, reason:'必要居室数不足' };
    if (state.land !== 'none' && plan.footprintWidth > state.siteWidth + .6) return { ok:false, reason:'敷地間口に対して配置成立性が低い' };
    return { ok:true };
  }

  function scorePlan(plan, weights) {
    var e = eligible(plan);
    if (!e.ok) return { plan:plan, eligible:false, reason:e.reason };
    var s = {
      housework:plan.scores.housework, storage:plan.scores.storage, thermal:plan.scores.thermal,
      work:plan.scores.work, future:plan.scores.future, family:plan.scores.family,
      privacy:plan.scores.privacy, outdoor:plan.scores.outdoor, design:designFit(plan),
      budget:budgetFit(plan.price), site:siteFit(plan)
    };
    var base = 0;
    Object.keys(weights).forEach(function(k){ base += weights[k] * (s[k] || .5); });
    base *= floorFit(plan);

    var regret = 0;
    Object.keys(weights).forEach(function(k){ regret += weights[k] * (1 - (s[k] || .5)); });

    var criticalPenalty = 0;
    state.priorities.forEach(function(k,i){
      var threshold = i === 0 ? .64 : .55;
      if ((s[k] || .5) < threshold) criticalPenalty += (threshold - (s[k] || .5)) * (i === 0 ? .18 : .10);
    });

    if (state.laundry === 'compact') base += (plan.relations.laundryCloset || 0) * .035;
    if (state.laundry === 'night') base += plan.scores.housework * .018;
    if (state.lifestyle.indexOf('work') >= 0) base += plan.scores.work * .018;
    if (state.lifestyle.indexOf('garden') >= 0) base += plan.scores.outdoor * .018;

    var final = clamp(base - regret * .14 - criticalPenalty,0,1);
    var confidence = clamp((plan.verification * .42) + (plan.priceConfidence * .25) + ((state.land === 'none' ? .55 : .88) * .18) + ((state.priorities.length === 3 ? 1 : .7) * .15),0,1);
    var value = clamp(final - Math.max(0,plan.price - state.budgetIdeal) / 40,0,1);
    var comfort = clamp(.30*s.housework + .22*s.storage + .24*s.thermal + .12*s.family + .12*s.future,0,1);
    return { plan:plan, eligible:true, subscores:s, score:final, regret:regret, confidence:confidence, value:value, comfort:comfort };
  }

  function dominates(a,b) {
    var keys = ['score','value','comfort'];
    var ge = keys.every(function(k){ return a[k] >= b[k]; });
    var gt = keys.some(function(k){ return a[k] > b[k]; });
    return ge && gt;
  }

  function pareto(items) {
    return items.filter(function(a){ return !items.some(function(b){ return a !== b && dominates(b,a); }); });
  }

  function similarity(a,b) {
    var keys = ['housework','storage','thermal','work','future','family','privacy','outdoor'];
    var diff = keys.reduce(function(sum,k){ return sum + Math.abs(a.plan.scores[k] - b.plan.scores[k]); },0) / keys.length;
    return 1 - diff;
  }

  function pickDiverse(candidates, scorer, chosen) {
    var best = null, bestV = -999;
    candidates.forEach(function(c){
      if (chosen.indexOf(c) >= 0) return;
      var sim = chosen.length ? Math.max.apply(null, chosen.map(function(x){ return similarity(c,x); })) : 0;
      var v = scorer(c) * .84 - sim * .16;
      if (v > bestV) { bestV = v; best = c; }
    });
    return best;
  }

  function recommend() {
    var w = inferWeights();
    var all = DEMO_PLANS.map(function(p){ return scorePlan(p,w); });
    var valid = all.filter(function(x){ return x.eligible; }).sort(function(a,b){ return b.score-a.score; });
    var frontier = pareto(valid);
    var pool = frontier.length >= 4 ? frontier.concat(valid.filter(function(v){ return frontier.indexOf(v)<0; })) : valid;
    var chosen = [];
    var best = pickDiverse(pool,function(x){ return x.score; },chosen); if (best) chosen.push(best);
    var value = pickDiverse(pool,function(x){ return x.value; },chosen); if (value) chosen.push(value);
    var comfort = pickDiverse(pool,function(x){ return x.comfort; },chosen); if (comfort) chosen.push(comfort);
    var discovery = pickDiverse(pool,function(x){
      var novelty = (state.floorPreference !== 'either' && ((state.floorPreference==='one') !== (x.plan.floors===1))) ? .10 : 0;
      if (x.plan.styles.indexOf(state.style)<0) novelty += .05;
      return x.score + novelty;
    },chosen); if (discovery) chosen.push(discovery);

    var labels = ['BEST FIT','VALUE','COMFORT','DISCOVERY'];
    chosen.forEach(function(x,i){ x.kind = labels[i]; });
    state.results = chosen;
    state.allScored = all;
    state.weights = w;
    state.compare = chosen.slice(0,3).map(function(x){ return x.plan.id; });
    return chosen;
  }

  function factorLabel(k) {
    var m = {housework:'家事動線',storage:'収納',thermal:'温熱快適性',budget:'予算',work:'在宅勤務',family:'家族時間',future:'将来対応',privacy:'プライバシー',outdoor:'庭・外',design:'デザイン',site:'土地適合'};
    return m[k] || k;
  }

  function strongest(item) {
    return Object.keys(item.subscores).sort(function(a,b){ return item.subscores[b]-item.subscores[a]; }).slice(0,3);
  }

  function weakest(item) {
    return Object.keys(item.subscores).sort(function(a,b){ return item.subscores[a]-item.subscores[b]; }).slice(0,2);
  }

  function renderProfile() {
    var top = Object.keys(state.weights).sort(function(a,b){ return state.weights[b]-state.weights[a]; }).slice(0,4);
    $('mhp-profile').innerHTML =
      '<div><span>HOME PROFILE</span><h3>' + profileTitle(top) + '</h3><p>質問回答を「部屋が欲しい」ではなく、生活上の要求へ変換しました。</p></div>' +
      '<div class="mhp-profile-tags">' + top.map(function(k){ return '<span><b>' + factorLabel(k) + '</b><small>' + round(state.weights[k]*100) + '% weight</small></span>'; }).join('') + '</div>';
  }

  function profileTitle(top) {
    var names = top.map(factorLabel);
    return names[0] + ' × ' + names[1] + ' を中心にした暮らし';
  }

  function renderResults() {
    $('mhp-app').hidden = true;
    $('mhp-results').hidden = false;
    window.scrollTo({ top:$('mhp-results').offsetTop - 70, behavior:'smooth' });
    renderProfile();
    $('mhp-result-grid').innerHTML = state.results.map(function(r,i){ return resultCard(r,i); }).join('');
    bindResultEvents();
    renderCompare();
    renderSensitivity();
    var excluded = state.allScored.filter(function(x){ return !x.eligible; });
    $('mhp-excluded').textContent = excluded.length ? excluded.length + '件のデモプランをHard Constraintで除外しました。' : 'Hard Constraintで除外されたプランはありません。';
    track('mhp_recommendation_generated', { count:state.results.length, top_plan:state.results[0] ? state.results[0].plan.id : '' });
  }

  function resultCard(r,i) {
    var strong = strongest(r);
    var weak = weakest(r);
    return '<article class="mhp-result-card ' + (i===0?'is-best':'') + '">' +
      '<div class="mhp-result-top"><span class="mhp-kind">' + r.kind + '</span><span class="mhp-confidence">CONFIDENCE ' + (r.confidence>.88?'HIGH':r.confidence>.78?'MEDIUM':'LOW') + '</span></div>' +
      '<h3>' + r.plan.name + '</h3><p class="mhp-concept">' + r.plan.concept + '</p>' +
      '<div class="mhp-score-row"><div class="mhp-score"><strong>' + round(r.score*100) + '</strong><span>HOME FIT</span></div>' +
      '<div class="mhp-plan-meta"><span>' + r.plan.area.toFixed(1) + '㎡</span><span>' + r.plan.bedrooms + 'LDK相当</span><span>' + r.plan.price.toFixed(1) + '百万円</span></div></div>' +
      '<div class="mhp-mini-bars">' + strong.map(function(k){ return '<div><span>' + factorLabel(k) + '</span><i><b style="width:' + round(r.subscores[k]*100) + '%"></b></i><em>' + round(r.subscores[k]*100) + '</em></div>'; }).join('') + '</div>' +
      '<div class="mhp-reason"><b>合う理由</b><p>' + strong.map(function(k){ return factorLabel(k); }).join('・') + 'が、現在の優先順位と強く一致しています。</p></div>' +
      '<div class="mhp-tradeoff"><b>TRADE-OFF</b><p>' + weak.map(function(k){ return factorLabel(k); }).join('・') + 'は他候補より弱め。' + r.plan.tradeoffs[0] + '。</p></div>' +
      '<div class="mhp-card-actions"><button type="button" data-detail="' + r.plan.id + '">詳しく見る</button><label><input type="checkbox" data-compare="' + r.plan.id + '" ' + (state.compare.indexOf(r.plan.id)>=0?'checked':'') + '> 比較</label></div>' +
      '</article>';
  }

  function bindResultEvents() {
    document.querySelectorAll('[data-detail]').forEach(function(el){ el.addEventListener('click',function(){ openDetail(el.dataset.detail); });});
    document.querySelectorAll('[data-compare]').forEach(function(el){ el.addEventListener('change',function(){
      var id = el.dataset.compare, i = state.compare.indexOf(id);
      if (el.checked && i<0) {
        if (state.compare.length >= 3) { el.checked = false; toast('比較は3プランまでです'); return; }
        state.compare.push(id);
      } else if (!el.checked && i>=0) state.compare.splice(i,1);
      renderCompare();
      track('mhp_compare_change',{plan_id:id,selected:el.checked});
    });});
  }

  function openDetail(id) {
    var r = state.results.concat(state.allScored || []).find(function(x){ return x.plan && x.plan.id===id && x.eligible; });
    if (!r) return;
    var p = r.plan;
    var strong = strongest(r), weak = weakest(r);
    $('mhp-modal-title').textContent = p.name;
    $('mhp-modal-body').innerHTML =
      '<p class="mhp-modal-lead">' + p.concept + '</p>' +
      '<div class="mhp-modal-score"><strong>' + round(r.score*100) + '</strong><span>HOME FIT</span><em>' + p.price.toFixed(1) + '百万円 / ' + p.area.toFixed(1) + '㎡</em></div>' +
      '<h4>この家を上位にした理由</h4><ul>' + strong.map(function(k){ return '<li><b>' + factorLabel(k) + ' ' + round(r.subscores[k]*100) + '</b> — あなたの重み ' + round((state.weights[k]||0)*100) + '% と高い適合を確認。</li>'; }).join('') + '</ul>' +
      '<h4>妥協点</h4><ul>' + weak.map(function(k){ return '<li>' + factorLabel(k) + ' ' + round(r.subscores[k]*100) + '</li>'; }).join('') + p.tradeoffs.map(function(t){ return '<li>' + t + '</li>'; }).join('') + '</ul>' +
      '<h4>Plan Genome</h4><div class="mhp-genome">' + p.features.map(function(f){ return '<span>' + f + '</span>'; }).join('') + '</div>' +
      '<p class="mhp-modal-note">これは検証用デモプランです。実際の施工可否、法令、構造、価格、性能は導入住宅会社・建築士による正式確認が必要です。</p>';
    $('mhp-modal').showModal();
    track('mhp_plan_detail_open',{plan_id:id});
  }

  function renderCompare() {
    var rows = state.compare.map(function(id){ return state.results.find(function(r){ return r.plan.id===id; }); }).filter(Boolean);
    var target = $('mhp-compare');
    if (!rows.length) { target.innerHTML = '<p>比較したいプランを選んでください。</p>'; return; }
    var keys = ['score','housework','storage','thermal','work','future','budget','site'];
    target.innerHTML = '<div class="mhp-compare-table"><div class="mhp-compare-head"><span>指標</span>' + rows.map(function(r){ return '<b>' + r.plan.name + '</b>'; }).join('') + '</div>' +
      keys.map(function(k){
        var label = k==='score'?'HOME FIT':factorLabel(k);
        return '<div class="mhp-compare-row"><span>' + label + '</span>' + rows.map(function(r){ return '<b>' + round((k==='score'?r.score:r.subscores[k])*100) + '</b>'; }).join('') + '</div>';
      }).join('') + '<div class="mhp-compare-row"><span>概算比較価格</span>' + rows.map(function(r){ return '<b>' + r.plan.price.toFixed(1) + 'M</b>'; }).join('') + '</div></div>';
  }

  function renderSensitivity() {
    $('mhp-sensitivity').innerHTML =
      '<div><label>価格をもっと重視 <input id="mhp-budget-weight" type="range" min="0" max="20" value="0"></label>' +
      '<label>家事をもっと重視 <input id="mhp-housework-weight" type="range" min="0" max="20" value="0"></label></div>' +
      '<p id="mhp-sensitivity-note">条件を動かすと、推薦順位がどれだけ安定しているか確認できます。</p>';
    $('mhp-budget-weight').addEventListener('input', sensitivityRecalc);
    $('mhp-housework-weight').addEventListener('input', sensitivityRecalc);
  }

  function sensitivityRecalc() {
    var bw = Number($('mhp-budget-weight').value)/100;
    var hw = Number($('mhp-housework-weight').value)/100;
    var w = Object.assign({},state.weights);
    w.budget += bw; w.housework += hw;
    var sum = Object.keys(w).reduce(function(a,k){ return a+w[k]; },0);
    Object.keys(w).forEach(function(k){ w[k]/=sum; });
    var ranked = DEMO_PLANS.map(function(p){ return scorePlan(p,w); }).filter(function(x){return x.eligible;}).sort(function(a,b){return b.score-a.score;});
    var before = state.results[0] ? state.results[0].plan.id : '';
    var after = ranked[0] ? ranked[0].plan.id : '';
    $('mhp-sensitivity-note').innerHTML = before===after ?
      '<strong>推薦は安定しています。</strong> 重みを変えても1位は ' + after + ' のままです。' :
      '<strong>推薦順位が変わりました。</strong> 価格・家事の優先度次第で1位は ' + after + ' になります。';
  }

  function toast(msg) {
    var t = $('mhp-toast');
    t.textContent = msg;
    t.classList.add('is-visible');
    clearTimeout(window.__mhpToast);
    window.__mhpToast = setTimeout(function(){ t.classList.remove('is-visible'); },1800);
  }

  function saveResult() {
    var payload = { savedAt:new Date().toISOString(), answers:state, recommendations:state.results.map(function(r){return {id:r.plan.id,fit:round(r.score*100),kind:r.kind};}) };
    try { localStorage.setItem('mhp-demo-result',JSON.stringify(payload)); toast('この端末に診断結果を保存しました'); track('mhp_result_saved'); }
    catch(e){ toast('保存できませんでした'); }
  }

  function restart() {
    state.step = 0;
    $('mhp-results').hidden = true;
    $('mhp-app').hidden = false;
    renderStep();
    window.scrollTo({top:$('mhp-app').offsetTop-70,behavior:'smooth'});
    track('mhp_restart');
  }

  function init() {
    $('mhp-start').addEventListener('click',function(){
      $('mhp-intro').hidden = true;
      $('mhp-app').hidden = false;
      renderStep();
      window.scrollTo({top:$('mhp-app').offsetTop-70,behavior:'smooth'});
      track('mhp_started');
    });
    $('mhp-back').addEventListener('click',function(){ if(state.step>0){state.step--;renderStep();} });
    $('mhp-next').addEventListener('click',function(){
      var err = validateStep();
      if (err) { $('mhp-message').textContent = err; return; }
      if (state.step < steps.length-1) { state.step++; renderStep(); }
      else { recommend(); renderResults(); }
    });
    $('mhp-save').addEventListener('click',saveResult);
    $('mhp-restart').addEventListener('click',restart);
    $('mhp-modal-close').addEventListener('click',function(){ $('mhp-modal').close(); });
    $('mhp-modal').addEventListener('click',function(e){ if(e.target===$('mhp-modal')) $('mhp-modal').close(); });
    track('mhp_view');
  }

  document.addEventListener('DOMContentLoaded',init);
})();
