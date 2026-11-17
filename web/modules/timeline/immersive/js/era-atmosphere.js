/* =====================================================================
   青花瓷 · 时间长廊 —— 宫廷空间氛围模块（era-atmosphere.js）
   ---------------------------------------------------------------------
   目标（不破坏「中线单向前进 + 左右墙随朝代变化」的前提下）：
     一、地面：逐朝代材质（金砖 / 青砖 / 深石砖 / 大理石）+ 地毯带
                 + 朝代分界细线 + 中线引导线 + 年代浮雕刻度
     二、顶部：逐朝代梁架 / 藻井 / 帷幔（彩绘、素木、暗金、龙凤、如意）
     三、墙面：给每张图加宫廷装饰框（外框 + 内线 + 标题小牌）+ 墙面底纹 + 墙裙
     四、灯光：逐朝代的壁灯 + 藻井灯 + 洗墙灯（颜色 / 强度 / 氛围各不同）
     五、节点：每段入口一道拱门（门上写朝代名 + 内侧光晕）

   设计约束：
     - 全部用 CanvasTexture + 基础几何体程序化生成，零外部资源、零模型加载
     - 每个朝代是一个 THREE.Group，创建一次，切换时只改材质颜色 / 灯光参数
     - 所有颜色都通过 lerp 平滑过渡，不瞬间跳变
     - 低配模式（CONFIG.ATMOSPHERE.lowPerf）自动减少梁架 / 壁灯数量

   对外接口：
     window.EraAtmosphere.build(scene, ctx)   → 构建全部朝代空间
     window.EraAtmosphere.apply(data, index)  → 应用某朝代氛围（渐变目标）
     window.EraAtmosphere.update(dt)          → 每帧平滑插值
   ===================================================================== */
(function () {
  'use strict';

  /* ===================================================================
     一、逐朝代风格总表
     -------------------------------------------------------------------
     每个朝代给地面 / 顶部 / 墙面 / 灯光四组风格参数。
     颜色统一用十六进制数字，便于 THREE.Color 直接使用。
     =================================================================== */
  var ERA_STYLE = {
    // ---------------- 唐：盛唐宫廷 · 开放华丽 ----------------
    tang: {
      label: '唐',
      floor: {
        kind: 'brick',                 // brick=砖地 | stone=石板 | marble=大理石
        base: 0xa8763f,                // 暖金地砖
        grout: 0x6b4626,               // 砖缝（深棕）
        tint: 0xc2562f,                // 朱红点缀（砖角线）
        carpet: true,                  // 中央朱红地毯带
        carpetBase: 0x9c3b2c,
        carpetEdge: 0xd8b46a
      },
      ceiling: {
        kind: 'beam',                  // beam=梁架 | caisson=藻井
        beamColor: 0x8a5a30,           // 木构梁架
        accent: 0xc99a4e,              // 彩绘描金
        panelColor: 0xd7c19a,          // 梁间彩绘底色
        pattern: 'scroll',             // scroll=卷草 | lotus=莲纹 | plain=素
        drape: true                    // 少量帷幔
      },
      wall: {
        bg: 0xb98a58,                  // 墙面底纹色
        pattern: 'baoxiang',           // 宝相花
        frameOuter: 0x6b4626,          // 木框
        frameInner: 0xd8b46a,          // 金线
        skirt: 0x7a4a26,               // 墙裙
        plaque: 0x5c3317               // 标题小牌
      },
      light: {
        wall: 0xffd9a0,                // 壁灯暖金
        coffer: 0xffca7a,              // 藻井暖金圆形光晕
        ambience: 0xffe0b0,
        wallI: 1.15,
        cofferI: 1.45,
        washI: 0.50
      }
    },

    // ---------------- 宋：素雅文人 · 克制安静 ----------------
    song: {
      label: '宋',
      floor: {
        kind: 'brick',
        base: 0x9aa0a2,                // 青灰砖
        grout: 0x6f7679,
        tint: 0xb8bec0,
        carpet: false,
        carpetBase: 0x9aa0a2,
        carpetEdge: 0xaab0b2
      },
      ceiling: {
        kind: 'beam',
        beamColor: 0x8d8478,           // 素雅木构
        accent: 0xa8a094,
        panelColor: 0xd9d6cd,
        pattern: 'plain',              // 简洁藻纹（素）
        drape: false
      },
      wall: {
        bg: 0xa9b0b2,
        pattern: 'lotus',              // 素雅莲纹
        frameOuter: 0x6f7679,          // 石/木框
        frameInner: 0xb9c2c3,          // 浅青线
        skirt: 0x8a9194,
        plaque: 0x63696c
      },
      light: {
        wall: 0xdfeaf0,                // 石灯冷白
        coffer: 0xd8e8f0,              // 冷白柔光
        ambience: 0xdcecf2,
        wallI: 0.72,
        cofferI: 0.85,
        washI: 0.34
      }
    },

    // ---------------- 元：雄浑厚重 · 草原宫廷 ----------------
    yuan: {
      label: '元',
      floor: {
        kind: 'stone',
        base: 0x4a4c50,                // 深灰石砖
        grout: 0x2c2e31,
        tint: 0x8a6b2e,                // 暗金
        carpet: true,
        carpetBase: 0x3b3d42,
        carpetEdge: 0x9a7b34
      },
      ceiling: {
        kind: 'beam',
        beamColor: 0x33353a,           // 深色横梁
        accent: 0x8a6b2e,              // 暗金纹饰
        panelColor: 0x585a60,
        pattern: 'geo',                // 游牧几何纹
        drape: true
      },
      wall: {
        bg: 0x5c5f66,
        pattern: 'dragon',             // 云龙纹
        frameOuter: 0x2f3135,
        frameInner: 0x9a7b34,
        skirt: 0x3a3c41,
        plaque: 0x24262a
      },
      light: {
        wall: 0xe8eef5,                // 冷白
        coffer: 0xd8c98a,              // 暗金聚光
        ambience: 0xcfd6dd,
        wallI: 1.05,
        cofferI: 1.60,                 // 强聚光
        washI: 0.46
      }
    },

    // ---------------- 明：规整庄重 · 礼制感 ----------------
    ming: {
      label: '明',
      floor: {
        kind: 'brick',
        base: 0xc9a55a,                // 明式金砖
        grout: 0x6d4f28,
        tint: 0xb03a2e,                // 朱红边线
        carpet: true,
        carpetBase: 0x8e2f27,
        carpetEdge: 0xd9b969
      },
      ceiling: {
        kind: 'caisson',               // 规整藻井
        beamColor: 0x7a3b2e,           // 朱红梁
        accent: 0xd4af5c,              // 金
        panelColor: 0xd8c07a,
        pattern: 'dragon',             // 龙凤 / 祥云
        drape: false
      },
      wall: {
        bg: 0xc8a771,
        pattern: 'lianhua',            // 缠枝莲 + 祥云
        frameOuter: 0x7a3b2e,          // 朱红木框
        frameInner: 0xd4af5c,          // 金线
        skirt: 0x8a4232,
        plaque: 0x5c2a20
      },
      light: {
        wall: 0xffe0b4,                // 暖白 + 朱红反射
        coffer: 0xffd089,              // 对称光环
        ambience: 0xf6e2c0,
        wallI: 1.20,
        cofferI: 1.35,
        washI: 0.52
      }
    },

    // ---------------- 清：华丽精细 · 华贵细腻 ----------------
    qing: {
      label: '清',
      floor: {
        kind: 'marble',
        base: 0xd9dfe0,                // 青白大理石
        grout: 0xa9b2b4,
        tint: 0xd9c489,                // 浅金
        carpet: true,
        carpetBase: 0xc7cccb,
        carpetEdge: 0xd9c489
      },
      ceiling: {
        kind: 'caisson',               // 繁复藻井
        beamColor: 0x2f4d6b,           // 青金
        accent: 0xd9c489,              // 浅金
        panelColor: 0xe8e4d8,          // 米白
        pattern: 'ruyi',               // 如意 / 云纹
        drape: false
      },
      wall: {
        bg: 0xb8ced0,
        pattern: 'ruyi',
        frameOuter: 0x2f4d6b,          // 青金框
        frameInner: 0xd9c489,
        skirt: 0x3a5a78,
        plaque: 0x24405c
      },
      light: {
        wall: 0xf0f6f6,                // 青白琉璃
        coffer: 0xfff0c8,              // 精致莲纹光效
        ambience: 0xeaf4f4,
        wallI: 1.05,
        cofferI: 1.20,
        washI: 0.44
      }
    },

    // ---------------- 民国：文人灰调 · 中西交融 ----------------
    minguo: {
      label: '民国',
      floor: {
        kind: 'stone',
        base: 0x7d7a74,                // 水磨石 / 灰石
        grout: 0x56544f,
        tint: 0xa8a094,
        carpet: true,
        carpetBase: 0x6b6862,
        carpetEdge: 0xb0a894
      },
      ceiling: {
        kind: 'beam',
        beamColor: 0x6a6058,           // 深棕木
        accent: 0x9a8f7e,
        panelColor: 0xd4cec2,
        pattern: 'plain',
        drape: true
      },
      wall: {
        bg: 0xb0aca2,
        pattern: 'lotus',              // 素莲（文人气）
        frameOuter: 0x5c5348,
        frameInner: 0xa8a094,
        skirt: 0x6e6558,
        plaque: 0x4a4238
      },
      light: {
        wall: 0xf2efe6,                // 暖白台灯
        coffer: 0xece6d8,
        ambience: 0xf0ece2,
        wallI: 0.88,
        cofferI: 0.95,
        washI: 0.40
      }
    },

    // ---------------- 现代：明净青白 · 非遗当代 ----------------
    modern: {
      label: '现代',
      floor: {
        kind: 'marble',
        base: 0xe4ebea,                // 浅青白石材
        grout: 0xb6c2c1,
        tint: 0xa8c4c0,                // 青瓷色
        carpet: true,
        carpetBase: 0xd6e2e0,
        carpetEdge: 0x8fb2ad
      },
      ceiling: {
        kind: 'caisson',
        beamColor: 0x5f7d80,           // 青瓷梁
        accent: 0xa8c4c0,
        panelColor: 0xeef4f3,
        pattern: 'ruyi',
        drape: false
      },
      wall: {
        bg: 0xcadedc,
        pattern: 'lianhua',
        frameOuter: 0x4a686b,
        frameInner: 0xa8c4c0,
        skirt: 0x5b7a7d,
        plaque: 0x3d585b
      },
      light: {
        wall: 0xf2fbfa,
        coffer: 0xe4f6f4,
        ambience: 0xeefaf8,
        wallI: 0.95,
        cofferI: 1.05,
        washI: 0.42
      }
    }
  };

  // 兜底风格（若某朝代 era 未在表内）
  var FALLBACK_STYLE = ERA_STYLE.ming;

  /* ===================================================================
     二、通用工具：Canvas 程序化纹理
     =================================================================== */

  function hex(n) {
    return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6);
  }
  function rgba(n, a) {
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function newCanvas(size) {
    var cv = document.createElement('canvas');
    cv.width = cv.height = size;
    return cv;
  }

  function finishTex(cv, repeatX, repeatY) {
    var tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    if (repeatX || repeatY) tex.repeat.set(repeatX || 1, repeatY || 1);
    tex.anisotropy = 4;
    return tex;
  }

  /* -------------------------------------------------------------------
     地面纹理：按 kind 生成砖 / 石 / 大理石
     ------------------------------------------------------------------- */
  function makeFloorTexture(style, spec) {
    var cv = newCanvas(256);
    var ctx = cv.getContext('2d');
    var f = style.floor;

    // 底色
    ctx.fillStyle = hex(f.base);
    ctx.fillRect(0, 0, 256, 256);

    // 细腻噪点（石材质感）
    var i, x, y;
    for (i = 0; i < 1400; i++) {
      x = Math.random() * 256; y = Math.random() * 256;
      var v = (Math.random() - 0.5) * 26;
      ctx.fillStyle = 'rgba(' + (v > 0 ? 255 : 0) + ',' + (v > 0 ? 255 : 0) + ',' + (v > 0 ? 255 : 0) + ',' + Math.abs(v) / 255 + ')';
      ctx.fillRect(x, y, 1.4, 1.4);
    }

    if (f.kind === 'brick') {
      // 砖缝：4×4 错缝
      var cols = 4, rows = 4, cw = 256 / cols, ch = 256 / rows;
      ctx.strokeStyle = rgba(f.grout, 0.9);
      ctx.lineWidth = 3;
      for (var r = 0; r < rows; r++) {
        ctx.beginPath(); ctx.moveTo(0, r * ch); ctx.lineTo(256, r * ch); ctx.stroke();
        var off = (r % 2) * (cw / 2);
        for (var c = 0; c <= cols; c++) {
          var xx = c * cw + off;
          ctx.beginPath(); ctx.moveTo(xx, r * ch); ctx.lineTo(xx, (r + 1) * ch); ctx.stroke();
        }
      }
      // 砖面高光
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (var rr = 0; rr < rows; rr++) {
        for (var cc = 0; cc < cols; cc++) {
          ctx.fillRect(cc * cw + 6, rr * ch + 6, cw - 12, 5);
        }
      }
    } else if (f.kind === 'stone') {
      // 大块石板：3×3
      var n = 3, s = 256 / n;
      ctx.strokeStyle = rgba(f.grout, 0.95);
      ctx.lineWidth = 4;
      for (var k = 0; k <= n; k++) {
        ctx.beginPath(); ctx.moveTo(0, k * s); ctx.lineTo(256, k * s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(k * s, 0); ctx.lineTo(k * s, 256); ctx.stroke();
      }
      // 石纹裂线
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1.5;
      for (var q = 0; q < 5; q++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * 256, Math.random() * 256);
        ctx.lineTo(Math.random() * 256, Math.random() * 256);
        ctx.stroke();
      }
    } else {
      // 大理石：柔和纹理
      var g = ctx.createLinearGradient(0, 0, 256, 256);
      g.addColorStop(0, hex(f.base));
      g.addColorStop(0.5, rgba(f.tint, 0.35));
      g.addColorStop(1, hex(f.base));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);

      ctx.strokeStyle = rgba(f.grout, 0.75);
      ctx.lineWidth = 1.4;
      for (var m = 0; m < 7; m++) {
        ctx.beginPath();
        var px = Math.random() * 256, py = Math.random() * 256;
        ctx.moveTo(px, py);
        for (var t = 0; t < 4; t++) {
          px += (Math.random() - 0.5) * 90;
          py += (Math.random() - 0.5) * 90;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      // 石缝
      ctx.strokeStyle = rgba(f.grout, 0.9);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(128, 0); ctx.lineTo(128, 256); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 128); ctx.lineTo(256, 128); ctx.stroke();
    }

    // 朱红/金 点缀角线
    ctx.strokeStyle = rgba(f.tint, 0.35);
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 254, 254);

    return cv;
  }

  /* -------------------------------------------------------------------
     地毯纹理：中央宫廷地毯带（元/明/清/民国/现代）
     ------------------------------------------------------------------- */
  function makeCarpetTexture(style) {
    var cv = newCanvas(256);
    var ctx = cv.getContext('2d');
    var f = style.floor;

    ctx.fillStyle = hex(f.carpetBase);
    ctx.fillRect(0, 0, 256, 256);

    // 外圈边饰
    ctx.strokeStyle = rgba(f.carpetEdge, 0.85);
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, 236, 236);
    ctx.lineWidth = 3;
    ctx.strokeRect(24, 24, 208, 208);

    // 中央方胜 / 团花 纹（低密度，避免干扰性能与观感）
    var cx = 128, cy = 128;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = rgba(f.carpetEdge, 0.7);
    ctx.lineWidth = 2.4;
    for (var ring = 0; ring < 3; ring++) {
      var rad = 30 + ring * 24;
      ctx.beginPath();
      for (var a = 0; a <= 8; a++) {
        var ang = a / 8 * Math.PI * 2;
        // 八瓣花形
        var rr = rad * (1 + 0.16 * Math.cos(ang * 8));
        var px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
    // 四角方胜
    ctx.lineWidth = 2;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
      ctx.beginPath();
      ctx.moveTo(s[0] * 74, s[1] * 74);
      ctx.lineTo(s[0] * 92, s[1] * 74);
      ctx.lineTo(s[0] * 92, s[1] * 56);
      ctx.lineTo(s[0] * 74, s[1] * 56);
      ctx.closePath();
      ctx.stroke();
    });
    ctx.restore();

    return cv;
  }

  /* -------------------------------------------------------------------
     顶部纹理：梁间彩绘板（卷草 / 莲纹 / 几何 / 龙凤 / 如意 / 素）
     ------------------------------------------------------------------- */
  function makeCeilingPanelTexture(style) {
    var cv = newCanvas(256);
    var ctx = cv.getContext('2d');
    var c = style.ceiling;

    ctx.fillStyle = hex(c.panelColor);
    ctx.fillRect(0, 0, 256, 256);

    // 底噪
    for (var i = 0; i < 500; i++) {
      ctx.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.05) + ')';
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }

    ctx.strokeStyle = rgba(c.accent, 0.62);
    ctx.fillStyle = rgba(c.accent, 0.35);
    ctx.lineWidth = 2.6;

    var p = c.pattern;
    if (p === 'scroll') {
      // 卷草纹：连续 S 形藤蔓
      for (var row = 0; row < 4; row++) {
        var yy = 34 + row * 62;
        ctx.beginPath();
        for (var x = 0; x <= 256; x += 4) {
          var y = yy + Math.sin(x / 26 + row) * 14;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        // 叶芽
        for (var bx = 16; bx < 256; bx += 52) {
          ctx.beginPath();
          ctx.ellipse(bx, yy + Math.sin(bx / 26 + row) * 14, 9, 5, 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (p === 'lotus') {
      // 莲纹：对称莲瓣
      for (var lr = 0; lr < 2; lr++) {
        var ly = 70 + lr * 116;
        for (var lx = 30; lx < 256; lx += 62) {
          ctx.beginPath();
          ctx.moveTo(lx, ly + 22);
          ctx.quadraticCurveTo(lx + 16, ly - 20, lx + 32, ly + 22);
          ctx.quadraticCurveTo(lx + 16, ly + 10, lx, ly + 22);
          ctx.stroke();
        }
      }
    } else if (p === 'geo') {
      // 游牧几何纹：菱形 + 折线
      ctx.lineWidth = 2.2;
      for (var gr = 0; gr < 4; gr++) {
        for (var gc = 0; gc < 4; gc++) {
          var gx = 32 + gc * 64, gy = 32 + gr * 64;
          ctx.beginPath();
          ctx.moveTo(gx, gy - 16); ctx.lineTo(gx + 16, gy);
          ctx.lineTo(gx, gy + 16); ctx.lineTo(gx - 16, gy);
          ctx.closePath(); ctx.stroke();
        }
      }
      ctx.beginPath();
      for (var zx = 0; zx <= 256; zx += 32) {
        ctx.moveTo(zx, 0); ctx.lineTo(zx + 16, 12); ctx.lineTo(zx + 32, 0);
      }
      ctx.stroke();
    } else if (p === 'dragon') {
      // 祥云 + 龙凤简化：云头 + 流线
      ctx.lineWidth = 2.4;
      for (var dr = 0; dr < 3; dr++) {
        var dx0 = 40 + dr * 30, dy0 = 50 + dr * 76;
        // 云头
        ctx.beginPath();
        ctx.arc(dx0, dy0, 16, Math.PI * 0.9, Math.PI * 2.1);
        ctx.arc(dx0 + 22, dy0 - 6, 12, Math.PI, Math.PI * 2);
        ctx.stroke();
        // 云尾流线
        ctx.beginPath();
        ctx.moveTo(dx0 + 34, dy0 + 2);
        for (var sx = 0; sx < 150; sx += 6) {
          ctx.lineTo(dx0 + 34 + sx, dy0 + 2 + Math.sin(sx / 18) * 8);
        }
        ctx.stroke();
      }
    } else if (p === 'ruyi') {
      // 如意云纹
      ctx.lineWidth = 2.4;
      for (var yr = 0; yr < 3; yr++) {
        for (var yc = 0; yc < 2; yc++) {
          var ux = 64 + yc * 128, uy = 48 + yr * 82;
          ctx.beginPath();
          ctx.arc(ux, uy, 18, Math.PI * 0.85, Math.PI * 2.15);
          ctx.arc(ux - 20, uy + 6, 12, Math.PI * 1.1, Math.PI * 2.4);
          ctx.arc(ux + 20, uy + 6, 12, Math.PI * 0.6, Math.PI * 1.9);
          ctx.stroke();
        }
      }
    }
    // 'plain' → 素面，不加纹样

    // 板边金线
    ctx.strokeStyle = rgba(c.accent, 0.8);
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, 244, 244);

    return cv;
  }

  /* -------------------------------------------------------------------
     藻井中心纹理（明/清/现代）：同心方框 + 中心圆
     ------------------------------------------------------------------- */
  function makeCaissonTexture(style) {
    var cv = newCanvas(256);
    var ctx = cv.getContext('2d');
    var c = style.ceiling;

    ctx.fillStyle = hex(c.beamColor);
    ctx.fillRect(0, 0, 256, 256);

    // 同心方框（层层向内）
    for (var i = 0; i < 5; i++) {
      var m = 14 + i * 22;
      ctx.strokeStyle = i % 2 === 0 ? rgba(c.accent, 0.9) : rgba(c.panelColor, 0.9);
      ctx.lineWidth = 5 - i * 0.5;
      ctx.strokeRect(m, m, 256 - m * 2, 256 - m * 2);
    }
    // 四角小方
    [[44, 44], [212, 44], [44, 212], [212, 212]].forEach(function (p) {
      ctx.fillStyle = rgba(c.accent, 0.75);
      ctx.fillRect(p[0] - 8, p[1] - 8, 16, 16);
    });
    // 中心圆（莲心）
    ctx.beginPath();
    ctx.arc(128, 128, 26, 0, Math.PI * 2);
    ctx.fillStyle = rgba(c.accent, 0.9);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(128, 128, 14, 0, Math.PI * 2);
    ctx.fillStyle = rgba(c.panelColor, 0.95);
    ctx.fill();

    return cv;
  }

  /* -------------------------------------------------------------------
     墙面底纹（低透明度）：宝相花 / 莲纹 / 云龙 / 缠枝莲 / 如意
     ------------------------------------------------------------------- */
  function makeWallBgTexture(style) {
    var cv = newCanvas(256);
    var ctx = cv.getContext('2d');
    var w = style.wall;

    ctx.fillStyle = hex(w.bg);
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = rgba(w.frameInner, 0.55);
    ctx.lineWidth = 2;
    var p = w.pattern;

    if (p === 'baoxiang') {
      // 宝相花：多层花瓣
      for (var br = 0; br < 2; br++) {
        for (var bc = 0; bc < 2; bc++) {
          var bx = 64 + bc * 128, by = 64 + br * 128;
          for (var petal = 0; petal < 8; petal++) {
            var ang = petal / 8 * Math.PI * 2;
            ctx.beginPath();
            ctx.ellipse(bx + Math.cos(ang) * 26, by + Math.sin(ang) * 26, 15, 8, ang, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.beginPath(); ctx.arc(bx, by, 9, 0, Math.PI * 2); ctx.stroke();
        }
      }
    } else if (p === 'lotus') {
      // 素雅莲纹（竖向重复）
      for (var ly = 40; ly < 256; ly += 84) {
        for (var lx = 32; lx < 256; lx += 78) {
          ctx.beginPath();
          ctx.moveTo(lx, ly + 26);
          ctx.quadraticCurveTo(lx + 18, ly - 22, lx + 36, ly + 26);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(lx + 18, ly + 26);
          ctx.lineTo(lx + 18, ly + 40);
          ctx.stroke();
        }
      }
    } else if (p === 'dragon') {
      // 云龙纹：云头 + 龙鳞弧
      for (var dr = 0; dr < 3; dr++) {
        for (var dc = 0; dc < 2; dc++) {
          var dx = 60 + dc * 128, dy = 46 + dr * 84;
          ctx.beginPath();
          ctx.arc(dx, dy, 20, Math.PI * 0.8, Math.PI * 2.2);
          ctx.arc(dx + 26, dy - 8, 14, Math.PI, Math.PI * 2);
          ctx.stroke();
        }
      }
      // 龙鳞带
      for (var sc = 0; sc < 8; sc++) {
        ctx.beginPath();
        ctx.arc(20 + sc * 32, 236, 16, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
    } else if (p === 'lianhua') {
      // 缠枝莲：连续藤蔓 + 花头
      for (var row = 0; row < 3; row++) {
        var yy = 44 + row * 84;
        ctx.beginPath();
        for (var x = 0; x <= 256; x += 6) {
          var y = yy + Math.sin(x / 30 + row * 1.6) * 16;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        for (var fx = 30; fx < 256; fx += 84) {
          ctx.beginPath();
          ctx.arc(fx, yy + Math.sin(fx / 30 + row * 1.6) * 16, 11, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    } else if (p === 'ruyi') {
      // 如意 + 回纹
      for (var yr = 0; yr < 3; yr++) {
        for (var yc = 0; yc < 3; yc++) {
          var ux = 44 + yc * 84, uy = 44 + yr * 84;
          ctx.beginPath();
          ctx.arc(ux, uy, 14, Math.PI * 0.85, Math.PI * 2.15);
          ctx.arc(ux - 15, uy + 5, 9, Math.PI * 1.1, Math.PI * 2.4);
          ctx.arc(ux + 15, uy + 5, 9, Math.PI * 0.6, Math.PI * 1.9);
          ctx.stroke();
        }
      }
      // 回纹边
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      for (var rx = 8; rx < 256; rx += 28) {
        ctx.moveTo(rx, 8); ctx.lineTo(rx + 16, 8); ctx.lineTo(rx + 16, 20); ctx.lineTo(rx + 6, 20);
      }
      ctx.stroke();
    }

    return cv;
  }

  /* -------------------------------------------------------------------
     标题小牌纹理（朝代章纹 + 文字，如「器物 · 唐青花」）
     ------------------------------------------------------------------- */
  function makePlaqueTexture(text, style, sub) {
    var W = 256, H = 84;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    var w = style.wall;

    // 牌底
    ctx.fillStyle = hex(w.plaque);
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = rgba(w.frameInner, 0.95);
    ctx.lineWidth = 4;
    ctx.strokeRect(5, 5, W - 10, H - 10);
    ctx.lineWidth = 2;
    ctx.strokeRect(13, 13, W - 26, H - 26);

    ctx.fillStyle = rgba(w.frameInner, 0.96);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 34px "Songti SC", "SimSun", serif';
    ctx.fillText(text, W / 2, sub ? H / 2 - 10 : H / 2);
    if (sub) {
      ctx.font = '400 20px "Songti SC", "SimSun", serif';
      ctx.fillStyle = rgba(w.frameInner, 0.72);
      ctx.fillText(sub, W / 2, H / 2 + 20);
    }
    return cv;
  }

  /* -------------------------------------------------------------------
     朝代章纹（地面方胜纹 / 段首铺地）
     ------------------------------------------------------------------- */
  function makeEmblemTexture(style) {
    var cv = newCanvas(256);
    var ctx = cv.getContext('2d');
    var w = style.wall;
    ctx.clearRect(0, 0, 256, 256);

    ctx.strokeStyle = rgba(w.frameInner, 0.85);
    ctx.lineWidth = 6;
    // 外方
    ctx.strokeRect(40, 40, 176, 176);
    ctx.lineWidth = 3;
    ctx.strokeRect(60, 60, 136, 136);
    // 内方胜（旋转 45°）
    ctx.beginPath();
    ctx.moveTo(128, 46); ctx.lineTo(210, 128);
    ctx.lineTo(128, 210); ctx.lineTo(46, 128);
    ctx.closePath();
    ctx.stroke();
    // 中心
    ctx.beginPath();
    ctx.arc(128, 128, 20, 0, Math.PI * 2);
    ctx.stroke();
    // 四向短线
    [[128, 40, 128, 74], [128, 182, 128, 216], [40, 128, 74, 128], [182, 128, 216, 128]].forEach(function (l) {
      ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(l[2], l[3]); ctx.stroke();
    });
    return cv;
  }

  /* -------------------------------------------------------------------
     地面年代刻度（浮雕感文字，如「618 — 907  唐」）
     ------------------------------------------------------------------- */
  function makeEraMarkTexture(data, style) {
    var S = 320;
    var cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, S, S);

    var w = style.wall;
    var span = data.eraSpan || '';
    var name = data.name || '';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 浮雕：先暗后亮描边，模拟石刻凹刻感
    function drawText(t, y, font) {
      ctx.font = font;
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillText(t, S / 2 + 2, y + 2);
      ctx.strokeStyle = rgba(w.frameInner, 0.55);
      ctx.lineWidth = 3;
      ctx.strokeText(t, S / 2, y);
      ctx.fillStyle = 'rgba(255,255,255,0.34)';
      ctx.fillText(t, S / 2, y);
    }

    // 年份
    drawText(span, S * 0.38, '600 52px "Songti SC", "SimSun", serif');
    // 分界短线
    ctx.strokeStyle = rgba(w.frameInner, 0.5);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(S * 0.30, S * 0.52); ctx.lineTo(S * 0.70, S * 0.52);
    ctx.stroke();
    // 朝代名
    drawText(name, S * 0.66, '700 66px "Songti SC", "SimSun", serif');

    return cv;
  }

  /* -------------------------------------------------------------------
     拱门门楣朝代名牌（横匾）
     ------------------------------------------------------------------- */
  function makeGatePlaqueTexture(name, style) {
    var W = 512, H = 160;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    var c = style.ceiling;

    // 匾底（渐变木/石）
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgba(c.beamColor, 1));
    g.addColorStop(1, rgba(c.beamColor, 0.72));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 双层金边
    ctx.strokeStyle = rgba(c.accent, 0.95);
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, W - 16, H - 16);
    ctx.lineWidth = 3;
    ctx.strokeRect(22, 22, W - 44, H - 44);

    // 四角回纹
    ctx.lineWidth = 4;
    [[34, 34], [W - 34, 34], [34, H - 34], [W - 34, H - 34]].forEach(function (p) {
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(p[0] + (p[0] < W / 2 ? 26 : -26), p[1]);
      ctx.stroke();
    });

    // 朝代名（大字）
    ctx.fillStyle = rgba(c.accent, 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 92px "Songti SC", "SimSun", serif';
    ctx.fillText(name, W / 2, H / 2 + 4);

    return cv;
  }

  /* ===================================================================
     三、构建朝代空间
     =================================================================== */

  // 全局上下文（由 build 注入）
  var CTX = null;
  var spaces = [];      // 每个朝代一个空间组
  var current = null;   // 当前生效的风格（插值用）

  function styleOf(data) {
    return ERA_STYLE[data.era] || FALLBACK_STYLE;
  }

  /**
   * 构建单个朝代的全部空间元素
   * @param {Object} data dynastyList 条目（含 positionTrigger.z / _segLen）
   */
  function buildEraSpace(data) {
    var A = CTX.CONFIG.ATMOSPHERE;
    var style = styleOf(data);
    var group = new THREE.Group();
    group.name = 'era-space-' + data.era;

    var HALL = CTX.CONFIG.HALL;
    var halfW = HALL.width / 2;
    var segLen = data._segLen || CTX.CONFIG.WALL.segmentLength;
    var zEnd = data.positionTrigger.z;        // 靠近玩家起点的一侧（数值大）
    var zStart = zEnd - segLen;               // 更深处
    var centerZ = (zEnd + zStart) / 2;
    var wallH = CTX.CONFIG.WALL.height;

    var lowPerf = A.lowPerf;

    /* ---------- ① 地面分段（覆盖在基础地面上方一点点，避免 z-fighting） ---------- */
    var floorTex = null;
    if (A.useCanvasTextures) {
      var cv = makeFloorTexture(style);
      floorTex = finishTex(cv, 2, Math.max(1, Math.round(segLen / 6)));
    }
    var floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      color: floorTex ? 0xffffff : style.floor.base,
      roughness: 0.9,
      metalness: 0.04
    });
    var floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(HALL.width, segLen), floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(0, 0.015, centerZ);
    floorMesh.receiveShadow = true;
    group.add(floorMesh);

    /* ---------- ② 中央地毯带（元/明/清/民国/现代） ---------- */
    var carpetMesh = null;
    if (style.floor.carpet) {
      var carpetW = HALL.width * A.floor.carpetRatio;
      var cTex = A.useCanvasTextures ? finishTex(makeCarpetTexture(style), 1, Math.max(2, Math.round(segLen / 5))) : null;
      var cMat = new THREE.MeshStandardMaterial({
        map: cTex,
        color: cTex ? 0xffffff : style.floor.carpetBase,
        roughness: 0.96, metalness: 0.0,
        transparent: true, opacity: 0.9
      });
      carpetMesh = new THREE.Mesh(new THREE.PlaneGeometry(carpetW, segLen - 0.3), cMat);
      carpetMesh.rotation.x = -Math.PI / 2;
      carpetMesh.position.set(0, 0.024, centerZ);
      carpetMesh.receiveShadow = true;
      group.add(carpetMesh);
    }

    /* ---------- ③ 中线引导线（逐朝代变色，居中淡淡一条） ---------- */
    var guideMat = new THREE.MeshBasicMaterial({
      color: style.wall.frameInner,
      transparent: true,
      opacity: A.floor.guideOpacity,
      depthWrite: false
    });
    var guide = new THREE.Mesh(
      new THREE.PlaneGeometry(A.floor.guideWidth, segLen),
      guideMat
    );
    guide.rotation.x = -Math.PI / 2;
    guide.position.set(0, 0.032, centerZ);
    group.add(guide);

    /* ---------- ④ 朝代分界细线（本段起点处一条横线） ---------- */
    var lineMat = new THREE.MeshBasicMaterial({
      color: A.floor.lineColor, transparent: true, opacity: 0.75, depthWrite: false
    });
    var line = new THREE.Mesh(
      new THREE.PlaneGeometry(HALL.width, A.floor.lineWidth),
      lineMat
    );
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, 0.034, zStart);
    group.add(line);

    /* ---------- ⑤ 朝代章纹铺地（段首中央一块，低密度） ---------- */
    var emblem = null;
    if (!lowPerf) {
      var eTex = finishTex(makeEmblemTexture(style));
      eTex.wrapS = eTex.wrapT = THREE.ClampToEdgeWrapping;
      var eMat = new THREE.MeshBasicMaterial({
        map: eTex, transparent: true, opacity: 0.5, depthWrite: false
      });
      emblem = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.0), eMat);
      emblem.rotation.x = -Math.PI / 2;
      emblem.position.set(0, 0.036, zEnd - 2.6);
      group.add(emblem);
    }

    /* ---------- ⑥ 地面年代刻度（中线旁，浮雕文字） ---------- */
    var eraMark = null;
    if (A.eraMark.enabled && !lowPerf) {
      var mTex = finishTex(makeEraMarkTexture(data, style));
      mTex.wrapS = mTex.wrapT = THREE.ClampToEdgeWrapping;
      var mMat = new THREE.MeshBasicMaterial({
        map: mTex, transparent: true, opacity: 0.85, depthWrite: false
      });
      eraMark = new THREE.Mesh(
        new THREE.PlaneGeometry(A.eraMark.size, A.eraMark.size), mMat
      );
      eraMark.rotation.x = -Math.PI / 2;
      eraMark.rotation.z = Math.PI / 2;   // 文字顺着走道方向立起（从玩家视角可读）
      eraMark.position.set(A.eraMark.offsetX, 0.038, zEnd - 3.4);
      group.add(eraMark);
    }

    /* ---------- ⑦ 顶部：梁架 + 藻井 ---------- */
    var beamMat = new THREE.MeshStandardMaterial({
      color: style.ceiling.beamColor, roughness: 0.82, metalness: 0.06
    });
    var panelTex = A.useCanvasTextures ? finishTex(makeCeilingPanelTexture(style)) : null;
    var panelMat = new THREE.MeshStandardMaterial({
      map: panelTex,
      color: panelTex ? 0xffffff : style.ceiling.panelColor,
      roughness: 0.9, metalness: 0.03
    });

    var beamSpacing = A.ceiling.beamSpacing * (lowPerf ? 1.6 : 1);
    var beamCount = Math.max(1, Math.floor(segLen / beamSpacing));
    var beams = [];
    for (var bi = 0; bi <= beamCount; bi++) {
      var bz = zEnd - bi * beamSpacing;
      if (bz < zStart) bz = zStart;
      // 横梁（横跨左右墙）
      var beam = new THREE.Mesh(
        new THREE.BoxGeometry(HALL.width, A.ceiling.beamHeight, A.ceiling.beamDepth),
        beamMat
      );
      beam.position.set(0, wallH - A.ceiling.beamHeight / 2, bz);
      group.add(beam);
      beams.push(beam);

      // 梁间彩绘顶板（每两梁之间一块，贴在墙顶下方）
      if (bi < beamCount) {
        var panelMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(HALL.width, beamSpacing - A.ceiling.beamDepth),
          panelMat
        );
        panelMesh.rotation.x = Math.PI / 2;   // 面朝下
        panelMesh.position.set(0, wallH - 0.02, bz - beamSpacing / 2);
        group.add(panelMesh);
      }
    }

    // 藻井（明/清/现代 & 唐也有点缀）：沿段长等距若干个
    var coffers = [];
    var cofferSpacing = A.ceiling.cofferSpacing * (lowPerf ? 1.8 : 1);
    var cofferCount = Math.max(1, Math.floor(segLen / cofferSpacing));
    for (var ci = 0; ci < cofferCount; ci++) {
      var cz = zEnd - cofferSpacing * (ci + 0.5);
      var cTex2 = A.useCanvasTextures ? finishTex(makeCaissonTexture(style)) : null;
      cTex2.wrapS = cTex2.wrapT = THREE.ClampToEdgeWrapping;
      var cMat2 = new THREE.MeshStandardMaterial({
        map: cTex2,
        color: cTex2 ? 0xffffff : style.ceiling.panelColor,
        roughness: 0.86, metalness: 0.06
      });
      var coffer = new THREE.Mesh(
        new THREE.BoxGeometry(A.ceiling.cofferSize, A.ceiling.cofferDrop, A.ceiling.cofferSize),
        cMat2
      );
      coffer.position.set(0, wallH - A.ceiling.cofferDrop / 2 - 0.02, cz);
      group.add(coffer);
      coffers.push(coffer);
    }

    // 帷幔（唐 / 元 / 民国：悬挂式布幔，薄片 + 半透明）
    if (style.ceiling.drape && !lowPerf) {
      var drapeMat = new THREE.MeshStandardMaterial({
        color: style.ceiling.beamColor, roughness: 0.95, metalness: 0.0,
        transparent: true, opacity: 0.42, side: THREE.DoubleSide
      });
      var drapeCount = Math.max(1, Math.floor(segLen / 14));
      for (var di = 0; di < drapeCount; di++) {
        var dz = zEnd - 6 - di * 14;
        [-1, 1].forEach(function (sx) {
          var drape = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), drapeMat);
          drape.position.set(sx * (halfW - 1.9), wallH - 0.75, dz);
          drape.rotation.y = Math.PI / 2;
          group.add(drape);
        });
      }
    }

    /* ---------- ⑧ 墙裙（左右墙下沿装饰线） ---------- */
    var skirtMat = new THREE.MeshStandardMaterial({
      color: style.wall.skirt, roughness: 0.8, metalness: 0.08
    });
    [-1, 1].forEach(function (sx) {
      var skirt = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, A.wall.skirtHeight, segLen),
        skirtMat
      );
      skirt.position.set(sx * (halfW - 0.05), A.wall.skirtHeight / 2, centerZ);
      group.add(skirt);

      // 墙裙上沿金线
      var capMat = new THREE.MeshStandardMaterial({
        color: style.wall.frameInner, roughness: 0.5, metalness: 0.35
      });
      var cap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.045, segLen), capMat);
      cap.position.set(sx * (halfW - 0.05), A.wall.skirtHeight, centerZ);
      group.add(cap);
    });

    /* ---------- ⑨ 时间节点拱门（本段入口，门上写朝代名） ---------- */
    var gate = buildGate(data, style, zEnd);
    group.add(gate.group);

    CTX.scene.add(group);

    var space = {
      data: data,
      era: data.era,
      style: style,
      group: group,
      zStart: zStart,
      zEnd: zEnd,
      centerZ: centerZ,
      segLen: segLen,
      floorMat: floorMat,
      carpetMat: carpetMesh ? carpetMesh.material : null,
      guideMat: guideMat,
      lineMat: lineMat,
      beamMat: beamMat,
      panelMat: panelMat,
      skirtMat: skirtMat,
      gate: gate,
      lights: [],          // 本段的灯（壁灯 / 藻井灯 / 洗墙灯）
      baseColors: {}       // 记录各种材质的基准色（用于插值起点）
    };

    /* ---------- ⑩ 灯光：壁灯 + 藻井灯 + 洗墙灯 ---------- */
    buildEraLights(space, style);

    return space;
  }

  /* -------------------------------------------------------------------
     拱门：两侧立柱 + 门楣 + 名牌 + 内侧光晕
     ------------------------------------------------------------------- */
  function buildGate(data, style, gz) {
    var A = CTX.CONFIG.ATMOSPHERE.gate;
    var HALL = CTX.CONFIG.HALL;
    var halfW = HALL.width / 2;
    var g = new THREE.Group();
    g.name = 'gate-' + data.era;

    var postW = (HALL.width - A.innerWidth) / 2;   // 左右立柱宽
    var mat = new THREE.MeshStandardMaterial({
      color: style.ceiling.beamColor, roughness: 0.8, metalness: 0.08
    });
    var trimMat = new THREE.MeshStandardMaterial({
      color: style.ceiling.accent, roughness: 0.45, metalness: 0.4
    });

    // 左右立柱
    [-1, 1].forEach(function (sx) {
      var post = new THREE.Mesh(
        new THREE.BoxGeometry(postW, A.innerHeight2, A.depth), mat
      );
      post.position.set(sx * (A.innerWidth / 2 + postW / 2), A.innerHeight2 / 2, 0);
      post.castShadow = true;
      g.add(post);

      // 柱身金线
      var trim = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, A.innerHeight2, A.depth + 0.02), trimMat
      );
      trim.position.set(sx * (A.innerWidth / 2 + 0.03), A.innerHeight2 / 2, 0);
      g.add(trim);
    });

    // 门楣横梁
    var lintel = new THREE.Mesh(
      new THREE.BoxGeometry(HALL.width, A.innerHeight2 - A.innerHeight, A.depth), mat
    );
    lintel.position.set(0, A.innerHeight + (A.innerHeight2 - A.innerHeight) / 2, 0);
    g.add(lintel);

    // 门楣金边
    var lintelTrim = new THREE.Mesh(
      new THREE.BoxGeometry(HALL.width, 0.05, A.depth + 0.02), trimMat
    );
    lintelTrim.position.set(0, A.innerHeight, 0);
    g.add(lintelTrim);

    // 朝代名牌（横匾，贴在门楣正面）
    var plaqueTex = finishTex(makeGatePlaqueTexture(style.label, style));
    plaqueTex.wrapS = plaqueTex.wrapT = THREE.ClampToEdgeWrapping;
    var plaqueMat = new THREE.MeshBasicMaterial({ map: plaqueTex, transparent: true });
    var plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 0.58), plaqueMat);
    plaque.position.set(0, A.innerHeight + (A.innerHeight2 - A.innerHeight) / 2, A.depth / 2 + 0.02);
    g.add(plaque);

    // 内侧光晕（半透明发光面，进门时视觉「跨入新阶段」）
    var glowMat = new THREE.MeshBasicMaterial({
      color: style.light.coffer,
      transparent: true,
      opacity: A.glowOpacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    var glow = new THREE.Mesh(new THREE.PlaneGeometry(A.innerWidth, A.innerHeight), glowMat);
    glow.position.set(0, A.innerHeight / 2, 0);
    g.add(glow);

    // 门内一盏小灯（照门下地面）
    var gateLight = new THREE.PointLight(style.light.coffer, 0.5, 6, 1.6);
    gateLight.position.set(0, A.innerHeight - 0.35, 0);
    g.add(gateLight);

    g.position.set(0, 0, gz);

    return { group: g, glowMat: glowMat, mat: mat, trimMat: trimMat, plaqueMat: plaqueMat, light: gateLight };
  }

  /* -------------------------------------------------------------------
     灯光：逐朝代壁灯 / 藻井灯 / 洗墙灯
     ------------------------------------------------------------------- */
  function buildEraLights(space, style) {
    var A = CTX.CONFIG.ATMOSPHERE;
    var HALL = CTX.CONFIG.HALL;
    var wallH = CTX.CONFIG.WALL.height;
    var halfW = HALL.width / 2;
    var segLen = space.segLen;
    var zEnd = space.zEnd;

    // ---- ① 壁灯：左右墙各 N 盏（风格色随朝代） ----
    var lampN = Math.max(1, Math.round(A.light.wallLampPerSeg * (A.lowPerf ? 0.6 : 1)));
    var lampStep = segLen / (lampN + 1);

    for (var i = 1; i <= lampN; i++) {
      var lz = zEnd - i * lampStep;
      [-1, 1].forEach(function (sx) {
        // 灯体（小方盒 + 发光罩）
        var bodyMat = new THREE.MeshStandardMaterial({
          color: style.ceiling.beamColor, roughness: 0.6, metalness: 0.25
        });
        var body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.26, 0.18), bodyMat);
        body.position.set(sx * (halfW - 0.12), 3.0, lz);
        space.group.add(body);

        var shadeMat = new THREE.MeshBasicMaterial({
          color: style.light.wall, transparent: true, opacity: 0.92
        });
        var shade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.12), shadeMat);
        shade.position.set(sx * (halfW - 0.20), 2.94, lz);
        space.group.add(shade);

        // 点光源（朝墙内照）
        var pl = new THREE.PointLight(
          style.light.wall, A.light.lampIntensity * style.light.wallI,
          A.light.lampDistance, 1.6
        );
        pl.position.set(sx * (halfW - 0.35), 2.95, lz);
        space.group.add(pl);
        space.lights.push({ light: pl, kind: 'wall', shade: shadeMat, base: style.light.wall });
      });
    }

    // ---- ② 藻井灯：每段顶部中心向下照 ----
    var cofferN = Math.max(1, Math.round(segLen / (A.ceiling.cofferSpacing * (A.lowPerf ? 1.8 : 1))));
    for (var ci = 0; ci < cofferN; ci++) {
      var cz = zEnd - A.ceiling.cofferSpacing * (ci + 0.5);
      var cl = new THREE.PointLight(
        0xffffff, A.light.cofferLightIntensity * style.light.cofferI,
        A.light.cofferLightDistance, 1.8
      );
      cl.color.setHex(style.light.coffer);
      cl.position.set(0, wallH - 0.35, cz);
      space.group.add(cl);
      space.lights.push({ light: cl, kind: 'coffer', base: style.light.coffer });
    }

    // ---- ③ 洗墙灯：左右各若干，扇形扫墙（SpotLight） ----
    var washN = A.lowPerf ? 1 : 2;
    for (var wi = 0; wi < washN; wi++) {
      var wz = zEnd - (wi + 1) * (segLen / (washN + 1));
      [-1, 1].forEach(function (sx) {
        var sp = new THREE.SpotLight(
          0xfffbf0, A.light.washIntensity * style.light.washI,
          A.light.washDistance, A.light.washAngle, A.light.washPenumbra, 1.2
        );
        sp.position.set(sx * (halfW - 1.6), wallH - 0.5, wz);
        sp.target.position.set(sx * halfW, 2.0, wz);
        space.group.add(sp);
        space.group.add(sp.target);
        space.lights.push({ light: sp, kind: 'wash', base: 0xfffbf0 });
      });
    }
  }

  /* ===================================================================
     四、对外接口
     =================================================================== */

  /**
   * 构建全部朝代空间
   * @param {THREE.Scene} scene
   * @param {Object} ctx  { CONFIG, HALL }
   */
  function build(scene, ctx) {
    var A = ctx.CONFIG.ATMOSPHERE;
    if (!A || !A.enabled) return [];

    CTX = ctx;
    CTX.scene = scene;
    spaces = [];

    ctx.dynastyList.forEach(function (data) {
      var sp = buildEraSpace(data);
      spaces.push(sp);
    });

    // 初始：默认以第一个朝代氛围填充（真正生效由 apply 决定）
    if (spaces.length) {
      apply(spaces[0].data, 0, true);
    }

    // 宫灯吊顶序列（每 10m 一组，造型 / 发光色随朝代段变化）
    buildLanterns(scene, ctx);

    return spaces;
  }

  /**
   * 应用某朝代氛围（设置插值目标）。
   * @param {Object} data  dynastyList 条目
   * @param {number} index
   * @param {boolean} immediate 是否瞬时应用（初始化用）
   */
  function apply(data, index, immediate) {
    var style = styleOf(data);
    current = { style: style, data: data, index: index };

    // 逐段灯光：只有当前朝代的灯开，其余渐暗（营造"走到哪亮到哪"的宫殿感）
    spaces.forEach(function (sp, i) {
      var active = (i === index);
      sp.lights.forEach(function (entry) {
        var A = CTX.CONFIG.ATMOSPHERE;
        var target;
        var l = entry.light;
        if (entry.kind === 'wall') {
          target = active ? A.light.lampIntensity * style.light.wallI : A.light.lampIntensity * style.light.wallI * 0.30;
        } else if (entry.kind === 'coffer') {
          target = active ? A.light.cofferLightIntensity * style.light.cofferI : A.light.cofferLightIntensity * style.light.cofferI * 0.28;
        } else {
          target = active ? A.light.washIntensity * style.light.washI : A.light.washIntensity * style.light.washI * 0.35;
        }
        entry.target = target;
        if (immediate) l.intensity = target;
      });

      // 本段地面/地毯/引导线/线条/墙裙/base 色 → 目标色
      // 说明：段与段之间保留各自风格色不混（每段是独立材质），
      //      这里仅对"当前段"做轻微提亮，让走进的朝代更醒目。
      var bright = active ? 1.0 : 0.86;
      sp.floorMat.color.copy(new THREE.Color(0xffffff).multiplyScalar(bright));
      if (sp.carpetMat) sp.carpetMat.opacity = active ? 0.92 : 0.78;

      // 拱门光晕：当前段拱门更亮
      if (sp.gate && sp.gate.glowMat) {
        var go = CTX.CONFIG.ATMOSPHERE.gate.glowOpacity;
        sp.gate.glowMat.opacity = immediate ? (active ? go : go * 0.5) : sp.gate.glowMat.opacity;
        sp.gate._targetGlow = active ? go : go * 0.5;
      }
      if (sp.gate && sp.gate.light) {
        var gt = active ? 0.55 : 0.22;
        sp.gate.light._target = gt;
        if (immediate) sp.gate.light.intensity = gt;
      }
    });

    // 当前段地面 / 引导线 颜色 → 风格色（用于逐帧缓动）
    var sp = spaces[index];
    if (sp) {
      sp.floorMat.userData.targetColor = new THREE.Color(0xffffff);
      sp.guideMat.userData.targetColor = new THREE.Color(style.wall.frameInner);
    }
  }

  /**
   * 每帧平滑插值（灯光强度 / 拱门光晕 / 地面亮度）+ 远段裁剪
   * 帧率无关的指数插值，与主程序风格一致。
   *
   * 性能：7 段 × 12 盏灯 = 84 盏灯全部参与渲染会很重；
   *      而雾效在 45m 外已完全遮挡，因此 45m 外整段隐藏（含灯），
   *      55m 外回切（滞回），避免边界抖动与频繁的着色器重编译。
   */
  function update(dt) {
    // —— 入场明暗状态推进 ——
    if (reveal.active && reveal.dim < 1) {
      reveal.elapsed += dt;
      var rp = Math.min(1, reveal.elapsed / REVEAL_DUR);
      var re = rp * rp * (3 - 2 * rp);   // smoothstep
      reveal.dim = DIM_MIN + (1 - DIM_MIN) * re;
    }

    // 宫灯序列：走近点亮 / 走远渐暗（与朝代段裁剪无关，始终更新）
    var pz = (CTX && typeof CTX.getPlayerZ === 'function') ? CTX.getPlayerZ() : 0;
    updateLanterns(dt, pz);

    if (!spaces.length) return;
    var k = 1 - Math.pow(0.0015, dt);

    spaces.forEach(function (sp) {
      // ---- 远段裁剪（滞回：45m 隐藏 / 55m 恢复） ----
      if (pz !== null) {
        var dz = Math.abs(sp.centerZ - pz);
        if (sp._vis === undefined) sp._vis = true;
        if (sp._vis && dz > 55) { sp._vis = false; sp.group.visible = false; }
        else if (!sp._vis && dz < 45) { sp._vis = true; sp.group.visible = true; }
      }

      // ---- 灯光强度缓动（乘以入场明暗系数：穿拱门前长廊灯光压暗） ----
      sp.lights.forEach(function (entry) {
        if (typeof entry.target === 'number') {
          entry.light.intensity += (entry.target * reveal.dim - entry.light.intensity) * k;
        }
      });
      // 壁灯罩颜色缓动到风格色
      sp.lights.forEach(function (entry) {
        if (entry.kind === 'wall' && entry.shade) {
          var c = new THREE.Color(entry.base);
          entry.shade.color.lerp(c, k);
        }
      });
      // 拱门光晕 / 灯缓动（同样受入场明暗系数影响）
      if (sp.gate) {
        if (typeof sp.gate._targetGlow === 'number' && sp.gate.glowMat) {
          sp.gate.glowMat.opacity += (sp.gate._targetGlow * reveal.dim - sp.gate.glowMat.opacity) * k;
        }
        if (typeof sp.gate.light._target === 'number') {
          sp.gate.light.intensity += (sp.gate.light._target * reveal.dim - sp.gate.light.intensity) * k;
        }
      }
    });
  }

  /* ===================================================================
     六、宫灯吊顶序列（走到哪、灯亮到哪）
     -------------------------------------------------------------------
     每 10m 一组宫灯（中央主灯 + 左右副灯 + 顶部横梁 + 吊穗），
     灯笼造型 / 发光色随所在朝代段变化：
       唐莲花宫灯·暖金 | 宋素面纸灯·冷白 | 元金属战灯·暗金
       明明式宫灯·暖白 | 清琉璃宫灯·青白 | 民国玻璃宫灯 | 现代简约灯
     玩家走近时灯笼自发光 + 点光源逐渐点亮，走远渐暗；
     经过朝代节点时短暂增亮（仪式感）。
     性能：灯笼本身只是自发光网格；真正的点光源用固定大小的
     「光源池」（默认 5 盏），每帧跟随最近几组宫灯，灯光总数恒定。
     =================================================================== */
  var lanterns = [];      // 全部宫灯组 { group, z, glow, bodies[], _t, _boostT }
  var lightPool = [];     // 点光源池（固定数量）
  var lanternCFG = null;

  // 逐朝代宫灯样式：发光色 / 灯体色 / 金属件色 / 造型特征
  var LANTERN_STYLE = {
    tang:    { glow: 0xffd27a, body: 0xffc966, trim: 0xb8860b, shape: 'lotus'  },  // 莲花宫灯 · 暖金
    song:    { glow: 0xeaf6ff, body: 0xf2efe4, trim: 0x8d8478, shape: 'paper'  },  // 素面纸灯 · 冷白
    yuan:    { glow: 0xffb74d, body: 0xc9963e, trim: 0x6e5a2a, shape: 'metal'  },  // 金属战灯 · 暗金
    ming:    { glow: 0xfff1cf, body: 0xc74334, trim: 0xd9b969, shape: 'palace' },  // 明式宫灯 · 朱红金线
    qing:    { glow: 0xdff7ff, body: 0x9fd4d4, trim: 0xd8b46a, shape: 'glass'  },  // 琉璃宫灯 · 青玉描金
    minguo:  { glow: 0xffeedd, body: 0xe3d7c2, trim: 0x8a7a5c, shape: 'paper'  },  // 玻璃宫灯 · 文人暖光
    modern:  { glow: 0xf5f9ff, body: 0xeef2f5, trim: 0x9aa5ad, shape: 'plain'  }   // 现代简约灯
  };

  /** 找到 z 所在朝代段的宫灯样式 */
  function lanternStyleAtZ(z, dynastyList) {
    var era = 'modern';
    for (var i = 0; i < dynastyList.length; i++) {
      var d = dynastyList[i];
      var segStart = d.positionTrigger.z;
      var segLen = d._segLen || 18;
      if (z <= segStart + 0.01 && z > segStart - segLen) { era = d.era; break; }
    }
    return LANTERN_STYLE[era] || LANTERN_STYLE.modern;
  }

  /**
   * 单盏宫灯：灯笼体 + 上下箍 + 吊绳 + 造型特征件
   * 返回 { group, bodyMat }（bodyMat 供逐帧调自发光）
   */
  function createLanternLamp(style, scale, cfg) {
    var g = new THREE.Group();
    var R = 0.22 * scale;          // 灯体半径
    var H = 0.55 * scale;          // 灯体高度

    // 灯体（自发光材质，颜色=风格体色，发光色由 emissive 单独控制）
    var bodyMat = new THREE.MeshStandardMaterial({
      color: style.body,
      emissive: style.glow,
      emissiveIntensity: 0.15,
      roughness: 0.55,
      metalness: 0.05
    });
    var body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 16), bodyMat);
    g.add(body);

    // 上下箍（金属件）
    var trimMat = new THREE.MeshStandardMaterial({ color: style.trim, roughness: 0.4, metalness: 0.55 });
    [-1, 1].forEach(function (s) {
      var ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.06, 0.03 * scale, 8, 24), trimMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = s * H / 2;
      g.add(ring);
    });
    // 顶盖 / 底盖
    [-1, 1].forEach(function (s) {
      var cap = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.62, R * 0.72, 0.06 * scale, 16), trimMat);
      cap.position.y = s * (H / 2 + 0.04 * scale);
      g.add(cap);
    });

    // 吊绳（细线连到上方横梁）
    var cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012 * scale, 0.012 * scale, 0.85 * scale, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a2e20, roughness: 0.9 })
    );
    cord.position.y = H / 2 + 0.46 * scale;
    g.add(cord);

    // —— 造型特征件（按朝代） ——
    if (style.shape === 'lotus') {
      // 唐：顶部一圈莲花瓣 + 底部流苏
      var petalMat = new THREE.MeshStandardMaterial({ color: style.body, roughness: 0.5 });
      for (var p = 0; p < 6; p++) {
        var petal = new THREE.Mesh(new THREE.ConeGeometry(0.09 * scale, 0.16 * scale, 6), petalMat);
        var a = (p / 6) * Math.PI * 2;
        petal.position.set(Math.cos(a) * R * 0.7, H / 2 + 0.08 * scale, Math.sin(a) * R * 0.7);
        petal.rotation.z = Math.cos(a) * 0.5;
        petal.rotation.x = -Math.sin(a) * 0.5;
        g.add(petal);
      }
      var tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * scale, 0.045 * scale, 0.22 * scale, 6),
        new THREE.MeshStandardMaterial({ color: style.glow, roughness: 0.8 }));
      tassel.position.y = -H / 2 - 0.12 * scale;
      g.add(tassel);
    } else if (style.shape === 'paper') {
      // 宋 / 民国：四条竖向木骨
      var ribMat = new THREE.MeshStandardMaterial({ color: style.trim, roughness: 0.8 });
      for (var r2 = 0; r2 < 4; r2++) {
        var a2 = (r2 / 4) * Math.PI * 2 + Math.PI / 4;
        var rib = new THREE.Mesh(new THREE.BoxGeometry(0.025 * scale, H * 1.02, 0.025 * scale), ribMat);
        rib.position.set(Math.cos(a2) * R, 0, Math.sin(a2) * R);
        g.add(rib);
      }
    } else if (style.shape === 'metal') {
      // 元：中部再加一道金属箍，更厚重
      var band = new THREE.Mesh(new THREE.TorusGeometry(R * 1.04, 0.035 * scale, 8, 24), trimMat);
      band.rotation.x = Math.PI / 2;
      g.add(band);
    } else if (style.shape === 'palace') {
      // 明：顶部金顶饰（小宝珠）
      var finial = new THREE.Mesh(new THREE.SphereGeometry(0.06 * scale, 10, 8),
        new THREE.MeshStandardMaterial({ color: style.trim, roughness: 0.3, metalness: 0.7 }));
      finial.position.y = H / 2 + 0.13 * scale;
      g.add(finial);
    } else if (style.shape === 'glass') {
      // 清：外层半透明琉璃壳
      var shell = new THREE.Mesh(
        new THREE.CylinderGeometry(R * 1.16, R * 1.16, H * 1.08, 16, 1, true),
        new THREE.MeshStandardMaterial({
          color: style.glow, transparent: true, opacity: 0.28,
          roughness: 0.15, metalness: 0.1, side: THREE.DoubleSide
        })
      );
      g.add(shell);
    }
    // plain（现代）：素面，无附加件

    return { group: g, bodyMat: bodyMat };
  }

  /** 一组宫灯（主灯 + 左右副灯 + 横梁） */
  function createLanternGroup(z, style, cfg) {
    var grp = new THREE.Group();
    var bodies = [];

    // 主灯笼
    var main = createLanternLamp(style, cfg.mainScale, cfg);
    main.group.position.set(0, cfg.topY, z);
    grp.add(main.group);
    bodies.push(main.bodyMat);

    // 左右副灯笼
    [-1, 1].forEach(function (s) {
      var side = createLanternLamp(style, cfg.sideScale, cfg);
      side.group.position.set(s * cfg.sideX, cfg.topY - 0.15, z);
      grp.add(side.group);
      bodies.push(side.bodyMat);
    });

    // 顶部横梁 / 装饰架
    var beam = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.sideX * 2 + 1.0, 0.16, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x2c1f14, roughness: 0.75 })
    );
    beam.position.set(0, cfg.topY + cfg.mainScale * 0.55 + 0.5, z);
    grp.add(beam);

    return { group: grp, bodies: bodies };
  }

  /** 构建整条宫灯序列 + 点光源池（在 build 末尾调用） */
  function buildLanterns(scene, ctx) {
    var cfg = ctx.CONFIG.LANTERN;
    if (!cfg || !cfg.enabled) return;
    lanternCFG = cfg;
    lanterns = [];
    lightPool = [];

    var endZ = ctx.HALL.startZ - ctx.HALL.depth + 2;
    for (var z = cfg.startZ; z >= endZ; z -= cfg.step) {
      var style = lanternStyleAtZ(z, ctx.dynastyList);
      var made = createLanternGroup(z, style, cfg);
      scene.add(made.group);
      lanterns.push({
        group: made.group,
        bodies: made.bodies,
        z: z,
        glow: style.glow,
        _t: 0,            // 当前点亮程度 0~1（已平滑）
        _boostT: 0        // 节点增亮剩余秒数
      });
    }

    // 点光源池：固定数量，逐帧跟随最近几组宫灯
    for (var i = 0; i < cfg.lightPool; i++) {
      var pl = new THREE.PointLight(0xffffff, 0, cfg.lightRange, 2);
      scene.add(pl);
      lightPool.push(pl);
    }
  }

  /**
   * 每帧更新：走近点亮 / 走远渐暗 / 节点增亮 / 光源池跟随
   */
  function updateLanterns(dt, playerZ) {
    if (!lanternCFG || !lanterns.length) return;
    var cfg = lanternCFG;
    var k = 1 - Math.pow(0.002, dt);   // 帧率无关平滑

    for (var i = 0; i < lanterns.length; i++) {
      var L = lanterns[i];
      var d = Math.abs(playerZ - L.z);
      var target = Math.max(0, 1 - d / cfg.glowDist);

      // —— 入场依次渐亮：index 0 离拱门最近，先亮；逐组滞后点亮 ——
      if (reveal.active) {
        var lf = Math.max(0, Math.min(1, (reveal.elapsed - i * LANTERN_STAGGER) / 1.2));
        lf = lf * lf * (3 - 2 * lf);
        target *= lf;
      } else {
        target = 0;   // 入场前长廊宫灯全灭（拱门自带灯光负责序厅照明）
      }

      // 节点增亮：短暂把点亮程度顶到 1
      if (L._boostT > 0) {
        L._boostT -= dt;
        target = Math.max(target, Math.min(1, L._boostT / cfg.boostDuration + 0.5));
      }

      L._t += (target - L._t) * k;

      // 灯笼自发光跟随点亮程度
      var e = 0.12 + 0.5 * L._t;
      for (var b = 0; b < L.bodies.length; b++) L.bodies[b].emissiveIntensity = e;
    }

    // 光源池：跟随点亮程度最高的几组宫灯
    var sorted = lanterns.slice().sort(function (a, b2) { return b2._t - a._t; });
    for (var p = 0; p < lightPool.length; p++) {
      var pl = lightPool[p];
      var src = sorted[p];
      if (src && src._t > 0.03) {
        pl.position.set(0, cfg.topY - 0.4, src.z);
        pl.color.setHex(src.glow);
        pl.intensity = cfg.baseIntensity * src._t;
      } else {
        pl.intensity = 0;
      }
    }
  }

  /* ===================================================================
     七、入场明暗系统（配合入口拱门「千年青史」）
     -------------------------------------------------------------------
     入场前：长廊内部灯光压暗到 DIM_MIN（拱门自身灯光独立常亮）；
     穿过拱门触发 reveal() 后：整体灯光 3.5s 内渐亮，
     宫灯按离拱门由近到远逐组点亮（依次渐亮的仪式感）。
     =================================================================== */
  var DIM_MIN = 0.10;
  var REVEAL_DUR = 3.5;      // 整体渐亮时长（秒）
  var LANTERN_STAGGER = 0.20; // 宫灯逐组的点亮间隔（秒）
  var reveal = { active: false, elapsed: 0, dim: DIM_MIN };

  /** 穿过入口拱门时调用：长廊灯光开始渐亮 */
  function revealLights() {
    if (!reveal.active) { reveal.active = true; reveal.elapsed = 0; }
  }

  /** 当前全局明暗系数（0~1，主程序用来同步压暗基础灯光） */
  function revealFactor() { return reveal.dim; }

  /* ===================================================================
     五、时间节点感补充：宫灯节点增亮
     =================================================================== */
  /** 经过朝代节点时的瞬时增亮（switchDynasty 里调用） */
  function boostLanterns(z) {
    if (!lanternCFG) return;
    lanterns.forEach(function (L) {
      if (Math.abs(L.z - z) < 6) L._boostT = lanternCFG.boostDuration;
    });
  }

  window.EraAtmosphere = {
    ERA_STYLE: ERA_STYLE,
    build: build,
    apply: apply,
    update: update,
    boostLanterns: boostLanterns,
    revealLights: revealLights,       // 穿过入口拱门：长廊灯光依次渐亮
    revealFactor: revealFactor,       // 当前全局明暗系数（主程序同步用）
    spaces: function () { return spaces; },
    /** 供调试：返回每段风格摘要 */
    report: function () {
      return spaces.map(function (sp) {
        return {
          era: sp.era,
          label: sp.style.label,
          floorKind: sp.style.floor.kind,
          carpet: !!sp.style.floor.carpet,
          ceilingKind: sp.style.ceiling.kind,
          wallPattern: sp.style.wall.pattern,
          lights: sp.lights.length,
          zStart: sp.zStart,
          zEnd: sp.zEnd
        };
      });
    }
  };
})();
