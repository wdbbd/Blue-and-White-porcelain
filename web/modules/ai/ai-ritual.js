/* ============================================================
   AI 仪式引擎 · ai-ritual.js
   ------------------------------------------------------------
   增量模块的本地引擎（输出 JSON，可 configure({endpoint})
   切换真实多模态接口，约定 POST {prompt_type, vars}）：
   ① evolve      时光演化（轻/重、锁定造型、风化土沁）
   ② inscribe    题款落印 + 青花印章（独立 UV 图层画布）
   ③ rollKiln    开窑分支判定（正常 / 窑损 / 稀有窑变珍品）
   （诗意造器 poemMatch 链路已按需求整体移除，题款仅保留
   手动落款与闲章功能。）
   兜底：演化是参数调整+重绘而非切图；题款独立图层不覆盖主纹样；
   自由创作模式解除朝代强制；用户保留撤回/锁定/拒绝控制权。
   ============================================================ */
(function () {
  'use strict';

  var cfg = { endpoint: '' };
  function configure(o) { for (var k in o) cfg[k] = o[k]; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------- 时光轴：四档演化目标 ---------- */
  var TIMELINE = ['元代', '明代', '清代', '现代再创作'];

  /* ============================================================
     ① 时光演化：参数调整 + 朝代推荐重绘（不是切图）
     vars = { from, to, mode:'light'|'heavy', locked,
              shape_id, params_full, free }
     ============================================================ */
  function evolve(vars) {
    var to = clamp(vars.to, 0, 3);
    var heavy = vars.mode === 'heavy';
    var locked = !!vars.locked;
    var modern = to === 3;
    var targetName = TIMELINE[to];

    var out = {
      type: 'time_evolve',
      to_name: targetName,
      mode: heavy ? 'heavy' : 'light',
      locked: locked,
      aged: modern || heavy,          // 现代 / 重演化叠加风化土沁
      shape_id: vars.shape_id,
      params_full: null,              // null = 不动参数（轻演化保留主体轮廓）
      pattern_name: '',
      age_note: '',
      story: ''
    };

    /* 轻演化：AI 微调参数（±6），保留主体轮廓 */
    if (!heavy && vars.params_full) {
      out.params_full = vars.params_full.map(function (v) {
        return clamp(Math.round(v + (Math.random() - 0.5) * 12), 0, 100);
      });
    }

    /* 风化说明 */
    if (modern) {
      out.age_note = '现代再创作：岁月风化 + 土沁老化，釉面泛雅灰，纹样微褪，开片加深。';
    } else if (heavy) {
      out.age_note = '重演化：器物按' + targetName + '审美重塑，釉色与纹样回归该时代典型。';
    } else {
      out.age_note = '轻演化：主体轮廓不变，纹样与釉色向' + targetName + '风格过渡，微添岁月痕迹。';
    }

    out.story = '这件器物沿时光之河来到了' + targetName + '。' + out.age_note +
      (locked ? '（造型已锁定，仅演化纹样与釉色）' : '') +
      (vars.free ? '自由创作模式：只添岁月质感，不以朝代范式约束创意。' : '');

    return Promise.resolve(out);
  }

  /* ============================================================
     ② 古诗题款 + 印章：独立 UV 图层画布（透明底）
     vars = { poem, seal_type, dynasty, foot_r 底足半径 cm, h 总高 cm }
     返回 { canvas, box, lines, style, warn, note }
     ------------------------------------------------------------
     四种款式版式彻底区分（旧版只是换一个印章字，看起来完全一样）：
       闲章   —— 双列行楷竖排 + 小方印
       帝王款 —— 单行楷书 + 双线长方框（年号款制式）
       民窑款 —— 双行行书 + 手绘椭圆框 + 料点
       私款   —— 单列隶意竖排 + 大白文印
     ============================================================ */
  var INK = 'rgba(38,72,124,0.94)';
  var INK_DEEP = 'rgba(27,55,101,0.96)';
  var KAI = '"Kaiti SC","STKaiti","KaiTi","Noto Serif SC",serif';
  var LI = '"LiSu","STLiti","Kaiti SC","STKaiti","KaiTi",serif';

  function inscribe(vars) {
    var poem = (vars.poem || '青花一色入窑来').replace(/\s+/g, '');
    var type = vars.seal_type || '闲章';
    var styleName = { 元代: '雄浑朴拙', 明代: '端庄遒劲', 清代: '秀雅工整', 唐代: '古拙率意', 宋代: '清瘦挺拔' }[vars.dynasty] || '端庄遒劲';

    var warn = '';
    var hCm = +vars.h || 20;
    if ((vars.foot_r || 5) < 2.2) warn = '底足过窄（不足 4.4cm），题款略作收窄。';
    if (hCm < 25) warn = warn || '器物偏小，题款与印章已按比例收紧。';

    var W = 1200, H = 1200, cx = W / 2, cy = H / 2;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d');
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = INK;
    g.lineJoin = 'round';

    function font(px, weight, fam) { return (weight || '600') + ' ' + px + 'px ' + (fam || KAI); }
    /* 印章：solid=true 白文（实底白字），false 朱文（空心蓝字） */
    function seal(x, y, size, chars, solid) {
      g.save();
      if (solid) {
        g.fillStyle = INK_DEEP;
        g.fillRect(x, y, size, size);
      } else {
        g.strokeStyle = INK_DEEP;
        g.lineWidth = Math.max(4, size * 0.075);
        g.strokeRect(x, y, size, size);
      }
      g.fillStyle = solid ? 'rgba(243,247,250,0.97)' : INK_DEEP;
      var n = chars.length;
      g.font = font(size * (n > 1 ? 0.40 : 0.62), '700');
      for (var i = 0; i < n; i++) {
        g.fillText(chars[i], x + size / 2, y + size * (i + 0.5) / n + size * 0.03);
      }
      g.restore();
    }
    function col(text, x, y0, step) {
      for (var k = 0; k < text.length; k++) g.fillText(text[k], x, y0 + k * step);
    }

    var used = '', layout = '';

    if (type === '帝王款') {
      /* ① 帝王款：单行楷书，双线长方框，如官窑底款 */
      used = poem.slice(0, 8);
      if (poem.length > 8) warn = warn || '帝王款以年号短句为宜，已截取前 8 字。';
      var size = 92, gap = 12;
      var totalW = used.length * size + (used.length - 1) * gap;
      g.font = font(size, '700');
      var x0 = cx - totalW / 2 + size / 2;
      for (var i = 0; i < used.length; i++) g.fillText(used[i], x0 + i * (size + gap), cy);
      var padX = 34, padY = 38;
      g.strokeStyle = INK_DEEP;
      g.lineWidth = 5;
      g.strokeRect(cx - totalW / 2 - padX, cy - size / 2 - padY, totalW + padX * 2, size + padY * 2);
      g.lineWidth = 1.8;
      g.strokeRect(cx - totalW / 2 - padX + 11, cy - size / 2 - padY + 11, totalW + padX * 2 - 22, size + padY * 2 - 22);
      layout = '单行楷书 · 双线款框';

    } else if (type === '民窑款') {
      /* ② 民窑款：双行行书 + 手绘椭圆框 + 料点，笔画略带歪斜 */
      used = poem.slice(0, 8);
      if (poem.length > 8) warn = warn || '民窑款多随手题写，已截取前 8 字。';
      var per = Math.ceil(used.length / 2);
      var rows = [used.slice(0, per), used.slice(per)];
      g.save();
      g.translate(cx, cy);
      g.rotate(-0.045);
      g.font = font(84, '600');
      rows.forEach(function (ln, li) {
        for (var k = 0; k < ln.length; k++) {
          g.fillText(ln[k], (k - (ln.length - 1) / 2) * 94, (li - 0.5) * 104);
        }
      });
      g.strokeStyle = INK;
      g.globalAlpha = 0.82;
      g.lineWidth = 5;
      g.beginPath(); g.ellipse(0, 0, 268, 158, 0, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 0.5;
      g.beginPath(); g.ellipse(7, -4, 276, 164, 0.03, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = INK;
      [[-236, -118, 7], [248, 116, 5], [214, -136, 4], [-206, 132, 3]].forEach(function (d) {
        g.beginPath(); g.arc(d[0], d[1], d[2], 0, Math.PI * 2); g.fill();
      });
      g.restore();
      layout = '双行行书 · 手绘椭圆款框';

    } else if (type === '私款') {
      /* ③ 私款：单列隶意竖排 + 大白文印 */
      used = poem.slice(0, 8);
      if (poem.length > 8) warn = warn || '私款单列竖排，已截取前 8 字。';
      g.font = font(98, '700', LI);
      var step = 106;
      var y0 = cy - (used.length - 1) * step / 2 - 46;
      col(used, cx, y0, step);
      var sealSize = 134;
      seal(cx - sealSize / 2, y0 + used.length * step - 28, sealSize, '雅玩', true);
      layout = '单列隶意 · 大白文印';

    } else {
      /* ④ 闲章：双列行楷竖排 + 小方印 */
      used = poem.slice(0, 12);
      if (poem.length > 12) warn = warn || '闲章双列竖排，已截取前 12 字。';
      var per2 = Math.ceil(used.length / 2);
      var cols = [used.slice(0, per2), used.slice(per2)];
      if (!cols[1]) cols = [cols[0]];
      g.font = font(86, '600');
      var colGap = 108;
      var startX = cx + (cols.length - 1) * colGap / 2;
      var maxBottom = cy;
      cols.forEach(function (colText, ci) {
        var x = startX - ci * colGap;
        var yTop = cy - 26 - (colText.length - 1) * 94 / 2;
        col(colText, x, yTop, 94);
        maxBottom = Math.max(maxBottom, yTop + (colText.length - 1) * 94);
      });
      seal(startX + 40, maxBottom + 34, 76, '青', false);
      layout = '双列行楷 · 小方印';
    }

    /* 墨迹包围盒：贴图只按实际墨迹缩放定位，题款才会落在器身正中而不偏移 */
    var data = g.getImageData(0, 0, W, H).data;
    var minX = W, minY = H, maxX = -1, maxY = -1;
    for (var yy = 0; yy < H; yy++) {
      var row = yy * W * 4;
      for (var xx = 0; xx < W; xx++) {
        if (data[row + xx * 4 + 3] > 12) {
          if (xx < minX) minX = xx;
          if (xx > maxX) maxX = xx;
          if (yy < minY) minY = yy;
          if (yy > maxY) maxY = yy;
        }
      }
    }
    if (maxX < 0) { minX = 0; minY = 0; maxX = W - 1; maxY = H - 1; }
    var pad = 10;
    var box = {
      x: Math.max(0, minX - pad),
      y: Math.max(0, minY - pad),
      w: Math.min(W, maxX + pad) - Math.max(0, minX - pad),
      h: Math.min(H, maxY + pad) - Math.max(0, minY - pad)
    };

    return Promise.resolve({
      type: 'inscription',
      canvas: c,
      box: box,
      lines: [used],
      style: vars.dynasty + '书法 · ' + styleName + ' · ' + type + '（' + layout + '）',
      warn: warn,
      note: '题款以' + styleName + '笔意书之，' + layout + '，落在器身正面正中。'
    });
  }

  /* ============================================================
     ③ 开窑分支：正常 / 窑损（可复烧）/ 稀有窑变珍品
     vars = { temp, iteration }
     ============================================================ */
  function rollKiln(vars) {
    var r = Math.random();
    var temp = vars.temp || 1250;
    var iter = vars.iteration || 0;
    var kind = 'normal';
    if (r < 0.08 + (temp > 1300 ? 0.08 : 0) + iter * 0.02) kind = 'damage';
    else if (r > 0.94) kind = 'rare';
    return Promise.resolve({
      type: 'kiln_roll',
      kind: kind,
      note: kind === 'damage' ? '窑损：局部流釉剥裂，可复烧补救。'
        : kind === 'rare' ? '稀有窑变珍品！窑火天成，可遇不可求。'
        : ''
    });
  }

  function run(promptType, vars) {
    if (cfg.endpoint) {
      return fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_type: promptType, vars: vars })
      }).then(function (res) { return res.json(); });
    }
    if (promptType === 'time_evolve') return evolve(vars);
    if (promptType === 'inscription') return inscribe(vars);
    return rollKiln(vars);
  }

  window.AIRitual = {
    configure: configure,
    run: run,
    evolve: evolve,
    inscribe: inscribe,
    rollKiln: rollKiln,
    TIMELINE: TIMELINE
  };
})();
