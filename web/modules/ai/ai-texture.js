/* ============================================================
   青花 AI 纹样生成 + UV 预畸变校正引擎 · ai-texture.js
   ------------------------------------------------------------
   对应两套提示词的本地实现（输出物与提示词约定一致）：
   ① 纹样生成 generate(opts)
      输入 {dynasty 朝代, theme 主题描述, region 区域, shape 器型,
            layout 布局(auto/loop/medallion/band), tone 钴蓝色, seed}
      输出 {canvas 透明背景 UV 贴图, desc 给重绘环节的描述文本, params}
      · 腹部环形 → 横向无缝循环（单元左右边缘完美衔接）
      · 口沿/底足 → 窄幅边饰（回纹/卷草/如意）
      · 团花 → 居中绘制，四周透明
      · 风格贴合朝代：元雄浑（粗笔少层）、明浓淡（双色调）、清细密（细笔多层）
      · 水墨晕染质感（shadowBlur 洇墨），禁止阴影立体物
   ② UV 展开重绘 uvCorrect(canvas, radiusAt)
      · 逐行按器身半径做横向预拉伸：半径小(收口)处预拉伸，
        包裹到曲面后视觉密度一致，不出现挤压变形；
      · 曲率变化大的行自动计入疏密补偿行数；
      · 环形纹样三重复绘（x±W），校正后仍保持左右无缝。
   ------------------------------------------------------------
   接入真实图像生成接口：AITexture.configure({ endpoint }) 后
   generate() 会 POST {dynasty, theme, region, shape, layout} 到你的
   生图服务，约定返回 { image: dataURL, desc }；未配置走本地程序化生成。
   ============================================================ */
(function () {
  'use strict';

  var cfg = { endpoint: '' };
  function configure(o) { for (var k in o) cfg[k] = o[k]; }

  /* ---------------- 基础工具 ---------------- */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    var h = 9;
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 387420489);
    return h >>> 0;
  }

  /* ---------------- 主题归类 ---------------- */
  var THEME_RULES = [
    { kw: ['龙', '凤', '瑞兽', '麒麟'], cat: 'dragon' },
    { kw: ['云', '鹤'], cat: 'cloud' },
    { kw: ['山水', '渔舟', '人物', '亭', '楼阁'], cat: 'hills' },
    { kw: ['回纹', '几何', '菱形', '方格'], cat: 'meander' },
    { kw: ['卷草', '蔓草', '如意'], cat: 'scroll' },
    { kw: ['鱼'], cat: 'fish' },
    { kw: ['蝠', '蝙蝠', '八宝', '杂宝'], cat: 'treasure' },
    { kw: ['莲', '牡丹', '花卉', '花', '宝相', '团花', '菊', '梅', '缠枝'], cat: 'vine' }
  ];
  function catFromTheme(theme) {
    theme = theme || '';
    for (var i = 0; i < THEME_RULES.length; i++)
      for (var j = 0; j < THEME_RULES[i].kw.length; j++)
        if (theme.indexOf(THEME_RULES[i].kw[j]) >= 0) return THEME_RULES[i].cat;
    return 'vine';
  }

  /* ---------------- 语义理解：把「诗句 / 关键词」读成纹样题材 ----------------
     有判断力：只认与青花纹样相关的意象；毫无关系（寒暄、乱码、英文数字）就拒绝，
     由页面提示用户重新输入。一个描述可以同时命中 1~2 个题材（如「山水渔舟」含山+舟）。 */
  var MOTIF_LEX = {
    dragon:   ['龙', '凤', '麒麟', '瑞兽', '螭', '蟠', '夔', '麟'],
    cloud:    ['云', '鹤', '霞', '雾', '霄', '霭', '霓', '月', '星', '烟'],
    wave:     ['水', '江', '河', '海', '潮', '浪', '波', '川', '湖', '潭', '泉', '溪', '渊', '雨', '雪', '风'],
    hills:    ['山', '峰', '岭', '岩', '石', '崖', '坡', '谷', '舟', '船', '渔', '亭', '桥', '楼', '阁', '村', '林', '松', '竹'],
    vine:     ['莲', '荷', '牡丹', '菊', '梅', '兰', '花', '草', '藤', '枝', '叶', '蕊', '芳', '桃', '杏', '桂', '芙蓉', '芍药', '海棠', '蔷薇', '茶', '果'],
    fish:     ['鱼', '鲤', '鲫', '鲢', '鳞', '藻', '虾', '蟹'],
    treasure: ['宝', '珠', '钱', '锭', '如意', '八宝', '杂宝', '福', '寿', '吉', '祥', '瑞', '磬', '轮', '螺', '伞', '盖'],
    meander:  ['回纹', '几何', '菱', '方格', '锦', '规矩', '雷纹', '万字'],
    scroll:   ['卷草', '蔓草', '唐草', '缠枝', '藤蔓']
  };
  function parseBrief(text) {
    var t = String(text || '').replace(/\s+/g, '');
    if (t.length < 2) return { ok: false, reason: '描述太短了，请至少输入两个字（如：缠枝莲、山水渔舟、双龙戏珠）' };
    if (!/[\u4e00-\u9fa5]/.test(t)) return { ok: false, reason: '请用中文描述纹样主题（诗句或关键词都可以）' };
    var motifs = [];
    for (var cat in MOTIF_LEX) {
      var list = MOTIF_LEX[cat];
      for (var i = 0; i < list.length; i++) {
        if (t.indexOf(list[i]) >= 0) { if (motifs.indexOf(cat) < 0) motifs.push(cat); break; }
      }
    }
    if (!motifs.length) {
      return { ok: false, reason: '这段描述和青花纹样没有关系 —— 请换一个说法，比如「缠枝莲」「山水渔舟」「云鹤」「春江潮水」' };
    }
    return { ok: true, motifs: motifs };
  }

  /* 笔意：自由创作的三档手感（只改画法，不预设题材） */
  var BRUSH = {
    xieyi:  { lw: 1.0,  blur: 1.15, units: 0,  detail: false },
    gongbi: { lw: 0.72, blur: 0.8,  units: 1,  detail: true },
    pomo:   { lw: 1.55, blur: 1.8,  units: -1, detail: true }
  };

  /* ---------------- 朝代风格 ---------------- */
  function styleOf(dynasty, tone) {
    var d = { lw: 5, rows: 1, blur: 6, detail: false, second: 0.4, units: 4 };
    if (dynasty === '元代') { d.lw = 8; d.blur = 8; d.second = 0.22; d.units = 3; }
    if (dynasty === '明代') { d.lw = 5; d.second = 0.45; }
    if (dynasty === '清代') { d.lw = 3.2; d.rows = 2; d.detail = true; d.blur = 4; d.units = 5; }
    d.tone = tone || '#2f5f9e';
    d.deep = shade(d.tone, -0.35);
    d.light = shade(d.tone, 0.3);
    return d;
  }
  function shade(hex, k) {
    var n = parseInt(hex.slice(1), 16),
        r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r + (k < 0 ? r : 255 - r) * k);
    g = Math.round(g + (k < 0 ? g : 255 - g) * k);
    b = Math.round(b + (k < 0 ? b : 255 - b) * k);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /* ---------------- 区域尺寸 ---------------- */
  function sizeFor(region, layout) {
    if (layout === 'medallion') return { w: 640, h: 640 };
    var h = { mouth: 176, foot: 168, neck: 208, shoulder: 248, belly: 480, all: 1024 }[region] || 400;
    return { w: 1024, h: h };
  }
  function autoLayout(region) {
    if (region === 'mouth' || region === 'foot' || region === 'neck') return 'band';
    return 'loop';   // belly / shoulder / all
  }

  /* ---------------- 水墨笔触 ---------------- */
  function ink(g, S, fn) {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // 洇墨底层：宽笔低透明
    g.strokeStyle = S.tone;
    g.globalAlpha = 0.38;
    g.lineWidth = S.lw * 2.1;
    g.shadowColor = S.tone;
    g.shadowBlur = S.blur * 2;
    fn(g, S.lw * 2.1);
    // 主笔
    g.globalAlpha = 0.95;
    g.lineWidth = S.lw;
    g.shadowBlur = S.blur;
    fn(g, S.lw);
    // 浓芯
    g.strokeStyle = S.deep;
    g.globalAlpha = 0.8;
    g.lineWidth = Math.max(1, S.lw * 0.42);
    g.shadowBlur = 2;
    fn(g, Math.max(1, S.lw * 0.42));
    g.shadowBlur = 0;
    g.globalAlpha = 1;
  }

  function rosette(g, cx, cy, R, petals, S, fill) {
    var i, a;
    g.beginPath();
    for (i = 0; i <= petals * 2; i++) {
      a = (i / (petals * 2)) * Math.PI * 2;
      var rr = i % 2 ? R * 0.52 : R;
      var x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.92;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    if (fill) { g.fillStyle = S.light; g.globalAlpha = 0.5; g.fill(); g.globalAlpha = 1; }
    g.stroke();
    g.beginPath();
    g.arc(cx, cy, R * 0.24, 0, Math.PI * 2);
    if (fill) { g.fillStyle = S.deep; g.fill(); } else g.stroke();
  }

  /* ---------------- 细笔：精选主题的第二层细节 ---------------- */
  function finePen(g, S, alpha) {
    g.save();
    g.strokeStyle = S.deep;
    g.fillStyle = S.deep;
    g.globalAlpha = alpha == null ? 0.42 : alpha;
    g.lineWidth = Math.max(1, S.lw * 0.18);
    g.shadowBlur = 0;
    g.lineCap = 'round';
    g.lineJoin = 'round';
  }
  function fineEnd(g) { g.restore(); }

  /* ---------------- 各主题绘制（均在单元内，坐标含偏移） ---------------- */
  function paintVine(g, S, x0, y0, w, h, rnd) {
    var amp = h * 0.26, mid = y0 + h * 0.5, step = w / 8, i, t;
    ink(g, S, function (c) {
      c.beginPath();
      for (i = 0; i <= 64; i++) {
        t = i / 64;
        var x = x0 + t * w, y = mid + Math.sin(t * Math.PI * 4) * amp;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    });
    var n = 4;
    for (i = 0; i < n; i++) {
      var fx = x0 + (i + 0.5) * (w / n),
          fy = mid + Math.sin(((i + 0.5) / n) * Math.PI * 4) * amp;
      g.strokeStyle = S.tone;
      rosette(g, fx, fy, Math.min(w, h) * (0.13 + rnd() * 0.04), 6, S, true);
      // 叶
      g.beginPath();
      g.moveTo(fx + 14, fy + h * 0.16);
      g.quadraticCurveTo(fx + 30, fy + h * 0.3, fx + 48, fy + h * 0.14);
      g.stroke();
      if (S.detail) {
        finePen(g, S, 0.42);
        g.beginPath();
        g.moveTo(fx + 22, fy + h * 0.23);
        g.lineTo(fx + 40, fy + h * 0.17);
        g.stroke();
        for (var q = 0; q < 6; q++) {
          var an = (q / 6) * Math.PI * 2;
          g.beginPath();
          g.arc(fx + Math.cos(an) * Math.min(w, h) * 0.075, fy + Math.sin(an) * Math.min(w, h) * 0.075, 1.6, 0, Math.PI * 2);
          g.fill();
        }
        fineEnd(g);
      }
    }
  }

  function paintDragon(g, S, x0, y0, w, h, rnd) {
    var mid = y0 + h * 0.52, amp = h * 0.2, i, t;
    ink(g, S, function (c) {
      c.beginPath();
      for (i = 0; i <= 72; i++) {
        t = i / 72;
        var x = x0 + t * w, y = mid + Math.sin(t * Math.PI * 2 + 0.6) * amp;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
      // 背鳍
      for (i = 1; i < 9; i++) {
        t = i / 9;
        var sx = x0 + t * w, sy = mid + Math.sin(t * Math.PI * 2 + 0.6) * amp;
        c.moveTo(sx, sy);
        c.lineTo(sx + 10, sy - h * 0.14);
      }
      c.stroke();
      // 龙首（三角轮廓 + 角）
      var hx = x0 + w * 0.92, hy = mid + Math.sin(0.92 * Math.PI * 2 + 0.6) * amp * 0.36;
      c.beginPath();
      c.moveTo(hx, hy - h * 0.16);
      c.lineTo(hx + w * 0.05, hy);
      c.lineTo(hx, hy + h * 0.16);
      c.stroke();
      c.beginPath();
      c.moveTo(hx - 6, hy - h * 0.14);
      c.lineTo(hx - h * 0.2, hy - h * 0.3);
      c.stroke();
      // 爪
      c.beginPath();
      c.arc(hx - w * 0.1, hy + h * 0.2, h * 0.09, 0.2, Math.PI * 1.2);
      c.stroke();
    });
    // 火珠
    g.strokeStyle = S.tone;
    rosette(g, x0 + w * 0.12, mid - amp, h * 0.09, 8, S, false);
    if (S.detail) {
      /* 鳞片 + 须：细笔沿龙身排布，拉开层次 */
      finePen(g, S, 0.38);
      for (i = 0; i < 20; i++) {
        t = (i + 1) / 21;
        var qx = x0 + t * w, qy = mid + Math.sin(t * Math.PI * 2 + 0.6) * amp;
        g.beginPath();
        g.arc(qx, qy, h * 0.04, Math.PI * 0.15, Math.PI * 0.85);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(x0 + w * 0.07, mid - amp * 0.2);
      g.quadraticCurveTo(x0 + w * 0.02, mid - amp * 0.7, x0 + w * 0.12, mid - amp * 0.9);
      g.stroke();
      fineEnd(g);
    }
  }

  function paintCloud(g, S, x0, y0, w, h, rnd) {
    var n = 3, i;
    g.strokeStyle = S.tone;
    for (i = 0; i < n; i++) {
      (function (i) {
        var cx = x0 + (i + 0.5) * (w / n) + (rnd() - 0.5) * 12,
            cy = y0 + h * (0.36 + rnd() * 0.3), r = h * 0.2;
        ink(g, S, function (c) {
          c.beginPath();
          c.arc(cx, cy, r, Math.PI * 0.9, Math.PI * 2.15);
          c.stroke();
          c.beginPath();
          c.arc(cx - r * 0.9, cy + r * 0.42, r * 0.55, Math.PI * 0.8, Math.PI * 2);
          c.stroke();
          // 云尾
          c.beginPath();
          c.moveTo(cx - r * 1.7, cy + r * 0.85);
          c.quadraticCurveTo(cx, cy + r * 1.25, cx + r * 1.8, cy + r * 0.85);
          c.stroke();
          if (S.detail) {
            finePen(c, S, 0.4);
            c.beginPath();
            c.arc(cx - r * 0.12, cy - r * 0.05, r * 0.56, Math.PI * 1.15, Math.PI * 2.15);
            c.stroke();
            fineEnd(c);
          }
        });
      })(i);
    }
  }

  function paintHills(g, S, x0, y0, w, h, rnd) {
    var L = 3, i, k;
    g.strokeStyle = S.tone;
    for (k = 0; k < L; k++) {
      (function (k) {
        var base = y0 + h * (0.5 + k * 0.17), amp = h * (0.3 - k * 0.07);
        ink(g, S, function (c) {
          c.beginPath();
          c.moveTo(x0, base);
          var seg = 4 + Math.floor(rnd() * 2);
          for (i = 1; i <= seg; i++) {
            var px = x0 + (i / seg) * w,
                py = base - amp * (0.45 + rnd() * 0.55);
            c.quadraticCurveTo(px - w / seg / 2, py, px, base);
          }
          c.stroke();
          if (S.detail) {
            /* 皴笔：山体上的短促细笔 + 水波纹 */
            finePen(c, S, 0.32);
            for (var q = 0; q < 8; q++) {
              var qx = x0 + (q + 0.5) * w / 8;
              c.beginPath();
              c.moveTo(qx, base - amp * 0.5);
              c.lineTo(qx + 3, base - amp * 0.7);
              c.stroke();
            }
            if (k === L - 1) {
              for (var q2 = 0; q2 < 6; q2++) {
                var wx = x0 + (q2 + 0.5) * w / 6;
                c.beginPath();
                c.moveTo(wx - 12, base + h * 0.12);
                c.quadraticCurveTo(wx, base + h * 0.06, wx + 12, base + h * 0.12);
                c.stroke();
              }
            }
            fineEnd(c);
          }
        });
      })(k);
    }
  }

  function paintMeander(g, S, x0, y0, w, h) {
    var unit = h * 0.62, gap = unit * 1.6, x, mid = y0 + h * 0.5;
    ink(g, S, function (c) {
      for (x = x0; x < x0 + w; x += gap) {
        c.beginPath();
        c.moveTo(x, mid + unit / 2);
        c.lineTo(x, mid - unit / 2);
        c.lineTo(x + unit, mid - unit / 2);
        c.lineTo(x + unit, mid + unit * 0.15);
        c.lineTo(x + unit * 0.45, mid + unit * 0.15);
        c.stroke();
      }
    });
    if (S.detail) {
      /* 双线回纹：内侧再压一道细线 */
      finePen(g, S, 0.4);
      for (x = x0; x < x0 + w; x += gap) {
        g.beginPath();
        g.moveTo(x + unit * 0.14, mid - unit * 0.36);
        g.lineTo(x + unit * 0.14, mid + unit * 0.36);
        g.stroke();
      }
      fineEnd(g);
    }
  }

  function paintScroll(g, S, x0, y0, w, h, rnd) {
    var n = Math.max(3, Math.round(w / 90)), i;
    g.strokeStyle = S.tone;
    for (i = 0; i < n; i++) {
      (function (i) {
        var cx = x0 + (i + 0.5) * (w / n), cy = y0 + h * 0.5, r = h * 0.3;
        ink(g, S, function (c) {
          c.beginPath();
          c.arc(cx, cy, r, Math.PI * 1.1, Math.PI * 2.5);
          c.stroke();
          c.beginPath();
          c.arc(cx + r * 0.5, cy + r * 0.55, r * 0.5, Math.PI, Math.PI * 2.6);
          c.stroke();
        });
      })(i);
    }
    if (S.detail) {
      /* 卷草：每个回旋中心点一个小涡，气息更细 */
      finePen(g, S, 0.42);
      for (i = 0; i < n; i++) {
        var cx2 = x0 + (i + 0.5) * (w / n), cy2 = y0 + h * 0.5, r2 = h * 0.3;
        g.beginPath();
        g.arc(cx2 - r2 * 0.18, cy2 - r2 * 0.1, r2 * 0.24, 0, Math.PI * 2);
        g.stroke();
      }
      fineEnd(g);
    }
  }

  function paintFish(g, S, x0, y0, w, h, rnd) {
    var n = 2, i;
    g.strokeStyle = S.tone;
    for (i = 0; i < n; i++) {
      (function (i) {
        var cx = x0 + (i + 0.5) * (w / n), cy = y0 + h * 0.5, L = h * 0.34;
        ink(g, S, function (c) {
          c.beginPath();
          c.moveTo(cx - L, cy);
          c.quadraticCurveTo(cx, cy - L * 0.62, cx + L, cy);
          c.quadraticCurveTo(cx, cy + L * 0.62, cx - L, cy);
          c.stroke();
          // 尾
          c.beginPath();
          c.moveTo(cx + L, cy);
          c.lineTo(cx + L * 1.5, cy - L * 0.4);
          c.moveTo(cx + L, cy);
          c.lineTo(cx + L * 1.5, cy + L * 0.4);
          c.stroke();
          // 眼
          c.beginPath();
          c.arc(cx - L * 0.62, cy - L * 0.08, 2.2, 0, Math.PI * 2);
          c.fillStyle = S.deep; c.fill();
        });
      })(i);
    }
    if (S.detail) {
      /* 鱼藻：鱼身细鳞 + 水藻点 */
      finePen(g, S, 0.38);
      for (i = 0; i < n; i++) {
        var cx3 = x0 + (i + 0.5) * (w / n), cy3 = y0 + h * 0.5, L3 = h * 0.34;
        for (var q = 0; q < 5; q++) {
          var sx = cx3 - L3 * 0.35 + q * L3 * 0.16;
          g.beginPath();
          g.arc(sx, cy3 - L3 * 0.12, L3 * 0.11, 0.2 * Math.PI, 0.8 * Math.PI);
          g.stroke();
        }
        g.beginPath();
        g.arc(cx3 + L3 * 0.2, cy3 + L3 * 0.34, 2.2, 0, Math.PI * 2);
        g.fill();
      }
      fineEnd(g);
    }
  }

  function paintTreasure(g, S, x0, y0, w, h, rnd) {
    var syms = ['circle', 'lozenge', 'leaf', 'book'], i;
    g.strokeStyle = S.tone;
    for (i = 0; i < 4; i++) {
      (function (i) {
        var cx = x0 + (i + 0.5) * (w / 4), cy = y0 + h * 0.5, r = h * 0.22;
        ink(g, S, function (c) {
          c.beginPath();
          if (syms[i % 4] === 'circle') c.arc(cx, cy, r, 0, Math.PI * 2);
          else if (syms[i % 4] === 'lozenge') {
            c.moveTo(cx, cy - r); c.lineTo(cx + r, cy);
            c.lineTo(cx, cy + r); c.lineTo(cx - r, cy); c.closePath();
          } else if (syms[i % 4] === 'leaf') {
            c.moveTo(cx - r, cy + r * 0.6);
            c.quadraticCurveTo(cx, cy - r * 1.2, cx + r, cy + r * 0.6);
          } else {
            c.rect(cx - r, cy - r * 0.7, r * 2, r * 1.4);
          }
          c.stroke();
        });
      })(i);
    }
    if (S.detail) {
      /* 八宝：每件宝物内压细排线，避免只剩几个空框 */
      finePen(g, S, 0.34);
      for (i = 0; i < 4; i++) {
        var cx4 = x0 + (i + 0.5) * (w / 4), cy4 = y0 + h * 0.5, r4 = h * 0.22;
        for (var q = -2; q <= 2; q++) {
          g.beginPath();
          g.moveTo(cx4 - r4 * 0.55, cy4 + q * r4 * 0.22);
          g.lineTo(cx4 + r4 * 0.55, cy4 + q * r4 * 0.22);
          g.stroke();
        }
      }
      fineEnd(g);
    }
  }

  /* 海水江崖：三层叠浪 + 浪花点 */
  function paintWave(g, S, x0, y0, w, h, rnd) {
    var rows = 3, k, i;
    g.strokeStyle = S.tone;
    for (k = 0; k < rows; k++) {
      (function (k) {
        var base = y0 + h * (0.32 + k * 0.19);
        var r = h * 0.10;
        var n = Math.max(3, Math.round(w / (r * 2.4)));
        ink(g, S, function (c) {
          for (i = -1; i <= n; i++) {
            c.beginPath();
            c.arc(x0 + i * (w / n) + r, base, r, Math.PI, Math.PI * 2);
            c.stroke();
          }
        });
      })(k);
    }
    if (S.detail) {
      finePen(g, S, 0.36);
      for (i = 0; i < 5; i++) {
        var dx = x0 + (i + 0.5) * w / 5;
        g.beginPath();
        g.arc(dx, y0 + h * 0.16, Math.max(1.6, h * 0.012), 0, Math.PI * 2);
        g.fill();
      }
      fineEnd(g);
    }
  }

  var PAINTERS = {
    vine: paintVine, dragon: paintDragon, cloud: paintCloud, hills: paintHills,
    meander: paintMeander, scroll: paintScroll, fish: paintFish, treasure: paintTreasure,
    wave: paintWave
  };
  /* 一个描述可能同时命中两个题材：按单元交替上花，画面更像「设计过」 */
  function catAt(cats, i) {
    if (typeof cats === 'string') return cats;
    if (!cats || !cats.length) return 'vine';
    return cats[((i % cats.length) + cats.length) % cats.length];
  }

  /* 馆藏母题单元：页面会把对应馆藏纹样的着色贴图传进来，
     这里只负责「重新构图」——缩放到单元内、按序号轻微旋转/缩放，避免死板重复。 */
  function drawMotifUnit(g, S, x, y, w, h, idx) {
    var src = (idx % 2 === 1 && S.motif2) ? S.motif2 : S.motif;
    if (!src) return false;
    var sc = S.motifScale || 1;
    var s = Math.min((w * 0.96) / src.width, (h * 0.96) / src.height) * sc * (0.95 + ((idx * 37) % 9) / 100);
    var dw = src.width * s, dh = src.height * s;
    /* 瘦长母题在通栏里容易留大空档：最多横向补到 88% 单元宽（限幅 22%，不破坏画意） */
    if (dw < w * 0.88) {
      var k2 = Math.min((w * 0.88) / dw, 1.22);
      dw *= k2;
      dh = Math.min(h * 0.98, dh * Math.min(k2, 1.08));
    }
    g.save();
    g.translate(x + w / 2, y + h / 2);
    g.rotate((((idx * 53) % 7) - 3) * 0.014);      // 每个单元 ±2.4° 的手作感
    if (S.mirror && (idx % 2 === 1)) g.scale(-1, 1); // 隔一个镜像，排布更像设计过的
    g.globalAlpha = 0.97;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, -dw / 2, -dh / 2, dw, dh);
    g.restore();
    return true;
  }

  /* ---------------- 布局绘制 ---------------- */
  /* 环形无缝：每个单元在 x、x±W 各绘一次，左右边缘完美衔接；cats 可为题材数组 */
  function paintLoop(g, W, H, S, cats, rnd) {
    var rows = S.rows, r, i;
    for (r = 0; r < rows; r++) {
      var rh = H / rows, y0 = r * rh;
      var unitW = W / S.units;
      for (i = -1; i <= S.units; i++) {
        if (drawMotifUnit(g, S, i * unitW, y0 + rh * 0.12, unitW, rh * 0.76, i)) continue;
        PAINTERS[catAt(cats, i + r)](g, S, i * unitW, y0 + rh * 0.12, unitW, rh * 0.76, rnd);
      }
      if (rows > 1 && r === 0) {
        // 清代繁密：上下两行错位半单元
        g.save();
        g.translate(unitW * 0.5, rh);
        for (i = -1; i <= S.units; i++) {
          if (drawMotifUnit(g, S, i * unitW, y0 + rh * 0.12, unitW, rh * 0.76, i + 1)) continue;
          PAINTERS[catAt(cats, i + 1)](g, S, i * unitW, y0 + rh * 0.12, unitW, rh * 0.76, rnd);
        }
        g.restore();
      }
    }
  }

  /* 窄幅边饰：上下界线 + 主题纹 + 角饰 */
  function paintBand(g, W, H, S, cats, rnd) {
    var m = H * 0.2;
    g.strokeStyle = S.tone;
    g.globalAlpha = 0.85;
    g.lineWidth = Math.max(1.5, S.lw * 0.4);
    g.beginPath();
    g.moveTo(0, m); g.lineTo(W, m);
    g.moveTo(0, H - m); g.lineTo(W, H - m);
    g.stroke();
    g.globalAlpha = 1;
    if (catAt(cats, 0) === 'meander' || catAt(cats, 0) === 'scroll') {
      PAINTERS[catAt(cats, 0)](g, S, 0, m, W, H - m * 2, rnd);
    } else {
      var unitW = W / (S.units + 1);
      for (var i = -1; i <= S.units + 1; i++) {
        if (drawMotifUnit(g, S, i * unitW, m, unitW, H - m * 2, i)) continue;
        PAINTERS[catAt(cats, i)](g, S, i * unitW, m, unitW, H - m * 2, rnd);
      }
    }
  }

  /* 团花居中：多层环瓣 + 中心小花，四周透明 */
  function paintMedallion(g, W, H, S, cats, rnd) {
    var cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.4;
    var sub = catAt(cats, 1);
    g.strokeStyle = S.tone;
    g.lineWidth = Math.max(1.5, S.lw * 0.45);
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx, cy, R * 0.8, 0, Math.PI * 2); g.stroke();
    var petals = 8, i, a;
    for (i = 0; i < petals; i++) {
      a = (i / petals) * Math.PI * 2;
      var px = cx + Math.cos(a) * R * 0.4, py = cy + Math.sin(a) * R * 0.4;
      if (sub && sub !== catAt(cats, 0)) PAINTERS[sub](g, S, px - R * 0.2, py - R * 0.2, R * 0.4, R * 0.4, rnd);
      else rosette(g, px, py, R * 0.22, 6, S, true);
    }
    // 中心主花：有馆藏母题时用它，否则程序化团花
    ink(g, S, function () {});
    if (!(S.motif && drawMotifUnit(g, S, cx - R * 0.62, cy - R * 0.62, R * 1.24, R * 1.24, 0))) {
      rosette(g, cx, cy, R * 0.34, 8, S, true);
    }
    if (S.detail) {
      for (i = 0; i < 16; i++) {
        a = (i / 16) * Math.PI * 2;
        g.beginPath();
        g.arc(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9, 2, 0, Math.PI * 2);
        g.fillStyle = S.deep; g.fill();
      }
    }
  }

  /* ============================================================
     ① generate：纹样设计主入口
     opts = { dynasty, free, brush, theme(描述), region, shape, layout, tone, seed }
     先做语义判断：与青花纹样无关的描述直接拒绝（rejected + reason），
     不浪费一次绘制，也让页面能提示用户重新输入。
     ============================================================ */
  function generate(opts) {
    var theme = (opts.theme || '').trim();
    var brief = parseBrief(theme);
    if (!brief.ok) return Promise.resolve({ rejected: true, reason: brief.reason });

    var free = !!opts.free;
    var dynasty = free ? '' : (opts.dynasty || '元代');
    var region = opts.region || 'belly';
    var layout = opts.layout === 'auto' || !opts.layout ? autoLayout(region) : opts.layout;
    var cats = brief.motifs.slice(0, 2);
    var S = styleOf(dynasty, opts.tone);
    var size = sizeFor(region, layout);

    /* 页面可传入馆藏母题贴图（与 cats 对应）：有母题时按母题重新构图，细节更足 */
    if (opts.motifs && opts.motifs.length) {
      S.motif = opts.motifs[0] || null;
      S.motif2 = opts.motifs[1] || null;
    }

    /* 笔意（自由创作）：写意 / 工笔 / 泼墨，只改画法不改题材 */
    var brush = BRUSH[opts.brush] || null;
    if (brush) {
      S.lw *= brush.lw;
      S.blur *= brush.blur;
      S.detail = brush.detail;
      S.units = clamp(S.units + brush.units, 2, 8);
    }

    /* 种子决定版式：同一个种子稳定，换「重绘」则换构图 */
    var seed = opts.seed != null ? opts.seed : hashStr(theme + '|' + dynasty + '|' + region + '|' + layout);
    var vr = mulberry32(seed);
    if (S.motif) {
      /* 有馆藏母题：单元数 / 缩放 / 镜像 / 微旋转全部由种子决定，
         重绘时不只是密度变化，母题与排布形状都会换（单行通景，避免双行挤碎细节） */
      S.units = 2 + Math.floor(vr() * 4);                    // 2~5 组
      S.rows = 1;
      S.motifScale = 0.86 + vr() * 0.3;
      S.mirror = vr() > 0.5;
      var kk = 1.4;                                          // 更高分辨率绘制，边缘更精致
      size = { w: Math.round(size.w * kk), h: Math.round(size.h * kk) };
      S.lw *= kk; S.blur *= kk;
    } else {
      S.units = clamp(S.units + Math.floor(vr() * 3) - 1, 2, 8);
      if (layout === 'loop' && !free) S.rows = 1 + (vr() > 0.72 ? 1 : 0);
    }
    S.lw = Math.max(2, S.lw * (0.9 + vr() * 0.25));

    var c = document.createElement('canvas');
    c.width = size.w; c.height = size.h;
    var g = c.getContext('2d');
    var rnd = mulberry32(seed ^ 0x9e3779b9);

    if (layout === 'medallion') paintMedallion(g, c.width, c.height, S, cats, rnd);
    else if (layout === 'band') paintBand(g, c.width, c.height, S, cats, rnd);
    else paintLoop(g, c.width, c.height, S, cats, rnd);

    /* 上下弦线收边：让自由生成的纹样也有「设计过」的边饰 */
    if (S.detail || free) {
      g.save();
      g.strokeStyle = S.tone;
      g.globalAlpha = 0.5;
      g.lineWidth = Math.max(1, S.lw * 0.2);
      var m = Math.max(2, c.height * 0.012);
      g.beginPath();
      g.moveTo(0, m); g.lineTo(c.width, m);
      g.moveTo(0, c.height - m); g.lineTo(c.width, c.height - m);
      g.stroke();
      g.restore();
    }

    var motifCN = {
      dragon: '龙凤', cloud: '云鹤', wave: '江海水波', hills: '山水',
      vine: '花卉', fish: '鱼藻', treasure: '八宝', meander: '回纹几何', scroll: '卷草'
    };
    var motifTxt = cats.map(function (k) { return motifCN[k] || '花卉'; }).join(' + ');
    var layoutCN = { loop: '环形平铺（横向无缝循环）', band: '窄幅边饰', medallion: '团花居中' }[layout];
    var brushTxt = brush ? ({ xieyi: '写意', gongbi: '工笔', pomo: '泼墨' }[opts.brush] || '写意') : '';
    var desc = '【' + (free ? 'AI 创作' : dynasty) + ' · ' + theme + '】AI 从描述中读出「' + motifTxt +
      '」' + (S.motif ? '，取馆藏母题重新构图' : '') + '，按' + layoutCN + '构图' + (brushTxt ? '，' + brushTxt + '笔意' : '') +
      '：单元 ' + S.units + ' 个、主笔 ' + S.lw.toFixed(1) + 'px、洇墨 ' + S.blur.toFixed(1) +
      'px' + (S.rows > 1 ? '，双行错位' : '') + (S.detail ? '，含细笔层次' : '') +
      '；透明背景，仅纹样不带器物本体，适合曲面 UV 映射。';

    return Promise.resolve({
      canvas: c,
      desc: desc,
      params: { layout: layout, cat: cats[0], motifs: cats, units: S.units, lw: S.lw, rows: S.rows, seed: seed }
    });
  }

  /* ============================================================
     ② uvCorrect：UV 预畸变校正（逐行按半径横向预拉伸）
     radiusAt(frac 0..1) → 该行半径 / 区域最大半径
     ============================================================ */
  function uvCorrect(canvas, radiusAt, isLoop) {
    var W = canvas.width, H = canvas.height;
    var out = document.createElement('canvas');
    out.width = W; out.height = H;
    var g = out.getContext('2d');

    var BAND = 2, maxStretch = 1, adjusted = 0, y, frac, r, s;
    for (y = 0; y < H; y += BAND) {
      frac = Math.min(1, (y + BAND / 2) / H);
      r = radiusAt ? radiusAt(frac) : 1;
      s = clamp(1 / Math.max(r, 0.34), 1, isLoop === false ? 1.12 : 1.85);
      if (s > maxStretch) maxStretch = s;
      if (s > 1.06) adjusted++;
      var sw = W * s, cx = W / 2;
      if (isLoop === false) {
        // 非环形（团花）：居中缩放即可
        g.drawImage(canvas, 0, y, W, BAND, cx - sw / 2, y, sw, BAND);
      } else {
        // 环形：左右各多绘一遍，保持横向无缝
        g.drawImage(canvas, 0, y, W, BAND, cx - sw / 2 - W, y, sw, BAND);
        g.drawImage(canvas, 0, y, W, BAND, cx - sw / 2, y, sw, BAND);
        g.drawImage(canvas, 0, y, W, BAND, cx - sw / 2 + W, y, sw, BAND);
      }
    }
    var notes = 'UV 预畸变校正：以区域最大半径为基准，收口行横向预拉伸至 ×' +
      maxStretch.toFixed(2) + '，补偿行数 ' + adjusted + '（曲率疏密补偿），包裹后无挤压变形。';
    return { canvas: out, notes: notes, maxStretch: maxStretch, adjustedRows: adjusted };
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------------- 对外接口 ---------------- */
  function generateVia(opts) {
    if (cfg.endpoint) {
      return fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'pattern_uv',
          dynasty: opts.dynasty, theme: opts.theme,
          region: opts.region, shape: opts.shape,
          layout: opts.layout === 'auto' ? autoLayout(opts.region) : opts.layout,
          tone: opts.tone
        })
      }).then(function (res) { return res.json(); }).then(function (json) {
        // 约定返回 { image: dataURL, desc }
        return new Promise(function (resolve, reject) {
          var img = new Image();
          img.onload = function () {
            var c = document.createElement('canvas');
            c.width = img.width; c.height = img.height;
            c.getContext('2d').drawImage(img, 0, 0);
            resolve({ canvas: c, desc: json.desc || '远端生成纹样', params: json.params || {} });
          };
          img.onerror = reject;
          img.src = json.image;
        });
      });
    }
    return generate(opts);
  }

  window.AITexture = {
    configure: configure,
    generate: generateVia,
    generateLocal: generate,
    parseBrief: parseBrief,
    uvCorrect: uvCorrect,
    autoLayout: autoLayout,
    catFromTheme: catFromTheme
  };
})();
