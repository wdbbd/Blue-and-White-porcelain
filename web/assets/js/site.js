/* ============================================================
   共用模块· 导航栏 + 页脚 + 工具函数
   ------------------------------------------------------------
   ⚠️ 三位成员都不要改这个文件。
   页面只需一行：<script src=".../assets/js/site.js"></script>
   它会自动读取 site.config.js 画出导航。
   ============================================================ */
(function () {
  'use strict';

  // 自动判断当前页面在第几层，用来算相对路径
  function depth() {
    var p = location.pathname;
    return (p.match(/\/modules\/[^/]+\//) || ['']).length ? 2 : 1;
  }
  function root() { return depth() === 2 ? '../../' : './'; }

  /* ---------------- 导航栏 ---------------- */
  function buildNav() {
    var cfg = window.SITE; if (!cfg) return;
    var R = root();
    var cur = document.body.dataset.page || '';

    var links = cfg.nav.map(function (n) {
      var on = n.id === cur;
      return '<a class="nav-l' + (on ? ' on' : '') + '" href="' + R + n.href.replace(/^\.\.\//, '') + '"' +
        (on ? ' aria-current="page"' : '') + '>' +
        '<span class="nav-cn">' + n.text + '</span>' +
        '<span class="nav-en">' + n.en + '</span>' +
        '</a>';
    }).join('');

    var html =
      '<header class="nav" id="nav">' +
        '<div class="nav-in wrap">' +
          '<a class="brand" href="' + R + 'index.html">' +
            '<span class="brand-cn">' + cfg.name + '</span>' +
            '<span class="brand-en">' + cfg.sub + '</span>' +
          '</a>' +
          '<nav class="nav-list">' + links + '</nav>' +
          '<button class="burger" id="burger" aria-label="菜单" aria-expanded="false"><span></span><span></span><span></span></button>' +
        '</div>' +
      '</header>';

    document.body.insertAdjacentHTML('afterbegin', html);

    // 移动端折叠
    var b = document.getElementById('burger'), list = document.querySelector('.nav-list');
    if (b) b.addEventListener('click', function () {
      var open = list.classList.toggle('open');
      b.classList.toggle('on', open);
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* ---------------- 页脚 ---------------- */
  function buildFoot() {
    var cfg = window.SITE; if (!cfg) return;
    var R = root();
    var html =
      '<footer class="foot"><div class="wrap foot-in">' +
        '<div>' +
          '<div class="foot-t">' + cfg.foot.line1 + '</div>' +
          '<div class="foot-s">' + cfg.foot.line2 + '</div>' +
        '</div>' +
        '<div class="foot-s">' + cfg.tagline + '</div>' +
      '</div></footer>';
    document.body.insertAdjacentHTML('beforeend', html);
  }

  /* ---------------- 滚动时导航栏状态 ---------------- */
  function navScroll() {
    var n = document.getElementById('nav');
    if (!n) return;
    var last = 0;
    function onScroll() {
      var y = window.scrollY;
      n.classList.toggle('solid', y > 40);
      n.classList.toggle('hidden', y > last && y > 260);
      last = y;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------------- 滚动入场动画 ---------------- */
  function reveal() {
    var els = document.querySelectorAll('.reveal');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) {
      els.forEach(function (e) { e.classList.add('in'); }); return;
    }
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en, i) {
        if (en.isIntersecting) {
          var d = parseFloat(en.target.dataset.delay || (i * 70));
          setTimeout(function () { en.target.classList.add('in'); }, d);
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    els.forEach(function (e) { io.observe(e); });
  }

  /* ---------------- 图片灯箱 ---------------- */
  function lightbox() {
    var box = document.createElement('div');
    box.className = 'lb';
    box.innerHTML = '<img alt=""><div class="lb-cap"></div>';
    document.body.appendChild(box);
    var im = box.querySelector('img'), cap = box.querySelector('.lb-cap');

    window.openLB = function (src, text) {
      im.src = src; cap.textContent = text || '';
      box.classList.add('on');
      document.body.style.overflow = 'hidden';
    };
    box.addEventListener('click', function () {
      box.classList.remove('on');
      document.body.style.overflow = '';
      setTimeout(function () { im.src = ''; }, 250);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && box.classList.contains('on')) box.click();
    });
  }

  /* ---------------- 工具 ---------------- */
  window.$ = function (s, r) { return (r || document).querySelector(s); };
  window.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  window.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  window.ROOT = root;
  window.esc;

  /* ---------------- 启动 ---------------- */
  function boot() { buildNav(); buildFoot(); navScroll(); reveal(); lightbox(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();