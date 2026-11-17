/* ============================================================
   资料库 · 逻辑 · 【成员 D 负责】
   ============================================================ */

(function () {
  'use strict';

  var man = null;
  var items = [];        // 统一的检索条目
  var f = { type: 'all', era: 'all', q: '' };
  var PAGE = 48;            // 每页 6 列 × 8 行 = 48 条
  var pageAll = 1;          // 「全部资料」当前页
  var pageResults = 1;      // 检索结果当前页
  var aiBox = null;

  var TYPES = [
    { k: 'all', n: '全部' },
    { k: '纹样', n: '纹样' },
    { k: '瓶类', n: '瓶' }, { k: '碗类', n: '碗' }, { k: '罐类', n: '罐' },
    { k: '壶类', n: '壶' }, { k: '盘类', n: '盘' }, { k: '杯盏类', n: '杯盏' },
    { k: '文房类', n: '文房' }, { k: '杂项供器', n: '杂项' },
    { k: '匠人', n: '匠人' },
  ];

  /* ---------- 载入 ----------
     正常走 http 服务时读 manifest.json；双击用 file:// 直开时 fetch 会被
     浏览器拦截，退回 manifest.js 里的同一份数据，页面不至于一片空白。 */
  function boot(d) {
    man = d;
    if (!man || !man.patterns || !man.shapes) return;
    build();
    document.getElementById('aCount').textContent = items.length;
    /* 筛选栏原来只在检索后才渲染，初次进页面按钮区是空的、整栏还 hidden。
       数据在手就渲染并常驻，用户不必先搜一次才能筛选。 */
    filters();
    document.getElementById('filters').hidden = false;
    // 清单可能晚于 DOMContentLoaded 到达，这里统一渲染一次（默认第一页）
    renderAll();
  }
  fetch('../../assets/data/manifest.json')
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(boot)
    .catch(function () {
      if (window.LIB_MANIFEST) boot(window.LIB_MANIFEST);
      else document.getElementById('aCount').textContent = '—';
    });

  /* ---------- 把素材整理成统一条目 ---------- */
  /* 器物数据里朝代写的是「元」「明」「清」「现」，纹样写的是「元代」「明·永宣…」。
     检索时补上「元代」「现代」这类说法，搜「元代梅瓶」才找得到元青花梅瓶。 */
  function eraWords(d) {
    d = String(d || '');
    if (!d) return '';
    if (d.length > 1) return d;      // 民国 / 现代 / 元代 …
    return d + '代';                  // 元 → 元代，现 → 现代
  }

  function build() {
    var IMGB = '../../assets/';
    items = [];
    man.patterns.forEach(function (p) {
      /* 有 8 张纹样入库时文件名是下载哈希，直接显示会变成一串乱码字母 */
      var hashName = /^[0-9a-f]{24,}$/i.test(p.name);
      items.push({
        kind: '纹样', title: hashName ? '参考纹样' : p.name, meta: p.era,
        img: IMGB + p.thumb, full: IMGB + p.img,
        desc: p.era + '时期的代表性纹样。', dynasty: p.era,
        keywords: eraWords(p.era),
      });
    });
    man.shapes.forEach(function (s) {
      var key = s.cat.replace(/\s+/g, '');
      items.push({
        kind: s.cat, typeKey: key, title: s.name, meta: s.dynasty + ' · ' + s.cat,
        img: IMGB + s.thumb, full: IMGB + s.img,
        desc: s.dynasty + s.cat + '，纹样与器型俱备。', dynasty: s.dynasty,
        keywords: eraWords(s.dynasty),
      });
    });
    (window.DATA_MASTERS || []).forEach(function (m) {
      items.push({
        kind: '匠人', title: m.name, meta: m.title + ' · ' + m.tag,
        img: IMGB + m.thumb, full: IMGB + m.img,
        desc: m.summary, keywords: (m.keywords || []).join(' '), master: m,
      });
    });
  }

  /* ---------- 工具 ---------- */
  function hay(i) {
    return (i.title + ' ' + i.meta + ' ' + i.desc + ' ' + (i.keywords || '')).toLowerCase();
  }

  /* 检索词：英文/数字按词切，中文先按整段，整段查不到时再用二字组合兜底。
     这样「康熙青花」「元代梅瓶」这种没有连续出处的短语也能命中，
     单个汉字（如「元」）也不会再被当成空条件把全库放出来。 */
  function termsOf(q) {
    var raw = String(q || '').toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fa5]+/g) || [];
    var words = [], grams = [];
    raw.forEach(function (t) {
      words.push(t);
      if (!/^[a-z0-9]+$/.test(t) && t.length > 1) {
        for (var i = 0; i < t.length - 1; i++) grams.push(t.substr(i, 2));
      }
    });
    return { words: words, grams: grams };
  }

  function passFilter(i) {
    /* 关键词检索只找纹样 / 器物，不再混入匠人；要看匠人请点「匠人」分类 */
    if (f.q && i.kind === '匠人' && f.type !== '匠人') return false;
    if (f.type === '纹样' && i.kind !== '纹样') return false;
    /* 原来「匠人」这一档没有任何过滤条件，等于把全库 422 条都放出来 */
    if (f.type === '匠人' && i.kind !== '匠人') return false;
    if (f.type === '杂项供器' && i.typeKey !== '杂项供器类') return false;
    if (f.type !== 'all' && f.type !== '纹样' && f.type !== '杂项供器' && f.type !== '匠人') {
      if (i.typeKey !== f.type) return false;
    }
    if (f.era !== 'all' && eraGroup(i.dynasty) !== f.era) return false;
    return true;
  }

  function match() {
    var pool = items.filter(passFilter);
    var q = String(f.q || '').toLowerCase().trim();
    if (!q) return pool;

    var tk = termsOf(q);
    var hit = pool.filter(function (i) {
      var h = hay(i);
      return tk.words.every(function (t) { return h.indexOf(t) >= 0; });
    });
    if (hit.length || !tk.grams.length) return hit;

    /* 整段没命中：按二字组合覆盖率兜底（至少命中六成，且不少于 2 个） */
    var need = Math.max(2, Math.ceil(tk.grams.length * 0.6));
    return pool.filter(function (i) {
      var h = hay(i), n = 0;
      for (var k = 0; k < tk.grams.length; k++) {
        if (h.indexOf(tk.grams[k]) >= 0) n++;
      }
      return n >= need;
    });
  }

  /* ---------- 卡片 ---------- */
  function card(i, delay) {
    return '<figure class="r-card" data-full="' + esc(i.full) + '" data-title="' + esc(i.title) +
      '" data-meta="' + esc(i.meta) + '" data-desc="' + esc(i.desc) + '" style="transition-delay:' + (delay || 0) + 'ms">' +
      '<div class="r-thumb"><img src="' + esc(i.img) + '" alt="' + esc(i.title) + '" loading="lazy">' +
        '<span class="r-kind">' + esc(i.kind === '匠人' ? '匠人' : (i.meta.split(' · ')[0] || i.kind)) + '</span>' +
      '</div>' +
      '<figcaption class="r-cap"><b>' + esc(i.title) + '</b><span>' + esc(i.meta) + '</span></figcaption>' +
    '</figure>';
  }

  function bindCards(box) {
    box.addEventListener('click', function (e) {
      var c = e.target.closest('.r-card'); if (!c) return;
      var m = window.DATA_MASTERS || [];
      var found = m.filter(function (x) { return x.name === c.dataset.title; })[0];
      if (found) { openMaster(found); return; }
      openLB(c.dataset.full, c.dataset.title + '　' + c.dataset.meta);
    });
  }

  /* ---------- 匠人详情 ---------- */
  function openMaster(m) {
    if (!aiBox) {
      aiBox = document.createElement('div');
      aiBox.className = 'master-pop';
      document.body.appendChild(aiBox);
      bindCards(aiBox);
    }
    aiBox.innerHTML =
      '<div class="mp-mask"></div>' +
      '<div class="mp-in">' +
        '<button class="mp-x" aria-label="关闭">×</button>' +
        '<div class="mp-body">' +
          '<div class="mp-photo"><img src="../../assets/' + esc(m.img) + '" alt="' + esc(m.name) + '"></div>' +
          '<div class="mp-txt">' +
            '<h3>' + esc(m.name) + '</h3>' +
            '<div class="mp-title">' + esc(m.title) + ' · ' + esc(m.tag) + '</div>' +
            '<div class="mp-story">' + (m.story || []).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div>' +
            '<div class="m-quote">' + esc(m.quote || '') + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    aiBox.classList.add('on');
    document.body.style.overflow = 'hidden';
    aiBox.querySelector('.mp-mask').onclick = closeMaster;
    aiBox.querySelector('.mp-x').onclick = closeMaster;
    aiBox.querySelector('.mp-photo img').onclick = function () {
      openLB('../../assets/' + m.img, m.name);
    };
    function closeMaster() { aiBox.classList.remove('on'); document.body.style.overflow = ''; }
  }
  document.addEventListener('keydown', function (e) {
    /* 原来 aiBox.click() 的事件目标是容器本身，绑在 .mp-mask/.mp-x 上的
       关闭函数根本收不到，Esc 关不掉弹窗；这里直接收起。 */
    if (e.key === 'Escape' && aiBox && aiBox.classList.contains('on')) {
      aiBox.classList.remove('on');
      document.body.style.overflow = '';
    }
  });

  /* ---------- 筛选 ----------
     朝代统一归并成七个大朝代：数据里纹样写「元代」「明·永宣(永乐、宣德)」，
     器物写「元」「明」「现」，混在一起会出现「元 / 元代」「现代 / 现」两组
     看着重复、实际各查一半的按钮。这里按大朝代归类，一个朝代只留一个入口。 */
  var ERAS = [
    { k: '唐', n: '唐' }, { k: '宋', n: '宋' }, { k: '元', n: '元' },
    { k: '明', n: '明' }, { k: '清', n: '清' }, { k: '民国', n: '民国' },
    { k: '现代', n: '现代' }
  ];

  function eraGroup(d) {
    d = String(d || '');
    if (d.indexOf('民国') >= 0) return '民国';
    if (d.indexOf('唐') >= 0) return '唐';
    if (d.indexOf('宋') >= 0) return '宋';
    if (d.indexOf('元') >= 0) return '元';
    if (d.indexOf('明') >= 0) return '明';
    if (d.indexOf('清') >= 0) return '清';
    if (d.indexOf('现') >= 0) return '现代';
    return '';
  }

  function filters() {
    document.getElementById('fType').innerHTML = TYPES.map(function (t) {
      return '<button class="fg' + (f.type === t.k ? ' on' : '') + '" data-k="' + t.k + '" data-f="type">' + t.n + '</button>';
    }).join('');

    var counts = {};
    items.forEach(function (i) {
      var g = eraGroup(i.dynasty);
      if (g) counts[g] = (counts[g] || 0) + 1;
    });
    var eras = ERAS.filter(function (e) { return counts[e.k]; });
    document.getElementById('fEra').innerHTML =
      '<button class="fg' + (f.era === 'all' ? ' on' : '') + '" data-k="all" data-f="era">全部朝代</button>' +
      eras.map(function (e) {
        return '<button class="fg' + (f.era === e.k ? ' on' : '') + '" data-k="' + e.k + '" data-f="era" title="' + counts[e.k] + ' 条">' + e.n + '</button>';
      }).join('');
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('.fg'); if (!b) return;
    f[b.dataset.f] = b.dataset.k;
    run(true);
  });

  document.getElementById('fClear').addEventListener('click', function () {
    f = { type: 'all', era: 'all', q: '' };
    document.getElementById('q').value = '';
    pageResults = 1; pageAll = 1;
    showAll();          // 清空后回到「全部资料」，而不是停在空筛选的结果页
  });

  /* ---------- 检索结果渲染（带分页） ---------- */
  function renderResults() {
    var list = match();
    var box = document.getElementById('rGrid');
    var total = Math.ceil(list.length / PAGE) || 1;
    if (pageResults > total) pageResults = total;
    if (pageResults < 1) pageResults = 1;
    var start = (pageResults - 1) * PAGE;
    box.innerHTML = list.slice(start, start + PAGE).map(function (i, k) { return card(i, (k % 8) * 40); }).join('');
    if (!box.dataset.bound) { bindCards(box); box.dataset.bound = '1'; }
    buildPager(document.getElementById('rPager'), total, pageResults, function (p) {
      pageResults = p; renderResults();
      document.getElementById('rGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* ---------- 检索 ---------- */
  function run(force) {
    if (force) pageResults = 1;        // 新检索 / 换筛选，回到第一页
    var list = match();
    document.getElementById('filters').hidden = false;
    document.getElementById('results').hidden = false;
    document.getElementById('all').hidden = true;

    document.getElementById('fCount').textContent =
      '共 ' + list.length + ' 条结果' + (f.q ? '（关键词：' + f.q + '）' : '');
    document.getElementById('rEmpty').hidden = list.length > 0;

    filters();
    renderResults();
    window.scrollTo({ top: Math.min(document.getElementById('filters').offsetTop - 90, 4000), behavior: 'smooth' });
  }

  /* ---------- 顶部检索 ---------- */
  var input = document.getElementById('q');
  function doSearch() {
    f.q = input.value.trim();
    if (!f.q) { showAll(); return; }
    run(true);
  }
  document.getElementById('qBtn').addEventListener('click', doSearch);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch(); });

  /* ---------- 热门关键词 ---------- */
  (function chips() {
    var HOT = ['梅瓶', '玉壶春瓶', '元青花', '康熙', '缠枝莲', '云龙纹', '天球瓶', '执壶', '山水', '婴戏'];
    document.getElementById('chips').innerHTML =
      '<span class="ch-l">热门：</span>' +
      HOT.map(function (h) { return '<button class="ch" data-h="' + h + '">' + h + '</button>'; }).join('');
    document.getElementById('chips').addEventListener('click', function (e) {
      var b = e.target.closest('.ch'); if (!b) return;
      input.value = b.dataset.h;
      doSearch();
    });
  })();

  /* ---------- 默认展示 ---------- */
  function showAll() {
    document.getElementById('all').hidden = false;
    document.getElementById('results').hidden = true;
    document.getElementById('filters').hidden = false;   // 筛选栏常驻
    filters();                                            // 清空筛选后按钮状态也要同步
    renderAll();
  }
  /* ---------- 页码生成：第一页 / 第二页 … ---------- */
  var CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  function cn(n) {
    if (n < 10) return CN[n];
    if (n < 20) return '十' + (n > 10 ? CN[n - 10] : '');
    if (n < 100) { var t = Math.floor(n / 10), o = n % 10; return CN[t] + '十' + (o ? CN[o] : ''); }
    return String(n);
  }
  function buildPager(el, total, cur, onPick) {
    if (!el) return;
    if (total <= 1) { el.innerHTML = ''; return; }
    var html = '<button class="pg-prev" data-pg="' + (cur - 1) + '"' + (cur <= 1 ? ' disabled' : '') + '>‹ 上一页</button>';
    var lo = Math.max(1, cur - 2), hi = Math.min(total, cur + 2), win = [];
    if (lo > 1) { win.push(1); if (lo > 2) win.push('…'); }
    for (var p = lo; p <= hi; p++) win.push(p);
    if (hi < total) { if (hi < total - 1) win.push('…'); win.push(total); }
    win.forEach(function (p) {
      if (p === '…') html += '<span class="pg-dots">…</span>';
      else html += '<button class="pg-num' + (p === cur ? ' on' : '') + '" data-pg="' + p + '">第' + cn(p) + '页</button>';
    });
    html += '<button class="pg-next" data-pg="' + (cur + 1) + '"' + (cur >= total ? ' disabled' : '') + '>下一页 ›</button>';
    el.innerHTML = html;
    el.querySelectorAll('button[data-pg]').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = +b.dataset.pg; if (v < 1 || v > total) return;
        onPick(v);
      });
    });
  }

  function renderAll() {
    var g = document.getElementById('aGrid');
    var total = Math.ceil(items.length / PAGE) || 1;
    if (pageAll > total) pageAll = total;
    if (pageAll < 1) pageAll = 1;
    var start = (pageAll - 1) * PAGE;
    g.innerHTML = items.slice(start, start + PAGE).map(function (i, k) { return card(i, (k % 8) * 40); }).join('');
    if (!g.dataset.bound) { bindCards(g); g.dataset.bound = '1'; }
    buildPager(document.getElementById('aPager'), total, pageAll, function (p) {
      pageAll = p; renderAll();
      document.getElementById('aGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* ---------- 启动 ---------- */
  // 渲染由 fetch 完成后统一触发（见文件开头）

  /* ---------- 检索 / 问答 切换 ---------- */
  (function tabs() {
    var ts = $$('.atab');
    ts.forEach(function (t) {
      t.addEventListener('click', function () {
        ts.forEach(function (x) { x.classList.toggle('on', x === t); });
        document.getElementById('modeSearch').classList.toggle('on', t.dataset.mode === 'search');
        document.getElementById('modeAI').classList.toggle('on', t.dataset.mode === 'ai');
      });
    });
  })();

  /* ---------- AI 问答 ---------- */
  (function ai() {
    var note = document.getElementById('aiNote');
    var noteTx = document.getElementById('aiNoteTx');
    var NOTE = {
      checking: '正在检测 AI 服务…',
      ready: 'AI 已连接，回答由模型生成，资料来自本地库。',
      nocfg: 'AI 服务已启动，但还没配置 API Key，当前使用本地检索。',
      offline: '离线讲解模式：回答直接取自本地资料库（双击打开即可用，不需要服务）。',
      none: 'AI 问答需要配置接口后方可使用，未配置时仅展示资料库内的检索结果。'
    };
    function paint(s) {
      note.classList.toggle('on', s === 'ready');
      noteTx.textContent = NOTE[s] || NOTE.checking;
    }
    paint('checking');
    if (window.LIB_AI.probe) window.LIB_AI.probe().then(paint);
    else paint(window.LIB_AI.online() ? 'ready' : 'none');

    document.getElementById('aiBtn').addEventListener('click', function () {
      var q = document.getElementById('qAI').value.trim();
      if (!q) return;

      var out = document.getElementById('aiOut');
      if (!out) {
        out = document.createElement('div');
        out.className = 'ai-out';
        out.id = 'aiOut';
        document.getElementById('modeAI').appendChild(out);
      }
      out.innerHTML = '<div class="ai-q">问：' + esc(q) + '</div><div class="ai-a"><span class="dots">思考中…</span></div>';
      out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      // 找出最相关的本地条目作为上下文
      /* 自然语言提问（如「元代梅瓶为什么小口」）整句很少会原样出现在资料里，
         改用英文词 + 中文二字组合打分，才能捞出「元代…梅瓶」这类相关条目。 */
      var tk = termsOf(q), terms = tk.words.concat(tk.grams);
      var ctx = items.map(function (i) {
        var h = hay(i), s = 0;
        terms.forEach(function (t) {
          if (h.indexOf(t) >= 0) s += t.length > 1 ? 2 : 1;
        });
        return { title: i.title, meta: i.meta, desc: i.desc, s: s };
      }).sort(function (a, b) { return b.s - a.s; }).slice(0, 8);

      window.LIB_AI.ask(q, ctx).then(function (r) {
        out.querySelector('.ai-a').innerHTML =
          esc(r.text).replace(/\n/g, '<br>') +
          '<div class="ai-src">来源：' + esc(r.source) + '</div>';
      });
    });
    document.getElementById('qAI').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') document.getElementById('aiBtn').click();
    });
  })();
})();