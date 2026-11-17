/* ============================================================
   全站 AI 助手「小青」悬浮球
   ------------------------------------------------------------
   与资料库共用同一个 AI 模型：
     · 优先复用资料库页已加载的 window.LIB_AI（同一实例）
     · 其它页面内置与 modules/library/ai.js 完全相同的
       endpoint 与 systemPrompt，调用同一个 /api/chat
   服务未启动 / 未配置 Key 时，自动退回本地检索兜底。
   ============================================================ */
(function () {
  'use strict';

  // 与资料库 ai.js 保持一致的配置
  var ENDPOINT = 'http://127.0.0.1:8787/api/chat';
  var SYSTEM_PROMPT =
    '你是一个青花瓷数字馆的讲解员，名字叫「小青」。请用简体中文回答，语气克制、专业、通俗，' +
    '以200 字以内为宜。青花瓷知识要点：唐代长沙窑已有釉下钴蓝彩；' +
    '元代景德镇用进口钴料「苏麻离青」，发色浓艳有铁锈斑；' +
    '明永宣延续苏麻离青，分水技法成熟；清康熙青花蓝中泛绿称「翠毛蓝」，' +
    '层次可达八九级；豆青、郎红等为高温颜色釉。若资料不确定，请明确说明。';

  // 内置精简语料（离线兜底用；资料库页会用它的完整语料）
  var CORPUS = [
    { title: '青花瓷', meta: '釉下彩瓷器', desc: '以钴料在胎上绘画，罩透明釉后高温一次烧成，蓝白相映。' },
    { title: '苏麻离青', meta: '元代进口钴料', desc: '发色浓艳，常有铁锈斑与晕散，用于元代及明永宣青花。' },
    { title: '分水技法', meta: '青花绘画技法', desc: '以浓淡不同的钴料水分染出层次，康熙时可达八九级。' },
    { title: '翠毛蓝', meta: '清康熙青花', desc: '康熙青花蓝中泛绿、明快清翠，层次丰富，称翠毛蓝。' },
    { title: '景德镇', meta: '瓷都', desc: '元明清以来青花瓷核心产区，集全国制瓷工艺之大成。' },
    { title: '揉泥·拉坯·利坯·画坯·施釉·装匣·烧成·开窑', meta: '制瓷八道工序', desc: '从一团泥到一只瓶，经八道主要工序，全凭手感与火候。' }
  ];

  var state = 'checking'; // checking / ready / nocfg / offline
  var root = document.getElementById('xq-assistant');
  if (root) return; // 防止重复注入

  /* ---------- 注入结构 ---------- */
  root = document.createElement('div');
  root.id = 'xq-assistant';
  root.innerHTML =
    '<div class="xq-panel" id="xq-panel" role="dialog" aria-label="小青 AI 助手">' +
      '<div class="xq-head">' +
        '<div class="xq-avatar">青</div>' +
        '<div class="xq-title"><b>小青</b><small>青花瓷智能问答助手</small></div>' +
        '<span class="xq-state" id="xq-state">连接中…</span>' +
        '<button class="xq-close" id="xq-close" aria-label="关闭">×</button>' +
      '</div>' +
      '<div class="xq-body" id="xq-body">' +
        '<div class="xq-msg ai">你好，我是小青。关于青花瓷，你想问点什么？</div>' +
      '</div>' +
      '<div class="xq-quick" id="xq-quick">' +
        '<button data-q="青花瓷是什么？">青花瓷是什么？</button>' +
        '<button data-q="苏麻离青有什么特点？">苏麻离青的特点</button>' +
        '<button data-q="制瓷有哪几道工序？">制瓷八道工序</button>' +
      '</div>' +
      '<form class="xq-input" id="xq-form">' +
        '<input id="xq-input" type="text" autocomplete="off" placeholder="问问小青…" aria-label="输入问题">' +
        '<button type="submit" id="xq-send" aria-label="发送">↑</button>' +
      '</form>' +
    '</div>' +
    '<div class="xq-fab" id="xq-fab" role="button" tabindex="0" aria-label="打开 AI 助手" title="AI 助手">' +
      '<span class="xq-label"><b>AI</b><i>助手</i></span><span class="xq-dot" id="xq-dot"></span>' +
    '</div>';
  document.body.appendChild(root);

  var fab = document.getElementById('xq-fab');
  var panel = document.getElementById('xq-panel');
  var body = document.getElementById('xq-body');
  var form = document.getElementById('xq-form');
  var input = document.getElementById('xq-input');
  var send = document.getElementById('xq-send');
  var stateEl = document.getElementById('xq-state');
  var dot = document.getElementById('xq-dot');

  /* ---------------- 位置：默认右下角，可拖拽，localStorage 记忆 ---------------- */
  var SIZE = 58, MARGIN = 12, GAP = 14;
  var pos = { x: 0, y: 0 };        // 球左上角坐标
  var STORE_KEY = 'xq-assistant-pos';

  function clampBall() {
    pos.x = Math.max(MARGIN, Math.min(pos.x, window.innerWidth - SIZE - MARGIN));
    pos.y = Math.max(MARGIN, Math.min(pos.y, window.innerHeight - SIZE - MARGIN));
  }

  /* 根据球的位置，把面板放到屏幕内最合适的一侧 */
  function placePanel() {
    var pw = panel.offsetWidth || Math.min(380, window.innerWidth - 32);
    var ph = panel.offsetHeight || Math.min(540, window.innerHeight - 120);
    var vw = window.innerWidth, vh = window.innerHeight;
    // 理想：贴在球左侧、底部对齐球上方
    var left = pos.x - pw - GAP;
    var top = pos.y + SIZE - ph;   // 面板底边贴着球顶边
    // 左侧放不下 → 放到球右侧
    if (left < MARGIN) left = pos.x + SIZE + GAP;
    // 右侧也放不下 → 居中
    if (left + pw > vw - MARGIN) left = Math.max(MARGIN, (vw - pw) / 2);
    // 垂直钳制：优先完整显示
    if (top < MARGIN) top = MARGIN;
    if (top + ph > vh - MARGIN) top = Math.max(MARGIN, vh - ph - MARGIN);
    // 若高度比可用空间还大，允许贴顶并内部滚动
    if (ph > vh - MARGIN * 2) top = MARGIN;
    panel.style.left = Math.round(left) + 'px';
    panel.style.top = Math.round(top) + 'px';
  }

  function applyPos() {
    clampBall();
    root.style.left = pos.x + 'px';
    root.style.top = pos.y + 'px';
    placePanel();
  }
  function loadPos() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) {}
    if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
      pos.x = saved.x; pos.y = saved.y;
    } else {
      pos.x = window.innerWidth - SIZE - 26;
      pos.y = window.innerHeight - SIZE - 26;
    }
    applyPos();
  }
  function savePos() { try { localStorage.setItem(STORE_KEY, JSON.stringify(pos)); } catch (e) {} }

  /* ---------------- 打开 / 关闭 ---------------- */
  function open() { root.classList.add('open'); placePanel(); setTimeout(function(){ input.focus(); }, 120); }
  function close() { root.classList.remove('open'); }

  /* ---------------- 拖拽：按住移动=拖动，单击=开/关 ---------------- */
  var drag = { active: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0 };
  var suppressClick = false;
  function down(e) {
    var p = e.touches ? e.touches[0] : e;
    drag.active = true; drag.moved = false;
    drag.sx = p.clientX; drag.sy = p.clientY;
    drag.ox = pos.x; drag.oy = pos.y;
  }
  function move(e) {
    if (!drag.active) return;
    var p = e.touches ? e.touches[0] : e;
    var dx = p.clientX - drag.sx, dy = p.clientY - drag.sy;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    pos.x = drag.ox + dx; pos.y = drag.oy + dy;
    applyPos();
    if (e.cancelable) e.preventDefault();
  }
  function up() {
    if (!drag.active) return;
    drag.active = false;
    if (drag.moved) {
      savePos();
      suppressClick = true;
      // 半秒后恢复，避免影响下一次真正的点击
      setTimeout(function(){ suppressClick = false; }, 350);
    }
  }
  fab.addEventListener('mousedown', down);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  fab.addEventListener('touchstart', down, { passive: true });
  window.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', up);

  fab.addEventListener('click', function () {
    if (suppressClick) { suppressClick = false; return; } // 刚拖动过，不当作点击
    if (root.classList.contains('open')) close(); else open();
  });
  fab.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fab.click(); } });
  document.getElementById('xq-close').addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  window.addEventListener('resize', applyPos);

  loadPos();

  function setState(s) {
    state = s;
    stateEl.className = 'xq-state' + (s === 'ready' ? ' ready' : '');
    dot.className = 'xq-dot' + (s === 'ready' ? ' ready' : (s === 'offline' || s === 'nocfg' ? ' off' : ''));
    if (s === 'ready') stateEl.textContent = 'AI 已连接';
    else if (s === 'nocfg') stateEl.textContent = '本地知识库';
    else if (s === 'offline') stateEl.textContent = '离线可用';
    else stateEl.textContent = '连接中…';
  }

  /* ---------- 探测服务状态（与资料库一致） ---------- */
  function probe() {
    if (window.LIB_AI && typeof window.LIB_AI.probe === 'function') {
      return window.LIB_AI.probe().then(function (st) { setState(st); });
    }
    return fetch(ENDPOINT.replace(/\/api\/chat\/?$/, '') + '/api/health')
      .then(function (r) { return r.json(); })
      .then(function (d) { setState(d.configured ? 'ready' : 'nocfg'); })
      .catch(function () { setState('offline'); });
  }

  /* ---------- 提问：优先复用 LIB_AI，保证同一模型 ---------- */
  function ask(q) {
    if (window.LIB_AI && typeof window.LIB_AI.ask === 'function') {
      return window.LIB_AI.ask(q, CORPUS);
    }
    if (state === 'offline') return Promise.resolve({ text: localAnswer(q), source: '本地检索（AI 暂不可用）' });
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, system: SYSTEM_PROMPT, context: CORPUS.map(function (c) { return c.title + '（' + c.meta + '）'; }) }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) throw new Error(d.error);
        return { text: d.answer || d.text || '', source: 'AI 生成' };
      })
      .catch(function () { setState('offline'); return { text: localAnswer(q), source: '本地检索（AI 暂不可用）' }; });
  }

  function localAnswer(q) {
    var terms = (String(q).toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fa5]+/g) || []).reduce(function (a, t) {
      if (/^[a-z0-9]+$/.test(t) || t.length === 1) a.push(t);
      else for (var i = 0; i < t.length - 1; i++) a.push(t.substr(i, 2));
      return a;
    }, []);
    var top = CORPUS.map(function (c) {
      var hay = (c.title + c.meta + c.desc).toLowerCase(), s = 0;
      terms.forEach(function (t) { if (hay.indexOf(t) >= 0) s += t.length > 1 ? 2 : 1; });
      return { c: c, s: s };
    }).filter(function (x) { return x.s > 0; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 3);
    if (!top.length) return '我暂时没有在资料里找到「' + q + '」相关内容。可以试试问「青花瓷是什么」「苏麻离青」「制瓷工序」。';
    return '根据资料，与「' + q + '」相关的是：\n\n' + top.map(function (x, i) {
      return (i + 1) + '. ' + x.c.title + '（' + x.c.meta + '）\n   ' + x.c.desc;
    }).join('\n\n');
  }

  function addMsg(text, who, source) {
    var el = document.createElement('div');
    el.className = 'xq-msg ' + who;
    el.textContent = text;
    if (source) { var s = document.createElement('span'); s.className = 'xq-src'; s.textContent = '— ' + source; el.appendChild(s); }
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el;
  }

  function submit(q) {
    q = (q || '').trim();
    if (!q) return;
    addMsg(q, 'me');
    input.value = '';
    var typing = document.createElement('div');
    typing.className = 'xq-msg ai';
    typing.innerHTML = '<span class="xq-typing"><i></i><i></i><i></i></span>';
    body.appendChild(typing);
    body.scrollTop = body.scrollHeight;
    send.disabled = true;
    ask(q).then(function (res) {
      typing.remove();
      addMsg(res.text || '（无回答）', 'ai', res.source);
    }).catch(function (e) {
      typing.remove();
      addMsg('抱歉，出了点问题：' + e.message, 'ai');
    }).then(function () {
      send.disabled = false;
      input.focus();
    });
  }

  form.addEventListener('submit', function (e) { e.preventDefault(); submit(input.value); });
  document.getElementById('xq-quick').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) submit(b.getAttribute('data-q'));
  });

  probe();
})();
