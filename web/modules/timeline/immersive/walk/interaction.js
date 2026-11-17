/* ═══════════════════════════════════════════════════════════════
   千年青史 · 时间走廊 · 交互层
   - GLB 只提供几何；所有行为在这里
   - 相机 x → 当前工序 → 抽出对应卡片
   - 三级信息密度：远(色块) / 中(工序名) / 近(卡片)
   - 进度点亮 + 朝代转场窑火
   ═══════════════════════════════════════════════════════════════ */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const CFG = {
  xMin: -13.0,
  xMax: 138.2,          // 末端封口墙 x=139.6，留 1.4m 余量
  eye: 1.62,
  speed: 4.2,
  wheelStep: 1.1,
  nearDist: 2.60,        // 卡片激活半径（沿 x）
  pullOut: 0.12,         // 墙面展牌抬起的高度（只做暗示，不进入视野）
  tilt: 0.45,            // 抬起时的微转角度
  ease: 0.14,
  eras: null,
  steps: [],
};

const state = {
  vx: 0, yaw: -Math.PI / 2, pitch: 0, drag: false,
  lastX: 0, lastY: 0, ready: false, activeStep: null,
  eraIndex: -1, burn: 0, tint: new THREE.Color('#D8C6A8'),
};

let renderer, scene, camera, clock;

/* ═══ 朝代跳转栏（自动注入）═══ */
const ERA_LABELS = ['唐', '宋', '元', '明', '清', '民国', '现代'];
const GATE_STEP = 20;          // 每朝代长廊 20m
const STAND_BACK = 2.4;        // 站在拱门前 2.4m
const JUMP = { active: false, from: 0, to: 0, t0: 0, dur: 900 };

let dynastyBar = null;
const dynastyBtns = [];

function eraAnchorX(i) { return i * GATE_STEP - STAND_BACK; }

function injectDynCss() {
  if (document.getElementById('dynCss')) return;
  const st = document.createElement('style');
  st.id = 'dynCss';
  st.textContent = `
  #dynBar{position:fixed;left:0;right:0;bottom:0;padding:20px 0 26px;
    display:flex;justify-content:center;pointer-events:none;z-index:40;
    background:linear-gradient(to top,rgba(10,14,20,.82),rgba(10,14,20,0))}
  #dynBar .track{display:flex;align-items:center;gap:clamp(16px,3.2vw,46px);
    pointer-events:auto;position:relative}
  #dynBar .track::before{content:'';position:absolute;left:0;right:0;top:50%;
    height:1px;background:linear-gradient(90deg,transparent,#C9A22755 12%,
    #C9A22788 50%,#C9A22755 88%,transparent);z-index:-1}
  .dynBtn{appearance:none;border:0;background:none;color:#e8eef2cc;
    font-family:inherit;font-size:clamp(17px,2.0vw,23px);letter-spacing:.22em;
    padding:8px 6px;cursor:pointer;position:relative;transition:color .25s,transform .25s}
  .dynBtn::after{content:'';position:absolute;left:50%;bottom:-6px;width:7px;height:7px;
    margin-left:-3.5px;border-radius:50%;background:#C9A22766;
    box-shadow:0 0 0 3px rgba(13,18,24,.9);transition:all .25s}
  .dynBtn:hover{color:#F2E4BC}
  .dynBtn.on{color:#F5D98A;transform:translateY(-1px)}
  .dynBtn.on::after{width:12px;height:12px;margin-left:-6px;bottom:-9px;
    background:#F5D98A;box-shadow:0 0 10px 2px #F5D98A88,0 0 0 3px rgba(13,18,24,.9)}
  `;
  document.head.appendChild(st);
}

function buildDynastyBar() {
  if (dynastyBar) return;
  injectDynCss();
  const bar = document.createElement('div');
  bar.id = 'dynBar';
  const track = document.createElement('div');
  track.className = 'track';
  bar.appendChild(track);

  const mk = (label, x, idx) => {
    const b = document.createElement('button');
    b.className = 'dynBtn';
    b.dataset.idx = String(idx);
    b.textContent = label;
    b.addEventListener('click', () => jumpTo(x));
    track.appendChild(b);
    dynastyBtns.push(b);
  };

  mk('序厅', CFG.xMin + 1.0, -1);
  const eras = (CFG.eras || []);
  eras.forEach((e, i) => {
    const lbl = ERA_LABELS[i] || String(e.name || '').replace(/代$/, '');
    mk(lbl, eraAnchorX(i), i);
  });

  document.body.appendChild(bar);
  dynastyBar = bar;
}

function jumpTo(x) {
  JUMP.active = true;
  JUMP.from = camera.position.x;
  JUMP.to = Math.max(CFG.xMin, Math.min(CFG.xMax, x));
  JUMP.t0 = performance.now();
  state.vx = 0;
  state.yaw = -Math.PI / 2;      // 面朝 +X（望向拱门）
  state.pitch = 0;
}

function syncDynBar() {
  if (!dynastyBtns.length) return;
  const x = camera.position.x;
  let idx = -1;
  if (x > -2.0) {
    idx = Math.floor((x + STAND_BACK) / GATE_STEP);
    idx = Math.max(0, Math.min(6, idx));
  }
  dynastyBtns.forEach((b) => {
    const on = Number(b.dataset.idx) === idx;
    if (on !== b.classList.contains('on')) b.classList.toggle('on', on);
  });
}

const cardIndex = new Map();     // cardName -> {name, group, face, home, t}
const textIndex = new Map();     // textName -> mesh
const cardCache = new Map();     // cardName -> CanvasTexture
let hemi, keyLight;

/* ───────── 启动 ───────── */
export async function start(canvas, ui) {
  const stepsData = await fetch('./steps.json').then(r => r.json()).catch(() => null);
  if (!stepsData) {
    ui.setLoad('缺少 steps.json，请先跑 导出_glb与数据.py');
    return;
  }
  CFG.eras = stepsData.eras;
  CFG.eras.forEach((e, ei) => {
    e.steps.forEach(s => CFG.steps.push({ ...s, era: e, ei }));
  });

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  scene = new THREE.Scene();
  scene.background = new THREE.Color('#161a1f');
  scene.fog = new THREE.Fog('#161a1f', 30, 120);

  camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.05, 400);
  camera.rotation.order = 'YXZ';
  camera.position.set(CFG.xMin, CFG.eye, 0);
  buildDynastyBar();

  hemi = new THREE.HemisphereLight(0xffe6c8, 0x2a2f38, 0.9);
  scene.add(hemi);
  keyLight = new THREE.DirectionalLight(0xfff2dd, 1.35);
  keyLight.position.set(-8, 9, 6);
  scene.add(keyLight);
  const fill = new THREE.DirectionalLight(0x9fb6d4, 0.45);
  fill.position.set(8, 4, -6);
  scene.add(fill);

  // 金属需要环境反射，否则铜/金/青铜全部渲染成黑色
  // 不用 RoomEnvironment 外部模块：自己生成一张 64×32 的渐变环境图
  try {
    const W = 64, H = 32;
    const data = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) {
      const v = y / (H - 1);                    // 0=顶 1=底
      const r = Math.round(255 - 90 * v);
      const g = Math.round(238 - 110 * v);
      const b = Math.round(214 - 120 * v);
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromEquirectangular(tex);
    scene.environment = envRT.texture;
    if ('environmentIntensity' in scene) scene.environmentIntensity = 0.9;
    tex.dispose();
    pmrem.dispose();
    console.log('[交互] 环境贴图已生成');
  } catch (e) {
    console.warn('[交互] 环境贴图失败', e);
  }

  clock = new THREE.Clock();
  bindInput(canvas);
  addEventListener('resize', onResize);
  onResize();

  const loader = new GLTFLoader();
  try {
    const draco = new DRACOLoader();
    draco.setDecoderPath('./lib/draco/');
    loader.setDRACOLoader(draco);
    console.log('[交互] Draco 解码器已挂载');
  } catch (e) {
    console.warn('[交互] Draco 解码器加载失败，将按未压缩模型读取', e);
  }

  // 看门狗：15 秒还没 ready 就把状态写到开场界面上，方便定位
  const t0 = Date.now();
  const watchdog = setInterval(() => {
    if (state.ready || !state.ui) { clearInterval(watchdog); return; }
    const sec = ((Date.now() - t0) / 1000).toFixed(0);
    ui.setLoad(`载入中… ${sec}s　如果长时间无变化，请检查：\n` +
      `① 是否用 启动.bat 打开的（不能用 file:// 双击）\n` +
      `② 浏览器控制台（F12）是否有红色报错`);
  }, 15000);

  const onLoaded = (gltf) => {
    scene.add(gltf.scene);
    modelBox = new THREE.Box3().setFromObject(gltf.scene);
    console.log('[交互] 模型包围盒', modelBox.min, modelBox.max);

    // glTF 不支持体积材质：Blender 里的「体积雾」导出后成了不透明白盒，
    // 会整条走廊罩住，必须隐藏。改为用 three 的雾效表现纵深。
    const kill = [];
    gltf.scene.traverse((o) => {
      if (o.name && (o.name.startsWith('体积雾') || o.name.startsWith('烟雾'))) kill.push(o);
    });
    kill.forEach(o => { o.visible = false; });
    console.log('[交互] 隐藏体积雾盒', kill.length);

    buildIndex(gltf.scene);
    collectHoverables(gltf.scene);
    state.ready = true;
    ui.setLoad('');
    ui.enableStart();
  };

  if (window.__GLB_B64__) {
    // 单文件版：模型以 base64 内嵌，直接解析，不依赖网络与 fetch
    try {
      ui.setLoad('正在解析场景…');
      const bin = atob(window.__GLB_B64__);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      window.__GLB_B64__ = null;
      loader.parse(buf.buffer, '', onLoaded, (e) => {
        console.error(e);
        ui.setLoad('解析失败：' + (e && e.message ? e.message : e));
      });
    } catch (e) {
      console.error(e);
      ui.setLoad('内联模型解码失败：' + e.message);
    }
  } else {
    loader.load('../models/corridor_new.glb', onLoaded, (xhr) => {
      if (xhr.total) ui.setLoad(`正在载入场景… ${Math.round(xhr.loaded / xhr.total * 100)}%`);
    }, (err) => {
      console.error(err);
      ui.setLoad('载入失败：' + (err?.message || err));
    });
  }

  requestAnimationFrame(tick);
  ui.onProgress = (p) => { };
  state.ui = ui;
}

/* ───────── 悬停展品显示名称 ───────── */
const hoverables = [];
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
let _tipEl = null, _lastHover = 0;

/* ═══ 图片点击查看（自动注入）═══ */
function collectHoverables(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const nm = o.name || '';
    const isRight = nm.startsWith('右墙图_');
    const isLeft = nm.startsWith('流程图_');
    if (!isRight && !isLeft) return;

    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const m = mats.find(x => x && x.name &&
      (x.name.startsWith('右墙图_') || x.name.startsWith('流程图_'))) || mats[0];
    if (!m || !m.name) return;

    let label = '';
    if (isRight) {
      label = m.name
        .replace(/^右墙图_/, '')
        .replace(/\.(jpe?g|png|webp)(\.\d+)?$/i, '');
    } else {
      const mm = /流程图_(.+?)_(\d+)/.exec(m.name);
      if (mm) {
        const era = mm[1], idx = parseInt(mm[2], 10);
        const st = (CFG.steps || []).find(z => z.era && z.era.name === era && z.i === idx);
        label = era + ' · 第' + idx + '步' + (st && st.name ? ' ' + st.name : '');
      } else {
        label = '工序图';
      }
    }
    if (!label) return;
    o.userData.label = label;
    hoverables.push(o);
  });
  console.log('[交互] 可悬停展品', hoverables.length);
}

/* ═══ 两栏图说（自动注入）═══ */
let _viewer = null;

function ensureViewer() {
  if (_viewer) return _viewer;
  const ov = document.createElement('div');
  ov.id = 'imgViewer';
  ov.innerHTML = [
    '<div class="wrap">',
    '  <div class="left"><canvas></canvas></div>',
    '  <div class="right">',
    '    <div class="era"></div>',
    '    <div class="title"></div>',
    '    <div class="rule"></div>',
    '    <div class="desc"></div>',
    '    <div class="hintx">点击任意处关闭</div>',
    '  </div>',
    '</div>'
  ].join('');
  document.body.appendChild(ov);

  const st = document.createElement('style');
  st.textContent = [
    '#imgViewer{position:fixed;inset:0;z-index:60;display:none;align-items:center;',
    'justify-content:center;background:rgba(6,9,13,.94);padding:3vh 3vw}',
    '#imgViewer.on{display:flex}',
    '#imgViewer .wrap{display:flex;gap:32px;align-items:center;max-width:94vw;max-height:92vh}',
    '#imgViewer .left{flex:0 1 auto;display:flex;align-items:center;justify-content:center}',
    '#imgViewer canvas{max-width:52vw;max-height:86vh;border:1px solid #C9A22755;',
    'box-shadow:0 20px 70px rgba(0,0,0,.75);background:#0d1116}',
    '#imgViewer .right{flex:0 0 300px;max-width:34vw;color:#E7DED0;',
    'font-family:inherit;text-align:left;align-self:center}',
    '#imgViewer .era{font-size:13px;letter-spacing:.3em;color:#C9A227;opacity:.9}',
    '#imgViewer .title{font-size:26px;letter-spacing:.14em;margin-top:12px;',
    'color:#F3E7C8;line-height:1.5}',
    '#imgViewer .rule{height:1px;background:linear-gradient(90deg,#C9A22799,transparent);',
    'margin:18px 0 16px}',
    '#imgViewer .desc{font-size:15px;line-height:2.0;letter-spacing:.05em;',
    'color:#CFC6B6;white-space:pre-wrap}',
    '#imgViewer .hintx{margin-top:26px;font-size:12px;letter-spacing:.2em;color:#7C8794}',
    '@media (max-width:820px){',
    '  #imgViewer .wrap{flex-direction:column;gap:16px}',
    '  #imgViewer canvas{max-width:90vw;max-height:56vh}',
    '  #imgViewer .right{flex:1 1 auto;max-width:90vw}',
    '  #imgViewer .title{font-size:20px}',
    '  #imgViewer .desc{font-size:13px;line-height:1.8}',
    '}'
  ].join('');
  document.head.appendChild(st);
  ov.addEventListener('click', () => ov.classList.remove('on'));
  _viewer = ov;
  return ov;
}

function eraOfObject(obj) {
  const nm = obj.name || '';
  const m = /(?:右墙图|流程图)_(.+?)_/.exec(nm);
  return m ? m[1] : '';
}

function lookupInfo(era, label) {
  const db = window.__IMGINFO__;
  if (!db) return null;
  return db[era + '|' + label] || db[label] || null;
}

function openImage(obj) {
  const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
  const m = mats.find(x => x && x.map && x.map.image);
  if (!m) return;

  const img = m.map.image;
  const ov = ensureViewer();
  const cv = ov.querySelector('canvas');
  cv.width = img.width || 1024;
  cv.height = img.height || 1024;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#0d1116';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(img, 0, 0, cv.width, cv.height);

  const label = obj.userData.label || '';
  const era = eraOfObject(obj);
  const rec = lookupInfo(era, label);

  ov.querySelector('.era').textContent =
    (rec && rec.era ? rec.era : era) + (rec && rec.kind ? '　·　' + rec.kind : '');
  ov.querySelector('.title').textContent = (rec && rec.title) || label || '—';
  ov.querySelector('.desc').textContent =
    (rec && rec.desc) || '暂无说明。';

  ov.classList.add('on');
  hideTip();
}

/* ── 悬停名称气泡（两栏图说补回）── */
function showTip(text, cx, cy) {
  if (!_tipEl) _tipEl = document.getElementById('tip');
  if (!_tipEl) return;
  _tipEl.textContent = text;
  _tipEl.style.left = cx + 'px';
  _tipEl.style.top = cy + 'px';
  _tipEl.classList.add('on');
}

function hideTip() {
  if (_tipEl) _tipEl.classList.remove('on');
}

/* ───────── 建索引 ───────── */
function buildIndex(root) {
  let nCard = 0, nText = 0;

  // 只认 steps.json 里登记过的卡片名，避免把 <名字>_0/_1/_2 子图元重复计数
  const cardNames = new Set(CFG.steps.map(s => s.card));

  // 先建 流程名_<朝代>_<NN> → x 的查找表，避免每帧 find
  const textX = new Map();
  for (const era of CFG.eras) {
    for (const s of era.steps) {
      textX.set('流程名_' + era.name + '_' + String(s.i).padStart(2, '0'), s.x);
      textX.set('流程序_' + era.name + '_' + String(s.i).padStart(2, '0'), s.x);
    }
  }

  root.traverse((o) => {
    if (!o.name) return;
    if (cardNames.has(o.name)) {
      const meshes = [];
      o.traverse(n => { if (n.isMesh) meshes.push(n); });   // primitive 顺序：0框 1面 2背
      const face = meshes[1] || meshes[0] || null;
      if (face) {
        face.material = new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
        });
        face.visible = false;   // 卡面永久隐藏：文字由中央信息栏承担
        face.visible = false;   // 卡面永久隐藏：文字由中央信息栏承担
        face.visible = false;   // 卡面永久隐藏：文字由中央信息栏承担
        cardIndex.set(o.name, {
          name: o.name, group: o, face,
          home: o.position.clone(), t: 0,
        });
        nCard++;
      }
    } else if (textX.has(o.name) && o.isMesh) {
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.depthWrite = false;
      o.material.opacity = 0.15;
      textIndex.set(o.name, { mesh: o, x: textX.get(o.name) });
      nText++;
    }
  });
  console.log(`[交互] 卡片 ${nCard} / 流程文字 ${nText}`);
}

/* ───────── 输入 ───────── */
function bindInput(canvas) {
  addEventListener('wheel', (e) => {
    e.preventDefault();
    state.vx += (e.deltaY < 0 ? 1 : -1) * CFG.wheelStep;
    state.vx = Math.max(-CFG.speed, Math.min(CFG.speed, state.vx));
  }, { passive: false });

  canvas.addEventListener('pointerdown', (e) => {
    state.drag = true; state.lastX = e.clientX; state.lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    state.downX = e.clientX; state.downY = e.clientY;
  });
canvas.addEventListener('pointerup', (e) => {
  state.drag = false;
  try { canvas.releasePointerCapture(e.pointerId); } catch (_) { }

  // 拖拽超过 6px 视为转头，不算点击，避免误开大图
  const dx = e.clientX - (state.downX || e.clientX);
  const dy = e.clientY - (state.downY || e.clientY);
  if (Math.hypot(dx, dy) > 6) return;
  if (!state.ready || !hoverables.length) return;

  const r = canvas.getBoundingClientRect();
  _ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  _ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  _ray.setFromCamera(_ndc, camera);
  const hits = _ray.intersectObjects(hoverables, false);
  if (hits.length && hits[0].distance < 20) openImage(hits[0].object);
});
  canvas.addEventListener('pointermove', (e) => {
    if (state.drag) {
      state.yaw -= (e.clientX - state.lastX) * 0.0022;
      state.pitch -= (e.clientY - state.lastY) * 0.0022;
      state.pitch = Math.max(-1.02, Math.min(1.02, state.pitch));
      state.lastX = e.clientX; state.lastY = e.clientY;
      hideTip();
      return;
    }
    // 悬停拾取（节流 80ms，避免每帧射线）
    const now = performance.now();
    if (now - _lastHover < 80) return;
    _lastHover = now;
    if (!hoverables.length || !state.ready) return;

    const r = canvas.getBoundingClientRect();
    _ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    _ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    _ray.setFromCamera(_ndc, camera);
    const hits = _ray.intersectObjects(hoverables, false);
    if (hits.length && hits[0].distance < 20 && hits[0].object.userData.label) {
      showTip(hits[0].object.userData.label, e.clientX, e.clientY);
    } else {
      hideTip();
    }
  });
  addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && _viewer) _viewer.classList.remove('on');
    if (e.key === 'r' || e.key === 'R') {
      camera.position.x = CFG.xMin; state.vx = 0;
      state.yaw = -Math.PI / 2; state.pitch = 0;
    }
  });
}

function onResize() {
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}

/* ───────── 主循环 ───────── */
let frames = 0, lastError = '', modelBox = null;

function tick() {
  requestAnimationFrame(tick);
  try {
    const dt = Math.min(clock.getDelta(), 0.05);

    if (JUMP.active) {
      const t = Math.min(1, (performance.now() - JUMP.t0) / JUMP.dur);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      camera.position.x = JUMP.from + (JUMP.to - JUMP.from) * e;
      if (t >= 1) JUMP.active = false;
    } else if (Math.abs(state.vx) > 0.002) {
      camera.position.x += state.vx * dt;
      camera.position.x = Math.max(CFG.xMin, Math.min(CFG.xMax, camera.position.x));
      state.vx *= Math.exp(-1.6 * dt);
    }
    camera.position.y = CFG.eye;
    camera.position.z = 0;
    camera.rotation.set(state.pitch, state.yaw, 0);
    syncDynBar();

    if (state.ready) {
      updateEntrance();
      updateEra(dt);
      updateStep(dt);
      updateTexts();
    }
    if (state.ui) state.ui.onProgress(progressRatio());
    renderer.render(scene, camera);
    frames++;
    if (frames % 12 === 0) updateDebug();
  } catch (e) {
    if (!lastError) {
      lastError = (e && e.message) || String(e);
      console.error('[交互] 渲染异常：', e);
      updateDebug();
    }
  }
}

function updateDebug() {
  const el = document.getElementById('dbg');
  if (!el) return;
  const info = renderer.info.render;
  const b = modelBox;

  // 正前方射线：看看到底撞上了什么
  let rayTxt = '—';
  try {
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = rc.intersectObjects(scene.children, true).slice(0, 2);
    rayTxt = hits.length
      ? hits.map(h => `${h.object.name || '(无名)'} @${h.distance.toFixed(2)}m`).join('  |  ')
      : '未命中任何物体';
  } catch (e) { rayTxt = '射线失败 ' + e.message; }

  const cardState = cardStateText();

  el.textContent =
    `相机 x=${camera.position.x.toFixed(1)} y=${camera.position.y.toFixed(2)} yaw=${state.yaw.toFixed(2)}\n` +
    `画面 调用=${info.calls} 三角=${info.triangles} 帧=${frames}\n` +
    `场景 子=${scene.children.length} 卡片=${cardIndex.size} 文字=${textIndex.size} ready=${state.ready}\n` +
    `模型 ${b ? `X ${b.min.x.toFixed(1)}~${b.max.x.toFixed(1)} Y ${b.min.y.toFixed(1)}~${b.max.y.toFixed(1)} Z ${b.min.z.toFixed(1)}~${b.max.z.toFixed(1)}` : '未加载'}\n` +
    `射线 ${rayTxt}\n` +
    `卡片 ${cardState}` +
    (lastError ? `\n错误 ${lastError}` : '');
}

function cardStateText() {
  let popped = 0;
  for (const [, c] of cardIndex) if (c.t > 0.04) popped++;
  const act = state.activeStep;
  if (!act) return `未激活  浮动中=${popped}`;
  const c = cardIndex.get(act.card);
  if (!c) return `激活=${act.card}（索引里没有）浮动中=${popped}`;
  const p = new THREE.Vector3();
  c.group.getWorldPosition(p);
  const ndc = p.clone().project(camera);
  const inView = Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 && ndc.z < 1;
  return `激活=${act.card} x=${act.x} t=${c.t.toFixed(2)} ` +
    `pos(${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}) ` +
    `NDC(${ndc.x.toFixed(2)},${ndc.y.toFixed(2)}) 屏内=${inView ? '是' : '否'} 浮动中=${popped}`;
}

/* ───────── 入口：由暗到明 ───────── */
const ENT_X0 = -14.0;      // 门口：最暗
const ENT_X1 = -1.5;       // 唐门前：全亮

function updateEntrance() {
  const raw = (camera.position.x - ENT_X0) / (ENT_X1 - ENT_X0);
  const t = Math.max(0, Math.min(1, raw));
  const s = t * t * (3 - 2 * t);        // 平滑过渡

  hemi.intensity = 0.10 + 1.05 * s;
  keyLight.intensity = 0.12 + 1.30 * s;
  if ('environmentIntensity' in scene) scene.environmentIntensity = 0.10 + 1.00 * s;

  if (scene.fog) {
    scene.fog.near = 5 + 22 * s;
    scene.fog.far = 34 + 96 * s;
  }
  if (state.ui && state.ui.setDark) state.ui.setDark(0.96 * (1 - s));
}

/* ───────── 当前朝代与转场 ───────── */
function updateEra(dt) {
  const x = camera.position.x;
  let idx = -1;
  for (let i = 0; i < CFG.eras.length; i++) {
    if (x >= CFG.eras[i].x0 && x < CFG.eras[i].x1) { idx = i; break; }
  }
  if (idx !== state.eraIndex && idx >= 0) {
    state.eraIndex = idx;
    state.burn = 1;                       // 触发窑火
    state.tint.set(CFG.eras[idx].color);
    if (state.ui) state.ui.setEra(CFG.eras[idx].name);
  }
  if (state.burn > 0) state.burn = Math.max(0, state.burn - dt / 1.2);
  const b = state.burn;
  hemi.color.setRGB(
    THREE.MathUtils.lerp(state.tint.r * 1.15 + 0.25, 1.0, b * 0.85),
    THREE.MathUtils.lerp(state.tint.g * 1.1 + 0.22, 0.36, b * 0.85),
    THREE.MathUtils.lerp(state.tint.b * 1.1 + 0.22, 0.12, b * 0.85)
  );
  scene.fog.color.copy(state.tint).lerp(new THREE.Color('#C2410C'), b * 0.75).multiplyScalar(0.55);
  scene.background.copy(scene.fog.color);
}

/* ───────── 最近一步：墙上展牌轻抬（不飞到眼前） ───────── */
function updateStep(dt) {
  const x = camera.position.x;
  let best = null, bestD = 1e9;
  for (const s of CFG.steps) {
    const d = Math.abs(s.x - x);
    if (d < bestD) { bestD = d; best = s; }
  }
  const act = (best && bestD <= CFG.nearDist) ? best : null;
  if (act !== state.activeStep) {
    state.activeStep = act;
    if (act) ensureCardTexture(act);
    if (state.ui) state.ui.setStep(act);
  }

/* ═══ 已禁用折叠弹出（固定贴墙）═══ */
  // 卡片固定贴墙：不再位移、不再旋转、不做透明度呼吸
  for (const [, c] of cardIndex) {
    c.t = 0;
    c.group.position.x = c.home.x;
    c.group.position.y = c.home.y;
    c.group.position.z = c.home.z;
    c.group.rotation.y = 0;
    if (c.face) c.face.visible = false;
  }
}

/* ───────── 三级密度：文字淡入淡出 ───────── */
function updateTexts() {
  const x = camera.position.x;
  for (const [, rec] of textIndex) {
    const d = Math.abs(rec.x - x);
    let target;
    if (d > 8) target = 0.15;        // 远：只留一层淡影
    else if (d > 3) target = 1.0;    // 中：工序名清晰
    else target = 0.55;              // 近：让位给卡片
    const m = rec.mesh.material;
    m.opacity += (target - m.opacity) * 0.12;
  }
}

function progressRatio() {
  return Math.max(0, Math.min(1, (camera.position.x - CFG.xMin) / (145 - CFG.xMin)));
}

/* ───────── 卡片正面：先画占位，图到了再补 ───────── */
function drawCardFace(g, W, H, step, img) {
  g.fillStyle = '#F2EDE2';
  g.fillRect(0, 0, W, H);

  g.strokeStyle = '#C9A227'; g.lineWidth = 10;
  g.strokeRect(24, 24, W - 48, H - 48);
  g.strokeStyle = 'rgba(201,162,39,.32)'; g.lineWidth = 3;
  g.strokeRect(48, 48, W - 96, H - 96);

  g.fillStyle = '#A8323C';
  g.font = 'bold 96px "Microsoft YaHei",sans-serif';
  g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillText(String(step.i).padStart(2, '0'), 72, 66);

  g.fillStyle = '#8A8F98';
  g.font = '38px "Microsoft YaHei",sans-serif';
  g.textAlign = 'right';
  g.fillText(step.era.name, W - 72, 92);

  const iw = W - 160, ih = Math.round(iw * 0.75);
  const ix = 80, iy = 210;

  if (img) {
    g.drawImage(img, ix, iy, iw, ih);
  } else {
    g.fillStyle = '#E2DACB';
    g.fillRect(ix, iy, iw, ih);
    g.fillStyle = '#B3A88F';
    g.font = '40px "Microsoft YaHei",sans-serif';
    g.textAlign = 'center';
    g.fillText('载入中…', ix + iw / 2, iy + ih / 2 - 20);
    g.textAlign = 'left';
  }
  g.strokeStyle = '#B9AE97'; g.lineWidth = 4;
  g.strokeRect(ix, iy, iw, ih);

  g.fillStyle = '#1C2536';
  g.font = 'bold 76px "Microsoft YaHei",sans-serif';
  g.textAlign = 'left';
  g.fillText(step.name, 80, iy + ih + 60);

  g.strokeStyle = '#C9A227'; g.lineWidth = 4;
  g.beginPath();
  g.moveTo(80, iy + ih + 166); g.lineTo(W - 80, iy + ih + 166);
  g.stroke();

  g.fillStyle = '#4A5464';
  g.font = '44px "Microsoft YaHei",sans-serif';
  wrapText(g, step.desc, 80, iy + ih + 210, W - 160, 66);
}

function ensureCardTexture(step) {
  const rec = cardIndex.get(step.card);
  if (!rec) return;                 // 场景里没有这张 3D 卡（已改为墙面配图），直接跳过

  if (!cardCache.has(step.card)) {
    const W = 1024, H = 1376;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    cardCache.set(step.card, tex);

    // 立即出画面（占位版），不必等图片
    drawCardFace(g, W, H, step, null);
    tex.needsUpdate = true;

    const img = new Image();
    img.onload = () => { drawCardFace(g, W, H, step, img); tex.needsUpdate = true; };
    img.onerror = () => { console.warn('[交互] 卡图缺失', step.img); };
    img.src = './cards/' + step.img;
  }

  if (rec) {
    rec.face.material.map = cardCache.get(step.card);
    rec.face.material.needsUpdate = true;
  }
}

function wrapText(g, text, x, y, maxW, lh) {
  let line = '';
  for (const ch of text) {
    const test = line + ch;
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y);
      line = ch; y += lh;
    } else {
      line = test;
    }
  }
  if (line) g.fillText(line, x, y);
}

/* 点击看大图已移除：详情由中央悬浮文字承载 */
