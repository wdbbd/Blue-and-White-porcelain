/* =====================================================================
   青花瓷 · 时间长廊 —— 入口拱门「青花宫阙 · 千年青史」（entrance-gate.js）
   ---------------------------------------------------------------------
   用途：长廊最前端、唐展区之前的序章入口。中轴对称、国风克制。

   层级框架（与设计稿一一对应）：
     entranceGate（总组）
     ├─ roofGroup        顶部飞檐组（主屋脊 / 左右翘角飞檐 / 檐下梁枋金线）
     ├─ plaqueGroup      匾额组（深青底 + 金字「千年青史」+ 回纹框 + 莲花角饰）
     ├─ archBodyGroup    拱门主体组（白玉青石拱洞 + 祥云缠枝莲青花浮雕带 + 金线回纹边框）
     ├─ pillarGroup      莲纹立柱（左右两根）
     ├─ sidePlatformGroup 两侧阙台（低于主拱门 + 迷你青花宝瓶摆件）
     └─ baseGroup        须弥座基座 + 前置矮台阶

   交互：
     1. 入场状态：长廊内部灯光初始压暗（EraAtmosphere.revealFactor 驱动），
        拱门自带灯光常亮，负责序厅照明
     2. 触发：玩家 z 越过拱门背面（纯 z 阈值判定，碰撞独立于渲染模型）
     3. 触发效果：合成编钟音效（WebAudio，无外部音频）→
        EraAtmosphere.revealLights() 长廊宫灯依次渐亮 → 匾额金字缓慢发光脉动

   设计备注（对照需求）：
     - 浮雕带 bumpScale 很小，微凸起不厚重
     - 金色只用于轮廓 / 文字 / 边线，不大面积铺金
     - 纹样密度克制：一条浮雕带 + 匾额回纹，不满墙铺
     - 尺寸说明：参考稿 10m×6.5m 大于现有通道（内宽 6m、净高 4m），
       默认按通道实际尺寸等比适配，参数集中在 config.js 的 ENTRANCE 段
   ===================================================================== */
(function () {
  'use strict';

  var state = {
    built: false,
    entered: false,
    cfg: null,
    group: null,
    plaqueMats: [],       // 匾额材质（穿门后金字发光脉动）
    playerZGet: null,
    elapsed: 0,
    audioCtx: null,
    audioUnlocked: false
  };

  /* ===================================================================
     程序化贴图（Canvas，零外部资源）
     =================================================================== */

  /** 白玉青石基底：浅色石纹，轻微斑驳 */
  function makeStoneCanvas() {
    var cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    var c = cv.getContext('2d');
    c.fillStyle = '#e9ece7';
    c.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 260; i++) {
      c.fillStyle = 'rgba(120,132,128,' + (Math.random() * 0.05).toFixed(3) + ')';
      c.beginPath();
      c.arc(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 14, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = 'rgba(140,150,146,0.08)';
    c.lineWidth = 1;
    for (var j = 0; j < 10; j++) {
      var y = Math.random() * 256;
      c.beginPath();
      c.moveTo(0, y);
      c.bezierCurveTo(80, y + 6, 170, y - 6, 256, y);
      c.stroke();
    }
    var tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  /** 青花浮雕带：白底石材 + 钴蓝祥云缠枝莲（浅浮雕感）+ 细金勾线 */
  function makeReliefCanvas() {
    var W = 1024, H = 160;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');

    c.fillStyle = '#eceee9';
    c.fillRect(0, 0, W, H);
    for (var n = 0; n < 140; n++) {
      c.fillStyle = 'rgba(120,132,128,0.04)';
      c.beginPath();
      c.arc(Math.random() * W, Math.random() * H, 2 + Math.random() * 8, 0, Math.PI * 2);
      c.fill();
    }

    var blue = '#2c5f8a';
    var blueDeep = '#1f4a70';

    // —— 缠枝莲：正弦主藤 ——
    c.strokeStyle = blue;
    c.lineWidth = 4;
    c.beginPath();
    for (var x = 0; x <= W; x += 6) {
      var y = H / 2 + Math.sin(x / 90 * Math.PI * 2) * 26;
      if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();

    // 卷须小枝
    c.lineWidth = 2.5;
    for (var s = 0; s < 8; s++) {
      var sx = 40 + s * 128;
      var sy = H / 2 + Math.sin(sx / 90 * Math.PI * 2) * 26;
      c.beginPath();
      c.moveTo(sx, sy);
      c.quadraticCurveTo(sx + 16, sy - 20, sx + 34, sy - 12);
      c.stroke();
      c.beginPath();
      c.moveTo(sx + 64, H / 2 + Math.sin((sx + 64) / 90 * Math.PI * 2) * 26);
      c.quadraticCurveTo(sx + 48, sy + 22, sx + 30, sy + 14);
      c.stroke();
    }

    // 莲花（两瓣侧瓣 + 中心瓣 + 金蕊）
    function lotus(cx, cy, sc) {
      c.save();
      c.translate(cx, cy);
      c.scale(sc, sc);
      c.fillStyle = blue;
      [-1, 1].forEach(function (d) {
        c.beginPath();
        c.ellipse(d * 13, 4, 11, 19, d * 0.55, 0, Math.PI * 2);
        c.fill();
      });
      c.fillStyle = blueDeep;
      c.beginPath();
      c.ellipse(0, -4, 10, 20, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#c9a227';
      c.beginPath();
      c.arc(0, -18, 2.6, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    for (var f = 0; f < 4; f++) lotus(120 + f * 256, H / 2 - 6, 1.15);

    // —— 祥云（填充式，穿插藤蔓之间） ——
    function cloud(cx, cy, sc) {
      c.save();
      c.translate(cx, cy);
      c.scale(sc, sc);
      c.fillStyle = blue;
      c.beginPath();
      c.arc(-14, 0, 10, Math.PI * 0.4, Math.PI * 1.6);
      c.arc(0, -7, 12, Math.PI, Math.PI * 2);
      c.arc(14, 0, 10, Math.PI * 1.4, Math.PI * 0.6);
      c.closePath();
      c.fill();
      c.strokeStyle = blue;
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(20, 4);
      c.quadraticCurveTo(34, 8, 46, 2);
      c.stroke();
      c.restore();
    }
    cloud(250, 34, 0.8); cloud(505, 122, 0.7); cloud(760, 34, 0.8);

    // —— 上下细金勾线（克制：只两条细线） ——
    c.strokeStyle = '#c9a227';
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, 8); c.lineTo(W, 8); c.stroke();
    c.beginPath(); c.moveTo(0, H - 8); c.lineTo(W, H - 8); c.stroke();

    var tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = THREE.RepeatWrapping;
    return tex;
  }

  /**
   * 匾额：深青底 + 金字「千年青史」+ 回纹边框 + 莲花角饰
   * 同一张 Canvas 同时用作 map 与 emissiveMap（穿门后金字脉动发光）
   */
  function makePlaqueCanvas() {
    var W = 1024, H = 264;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');

    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#20404f');
    g.addColorStop(1, '#17303d');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    // 回纹边框
    c.strokeStyle = '#c9a227';
    c.lineWidth = 6;
    c.strokeRect(14, 14, W - 28, H - 28);
    c.lineWidth = 2.5;
    c.strokeRect(28, 28, W - 56, H - 56);
    c.lineWidth = 2;
    for (var x = 44; x < W - 44; x += 22) {
      c.beginPath(); c.moveTo(x, 20); c.lineTo(x, 36); c.stroke();
      c.beginPath(); c.moveTo(x, H - 20); c.lineTo(x, H - 36); c.stroke();
    }

    // 两侧莲花角饰（简笔金莲）
    function lotusCorner(cx, d) {
      c.fillStyle = '#c9a227';
      c.save();
      c.translate(cx, H / 2);
      c.scale(d, 1);
      c.beginPath();
      c.ellipse(-46, 0, 9, 16, -0.5, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(-34, -12, 7, 12, -0.9, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(-34, 12, 7, 12, 0.9, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    lotusCorner(70, 1);
    lotusCorner(W - 70, -1);

    // 金字「千年青史」
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '600 118px "Songti SC", "SimSun", "STSong", serif';
    c.fillStyle = '#e8c96a';
    c.strokeStyle = '#8a6d1d';
    c.lineWidth = 2;
    var text = '千年青史';
    var charW = 150, startX = W / 2 - 1.5 * charW;
    for (var i = 0; i < 4; i++) {
      var chx = startX + i * charW;
      c.strokeText(text[i], chx, H / 2 + 6);
      c.fillText(text[i], chx, H / 2 + 6);
    }

    var tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /** 立柱莲纹腰带条幅 */
  function makePillarCanvas() {
    var W = 128, H = 512;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    c.fillStyle = '#f0f1ec';
    c.fillRect(0, 0, W, H);
    var blue = '#2c5f8a';
    for (var i = 0; i < 6; i++) {
      var cy = 46 + i * 76;
      c.strokeStyle = blue;
      c.lineWidth = 3;
      c.beginPath(); c.ellipse(W / 2, cy, 22, 30, 0, 0, Math.PI * 2); c.stroke();
      c.fillStyle = blue;
      c.beginPath(); c.ellipse(W / 2, cy, 12, 18, 0, 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = '#c9a227';
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, 6); c.lineTo(W, 6); c.stroke();
    c.beginPath(); c.moveTo(0, H - 6); c.lineTo(W, H - 6); c.stroke();
    var tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  /* ===================================================================
     编钟音效（WebAudio 合成，三声钟鸣，无外部音频文件）
     =================================================================== */
  function ensureAudio() {
    try {
      if (!state.audioCtx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        state.audioCtx = new AC();
      }
      if (state.audioCtx.state === 'suspended') state.audioCtx.resume();
    } catch (e) { /* 无音频环境（如无头浏览器）时静默跳过 */ }
  }

  /** 单声钟鸣：基音 + 非谐泛音 + 指数衰减包络 */
  function bellNote(freq, when, gain) {
    var ac = state.audioCtx;
    var t = ac.currentTime + when;
    // 基音
    var o1 = ac.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = freq;
    // 非谐泛音（钟的金属质感）
    var o2 = ac.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 2.76;
    var g = ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    var g2 = ac.createGain();
    g2.gain.setValueAtTime(gain * 0.22, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o1.connect(g).connect(ac.destination);
    o2.connect(g2).connect(ac.destination);
    o1.start(t); o2.start(t);
    o1.stop(t + 1.7); o2.stop(t + 0.8);
  }

  /** 编钟三连音（五声音阶，短促庄重） */
  function playChime() {
    if (!state.cfg.chime) return;
    try {
      ensureAudio();
      if (!state.audioCtx || state.audioCtx.state !== 'running') return;
      bellNote(392.0, 0.00, 0.20);   // G4
      bellNote(440.0, 0.22, 0.16);   // A4
      bellNote(587.3, 0.46, 0.22);   // D5
    } catch (e) { /* 静默失败，不影响视觉 */ }
  }

  // 首次用户交互时解锁 AudioContext（浏览器自动播放策略）
  function bindAudioUnlock() {
    ['pointerdown', 'wheel', 'keydown'].forEach(function (ev) {
      window.addEventListener(ev, function onFirst() {
        ensureAudio();
        if (state.audioCtx && state.audioCtx.state === 'running') {
          state.audioUnlocked = true;
          ['pointerdown', 'wheel', 'keydown'].forEach(function (e2) {
            window.removeEventListener(e2, onFirst);
          });
        }
      }, { passive: true });
    });
  }

  /* ===================================================================
     构建拱门（一次性）
     =================================================================== */
  function build(scene, ctx) {
    var cfg = (ctx.CONFIG && ctx.CONFIG.ENTRANCE) || null;
    if (!cfg || !cfg.enabled || state.built) return state.group;
    state.cfg = cfg;
    state.playerZGet = ctx.getPlayerZ;
    state.built = true;
    bindAudioUnlock();

    var W = cfg.totalWidth;        // 总宽（贴墙）
    var Ht = cfg.totalHeight;      // 总高
    var T = cfg.thickness;         // 厚度
    var OW = cfg.openW;            // 拱洞宽
    var OH = cfg.openH;            // 拱洞直壁高
    var QW = cfg.queueW;           // 阙台宽
    var QH = cfg.queueH;           // 阙台高
    var Z = cfg.z;                 // 拱门中心 z
    var bodyW = W - QW * 2;        // 主拱门体宽

    var stoneMat = new THREE.MeshStandardMaterial({ map: makeStoneCanvas(), roughness: 0.85, metalness: 0.02 });
    var goldMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.75 });
    var darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x2c2318, roughness: 0.7 });
    var roofMat = new THREE.MeshStandardMaterial({ color: 0x2e4a5c, roughness: 0.6 });

    var gate = new THREE.Group();
    gate.position.set(0, 0, Z);
    gate.name = 'entranceGate';

    /* ---------------- baseGroup 须弥座基座 + 前置矮台阶 ---------------- */
    var baseGroup = new THREE.Group();
    var base1 = new THREE.Mesh(new THREE.BoxGeometry(W, 0.16, T + 0.24), stoneMat);
    base1.position.set(0, 0.08, 0);
    var base2 = new THREE.Mesh(new THREE.BoxGeometry(W - 0.24, 0.14, T + 0.1), stoneMat);
    base2.position.set(0, 0.23, 0);
    var baseTrim = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.02, T + 0.14), goldMat);
    baseTrim.position.set(0, 0.31, 0);      // 须弥座金线（细）
    baseGroup.add(base1, base2, baseTrim);
    // 前置矮台阶（两级，很矮，纯视觉不挡行走）
    var step1 = new THREE.Mesh(new THREE.BoxGeometry(OW + 1.2, 0.05, 0.55), stoneMat);
    step1.position.set(0, 0.025, T / 2 + 0.5);
    var step2 = new THREE.Mesh(new THREE.BoxGeometry(OW + 0.7, 0.05, 0.38), stoneMat);
    step2.position.set(0, 0.025, T / 2 + 0.2);
    baseGroup.add(step1, step2);
    gate.add(baseGroup);

    /* ---------------- archBodyGroup 拱门主体 ---------------- */
    var archBodyGroup = new THREE.Group();
    var yBase = 0.37;                        // 立在须弥座上
    // 拱洞开孔：直壁 + 椭圆拱顶（Shape 打洞 + Extrude）
    var shape = new THREE.Shape();
    shape.moveTo(-bodyW / 2, yBase);
    shape.lineTo(bodyW / 2, yBase);
    shape.lineTo(bodyW / 2, Ht);
    shape.lineTo(-bodyW / 2, Ht);
    shape.closePath();
    var hole = new THREE.Path();
    hole.moveTo(-OW / 2, yBase);
    hole.lineTo(-OW / 2, OH - 0.55);
    hole.absellipse(0, OH - 0.55, OW / 2, 0.62, Math.PI, 0, true);
    hole.lineTo(OW / 2, yBase);
    hole.closePath();
    shape.holes.push(hole);

    var bodyGeo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
    bodyGeo.translate(0, 0, -T / 2);
    archBodyGroup.add(new THREE.Mesh(bodyGeo, stoneMat));

    // —— 中部横向青花浮雕带（拱洞上方，微凸起） ——
    var reliefY = OH + 0.62 + 0.05;
    var reliefW = bodyW - 0.55;
    var reliefTex = makeReliefCanvas();
    var reliefMat = new THREE.MeshStandardMaterial({
      map: reliefTex,
      bumpMap: reliefTex,
      bumpScale: 0.015,                      // 微凸起，不厚重
      roughness: 0.8, metalness: 0.02
    });
    var relief = new THREE.Mesh(new THREE.BoxGeometry(reliefW, cfg.reliefH, 0.06), reliefMat);
    relief.position.set(0, reliefY, T / 2 + 0.02);
    archBodyGroup.add(relief);

    // —— 拱门轮廓细金线（沿拱洞一圈，克制） ——
    function goldStrip(w, h, d, x, y, z) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), goldMat);
      m.position.set(x, y, z);
      archBodyGroup.add(m);
    }
    var FT = 0.045;
    var sideH = (OH - 0.55) - yBase + 0.35;
    goldStrip(FT, sideH, FT + 0.02, -OW / 2 - FT / 2, yBase + sideH / 2 - 0.1, T / 2 + 0.01);
    goldStrip(FT, sideH, FT + 0.02, OW / 2 + FT / 2, yBase + sideH / 2 - 0.1, T / 2 + 0.01);
    // 拱顶弧形金线（半环压扁成椭圆弧）
    var arcGold = new THREE.Mesh(new THREE.TorusGeometry(OW / 2 + 0.03, 0.022, 8, 40, Math.PI), goldMat);
    arcGold.position.set(0, OH - 0.55, T / 2 + 0.01);
    arcGold.scale.set(1.0, 0.85, 1);
    archBodyGroup.add(arcGold);
    // 浮雕带上下金细线
    goldStrip(reliefW + 0.1, 0.022, 0.03, 0, reliefY + cfg.reliefH / 2 + 0.03, T / 2 + 0.05);
    goldStrip(reliefW + 0.1, 0.022, 0.03, 0, reliefY - cfg.reliefH / 2 - 0.03, T / 2 + 0.05);
    gate.add(archBodyGroup);

    /* ---------------- pillarGroup 莲纹立柱（左右） ---------------- */
    var pillarGroup = new THREE.Group();
    var pillarMat = new THREE.MeshStandardMaterial({ map: makePillarCanvas(), roughness: 0.75 });
    [-1, 1].forEach(function (s) {
      var px = s * (OW / 2 + 0.42);
      var col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, OH - yBase - 0.1, 14), pillarMat);
      col.position.set(px, yBase + (OH - yBase) / 2, T / 2 + 0.06);
      var cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, 0.42), goldMat);
      cap.position.set(px, OH - 0.02, T / 2 + 0.06);
      var foot = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.1, 0.46), stoneMat);
      foot.position.set(px, yBase + 0.05, T / 2 + 0.06);
      pillarGroup.add(col, cap, foot);
    });
    gate.add(pillarGroup);

    /* ---------------- plaqueGroup 匾额组 ---------------- */
    var plaqueGroup = new THREE.Group();
    var plaqueTex = makePlaqueCanvas();
    var plaqueMat = new THREE.MeshStandardMaterial({
      map: plaqueTex,
      emissiveMap: plaqueTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.06,               // 初始微光
      roughness: 0.6
    });
    state.plaqueMats.push(plaqueMat);
    var plaqueY = Math.min(Ht - 0.55, reliefY + cfg.reliefH / 2 + 0.42);
    var plaque = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.64, 0.09), plaqueMat);
    plaque.position.set(0, plaqueY, T / 2 + 0.06);
    // 深青底板（比匾大一圈，出边框层次）
    var plaqueBack = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.74, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x142833, roughness: 0.55 }));
    plaqueBack.position.set(0, plaqueY, T / 2 + 0.02);
    plaqueGroup.add(plaqueBack, plaque);
    gate.add(plaqueGroup);

    /* ---------------- roofGroup 顶部飞檐组 ---------------- */
    var roofGroup = new THREE.Group();
    var roofY = Ht + 0.02;
    // 檐下梁枋（深木枋 + 金线描边）
    var beam = new THREE.Mesh(new THREE.BoxGeometry(bodyW + 0.2, 0.22, T + 0.1), darkWoodMat);
    beam.position.set(0, roofY + 0.11, 0);
    var beamTrim = new THREE.Mesh(new THREE.BoxGeometry(bodyW + 0.24, 0.03, T + 0.14), goldMat);
    beamTrim.position.set(0, roofY + 0.24, 0);
    roofGroup.add(beam, beamTrim);
    // 主屋脊 + 脊上金线
    var ridge = new THREE.Mesh(new THREE.BoxGeometry(bodyW + 0.5, 0.1, 0.34), darkWoodMat);
    ridge.position.set(0, roofY + 0.56, 0);
    var ridgeGold = new THREE.Mesh(new THREE.BoxGeometry(bodyW + 0.5, 0.02, 0.06), goldMat);
    ridgeGold.position.set(0, roofY + 0.62, 0);
    roofGroup.add(ridge, ridgeGold);
    // 左右坡屋面 + 翘角（每侧：主坡 + 上翘檐角）
    [-1, 1].forEach(function (s) {
      var slope = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.42, 0.06, T + 0.5), roofMat);
      slope.position.set(s * bodyW * 0.21, roofY + 0.42, 0);
      slope.rotation.z = -s * 0.16;
      var eaveGold = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.42, 0.025, 0.05), goldMat);
      eaveGold.position.set(s * bodyW * 0.21, roofY + 0.385, (T + 0.5) / 2);
      eaveGold.rotation.z = -s * 0.16;
      // 翘角（末端小段，向上翘起）
      var tip = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.14, 0.06, T + 0.46), roofMat);
      tip.position.set(s * (bodyW * 0.42 + bodyW * 0.055), roofY + 0.50, 0);
      tip.rotation.z = -s * 0.5;
      var tipGold = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.14, 0.025, 0.05), goldMat);
      tipGold.position.set(s * (bodyW * 0.42 + bodyW * 0.055), roofY + 0.465, (T + 0.46) / 2);
      tipGold.rotation.z = -s * 0.5;
      roofGroup.add(slope, eaveGold, tip, tipGold);
    });
    gate.add(roofGroup);

    /* ---------------- sidePlatformGroup 两侧阙台 ---------------- */
    var sidePlatformGroup = new THREE.Group();
    // 青花宝瓶材质（白瓷底 + 青花釉色）
    var vaseMat = new THREE.MeshStandardMaterial({ color: 0xeef2ef, roughness: 0.35, metalness: 0.05 });
    var vaseBlueMat = new THREE.MeshStandardMaterial({ color: 0x2c5f8a, roughness: 0.3 });
    [-1, 1].forEach(function (s) {
      var px = s * (bodyW / 2 + QW / 2);
      // 阙台主体（低于主拱门）
      var plat = new THREE.Mesh(new THREE.BoxGeometry(QW, QH, T + 0.3), stoneMat);
      plat.position.set(px, yBase + QH / 2, 0);
      // 阙台顶檐（小盖 + 金线）
      var platCap = new THREE.Mesh(new THREE.BoxGeometry(QW + 0.16, 0.09, T + 0.42), roofMat);
      platCap.position.set(px, yBase + QH + 0.045, 0);
      var platGold = new THREE.Mesh(new THREE.BoxGeometry(QW + 0.2, 0.022, T + 0.46), goldMat);
      platGold.position.set(px, yBase + QH + 0.10, 0);
      // 顶面迷你青花宝瓶（Lathe 轮廓瓶）
      var pts = [];
      var profile = [[0.00, 0], [0.10, 0.01], [0.13, 0.06], [0.15, 0.14], [0.12, 0.24],
                     [0.07, 0.30], [0.06, 0.34], [0.08, 0.37], [0.075, 0.40]];
      profile.forEach(function (p) { pts.push(new THREE.Vector2(p[0], p[1])); });
      var vaseGeo = new THREE.LatheGeometry(pts, 14);
      var vase = new THREE.Mesh(vaseGeo, vaseMat);
      vase.position.set(px, yBase + QH + 0.09, 0);
      // 瓶身青花箍线 + 瓶口金圈
      var vaseRing = new THREE.Mesh(new THREE.TorusGeometry(0.132, 0.011, 6, 18), vaseBlueMat);
      vaseRing.rotation.x = Math.PI / 2;
      vaseRing.position.set(px, yBase + QH + 0.09 + 0.16, 0);
      var vaseMouth = new THREE.Mesh(new THREE.TorusGeometry(0.076, 0.011, 6, 16), goldMat);
      vaseMouth.rotation.x = Math.PI / 2;
      vaseMouth.position.set(px, yBase + QH + 0.09 + 0.40, 0);
      sidePlatformGroup.add(plat, platCap, platGold, vase, vaseRing, vaseMouth);
    });
    gate.add(sidePlatformGroup);

    /* ---------------- 灯光分组（拱门自带，常亮不受入场压暗） ---------------- */
    // ① 正面冷白主光（打亮拱门立面）
    var frontSpot = new THREE.SpotLight(0xf5f8ff, 1.1, 14, Math.PI / 5, 0.45, 1.6);
    frontSpot.position.set(0, Ht + 0.4, Z + 4.6);
    frontSpot.target.position.set(0, Ht * 0.45, Z);
    gate.add(frontSpot, frontSpot.target);
    // ② 青花蓝洗墙灯（左右洗浮雕带与拱洞）
    [-1, 1].forEach(function (s) {
      var wash = new THREE.PointLight(0x4d7fb8, 0.55, 4.5, 2);
      wash.position.set(s * (bodyW / 2 - 0.2), OH + 0.4, T / 2 + 0.9);
      gate.add(wash);
    });
    // ③ 飞檐 & 匾额暖金轮廓光（左右檐角各一）
    [-1, 1].forEach(function (s) {
      var rim = new THREE.PointLight(0xffd9a0, 0.5, 5.5, 2);
      rim.position.set(s * (bodyW / 2 + 0.2), Ht + 0.35, T / 2 + 1.1);
      gate.add(rim);
    });
    // ④ 门前地面淡金光斑
    var pool = new THREE.PointLight(0xd8b46a, 0.5, 3.6, 2);
    pool.position.set(0, 0.45, T / 2 + 1.9);
    gate.add(pool);

    scene.add(gate);
    state.group = gate;
    return gate;
  }

  /* ===================================================================
     每帧更新：穿门触发 + 匾额金字发光脉动
     =================================================================== */
  function update(dt) {
    if (!state.built || !state.cfg) return;
    state.elapsed += dt;

    var pz = state.playerZGet ? state.playerZGet() : 0;

    // —— 触发判定：玩家 z 越过拱门背面（碰撞与渲染分离的纯 z 阈值） ——
    if (!state.entered && pz < state.cfg.z - state.cfg.thickness / 2 - state.cfg.triggerOffset) {
      state.entered = true;
      playChime();
      if (window.EraAtmosphere && window.EraAtmosphere.revealLights) {
        window.EraAtmosphere.revealLights();   // 长廊宫灯依次渐亮 + 灯光整体渐亮
      }
    }

    // —— 匾额金字：穿门后缓慢微弱发光脉动 ——
    var target = state.entered ? (0.30 + 0.14 * Math.sin(state.elapsed * 1.4)) : 0.06;
    for (var i = 0; i < state.plaqueMats.length; i++) {
      var m = state.plaqueMats[i];
      m.emissiveIntensity += (target - m.emissiveIntensity) * Math.min(1, dt * 2.2);
    }
  }

  window.EntranceGate = {
    build: build,
    update: update,
    hasEntered: function () { return state.entered; },
    group: function () { return state.group; }
  };
})();
