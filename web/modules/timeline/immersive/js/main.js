/* =====================================================================
   青花瓷 · 千年纹样时空漫游 —— 主程序
   ---------------------------------------------------------------------
   模块划分（与需求一一对应）：
     模块1：Three.js 初始化（场景、相机、渲染器、灯光）
     模块2：漫游控制（鼠标滚轮前进 + 拖拽转头，位置锁死中线）
     模块3：朝代节点检测逻辑
     模块4：场景切换函数 switchDynasty(data)
     模块5：射线拾取 + 点击弹窗交互
     模块6：配置数据 → 见 config.js（dynastyList）
   ===================================================================== */

(function () {
  'use strict';

  /* ===================================================================
     前置检查
     =================================================================== */
  if (typeof THREE === 'undefined') {
    document.getElementById('loading-screen').innerHTML =
      '<div class="loading-text">Three.js 加载失败，请检查 libs/three.min.js</div>';
    return;
  }
  const DYNASTIES = window.dynastyList;
  const CFG = window.CONFIG;
  const ASSETS = window.ASSETS;

  /* ===================================================================
     模块1：Three.js 初始化 —— 场景 / 相机 / 渲染器 / 灯光
     =================================================================== */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcccccc);

  // 雾效：营造长廊纵深感（强烈推荐，隧道氛围的关键）
  scene.fog = new THREE.Fog(
    CFG.FOG.color, CFG.FOG.near, CFG.FOG.far
  );

  const camera = new THREE.PerspectiveCamera(
    68, window.innerWidth / window.innerHeight, 0.1, 400
  );
  camera.position.set(0, CFG.CONTROL.eyeHeight, CFG.HALL.startZ);

  const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('scene-canvas'),
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 限制像素比，防高分屏卡顿
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;             // 柔和阴影
  renderer.outputEncoding = THREE.sRGBEncoding;

  /* -------------------------------------------------------------------
     灯光组（分层灯光：环境光 + 定向光 + 每展柜聚光灯）
     ------------------------------------------------------------------- */

  // ① 环境光：基础底色，保证场景不全黑（强度不要高，否则没氛围）
  const ambientLight = new THREE.AmbientLight(0xffffff, CFG.LIGHT.ambient);
  scene.add(ambientLight);

  // ② 定向光：平行均匀打在左右两面墙体上，突出墙面贴图
  const dirLight = new THREE.DirectionalLight(0xffffff, CFG.LIGHT.directional);
  dirLight.position.set(
    CFG.LIGHT.directionalPos.x,
    CFG.LIGHT.directionalPos.y,
    CFG.LIGHT.directionalPos.z
  );
  scene.add(dirLight);

  // ③ 左右墙面补光：各一盏点光源，均匀照亮左右墙体（替代原展柜聚光灯）
  const wallFillLights = [];
  [-1, 1].forEach(function (sx) {
    const pl = new THREE.PointLight(CFG.LIGHT.wallFillColor, CFG.LIGHT.wallFill, 60, 1.2);
    // 光源贴近对应墙面，向墙内照射
    pl.position.set(sx * (CFG.HALL.width / 2 - 1.2), CFG.HALL.height * 0.62, 0);
    scene.add(pl);
    wallFillLights.push(pl);
  });

  /* ===================================================================
     模块1-b：展厅几何体（狭长通道 + 展柜）
     ===================================================================
     性能要点：
       - 全部使用基础几何体（BoxGeometry / PlaneGeometry），无外部模型加载
       - 材质使用 MeshLambertMaterial / MeshStandardMaterial（低开销）
       - 纹理使用 CanvasTexture 动态生成，无需外部图片，加载零延迟
     =================================================================== */
  const HALL = CFG.HALL;
  const WALL = CFG.WALL;

  // 通道的 z 范围：从 startZ(8) 一直延伸到 startZ - depth
  const HALL_Z_FRONT = HALL.startZ;
  const HALL_Z_BACK = HALL.startZ - HALL.depth;
  const HALL_Z_CENTER = HALL.startZ - HALL.depth / 2;

  // ---- 通道主体（用一个内翻的 Box 作为"房间"，最省事且不漏光） ----
  const roomGeo = new THREE.BoxGeometry(HALL.width, HALL.height, HALL.depth);
  const roomMat = new THREE.MeshLambertMaterial({
    color: 0x8a8a86,
    side: THREE.BackSide
  });
  const room = new THREE.Mesh(roomGeo, roomMat);
  room.position.set(0, HALL.height / 2, HALL_Z_CENTER);
  room.receiveShadow = true;
  scene.add(room);

  // ---- 地面（浅灰哑光，配合浅色雾效营造干净的长廊感） ----
  const floorGeo = new THREE.PlaneGeometry(HALL.width, HALL.depth);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x9a9a96, roughness: 0.92, metalness: 0.05
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, HALL_Z_CENTER);
  floor.receiveShadow = true;
  floor.name = 'floor';
  scene.add(floor);

  // ---- 地面中线装饰灯带（国风简约，纯色发光条） ----
  const stripGeo = new THREE.PlaneGeometry(0.12, HALL.depth - 10);
  const stripMat = new THREE.MeshBasicMaterial({
    color: 0x7d9b92, transparent: true, opacity: 0.5
  });
  const strip = new THREE.Mesh(stripGeo, stripMat);
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(0, 0.012, HALL_Z_CENTER);
  scene.add(strip);

  /* -------------------------------------------------------------------
     展柜：为每个朝代节点生成一组"器物展柜 + 墙面纹样挂画"
     这些对象会被记录到 dynastyObjects，切换朝代时更新贴图与色调。
     ------------------------------------------------------------------- */
  const dynastyObjects = [];   // 每个节点对应的可交互对象集合

  /**
   * 生成一张"渐变 + 网格"风格的程序化纹样贴图（作为默认兜底/环境装饰）
   */
  function makeProceduralTexture(baseColor, accentColor, label) {
    // 容错：颜色缺失时使用默认色，避免程序化贴图崩溃
    if (baseColor == null) baseColor = 0x5f7a72;
    if (accentColor == null) accentColor = baseColor;
    const size = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');

    // 底色渐变
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, '#' + baseColor.toString(16).padStart(6, '0'));
    g.addColorStop(1, '#' + accentColor.toString(16).padStart(6, '0'));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    // 简约花卉线条装饰
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, 30 + i * 16, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 中心文字标
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '600 44px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, size / 2, size / 2);

    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /**
   * 标题小牌（Canvas）：如「器物 · 唐代」。随朝代换色换字。
   */
  function makePlaqueCanvas(label, dynastyName, accentHex) {
    const W = 256, H = 84;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    // 牌底（深色木牌）
    ctx.fillStyle = 'rgba(46,32,20,0.92)';
    ctx.fillRect(0, 0, W, H);
    // 金边
    const gold = '#' + ((accentHex != null ? accentHex : 0xd8b46a) >>> 0).toString(16).padStart(6, '0').slice(-6);
    ctx.strokeStyle = gold;
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, W - 12, H - 12);
    ctx.lineWidth = 2;
    ctx.strokeRect(14, 14, W - 28, H - 28);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = gold;
    ctx.font = '600 36px "Songti SC", "SimSun", serif';
    ctx.fillText(label, W / 2, H / 2 - 10);
    ctx.font = '400 20px "Songti SC", "SimSun", serif';
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fillText(dynastyName, W / 2, H / 2 + 20);

    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /**
   * 墙面底纹（Canvas）：朝代纹样，低透明度平铺，衬在图片之外不抢主体。
   */
  function makeWallBgCanvas(data) {
    const S = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');

    ctx.fillStyle = '#' + (data.colorEnv >>> 0).toString(16).padStart(6, '0').slice(-6);
    ctx.fillRect(0, 0, S, S);

    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    // 通用缠枝/云纹底：正弦藤蔓 + 花头（不区分朝代，靠透明度弱化）
    for (let row = 0; row < 3; row++) {
      const yy = 44 + row * 84;
      ctx.beginPath();
      for (let x = 0; x <= S; x += 6) {
        const y = yy + Math.sin(x / 30 + row * 1.6) * 14;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      for (let fx = 30; fx < S; fx += 84) {
        ctx.beginPath();
        ctx.arc(fx, yy + Math.sin(fx / 30 + row * 1.6) * 14, 10, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // 回纹边
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let rx = 8; rx < S; rx += 28) {
      ctx.moveTo(rx, 8); ctx.lineTo(rx + 16, 8);
      ctx.lineTo(rx + 16, 20); ctx.lineTo(rx + 6, 20);
    }
    ctx.stroke();

    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    return tex;
  }

  /**
   * 从 colorEnv 自动推导一个"辅助色"（提亮版本）。
   * 目的：配置数据里只需写一个 colorEnv，程序自动生成配套的
   *      灯带色 / 灯光色 / 配色，减少你要填的字段。
   * 若某朝代想单独指定辅助色，也可自行加 colorAccent 字段（优先级更高）。
   */
  function getAccentColor(data) {
    if (typeof data.colorAccent === 'number') return data.colorAccent;
    const c = new THREE.Color(data.colorEnv);
    // 提亮并轻微偏向青色，使环境色调更通透
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    c.setHSL(hsl.h, Math.min(1, hsl.s * 0.85), Math.min(0.9, hsl.l + 0.28));
    return c.getHex();
  }

  /**
   * 为单个朝代创建场景对象（左墙新版面）：
   *   - 左墙上侧：器型图【两行】网格（vesselRows × vesselCols，缺图留空槽）
   *   - 左墙下侧：纹样图【一行】（张数随朝代不同）
   *   - 右墙：整面「器物/主题大图」
   *
   * 设计说明（按需求）：
   *   - 图片直接"镌刻"在 3D 墙面上，整体贴墙
   *   - 上侧两行优先使用，位置已按网格预留，方便逐个放图
   *   - 段长由 config.js 的 computeSegments() 依据图片数自适应
   *
   * @param {Object} data  朝代数据对象
   * @param {number} index 序号
   */
  function buildDynastyObjects(data, index) {
    const group = new THREE.Group();
    const nodeZ = data.positionTrigger.z;

    // 本段朝代在通道上的 z 范围：[zStart, zEnd]（段长自适应）
    const segLen = data._segLen || CFG.WALL.segmentLength;
    const zEnd = nodeZ;              // 靠玩家起始方向（数值较大）
    const zStart = nodeZ - segLen;   // 更深处的边界（数值较小）
    const centerZ = (zEnd + zStart) / 2;

    const wallH = CFG.WALL.height;
    const centerY = CFG.WALL.centerY;
    const wallX = HALL.width / 2 - CFG.WALL.offsetFromCalc;

    const L = CFG.LAYOUT;

    const walls = [];           // 右墙（可拾取 / 贴图替换）
    const vesselMeshes = [];    // 左墙上侧器型网格（两行）
    const patternMeshes = [];   // 左墙下侧纹样网格（一行）
    const wallsLeft = [];       // 左墙底衬（留空槽用）
    const frameMaterials = [];  // 宫廷外框材质（随朝代改色）
    const innerFrameMaterials = []; // 内框（青瓷蓝线 / 金线）材质
    const plaqueTiles = [];     // 标题小牌（随朝代改色 / 改文字）
    const wallBgMeshes = [];    // 墙面底纹（低透明，随朝代换纹样）

    // 宫廷氛围参数（在函数开头取出，供后续各段使用）
    const ATM = (CFG.ATMOSPHERE && CFG.ATMOSPHERE.enabled) ? CFG.ATMOSPHERE : null;
    const FW = ATM ? ATM.wall.frameWidth : 0;
    const FD = ATM ? ATM.wall.frameDepth : 0;
    const PLAQUE_H = ATM ? ATM.wall.plaqueH : 0;

    /* ---------------------------------------------------------------
       左墙竖直分区：
         顶部留边 pT
         [ 器型区 = 两行 ]           高度 vesselZoneH
         区缝 vGapZones
         [ 纹样区 = 一行 ]           高度 patternZoneH
         底部留边 pB
       --------------------------------------------------------------- */
    const pT = L.padTop, pB = L.padBottom;
    const innerH = wallH - pT - pB;                       // 去掉上下留边后的总高
    const vesselZoneH = innerH * L.vesselZoneRatio;        // 上侧器型区高度
    const patternZoneH = innerH - vesselZoneH - L.vGapZones; // 下侧纹样区高度
    if (patternZoneH < 0.3) patternZoneH = 0.3;            // 兜底

    // 各区的 y 范围（y 向上）
    const vesselTopY = wallH - pT;                         // 器型区上沿
    const vesselBotY = vesselTopY - vesselZoneH;           // 器型区下沿
    const patternTopY = vesselBotY - L.vGapZones;          // 纹样区上沿
    const patternBotY = patternTopY - patternZoneH;        // 纹样区下沿

    // ---- 底衬：整面左墙铺一层浅色底（让留空槽也可见底纹） ----
    const backGeo = new THREE.PlaneGeometry(segLen, wallH);
    const backMat = new THREE.MeshStandardMaterial({
      color: CFG.reserveTone, roughness: 0.96, metalness: 0.0, side: THREE.DoubleSide
    });
    const back = new THREE.Mesh(backGeo, backMat);
    back.position.set(-wallX - 0.01, centerY, centerZ);   // 略微后退，垫在贴图格子后面，避免 z-fighting
    back.rotation.y = Math.PI / 2;                        // 左墙法线朝 +X
    back.userData = {
      pickable: false, dynastyId: data.id, kind: 'back', side: -1, material: backMat
    };
    group.add(back);
    wallsLeft.push(back);

    // ---- 墙面底纹：图片之外的墙面铺一层低透明朝代纹样（不抢主体） ----
    if (ATM) {
      const bgTex = makeWallBgCanvas(data);
      const bgMat = new THREE.MeshBasicMaterial({
        map: bgTex, transparent: true,
        opacity: ATM.wall.bgPatternOpacity, depthWrite: false
      });
      const bgPlane = new THREE.Mesh(new THREE.PlaneGeometry(segLen, wallH), bgMat);
      bgPlane.position.set(-wallX - 0.005, centerY, centerZ);
      bgPlane.rotation.y = Math.PI / 2;
      group.add(bgPlane);
      wallBgMeshes.push(bgPlane);
    }

    /* ---------------------------------------------------------------
       通用：在给定区内按 rows × cols 网格铺设贴图平面
       返回创建的 mesh 数组（每个 slot 一张，缺图也给空槽，便于后续放图）
       同时为每个格子加「宫廷装饰框 + 标题小牌」（墙面框架，不再裸贴图片）
       --------------------------------------------------------------- */
    function buildGrid(zoneTopY, zoneBotY, rows, cols, gapX, gapY, kind) {
      const zoneH = zoneTopY - zoneBotY;
      const zoneW = segLen;                                // 沿 z 的可用宽度
      const cellW = (zoneW - gapX * (cols - 1)) / cols;
      const cellH = (zoneH - gapY * (rows - 1)) / rows;
      const made = [];

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // 行从上到下，列沿 -z 排列（玩家沿通道前行，z 越来越负）
          const cy = zoneTopY - cellH / 2 - r * (cellH + gapY);
          const zPos = zEnd - cellW / 2 - c * (cellW + gapX);

          // ---- 外框（木/铜/玉框：四条边条围合，不遮挡画面本体） ----
          if (ATM) {
            const frameMat = new THREE.MeshStandardMaterial({
              color: 0x6b4626, roughness: 0.7, metalness: 0.12
            });
            frameMaterials.push(frameMat);
            const frameX = -wallX + FD / 2 - 0.004;
            const ow = cellW + FW * 2, oh = cellH + FW * 2;
            // 上 / 下 / 左 / 右 四条边条
            [
              [0, cellH / 2 + FW / 2, ow, FW],   // 上横条（局部坐标：y偏移, z偏移, 宽z, 厚y）
              [0, -cellH / 2 - FW / 2, ow, FW],  // 下横条
              [-cellW / 2 - FW / 2, 0, FW, cellH],  // 左竖条
              [cellW / 2 + FW / 2, 0, FW, cellH]    // 右竖条
            ].forEach(function (bar) {
              const f = new THREE.Mesh(
                new THREE.BoxGeometry(FD, bar[3], bar[2]), frameMat
              );
              f.position.set(frameX, cy + bar[1], zPos + bar[0]);
              group.add(f);
            });

            // ---- 内框（青瓷蓝线 / 金线：贴画面边缘的四条细条） ----
            const innerMat = new THREE.MeshBasicMaterial({
              color: 0xd8b46a, transparent: true, opacity: 0.9
            });
            innerFrameMaterials.push(innerMat);
            const innerX = -wallX + 0.012;
            const iw = cellW + 0.024, ih = cellH + 0.024, t = 0.018;
            [
              [0, cellH / 2 + 0.004, iw, t],
              [0, -cellH / 2 - 0.004, iw, t],
              [-cellW / 2 - 0.004, 0, t, ih],
              [cellW / 2 + 0.004, 0, t, ih]
            ].forEach(function (bar) {
              const f = new THREE.Mesh(
                new THREE.BoxGeometry(0.012, bar[3], bar[2]), innerMat
              );
              f.position.set(innerX, cy + bar[1], zPos + bar[0]);
              group.add(f);
            });
          }

          const initTex = makeProceduralTexture(
            data.colorEnv, getAccentColor(data), (data.name[0] || '纹')
          );
          const mat = new THREE.MeshStandardMaterial({
            map: initTex, color: 0xffffff, roughness: 0.86, metalness: 0.0,
            side: THREE.DoubleSide
          });
          const m = new THREE.Mesh(new THREE.PlaneGeometry(cellW, cellH), mat);
          m.position.set(-wallX, cy, zPos);
          m.rotation.y = Math.PI / 2;   // 左墙法线朝 +X

          m.userData = {
            pickable: true,
            dynastyId: data.id,
            kind: kind,                 // 'vessel' | 'pattern'
            side: -1,
            row: r,
            col: c,
            slot: r * cols + c,
            material: mat,
            itemName: '',
            itemSrc: ''
          };
          group.add(m);
          made.push(m);

          // ---- 标题小牌（挂在画面下沿中央：「器物」「纹样」+ 朝代） ----
          if (ATM && PLAQUE_H > 0) {
            const pv = makePlaqueTile(kind, data, zPos, cy - cellH / 2 - FW - PLAQUE_H / 2);
            group.add(pv);
            plaqueTiles.push(pv);
          }
        }
      }
      return { meshes: made, cellW: cellW, cellH: cellH, rows: rows, cols: cols };
    }

    /* ---------------------------------------------------------------
       标题小牌：挂在每张画面下沿（Canvas 贴图，随朝代换色换字）
       --------------------------------------------------------------- */
    function makePlaqueTile(kind, data, zPos, yPos) {
      const label = kind === 'vessel' ? '器物' : '纹样';
      const tex = makePlaqueCanvas(label, data.name || '', data.colorAccent);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
      const w = 0.62, h = PLAQUE_H;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(-wallX + 0.02, yPos, zPos);
      m.rotation.y = Math.PI / 2;
      m.userData = { kind: 'plaque', label: label, material: mat };
      return m;
    }

    // ---- 上侧：器型两行（固定 rows × cols 网格，全部格子都建出来） ----
    const vGrid = buildGrid(
      vesselTopY, vesselBotY,
      L.vesselRows, L.vesselCols,
      L.vesselGapX, L.vesselGapY,
      'vessel'
    );
    vGrid.meshes.forEach(function (m) { vesselMeshes.push(m); });

    // ---- 下侧：纹样一行（列数 = 该朝代纹样张数） ----
    const patList = (window.DATA_PATTERNS && window.DATA_PATTERNS[data.era]) || [];
    const patCols = Math.max(1, patList.length);
    const pGrid = buildGrid(
      patternTopY, patternBotY,
      1, patCols,
      L.patternGapX, 0,
      'pattern'
    );
    pGrid.meshes.forEach(function (m) { patternMeshes.push(m); });

    /* ---------------------------------------------------------------
       右墙：整面主题大图（沿用原设计）
       --------------------------------------------------------------- */
    const rInitTex = makeProceduralTexture(getAccentColor(data), data.colorEnv, '纹');
    const rMat = new THREE.MeshStandardMaterial({
      map: rInitTex, color: 0xffffff, roughness: 0.85, metalness: 0.0,
      side: THREE.DoubleSide
    });
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(segLen, wallH), rMat);
    rightWall.position.set(wallX, centerY, centerZ);
    rightWall.rotation.y = -Math.PI / 2;   // 右墙法线朝 -X
    rightWall.userData = {
      pickable: true, dynastyId: data.id, kind: 'ware', side: 1, material: rMat
    };
    group.add(rightWall);
    walls.push(rightWall);

    group.userData = Object.assign(group.userData || {}, {
      dynastyId: data.id,
      nodeZ: nodeZ,
      zStart: zStart,
      zEnd: zEnd,
      segLen: segLen,
      walls: walls,                 // 右墙
      vesselMeshes: vesselMeshes,   // 左墙上侧器型
      patternMeshes: patternMeshes, // 左墙下侧纹样
      leftWalls: wallsLeft,
      back: back,
      frameMaterials: frameMaterials,           // 宫廷外框
      innerFrameMaterials: innerFrameMaterials, // 内框线
      plaqueTiles: plaqueTiles,                 // 标题小牌
      wallBgMeshes: wallBgMeshes                // 墙面底纹
    });

    scene.add(group);
    return group;
  }

  // 为每个朝代生成场景对象（墙面贴图区块）
  DYNASTIES.forEach(function (d, i) {
    const grp = buildDynastyObjects(d, i);
    dynastyObjects.push(grp);
  });

  // 初始化时就把「左墙器型 + 左墙纹样」全部铺满（所有朝代一次性预载），
  // 这样玩家走到任意一段、往左看都能立刻看到图片，无需等触发切换。
  DYNASTIES.forEach(function (d, i) {
    fillLeftWallTextures(d, i);
  });

  /* -------------------------------------------------------------------
     宫廷空间氛围：逐朝代的地面 / 顶部梁架藻井 / 墙面框 / 灯光 / 拱门
     （由 era-atmosphere.js 提供，不改变中线前进与左右墙的核心逻辑）
     ------------------------------------------------------------------- */
  if (window.EraAtmosphere) {
    window.EraAtmosphere.build(scene, {
      CONFIG: CFG,
      HALL: HALL,
      dynastyList: DYNASTIES,
      getPlayerZ: function () { return playerPos.z; }   // 供远段裁剪
    });
  }

  /* -------------------------------------------------------------------
     入口拱门「青花宫阙 · 千年青史」（唐段之前的序章门，
     由 entrance-gate.js 提供；穿门触发长廊灯光依次渐亮 + 编钟音效）
     ------------------------------------------------------------------- */
  if (window.EntranceGate) {
    window.EntranceGate.build(scene, {
      CONFIG: CFG,
      getPlayerZ: function () { return playerPos.z; }
    });
  }

  /* ===================================================================
     模块2：漫游控制（鼠标滚轮前进/后退 + 鼠标拖拽转头）
     ------------------------------------------------------------------
     交互定义（简化版，无键盘）：
       - 鼠标滚轮 → 平滑速度控制：向前滚 = 前进，向后滚 = 后退，
         滚轮只改变"目标速度"，每帧向目标速度插值，松手自然减速，
         不再有步进式的卡顿感
       - 鼠标按下拖拽 → 左右转头 / 抬头低头，观察左右两面墙
       - 人物锁死在通道中线（x 恒为 0），不能横向移动
       - 不使用任何键盘操作
     =================================================================== */

  // 玩家位置（x 固定为 0 = 通道中线；y = 1.6 人眼高度）
  const playerPos = new THREE.Vector3(0, CFG.CONTROL.eyeHeight, HALL.startZ);

  let isDrag = false;                 // 是否正在拖拽
  let prevMouseX = 0, prevMouseY = 0; // 上一帧鼠标坐标
  let yaw = 0;                        // 水平旋转（左右转头）
  let pitch = 0;                      // 俯仰（抬头低头）
  const pitchLimit = CFG.CONTROL.pitchLimit;   // 俯仰限制，防止镜头翻转

  // —— 平滑速度控制状态（滚轮只改目标速度，位置逐帧插值） ——
  const moveState = {
    targetSpeed: 0,                          // 目标速度（米/秒，负 = 前进 -z）
    currentSpeed: 0,                         // 当前速度（逐帧趋近目标）
    maxSpeed: CFG.CONTROL.maxSpeed,          // 最大速度
    accel: CFG.CONTROL.wheelAccel,           // 每格滚轮的速度增量
    lerpRate: CFG.CONTROL.speedLerp,         // 速度插值速率
    stopThreshold: CFG.CONTROL.stopThreshold // 低于该速度视为停止
  };
  const WHEEL_NOTCH = CFG.CONTROL.wheelNotch;      // 标准一格的 deltaY
  const WHEEL_STEP_MAX = CFG.CONTROL.wheelStepMax; // 单次滚动格数上限

  // 通道可行走范围（不能穿出两头）
  const Z_MIN = HALL.startZ - HALL.depth + 1;
  const Z_MAX = HALL.startZ;

  const canvas = renderer.domElement;

  /* -------------------------------------------------------------------
     ① 鼠标滚轮：改目标速度（向前滚 = 前进，向后滚 = 后退）
     ------------------------------------------------------------------- */
  window.addEventListener('wheel', function (e) {
    e.preventDefault();
    // 按滚动格数换算速度增量（兼容高分辨率滚轮 / 触控板）
    const notches = Math.min(Math.abs(e.deltaY), WHEEL_NOTCH * WHEEL_STEP_MAX) / WHEEL_NOTCH;

    if (e.deltaY < 0) {
      // 向前滚 → 沿 -z 前进
      moveState.targetSpeed -= moveState.accel * notches;
    } else {
      // 向后滚 → 沿 +z 后退
      moveState.targetSpeed += moveState.accel * notches;
    }
    // 限幅
    moveState.targetSpeed = Math.max(-moveState.maxSpeed, Math.min(moveState.maxSpeed, moveState.targetSpeed));
  }, { passive: false });

  /* -------------------------------------------------------------------
     ② 鼠标按下：开启拖拽
     ------------------------------------------------------------------- */
  canvas.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;   // 仅左键
    isDrag = true;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;
    canvas.classList.add('dragging');
  });

  // 鼠标松开：结束拖拽
  window.addEventListener('mouseup', function () {
    isDrag = false;
    canvas.classList.remove('dragging');
  });

  // 鼠标离开窗口：取消拖拽状态
  window.addEventListener('blur', function () {
    isDrag = false;
  });

  /* -------------------------------------------------------------------
     ③ 拖拽转动视角（左右转头 / 抬头低头）
     ------------------------------------------------------------------- */
  window.addEventListener('mousemove', function (e) {
    if (!isDrag) return;

    const dx = e.clientX - prevMouseX;
    const dy = e.clientY - prevMouseY;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;

    const sensitivity = CFG.CONTROL.mouseSens;   // 沿用 0.0012

    // 拖拽方向与视角方向：
    //   向右拖 → 视角向左转（yaw 减小）；向下拖 → 视线向下（pitch 增大）
    //   这样符合"抓住画面拖动"的直觉手感
    yaw -= dx * sensitivity;
    pitch += dy * sensitivity;

    // 俯仰限制，防止镜头翻转
    pitch = Math.max(-pitchLimit, Math.min(pitchLimit, pitch));
  });

  /* -------------------------------------------------------------------
     ④ 每帧更新：速度插值 + 移动 + 相机（位置锁死 x=0，朝向由 yaw/pitch 决定）
     ------------------------------------------------------------------- */
  function updatePlayer(dt) {
    // —— 摩擦衰减：不滚动时目标速度自然归零（滑行减速停下） ——
    moveState.targetSpeed *= Math.exp(-1.4 * dt);

    // —— 速度平滑趋近目标（帧率无关的指数插值） ——
    const k = 1 - Math.exp(-moveState.lerpRate * dt);
    moveState.currentSpeed += (moveState.targetSpeed - moveState.currentSpeed) * k;

    // 速度足够小就归零，避免无限漂移
    if (Math.abs(moveState.currentSpeed) < moveState.stopThreshold &&
        Math.abs(moveState.targetSpeed) < moveState.stopThreshold) {
      moveState.currentSpeed = 0;
      moveState.targetSpeed = 0;
    }

    // 应用移动（前进 = -z，后退 = +z）
    playerPos.z += moveState.currentSpeed * dt;

    // 前后边界：撞到边界时把朝该边界的速度清零（另一方向仍可动）
    if (playerPos.z < Z_MIN) {
      playerPos.z = Z_MIN;
      if (moveState.currentSpeed < 0) { moveState.currentSpeed = 0; moveState.targetSpeed = 0; }
    } else if (playerPos.z > Z_MAX) {
      playerPos.z = Z_MAX;
      if (moveState.currentSpeed > 0) { moveState.currentSpeed = 0; moveState.targetSpeed = 0; }
    }

    // 中线锁死
    playerPos.x = 0;

    // 相机位置：x 永久为 0，锁死通道中线
    camera.position.set(playerPos.x, playerPos.y, playerPos.z);

    // 朝向：使用 YXZ 顺序，先偏航后俯仰
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
  }



  /* ===================================================================
     模块3：朝代节点检测逻辑
     ------------------------------------------------------------------
     区间划分：唐 0~-20、宋 -20~-40、元 -40~-60、明 -60~-80、清 -80~-100 …
     玩家沿 z 轴向前（z 越来越负）行走，当越过某个朝代的区间起点
     positionTrigger.z（附带容忍范围）时，自动切换到该朝代。
     =================================================================== */
  let currentDynastyIndex = -1;   // 当前所在朝代下标（-1 表示尚未进入）
  let switchCooldown = 0;         // 冷却计时器（秒）

  function detectDynastyNode(dt) {
    if (switchCooldown > 0) {
      switchCooldown -= dt;
      return;
    }

    const z = playerPos.z;
    const tol = CFG.TRIGGER.tolerance;

    // 找出玩家当前"应该处于"的朝代：取最后一个已越过的区间起点
    let targetIndex = -1;
    for (let i = 0; i < DYNASTIES.length; i++) {
      const nodeZ = DYNASTIES[i].positionTrigger.z;
      // 玩家已进入该朝代区间（z <= 起点 + 容忍距离）
      if (z <= nodeZ + tol) {
        targetIndex = i;
      }
    }

    if (targetIndex !== -1 && targetIndex !== currentDynastyIndex) {
      switchDynasty(DYNASTIES[targetIndex], targetIndex);
      switchCooldown = CFG.TRIGGER.cooldown;
    }
  }

  /* ===================================================================
     模块4：场景切换函数 switchDynasty(data, index)
     ------------------------------------------------------------------
     职责：传入朝代对象，自动完成
       ① 3D 环境色调 / 雾色渐变
       ② 展柜展品贴图替换
       ③ 左右墙面贴图替换（左=器物墙，右=纹样墙）
       ④ 底部标题 / 简介淡入淡出
       ⑤ 换场遮罩淡入淡出
     =================================================================== */
  const ui = {
    dynastyName: document.getElementById('dynasty-name'),
    dynastyTime: document.getElementById('dynasty-time'),
    dynastyIntro: document.getElementById('dynasty-intro'),
    progressText: document.getElementById('progress-text'),
    dynastyPanel: document.getElementById('dynasty-panel'),
    transitionMask: document.getElementById('transition-mask'),
    centerToast: document.getElementById('center-toast')
  };

  let isSwitching = false;   // 防止切换过程中重复触发

  /**
   * 主切换函数
   * @param {Object} data  朝代数据对象（来自 dynastyList）
   * @param {number} index 该朝代在数组中的下标
   */
  function switchDynasty(data, index) {
    if (isSwitching) return;
    isSwitching = true;
    currentDynastyIndex = index;

    // ---------- ① 换场遮罩淡入 ----------
    ui.transitionMask.classList.add('active');

    // 遮罩全黑后执行内容替换（半程切换，视觉最自然）
    setTimeout(function () {
      applyDynastyContent(data, index);

      // 遮罩淡出
      ui.transitionMask.classList.remove('active');
      setTimeout(function () { isSwitching = false; }, 520);
    }, 520);
  }

  /**
   * 实际应用朝代内容（在遮罩遮住画面时执行）
   */
  function applyDynastyContent(data, index) {
    // ---------- ② 3D：左右墙面贴图整体替换（左=器物，右=纹样） ----------
    updateDynastyObjectsTextures(data, index);

    // ---------- ③ UI：底部标题 / 简介（淡入淡出） ----------
    ui.dynastyPanel.classList.add('fading');
    setTimeout(function () {
      ui.dynastyName.textContent = data.name;
      ui.dynastyTime.textContent = data.timeText || '';
      ui.dynastyIntro.textContent = data.intro || '';
      ui.progressText.textContent = (index + 1) + ' / ' + DYNASTIES.length;
      ui.dynastyPanel.classList.remove('fading');
    }, 320);

    // ---------- ④ 中央提示（朝代名大字） ----------
    showCenterToast(data.name, data.timeText);

    // ---------- ⑤ 3D：环境色调 / 雾色渐变 ----------
    tweenEnvColor(data.colorEnv);

    // ---------- ⑥ 灯光：左右墙面补光（均匀照亮墙面贴图） ----------
    setActiveCabinetSpots(data.id);

    // ---------- ⑦ 粒子：切换瞬间爆发一小簇瓷粉微光 ----------
    spawnParticleBurst(data.colorEnv);

    // ---------- ⑧ 朝代氛围色（背景色渐变目标） ----------
    applyDynastyAmbience(data);

    // ---------- ⑨ 宫廷空间氛围（地面 / 顶部 / 墙面框 / 灯光 / 拱门） ----------
    if (window.EraAtmosphere) window.EraAtmosphere.apply(data, index, false);

    // ---------- ⑩ 宫灯节点增亮（眼前一亮，仪式感） ----------
    if (window.EraAtmosphere && window.EraAtmosphere.boostLanterns) {
      window.EraAtmosphere.boostLanterns(data.positionTrigger.z);
    }

    // ---------- ⑩ 墙面装饰随朝代改色（外框 / 内线 / 小牌 / 底纹） ----------
    applyDynastyWallDecor(data, index);
  }

  /**
   * 墙面装饰随朝代改色：外框（木/铜/玉）、内框（青瓷蓝线/金线）、
   * 标题小牌（改文字与色）、墙面底纹（换纹样与色）。
   */
  function applyDynastyWallDecor(data, index) {
    const grp = dynastyObjects[index];
    if (!grp) return;
    const st = (window.EraAtmosphere && window.EraAtmosphere.ERA_STYLE)
      ? (window.EraAtmosphere.ERA_STYLE[data.era] || null) : null;
    if (!st) return;

    // 外框 → 木框色（唐/元深棕木，明朱红，清青金…）
    (grp.userData.frameMaterials || []).forEach(function (mat) {
      mat.color.setHex(st.wall.frameOuter);
    });
    // 内框 → 金线 / 青瓷蓝线
    (grp.userData.innerFrameMaterials || []).forEach(function (mat) {
      mat.color.setHex(st.wall.frameInner);
    });
    // 标题小牌 → 重绘（换朝代名与金线色）
    (grp.userData.plaqueTiles || []).forEach(function (m) {
      if (m.material && m.material.map) m.material.map.dispose();
      const label = m.userData.label || '器物';
      m.material.map = makePlaqueCanvas(label, data.name || '', st.wall.frameInner);
      m.material.needsUpdate = true;
    });
    // 墙面底纹 → 换底纹色（新 Canvas 纹样）
    (grp.userData.wallBgMeshes || []).forEach(function (m) {
      if (m.material && m.material.map) m.material.map.dispose();
      m.material.map = makeWallBgCanvas(data);
      m.material.color.setHex(st.wall.bg);
      m.material.needsUpdate = true;
    });
  }

  /* -------------------------------------------------------------------
     朝代氛围色：每个朝代给一个"环境主色"，用于背景 / 雾 / 灯光色调。
     需求补充色：唐偏暖棕、宋清冷灰青、元明暗对比强、明柔和暖白、清温润浅青。
     若某朝代未单独配置，则自动从 colorEnv 推导。
     ------------------------------------------------------------------- */
  const DYNASTY_AMBIENCE = {
    1: { bg: 0xd8c6a8, fog: 0xd8c6a8, light: 0xfff0dc },  // 唐：暖棕
    2: { bg: 0xc3cdd2, fog: 0xc3cdd2, light: 0xe6f0f4 },  // 宋：清冷灰青
    3: { bg: 0xb8bcbf, fog: 0xb0b4b8, light: 0xdfe4ea },  // 元：明暗对比强
    4: { bg: 0xe4dbcb, fog: 0xe0d7c6, light: 0xfff6e8 },  // 明：柔和暖白
    5: { bg: 0xd2e0dc, fog: 0xcfe0db, light: 0xeaf6f2 },  // 清：温润浅青
    6: { bg: 0xd4d3ce, fog: 0xd0cfca, light: 0xf2f0ea },  // 民国：文人灰调
    7: { bg: 0xdcebe7, fog: 0xd8e8e3, light: 0xf0fbf8 }   // 现代：明净青白
  };

  function getAmbience(data) {
    return DYNASTY_AMBIENCE[data.id] || {
      bg: data.colorEnv,
      fog: data.colorEnv,
      light: 0xfffbf0
    };
  }

  /** 把朝代氛围色写入补间目标 */
  function applyDynastyAmbience(data) {
    const amb = getAmbience(data);
    ambTarget.bg = new THREE.Color(amb.bg);
    ambTarget.fog = new THREE.Color(amb.fog);
    ambTarget.light = new THREE.Color(amb.light);
  }

  /**
   * 左右墙面补光的亮度调节（替代原展柜聚光灯逻辑）
   * 改造后灯光均匀照向两面墙，不再做"走到哪亮到哪"的开关，
   * 此处仅根据朝代氛围微调补光强度，保持墙面图文清晰。
   */
  function setActiveCabinetSpots(activeDynastyId) {
    wallFillLights.forEach(function (l) {
      // 补光亮度随朝代微调（这里统一使用配置值，保留函数以便后续扩展）
      l.userData.targetIntensity = CFG.LIGHT.wallFill;
    });
  }

  /**
   * 推算图片的兜底候选链：
   *   真实素材(.png) → 演示素材(.svg) → 通用占位图
   * 这样即使你还没替换素材，页面也能正常显示。
   */
  function buildFallbackChain(url, genericFallback) {
    const chain = [];
    if (url) {
      // 仅当是同名「演示图」体系时才探测 .svg（旧素材机制）。
      // 左墙纹样用的是本目录原图（jpg/png 真实存在），无需 .svg 兜底，
      // 否则会对每个 .png 先发一次注定 404 的 .svg 请求，污染控制台。
      if (/\.png$/i.test(url) && /assets\/patterns\//.test(url) === false) {
        chain.push(url.replace(/\.png$/i, '.svg'));   // 同名 svg 演示图
      }
      chain.push(url);
    }
    chain.push(genericFallback);
    return chain.filter(Boolean);
  }

  /** 中央大字提示 */
  let toastTimer = null;
  function showCenterToast(text, sub) {
    ui.centerToast.textContent = text;
    ui.centerToast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      ui.centerToast.classList.remove('show');
    }, 2000);
  }

  /* -------------------------------------------------------------------
     环境色调 / 雾色 / 灯光的【缓慢渐变】（lerp，不要瞬间跳变）
     需求要求：切换朝代时灯光颜色缓慢渐变，高级感更强。
     ------------------------------------------------------------------- */
  let envTweenDur = 1.6;

  // 当前值（gradient 的起点）与目标值
  const ambCurrent = {
    bg: new THREE.Color(0xcccccc),
    fog: new THREE.Color(0xcccccc),
    light: new THREE.Color(0xfffbf0)
  };
  const ambTarget = {
    bg: new THREE.Color(0xcccccc),
    fog: new THREE.Color(0xcccccc),
    light: new THREE.Color(0xfffbf0)
  };

  function tweenEnvColor(targetHex) {
    // 保留兼容：直接设置背景目标色
    ambTarget.bg = new THREE.Color(targetHex);
  }

  function updateEnvTween(dt) {
    // 用指数插值实现"无限接近"的平滑过渡（帧率无关）
    const k = 1 - Math.pow(0.001, dt / envTweenDur);

    ambCurrent.bg.lerp(ambTarget.bg, k);
    ambCurrent.fog.lerp(ambTarget.fog, k);
    ambCurrent.light.lerp(ambTarget.light, k);

    // 应用到场景
    scene.background.copy(ambCurrent.bg);
    scene.fog.color.copy(ambCurrent.fog);

    // 通道内壁 / 地面跟随环境色轻微调整
    roomMat.color.copy(ambCurrent.bg.clone().multiplyScalar(0.92));
    floorMat.color.copy(ambCurrent.bg.clone().multiplyScalar(0.95));

    // 定向光颜色缓慢跟随（营造整体氛围）
    dirLight.color.copy(ambCurrent.light);

    // 左右墙面补光：强度与颜色随朝代缓慢渐变
    for (let i = 0; i < wallFillLights.length; i++) {
      const l = wallFillLights[i];
      const target = l.userData.targetIntensity || CFG.LIGHT.wallFill;
      l.intensity += (target - l.intensity) * k;
      l.color.lerp(ambCurrent.light, k * 0.5);
    }
  }

  /**
   * 按兜底链加载一张贴图并应用到一组网格上。
   * 兜底顺序：给定 url（.png→同名.svg）→ 程序化兜底贴图。
   * @param {string}   url        首选图片地址
   * @param {Array}    meshes     要应用贴图的网格数组
   * @param {Function} makeFallback 生成程序化兜底贴图的函数
   */
  function applyTextureWithFallback(url, meshes, makeFallback) {
    const chain = buildFallbackChain(url, null);
    let idx = 0;

    function applyTo(t) {
      t.encoding = THREE.sRGBEncoding;
      meshes.forEach(function (m) {
        m.material.map = t;
        m.material.needsUpdate = true;
      });
    }

    function tryNext() {
      if (idx >= chain.length) {
        // 图片全部失败 → 使用程序化贴图兜底
        applyTo(makeFallback());
        return;
      }
      const loader = new THREE.TextureLoader();
      loader.load(
        chain[idx],
        function (t) { applyTo(t); },
        undefined,
        function () { idx++; tryNext(); }
      );
    }

    tryNext();
  }

  /**
   * 铺设指定朝代的【左墙】贴图（上侧器型两行 + 下侧纹样一行）。
   *   上侧 ← DATA_VESSELS[data.era]（按 slot 顺序填两行网格）
   *   下侧 ← DATA_PATTERNS[data.era]（一行）
   * 缺图的格子保持底纹（留空槽），方便后续补充素材。
   * 初始化时对所有朝代调用一次即可，无需等玩家触发。
   */
  function fillLeftWallTextures(data, index) {
    const grp = dynastyObjects[index];
    if (!grp) return;

    const V = (window.DATA_VESSELS && window.DATA_VESSELS[data.era]) || [];
    const P = (window.DATA_PATTERNS && window.DATA_PATTERNS[data.era]) || [];

    // 图片不足时的兜底贴图（程序化底纹）
    const fallbackTex = function () {
      return makeProceduralTexture(data.colorEnv, getAccentColor(data), data.name[0] || '纹');
    };

    // ---------- 左墙上侧：器型图（按 slot 顺序填入两行网格） ----------
    (grp.userData.vesselMeshes || []).forEach(function (mesh, i) {
      const item = V[i] || null;
      if (!item) return;                    // 缺图 → 留空槽（保留底纹）
      mesh.userData.itemName = item.name;
      mesh.userData.itemSrc = item.src;
      applyTextureWithFallback(item.src, [mesh], fallbackTex);
    });

    // ---------- 左墙下侧：纹样图（一行） ----------
    (grp.userData.patternMeshes || []).forEach(function (mesh, i) {
      const item = P[i] || null;
      if (!item) return;
      mesh.userData.itemName = item.name;
      mesh.userData.itemSrc = item.src;
      applyTextureWithFallback(item.src, [mesh], fallbackTex);
    });
  }

  /**
   * 更新指定朝代的墙面贴图（模块4 的核心改动点）
   *   左墙上侧 ← 该朝代「器型图」逐格铺设（来自 DATA_VESSELS[data.era]，两行网格）
   *   左墙下侧 ← 该朝代「纹样图」逐格铺设（来自 DATA_PATTERNS[data.era]，一行）
   *   右墙     ← rightWallTexture（器物 / 主题大图）
   * 某个格子没有对应图片时，保持程序化底纹，留作后续放图的位置。
   */
  function updateDynastyObjectsTextures(data, index) {
    const grp = dynastyObjects[index];
    if (!grp) return;

    // 左墙（器型 + 纹样）——统一走 fillLeftWallTextures，幂等可重复调用
    fillLeftWallTextures(data, index);

    // ---------- 右墙：器物 / 主题大图 ----------
    (grp.userData.walls || []).forEach(function (wall) {
      const fallback = function () {
        return makeProceduralTexture(getAccentColor(data), data.colorEnv, '纹');
      };
      applyTextureWithFallback(data.rightWallTexture, [wall], fallback);
    });
  }

  /* ===================================================================
     模块5：射线拾取 + 点击弹窗交互
     =================================================================== */
  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();

  const modal = {
    root: document.getElementById('detail-modal'),
    img: document.getElementById('modal-img'),
    tag: document.getElementById('modal-tag'),
    title: document.getElementById('modal-title'),
    sub: document.getElementById('modal-sub'),
    desc: document.getElementById('modal-desc'),
    meta: document.getElementById('modal-meta')
  };

  // 收集所有可拾取对象（右墙 + 左墙上侧器型 + 左墙下侧纹样）——仅供 raycast 使用
  function getPickables() {
    const arr = [];
    dynastyObjects.forEach(function (g) {
      arr.push.apply(arr, g.userData.walls || []);           // 右墙（器物/主题）
      arr.push.apply(arr, g.userData.vesselMeshes || []);    // 左墙上侧 器型
      arr.push.apply(arr, g.userData.patternMeshes || []);   // 左墙下侧 纹样
    });
    return arr;
  }

  // 拖拽与点击的区分：记录按下位置，位移很小才算点击
  let downX = 0, downY = 0, downTime = 0;

  canvas.addEventListener('mousedown', function (e) {
    downX = e.clientX; downY = e.clientY; downTime = performance.now();
  });

  canvas.addEventListener('mouseup', function (e) {
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    const elapsed = performance.now() - downTime;
    // 位移小于 6px 且时间短 → 判定为点击
    if (moved < 6 && elapsed < 600) {
      handlePick(e.clientX, e.clientY);
    }
  });

  /**
   * 射线拾取处理
   */
  function handlePick(clientX, clientY) {
    pointerNDC.x = (clientX / window.innerWidth) * 2 - 1;
    pointerNDC.y = -(clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(getPickables(), false);

    if (hits.length === 0) return;

    const obj = hits[0].object;
    if (!obj.userData || !obj.userData.pickable) return;

    const dynasty = DYNASTIES.find(function (d) {
      return d.id === obj.userData.dynastyId;
    }) || DYNASTIES[currentDynastyIndex];

    if (!dynasty) return;

    // 点击左墙器型 → 器型详情；点击左墙纹样 → 纹样详情；点击右墙 → 器物/主题详情
    if (obj.userData.kind === 'vessel') {
      // 左墙上侧器型（未放图的空槽不可点）
      if (!obj.userData.itemSrc) return;
      openModal('器型', dynasty, obj.userData.itemSrc, obj.userData.itemName);
    } else if (obj.userData.kind === 'pattern') {
      // 左墙下侧纹样（未放图的空槽不可点）
      if (!obj.userData.itemSrc) return;
      openModal('纹样', dynasty, obj.userData.itemSrc, obj.userData.itemName);
    } else {
      openModal('器物', dynasty, dynasty.rightWallTexture);
    }
  }

  /**
   * 打开详情弹窗
   * @param {string} tag        '器物' | '器型' | '纹样'
   * @param {Object} data       当前朝代对象（来自 dynastyList）
   * @param {string} imgUrl     该条目对应的图片（墙面贴图）
   * @param {string} [name]     可选的条目标题（左墙器型/纹样用具体名称）
   */
  function openModal(tag, data, imgUrl, name) {
    modal.tag.textContent = tag;
    modal.title.textContent = name || data.name || '';
    // timeText 本身已含朝代名（如「元代｜元青花」），左墙条目只需附上具体名称
    modal.sub.textContent = ((tag === '纹样' || tag === '器型') && name)
      ? (data.timeText + '　·　' + name)
      : (data.timeText || '');
    modal.desc.textContent = data.detailInfo || '暂无详细介绍。';

    // 弹窗大图同样使用兜底链：真实图 → 演示图 → 占位图
    const generic = tag === '纹样' ? ASSETS.fallbackPattern : ASSETS.fallbackWare;
    const chain = buildFallbackChain(imgUrl, generic);
    let mi = 0;
    modal.img.onerror = function () {
      mi++;
      if (mi < chain.length) modal.img.src = chain[mi];
      else modal.img.onerror = null;
    };
    modal.img.src = chain[0];

    // 位置标签：按 tag 区分左墙上侧 / 左墙下侧 / 右墙
    const posLabel = tag === '器物' ? '右墙 · 器物'
      : (tag === '器型' ? '左墙上侧 · 器型' : '左墙下侧 · 纹样');

    // 附加信息列表：直接展示朝代 / 类型 / 位置，方便后续扩展
    modal.meta.innerHTML = '';
    const metaPairs = [
      ['朝代', data.name || ''],
      ['年代', data.timeText || ''],
      ['类别', name ? (tag + '｜' + name) : tag],
      ['位置', posLabel]
    ];
    metaPairs.forEach(function (pair) {
      const li = document.createElement('li');
      li.innerHTML = '<span>' + pair[0] + '</span>' + pair[1];
      modal.meta.appendChild(li);
    });

    modal.root.classList.remove('hidden');
  }

  function closeModal() {
    modal.root.classList.add('hidden');
  }

  // 关闭按钮 / 遮罩点击关闭
  modal.root.addEventListener('click', function (e) {
    if (e.target.dataset && e.target.dataset.close) closeModal();
  });
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Escape') closeModal();
  });

  /** 准星悬停高亮（轻微增强交互反馈） */
  const crosshairEl = document.getElementById('crosshair');
  let hoverCheckTimer = 0, lastHover = false;
  function updateHoverHint(dt) {
    hoverCheckTimer += dt;
    if (hoverCheckTimer < 0.12) return;   // 每 0.12s 检测一次即可
    hoverCheckTimer = 0;

    pointerNDC.x = 0; pointerNDC.y = 0;   // 准星在屏幕中心
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(getPickables(), false);
    const hot = hits.length > 0 && hits[0].distance < 14;   // 只高亮较近的
    if (hot !== lastHover) {
      crosshairEl.classList.toggle('hot', hot);
      lastHover = hot;
    }
  }

  /* ===================================================================
     模块 7：粒子特效（瓷粉微光粒子）
     ------------------------------------------------------------------
     方案1（主推）：细小半透浅青白色光点，像瓷器研磨的细瓷粉微光。
       - 常驻粒子：80~150 个，全局氛围感，极慢向下飘落 + 轻微左右漂移
       - 爆发粒子：切换朝代瞬间喷出一小簇，0.8s 后淡出消失
       - 全部用 THREE.Points 实现，不引入任何重型粒子库
     性能：总数控制在 200 以内（常驻 120 + 爆发 60），绝不掉帧。
     =================================================================== */
  const PART = CFG.PARTICLE;

  /**
   * 生成圆形的柔和光点贴图（避免默认方块粒子，观感更细腻）
   * 用 CanvasTexture 动态生成，无需外部图片。
   */
  function makeParticleSprite() {
    const s = 64;
    const cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0.0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.65)');
    g.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
    ctx.fill();
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  const particleSprite = makeParticleSprite();

  // ---------- 粒子系统（常驻 + 爆发共用一个 Points，靠 alpha 区分状态） ----------
  const PARTICLE_TOTAL = PART.ambientCount + PART.burstCount;   // 120 + 60 = 180（< 200）

  const pPositions = new Float32Array(PARTICLE_TOTAL * 3);   // 位置
  const pColors = new Float32Array(PARTICLE_TOTAL * 3);      // 颜色
  const pSizes = new Float32Array(PARTICLE_TOTAL);           // 尺寸
  const pAlpha = new Float32Array(PARTICLE_TOTAL);           // 透明度（手动控制）

  // 每个粒子的运动参数（用普通数组记录，便于每帧计算）
  const pData = [];
  for (let i = 0; i < PARTICLE_TOTAL; i++) {
    const isBurst = i >= PART.ambientCount;
    pData.push({
      isBurst: isBurst,
      // 初速度（缓慢向下 + 轻微横向漂移）
      vy: -PART.fallSpeed * (0.6 + Math.random() * 0.8),
      vx: (Math.random() - 0.5) * PART.driftX,
      vz: (Math.random() - 0.5) * PART.driftX * 0.6,
      // 漂移相位（做正弦左右摆动）
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.15 + Math.random() * 0.25,
      // 爆发粒子的剩余寿命
      life: 0,
      size: PART.sizeMin + Math.random() * (PART.sizeMax - PART.sizeMin)
    });
  }

  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
  particleGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));
  particleGeo.setAttribute('size', new THREE.BufferAttribute(pSizes, 1));

  // 自定义着色器：支持逐粒子尺寸与透明度（比 PointsMaterial 更可控）
  const particleMat = new THREE.ShaderMaterial({
    uniforms: {
      uSprite: { value: particleSprite },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
    },
    vertexShader: [
      // 注意：raw ShaderMaterial 需自行声明 attribute
      'attribute float size;',
      'attribute float alpha;',
      'attribute vec3 color;',
      'varying vec3 vColor;',
      'varying float vAlpha;',
      'uniform float uPixelRatio;',
      'void main() {',
      '  vColor = color;',
      '  vAlpha = alpha;',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  gl_PointSize = size * uPixelRatio * 320.0 / max(0.001, -mv.z);',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D uSprite;',
      'varying vec3 vColor;',
      'varying float vAlpha;',
      'void main() {',
      '  float a = texture2D(uSprite, gl_PointCoord).a * vAlpha;',
      '  if (a < 0.01) discard;',
      '  gl_FragColor = vec4(vColor, a);',
      '}'
    ].join('\n'),
    transparent: true,
    depthWrite: false,          // 半透明粒子不写深度，避免互相遮挡出现黑边
    blending: THREE.AdditiveBlending
  });

  // 补一个 alpha 属性
  particleGeo.setAttribute('alpha', new THREE.BufferAttribute(pAlpha, 1));

  const particlePoints = new THREE.Points(particleGeo, particleMat);
  particlePoints.frustumCulled = false;   // 粒子跟随玩家，禁用視锥剔除避免闪烁
  scene.add(particlePoints);

  // 颜色池：主色浅青瓷 + 少量米白点缀
  const colorA = new THREE.Color(PART.colorA);
  const colorB = new THREE.Color(PART.colorB);

  /** 初始化一个粒子的位置（在玩家周围区域内随机散布） */
  function resetAmbientParticle(i, aroundZ) {
    const d = pData[i];
    pPositions[i * 3 + 0] = (Math.random() - 0.5) * PART.rangeWidth;
    pPositions[i * 3 + 1] = Math.random() * PART.rangeHeight;
    pPositions[i * 3 + 2] = aroundZ - Math.random() * PART.rangeDepth;
    d.life = 1;   // 常驻粒子 life 恒为 1（不消亡）
    d.vy = -PART.fallSpeed * (0.6 + Math.random() * 0.8);

    // 颜色：85% 浅青瓷色，15% 米白点缀
    const c = Math.random() < 0.85 ? colorA : colorB;
    pColors[i * 3 + 0] = c.r;
    pColors[i * 3 + 1] = c.g;
    pColors[i * 3 + 2] = c.b;
    pSizes[i] = d.size;
    pAlpha[i] = 0.35 + Math.random() * 0.35;   // 淡淡的，不抢展品
  }

  // 初始化常驻粒子
  for (let i = 0; i < PART.ambientCount; i++) {
    resetAmbientParticle(i, HALL.startZ);
  }
  // 初始化爆发粒子（先隐藏）
  for (let i = PART.ambientCount; i < PARTICLE_TOTAL; i++) {
    pAlpha[i] = 0;
    pSizes[i] = 0;
    pPositions[i * 3 + 0] = 0;
    pPositions[i * 3 + 1] = -999;   // 藏到地下
    pPositions[i * 3 + 2] = 0;
    pColors[i * 3 + 0] = colorA.r;
    pColors[i * 3 + 1] = colorA.g;
    pColors[i * 3 + 2] = colorA.b;
  }

  /**
   * 触发一次粒子爆发（朝代切换 / 到达时间节点瞬间调用）
   * 需求：到达朝代节点时，从【地面与拱门两侧】轻微升起一簇青瓷色微光，
   *      持续 1.2–2 秒，不用爆炸、不用烟雾，保持国风感。
   */
  function spawnParticleBurst(colorHex) {
    const nodeZ = playerPos.z - 2.2;    // 在玩家前方一点（约在拱门处）升起
    const burstColor = new THREE.Color(colorHex || PART.colorA).lerp(colorB, 0.6);

    // 拱门两侧固定横向位置（左门柱 / 右门柱），部分粒子从地面升起
    const sideX = CFG.HALL.width / 2 - 0.9;

    for (let i = PART.ambientCount; i < PARTICLE_TOTAL; i++) {
      const d = pData[i];
      const pick = Math.random();

      if (pick < 0.45) {
        // 左门柱一侧
        pPositions[i * 3 + 0] = -sideX + (Math.random() - 0.5) * 0.9;
      } else if (pick < 0.9) {
        // 右门柱一侧
        pPositions[i * 3 + 0] = sideX + (Math.random() - 0.5) * 0.9;
      } else {
        // 中线附近（地面引导线上）
        pPositions[i * 3 + 0] = (Math.random() - 0.5) * 0.8;
      }
      // 从地面附近升起（y 起点很低 → 缓慢上浮）
      pPositions[i * 3 + 1] = 0.06 + Math.random() * 0.5;
      pPositions[i * 3 + 2] = nodeZ + (Math.random() - 0.5) * 2.2;

      // 速度：轻微向上浮 + 极小的横向散开（不爆炸）
      d.vx = (Math.random() - 0.5) * 0.10;
      d.vz = (Math.random() - 0.5) * 0.12;
      d.vy = 0.16 + Math.random() * 0.22;   // 缓慢升起
      d.life = 1;                            // 生命从 1 递减到 0

      pColors[i * 3 + 0] = burstColor.r;
      pColors[i * 3 + 1] = burstColor.g;
      pColors[i * 3 + 2] = burstColor.b;
      pSizes[i] = (PART.sizeMin + Math.random() * (PART.sizeMax - PART.sizeMin)) * 1.5;
      pAlpha[i] = 0.5 + Math.random() * 0.4;
    }
  }

  /**
   * 每帧更新粒子（模块7 核心）
   */
  function updateParticles(dt) {
    const zBoundFront = HALL.startZ + 4;
    const zBoundBack = HALL.startZ - HALL.depth;

    for (let i = 0; i < PARTICLE_TOTAL; i++) {
      const d = pData[i];
      const ix = i * 3;

      if (d.isBurst) {
        // ---- 爆发粒子：生命递减，归零后隐藏 ----
        if (d.life <= 0) continue;
        d.life -= dt / PART.burstDuration;
        if (d.life <= 0) {
          pAlpha[i] = 0;
          pSizes[i] = 0;
          pPositions[ix + 1] = -999;
          continue;
        }
        // 位移 + 轻微上浮
        pPositions[ix + 0] += d.vx * dt;
        pPositions[ix + 1] += d.vy * dt;
        pPositions[ix + 2] += d.vz * dt;
        d.vy -= 0.05 * dt;              // 轻微减速（保持缓慢升起，不做爆炸下坠）
        // 生命越接近 0 越透明
        pAlpha[i] = Math.max(0, d.life) * 0.9;

      } else {
        // ---- 常驻粒子：极慢向下飘落 + 左右正弦漂移 ----
        d.phase += d.phaseSpeed * dt;
        pPositions[ix + 0] += (d.vx + Math.sin(d.phase) * 0.06) * dt;
        pPositions[ix + 1] += d.vy * dt;
        pPositions[ix + 2] += d.vz * dt;

        // 落到地面以下 → 从上方重新投放（保持循环）
        if (pPositions[ix + 1] < 0) {
          resetAmbientParticle(i, playerPos.z);
          pPositions[ix + 2] = playerPos.z - Math.random() * PART.rangeDepth;
        }

        // 超出横向范围 → 拉回
        const halfW = PART.rangeWidth / 2;
        if (pPositions[ix + 0] > halfW) pPositions[ix + 0] = -halfW;
        else if (pPositions[ix + 0] < -halfW) pPositions[ix + 0] = halfW;

        // 超出纵向范围（玩家走远）→ 重新投放到玩家附近
        const pz = pPositions[ix + 2];
        if (pz > zBoundFront || pz < zBoundBack || pz > playerPos.z + 4) {
          pPositions[ix + 2] = playerPos.z - Math.random() * PART.rangeDepth;
        }
      }
    }

    // 标记属性需要刷新
    particleGeo.attributes.position.needsUpdate = true;
    particleGeo.attributes.alpha.needsUpdate = true;
    particleGeo.attributes.size.needsUpdate = true;
    particleGeo.attributes.color.needsUpdate = true;
  }

  /* ===================================================================
     窗口自适应
     =================================================================== */
  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    particleMat.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
  });

  /* ===================================================================
     主循环
     =================================================================== */
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);   // 限制单帧步长，防卡顿后瞬移

    updatePlayer(dt);          // 模块2：滚轮平滑移动（前进/后退）+ 拖拽转头
    detectDynastyNode(dt);     // 模块3：朝代节点检测
    updateEnvTween(dt);        // 模块4：环境色 / 灯光渐变
    updateParticles(dt);       // 模块7：粒子特效
    updateHoverHint(dt);       // 模块5：准星反馈

    // 宫廷空间氛围：灯光强度 / 拱门光晕 / 地面亮度 平滑插值
    if (window.EraAtmosphere) window.EraAtmosphere.update(dt);

    // 入口拱门：穿门触发 + 匾额发光脉动
    if (window.EntranceGate) window.EntranceGate.update(dt);

    // —— 入场明暗：穿拱门前长廊基础灯光压暗，穿过后随 reveal 系数渐亮 ——
    // （拱门自带灯光不受影响，负责序厅照明）
    const rf = window.EraAtmosphere ? window.EraAtmosphere.revealFactor() : 1;
    ambientLight.intensity = CFG.LIGHT.ambient * (0.45 + 0.55 * rf);
    dirLight.intensity = CFG.LIGHT.directional * rf;
    for (let i = 0; i < wallFillLights.length; i++) wallFillLights[i].intensity *= rf;

    renderer.render(scene, camera);
  }

  /* ===================================================================
     启动
     =================================================================== */
  function start() {
    // 初始 UI：尚未到达第一个节点时，展示序厅占位内容
    ui.dynastyName.textContent = '序厅';
    ui.dynastyTime.textContent = '青花瓷 · 千年纹样';
    ui.dynastyIntro.textContent = '穿过入口拱门「千年青史」，长廊灯光将渐次点亮；滚动鼠标滚轮漫游（前滚前进、后滚后退），按住拖拽可转头观看左右墙面。';
    ui.progressText.textContent = '0 / ' + DYNASTIES.length;

    // 进入展厅的初始提示
    showCenterToast('青花瓷', '千年纹样 · 时空漫游');

    // 左右墙面补光（均匀照亮墙面贴图）
    setActiveCabinetSpots(DYNASTIES[0] ? DYNASTIES[0].id : -1);

    setTimeout(function () {
      document.getElementById('loading-screen').classList.add('done');
    }, 600);

    animate();
  }

  start();

  // 暴露调试接口（方便后续扩展 / 控制台调试）
  window.__QINGHUA__ = {
    scene, camera, renderer,
    switchDynasty,
    dynastyList: DYNASTIES,
    playerPos,                       // 玩家位置（x 恒为 0）
    get yaw() { return yaw; },
    set yaw(v) { yaw = v; },
    get pitch() { return pitch; },
    set pitch(v) { pitch = v; },
    get currentIndex() { return currentDynastyIndex; }
  };

  // 验证 / 调试用：暴露布局明细
  window.IMMERSIVE_DEBUG = {
    scene: scene,
    dynasties: DYNASTIES,
    dynastyObjects: dynastyObjects,
    hallDepth: HALL.depth,
    hallEndZ: HALL.startZ - HALL.depth,
    hallStartZ: HALL.startZ
  };

})();
