/* =====================================================================
   模块 6：配置数据（所有朝代信息统一存放）
   ---------------------------------------------------------------------
   ★ 新增朝代只需要在 dynastyList 数组里追加一条对象即可，
     不需要修改 main.js 中的任何核心逻辑。
   ===================================================================== */

/* ---------------------------------------------------------------------
   常量配置（展厅几何、漫游手感等，改这里即可调参）
   --------------------------------------------------------------------- */
const CONFIG = {
  // ---------- 展厅通道尺寸（单位：米，沿 Z 轴向前延伸） ----------
  HALL: {
    width: 6,        // 通道总宽度 6m（中间 3m 行走区 + 左右各 1.5m 展柜区）
    height: 4,       // 通道高度 4m
    depth: 400,      // 通道总长度（由 computeHallDepth() 按各朝段长自动校正）
    startZ: 8,       // 玩家起始位置 z
    walkWidth: 3,    // 中间可行走区域宽度 3m
    tailExtra: 34    // 尽头余量：最后一个朝代之后仍可继续前行的长度（米）
  },

  // 每个朝代的【基准】区间长度（实际段长按展出图片数自适应，见 LAYOUT）
  NODE_SPACING: 20,

  // ---------- 墙体贴图平面（左右两面大墙，直接镌刻朝代图文） ----------
  WALL: {
    leftX: -3,           // 左墙所在 x（通道宽 6m，左右墙各在 ±3）
    rightX: 3,           // 右墙所在 x
    height: 4,           // 墙体高度 = 通道高度
    segmentLength: 20,   // 默认段长（会被自适应段长覆盖，仅作兜底）
    centerY: 2,          // 墙体中心高度（4m 高的一半）
    offsetFromCalc: 0.02 // 略微内缩，避免与通道内壁 z-fighting
  },

  /* -------------------------------------------------------------------
     左墙版面（新）：
       上侧  = 器型图，两行（rowNum × colNum）
       下侧  = 纹样图，一行
       两者之间与四周留出缝隙，整体贴墙。
     ------------------------------------------------------------------- */
  LAYOUT: {
    // ---- 左墙竖直分区（按墙高 4m 的比例 / 米） ----
    // 上侧器型区占墙高比例；其余为下侧纹样区
    vesselZoneRatio: 0.66,
    // 分区之间的竖直缝隙（米）
    vGapZones: 0.22,
    // 墙顶 / 墙底留边（米）
    padTop: 0.14,
    padBottom: 0.14,

    // ---- 器型网格（上侧两行） ----
    vesselRows: 2,
    vesselCols: 6,          // 2 × 6 = 12 张
    vesselGapX: 0.26,       // 器型图横向间隙（米）
    vesselGapY: 0.16,       // 器型图纵向间隙（米）

    // ---- 纹样一行（下侧） ----
    patternGapX: 0.24,      // 纹样图横向间隙（米）
    patternPadY: 0.10,      // 纹样图上下留边（米）

    // ---- 段长自适应 ----
    // 每个「器型格子」的目标宽度（米）——决定段长基准。
    // 段长 ≈ 器型列数 × cellW + 间隙 + 两端留白，纹样多时再向上取够。
    cellW: 2.35,
    // 段长【下限 / 上限】（米），避免过短或过长
    segMin: 18,
    segMax: 72,
    // 段长两端各留的空白（米）
    segPad: 1.4
  },

  // 预留底衬色（下侧纹样区下方的墙底色，仅作可见底衬）
  reserveTone: 0xe7e2d6,

  // ---------- 漫游控制（仅鼠标：滚轮前进/后退 + 拖拽转头，无键盘） ----------
  CONTROL: {
    mouseSens: 0.0012,     // 鼠标灵敏度（拖拽转头）
    pitchLimit: Math.PI / 3,   // 俯仰限制 ±60°，防镜头翻转
    eyeHeight: 1.6,        // 相机（人眼）高度 1.6m

    // —— 平滑速度控制（滚轮不再直接改位置，而是改"目标速度"，逐帧插值） ——
    maxSpeed: 4.2,         // 最大移动速度（米/秒），前进后退共用
    wheelAccel: 0.9,       // 每滚动一格（deltaY=100）目标速度的变化量（米/秒）
    speedLerp: 6.5,        // 速度趋近目标的插值速率（越大加速/减速越快）
    stopThreshold: 0.02,   // 速度低于该值视为停止（米/秒），避免漂移

    wheelNotch: 100,       // 标准滚轮一格的 deltaY 值（一般无需修改）
    wheelStepMax: 3        // 单次滚动的最大格数上限（防止飞速滚动瞬间全速）
  },

  // ---------- 宫灯吊顶序列（走到哪、灯亮到哪） ----------
  LANTERN: {
    enabled: true,
    step: 10,              // 每隔多少米一组宫灯
    startZ: -2,            // 第一组宫灯的 z 位置
    topY: 3.4,             // 灯笼悬挂高度（吊灯中心 y）
    sideX: 1.7,            // 左右副灯笼离中线的距离
    mainScale: 1.0,        // 主灯笼缩放
    sideScale: 0.8,        // 副灯笼缩放
    glowDist: 14,          // 距玩家该距离内灯笼逐渐点亮（米）
    baseIntensity: 0.85,   // 点亮时的点光源基础强度
    boostIntensity: 1.8,   // 经过朝代节点时的瞬时增亮强度
    boostDuration: 1.2,    // 增亮持续时间（秒）
    lightPool: 5,          // 点光源池大小（固定数量，跟随最近几组宫灯）
    lightRange: 11         // 点光源照射范围（米）
  },

  // ---------- 入口拱门「青花宫阙 · 千年青史」（唐段之前的序章门） ----------
  // 尺寸说明：用户参考值为总宽10m/总高6.5m，但现有通道内宽6m、净高4m，
  // 为不改动既有通道几何，默认按通道实际尺寸等比适配（可在下方微调）。
  ENTRANCE: {
    enabled: true,
    z: 5.4,                // 拱门所在 z（唐段起点 z=0 之前的序厅内）
    thickness: 1.2,        // 整体厚度（参考 1.4，适配通道略收窄）
    totalWidth: 5.86,      // 总宽（适配 6m 通道，两侧贴墙留缝）
    totalHeight: 3.86,     // 总高（适配 4m 通道净高）
    openW: 3.0,            // 通行拱洞宽（= 中央行走区）
    openH: 3.05,           // 拱洞直壁高（其上接弧形拱顶）
    queueW: 1.0,           // 单侧阙台宽（参考 2.5，按通道等比缩）
    queueH: 2.1,           // 阙台高（低于主拱门）
    reliefH: 0.5,          // 横向青花浮雕带高度（微凸起，不过高）
    triggerOffset: 0.9,    // 玩家穿过拱门背面多少米触发入场
    chime: true            // 穿门时的编钟音效（WebAudio 合成，无外部音频）
  },

  // ---------- 触发判定 ----------
  TRIGGER: {
    tolerance: 3.2,        // 与节点 z 坐标的触发容忍距离
    cooldown: 1.6          // 每次切换后的冷却时间（秒），防抖
  },

  // ---------- 灯光（国风展厅，分层灯光；均匀照向左右墙面） ----------
  LIGHT: {
    ambient: 0.25,         // 环境光强度（基础底色，不要太高）
    directional: 0.4,      // 定向光强度（平行均匀打在左右两面墙体上）
    directionalPos: { x: 0, y: 3.5, z: -10 },  // 定向光位置（略微前移，偏向照亮墙面贴图）
    wallFill: 0.45,        // 左右墙面的补光强度（让墙面图文清晰可见）
    wallFillColor: 0xfffbf0 // 墙面补光暖白色
  },

  // ---------- 雾效（营造长廊纵深感，强烈推荐） ----------
  FOG: {
    color: 0xcccccc,       // 雾色（浅灰）
    near: 8,               // 雾开始距离
    far: 45                // 雾完全遮挡距离
  },

  /* -------------------------------------------------------------------
     宫廷空间氛围（逐朝代：地面 / 顶部梁架藻井 / 墙面装饰框 / 灯光）
     -------------------------------------------------------------------
     说明：这一组参数控制「把长廊做成宫廷式历史空间」的强度。
          - 所有几何体都是程序化生成（Canvas 纹理 + 基础几何体），无外部模型
          - lowPerf = true 时自动降级（减少梁架 / 壁灯数量、关闭章纹铺地）
     ------------------------------------------------------------------- */
  ATMOSPHERE: {
    enabled: true,          // 总开关（false = 退回朴素长廊）
    lowPerf: false,         // 低配模式（自动降级）
    useCanvasTextures: true,// 地面 / 顶部 / 底纹是否用程序化 Canvas 纹理

    // ---- 地面分段 ----
    floor: {
      lineWidth: 0.06,      // 朝代分界细线宽度（米）
      lineColor: 0xd8c08a,  // 分界细线颜色（浅金）
      guideWidth: 0.10,     // 中线引导线宽度（米）
      guideOpacity: 0.42,   // 中线引导线透明度
      carpetRatio: 0.46,    // 中央地毯带占通道宽的比例（元/明/清/民国/现代用）
      tileRepeat: 6         // 地砖纹理沿段长的重复次数（越大砖越小）
    },

    // ---- 顶部梁架 / 藻井 ----
    ceiling: {
      beamSpacing: 5.0,     // 横梁间距（米）
      beamDepth: 0.28,      // 梁的厚度（沿 z，米）
      beamHeight: 0.26,     // 梁向下凸出的高度（米）
      cofferSpacing: 10.0,  // 藻井间距（米，约每 2 根梁）
      cofferSize: 1.9,      // 藻井边长（米）
      cofferDrop: 0.14      // 藻井向下凸出高度（米）
    },

    // ---- 墙面装饰 ----
    wall: {
      skirtHeight: 0.62,    // 墙裙高度（米）
      frameWidth: 0.075,    // 每张图的外框线宽（米）
      frameDepth: 0.045,    // 外框凸出墙面的厚度（米）
      plaqueH: 0.20,        // 标题小牌高度（米）
      bgPatternOpacity: 0.13 // 墙面底纹透明度（0.08–0.18，别抢主体）
    },

    // ---- 灯光 ----
    light: {
      wallLampPerSeg: 3,    // 每段左右墙各放的壁灯数量（推荐 2–4）
      lampIntensity: 0.55,  // 壁灯强度
      lampDistance: 7.5,    // 壁灯照射距离
      cofferLightIntensity: 1.05, // 藻井灯强度
      cofferLightDistance: 11,    // 藻井灯照射距离
      washIntensity: 0.42,  // 墙面洗光灯强度
      washAngle: Math.PI / 4,     // 洗光灯锥角
      washPenumbra: 0.35,         // 洗光灯边缘柔和度
      washDistance: 12            // 洗光灯照射距离
    },

    // ---- 时间节点拱门 ----
    gate: {
      innerWidth: 3.2,      // 拱门内宽（米，略大于中间行走区 3m）
      innerHeight: 2.5,     // 拱门内高（米，低矮感：低于通道 4m）
      depth: 0.42,          // 拱门厚度（沿 z，米）
      innerHeight2: 2.86,   // 门楣上沿高度（拱门立框总高）
      glowOpacity: 0.30,    // 门内侧光晕透明度
      plaqueFontSize: 96    // 门楣朝代名牌字号（px，画在 Canvas 上）
    },

    // ---- 地面年代浮雕刻度 ----
    eraMark: {
      enabled: true,
      offsetX: 1.05,        // 年份刻度偏离中线的横向距离（米）
      size: 1.5             // 刻度文字区块边长（米）
    }
  },

  // ---------- 粒子特效（轻量，防掉帧） ----------
  PARTICLE: {
    ambientCount: 120,     // 常驻粒子数量（80~150，上限不超 200）
    burstCount: 60,        // 朝代切换时的爆发粒子数量
    burstDuration: 1.6,    // 爆发粒子停留时长（秒，节点"升起感" 1.2–2s）
    sizeMin: 0.02,         // 粒子最小尺寸
    sizeMax: 0.06,         // 粒子最大尺寸
    colorA: 0xd8e4e8,      // 主色：浅青瓷色
    colorB: 0xf6f6f2,      // 点缀色：极淡米白
    fallSpeed: 0.22,       // 向下飘落速度（极慢）
    driftX: 0.10,          // 左右漂移幅度
    // 粒子活动范围（跟随玩家的一段通道区域）
    rangeWidth: 6,         // 横向范围
    rangeDepth: 26,        // 纵向范围
    rangeHeight: 4         // 纵向高度
  }
};

/* ---------------------------------------------------------------------
   素材路径统一管理
   ---------------------------------------------------------------
   说明：本页面已并入「青瓷白」站点，文物图片统一复用站点共享素材
        （web/assets/img），因此所有图片路径以 ../../../assets/ 为前缀。
   后续替换图片 / 新增素材，只需要改这里或各朝代对象内的字段。
   --------------------------------------------------------------------- */
const ASSETS = {
  // 站点共享素材根目录（相对于本页 immersive/ 目录）
  base: '../../../assets/',

  // 兜底占位图（当某朝代墙体贴图加载失败时使用，避免出现空墙 / 裂图）
  fallbackWare: 'assets/_placeholder_ware.svg',       // 左墙（器物）兜底
  fallbackPattern: 'assets/_placeholder_pattern.svg'  // 右墙（纹样）兜底
};

/* =====================================================================
   ★★★ 朝代数据列表 ★★★
   ---------------------------------------------------------------------
   字段说明（新增朝代时按此模板复制即可）：

     id               : 唯一编号（数字，保持递增）
     name             : 朝代名称，显示在底部标题
     timeText         : 年代 / 窑口信息（小字，显示在标题下方）
     intro            : 底部面板的简短介绍
     positionTrigger  : 触发点位坐标 {x, y, z} = 该朝代区间的【起点】
                        —— 玩家沿通道向前走，z 越来越负；
                           走到该 z 坐标即进入该朝代区间。
                           区间划分：唐 0~-20、宋 -20~-40、元 -40~-60、
                                     明 -60~-80、清 -80~-100 …
     leftWallTexture  : 左墙贴图路径（器物大图，直接镌刻在 3D 墙面上）
     rightWallTexture : 右墙贴图路径（纹样大图，直接镌刻在 3D 墙面上）
     colorEnv         : 场景环境色调（十六进制），用于营造朝代氛围
     detailInfo       : 点击墙面图文弹窗里的详细介绍文字
   ===================================================================== */
const dynastyList = [
  {
    id: 1,
    name: "唐代",
    era: "tang",
    timeText: "唐代｜巩县窑原始青花",
    eraSpan: "618 — 907",
    intro: "唐代巩县窑烧制的原始青花，大多用于外销，存世稀少。胎质粗松，使用钴蓝彩，纹样带有波斯西域风格。",
    positionTrigger: { x: 0, y: 0, z: 0 },
    leftWallTexture: ASSETS.base + "img/patterns/唐代/宝相花.jpg",
    rightWallTexture: ASSETS.base + "img/patterns/唐代/菱形纹.jpg",
    colorEnv: 0x8b7355,
    detailInfo: "唐青花属于釉上钴蓝彩，并不是成熟釉下青花。常见菱形纹、卷草纹，多几何纹饰，几乎没有人物图案。"
  },

  {
    id: 2,
    name: "宋代",
    era: "song",
    timeText: "宋代｜宋青花",
    eraSpan: "960 — 1279",
    intro: "宋代审美偏爱单色釉，青花仅少量试烧，窑址出土残片极少，没有大规模发展。",
    positionTrigger: { x: 0, y: 0, z: -20 },
    leftWallTexture: ASSETS.base + "img/patterns/宋代/牡丹纹.jpg",
    rightWallTexture: ASSETS.base + "img/patterns/宋代/菊花纹.jpg",
    colorEnv: 0x78868b,
    detailInfo: "采用国产钴料，釉下试烧技术不成熟。代表性纹样为简易菊花纹，构图简约素雅，风格内敛清淡。"
  },

  {
    id: 3,
    name: "元代",
    era: "yuan",
    timeText: "元代｜元青花",
    eraSpan: "1271 — 1368",
    intro: "元青花走向成熟，使用进口苏麻离青料，发色浓艳，器型硕大，是青花瓷发展的重要高峰。",
    positionTrigger: { x: 0, y: 0, z: -40 },
    leftWallTexture: ASSETS.base + "img/shapes/瓶类/元/元青花云龙纹梅瓶.jpg",
    rightWallTexture: ASSETS.base + "img/patterns/元代/云龙纹.jpg",
    colorEnv: 0x4a4e52,
    detailInfo: "苏麻离青料有铁锈斑特征。常见云龙纹、牡丹纹，画面饱满繁复，构图大气，层次丰富。"
  },

  {
    id: 4,
    name: "明代",
    era: "ming",
    timeText: "明代｜永乐宣德青花",
    eraSpan: "1368 — 1644",
    intro: "明代青花瓷进入鼎盛期，采用进口苏麻离青与国产平等青，发色淡雅清丽，纹饰题材丰富，有「青花瓷黄金时代」之称。",
    positionTrigger: { x: 0, y: 0, z: -60 },
    leftWallTexture: ASSETS.base + "img/shapes/瓶类/明/明永乐青花折枝花果纹梅瓶.jpg",
    rightWallTexture: ASSETS.base + "img/patterns/明·永宣(永乐、宣德)/折枝花果纹.jpg",
    colorEnv: 0xd8cfc0,
    detailInfo: "永乐压手杯是明代青花名品，杯身重心在下，握于手中恰好贴合虎口。外壁缠枝莲纹秀丽工整，青花发色浓艳可爱，柔和暖白光让釉面更显温润。"
  },

  {
    id: 5,
    name: "清代",
    era: "qing",
    timeText: "清代｜康雍乾青花",
    eraSpan: "1644 — 1911",
    intro: "清代青花工艺登峰造极，使用国产珠明料，发色翠蓝明艳，分水技法精湛，画面层次可达「墨分五色」之境。",
    positionTrigger: { x: 0, y: 0, z: -80 },
    leftWallTexture: ASSETS.base + "img/shapes/瓶类/清/清康熙青花刀马人物棒槌瓶.jpg",
    rightWallTexture: ASSETS.base + "img/patterns/清·康熙(青花工艺顶峰)/山水纹.jpg",
    colorEnv: 0xa8c4c0,
    detailInfo: "康雍乾三朝青花以「分水」技法闻名，通过控制钴料浓淡表现明暗层次。常见缠枝莲、山水人物、博古纹，构图疏朗，釉色温润浅青。"
  },

  {
    id: 6,
    name: "民国",
    era: "minguo",
    timeText: "民国｜浅绛文人青花",
    eraSpan: "1912 — 1949",
    intro: "御窑制度随清室终结，画瓷的文人走上前台。王步等名家以青花作水墨，山水花鸟写意洒脱，浅绛淡彩之风流行，青花从宫廷走入市井书房。",
    positionTrigger: { x: 0, y: 0, z: -100 },
    leftWallTexture: ASSETS.base + "img/shapes/瓶类/民国/民国文人青花山水壁瓶.jpg",
    rightWallTexture: ASSETS.base + "img/patterns/民国/文人写意山水纹.jpg",
    colorEnv: 0x8a8f92,
    detailInfo: "民国青花以「文人瓷画」为特征，王步的青花分水直追水墨渲染，浓淡可至五色。常见山水、花鸟、人物瓷板，题诗落款，书画一体，格调疏朗清雅。"
  },

  {
    id: 7,
    name: "现代",
    era: "modern",
    timeText: "现代｜非遗传承与文创",
    eraSpan: "1949 — 今",
    intro: "青花走出博物馆与窑厂，进入课堂、设计工作室与日常生活。传统纹样被重新解构，与新材质、新造物方式相遇，非遗在当代继续生长。",
    positionTrigger: { x: 0, y: 0, z: -120 },
    leftWallTexture: ASSETS.base + "img/shapes/瓶类/现/现代仿古青花天球瓶.jpg",
    rightWallTexture: ASSETS.base + "img/patterns/现代/文创主题纹样.jpg",
    colorEnv: 0xc2d4d0,
    detailInfo: "现代青花分两支：一为仿古复刻，严谨追摹历代经典器型与纹样；二为文创创新，将缠枝、山水等元素融入茶器、艺术瓷板与日常设计，让青花活在当下。"
  }

  /* ---------------------------------------------------------------
     ↓↓↓ 后续新增朝代请从这里往下追加 ↓↓↓
     复制上面任意一条对象，修改 id / positionTrigger.z / 文字 /
     图片路径 / 颜色 即可，不需要改动核心漫游逻辑。

     坐标规律：唐 0 → 宋 -20 → 元 -40 → 明 -60 → 清 -80 → 民国 -100 → 现代 -120 …
     图片路径：ASSETS.base + "img/..."（指向站点共享素材 web/assets/img）
     --------------------------------------------------------------- */
];

/* ---------------------------------------------------------------------
   工具：按「展出图片数」自动计算每个朝代的段长，并重排触发点位
   ---------------------------------------------------------------------
   规则：
     1) 每个朝代的左墙需要容纳  max(器型张数, 纹样张数的列数)  个格子；
     2) 段长 = 内容宽 + 两端留白，并夹在 [segMin, segMax] 之间；
     3) 触发点从 0 开始依次往后排（z 越来越负）；
     4) 通道总长按最后一个朝代段长 + 尽头余量自动校正 —— 让民国/现代
        不在长廊尽头，尽头之后仍留有一段空白墙可以继续前行。

   说明：这里读的是 window.DATA_VESSELS / DATA_PATTERNS（由
        build-patterns.js 生成），所以「长度随图片数相适应」是自动的。
   --------------------------------------------------------------------- */
function computeSegments(list) {
  const L = CONFIG.LAYOUT;
  const V = window.DATA_VESSELS || {};
  const P = window.DATA_PATTERNS || {};

  list.forEach(function (item) {
    const vessels = (V[item.era] || []).length;
    const patterns = (P[item.era] || []).length;

    // 器型两行 → 每行 vesselCols 列（固定网格，缺图留空）
    // 纹样一行 → 每行 = 纹样张数（唐宋代物件少所以更短）
    const vesselCols = L.vesselCols;                       // 6
    const patternCols = Math.max(1, patterns);             // 2~8

    // 需要的列数（取二者较大者，保证两区都排得下）
    const cols = Math.max(vesselCols, patternCols);

    // 段长 = 列数 × 单元宽 + 两端留白
    let seg = cols * L.cellW + L.segPad * 2;
    seg = Math.max(L.segMin, Math.min(L.segMax, seg));

    item._segLen = Math.round(seg * 100) / 100;
    item._vesselRows = L.vesselRows;
    item._vesselCols = vesselCols;
    item._patternCols = patternCols;
    item._vesselCount = vessels;
    item._patternCount = patterns;
  });

  // 依次排布触发点：第 1 个朝代从 z=0 开始，往后累加
  let z = 0;
  list.forEach(function (item) {
    item.positionTrigger = item.positionTrigger || { x: 0, y: 0, z: 0 };
    item.positionTrigger.x = 0;
    item.positionTrigger.y = 0;
    item.positionTrigger.z = z;
    z -= item._segLen;   // 下一朝段的起点（更深处）
  });

  return list;
}

/* ---------------------------------------------------------------------
   工具：按实际段长校正通道总长
   --------------------------------------------------------------------- */
function computeHallDepth(list) {
  let total = 0;
  list.forEach(function (it) { total += it._segLen || CONFIG.WALL.segmentLength; });
  // 尽头再留一段余量（约 1.2 段），保证民国/现代之后还能继续前行
  const tail = CONFIG.HALL.tailExtra || 32;
  return Math.ceil(total + tail);
}

computeSegments(dynastyList);
CONFIG.HALL.depth = computeHallDepth(dynastyList);

// 暴露到全局，供 main.js 使用
window.CONFIG = CONFIG;
window.ASSETS = ASSETS;
window.dynastyList = dynastyList;
