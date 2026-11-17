/* ============================================================
   时间长廊· 逻辑 · 【成员 B 负责】
   数据在 eras.js + assets/data/manifest.json
   ============================================================ */

(function () {
  'use strict';

  var eras = (window.DATA_ERAS || []).slice().sort(function (a, b) { return a.order - b.order; });
  var gate = document.getElementById('gate');
  var corridor = document.getElementById('corridor');
  var erasBox = document.getElementById('eras');
  var track = document.getElementById('rulerTrack');
  if (!erasBox || !eras.length) return;

  var IMGBASE = '../../assets/';   // manifest 里的路径相对于 assets/
  var man = null;                  // 素材清单

  /* ---------- 从 manifest 里按朝代关键词取图 ---------- */
  function pick(eraId, limit) {
    var era = eras.filter(function (e) { return e.id === eraId; })[0];
    if (!era || !man) return [];
    var keys = era.match || [];
    var pats = [], shapes = [];
    var i, it;

    for (i = 0; i < man.patterns.length && pats.length < limit; i++) {
      it = man.patterns[i];
      if (keys.some(function (k) { return it.era.indexOf(k) >= 0; })) {
        pats.push({ kind: '纹样', name: it.name, sub: it.era, img: it.thumb, full: it.img });
      }
    }
    for (i = 0; i < man.shapes.length && shapes.length < limit; i++) {
      it = man.shapes[i];
      if (keys.some(function (k) { return it.dynasty.indexOf(k) >= 0; })) {
        shapes.push({ kind: it.cat, name: it.name, sub: it.dynasty, img: it.thumb, full: it.img });
      }
    }
    // 纹样和器物交错排列，视觉上更有节奏
    var out = [], a = 0, b = 0;
    while (out.length < limit && (a < pats.length || b < shapes.length)) {
      if (a < pats.length) out.push(pats[a++]);
      if (b < shapes.length && out.length < limit) out.push(shapes[b++]);
    }
    return out;
  }

  /* ---------- 渲染 ---------- */
  function render() {
    eras.forEach(function (era, i) {
      var items = pick(era.id, 8);
      var sec = document.createElement('section');
      sec.className = 'era reveal';
      sec.id = 'era-' + era.id;
      sec.style.setProperty('--tone', era.tone || '#7a9e9e');
      sec.dataset.delay = 0;

      var sc = items.map(function (it) {
        return '<figure class="sc" data-src="' + esc(IMGBASE + it.full) + '" ' +
          'data-name="' + esc(it.name) + '" data-kind="' + esc(it.kind) + '" data-sub="' + esc(it.sub) + '">' +
          '<img src="' + esc(IMGBASE + it.img) + '" alt="' + esc(it.name) + '" loading="lazy">' +
          '<span class="sc-kind">' + esc(it.kind) + '</span>' +
          '<figcaption class="sc-cap">' + esc(it.name) + '</figcaption>' +
        '</figure>';
      }).join('');

      var crafts = (era.craft || []).map(function (c) {
        return '<div class="craft">' +
          '<div class="craft-t">' + esc(c.t) + '</div>' +
          '<p class="craft-d">' + esc(c.d) + '</p>' +
        '</div>';
      }).join('');

      sec.innerHTML =
        '<div class="era-head">' +
          '<div class="era-no">第 ' + (i + 1) + ' 站</div>' +
          '<h2 class="era-t">' + esc(era.name) + '</h2>' +
          '<div class="era-span">' + esc(era.span) + '</div>' +
          '<p class="era-intro">' + esc(era.intro) + '</p>' +
        '</div>' +
        '<div class="era-body">' +
          '<div class="wall-l">' +
            '<div class="wall-t">纹样与器物<small>' + items.length + ' 件</small></div>' +
            (sc ? '<div class="showcase">' + sc + '</div>'
                : '<div class="empty">该时期展品整理中</div>') +
          '</div>' +
          '<div class="wall-r">' +
            '<div class="wall-t">主要工艺<small>' + (era.craft || []).length + ' 项</small></div>' +
            '<div class="crafts">' + crafts + '</div>' +
          '</div>' +
        '</div>';

      erasBox.appendChild(sec);
    });

    // 刻度尺节点
    track.innerHTML = eras.map(function (e) {
      return '<button class="r-node" data-go="era-' + e.id + '">' +
        '<span class="r-dot"></span>' +
        '<span class="r-name">' + esc(e.name) + '</span>' +
        '<span class="r-span">' + esc(e.span.split('—')[0].trim()) + '</span>' +
      '</button>';
    }).join('');

    // 修复：.era 区块是异步渲染后才插入的，site.js 的 reveal 观察不到，
    // 这里自行观察，滚动到位时加入 .in 触发入场动画，否则永远 opacity:0。
    if ('IntersectionObserver' in window) {
      var rio = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add('in');
            rio.unobserve(en.target);
          }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
      $$('.era', erasBox).forEach(function (s) { rio.observe(s); });
    } else {
      $$('.era', erasBox).forEach(function (s) { s.classList.add('in'); });
    }
  }

  /* ---------- 刻度尺联动 ---------- */
  function bindRuler() {
    track.addEventListener('click', function (e) {
      var n = e.target.closest('[data-go]');
      if (!n) return;
      var t = document.getElementById(n.dataset.go);
      if (t) window.scrollTo({ top: t.offsetTop - 130, behavior: 'smooth' });
    });

    var nodes = $$('.r-node', track);
    var secs = $$('.era', erasBox);
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (en.isIntersecting) {
          nodes.forEach(function (n) {
            n.classList.toggle('on', n.dataset.go === en.target.id);
          });
        }
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    secs.forEach(function (s) { io.observe(s); });
  }

  /* ---------- 展品详情 ---------- */
  function detail() {
    var dm = document.createElement('div');
    dm.className = 'dm';
    dm.innerHTML = '<div class="dm-in">' +
        '<button class="dm-close" aria-label="关闭">×</button>' +
        '<div class="dm-photo"><img alt=""></div>' +
        '<div class="dm-txt">' +
          '<h3 class="dm-name"></h3>' +
          '<div class="dm-meta"></div>' +
          '<div class="dm-ctx"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dm);

    function show(d) {
      dm.querySelector('.dm-photo img').src = d.src;
      dm.querySelector('.dm-name').textContent = d.name;
      dm.querySelector('.dm-meta').innerHTML =
        '<span class="tag">' + esc(d.kind) + '</span>' +
        '<span class="tag">' + esc(d.sub) + '</span>';
      dm.querySelector('.dm-ctx').innerHTML =
        '<b>' + esc(d.kind) + '</b> · ' + esc(d.sub) + '　这件' +
        (d.kind === '纹样' ? '纹样' : '器物') +
        '属于' + esc(d.sub) + '，点击图片可放大查看。';
      dm.classList.add('on');
      document.body.style.overflow = 'hidden';
    }
    function close() { dm.classList.remove('on'); document.body.style.overflow = ''; }

    erasBox.addEventListener('click', function (e) {
      var f = e.target.closest('.sc');
      if (f) show(f.dataset);
    });
    dm.addEventListener('click', function (e) {
      if (e.target === dm || e.target.classList.contains('dm-close')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && dm.classList.contains('on')) close();
    });
  }

  /* ---------- 入口 ---------- */
  function enter() {
    gate.classList.add('hide');
    setTimeout(function () { gate.hidden = true; }, 600);
    corridor.hidden = false;
    setTimeout(function () { window.scrollTo({ top: 0 }); }, 620);
  }

  /* ---------- 启动 ---------- */
  fetch('../../assets/data/manifest.json')
    .then(function (r) { return r.json(); })
    .then(function (d) { man = d; })
    .catch(function () { man = null; })
    .then(function () {
      render();
      bindRuler();
      detail();
    });

  var eb = document.getElementById('enterBtn');
  if (eb) eb.addEventListener('click', enter);
  var bt = document.getElementById('backTop');
  if (bt) bt.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
})();