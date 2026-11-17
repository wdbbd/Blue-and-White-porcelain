/* ============================================================
   资料库 · 逻辑 · 【成员 D 负责】
   ============================================================ */

(function () {
  'use strict';

  var man = null;
  var items = [];        // 统一的检索条目
  var f = { type: 'all', era: 'all', q: '' };
  var PAGE = 48;
  var shown = 0;
  var aiBox = null;

  var TYPES = [
    { k: 'all', n: '全部' },
    { k: '纹样', n: '纹样' },
    { k: '瓶类', n: '瓶' }, { k: '碗类', n: '碗' }, { k: '罐类', n: '罐' },
    { k: '壶类', n: '壶' }, { k: '盘类', n: '盘' }, { k: '杯盏类', n: '杯盏' },
    { k: '文房类', n: '文房' }, { k: '杂项供器', n: '杂项' },
    { k: '匠人', n: '匠人' },
  ];

  /* ---------- 载入 ---------- */
  fetch('../../assets/data/manifest.json')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      man = d;
      build();
      document.getElementById('aCount').textContent = items.length;
      // 清单可能晚于 DOMContentLoaded 到达，这里统一渲染一次
      shown = PAGE;
      renderAll();
    })
    .catch(function () {
      document.getElementById('aCount').textContent = '—';
    });

  /* ---------- 把素材整理成统一条目 ---------- */
  function build() {
    var IMGB = '../../assets/';
    items = [];
    man.patterns.forEach(function (p) {
      items.push({
        kind: '纹样', title: p.name, meta: p.era,
        img: IMGB + p.thumb, full: IMGB + p.img,
        desc: p.era + '时期的代表性纹样。', dynasty: p.era,
      });
    });
    man.shapes.forEach(function (s) {
      var key = s.cat.replace(/\s+/g, '');
      items.push({
        kind: s.cat, typeKey: key, title: s.name, meta: s.dynasty + ' · ' + s.cat,
        img: IMGB + s.thumb, full: IMGB + s.img,
        desc: s.dynasty + s.cat + '，纹样与器型俱备。', dynasty: s.dynasty,
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

  function match() {
    var terms = f.q.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fa5]{2,}/g) || [];
    return items.filter(function (i) {
      if (f.type === '纹样' && i.kind !== '纹样') return false;
      if (f.type === '杂项供器' && i.typeKey !== '杂项供器类') return false;
      if (f.type !== 'all' && f.type !== '纹样' && f.type !== '杂项供器' && f.type !== '匠人') {
        if (i.typeKey !== f.type) return false;
      }
      if (f.era !== 'all' && (i.dynasty || '').indexOf(f.era) < 0) return false;
      if (!terms.length) return true;
      var h = hay(i);
      return terms.every(function (t) { return h.indexOf(t) >= 0; });
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
    if (e.key === 'Escape' && aiBox && aiBox.classList.contains('on')) aiBox.click();
  });

  /* ---------- 筛选 ---------- */
  function filters() {
    document.getElementById('fType').innerHTML = TYPES.map(function (t) {
      return '<button class="fg' + (f.type === t.k ? ' on' : '') + '" data-k="' + t.k + '" data-f="type">' + t.n + '</button>';
    }).join('');

    var eras = [];
    items.forEach(function (i) {
      if (i.dynasty && eras.indexOf(i.dynasty) < 0) eras.push(i.dynasty);
    });
    eras.sort(function (a, b) { return eraOrder(a) - eraOrder(b); });
    document.getElementById('fEra').innerHTML =
      '<button class="fg' + (f.era === 'all' ? ' on' : '') + '" data-k="all" data-f="era">全部朝代</button>' +
      eras.map(function (e) {
        return '<button class="fg' + (f.era === e ? ' on' : '') + '" data-k="' + esc(e) + '" data-f="era">' + esc(e.replace(/[（(].*?[）)]/, '')) + '</button>';
      }).join('');
  }

  function eraOrder(e) {
    var m = [['唐', 1], ['宋', 2], ['元', 3], ['明', 4], ['清', 5], ['晚清', 5], ['民国', 6], ['现代', 7]];
    for (var i = 0; i < m.length; i++) if (e.indexOf(m[i][0]) >= 0) return m[i][1];
    return 9;
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('.fg'); if (!b) return;
    f[b.dataset.f] = b.dataset.k;
    run(true);
  });

  document.getElementById('fClear').addEventListener('click', function () {
    f = { type: 'all', era: 'all', q: '' };
    document.getElementById('q').value = '';
    run(true);
  });

  /* ---------- 检索 ---------- */
  function run(force) {
    var list = match();
    var box = document.getElementById('rGrid');
    document.getElementById('filters').hidden = false;
    document.getElementById('results').hidden = false;
    document.getElementById('all').hidden = true;

    document.getElementById('fCount').textContent =
      '共 ' + list.length + ' 条结果' + (f.q ? '（关键词：' + f.q + '）' : '');
    document.getElementById('rEmpty').hidden = list.length > 0;
    box.innerHTML = list.slice(0, PAGE).map(function (i, k) { return card(i, (k % 8) * 40); }).join('');

    filters();
    if (!box.dataset.bound) { bindCards(box); box.dataset.bound = '1'; }
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
    document.getElementById('filters').hidden = true;
    renderAll();
  }
  function renderAll() {
    var g = document.getElementById('aGrid');
    g.innerHTML = items.slice(0, shown).map(function (i, k) { return card(i, (k % 8) * 40); }).join('');
    if (!g.dataset.bound) { bindCards(g); g.dataset.bound = '1'; }
    var more = document.getElementById('aMore');
    more.style.display = shown >= items.length ? 'none' : '';
  }
  document.getElementById('aMore').addEventListener('click', function () {
    shown += PAGE; renderAll();
  });

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
    var online = window.LIB_AI.online();
    if (online) {
      note.classList.add('on');
      noteTx.textContent = 'AI 已连接，回答由模型生成，资料来自本地库。';
    }

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
      var terms = q.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fa5]{2,}/g) || [];
      var ctx = items.map(function (i) {
        var h = hay(i), s = 0;
        terms.forEach(function (t) { if (h.indexOf(t) >= 0) s += t.length; });
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