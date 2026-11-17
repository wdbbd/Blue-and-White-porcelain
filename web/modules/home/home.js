/* ============================================================
   首页逻辑 · 【成员 A 负责】
   数据在 assets/data/masters.js，这里只负责渲染。
   ============================================================ */

/* ---------- 首屏梅瓶 SVG ---------- */
(function vase() {
  var el = document.getElementById('heroVase');
  if (!el) return;
  el.innerHTML =
    '<svg viewBox="0 0 240 340" fill="none">' +
      '<defs>' +
        '<linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e3eef0"/>' +
        '</linearGradient>' +
        '<linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="#4a76b8"/><stop offset="1" stop-color="#22456e"/>' +
        '</linearGradient>' +
      '</defs>' +
      // 瓶身
      '<path d="M120 26c-16 0-27 6-27 13 0 5 4 9 10 12-30 9-49 33-49 66 0 42 22 74 30 95 5 13 8 30 8 44 0 12-4 20-10 27h116c-6-7-10-15-10-27 0-14 3-31 8-44 8-21 30-53 30-95 0-33-19-57-49-66 6-3 10-7 10-12 0-7-11-13-27-13z" fill="url(#g1)" stroke="#cfd8d6" stroke-width="1.2"/>' +
      // 口沿
      '<ellipse cx="120" cy="39" rx="27" ry="7" fill="#f4f8f8" stroke="#c6d2d0" stroke-width="1.2"/>' +
      // 瓶颈装饰
      '<path d="M104 62h32M107 72h26" stroke="url(#g2)" stroke-width="2" stroke-linecap="round" opacity=".8"/>' +
      // 肩部回纹带
      '<path d="M74 108c14-8 30-12 46-12s32 4 46 12" stroke="url(#g2)" stroke-width="2.4" opacity=".78"/>' +
      // 腹部缠枝主纹
      '<g stroke="url(#g2)" stroke-width="2.1" fill="none" opacity=".72" stroke-linecap="round">' +
        '<path d="M78 140c14 10 26-6 40 2s22 18 44 8"/>' +
        '<path d="M80 168c16-12 28 8 42-2s24-16 42-6"/>' +
        '<path d="M82 196c14 10 28-6 40 2s24 14 40 6"/>' +
      '</g>' +
      // 胭脂点
      '<circle cx="98" cy="128" r="3.4" fill="#a8323c" opacity=".62"/>' +
      '<circle cx="142" cy="184" r="3" fill="#a8323c" opacity=".55"/>' +
      '<circle cx="112" cy="220" r="2.6" fill="#a8323c" opacity=".5"/>' +
      // 胫部蕉叶纹
      '<g stroke="url(#g2)" stroke-width="1.8" fill="none" opacity=".6" stroke-linecap="round">' +
        '<path d="M104 254l8 26M120 252v30M136 254l-8 26"/>' +
      '</g>' +
      // 高光
      '<path d="M92 76c-9 14-13 32-13 52 0 30 8 54 14 72" stroke="#fff" stroke-width="5" opacity=".55" stroke-linecap="round"/>' +
    '</svg>';
})();

/* ---------- 青花工艺四步 ---------- */
var CRAFT = [
  { no: '其一·制胎', t: '选泥拉坯', d: '高岭土与瓷石按比例调和，陈腐后练泥。拉坯成型，晾干后旋削修坯，使器壁厚薄均匀。' },
  { no: '其二·绘青', t: '勾线分水', d: '用钴料在素坯上分三层作画：浓料勾线，浓淡料分水， glaze 料点缀。笔锋转折全在腕上。' },
  { no: '其三·施釉', t: '罩透明釉', d: '浸釉、吹釉或荡釉，让透明釉薄薄覆盖坯体。釉层厚薄不均，青色便会深浅有别。' },
  { no: '其四·焙烧', t: '高温入窑', d: '窑温一千三百度以上，钴料在还原焰中发色，青白相映，青花由此而生。' },
];

(function craft() {
  var box = document.getElementById('craftSteps');
  if (!box) return;
  box.innerHTML = CRAFT.map(function (s, i) {
    return '<div class="step reveal" data-delay="' + i * 80 + '">' +
      '<div class="step-no">' + s.no + '</div>' +
      '<h4>' + s.t + '</h4>' +
      '<p>' + s.d + '</p>' +
    '</div>';
  }).join('');
  if (window.IntersectionObserver) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e, i) {
        if (e.isIntersecting) {
          setTimeout(function () { e.target.classList.add('in'); }, parseFloat(e.target.dataset.delay || 0));
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    $$('.step', box).forEach(function (e) { io.observe(e); });
  }
})();

/* ---------- 匠人 ---------- */
(function masters() {
  var box = document.getElementById('masters');
  if (!box || !window.DATA_MASTERS) return;
  var list = DATA_MASTERS;

  box.innerHTML = list.map(function (m, i) {
    return '<article class="m-card reveal" data-i="' + i + '" data-delay="' + (i % 3) * 80 + '" tabindex="0">' +
      '<div class="m-photo"><img src="assets/' + m.thumb + '" alt="' + esc(m.name) + '" loading="lazy"></div>' +
      '<div class="m-info">' +
        '<div class="m-name">' + esc(m.name) + '</div>' +
        '<div class="m-title">' + esc(m.title) + '</div>' +
        '<p class="m-sum">' + esc(m.summary) + '</p>' +
        '<span class="m-tag">' + esc(m.tag) + '</span>' +
      '</div>' +
    '</article>';
  }).join('');

  // 弹窗
  var mo = document.createElement('div');
  mo.className = 'm-modal';
  mo.innerHTML = '<div class="m-modal-in">' +
      '<button class="m-modal-close" aria-label="关闭">×</button>' +
      '<div class="m-modal-body">' +
        '<div class="m-modal-photo"><img alt=""></div>' +
        '<div class="m-modal-txt">' +
          '<h3 class="mm-name"></h3>' +
          '<div class="mm-title"></div>' +
          '<div class="mm-story m-story"></div>' +
          '<div class="m-quote mm-quote"></div>' +
          '<div class="mm-kw m-kw"></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(mo);

  function open(i) {
    var m = list[i]; if (!m) return;
    var img = mo.querySelector('.m-modal-photo img');
    img.src = 'assets/' + m.img; img.alt = m.name;
    mo.querySelector('.mm-name').textContent = m.name;
    mo.querySelector('.mm-title').textContent = m.title + ' · ' + m.tag;
    mo.querySelector('.m-story').innerHTML =
      (m.story || []).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
    mo.querySelector('.mm-quote').textContent = m.quote || '';
    mo.querySelector('.m-kw').innerHTML =
      (m.keywords || []).map(function (k) { return '<span class="tag">' + esc(k) + '</span>'; }).join('');
    mo.classList.add('on');
    document.body.style.overflow = 'hidden';
  }
  function close() { mo.classList.remove('on'); document.body.style.overflow = ''; }

  box.addEventListener('click', function (e) {
    var c = e.target.closest('.m-card'); if (c) open(+c.dataset.i);
  });
  box.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var c = e.target.closest('.m-card'); if (c) open(+c.dataset.i);
  });
  mo.addEventListener('click', function (e) {
    if (e.target === mo || e.target.classList.contains('m-modal-close')) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && mo.classList.contains('on')) close();
  });

  // 入场
  if (window.IntersectionObserver) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) {
          setTimeout(function () { e.target.classList.add('in'); }, parseFloat(e.target.dataset.delay || 0));
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.08 });
    $$('.m-card', box).forEach(function (e) { io.observe(e); });
  }
})();