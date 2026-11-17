/* ============================================================
   青花 AI 制作工坊 · Three.js 三维制瓷台
   ------------------------------------------------------------
   结构：
     1. 数据（朝代 / 器型 / 纹样 / 参数定义）
     2. 界面构建（朝代标签、器型卡、参数滑块、纹样、区域、密度、色调）
     3. Three.js 场景（暖光、环境反射、木拉坯台、阴影）
     4. 参数化旋转放样（LatheGeometry，10 项参数实时重建）
     5. 纹样遮罩着色与区域贴纹
     6. 交互（射线拾取、捏塑 / 拉伸 / 压平 / 旋转观察、滚轮缩放）
     7. 成品生成与高清导出
   仅依赖本地 three.min.js。
   ============================================================ */
(function () {
  'use strict';

  /* ==================== 0. 小工具 ==================== */
  var $ = function (id) { return document.getElementById(id); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  function smoothstep(a, b, x) {
    var t = clamp((x - a) / (b - a || 1e-6), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function gauss(x, c, s) {
    var d = (x - c) / s;
    return Math.exp(-0.5 * d * d);
  }
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var IMG = '../../assets/img/patterns/';
  var CM = 1 / 12;          // 1 厘米 = 1/12 世界单位
  var N = 92;               // 轮廓采样段数
  var START = new Date();

  /* ==================== 1. 数据 ==================== */

  /* 器型家族：归一化轮廓关键点（t 自下而上 0→1，r 为相对半径） */
  var FAMILIES = {
    jar:      [[0, .52], [.05, .60], [.12, .84], [.24, .97], [.38, 1], [.55, .98], [.68, .90], [.78, .76], [.86, .66], [.92, .68], [1, .74]],
    bottle:   [[0, .34], [.05, .40], [.16, .72], [.30, .92], [.42, 1], [.55, .96], [.68, .78], [.78, .52], [.85, .35], [.91, .31], [.96, .33], [1, .38]],
    yuhuchun: [[0, .30], [.05, .38], [.14, .78], [.24, .98], [.32, .94], [.44, .70], [.58, .44], [.70, .30], [.80, .26], [.88, .30], [.94, .44], [1, .62]],
    bowl:     [[0, .40], [.05, .46], [.14, .60], [.30, .74], [.55, .88], [.80, .97], [1, 1]],
    cup:      [[0, .52], [.06, .56], [.20, .70], [.45, .86], [.75, .95], [1, 1]],
    vase:     [[0, .36], [.06, .42], [.16, .78], [.30, .96], [.44, 1], [.56, .94], [.66, .72], [.74, .44], [.81, .30], [.88, .28], [.94, .30], [1, .38]],
    gourd:    [[0, .34], [.06, .42], [.14, .68], [.22, .82], [.30, .76], [.38, .50], [.46, .40], [.52, .50], [.60, .72], [.68, .80], [.74, .72], [.80, .50], [.88, .40], [1, .46]],
    dish:     [[0, .62], [.06, .66], [.20, .76], [.45, .87], [.75, .96], [1, 1]],
    teapot:   [[0, .46], [.05, .50], [.14, .80], [.28, .98], [.42, 1], [.56, .92], [.68, .74], [.76, .58], [.83, .54], [.90, .56], [1, .60]],
    moon:     [[0, .42], [.06, .48], [.16, .84], [.30, 1], [.46, 1], [.60, .92], [.70, .70], [.78, .48], [.85, .40], [.92, .38], [1, .42]],
    stack:    [[0, .50], [.06, .54], [.16, .78], [.26, .92], [.34, .84], [.42, .60], [.52, .56], [.62, .76], [.72, .88], [.80, .80], [.88, .58], [1, .62]]
  };

  /* 10 项参数：0~100（口径/腹径等按物理量换算） */
  var PKEYS = ['h', 'mouth', 'belly', 'foot', 'neck', 'shoulder', 'wall', 'flare', 'sArc', 'bCurve'];
  var P = {
    h:       function (v) { return 18 + v * 0.28; },        // 18–46 cm
    mouth:   function (v) { return 2 + v * 0.18; },         // 2–20 cm
    belly:   function (v) { return 6 + v * 0.26; },         // 6–32 cm
    foot:    function (v) { return 2 + v * 0.16; },         // 2–18 cm
    wall:    function (v) { return 0.25 + v * 0.0125; },    // 0.25–1.5 cm
    neck:    function (v) { return v; },
    shoulder:function (v) { return v; },
    flare:   function (v) { return v; },
    sArc:    function (v) { return v; },
    bCurve:  function (v) { return v; }
  };
  var PDEFS = [
    { k: 'h',        t: '总高度',   fmt: function (v) { return P.h(v).toFixed(1) + ' cm'; } },
    { k: 'mouth',    t: '口径',     fmt: function (v) { return P.mouth(v).toFixed(1) + ' cm'; } },
    { k: 'belly',    t: '腹径',     fmt: function (v) { return P.belly(v).toFixed(1) + ' cm'; } },
    { k: 'foot',     t: '底径',     fmt: function (v) { return P.foot(v).toFixed(1) + ' cm'; } },
    { k: 'neck',     t: '颈长',     fmt: function (v) { return Math.round(v) + '%'; } },
    { k: 'shoulder', t: '肩宽',     fmt: function (v) { return Math.round(v) + '%'; } },
    { k: 'wall',     t: '壁厚',     fmt: function (v) { return P.wall(v).toFixed(2) + ' cm'; } },
    { k: 'flare',    t: '口沿外翻', fmt: function (v) { return Math.round(v) + '%'; } },
    { k: 'sArc',     t: '肩部弧度', fmt: function (v) { return Math.round(v) + '%'; } },
    { k: 'bCurve',   t: '腹部曲线', fmt: function (v) { return Math.round(v) + '%'; } }
  ];

  /* 快捷构造器：id, 器名, 英文, 家族, [高,口径,腹径,底径,颈长,肩宽,壁厚,外翻,肩弧,腹曲] */
  function S(id, name, en, fam, d) {
    return { id: id, name: name, en: en, fam: fam, d: d };
  }

  var ERAS = [
    {
      id: 'tang', name: '唐代', en: 'TANG', note: '饱满圆润 · 雍容大气',
      shapes: [
        S('tang-ping', '唐瓶', 'VASE', 'vase', [66, 22, 62, 34, 58, 62, 24, 46, 60, 44]),
        S('tang-guan', '唐罐', 'JAR', 'jar', [50, 68, 82, 56, 16, 70, 26, 24, 64, 58]),
        S('tang-hu', '执壶', 'EWER', 'teapot', [52, 26, 74, 44, 30, 64, 24, 18, 58, 54]),
        S('tang-wan', '敞口碗', 'BOWL', 'bowl', [30, 94, 62, 30, 4, 30, 20, 52, 40, 50]),
        S('tang-dapan', '唐大盘', 'CHARGER', 'dish', [16, 96, 78, 42, 2, 22, 20, 40, 36, 50]),
        S('tang-hulu', '葫芦瓶', 'GOURD', 'gourd', [46, 18, 56, 32, 26, 44, 22, 28, 48, 72])
      ],
      patterns: [
        { id: 'baoxiang', name: '宝相花', src: '唐代/宝相花.jpg', thumb: '唐代/宝相花_t.jpg' },
        { id: 'mudan-tang', name: '缠枝牡丹', src: '元代/缠枝牡丹纹.jpg', thumb: '元代/缠枝牡丹纹_t.jpg' },
        { id: 'juancao', name: '卷草纹', src: '唐代/卷草纹(蔓草纹).jpg', thumb: '唐代/卷草纹(蔓草纹)_t.jpg' },
        { id: 'lianban', name: '莲瓣纹', src: '元代/莲瓣纹.jpg', thumb: '元代/莲瓣纹_t.jpg' },
        { id: 'ruishou', name: '瑞兽纹', src: '明·正德/瑞兽纹.jpg', thumb: '明·正德/瑞兽纹_t.jpg' },
        { id: 'tuanhua', name: '团花', src: '唐代/团花.jpg', thumb: '唐代/团花_t.jpg' },
        { id: 'fanggewen', name: '方格纹', src: '唐代/几何方格纹.jpg', thumb: '唐代/几何方格纹_t.jpg' },
        { id: 'lingxing', name: '菱形纹', src: '唐代/菱形纹.jpg', thumb: '唐代/菱形纹_t.jpg' }
      ]
    },
    {
      id: 'song', name: '宋代', en: 'SONG', note: '清雅修长 · 留白见韵',
      shapes: [
        S('song-meiping', '梅瓶', 'MEIPING', 'bottle', [66, 14, 58, 36, 52, 74, 22, 32, 72, 48]),
        S('song-yuhuchun', '玉壶春瓶', 'YUHUCUN', 'yuhuchun', [58, 18, 54, 30, 58, 56, 22, 62, 52, 70]),
        S('song-douli', '斗笠碗', 'CONICAL BOWL', 'bowl', [28, 96, 58, 22, 4, 28, 20, 46, 40, 50]),
        S('song-chazhan', '小茶盏', 'TEA CUP', 'cup', [18, 72, 44, 24, 4, 26, 18, 38, 40, 50]),
        S('song-pan', '宋盘', 'DISH', 'dish', [14, 92, 64, 34, 2, 22, 20, 36, 38, 50]),
        S('song-gaiquan', '盖罐', 'LIDDED JAR', 'jar', [44, 56, 76, 48, 14, 66, 24, 18, 60, 54])
      ],
      patterns: [
        { id: 'huaniu', name: '折枝花鸟', src: '明·成弘(成化、弘治)/花鸟纹.jpg', thumb: '明·成弘(成化、弘治)/花鸟纹_t.jpg' },
        { id: 'shanshui', name: '山水纹', src: '清·康熙(青花工艺顶峰)/山水纹.jpg', thumb: '清·康熙(青花工艺顶峰)/山水纹_t.jpg' },
        { id: 'yingxi', name: '婴戏纹', src: '明·成弘(成化、弘治)/婴戏纹.jpg', thumb: '明·成弘(成化、弘治)/婴戏纹_t.jpg' },
        { id: 'yunwen', name: '云纹', src: '明·嘉万(嘉靖、隆庆、万历)/云鹤纹.jpg', thumb: '明·嘉万(嘉靖、隆庆、万历)/云鹤纹_t.jpg' },
        { id: 'hetang', name: '荷塘莲纹', src: '元代/缠枝莲纹.jpg', thumb: '元代/缠枝莲纹_t.jpg' },
        { id: 'songmudan', name: '牡丹纹', src: '宋代/牡丹纹.jpg', thumb: '宋代/牡丹纹_t.jpg' },
        { id: 'juhua', name: '菊花纹', src: '宋代/菊花纹.jpg', thumb: '宋代/菊花纹_t.jpg' },
        { id: 'xianwen', name: '弦纹', src: '宋代/弦纹(圆圈纹).jpg', thumb: '宋代/弦纹(圆圈纹)_t.jpg' }
      ]
    },
    {
      id: 'yuan', name: '元代', en: 'YUAN', note: '厚重雄浑 · 层次繁密',
      shapes: [
        S('yuan-guan', '元青花大罐', 'JAR', 'jar', [58, 62, 86, 52, 16, 72, 30, 22, 66, 56]),
        S('yuan-meiping', '梅瓶', 'MEIPING', 'bottle', [68, 15, 60, 36, 54, 76, 24, 30, 74, 48]),
        S('yuan-yuhuchun', '玉壶春瓶', 'YUHUCUN', 'yuhuchun', [60, 20, 56, 30, 60, 58, 22, 60, 52, 68]),
        S('yuan-pan', '大盘', 'CHARGER', 'dish', [14, 98, 70, 38, 2, 24, 20, 38, 36, 50]),
        S('yuan-zhihu', '执壶', 'EWER', 'teapot', [54, 24, 70, 40, 34, 60, 24, 20, 58, 52]),
        S('yuan-gaozubei', '高足杯', 'STEM CUP', 'cup', [22, 52, 46, 20, 6, 30, 18, 26, 42, 50])
      ],
      patterns: [
        { id: 'renwu', name: '人物故事纹', src: '元代/人物故事纹.jpg', thumb: '元代/人物故事纹_t.jpg' },
        { id: 'yunlong', name: '云龙纹', src: '元代/云龙纹.jpg', thumb: '元代/云龙纹_t.jpg' },
        { id: 'mudan', name: '缠枝牡丹', src: '元代/缠枝牡丹纹.jpg', thumb: '元代/缠枝牡丹纹_t.jpg' },
        { id: 'haishui', name: '海水纹', src: '元代/海水纹.jpg', thumb: '元代/海水纹_t.jpg' },
        { id: 'yunji', name: '云肩纹', src: '元代/莲瓣纹.jpg', thumb: '元代/莲瓣纹_t.jpg' },
        { id: 'zabao', name: '杂宝纹', src: '元代/杂宝纹.jpg', thumb: '元代/杂宝纹_t.jpg' },
        { id: 'yuzao', name: '鱼藻纹', src: '明·嘉万(嘉靖、隆庆、万历)/鱼藻纹.jpg', thumb: '明·嘉万(嘉靖、隆庆、万历)/鱼藻纹_t.jpg' },
        { id: 'hongwu-zhanzhi', name: '洪武缠枝', src: '明·洪武/缠枝花卉纹.jpg', thumb: '明·洪武/缠枝花卉纹_t.jpg' }
      ]
    },
    {
      id: 'ming', name: '明代', en: 'MING', note: '端庄规整 · 吉祥庄重',
      shapes: [
        S('ming-shangping', '永乐赏瓶', 'VASE', 'vase', [68, 16, 56, 34, 62, 62, 24, 38, 60, 52]),
        S('ming-bei', '成化小杯', 'CUP', 'cup', [16, 70, 42, 22, 4, 26, 18, 34, 40, 50]),
        S('ming-guan', '嘉靖罐', 'JAR', 'jar', [56, 60, 82, 52, 18, 74, 26, 20, 66, 56]),
        S('ming-hulu', '葫芦瓶', 'GOURD', 'gourd', [58, 14, 58, 30, 28, 46, 22, 30, 50, 74]),
        S('ming-tianqiu', '天球瓶', 'TIANQIU VASE', 'vase', [64, 20, 52, 32, 56, 58, 24, 30, 62, 50]),
        S('ming-dapan', '明大盘', 'CHARGER', 'dish', [15, 96, 72, 40, 2, 22, 20, 36, 36, 50])
      ],
      patterns: [
        { id: 'longfeng', name: '龙凤纹', src: '明·嘉万(嘉靖、隆庆、万历)/龙凤纹.jpg', thumb: '明·嘉万(嘉靖、隆庆、万历)/龙凤纹_t.jpg' },
        { id: 'chanzhilian', name: '缠枝莲', src: '清·乾隆/缠枝莲纹.jpg', thumb: '清·乾隆/缠枝莲纹_t.jpg' },
        { id: 'haijiangya', name: '海水江崖', src: '明·永宣(永乐、宣德)/海水江崖纹.jpg', thumb: '明·永宣(永乐、宣德)/海水江崖纹_t.jpg' },
        { id: 'yingxi-ming', name: '婴戏', src: '明·嘉万(嘉靖、隆庆、万历)/婴戏纹.jpg', thumb: '明·嘉万(嘉靖、隆庆、万历)/婴戏纹_t.jpg' },
        { id: 'baxian', name: '八仙纹', src: '明·嘉万(嘉靖、隆庆、万历)/八仙纹.jpg', thumb: '明·嘉万(嘉靖、隆庆、万历)/八仙纹_t.jpg' },
        { id: 'longwen', name: '龙纹', src: '明·正德/龙纹.jpg', thumb: '明·正德/龙纹_t.jpg' },
        { id: 'yuzao-ming', name: '鱼藻纹', src: '明·嘉万(嘉靖、隆庆、万历)/鱼藻纹.jpg', thumb: '明·嘉万(嘉靖、隆庆、万历)/鱼藻纹_t.jpg' },
        { id: 'yunhe', name: '云鹤纹', src: '明·嘉万(嘉靖、隆庆、万历)/云鹤纹.jpg', thumb: '明·嘉万(嘉靖、隆庆、万历)/云鹤纹_t.jpg' }
      ]
    },
    {
      id: 'qing', name: '清代', en: 'QING', note: '繁复精致 · 细密繁丽',
      shapes: [
        S('qing-shangping', '赏瓶', 'VASE', 'vase', [70, 16, 56, 34, 64, 62, 24, 44, 60, 52]),
        S('qing-baoyue', '抱月瓶', 'MOON FLASK', 'moon', [46, 20, 88, 42, 22, 82, 28, 16, 78, 50]),
        S('qing-zhuanxin', '吉祥转心瓶', 'ROTATING VASE', 'stack', [58, 34, 54, 30, 18, 50, 20, 24, 54, 62]),
        S('qing-taobei', '套杯', 'STACKED CUPS', 'stack', [46, 40, 48, 26, 10, 44, 18, 20, 46, 58]),
        S('qing-yuhuchun', '玉壶春瓶', 'YUHUCUN', 'yuhuchun', [62, 18, 54, 30, 58, 56, 22, 54, 52, 66]),
        S('qing-wan', '清碗', 'BOWL', 'bowl', [32, 88, 58, 28, 4, 28, 20, 44, 40, 50])
      ],
      patterns: [
        { id: 'chanzhihui', name: '缠枝花卉', src: '清·雍正/仿永宣缠枝花卉纹.jpg', thumb: '清·雍正/仿永宣缠枝花卉纹_t.jpg' },
        { id: 'xiyang', name: '西洋花卉', src: '清·雍正/折枝花果纹.jpg', thumb: '清·雍正/折枝花果纹_t.jpg' },
        { id: 'shanshui-renwu', name: '山水人物', src: '清·康熙(青花工艺顶峰)/山水纹.jpg', thumb: '清·康熙(青花工艺顶峰)/山水纹_t.jpg' },
        { id: 'bianfu', name: '八宝吉祥', src: '清·乾隆/八宝吉祥纹.jpg', thumb: '清·乾隆/八宝吉祥纹_t.jpg' },
        { id: 'loushen', name: '镂空纹样', src: '明·嘉万(嘉靖、隆庆、万历)/锦地开光纹.jpg', thumb: '明·嘉万(嘉靖、隆庆、万历)/锦地开光纹_t.jpg' },
        { id: 'longfeng-qing', name: '龙凤呈祥', src: '清·乾隆/龙凤纹.jpg', thumb: '清·乾隆/龙凤纹_t.jpg' },
        { id: 'wanhua', name: '晚清花卉', src: '晚清(嘉庆至清末)/花卉纹.jpg', thumb: '晚清(嘉庆至清末)/花卉纹_t.jpg' },
        { id: 'bogu', name: '博古图', src: '清·康熙(青花工艺顶峰)/博古图纹.jpg', thumb: '清·康熙(青花工艺顶峰)/博古图纹_t.jpg' }
      ]
    }
  ];

  /* 纹饰区域：v 为纹理纵坐标（0 足底 → 1 口沿） */
  var REGIONS = {
    mouth:    { name: '口沿',     v: [.885, .975], line: false },
    neck:     { name: '颈部',     v: [.775, .875], line: true },
    shoulder: { name: '肩部',     v: [.635, .775], line: true },
    belly:    { name: '腹部主区', v: [.185, .635], line: true },
    foot:     { name: '足部',     v: [.030, .175], line: true },
    all:      { name: '全局铺纹', v: [.045, .975], line: false }
  };
  var REGION_ORDER = ['belt', 'mouth', 'neck', 'shoulder', 'belly', 'foot'];
  var REGION_LABEL = { mouth: '口沿', neck: '颈部', shoulder: '肩部', belly: '腹部主区', foot: '足部', all: '全局铺纹' };

  /* 三种青花色调 */
  var TONES = [
    { name: '经典钴蓝', css: '#2f5f9e' },
    { name: '淡青水墨', css: '#6d94b6' },
    { name: '浓深钴蓝', css: '#1b3f74' }
  ];
  var DENSITY = ['疏朗', '中等', '繁密'];

  /* ==================== 2. 状态 ==================== */
  var state = {
    era: 'yuan',
    shapeId: 'yuan-guan',
    shapeEra: 'yuan',   // 器型所属朝代（形制锁定后可与 era 不同：era 只决定纹样库）
    fam: 'jar',
    patternId: null,
    region: 'belly',
    density: 1,
    tone: 0,
    mode: 'pinch',
    finish: 0,          // 0 湿坯 · 1 素坯预览 · 2 青花釉面
    finishT: 0,
    decorOp: 0,
    params: {},
    dR: new Float32Array(N + 1),   // 径向形变（世界单位）
    dY: new Float32Array(N + 1),   // 纵向形变（世界单位）
    dims: { h: 30, belly: 24, mouth: 10, foot: 8, wall: 0.7 },
    height: 2.5,
    bellyR: 1,
    spin: 0.1,
    spinOn: true,
    maskReady: false,
    workURL: '',
    busy: false
  };

  function eraOf(id) {
    for (var i = 0; i < ERAS.length; i++) if (ERAS[i].id === id) return ERAS[i];
    return ERAS[2];
  }
  /* 当前器型对象：形制锁定后朝代（纹样库）可以换，器型仍属于载入它时的朝代，
     所以查器型不能再用 state.era，否则会串到目标朝代的第一件器型上 */
  function currentShape() {
    return shapeOf(eraOf(state.shapeEra || state.era), state.shapeId);
  }
  function shapesOf(era) { return era.shapes; }
  function shapeOf(era, id) {
    for (var i = 0; i < era.shapes.length; i++) if (era.shapes[i].id === id) return era.shapes[i];
    return era.shapes[0];
  }
  function patternOf(era, id) {
    for (var i = 0; i < era.patterns.length; i++) if (era.patterns[i].id === id) return era.patterns[i];
    return null;
  }
  function arrToParams(d) {
    var o = {};
    PKEYS.forEach(function (k, i) { o[k] = d[i]; });
    return o;
  }

  /* ==================== 3. 曲线与轮廓 ==================== */

  /* 关键点 Catmull-Rom 插值 */
  function keyCurve(keys, t) {
    var k = 0;
    while (k < keys.length - 2 && keys[k + 1][0] < t) k++;
    var p1 = keys[k], p2 = keys[k + 1];
    var p0 = keys[Math.max(0, k - 1)];
    var p3 = keys[Math.min(keys.length - 1, k + 2)];
    var u = clamp((t - p1[0]) / ((p2[0] - p1[0]) || 1e-6), 0, 1);
    var u2 = u * u, u3 = u2 * u;
    var r = 0.5 * (
      2 * p1[1] +
      (-p0[1] + p2[1]) * u +
      (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 +
      (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3
    );
    return clamp(r, 0.04, 1.3);
  }

  /* 参数调制后的归一化半径 */
  function radiusNorm(t, p, fam) {
    var r = keyCurve(FAMILIES[fam] || FAMILIES.jar, t);
    var belly = p.belly / 100, shoulder = p.shoulder / 100, neck = p.neck / 100,
        flare = p.flare / 100, sArc = p.sArc / 100, bCurve = p.bCurve / 100;

    // 鼓腹：中下段外扩，重心随「腹部曲线」上下滑动
    var bc = 0.34 + (bCurve - 0.5) * 0.3;
    r *= 1 + (belly - 0.5) * 0.5 * gauss(t, bc, 0.2);
    // 肩宽
    r *= 1 + (shoulder - 0.5) * 0.34 * gauss(t, 0.73, 0.12);
    // 肩部弧度：过渡陡缓
    r *= 1 + (sArc - 0.5) * 0.22 * gauss(t, 0.64, 0.09);
    // 颈长：颈区收细
    r *= 1 - (neck - 0.2) * 0.34 * gauss(t, 0.9, 0.075);
    // 口沿外翻
    r *= 1 + flare * 0.55 * smoothstep(0.9, 0.995, t);
    return Math.max(0.05, r);
  }

  /* 含底径 / 口径约束的归一化轮廓（缩略图与建模共用） */
  function silhouette(t, p, fam) {
    var bellyCm = P.belly(p.belly);
    var mouthN = (P.mouth(p.mouth) / bellyCm) * (1 + p.flare / 100 * 0.55);
    var footN = P.foot(p.foot) / bellyCm;
    var r = radiusNorm(t, p, fam);
    r = lerp(r, footN, 1 - smoothstep(0, 0.075, t));
    r = lerp(r, mouthN, smoothstep(0.93, 1, t));
    return Math.max(0.02, r);
  }

  /* 器型缩略剪影（内联 SVG） */
  function shapeThumb(shape) {
    var p = arrToParams(shape.d);
    var pts = [], maxR = 0;
    for (var i = 0; i <= 40; i++) {
      var t = i / 40;
      var r = silhouette(t, p, shape.fam);
      if (r > maxR) maxR = r;
      pts.push([r, t]);
    }
    var H = 62, top = 4, cx = 30, sx = 24 / (maxR || 1);
    var left = [], right = [];
    for (var j = 0; j < pts.length; j++) {
      var y = top + (1 - pts[j][1]) * H;
      left.push((cx - pts[j][0] * sx).toFixed(1) + ',' + y.toFixed(1));
      right.push((cx + pts[j][0] * sx).toFixed(1) + ',' + y.toFixed(1));
    }
    right.reverse();
    var d = 'M' + left.join('L') + 'L' + right.join('L') + 'Z';
    return '<svg viewBox="0 0 60 72" aria-hidden="true">' +
      '<path d="' + d + '" fill="rgba(233,222,201,.13)" stroke="rgba(200,169,107,.62)" stroke-width="1" stroke-linejoin="round"/>' +
      '</svg>';
  }

  /* ==================== 4. 界面构建 ==================== */
  var eraTabsEl = $('eraTabs'), shapeListEl = $('shapeList'), paramListEl = $('paramList');
  var patternListEl = $('patternList'), regionListEl = $('regionList');
  var densityListEl = $('densityList'), toneListEl = $('toneList');

  function buildEraTabs() {
    eraTabsEl.innerHTML = ERAS.map(function (e) {
      return '<button class="era-tab" type="button" role="tab" data-era="' + e.id + '">' + e.name + '</button>';
    }).join('');
    eraTabsEl.addEventListener('click', function (ev) {
      var b = ev.target.closest('.era-tab');
      if (b) switchEra(b.dataset.era);
    });
  }

  function buildShapeList() {
    var era = eraOf(state.era);
    $('eraNote').textContent = era.note;
    shapeListEl.innerHTML = era.shapes.map(function (s) {
      return '<button class="shape-card' + (s.id === state.shapeId ? ' on' : '') + '" type="button" data-id="' + s.id + '">' +
        shapeThumb(s) +
        '<span class="sc-t"><span class="sc-name">' + s.name + '</span><span class="sc-en">' + s.en + '</span></span>' +
        '</button>';
    }).join('');
  }

  function buildPatterns() {
    var era = eraOf(state.era);
    $('patternEra').textContent = era.name;
    patternListEl.innerHTML = era.patterns.map(function (p, i) {
      return '<button class="pattern-card' + (p.id === state.patternId ? ' on' : '') + '" type="button" data-id="' + p.id + '" title="' + p.name + '">' +
        (i === 0 ? '<span class="pc-badge">推荐</span>' : '') +
        '<span class="pc-thumb"><img src="' + IMG + p.thumb + '" alt="' + p.name + '" loading="lazy"></span>' +
        '<span class="pc-name">' + p.name + '</span>' +
        '</button>';
    }).join('');
  }

  function buildRegions() {
    // 首项「全局」独占一行
    var order = ['all', 'mouth', 'neck', 'shoulder', 'belly', 'foot'];
    regionListEl.innerHTML = order.map(function (k) {
      return '<button class="region-btn' + (state.region === k ? ' on' : '') + '" type="button" data-region="' + k + '">' +
        REGION_LABEL[k] + '</button>';
    }).join('');
  }

  function buildDensity() {
    densityListEl.innerHTML = DENSITY.map(function (d, i) {
      return '<button type="button" class="' + (i === state.density ? 'on' : '') + '" data-d="' + i + '">' + d + '</button>';
    }).join('');
  }

  function buildTones() {
    toneListEl.innerHTML = TONES.map(function (t, i) {
      return '<button class="tone-btn' + (i === state.tone ? ' on' : '') + '" type="button" data-tone="' + i + '">' +
        '<i style="color:' + t.css + '"></i>' + t.name + '</button>';
    }).join('');
  }

  function buildParams() {
    paramListEl.innerHTML = PDEFS.map(function (d) {
      var v = Math.round(state.params[d.k] || 0);
      return '<label class="prm">' +
        '<span class="prm-t">' + d.t + '</span>' +
        '<input type="range" min="0" max="100" step="1" value="' + v + '" data-k="' + d.k + '" style="--p:' + v + '%" aria-label="' + d.t + '">' +
        '<b class="prm-v" data-v="' + d.k + '">' + d.fmt(v) + '</b>' +
        '</label>';
    }).join('');
  }

  function syncParamUI() {
    PDEFS.forEach(function (d) {
      var input = paramListEl.querySelector('input[data-k="' + d.k + '"]');
      var val = paramListEl.querySelector('[data-v="' + d.k + '"]');
      if (!input) return;
      var v = Math.round(state.params[d.k]);
      input.value = v;
      input.style.setProperty('--p', v + '%');
      if (val) val.textContent = d.fmt(v);
    });
    $('mH').textContent = P.h(state.params.h).toFixed(1);
    $('mD').textContent = P.belly(state.params.belly).toFixed(1);
  }

  function syncShapeCards() {
    Array.prototype.forEach.call(shapeListEl.children, function (el) {
      el.classList.toggle('on', el.dataset.id === state.shapeId);
    });
  }
  function syncPatternCards() {
    Array.prototype.forEach.call(patternListEl.children, function (el) {
      el.classList.toggle('on', el.dataset.id === state.patternId);
    });
  }
  function syncRegionUI() {
    Array.prototype.forEach.call(regionListEl.children, function (el) {
      if (!el.dataset.region) return;   // 「款识」入口按钮不参与纹样区域选中态
      el.classList.toggle('on', el.dataset.region === state.region);
    });
  }
  function syncDensityUI() {
    Array.prototype.forEach.call(densityListEl.children, function (el) {
      el.classList.toggle('on', +el.dataset.d === state.density);
    });
  }
  function syncToneUI() {
    Array.prototype.forEach.call(toneListEl.children, function (el) {
      el.classList.toggle('on', +el.dataset.tone === state.tone);
    });
  }

  /* ==================== 5. Three.js 场景 ==================== */
  var canvas = $('scene');
  var renderer, scene, camera, potGroup, potMesh, decorMesh, wheel, pmremRT;
  var potMat, decorMat;
  var decorCanvas, decorCtx, decorTex;

  var cam = { yaw: 0.26, pitch: 0.19, dist: 7.4, tYaw: 0.26, tPitch: 0.19, tDist: 7.4, targetY: 1.3 };

  var curR = new Float32Array(N + 1);   // 当前世界半径（供拾取/压平使用）
  var curY = new Float32Array(N + 1);   // 当前世界高度

  function initThree() {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(36, 1, 0.1, 120);

    buildEnvironment();
    buildLights();
    buildWheel();

    potGroup = new THREE.Group();
    scene.add(potGroup);

    // 器身：湿坯→釉面的物理材质
    potMat = new THREE.MeshPhysicalMaterial({
      color: 0x5a3a22,
      roughness: 0.9,
      metalness: 0.0,
      clearcoat: 0.0,
      clearcoatRoughness: 0.8,
      envMapIntensity: 0.07,
      sheen: 0.08,
      sheenRoughness: 0.95,
      sheenColor: new THREE.Color(0x8b5f3c),
      bumpMap: clayTexture(),
      bumpScale: 0.012,
      side: THREE.DoubleSide
    });
    potMesh = new THREE.Mesh(new THREE.BufferGeometry(), potMat);
    potMesh.castShadow = true;
    potMesh.receiveShadow = true;
    potGroup.add(potMesh);

    // 纹样层：贴合外壁的透明薄壳
    decorCanvas = document.createElement('canvas');
    decorCanvas.width = 2048;
    decorCanvas.height = 1024;
    decorCtx = decorCanvas.getContext('2d');
    decorTex = new THREE.CanvasTexture(decorCanvas);
    decorTex.encoding = THREE.sRGBEncoding;
    decorTex.wrapS = THREE.RepeatWrapping;
    decorTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    // 纹样层用无光照材质，保证钴蓝色准不被灯光冲淡
    decorMat = new THREE.MeshBasicMaterial({
      map: decorTex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    decorMesh = new THREE.Mesh(new THREE.BufferGeometry(), decorMat);
    decorMesh.scale.set(1.004, 1.001, 1.004);
    decorMesh.renderOrder = 2;
    potGroup.add(decorMesh);

    // 器物接触阴影（软影贴图）
    var contact = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 3.6),
      new THREE.MeshBasicMaterial({
        map: contactShadowTexture(),
        transparent: true,
        depthWrite: false,
        opacity: 0.85
      })
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.004;
    potGroup.add(contact);

    // 地面接影
    var floor = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 26),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.42;
    floor.receiveShadow = true;
    scene.add(floor);

    resizeStage();
    if (window.ResizeObserver) new ResizeObserver(resizeStage).observe($('stage'));
    else window.addEventListener('resize', resizeStage);
  }

  function buildLights() {
    scene.add(new THREE.HemisphereLight(0xffe2bc, 0x241811, 0.26));

    // 主光：暖色顶侧光，落到器物上
    var key = new THREE.SpotLight(0xffd7a4, 1.0, 26, 0.62, 0.75, 1.3);
    key.position.set(3.1, 6.4, 2.9);
    key.target.position.set(0, 1.15, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 18;
    key.shadow.bias = -0.0008;
    key.shadow.radius = 3;
    scene.add(key, key.target);

    // 轮廓光：冷调，勾出器身
    var rim = new THREE.SpotLight(0xa9c8e8, 0.85, 22, 0.72, 0.9, 1.2);
    rim.position.set(-3.6, 4.0, -3.4);
    rim.target.position.set(0, 1.3, 0);
    scene.add(rim, rim.target);

    // 补光：正面低位暖光
    var fill = new THREE.PointLight(0xffb87a, 0.28, 14, 2);
    fill.position.set(-2.2, 1.0, 3.4);
    scene.add(fill);
  }

  /* 程序化环境贴图：暖色工坊 + 冷侧光，供釉面反射 */
  function buildEnvironment() {
    var c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    var g = c.getContext('2d');
    var grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#3b2a1c');
    grd.addColorStop(0.45, '#7b5739');
    grd.addColorStop(0.56, '#2b1f15');
    grd.addColorStop(1, '#0c0906');
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 256);

    var bl = g.createRadialGradient(150, 74, 4, 150, 74, 96);
    bl.addColorStop(0, 'rgba(255,238,210,1)');
    bl.addColorStop(0.5, 'rgba(255,224,180,.45)');
    bl.addColorStop(1, 'rgba(255,220,170,0)');
    g.fillStyle = bl;
    g.beginPath(); g.ellipse(150, 74, 118, 74, 0, 0, 7); g.fill();

    var bl2 = g.createRadialGradient(400, 108, 4, 400, 108, 84);
    bl2.addColorStop(0, 'rgba(186,220,255,.85)');
    bl2.addColorStop(1, 'rgba(186,220,255,0)');
    g.fillStyle = bl2;
    g.beginPath(); g.ellipse(400, 108, 96, 62, 0, 0, 7); g.fill();

    var tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.encoding = THREE.sRGBEncoding;

    var pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    pmremRT = pmrem.fromEquirectangular(tex);
    scene.environment = pmremRT.texture;
    tex.dispose();
    pmrem.dispose();
  }

  /* 木纹贴图（程序化） */
  function woodTexture() {
    var c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    var g = c.getContext('2d');
    g.fillStyle = '#6b4a2e';
    g.fillRect(0, 0, 512, 512);

    // 同心木纹
    for (var i = 0; i < 80; i++) {
      var r = 20 + i * 3.6;
      g.beginPath();
      g.arc(256 + Math.sin(i * 0.7) * 12, 256 + Math.cos(i * 0.5) * 10, r, 0, Math.PI * 2);
      g.strokeStyle = i % 3 === 0 ? 'rgba(52,34,20,.34)' : 'rgba(120,86,52,.22)';
      g.lineWidth = i % 5 === 0 ? 2.6 : 1.2;
      g.stroke();
    }
    // 木射线
    for (var j = 0; j < 220; j++) {
      var a = Math.random() * Math.PI * 2;
      var rr = Math.random() * 250;
      var x = 256 + Math.cos(a) * rr, y = 256 + Math.sin(a) * rr;
      g.fillStyle = 'rgba(40,26,15,' + (0.02 + Math.random() * 0.06) + ')';
      g.fillRect(x, y, 1.4 + Math.random() * 2, 8 + Math.random() * 26);
    }
    // 边缘压暗
    var vg = g.createRadialGradient(256, 256, 120, 256, 256, 300);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(18,10,5,.5)');
    g.fillStyle = vg;
    g.fillRect(0, 0, 512, 512);

    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }

  /* 接触软影贴图 */
  function contactShadowTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 256;
    var g = c.getContext('2d');
    var rg = g.createRadialGradient(128, 128, 6, 128, 128, 126);
    rg.addColorStop(0, 'rgba(0,0,0,.62)');
    rg.addColorStop(0.42, 'rgba(0,0,0,.36)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }

  /* 陶土颗粒贴图（用于湿坯凹凸细节） */
  function clayTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 256;
    var g = c.getContext('2d');
    var img = g.createImageData(256, 256);
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var v = 128 + (Math.random() - 0.5) * 120;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 3);
    return t;
  }

  /* 圆形木质拉坯台 */
  function buildWheel() {
    wheel = new THREE.Group();
    var wood = woodTexture();

    var top = new THREE.Mesh(
      new THREE.CylinderGeometry(1.52, 1.52, 0.14, 72, 1),
      new THREE.MeshStandardMaterial({ map: wood, roughness: 0.78, metalness: 0.06, color: 0xffffff })
    );
    top.position.y = -0.07;
    top.castShadow = true;
    top.receiveShadow = true;
    wheel.add(top);

    // 铜箍
    var ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.52, 0.035, 10, 90),
      new THREE.MeshStandardMaterial({ color: 0x8a6a3e, roughness: 0.45, metalness: 0.75 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.02;
    wheel.add(ring);

    // 台座
    var base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.14, 1.34, 0.36, 64, 1),
      new THREE.MeshStandardMaterial({ map: wood, roughness: 0.82, metalness: 0.04, color: 0xbfa98f })
    );
    base.position.y = -0.32;
    base.castShadow = true;
    base.receiveShadow = true;
    wheel.add(base);

    // 立柱
    var shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.34, 1.0, 32, 1),
      new THREE.MeshStandardMaterial({ color: 0x3f2c1c, roughness: 0.8, metalness: 0.1 })
    );
    shaft.position.y = -0.98;
    wheel.add(shaft);

    scene.add(wheel);
  }

  function resizeStage() {
    var stage = $('stage');
    var w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /* ==================== 6. 旋转放样 ==================== */
  var bellyRWorld = 1;

  /* keepView=true 时保留用户当前的缩放距离与视角 */
  function rebuildPot(keepView) {
    var p = state.params;
    var hCm = P.h(p.h), bellyCm = P.belly(p.belly), mouthCm = P.mouth(p.mouth), footCm = P.foot(p.foot);
    var H = hCm * CM;
    var bellyR = (bellyCm / 2) * CM;
    var mouthR = (mouthCm / 2) * CM * (1 + p.flare / 100 * 0.55);
    var footR = (footCm / 2) * CM;
    var wall = Math.min(P.wall(p.wall) * CM, H * 0.26);

    state.height = H;
    state.bellyR = bellyR;
    bellyRWorld = bellyR;
    state.dims = { h: hCm, belly: bellyCm, mouth: mouthCm, foot: footCm, wall: P.wall(p.wall) };

    var outer = [new THREE.Vector2(0, 0), new THREE.Vector2(Math.min(footR * 0.52, bellyR * 0.6), 0.002)];

    for (var i = 0; i <= N; i++) {
      var t = i / N;
      var r = silhouette(t, p, state.fam) * bellyR + state.dR[i];
      // 拉坯旋纹：沿高度叠加极细的环状起伏，让器身在光下出现手作纹路
      r *= 1 + 0.0022 * Math.sin(t * H * 40);
      var y = Math.max(0, t * H + state.dY[i]);
      r = clamp(r, 0.018, bellyR * 1.9);
      curR[i] = r;
      curY[i] = y;
      // 前两点为底足，保持不变
      outer.push(new THREE.Vector2(r, y));
    }

    // 器身：外壁 + 口沿 + 内壁 + 内底
    var body = outer.slice();
    var rimR = Math.max(curR[N] - wall, 0.014);
    body.push(new THREE.Vector2(rimR, curY[N]));
    var innerFloor = Math.min(wall * 1.7, H * 0.3);
    for (var j = N; j >= 0; j--) {
      var ir = Math.max(curR[j] - wall, 0.012);
      var iy = Math.max(innerFloor, curY[j]);
      body.push(new THREE.Vector2(ir, iy));
    }
    body.push(new THREE.Vector2(0, innerFloor));

    var bodyGeo = new THREE.LatheGeometry(body, 108);
    potMesh.geometry.dispose();
    potMesh.geometry = bodyGeo;

    // 纹样层：仅外壁，UV 的 v 即轮廓参数
    var decorPts = [new THREE.Vector2(0, 0)];
    for (var m = 0; m <= N; m++) decorPts.push(new THREE.Vector2(curR[m], curY[m]));
    var decorGeo = new THREE.LatheGeometry(decorPts, 108);
    decorMesh.geometry.dispose();
    decorMesh.geometry = decorGeo;

    // 相机取景（仅换器型时重置取景距离，拖动参数/捏塑时保持用户缩放）
    cam.targetY = H * 0.44 + 0.18;
    if (!keepView) cam.tDist = clamp(H * 2.0 + 2.3, 6.0, 13);

    // 拉坯台随器物高度微调
    potGroup.position.y = 0;

    if (state.finish > 0) composeDecor(); else if (decorCtx) { decorCtx.clearRect(0, 0, 2048, 1024); decorTex.needsUpdate = true; }
  }

  /* ==================== 7. 纹样：遮罩 → 着色 → 区域铺设 ==================== */
  var maskCache = {};
  var tintCache = {};

  /* 读取纹样图，按亮度转成透明墨色遮罩，并裁去纸白 */
  function loadMask(pat, cb) {
    if (maskCache[pat.id] !== undefined) return cb(maskCache[pat.id]);

    var img = new Image();
    /* 纹样来源优先级：内嵌 base64 库（data-URI 永不污染画布，file:// 直开也生效）
       → http(s) 下走原始文件（crossOrigin 保险）；file:// 且无内嵌时跳过 crossOrigin */
    var src = (window.PATTERN_EMBED && window.PATTERN_EMBED[pat.src]) || (IMG + pat.src);
    if (location.protocol !== 'file:' && !/^data:/.test(src)) img.crossOrigin = 'anonymous';
    img.onload = function () {
      var w = 720;
      var h = Math.max(1, Math.round(w * img.height / img.width));
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var g = c.getContext('2d');
      g.drawImage(img, 0, 0, w, h);

      var data;
      try { data = g.getImageData(0, 0, w, h); }
      catch (err) {
        /* file:// 下画布被跨域污染，无法逐像素抠墨：
           降级为「原图 + multiply 叠色」渲染，白底在釉面上自然隐去，功能不中断 */
        maskCache[pat.id] = { canvas: c, box: { x: 0, y: 0, w: w, h: h }, raw: true };
        return cb(maskCache[pat.id]);
      }

      var px = data.data;
      var minX = w, minY = h, maxX = 0, maxY = 0;
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var o = (y * w + x) * 4;
          var lum = 0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2];
          /* 更宽的过渡区间 + 轻微抬中调：保留笔触的浓淡层次（老实现把中灰直接压成实心蓝，
             纹样贴到器身上会糊成色块）；低于阈值直接清零，去掉相纸底色与噪点 */
          var a = clamp((248 - lum) / 92, 0, 1);
          a = Math.pow(a, 0.82);
          if (a < 0.07) a = 0;
          px[o] = 0; px[o + 1] = 0; px[o + 2] = 0;
          px[o + 3] = Math.round(a * 255);
          if (a > 0.09) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }
      g.putImageData(data, 0, 0);
      if (maxX <= minX || maxY <= minY) { minX = 0; minY = 0; maxX = w - 1; maxY = h - 1; }

      // 内收 1%，去掉原图边框与留白
      var padX = Math.round((maxX - minX) * 0.012) + 1;
      var padY = Math.round((maxY - minY) * 0.012) + 1;
      var box = {
        x: clamp(minX + padX, 0, w - 2),
        y: clamp(minY + padY, 0, h - 2),
        w: Math.max(4, maxX - minX - padX * 2),
        h: Math.max(4, maxY - minY - padY * 2)
      };
      box.w = Math.min(box.w, w - box.x);
      box.h = Math.min(box.h, h - box.y);

      maskCache[pat.id] = { canvas: c, box: box };
      cb(maskCache[pat.id]);
    };
    img.onerror = function () { maskCache[pat.id] = null; cb(null); };
    img.src = src;
  }

  /* 遮罩按青花色调着色（缓存） */
  function tinted(pat, toneIdx) {
    var key = pat.id + '|' + toneIdx;
    if (tintCache[key]) return tintCache[key];
    var m = maskCache[pat.id];
    if (!m) return null;

    var b = m.box;
    var c = document.createElement('canvas');
    c.width = b.w; c.height = b.h;
    var g = c.getContext('2d');
    g.drawImage(m.canvas, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    // file:// 降级模式：画布带白底且被污染，保留原青花图颜色，不做抠墨与填色
    if (!m.raw) {
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = TONES[toneIdx].css;
      g.fillRect(0, 0, b.w, b.h);
      /* 加深钴蓝：按曲线提亮笔画不透明度，深色更沉、灰调保留层次（线性 ×1.45 会把淡笔画冲淡） */
      var img = g.getImageData(0, 0, b.w, b.h);
      var d = img.data;
      for (var i = 3; i < d.length; i += 4) {
        var av = d[i] / 255;
        d[i] = Math.min(255, Math.round(Math.pow(av, 0.82) * 255 * 1.5));
      }
      g.putImageData(img, 0, 0);
    }
    tintCache[key] = c;
    return c;
  }

  /* 按密度水平平铺（奇数片镜像，消除硬接缝） */
  function drawTiled(g, tile, v0, v1, dens, rows) {
    var CW = 2048, CH = 1024;
    var y0 = (1 - v1) * CH;
    var bandH = (v1 - v0) * CH;
    var rowH = bandH / rows;
    var aspect = tile.width / tile.height;

    var n = clamp(Math.round(CW * dens / (rowH * 0.92 * aspect)), 1, 30);
    var tileW = CW / n;
    var tileH = tileW / aspect;
    while (tileH > rowH * 0.96 && n < 34) {
      n++; tileW = CW / n; tileH = tileW / aspect;
    }

    for (var r = 0; r < rows; r++) {
      var ty = y0 + rowH * r + (rowH - tileH) / 2;
      for (var k = 0; k < n; k++) {
        var tx = k * tileW;
        g.save();
        if (k & 1) { g.translate(tx + tileW, ty); g.scale(-1, 1); }
        else { g.translate(tx, ty); }
        g.drawImage(tile, 0, 0, tileW, tileH);
        g.restore();
      }
    }
  }

  /* 把一条纹带先画到独立画布，再对上下边缘做羽化：
     老实现直接平铺到贴图上，纹带上下是刀刃一样的直角裁切，
     贴到弧面上会看到「贴纸边」；羽化后纹样渐入釉面，轮廓也更干净 */
  function bandCanvas(tile, v0, v1, dens, rows) {
    var CW = 2048, CH = 1024;
    var c = document.createElement('canvas');
    c.width = CW; c.height = CH;
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    drawTiled(g, tile, v0, v1, dens, rows);

    var y0 = (1 - v1) * CH, y1 = (1 - v0) * CH;
    var h = Math.max(2, y1 - y0);
    var feather = clamp(h * 0.10, 6, 52) / h;      // 上下各羽化 10%（最多 52px）
    if (feather > 0.45) feather = 0.45;
    var grd = g.createLinearGradient(0, y0, 0, y1);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(feather, 'rgba(0,0,0,1)');
    grd.addColorStop(1 - feather, 'rgba(0,0,0,1)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = grd;
    g.fillRect(0, y0, CW, h);
    return c;
  }

  /* 纹带上的钴蓝细线（内收到羽化区以内，作为纹带的「弦线」） */
  function drawBandLines(g, v0, v1) {
    var CW = 2048, CH = 1024;
    var yTop = (1 - v1) * CH, yBot = (1 - v0) * CH;
    var inset = Math.max(5, (yBot - yTop) * 0.035);
    g.save();
    g.globalAlpha = 0.42;
    g.strokeStyle = TONES[state.tone].css;
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(0, yTop + inset); g.lineTo(CW, yTop + inset);
    g.moveTo(0, yBot - inset); g.lineTo(CW, yBot - inset);
    g.stroke();
    g.restore();
  }

  /* file:// 降级：程序化青花笔意 —— 不依赖图片、不污染画布。
     按纹样名关键词绘制不同图案（龙纹/花卉/山水/几何/缠枝），
     加深钴蓝、加粗笔锋，保证直开模式下不同纹样肉眼可辨 */
  function drawProceduralMotif(g, v0, v1, dens, pat) {
    var CW = 2048, CH = 1024;
    var yTop = (1 - v1) * CH, yBot = (1 - v0) * CH;
    var mid = (yTop + yBot) / 2;
    var bandH = yBot - yTop;
    var step = CW / Math.max(5, Math.round(9 * dens));
    var tone = TONES[state.tone];
    /* 主笔钴蓝加深（叠深蓝阴影线），让素坯上足够醒目 */
    var ink = tone.css, deep = tone.deep || '#1f3f6e';
    var name = (pat && (pat.name || '') + (pat.id || '')) || '';
    var lw = Math.max(5, bandH * 0.085);
    var i, x, r, a;
    g.save();
    g.globalAlpha = 0.96;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.lineWidth = lw;
    g.strokeStyle = ink;
    g.fillStyle = ink;

    if (/龙|云龙/.test(name)) {
      /* 云龙纹：翻涌浪涛 + 追珠 */
      for (x = step * 0.5; x < CW + step; x += step) {
        g.beginPath();
        g.moveTo(x - step * 0.4, mid + bandH * 0.1);
        g.bezierCurveTo(x - step * 0.1, mid - bandH * 0.34, x + step * 0.1, mid - bandH * 0.34, x + step * 0.4, mid + bandH * 0.1);
        g.stroke();
        g.beginPath();
        g.arc(x, mid - bandH * 0.02, Math.max(3, bandH * 0.075), 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.moveTo(x, mid + bandH * 0.22);
        g.quadraticCurveTo(x + step * 0.22, mid + bandH * 0.38, x + step * 0.5, mid + bandH * 0.22);
        g.stroke();
      }
    } else if (/海水|海浪|波/.test(name)) {
      /* 海水纹：层叠鳞状卷浪（三排错位半圆鳞片） */
      var rows3 = 3, sc = step * 0.5;
      for (r = 0; r < rows3; r++) {
        var ry = yTop + bandH * (0.18 + r * 0.28);
        for (x = (r % 2 ? sc : 0); x < CW + sc; x += sc * 2) {
          g.beginPath();
          g.arc(x + sc, ry, sc * 0.9, Math.PI, Math.PI * 2);
          g.stroke();
          g.beginPath();
          g.arc(x + sc, ry - sc * 0.35, Math.max(2, sc * 0.16), 0, Math.PI * 2);
          g.fill();
        }
      }
    } else if (/鱼|藻/.test(name)) {
      /* 鱼藻纹：鱼身 + 三角尾鳍 + 藻点 */
      for (x = step * 0.6; x < CW; x += step) {
        g.beginPath();
        g.ellipse(x, mid, step * 0.3, bandH * 0.16, 0, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.moveTo(x + step * 0.28, mid);
        g.lineTo(x + step * 0.46, mid - bandH * 0.14);
        g.lineTo(x + step * 0.46, mid + bandH * 0.14);
        g.closePath();
        g.stroke();
        g.beginPath();
        g.arc(x - step * 0.16, mid - bandH * 0.04, Math.max(2, bandH * 0.03), 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.arc(x + step * 0.1, mid + bandH * 0.3, Math.max(2, bandH * 0.04), 0, Math.PI * 2);
        g.fill();
      }
    } else if (/云|鹤|肩/.test(name)) {
      /* 云纹/云肩/云鹤：如意云头卷（螺旋 + 尾摆） */
      for (x = step * 0.5; x < CW + step; x += step) {
        g.beginPath();
        g.arc(x, mid - bandH * 0.08, bandH * 0.22, Math.PI * 0.4, Math.PI * 2.1);
        g.stroke();
        g.beginPath();
        g.arc(x + bandH * 0.16, mid - bandH * 0.02, bandH * 0.13, Math.PI * 0.9, Math.PI * 2.4);
        g.stroke();
        g.beginPath();
        g.moveTo(x + bandH * 0.3, mid + bandH * 0.1);
        g.quadraticCurveTo(x + step * 0.3, mid + bandH * 0.26, x + step * 0.48, mid + bandH * 0.14);
        g.stroke();
      }
    } else if (/兽|凤|瑞|鸟/.test(name)) {
      /* 瑞兽/凤鸟纹：S形凤身 + 展翅弧 + 冠羽 */
      for (x = step * 0.6; x < CW; x += step) {
        g.beginPath();
        g.moveTo(x - step * 0.3, mid + bandH * 0.2);
        g.bezierCurveTo(x - step * 0.1, mid - bandH * 0.3, x + step * 0.05, mid + bandH * 0.28, x + step * 0.28, mid - bandH * 0.16);
        g.stroke();
        g.beginPath();
        g.arc(x - step * 0.02, mid + bandH * 0.02, bandH * 0.2, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
        g.beginPath();
        g.arc(x + step * 0.3, mid - bandH * 0.2, Math.max(2.5, bandH * 0.05), 0, Math.PI * 2);
        g.fill();
      }
    } else if (/婴|童/.test(name)) {
      /* 婴戏纹：孩童（圆头 + 弧身 + 球） */
      for (x = step * 0.6; x < CW; x += step) {
        g.beginPath();
        g.arc(x, mid - bandH * 0.16, bandH * 0.1, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.arc(x, mid + bandH * 0.14, bandH * 0.18, Math.PI, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.arc(x + bandH * 0.26, mid + bandH * 0.18, Math.max(2.5, bandH * 0.05), 0, Math.PI * 2);
        g.fill();
      }
    } else if (/花|莲|牡|宝相|菊|卉/.test(name)) {
      /* 花卉纹：团花 —— 放射花瓣 + 花心 */
      for (x = step; x < CW; x += step * 2) {
        var petals = 6;
        var pr = bandH * 0.34;
        for (i = 0; i < petals; i++) {
          a = (i / petals) * Math.PI * 2;
          g.beginPath();
          g.ellipse(x + Math.cos(a) * pr * 0.55, mid + Math.sin(a) * pr * 0.55, pr * 0.34, pr * 0.16, a, 0, Math.PI * 2);
          g.stroke();
        }
        g.beginPath();
        g.arc(x, mid, Math.max(3.5, bandH * 0.09), 0, Math.PI * 2);
        g.fill();
      }
    } else if (/山|水|人物|渔/.test(name)) {
      /* 山水纹：远山叠嶂 + 水波线 */
      for (x = step * 0.5; x < CW + step; x += step) {
        g.beginPath();
        g.moveTo(x - step * 0.48, mid + bandH * 0.16);
        g.lineTo(x, mid - bandH * 0.3);
        g.lineTo(x + step * 0.48, mid + bandH * 0.16);
        g.stroke();
        g.beginPath();
        g.moveTo(x - step * 0.2, mid - bandH * 0.04);
        g.lineTo(x, mid - bandH * 0.16);
        g.lineTo(x + step * 0.2, mid - bandH * 0.04);
        g.stroke();
        g.beginPath();
        g.moveTo(x - step * 0.3, mid + bandH * 0.34);
        g.quadraticCurveTo(x, mid + bandH * 0.24, x + step * 0.3, mid + bandH * 0.34);
        g.stroke();
      }
    } else if (/方格|菱|几何|锦/.test(name)) {
      /* 几何纹：连续菱格 */
      var dHalf = bandH * 0.3;
      for (x = step * 0.5; x < CW + step; x += step) {
        g.beginPath();
        g.moveTo(x, mid - dHalf);
        g.lineTo(x + step / 2, mid);
        g.lineTo(x, mid + dHalf);
        g.lineTo(x - step / 2, mid);
        g.closePath();
        g.stroke();
        g.beginPath();
        g.arc(x, mid, Math.max(2.5, bandH * 0.05), 0, Math.PI * 2);
        g.fill();
      }
    } else {
      /* 默认缠枝：上仰连弧 + 乳点（原笔意加粗） */
      for (x = step * 0.5; x < CW + step; x += step) {
        g.beginPath();
        g.arc(x, mid + bandH * 0.12, bandH * 0.32, Math.PI * 1.02, Math.PI * 1.98);
        g.stroke();
        g.beginPath();
        g.arc(x, mid + bandH * 0.12, Math.max(3, bandH * 0.065), 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.arc(x + step / 2, yBot - bandH * 0.18, Math.max(2.5, bandH * 0.045), 0, Math.PI * 2);
        g.fill();
      }
    }

    /* 深蓝阴影复描：沿主笔下方偏移，增强笔锋层次 */
    g.globalAlpha = 0.25;
    g.strokeStyle = deep;
    g.lineWidth = lw * 0.5;
    for (r = 0; r < 2; r++) {
      g.beginPath();
      g.moveTo(0, yBot - bandH * (0.06 + r * 0.1));
      g.lineTo(CW, yBot - bandH * (0.06 + r * 0.1));
      g.stroke();
    }
    g.restore();
  }

  /* 合成整张纹样贴图 */
  var rawWarned = false;   // file:// 降级提示只弹一次
  function composeDecor() {
    if (!decorCtx) return;
    var g = decorCtx;
    g.clearRect(0, 0, 2048, 1024);

    var era = eraOf(state.era);
    var pat = currentPattern(era);
    if (!pat || state.finish <= 0 || maskCache[pat.id] === undefined) {
      decorTex.needsUpdate = true;
      return;
    }

    var rg = REGIONS[state.region] || REGIONS.belly;
    var dens = [0.7, 1, 1.5][state.density];

    /* file:// 降级判定：raw = 图片画布被跨域污染 / 图片加载失败（maskCache 为 null），
       两者都不能进 WebGL 纹理（否则 texImage2D 抛 SecurityError，器物从舞台消失），
       统一降级为程序化青花笔意 */
    var mc = maskCache[pat.id];
    var rawMode = !mc || !!mc.raw;
    var tile = rawMode ? null : tinted(pat, state.tone);
    if (!tile && !rawMode) { decorTex.needsUpdate = true; return; }

    g.globalAlpha = 0.95;
    if (tile) {
      if (state.region === 'all') {
        g.drawImage(bandCanvas(tile, rg.v[0], rg.v[1], dens * 1.2, 2), 0, 0);
      } else {
        g.drawImage(bandCanvas(tile, rg.v[0], rg.v[1], dens, 1), 0, 0);
        if (rg.line) drawBandLines(g, rg.v[0], rg.v[1]);
      }
    } else {
      /* file:// 降级：程序化青花笔意替代馆藏图片（按纹样分类绘制，画布干净、器物不消失） */
      /* 首次降级时弹引导提示，避免用户误以为纹样本身有问题 */
      if (!rawWarned && location.protocol === 'file:') {
        rawWarned = true;
        if (typeof flowToast === 'function') {
          flowToast('⚠ 双击直开（file://）受浏览器安全限制，馆藏纹样图无法贴坯，当前为简化笔意；请关闭页面，双击「启动工坊.bat」查看真实纹样');
        }
      }
      if (rg.line || state.region === 'all') drawBandLines(g, rg.v[0], rg.v[1]);
      drawProceduralMotif(g, rg.v[0], rg.v[1], dens, pat);
    }
    g.globalAlpha = 1;
    /* 烧制演化：窑变重绘叠加在贴图上（迭代轮次决定加深程度） */
    if (window.AIFire && lastFirePlan) {
      AIFire.repaint(decorCtx.canvas, lastFirePlan, firing ? fire.iter : Math.max(0, fire.iter - 1));
    }
    /* 一键美化层：保留用户确认过的美化结果（重绘管线不冲掉） */
    if (beautyCanvas) {
      decorCtx.drawImage(beautyCanvas, 0, 0);
    }
    decorTex.needsUpdate = true;
  }

  /* ==================== 8. 材质三态：湿坯 → 素坯 → 青花釉面 ==================== */
  var FIN = [
    { c: new THREE.Color(0x5a3a22), r: 0.92, cc: 0.0, env: 0.07 },
    { c: new THREE.Color(0xe9dfcb), r: 0.58, cc: 0.16, env: 0.6 },
    { c: new THREE.Color(0xf2f7f7), r: 0.12, cc: 1.0, env: 1.25 }
  ];

  function applyFinish(t) {
    var seg = t < 1 ? 0 : 1;
    var f = t < 1 ? t : t - 1;
    var a = FIN[seg], b = FIN[seg + 1];
    potMat.color.copy(a.c).lerp(b.c, f);
    potMat.roughness = lerp(a.r, b.r, f);
    potMat.clearcoat = lerp(a.cc, b.cc, f);
    potMat.envMapIntensity = lerp(a.env, b.env, f);
    potMat.sheen = lerp(0.08, 0.03, clamp(t, 0, 1));
    potMat.bumpScale = t < 1 ? lerp(0.012, 0.004, t) : lerp(0.004, 0.0005, t - 1);
  }

  /* 烧制参数实时预览：仅工序⑤且未开烧（fire.iter===0）时生效。
     胎质→坯色深浅/颗粒感；料浓→青花纹样浓淡；温度→高温火光预感。
     器身基础属性每帧由 applyFinish 重置，这里只需叠加偏移；
     纹样染色与自发光会残留，用 firePreviewDirty 在退出预览态时还原默认。 */
  var firePreviewDirty = false;
  function applyFirePreview() {
    if (!potMat || !decorMat) return;
    var active = flow.stage === 5 && fire.iter === 0 && fire.clay != null;
    if (!active) {
      if (firePreviewDirty) {
        decorMat.color.setScalar(1);
        potMat.emissive.setRGB(0, 0, 0);
        firePreviewDirty = false;
      }
      return;
    }
    firePreviewDirty = true;
    /* 胎质：0 粗胎（更深更糙）→ 100 细胎（更浅更细腻） */
    var ct = fire.clay / 100;
    potMat.color.multiplyScalar(0.86 + 0.26 * ct);
    potMat.roughness = Math.min(1, potMat.roughness + (1 - ct) * 0.05);
    potMat.bumpScale += (1 - ct) * 0.008;
    /* 料浓：以 55 为基准；调淡→纹样变透，调浓→青花加深 */
    var pd = (fire.pig - 55) / 45;
    decorMat.opacity *= clamp(1 + Math.min(0, pd) * 0.5, 0.45, 1);
    decorMat.color.setScalar(1 - Math.max(0, pd) * 0.3);
    /* 温度：1100℃ 起坯体渐现炽热火光，1380℃ 最明显 */
    var tt = clamp((fire.temp - 1100) / 280, 0, 1);
    potMat.emissive.setRGB(0.30 * tt, 0.10 * tt, 0.02 * tt);
  }

  function decorTargetOp() {
    return state.finish === 0 ? 0 : state.finish === 1 ? 0.62 : 1;
  }

  function setFinish(level) {
    state.finish = level;
    var pill = $('statePill');
    pill.dataset.level = String(level);
    pill.textContent = level === 0 ? '湿坯' : level === 1 ? '素坯预览' : '青花釉面';
    $('hudDot').className = 'hud-dot' + (level === 1 ? ' lv1' : level === 2 ? ' lv2' : '');
    composeDecor();
    updateHud();
  }

  /* ==================== 9. 渲染循环 ==================== */
  var lastT = 0;

  function tick(now) {
    requestAnimationFrame(tick);
    var dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
    lastT = now;

    // 相机阻尼
    cam.yaw = lerp(cam.yaw, cam.tYaw, 0.12);
    cam.pitch = lerp(cam.pitch, cam.tPitch, 0.12);
    cam.dist = lerp(cam.dist, cam.tDist, 0.1);
    var cy = Math.cos(cam.pitch);
    camera.position.set(
      Math.sin(cam.yaw) * cy * cam.dist,
      cam.targetY + Math.sin(cam.pitch) * cam.dist,
      Math.cos(cam.yaw) * cy * cam.dist
    );
    camera.lookAt(0, cam.targetY, 0);

    // 拉坯台慢转
    if (state.spinOn) {
      var w = state.spin * dt;
      potGroup.rotation.y += w;
      wheel.rotation.y += w * 1.6;
    }

    // 材质与纹样过渡
    state.finishT += (state.finish - state.finishT) * (reduceMotion ? 1 : 0.085);
    applyFinish(state.finishT);
    state.decorOp += (decorTargetOp() - state.decorOp) * (reduceMotion ? 1 : 0.09);
    decorMat.opacity = state.decorOp;
    applyFirePreview();   // 烧制参数实时预览（胎质/料浓/温度 → 器物可视反馈）

    renderer.render(scene, camera);
  }

  /* ==================== 10. 拾取与捏塑 ==================== */
  var raycaster = new THREE.Raycaster();
  var ndc = new THREE.Vector2();
  var stageEl = $('stage');
  var ringEl = $('cursorRing');
  var drag = null;

  function setNDC(ev) {
    var r = canvas.getBoundingClientRect();
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    return r;
  }

  function pickPot(ev) {
    setNDC(ev);
    raycaster.setFromCamera(ndc, camera);
    var hits = raycaster.intersectObject(potMesh, false);
    return hits.length ? hits[0] : null;
  }

  function moveRing(hit) {
    if (!hit) { ringEl.classList.remove('on'); return; }
    var v = hit.point.clone().project(camera);
    var rect = stageEl.getBoundingClientRect();
    var x = (v.x * 0.5 + 0.5) * rect.width;
    var y = (-v.y * 0.5 + 0.5) * rect.height;
    var size = state.mode === 'orbit' ? 18 : 54;
    ringEl.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
    ringEl.style.width = size + 'px';
    ringEl.style.height = size + 'px';
    ringEl.style.marginLeft = (-size / 2) + 'px';
    ringEl.style.marginTop = (-size / 2) + 'px';
    ringEl.classList.add('on');
    ringEl.classList.toggle('small', state.mode === 'orbit');
  }

  function worldPerPixel() {
    var h = canvas.clientHeight || 1;
    return 2 * cam.dist * Math.tan(camera.fov * Math.PI / 360) / h;
  }

  function indexAtY(y) {
    var best = 0, bd = 1e9;
    for (var i = 0; i <= N; i++) {
      var d = Math.abs(curY[i] - y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /* 轻量平滑，避免形变处出现尖刺 */
  function smoothDR() {
    var src = state.dR.slice(0);
    for (var i = 1; i < N; i++) {
      state.dR[i] = src[i] * 0.7 + (src[i - 1] + src[i + 1]) * 0.15;
    }
  }

  function sculptStep(centerIdx, dx, dy) {
    var wpp = worldPerPixel();

    if (state.mode === 'pinch') {
      // 捏塑：左右拖动推拉半径
      var d = dx * wpp * 1.2;
      for (var i = 0; i <= N; i++) {
        var w = Math.exp(-0.5 * Math.pow((i - centerIdx) / 7, 2));
        state.dR[i] += d * w;
      }
      smoothDR();

    } else if (state.mode === 'stretch') {
      // 拉伸：触点以上整体抬高 / 压低
      var up = -dy * wpp * 1.15;
      for (var j = 0; j <= N; j++) {
        var w2 = Math.exp(-0.5 * Math.pow((j - centerIdx) / 9, 2)) *
                 smoothstep(centerIdx - 2, centerIdx + 12, j);
        state.dY[j] = clamp(state.dY[j] + up * w2, -state.height * 0.5, state.height * 0.95);
      }

    } else if (state.mode === 'flatten') {
      // 压平：把触点附近的半径拉向局部均值
      var sum = 0, ws = 0;
      for (var a = 0; a <= N; a++) {
        var wa = Math.exp(-0.5 * Math.pow((a - centerIdx) / 8, 2));
        sum += curR[a] * wa; ws += wa;
      }
      var avg = sum / ws;
      var k = clamp((Math.abs(dx) + Math.abs(dy)) * 0.022 + 0.05, 0.05, 0.45);
      for (var b = 0; b <= N; b++) {
        var wb = Math.exp(-0.5 * Math.pow((b - centerIdx) / 8, 2));
        state.dR[b] += (avg - curR[b]) * k * wb;
      }
      smoothDR();
    }

    rebuildPot(true);
    updateHud();
  }

  /* ==================== 11. 视图与模式 ==================== */
  var TIPS = {
    pinch: '左键拖动器身 · 推拉出凹凸',
    stretch: '按住上下拖动 · 拉高或压低器身',
    flatten: '左右拖动 · 压平局部曲线',
    orbit: '拖动环视 · 滚轮缩放'
  };

  function setMode(m) {
    state.mode = m;
    Array.prototype.forEach.call($('modeDock').children, function (el) {
      el.classList.toggle('on', el.dataset.mode === m);
    });
    /* 右侧操作指引联动高亮当前模式 */
    var guide = $('modeGuide');
    if (guide) {
      Array.prototype.forEach.call(guide.querySelectorAll('.mg-row'), function (el) {
        el.classList.toggle('on', el.dataset.mode === m);
      });
    }
    stageEl.dataset.mode = m;
    $('stageTip').textContent = TIPS[m] || TIPS.pinch;
    $('stageTip').classList.remove('fade');
    canvas.style.cursor = m === 'orbit' ? 'grab' : 'crosshair';
    ringEl.classList.toggle('small', m === 'orbit');
  }

  function hideTip() { $('stageTip').classList.add('fade'); }

  function bindStage() {
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    canvas.addEventListener('pointerdown', function (ev) {
      /* 工序②「精调形制」：器形只由右侧参数滑块调节，
         鼠标捏塑 / 拉伸 / 压平停用，但「旋转观察」保留（贯穿所有工序） */
      if (flow.stage === 2) {
        if (canvas.setPointerCapture) { try { canvas.setPointerCapture(ev.pointerId); } catch (e) {} }
        drag = { kind: 'orbit', x: ev.clientX, y: ev.clientY };
        stageEl.classList.add('dragging');
        return;
      }
      hideTip();
      if (canvas.setPointerCapture) { try { canvas.setPointerCapture(ev.pointerId); } catch (e) {} }
      var hit = (ev.button === 0) ? pickPot(ev) : null;
      /* 工序③起器形已定型（shapeLocked）：即使模式残留非观察态，拖拽器身也只旋转，
         不再触发捏塑/拉伸/压平等任何形变，保证后续工序器形稳定 */
      var shapeLocked = flow.stage >= 3;
      if (ev.button === 0 && hit && state.mode !== 'orbit' && !shapeLocked) {
        drag = { kind: 'sculpt', x: ev.clientX, y: ev.clientY, idx: indexAtY(hit.point.y) };
        state.spinOn = false;
        ringEl.classList.remove('press');
        void ringEl.offsetWidth;          // 重启动画
        ringEl.classList.add('press');
      } else {
        drag = { kind: 'orbit', x: ev.clientX, y: ev.clientY };
      }
      stageEl.classList.add('dragging');
    });

    canvas.addEventListener('pointermove', function (ev) {
      var hit = pickPot(ev);
      if (!drag) { moveRing(hit); return; }

      var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      drag.x = ev.clientX; drag.y = ev.clientY;

      if (drag.kind === 'orbit') {
        cam.tYaw -= dx * 0.0075;
        cam.tPitch = clamp(cam.tPitch + dy * 0.006, -0.12, 0.62);
      } else {
        sculptStep(drag.idx, dx, dy);   // 工序①：实际捏塑形变即完成判定
        drag.moved = true;
        moveRing(hit);
      }
    });

    function endDrag() {
      if (drag && drag.kind === 'sculpt') {
        state.spinOn = true;
        if (drag.moved) flowShapeTouched('pinch');   // 工序① 完成判定：手动塑坯
      }
      drag = null;
      stageEl.classList.remove('dragging');
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', function () {
      if (!drag) ringEl.classList.remove('on');
    });

    canvas.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      cam.tDist = clamp(cam.tDist * (1 + ev.deltaY * 0.0012), 3.2, 13);
    }, { passive: false });
  }

  /* ==================== 12. 状态与操作 ==================== */
  function updateHud() {
    var era = eraOf(state.era);
    var sh = currentShape();
    var pat = currentPattern(era);
    $('hudShape').textContent = sh.name;
    $('hudPattern').textContent = pat ? pat.name : '素胎';
    var modeTxt = { pinch: '捏塑中', stretch: '拉伸中', flatten: '压平中', orbit: '环视观察' };
    var txt = flow.stage === 2 ? '湿坯 · 参数精修'
      : state.mode === 'orbit' ? '环视观察'
      : (state.finish === 2 ? '青花釉面' : state.finish === 1 ? '素坯预览' : '湿坯 · ' + modeTxt[state.mode]);
    $('hudState').textContent = txt;
  }

  /* 载入器型（重建参数与几何） */
  function loadShape(id) {
    var era = eraOf(state.era);
    var sh = shapeOf(era, id);
    state.shapeId = sh.id;
    state.shapeEra = state.era;   // 记住器型归属：后续换纹样朝代不改器型
    state.fam = sh.fam;
    state.params = arrToParams(sh.d);
    state.dR = new Float32Array(N + 1);
    state.dY = new Float32Array(N + 1);
    lastAppliedSnap = null;       // 换器型后，旧的「应用前快照」不再成立
    state.spinOn = true;
    cam.tYaw = 0.26;
    cam.tPitch = 0.15;
    syncShapeCards();
    syncParamUI();
    rebuildPot(false);
    updateHud();
  }

  function switchEra(id, keepFlow) {
    if (state.era === id) return;
    hideShapeRec();   // 朝代一变，旧推荐结果即失效
    /* 工序依赖检测：施纹之后切换朝代 = 回改上游（保留 keepFlow 供时光演化内部切换） */
    var upstream = !keepFlow && flow.max >= 3;
    if (upstream) flowInvalidate(3, true);
    state.era = id;
    Array.prototype.forEach.call(eraTabsEl.children, function (el) {
      var on = el.dataset.era === id;
      el.classList.toggle('on', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    var era = eraOf(id);
    /* 形制在工序② 确认后即锁定：此后（用户）换朝代只换纹样库，绝不动器形与参数
       （旧实现无条件 loadShape(era.shapes[0])，第三阶段点朝代器物会突然换型）
       时光演化 / 作品还原走 keepFlow，它们会自行 loadShape，不受此锁影响 */
    var locked = !keepFlow && (flow.stage >= 3 || !!flow.done[2]);
    var decorated = state.finish > 0;
    state.patternId = null;
    buildShapeList();
    buildPatterns();
    if (!locked) loadShape(era.shapes[0].id);
    else {
      syncShapeCards();
      syncParamUI();
      setFinish(0);          // 换朝代 = 重新施纹，旧纹样与烧制结果作废
    }
    if (decorated && !locked) applyPattern(era.patterns[0]);
    else { syncPatternCards(); updateHud(); }
    if (upstream) {
      flowToast('朝代已切换 —— 纹样库已换成' + era.name + '，器形保持锁定不变，请重新施纹绘彩。');
    }
  }

  function applyPattern(pat) {
    if (!pat) return;
    state.patternId = pat.id;
    syncPatternCards();
    updateHud();
    loadMask(pat, function (m) {
      /* m 为 null（图片加载失败，常见于 file:// 直开）也继续：
         composeDecor 会自动降级为程序化青花笔意，保证点击必有可见效果 */
      if (state.patternId !== pat.id) return;
      if (state.finish === 0) setFinish(1);
      else composeDecor();
      flowPatternDone();   // 工序③ 完成判定：纹样成功映射到器身
    });
  }

  /* —— 作品 3D 导出：把当前器身（坯体 + 纹样覆盖层）写成 OBJ + MTL 文件 ——
     导出的两个文件放在同一文件夹，可用 Windows「3D 查看器」/ Blender 等直接打开 */
  function geomToOBJ(name, mesh, faces) {
    var pos = mesh.geometry.attributes.position;
    var idx = mesh.geometry.index;
    var out = 'o ' + name + '\n';
    var i;
    for (i = 0; i < pos.count; i++) {
      out += 'v ' + pos.getX(i).toFixed(4) + ' ' + pos.getY(i).toFixed(4) + ' ' + pos.getZ(i).toFixed(4) + '\n';
    }
    if (idx) {
      for (i = 0; i < idx.count; i += 3) {
        out += 'f ' + (idx.getX(i) + 1 + faces.v) + ' ' + (idx.getX(i + 1) + 1 + faces.v) + ' ' + (idx.getX(i + 2) + 1 + faces.v) + '\n';
      }
    } else {
      for (i = 0; i < pos.count; i += 3) {
        out += 'f ' + (i + 1 + faces.v) + ' ' + (i + 2 + faces.v) + ' ' + (i + 3 + faces.v) + '\n';
      }
    }
    faces.v += pos.count;   // 累计顶点偏移，第二个物体索引接续编号
    return out;
  }
  function saveText(name, text) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function exportWork3D() {
    if (!potMesh || !decorMesh) { flowToast('器身尚未生成，无法导出 3D 模型。'); return; }
    var faces = { v: 0 };
    var obj = '# 青花瓷数字工坊 · 3D 作品导出\nmtllib work.mtl\n' +
      geomToOBJ('pot_body', potMesh, faces) +
      geomToOBJ('pot_decor', decorMesh, faces);
    var mtl = 'newmtl porcelain_white\nKd 0.93 0.91 0.86\nKa 0.2 0.2 0.2\nNs 60\n\n' +
      'newmtl cobalt_blue\nKd 0.13 0.27 0.52\nKa 0.1 0.1 0.15\nNs 30\n';
    var title = ($('pvTitle').textContent || '青花作品').replace(/[\\/:*?"<>|\s]+/g, '_');
    saveText(title + '.obj', obj);
    setTimeout(function () { saveText(title + '.mtl', mtl); }, 350);
    flowToast('已导出 3D 模型（OBJ + MTL 两个文件）—— 放同一文件夹后，用「3D 查看器」或 Blender 打开。');
  }

  /* ==================== 作品集：本机多档案（每个用户独立、可选口令加密） ====================
     纯静态站点没有后端，无法做跨设备登录；这里用「本机档案 + 口令加密」做用户隔离：
       · 每个档案一份独立作品集（localStorage: bw_works:<档案id>），彼此不可见；
       · 设了口令的档案，作品用 AES-GCM 加密后落盘，没有口令连控制台里看到的都是密文；
       · 默认「本机访客」档案无口令，方便直接演示；清浏览器数据会丢失。
     —— 换设备同步/真正账号体系需要后端，后续可在此基础上接。 */
  var PROFILE_LIST_KEY = 'bw_profiles';
  var ACTIVE_PROFILE_KEY = 'bw_active_profile';
  var profiles = [];
  var activeProfile = null;
  var sessionKey = null;       // 当前解锁档案的 AES 密钥（仅内存，刷新即失效）
  var worksCache = [];         // 当前档案的作品（内存镜像）
  var pendingProfile = null;   // 待解锁档案

  function escHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hasCrypto() {
    return !!(window.crypto && window.crypto.subtle && window.crypto.getRandomValues && window.TextEncoder);
  }
  function b64(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  }
  function unb64(s) {
    var bin = atob(s), b = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b;
  }
  function deriveKey(pass, saltB64) {
    var enc = new TextEncoder();
    return window.crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return window.crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: unb64(saltB64), iterations: 120000, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
  }
  function encryptJSON(key, obj) {
    var iv = window.crypto.getRandomValues(new Uint8Array(12));
    return window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key,
      new TextEncoder().encode(JSON.stringify(obj)))
      .then(function (ct) { return { iv: b64(iv), ct: b64(ct) }; });
  }
  function decryptJSON(key, payload) {
    return window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(payload.iv) }, key, unb64(payload.ct))
      .then(function (pt) { return JSON.parse(new TextDecoder().decode(pt)); });
  }

  function persistProfiles() {
    try { localStorage.setItem(PROFILE_LIST_KEY, JSON.stringify(profiles)); } catch (e) { /* 静默 */ }
  }
  function worksKeyOf(p) { return 'bw_works:' + p.id; }
  function profileLocked() { return !!(activeProfile && activeProfile.enc && !sessionKey); }

  function loadWorksForActive() {
    worksCache = [];
    if (!activeProfile) return Promise.resolve();
    var raw = null;
    try { raw = localStorage.getItem(worksKeyOf(activeProfile)); } catch (e) { return Promise.resolve(); }
    if (!raw) return Promise.resolve();
    var obj;
    try { obj = JSON.parse(raw); } catch (e) { return Promise.resolve(); }
    if (Array.isArray(obj)) { worksCache = obj; return Promise.resolve(); }          // 旧版明文数组
    if (obj && obj.works && !obj.enc) { worksCache = obj.works; return Promise.resolve(); }
    if (obj && obj.enc) {
      if (!sessionKey) return Promise.resolve();                                    // 锁定：不泄露
      return decryptJSON(sessionKey, obj).then(function (data) {
        worksCache = (data && data.works) || [];
      }).catch(function () { worksCache = []; });
    }
    return Promise.resolve();
  }
  function saveWorks() {
    if (!activeProfile) return Promise.resolve();
    if (profileLocked()) {
      flowToast('当前档案已加密锁定，作品未保存 —— 请到「作品集」输入口令解锁后再保存。');
      return Promise.resolve();
    }
    var key = worksKeyOf(activeProfile);
    if (activeProfile.enc && sessionKey && hasCrypto()) {
      return encryptJSON(sessionKey, { works: worksCache }).then(function (payload) {
        payload.enc = true;
        try { localStorage.setItem(key, JSON.stringify(payload)); }
        catch (e) { flowToast('作品保存失败：浏览器存储空间不足，可先删除旧作品。'); }
      });
    }
    try { localStorage.setItem(key, JSON.stringify({ works: worksCache })); }
    catch (e) { flowToast('作品保存失败：浏览器存储空间不足，可先删除旧作品。'); }
    return Promise.resolve();
  }
  function setActiveProfile(p) {
    activeProfile = p;
    try { localStorage.setItem(ACTIVE_PROFILE_KEY, p.id); } catch (e) { /* 静默 */ }
    updateUserLabel();
    return loadWorksForActive().then(renderWorks);
  }
  function createProfile(name, pass) {
    name = (name || '').trim() || '未命名档案';
    var p = { id: 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6), name: name.slice(0, 12), createdAt: Date.now(), enc: false };
    if (!pass || !hasCrypto()) {
      profiles.push(p); persistProfiles();
      sessionKey = null;
      return setActiveProfile(p);
    }
    p.salt = b64(window.crypto.getRandomValues(new Uint8Array(16)));
    return deriveKey(pass, p.salt).then(function (key) {
      return encryptJSON(key, { ok: 1 }).then(function (check) {
        p.check = check;
        p.enc = true;
        profiles.push(p); persistProfiles();
        sessionKey = key;
        return setActiveProfile(p);
      });
    });
  }
  function unlockProfile(p, pass) {
    if (!p.enc) { sessionKey = null; return setActiveProfile(p).then(function () { return true; }); }
    if (!hasCrypto()) return Promise.resolve(false);
    return deriveKey(pass, p.salt).then(function (key) {
      return decryptJSON(key, p.check).then(function (chk) {
        if (!chk || !chk.ok) return false;
        sessionKey = key;
        return setActiveProfile(p).then(function () { return true; });
      }).catch(function () { return false; });
    }).catch(function () { return false; });
  }

  function updateUserLabel() {
    var el = $('wmUserName');
    if (!el) return;
    var locked = profileLocked();
    el.textContent = (activeProfile ? activeProfile.name : '—') + (locked ? ' · 已锁定' : '');
    el.classList.toggle('locked', locked);
  }

  /* —— 作品集：查看 / 打开（在 3D 舞台还原作品）/ 删除 —— */
  function renderWorks() {
    var el = $('wmList');
    if (profileLocked()) {
      el.innerHTML = '<p class="wm-empty">🔒 当前档案已加密锁定 —— 点上方「切换 / 新建」，输入口令后即可查看本档案作品。</p>';
      return;
    }
    var lib = worksCache.slice().reverse();
    if (!lib.length) {
      el.innerHTML = '<p class="wm-empty">暂无作品 —— 在第六阶段点「生成青花成品」会自动存入当前档案（仅你可见）。</p>';
      return;
    }
    el.innerHTML = lib.map(function (w, i) {
      return '<figure class="wm-item">' +
        '<img src="' + escHTML(w.url) + '" alt="' + escHTML(w.title) + '">' +
        '<figcaption><b>' + escHTML(w.title) + '</b><span>' + escHTML(w.category || '') + '</span>' +
        '<div class="wm-tags">' + (w.tags || []).map(function (t) { return '<i>' + escHTML(t) + '</i>'; }).join('') + '</div>' +
        '<div class="wm-acts"><button type="button" data-open="' + i + '">打开</button>' +
        '<button type="button" data-del="' + i + '">删除</button></div></figcaption></figure>';
    }).join('');
  }
  /* 打开作品：把归档时的朝代/器型参数/纹样快照还原到 3D 舞台 */
  function restoreWork(w) {
    if (!w || !w.snap) { flowToast('该作品缺少三维快照，无法打开。'); return; }
    var s = w.snap;
    if (state.era !== s.era) switchEra(s.era, true);   // keepFlow：避免误触发上游重置
    var era = eraOf(s.era);
    state.shapeId = s.shapeId;
    state.shapeEra = s.era;
    state.params = JSON.parse(JSON.stringify(s.params || {}));
    state.region = s.region;
    state.density = s.density;
    state.tone = s.tone;
    syncShapeCards();
    syncParamUI();
    syncRegionUI();
    syncDensityUI();
    syncToneUI();
    rebuildPot(false);
    setFinish(2);
    var pat = patternOf(era, s.patternId) || findPatternAnywhere(s.patternId);
    if (pat) applyPattern(pat); else composeDecor();
    /* 成品预览卡同步为归档信息 */
    $('pv').classList.add('ready');
    $('pvThumb').innerHTML = '<img src="' + w.url + '" alt="' + w.title + '">';
    $('pvTitle').textContent = w.title;
    $('pvSub').textContent = (w.category || '') + ' · 作品库还原';
    var tg = $('pvTags');
    tg.innerHTML = (w.tags || []).map(function (t) { return '<i>' + t + '</i>'; }).join('');
    tg.hidden = !(w.tags || []).length;
    $('pvDl').hidden = false;
    state.workURL = w.url;
    $('worksModal').hidden = true;
    flowGoto(6);
    flowToast('作品「' + w.title + '」已在三维舞台打开，可继续烧制迭代或重新保存。');
  }

  /* 档案面板：列出本机档案，切换需口令；新建档案可设口令 */
  function renderAuthList() {
    var box = $('wmAuthList');
    if (!box) return;
    box.innerHTML = profiles.map(function (p) {
      var on = activeProfile && p.id === activeProfile.id;
      var locked = on && p.enc && !sessionKey;
      var lockTxt = p.enc ? '🔒 有口令' : '无口令';
      var right = (on && !locked)
        ? '<em>当前</em>'
        : '<button type="button" data-enter="' + p.id + '">' + (locked ? '解锁' : '进入') + '</button>';
      return '<div class="wm-profile' + (on ? ' on' : '') + '">' +
        '<b>' + escHTML(p.name) + '</b><i>' + lockTxt + '</i>' + right +
        '</div>';
    }).join('');
  }
  function toggleAuth(show) {
    var box = $('wmAuth');
    if (!box) return;
    var willShow = show == null ? box.hidden : show;
    box.hidden = !willShow;
    if (willShow) {
      renderAuthList();
      $('wmAuthForm').hidden = true;
      $('wmUnlock').hidden = true;
      $('wmUnlockNote').textContent = '';
      /* 当前档案若处于加密锁定态，直接展开口令输入，省一步点击 */
      if (profileLocked()) {
        pendingProfile = activeProfile;
        $('wmUnlock').hidden = false;
        $('wmUnlockNote').textContent = '档案「' + activeProfile.name + '」已加密，请输入口令解锁。';
      }
    }
  }
  function openWorks() {
    renderWorks();
    updateUserLabel();
    $('worksModal').hidden = false;
    if (profileLocked()) toggleAuth(true);
  }
  (function bindWorks() {
    var modal = $('worksModal');
    /* 作品集入口只在工序①（顶栏按钮，data-flow=1）；末阶段入口已按需求去掉 */
    var topBtn = $('worksTopBtn');
    if (topBtn) topBtn.addEventListener('click', openWorks);
    $('wmClose').addEventListener('click', function () { modal.hidden = true; });
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.hidden = true; });

    $('wmSwitchUser').addEventListener('click', function () { toggleAuth(); });
    $('wmAuthClose').addEventListener('click', function () { toggleAuth(false); });

    $('wmAuthList').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-enter]');
      if (!b) return;
      var p = null;
      for (var i = 0; i < profiles.length; i++) if (profiles[i].id === b.getAttribute('data-enter')) p = profiles[i];
      if (!p) return;
      if (!p.enc) { unlockProfile(p, ''); return; }
      pendingProfile = p;
      $('wmAuthForm').hidden = true;
      $('wmUnlock').hidden = false;
      $('wmUnlockPass').value = '';
      $('wmUnlockNote').textContent = '档案「' + p.name + '」已设口令，请输入口令解锁。';
      $('wmUnlockPass').focus();
    });
    $('wmUnlockOk').addEventListener('click', function () {
      if (!pendingProfile) return;
      var pass = $('wmUnlockPass').value;
      unlockProfile(pendingProfile, pass).then(function (ok) {
        if (!ok) { $('wmUnlockNote').textContent = '口令不正确，请重试。'; return; }
        $('wmUnlock').hidden = true;
        pendingProfile = null;
        toggleAuth(false);
        renderWorks();
        flowToast('已进入档案「' + activeProfile.name + '」，作品集仅本档案可见。');
      });
    });
    $('wmUnlockPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('wmUnlockOk').click(); });

    $('wmNewUser').addEventListener('click', function () {
      $('wmUnlock').hidden = true;
      $('wmAuthForm').hidden = false;
      $('wmAuthName').value = '';
      $('wmAuthPass').value = '';
      $('wmAuthPass2').value = '';
      $('wmAuthNote').textContent = hasCrypto() ? '' : '当前环境不支持加密，将按无口令档案保存。';
      $('wmAuthName').focus();
    });
    $('wmAuthCancel').addEventListener('click', function () { $('wmAuthForm').hidden = true; $('wmAuthNote').textContent = ''; });
    $('wmAuthOk').addEventListener('click', function () {
      var name = $('wmAuthName').value.trim();
      var p1 = $('wmAuthPass').value, p2 = $('wmAuthPass2').value;
      if (!name) { $('wmAuthNote').textContent = '请填写档案名。'; return; }
      if (p1 !== p2) { $('wmAuthNote').textContent = '两次输入的口令不一致。'; return; }
      if (p1 && p1.length < 4) { $('wmAuthNote').textContent = '口令至少 4 位。'; return; }
      createProfile(name, p1).then(function () {
        $('wmAuthForm').hidden = true;
        toggleAuth(false);
        renderWorks();
        flowToast('档案「' + activeProfile.name + '」已创建' + (p1 ? '（口令加密）' : '') + '，作品只保存在这个档案里。');
      });
    });

    $('wmList').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (profileLocked()) return;
      if (b.hasAttribute('data-open')) {
        var i = +b.getAttribute('data-open');
        restoreWork(worksCache[worksCache.length - 1 - i]);   // 列表为倒序展示，映射回原数组
      } else if (b.hasAttribute('data-del')) {
        worksCache.splice(worksCache.length - 1 - (+b.getAttribute('data-del')), 1);
        saveWorks();
        renderWorks();
      }
    });
    /* 「保存作品」由图片下载改为 3D 模型导出 */
    $('pvDl').addEventListener('click', function (e) { e.preventDefault(); exportWork3D(); });
  })();

  /* 启动时初始化本机档案：没有档案就建一个「本机访客」，并把旧版单一作品库迁进来 */
  function initWorks() {
    try { profiles = JSON.parse(localStorage.getItem(PROFILE_LIST_KEY) || '[]') || []; } catch (e) { profiles = []; }
    if (!Array.isArray(profiles)) profiles = [];
    if (!profiles.length) {
      var guest = { id: 'guest', name: '本机访客', createdAt: Date.now(), enc: false };
      profiles = [guest];
      persistProfiles();
      try {
        var legacy = localStorage.getItem('bw_works');
        if (legacy) {
          localStorage.setItem('bw_works:guest', JSON.stringify({ works: JSON.parse(legacy) }));
          localStorage.removeItem('bw_works');
        }
      } catch (e) { /* 静默 */ }
      try { localStorage.setItem(ACTIVE_PROFILE_KEY, 'guest'); } catch (e) { /* 静默 */ }
    }
    var aid = null;
    try { aid = localStorage.getItem(ACTIVE_PROFILE_KEY); } catch (e) { /* 静默 */ }
    var p = null;
    for (var i = 0; i < profiles.length; i++) if (profiles[i].id === aid) p = profiles[i];
    activeProfile = p || profiles[0];
    sessionKey = null;            // 加密档案刷新后默认锁定
    updateUserLabel();
    loadWorksForActive().then(function () { renderWorks(); });
  }

  /* 重置：保留朝代与器型，清空捏塑与纹样 */
  function resetAll() {
    var sh = currentShape();
    state.params = arrToParams(sh.d);
    state.dR = new Float32Array(N + 1);
    state.dY = new Float32Array(N + 1);
    lastAppliedSnap = null;
    state.patternId = null;
    state.region = 'belly';
    state.density = 1;
    state.tone = 0;
    state.spinOn = true;
    cam.tYaw = 0.26; cam.tPitch = 0.15;
    /* 同步复位烧制状态 */
    fire.iter = 0;
    lastFirePlan = null;
    fireSnap = null;
    beautyCanvas = null;
    beautyCount = 0;
    lastFinalAp = null;
    $('evoStory').hidden = true;
    evoSnap = null;
    $('evoBack').disabled = true;
    syncFireUI();
    syncParamUI();
    syncPatternCards();
    syncRegionUI();
    syncDensityUI();
    syncToneUI();
    setFinish(0);
    rebuildPot(false);
    $('pvThumb').innerHTML = '<span>尚未出窑</span>';
    $('pv').classList.remove('ready');   // 收起成品预览卡（工序⑥未出窑时不显示「待烧制」占位）
    $('pvTitle').textContent = '待烧制';
    $('pvSub').textContent = '选纹样 · 生成成品';
    $('pvTags').hidden = true;
    $('pvDl').hidden = true;
    $('appraiseCard').hidden = true;
    state.workURL = '';
    flowReset();   // 工序流程同步重置：清空进度记录与烧制计数，回到择朝塑坯
  }

  /* 随机搭配：形制锁定后只随机纹样组合，器形与捏塑一律不动 */
  function randomAll() {
    var era = eraOf(state.era);
    var locked = flow.stage >= 3 || !!flow.done[2];
    /* 避开当前纹样，否则「随机」点下去可能什么都没变 */
    var pool = era.patterns.filter(function (p) { return p.id !== state.patternId; });
    var pat = pool.length ? pool[Math.floor(Math.random() * pool.length)] : era.patterns[0];

    state.region = ['belly', 'belly', 'shoulder', 'all', 'neck'][Math.floor(Math.random() * 5)];
    state.density = Math.floor(Math.random() * 3);
    state.tone = Math.floor(Math.random() * 3);

    if (!locked) {
      var sh = era.shapes[Math.floor(Math.random() * era.shapes.length)];
      loadShape(sh.id);
      PKEYS.forEach(function (k) {
        state.params[k] = clamp(state.params[k] + (Math.random() - 0.5) * 16, 8, 94);
      });
      syncParamUI();
      rebuildPot(false);
    }
    syncRegionUI();
    syncDensityUI();
    syncToneUI();
    flowInvalidate(3, true);   // 随机搭配 = 重新施纹：清掉旧烧制依赖
    applyPattern(pat);
  }

  /* ==================== 13. 成品生成与导出 ==================== */
  function captureWork(pat) {
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    renderer.render(scene, camera);

    var gl = renderer.domElement;
    var cw = 900, ch = 1200;
    var c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    var g = c.getContext('2d');

    // 背景
    var bg = g.createLinearGradient(0, 0, 0, ch);
    bg.addColorStop(0, '#241b14');
    bg.addColorStop(0.52, '#2f231a');
    bg.addColorStop(1, '#0c0907');
    g.fillStyle = bg;
    g.fillRect(0, 0, cw, ch);

    var glow = g.createRadialGradient(cw / 2, 430, 40, cw / 2, 430, 560);
    glow.addColorStop(0, 'rgba(255,214,166,.26)');
    glow.addColorStop(1, 'rgba(255,214,166,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, cw, ch);

    // 按投影包围盒裁剪器物
    var box = new THREE.Box3().setFromObject(potMesh);
    var mn = box.min, mx = box.max;
    var corners = [
      [mn.x, mn.y, mn.z], [mx.x, mn.y, mn.z], [mn.x, mx.y, mn.z], [mx.x, mx.y, mn.z],
      [mn.x, mn.y, mx.z], [mx.x, mn.y, mx.z], [mn.x, mx.y, mx.z], [mx.x, mx.y, mx.z]
    ];
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    corners.forEach(function (p) {
      var v = new THREE.Vector3(p[0], p[1], p[2]).project(camera);
      var sx = (v.x * 0.5 + 0.5) * gl.width;
      var sy = (-v.y * 0.5 + 0.5) * gl.height;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx);
      y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    });
    var pad = Math.max(16, (x1 - x0) * 0.08);
    x0 = clamp(x0 - pad, 0, gl.width);
    x1 = clamp(x1 + pad, 0, gl.width);
    y0 = clamp(y0 - pad * 0.4, 0, gl.height);
    y1 = clamp(y1 + pad * 0.4, 0, gl.height);
    var sw = Math.max(1, x1 - x0), sh = Math.max(1, y1 - y0);

    var dw = cw * 0.78, dh = dw * (sh / sw);
    if (dh > 760) { dh = 760; dw = dh * (sw / sh); }
    g.drawImage(gl, x0, y0, sw, sh, (cw - dw) / 2, 160, dw, dh);

    // 文字
    g.textAlign = 'center';
    g.fillStyle = '#f3ead9';
    g.font = '600 42px "Songti SC", "STSong", "SimSun", serif';
    g.fillText('青 花 · ' + currentShape().name, cw / 2, 1024);

    g.fillStyle = 'rgba(200,169,107,.86)';
    g.font = '16px "PingFang SC", "Microsoft YaHei", sans-serif';
    g.fillText(
      eraOf(state.era).name + ' · ' + pat.name + ' · ' + REGION_LABEL[state.region] + ' · ' + DENSITY[state.density],
      cw / 2, 1064
    );

    g.strokeStyle = 'rgba(200,169,107,.45)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(cw / 2 - 96, 1092);
    g.lineTo(cw / 2 + 96, 1092);
    g.stroke();

    // 印章
    g.fillStyle = 'rgba(168,50,60,.92)';
    g.fillRect(cw / 2 - 25, 1112, 50, 50);
    g.fillStyle = '#f7f0e4';
    g.font = '600 27px "Songti SC", "SimSun", serif';
    g.fillText('青', cw / 2, 1148);

    g.fillStyle = 'rgba(230,220,204,.34)';
    g.font = '12px "PingFang SC", "Microsoft YaHei", sans-serif';
    g.fillText('青花 AI 制作工坊 · 传智杯国赛作品', cw / 2, 1182);

    // 暗角
    var vg = g.createRadialGradient(cw / 2, ch / 2, 320, cw / 2, ch / 2, 720);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.42)');
    g.fillStyle = vg;
    g.fillRect(0, 0, cw, ch);

    return c.toDataURL('image/jpeg', 0.92);
  }

  function generateWork() {
    if (state.busy) return;
    var era = eraOf(state.era);
    var pat = currentPattern(era) || era.patterns[0];   // 兼容 AI 生成纹样（gen-N 不在馆藏池）
    var btn = $('makeBtn');
    state.busy = true;
    btn.classList.add('busy');
    btn.querySelector('span').textContent = '窑火中 · 出窑…';

    if (!state.patternId) applyPattern(pat);
    setFinish(2);
    cam.tYaw = 0.1;
    cam.tPitch = 0.12;

    setTimeout(function () {
      try {
        var url = captureWork(pat);
        state.workURL = url;
        $('pvThumb').innerHTML = '<img src="' + url + '" alt="青花成品">';
        $('pv').classList.add('ready');   // 出窑后展开成品预览卡
        $('pvTitle').textContent = '青花 · ' + currentShape().name;
        $('pvSub').textContent = era.name + ' · ' + pat.name + ' · ' + REGION_LABEL[state.region];
        var dl = $('pvDl');
        dl.hidden = false;
        dl.href = url;
        dl.download = '青花_' + era.name + '_' + currentShape().name + '_' + pat.name + '.jpg';

        /* AI 作品归档：自动题名 + 分类 + 标签 + 本地作品库 */
        if (window.AIFire) {
          AIFire.run('works_tagging', {
            dynasty: era.name,
            shape: currentShape().name,
            pattern: pat.name,
            fire_mode: lastFirePlan ? lastFirePlan.fire_mode : '常规烧制',
            score: lastFinalAp ? lastFinalAp.total_score : 80,
            free: $('ascFree') ? $('ascFree').checked : false
          }).then(function (tag) {
            $('pvTitle').textContent = tag.title;
            $('pvSub').textContent = tag.category + ' · ' + era.name + ' · ' + pat.name;
            var tg = $('pvTags');
            tg.innerHTML = tag.tags.map(function (t) { return '<i>' + t + '</i>'; }).join('');
            tg.hidden = false;
            /* 存入当前档案的作品集（仅本档案可见，加密档案落盘为密文） */
            if (profileLocked()) {
              flowToast('当前档案已加密锁定，作品未保存 —— 请到「作品集」输入口令解锁后再生成成品。');
            } else {
              worksCache.push({ title: tag.title, category: tag.category, tags: tag.tags, note: tag.archive_note, url: url, time: Date.now(),
                /* 三维快照：作品集「打开」时据此在 3D 舞台还原该作品 */
                snap: { era: state.era, shapeId: state.shapeId, params: JSON.parse(JSON.stringify(state.params)),
                        patternId: state.patternId, region: state.region, density: state.density, tone: state.tone } });
              saveWorks();
            }
          });
        }
      } catch (err) {
        $('pvSub').textContent = '画面截取失败，可稍后重试';
      }
      btn.classList.remove('busy');
      btn.querySelector('span').textContent = '生成青花成品';
      state.busy = false;
      flowArchiveDone();   // 工序⑥：作品已题名入库
    }, 1000);
  }

  /* ==================== 14. 界面事件 ==================== */
  function bindUI() {
    shapeListEl.addEventListener('click', function (ev) {
      var b = ev.target.closest('.shape-card');
      if (!b) return;
      hideShapeRec();   // 手动点选器型后，旧推荐卡不再对应当前坯体，收起
      /* 工序依赖检测：施纹之后更换器型 = 回改上游，自动重置纹样与烧制 */
      var upstream = flow.max >= 3 && state.shapeId !== b.dataset.id;
      if (upstream) flowInvalidate(3, true);
      loadShape(b.dataset.id);
      flowShapeTouched('card');   // 工序① 完成判定：点选器型即成坯
      if (upstream) flowToast('器型已更换 —— 纹样与烧制结果已重置，请重新施纹绘彩。');
    });

    patternListEl.addEventListener('click', function (ev) {
      var b = ev.target.closest('.pattern-card');
      if (!b) return;
      var pat = patternOf(eraOf(state.era), b.dataset.id);
      if (pat) { applyPattern(pat); runAdaptCheck(pat); }
    });

    regionListEl.addEventListener('click', function (ev) {
      var b = ev.target.closest('.region-btn');
      if (!b || !b.dataset.region) return;   // 「款识」入口按钮有独立点击逻辑，不走区域选择
      state.region = b.dataset.region;
      syncRegionUI();
      if (!state.patternId) applyPattern(eraOf(state.era).patterns[0]);
      else {
        if (state.finish === 0) setFinish(1);
        composeDecor();
      }
    });

    densityListEl.addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-d]');
      if (!b) return;
      state.density = +b.dataset.d;
      syncDensityUI();
      if (state.finish > 0) composeDecor();
    });

    toneListEl.addEventListener('click', function (ev) {
      var b = ev.target.closest('.tone-btn');
      if (!b) return;
      state.tone = +b.dataset.tone;
      syncToneUI();
      if (state.finish > 0) composeDecor();
    });

    $('modeDock').addEventListener('click', function (ev) {
      var b = ev.target.closest('.mode-btn');
      if (b) setMode(b.dataset.mode);
    });

    paramListEl.addEventListener('input', function (ev) {
      var inp = ev.target;
      var k = inp.dataset.k;
      if (!k) return;
      var v = +inp.value;
      state.params[k] = v;
      lastAppliedSnap = null;      // 手动改过参数，「保持原样」不再回溯到上次应用
      inp.style.setProperty('--p', v + '%');
      var def = null;
      for (var i = 0; i < PDEFS.length; i++) if (PDEFS[i].k === k) def = PDEFS[i];
      var lab = paramListEl.querySelector('[data-v="' + k + '"]');
      if (lab && def) lab.textContent = def.fmt(v);
      $('mH').textContent = P.h(state.params.h).toFixed(1);
      $('mD').textContent = P.belly(state.params.belly).toFixed(1);
      rebuildPot(true);
      quickRiskCheck();
    });

    $('resetParams').addEventListener('click', function () {
      var sh = currentShape();
      state.params = arrToParams(sh.d);
      state.dR = new Float32Array(N + 1);
      state.dY = new Float32Array(N + 1);
      lastAppliedSnap = null;     // 参数已归位，不能再回退到上次应用
      syncParamUI();
      rebuildPot(false);
    });

    $('resetBtn').addEventListener('click', resetAll);
    $('randomBtn').addEventListener('click', randomAll);
    $('makeBtn').addEventListener('click', generateWork);
    /* 工序⑥「再做一个」：清空当前作品与进度，回到工序①重新起坯 */
    $('againBtn').addEventListener('click', function () {
      resetAll();
      flowToast('✦ 已开始新的一件 —— 选器型或点「✦ AI 智能推荐器型」起坯，再走一遍六道工序。');
    });

    /* ---- AI 推荐 / 适配检测 ---- */
    $('aiRecBtn').addEventListener('click', openAIPanel);
    $('aiClose').addEventListener('click', function () { $('aiPanel').hidden = true; });
    /* 面板是浮层：点空白处或按 Esc 收起（旧版只能点右上角 ×） */
    document.addEventListener('mousedown', function (ev) {
      var p = $('aiPanel');
      if (!p || p.hidden) return;
      if (p.contains(ev.target)) return;
      if (ev.target.closest && ev.target.closest('#aiRecBtn')) return;   // 按钮自己负责开合
      p.hidden = true;
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && $('aiPanel') && !$('aiPanel').hidden) $('aiPanel').hidden = true;
    });
    $('aiTabs').addEventListener('click', function (ev) {
      var b = ev.target.closest('.ai-tab');
      if (!b) return;
      aiMode = b.dataset.mode;
      renderAIRecs();
    });
    $('aiRecList').addEventListener('click', function (ev) {
      var b = ev.target.closest('.ai-rec');
      if (!b) return;
      var pat = findPatternByName(b.dataset.name);
      if (pat) { applyPattern(pat); runAdaptCheck(pat); }
      $('aiPanel').hidden = true;
    });
    $('atClose').addEventListener('click', function () {
      $('adaptToast').hidden = true;
      clearTimeout(adaptTimer);
    });
    $('atChips').addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b) return;
      var pat = findPatternByName(b.dataset.name);
      if (pat) { applyPattern(pat); runAdaptCheck(pat); }
    });

    /* ---- AI 纹样创作：描述 → 设计 → UV 贴图 → 应用/重绘 ---- */
    $('genBtn').addEventListener('click', function () { runGenerate(); });
    $('genTheme').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); runGenerate(); }
    });
    /* 自由创作：笔意切换（写意 / 工笔 / 泼墨），只影响画法，不提供现成纹样 */
    $('genStyleChips').addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-style]');
      if (!b) return;
      Array.prototype.forEach.call($('genStyleChips').children, function (el) {
        el.classList.toggle('on', el === b);
      });
    });
    $('genApply').addEventListener('click', function () {
      if (!lastGen) return;
      applyGenerated(lastGen.canvas, lastGen.meta);
      runAdaptCheck({ name: lastGen.meta.name });
      $('aiPanel').hidden = true;
    });
    $('genRedraw').addEventListener('click', function () {
      runGenerate((Math.random() * 1e9) | 0);
    });

    /* ---- 器型智能辅助 ---- */
    $('aiShapeBtn').addEventListener('click', function () { runShapeRecommend(); });
    $('aiReshapeBtn').addEventListener('click', runReshape);
    $('ascApply').addEventListener('click', applyReshape);
    $('ascReject').addEventListener('click', rejectReshape);
    /* 结果卡会盖住右栏的「✦ AI 重塑」按钮，卡内提供「↻ 重评」入口，避免再次点击落空
       （元素缺失时跳过，避免旧缓存 HTML 导致后续绑定整体失效） */
    var ascAgainBtn = $('ascAgain');
    if (ascAgainBtn) ascAgainBtn.addEventListener('click', runReshape);
    $('ascClose').addEventListener('click', function () { $('aiShapeCard').hidden = true; });
    /* 推荐结果卡：换一个 / 关闭 / 直接定下此形进入工序② */
    $('shapeRecAgain').addEventListener('click', function () { runShapeRecommend(); });
    $('shapeRecClose').addEventListener('click', hideShapeRec);
    $('shapeRecGo').addEventListener('click', function () {
      flowShapeTouched('ai');   // 兜底：结果卡存在即已起坯，确保「下一步」已解锁
      if (flow.max < 2) return; // 极端情况下不硬跳
      hideShapeRec();
      flowGoto(2);
    });

    /* AI 模块自检：任一引擎缺失时给出可见提示，避免按钮静默无反应 */
    setTimeout(function () {
      var need = { AIAdvisor: '纹样 AI 推荐', AIShape: '器型智能辅助', AITexture: 'AI 纹样生成', AIFire: 'AI 烧制', AIRitual: '开窑仪式' };
      var miss = [], k;
      for (k in need) if (!window[k]) miss.push(need[k]);
      if (miss.length) aiMissing(miss.join('、'));
    }, 800);

    /* ---- AI 烧制闭环 ---- */
    ['fireClay', 'firePig', 'fireTemp'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        syncFireSliders();
        $(id).style.setProperty('--p', ((+$(id).value - +$(id).min) / (+$(id).max - +$(id).min) * 100) + '%');
      });
    });
    syncFireSliders();
    /* 初始化三个烧制滑块的填充位置 */
    ['fireClay', 'firePig', 'fireTemp'].forEach(function (id) {
      var el = $(id);
      el.style.setProperty('--p', ((+el.value - +el.min) / (+el.max - +el.min) * 100) + '%');
    });
    $('fireBtn').addEventListener('click', runFiring);
    $('fireUndo').addEventListener('click', undoFire);
    $('fireReset').addEventListener('click', resetFire);
    $('apClose').addEventListener('click', function () { $('appraiseCard').hidden = true; });
    $('apBeauty').addEventListener('click', runBeauty);
    $('apUndoBeauty').addEventListener('click', cancelBeauty);

    /* ---- 工序② 精调形制：确认形制 → 解锁施纹绘彩 ---- */
    $('confirmShapeBtn').addEventListener('click', function () {
      if (flow.done[2]) { flowGoto(3); return; }   // 已确认过：跳回施纹（数据保留）
      flow.done[2] = true;
      flowSet(3, '✦ 形制已定 —— 纹样库、AI 推荐与文字生成纹样已解锁。');
    });

    /* ---- 时光演化（题款落印工序已整体移除） ---- */
    $('evoGo').addEventListener('click', runEvolve);
    $('evoBack').addEventListener('click', undoEvolve);
  }

  /* ==================== 14.5 AI 纹样推荐与适配检测 ====================
     调用 ai-advisor.js 的三套提示词引擎（统一 JSON 输出）：
     ① 朝代限定推荐 ② 自由创作推荐 ③ 纹样适配检测            */
  var aiMode = 'dynasty';
  var adaptTimer = null;

  /* 汇总全部朝代纹样注册进推荐引擎（含所属朝代，供自由创作跨朝代取用） */
  function poolAll() {
    var out = [];
    ERAS.forEach(function (e) {
      e.patterns.forEach(function (p) {
        out.push({ id: p.id, name: p.name, src: p.src, thumb: p.thumb, eraId: e.id, eraName: e.name });
      });
    });
    return out;
  }

  /* 按名称在全部纹样中查找（推荐项以名称返回，可能是跨朝代纹样） */
  function findPatternByName(name) {
    for (var i = 0; i < ERAS.length; i++) {
      var ps = ERAS[i].patterns;
      for (var j = 0; j < ps.length; j++) if (ps[j].name === name) return ps[j];
    }
    return null;
  }

  /* 当前器型的中文名（瓶 / 罐 / 碗 / 杯…），对应提示词变量 shape_type */
  function shapeCN() {
    return (window.AIAdvisor && AIAdvisor.familyCN[state.fam]) || '瓶';
  }

  function openAIPanel() {
    var panel = $('aiPanel');
    panel.hidden = !panel.hidden;
    if (!panel.hidden) renderAIRecs();
  }

  /* 渲染推荐列表：按适配分排序，含风格/区域/布局/风险/备选 */
  function renderAIRecs() {
    var era = eraOf(state.era);
    var sub = $('aiPanelSub');
    Array.prototype.forEach.call($('aiTabs').children, function (t) {
      t.classList.toggle('on', t.dataset.mode === aiMode);
    });

    /* AI 创作：「描述 → AI 设计」，不提供现成纹样选项 */
    if (aiMode === 'free') {
      $('aiRecList').hidden = true;
      $('aiGenBox').hidden = false;
      $('genStyleRow').hidden = false;
      $('genLabel').textContent = '灵感描述（诗句 / 关键词）';
      $('genBtn').textContent = '✦ AI 创作';
      $('genErr').hidden = true;
      $('genTheme').placeholder = '写一句诗或几个词，AI 自由发挥：如「春江潮水连海平」「月下松风」';
      sub.textContent = 'AI 创作 · 不限朝代 · ' +
        shapeCN() + ' · ' + ((window.AIAdvisor && AIAdvisor.regionCN[state.region]) || '腹部') +
        ' —— 描述越具体，AI 设计的纹样越贴合';
      return;
    }
    $('aiRecList').hidden = false;
    $('aiGenBox').hidden = true;

    var shape = shapeCN();
    var region = (window.AIAdvisor && AIAdvisor.regionCN[state.region]) || '腹部';
    var listEl = $('aiRecList');

    sub.textContent = era.name + ' · ' + shape + ' · ' + region + ' —— 按适配分排序';
    var pr = AIAdvisor.run('dynasty_recommend', { dynasty: era.name, shape_type: shape, decor_region: region });
    pr.then(function (json) {
      listEl.innerHTML = json.recommend_list.map(function (r) {
        var cls = r.score >= 80 ? 'hi' : r.score >= 65 ? 'mid' : 'low';
        return '<button class="ai-rec" type="button" data-name="' + r.pattern_name + '">' +
          '<span class="ar-score ' + cls + '"><b>' + r.score + '</b><i>适配分</i></span>' +
          '<span class="ar-main">' +
            '<b class="ar-name">' + r.pattern_name + '</b>' +
            '<span class="ar-desc">' + r.style_desc + '</span>' +
            '<span class="ar-meta">宜 ' + r.best_region + ' · ' + r.layout_suggest +
              (r.risk_note ? ' · ⚠ ' + r.risk_note : '') + '</span>' +
            (r.alternative && r.alternative.length ? '<span class="ar-alt">备选：' + r.alternative.join(' / ') + '</span>' : '') +
          '</span>' +
          '<span class="ar-go">应用</span>' +
          '</button>';
      }).join('');
    });
  }

  /* AI 模块缺失提示：替代静默 return，让用户知道按钮为何无反应 */
  function aiMissing(name) {
    flowToast('⚠「' + name + '」模块未能加载。请关闭页面，改用项目根目录「启动工坊.bat」重新打开；若仍无效请检查 ai-*.js 文件是否完整。');
  }

  /* 适配检测：贴纹后校验曲面适配度，低分弹提示条 + 替换候选 */
  function runAdaptCheck(pat) {
    if (!window.AIAdvisor) return aiMissing('纹样 AI 推荐');
    var shape = shapeCN();
    var region = AIAdvisor.regionCN[state.region] || '腹部';
    AIAdvisor.run('adapt_check', { selected_pattern: pat.name, shape_type: shape, decor_region: region })
      .then(function (json) {
        lastPatScore = json.score;   // 缓存适配分，供终鉴评使用
        var t = $('adaptToast');
        if (json.score >= 75) { t.hidden = true; return; }
        $('atScore').textContent = json.score;
        $('atJudge').textContent = json.judge + (json.risk_detail ? ' ' + json.risk_detail : '');
        var reps = json.suggest_replace || [];
        $('atReplace').hidden = !reps.length;
        $('atChips').innerHTML = reps.map(function (n) {
          return '<button type="button" data-name="' + n + '">' + n + '</button>';
        }).join('');
        t.hidden = false;
        clearTimeout(adaptTimer);
        adaptTimer = setTimeout(function () { t.hidden = true; }, 10000);
      }).catch(function (err) { console.warn('[AI] 适配检测失败：', err); });
  }

  /* ==================== 14.8 AI 纹样生成（文字 → UV 贴图 → 曲面映射） ====================
     调用 ai-texture.js：① 程序化生成透明背景 UV 纹样（可换远端生图接口）
     ② 按器身半径逐行预畸变校正 ③ 经 decorTex 映射到参数化网格       */
  var genSeq = 0;
  var genPatStore = {};   // 生成纹样注册表：id → {id,name,canvas}
  var lastGen = null;     // 最近一次生成结果 {canvas, meta}

  /* 器身轮廓半径采样：t 为归一化高度（0 底 1 口） */
  function radiusAtT(t) {
    var f = clamp(t, 0, 1) * N;
    var i = Math.floor(f), k = f - i;
    var a = curR[Math.min(i, N)], b = curR[Math.min(i + 1, N)];
    return a + (b - a) * k;
  }

  /* 区域曲率剖面：frac 0..1 → 该行半径 / 区域最大半径（供 UV 预拉伸） */
  function regionRadiusProfile(v0, v1) {
    var rMax = 0, i, t, r;
    for (i = 0; i <= 24; i++) {
      t = v0 + (v1 - v0) * (i / 24);
      r = radiusAtT(t);
      if (r > rMax) rMax = r;
    }
    return function (frac) {
      t = v0 + (v1 - v0) * frac;
      return rMax > 0 ? radiusAtT(t) / rMax : 1;
    };
  }

  function maskFromCanvas(src) {
    var c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    return { canvas: c, box: { x: 0, y: 0, w: c.width, h: c.height } };
  }

  /* 将生成贴图注册为虚拟纹样并贴上器身 */
  function applyGenerated(c, meta) {
    var id = 'gen-' + (++genSeq);
    genPatStore[id] = { id: id, name: meta.name, canvas: c };
    maskCache[id] = maskFromCanvas(c);
    state.patternId = id;
    if (state.finish < 1) setFinish(1);
    composeDecor();
    syncPatternCards();
    updateHud();
    flowPatternDone();   // 工序③ 完成判定：AI 生成纹样映射成功
  }

  /* 当前生效纹样：朝代库优先 → 任意朝代同名 id（AI 精选可能跨朝代取材）→ AI 生成纹样 */
  function findPatternAnywhere(id) {
    for (var i = 0; i < ERAS.length; i++) {
      var ps = ERAS[i].patterns;
      for (var j = 0; j < ps.length; j++) if (ps[j].id === id) return ps[j];
    }
    return null;
  }
  function currentPattern(era) {
    return patternOf(era, state.patternId) || findPatternAnywhere(state.patternId) ||
      genPatStore[state.patternId] || null;
  }

  /* AI 纹样创作：描述（诗句 / 关键词）→ 语义判断 → 设计 → UV 预畸变
     · 「AI 创作」页签：不限朝代，写意 / 工笔 / 泼墨 三种笔意，AI 自由构图；
     · 不提供现成纹样选项；描述与青花纹样无关时直接拒绝并要求重新输入。 */

  function currentBrush() {
    var box = $('genStyleChips');
    var on = box ? box.querySelector('button.on') : null;
    return on ? on.dataset.style : 'xieyi';
  }

  /* 题材 → 馆藏母题候选：同一题材备多件馆藏，重绘时换母题，形状才会真的不同 */
  var GEN_MOTIF = {
    dragon:   [{ era: 'yuan', id: 'yunlong' }, { era: 'qing', id: 'longfeng-qing' }, { era: 'ming', id: 'longwen' }, { era: 'tang', id: 'ruishou' }],
    cloud:    [{ era: 'ming', id: 'yunhe' }, { era: 'song', id: 'yunwen' }, { era: 'yuan', id: 'yunji' }],
    wave:     [{ era: 'yuan', id: 'haishui' }, { era: 'ming', id: 'haijiangya' }],
    hills:    [{ era: 'qing', id: 'shanshui-renwu' }, { era: 'song', id: 'shanshui' }, { era: 'yuan', id: 'renwu' }],
    vine:     [{ era: 'yuan', id: 'mudan' }, { era: 'qing', id: 'chanzhihui' }, { era: 'qing', id: 'wanhua' }, { era: 'tang', id: 'baoxiang' }, { era: 'song', id: 'songmudan' }],
    fish:     [{ era: 'yuan', id: 'yuzao' }, { era: 'ming', id: 'yuzao-ming' }],
    treasure: [{ era: 'qing', id: 'bianfu' }, { era: 'yuan', id: 'zabao' }, { era: 'ming', id: 'baxian' }],
    meander:  [{ era: 'tang', id: 'fanggewen' }, { era: 'tang', id: 'lingxing' }, { era: 'qing', id: 'loushen' }],
    scroll:   [{ era: 'tang', id: 'juancao' }, { era: 'tang', id: 'mudan-tang' }]
  };

  /* 与引擎一致的种子随机数：同一个种子选出同一组母题 */
  function seedRng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 馆藏母题边缘羽化：避免在器身上出现「贴纸方块」的硬边 */
  function featherEdges(src) {
    var w = src.width, h = src.height;
    var pad = Math.max(6, Math.round(Math.min(w, h) * 0.07));
    var mask = document.createElement('canvas');
    mask.width = w; mask.height = h;
    var mg = mask.getContext('2d');
    mg.fillStyle = '#fff';
    mg.fillRect(pad, pad, Math.max(1, w - pad * 2), Math.max(1, h - pad * 2));
    var soft = document.createElement('canvas');
    soft.width = w; soft.height = h;
    var sg = soft.getContext('2d');
    if ('filter' in sg) {
      sg.filter = 'blur(' + pad + 'px)';
      sg.drawImage(mask, 0, 0);
      sg.filter = 'none';
    } else {
      sg.drawImage(mask, 0, 0);
    }
    var out = document.createElement('canvas');
    out.width = w; out.height = h;
    var g = out.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(soft, 0, 0);
    return out;
  }

  function loadMotifCanvas(pat) {
    return new Promise(function (resolve) {
      if (!pat) { resolve(null); return; }
      loadMask(pat, function () {
        var t = null;
        try { t = tinted(pat, state.tone); } catch (e) { t = null; }
        if (t) { try { t = featherEdges(t); } catch (e) { /* 保持原图 */ } }
        resolve(t || null);
      });
    });
  }

  /* 按描述抽取 1~2 个题材，按种子从候选馆藏里挑母题（重绘会换母题 → 形状变化） */
  function motifCanvasesFor(theme, seed) {
    if (!window.AITexture || !AITexture.parseBrief) return Promise.resolve([]);
    var brief = AITexture.parseBrief(theme);
    if (!brief || !brief.ok) return Promise.resolve([]);
    var rnd = seedRng(seed);
    var pats = [];
    brief.motifs.slice(0, 2).forEach(function (cat) {
      var list = GEN_MOTIF[cat];
      if (!list || !list.length) return;
      var m = list[Math.floor(rnd() * list.length) % list.length];
      var pat = patternOf(eraOf(m.era), m.id);
      if (pat) pats.push(pat);
    });
    return Promise.all(pats.map(loadMotifCanvas)).then(function (arr) {
      return arr.filter(Boolean);
    });
  }

  function runGenerate(seed, autoApply) {
    var era = eraOf(state.era);
    var freeMode = aiMode === 'free';
    var theme = $('genTheme').value.trim();
    var rg = REGIONS[state.region] || REGIONS.belly;
    var btn = $('genBtn');
    var errEl = $('genErr');
    var oldLabel = freeMode ? '✦ AI 创作' : '生成纹样';
    var sd = (seed != null) ? seed : ((Math.random() * 1e9) | 0);   // 每次创作/重绘都换构图与母题

    errEl.hidden = true;
    btn.disabled = true;
    btn.textContent = freeMode ? '创作中…' : '生成中…';

    motifCanvasesFor(theme, sd).then(function (motifs) {
      return AITexture.generate({
        dynasty: freeMode ? '' : era.name,
        free: freeMode,
        brush: freeMode ? currentBrush() : '',
        theme: theme,
        motifs: motifs,
        region: state.region,
        shape: shapeCN(),
        layout: $('genLayout').value,
        tone: TONES[state.tone].css,
        seed: sd
      });
    }).then(function (res) {
      btn.disabled = false;
      btn.textContent = oldLabel;
      if (!res || res.rejected) {
        errEl.textContent = '⚠ ' + ((res && res.reason) || '这段描述暂时无法生成纹样，请重新输入。');
        errEl.hidden = false;
        $('genOut').hidden = true;
        $('genTheme').focus();
        return;
      }
      var isMedallion = res.params.layout === 'medallion';
      var uv = AITexture.uvCorrect(res.canvas, regionRadiusProfile(rg.v[0], rg.v[1]), !isMedallion);
      lastGen = { canvas: uv.canvas, meta: { name: theme }, pat: null };

      $('genPrev').src = uv.canvas.toDataURL('image/png');
      $('genDesc').textContent = res.desc + ' ' + uv.notes;

      /* 布局与区域不匹配的风险提示 */
      var regionCN = (window.AIAdvisor && AIAdvisor.regionCN[state.region]) || '腹部';
      var risk = '';
      if (isMedallion && (state.region === 'mouth' || state.region === 'neck'))
        risk = '⚠ 狭长' + regionCN + '铺团花易拉伸断纹，建议改为窄幅边饰。';
      else if (res.params.layout === 'band' && (state.region === 'belly' || state.region === 'all'))
        risk = '⚠ ' + regionCN + '用细边饰会显得空旷，建议改为环形平铺。';
      $('genRisk').textContent = risk;
      $('genRisk').hidden = !risk;

      $('genOut').hidden = false;
      if (autoApply) applyGenerated(uv.canvas, { name: theme });
    }).catch(function (err) {
      btn.disabled = false;
      btn.textContent = oldLabel;
      errEl.textContent = '⚠ 生成失败：' + (err && err.message ? err.message : err);
      errEl.hidden = false;
    });
  }

  /* ==================== 14.9 器型智能辅助（智能推荐 / AI 重塑） ====================
     ① 智能推荐：朝代 → 代表器型 + 初始参数集回填滑块
     ② AI 重塑：评估轮廓畸形与朝代审美 → 保留意图的柔和矫正（可拒绝）
     ③ 自由创作模式：只查畸形，不强改朝代范式
     引擎见 ai-shape.js（本地知识库，可 AIShape.configure({endpoint}) 接大模型） */
  var lastReshape = null;
  var lastAppliedSnap = null;   // 上次「应用修改」之前的器形快照，供「保持原样」撤回
  var shapeNoteTimer = null;
  var riskTimer = null;

  /* 注册器型池（含朝代归属与默认参数，供推荐引擎取材） */
  function registerShapePool() {
    if (!window.AIShape) return aiMissing('器型智能辅助');
    AIShape.registerShapes(ERAS.map(function (e) {
      return {
        id: e.id, name: e.name, note: e.note,
        shapes: e.shapes.map(function (s) { return { id: s.id, name: s.name, fam: s.fam, d: s.d }; })
      };
    }));
  }

  /* state.params → [10 项数组]（与 PKEYS 同序） */
  function paramsToArr() {
    return PKEYS.map(function (k) { return state.params[k]; });
  }

  /* 右栏轻量反馈条 */
  function showShapeNote(html) {
    var n = $('aiShapeNote');
    n.innerHTML = html;
    n.hidden = false;
    clearTimeout(shapeNoteTimer);
    shapeNoteTimer = setTimeout(function () { n.hidden = true; }, 9000);
  }

  /* ① 智能推荐：返回器型 + 参数 → 载入并回填滑块
     ------------------------------------------------------------
     修复点（工序① 点击「AI 智能推荐器型」无反应）：
     · 旧实现把推荐结论写进 showShapeNote（右栏 #aiShapeNote），而工序① 的右栏是隐藏的，
       用户看不到任何推荐说明；
     · 旧的「完成判定」钩子在第一次点击后就置 done[1]，之后连任务气泡也不再出现；
     · 引擎按 hash(朝代 + 器类偏好) 取件，同朝代同器类恒定推荐同一件 —— 若它正好是当前坯体，
       点了等于没点（3D 器物、参数几乎不变）。
     现在：推荐结论固定落在舞台左下角结果卡上；同一朝代可反复点，逐件换候选器型；
     若 AI 首选就是当前坯体，则自动顺延一件并在卡上说明，保证每次点击都有可见变化。 */
  var recState = { era: '', idx: -1, prefer: '' };

  /* 候选序列：直接沿用朝代器型库的馆藏顺序（稳定，不随当前器类跳动），
     「AI 首选」由引擎决定，逐次点击在朝代内轮换 */
  function recCandidates(era) {
    return era.shapes.slice();
  }
  function recIndexOf(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
    return -1;
  }
  function shapeRecSpec(p) {
    return '高 ' + P.h(p.h).toFixed(1) + ' cm · 腹径 ' + P.belly(p.belly).toFixed(1) +
      ' cm · 口径 ' + P.mouth(p.mouth).toFixed(1) + ' cm';
  }
  function hideShapeRec() {
    var card = $('shapeRecCard');
    if (card && !card.hidden) card.hidden = true;
  }
  /* 结果卡：器型名 / 关键尺寸 / 推荐理由 / 风险 / 顺延说明 / 候选序号 */
  function renderShapeRec(o) {
    var card = $('shapeRecCard');
    $('shapeRecName').textContent = o.name;
    $('shapeRecEn').textContent = o.en || '';
    $('shapeRecSpec').textContent = o.spec;
    $('shapeRecNote').textContent = o.note;
    $('shapeRecSkip').textContent = o.skip || '';
    $('shapeRecSkip').hidden = !o.skip;
    $('shapeRecRisk').textContent = o.risk ? '⚠ ' + o.risk : '';
    $('shapeRecRisk').hidden = !o.risk;
    $('shapeRecHit').textContent = o.hit || '';
    card.hidden = false;
    card.classList.remove('in');
    void card.offsetWidth;          // 重排以重放进入动画
    card.classList.add('in');
  }
  /* 左侧器型卡高亮脉冲，指明 AI 选中了哪一件 */
  function flashShapeCard(id) {
    var el = shapeListEl.querySelector('.shape-card[data-id="' + id + '"]');
    if (!el) return;
    el.classList.remove('rec-flash');
    void el.offsetWidth;
    el.classList.add('rec-flash');
    if (shapeListEl.scrollHeight > shapeListEl.clientHeight + 4) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }

  function runShapeRecommend() {
    if (!window.AIShape) return aiMissing('器型智能辅助');
    var btn = $('aiShapeBtn');
    if (btn.disabled) return;                 // 防连点：上一次推荐未返回时忽略
    btn.disabled = true;
    btn.textContent = '推荐中…';
    var era = eraOf(state.era);
    /* 器类偏好只在进入某个朝代时取一次：否则每载入一件器型偏好就跟着变，
       「AI 首选」在连点时来回跳，候选序号与顺延说明都会失真 */
    if (recState.era !== era.id) {
      recState.era = era.id;
      recState.idx = -1;
      recState.prefer = AIShape.famCN[state.fam] || '';
    }
    var prefer = recState.prefer;

    AIShape.run('dynasty_shape_recommend', { dynasty: era.name, prefer: prefer })
      .then(function (json) {
        btn.disabled = false;
        btn.textContent = '✦ AI 智能推荐器型';
        if (era.id !== state.era) return;     // 期间切了朝代：丢弃这次结果，避免张冠李戴

        var list = recCandidates(era);
        if (!list.length) throw new Error('当前朝代器型库为空');

        var baseIdx = recIndexOf(list, json.shape_id);
        if (baseIdx < 0) baseIdx = 0;

        var idx;
        if (recState.idx < 0) {
          /* 首次：AI 首选；若它正是当前坯体（外观不变 → 像没反应），顺延一件 */
          idx = (list[baseIdx].id === state.shapeId && list.length > 1)
            ? (baseIdx + 1) % list.length : baseIdx;
        } else {
          /* 再点一次 / 换一个：往后换一件；跳过当前坯体，确保器物真的变了 */
          idx = (recState.idx + 1) % list.length;
          if (list[idx].id === state.shapeId && list.length > 1) idx = (idx + 1) % list.length;
        }
        recState.idx = idx;

        var shape = list[idx];
        var aiPick = list[baseIdx];
        var skipped = (idx !== baseIdx && aiPick.id === state.shapeId)
          ? 'AI 首选「' + aiPick.name + '」与当前坯体相同，已顺延推荐「' + shape.name + '」。'
          : '';
        loadShape(shape.id);
        /* AI 首选：保留引擎给出的 10 项起坯参数；顺延候选：载入该器型馆藏参数 */
        if (shape.id === aiPick.id && json.params_full && json.params_full.length === PKEYS.length) {
          state.params = arrToParams(json.params_full);
          state.dR = new Float32Array(N + 1);
          state.dY = new Float32Array(N + 1);
          syncParamUI();
          rebuildPot(true);
        }
        updateHud();
        flashShapeCard(shape.id);

        var spec = shapeRecSpec(state.params);
        renderShapeRec({
          name: shape.name,
          en: shape.en,
          spec: spec,
          note: era.name + '「' + era.note + '」，推荐' +
            ((window.AIShape && AIShape.famCN[shape.fam]) || '') + '类「' + shape.name +
            '」起坯；参数已同步到右侧滑块，可继续微调或直接捏塑。',
          risk: json.risk || '',
          skip: skipped,
          hit: '第 ' + (idx + 1) + ' / ' + list.length + ' 件'
        });

        flowShapeTouched('ai');   // 工序① 完成判定：AI 推荐起坯（首次解锁「下一步」）
        /* 每次点击都给任务气泡（旧逻辑第二次点击不再提示，观感就是「没反应」） */
        flowToast('✦ AI 推荐「' + shape.name + '」—— ' + spec + '，已载入坯体。');
      }).catch(function (err) {   // 兜底：失败时恢复按钮并给出可见提示，避免卡在「推荐中…」
        btn.disabled = false;
        btn.textContent = '✦ AI 智能推荐器型';
        flowToast('AI 推荐执行失败：' + (err && err.message ? err.message : err));
      });
  }

  /* 器身表面起伏实测：捏塑形变 dR / dY 相对理想放样轮廓的偏离
     —— 旧版 AI 重塑只看 10 项滑块，捏出再大的凹凸也判「无需调整」；
     这里把表面平整度量化后交给引擎计分，并让「应用修改」以抹平器身为主。 */
  var SURF_ZONES = [
    { name: '足部', a: 0.00, b: 0.25 },
    { name: '腹部', a: 0.25, b: 0.62 },
    { name: '肩部', a: 0.62, b: 0.85 },
    { name: '口沿', a: 0.85, b: 1.00 }
  ];
  function surfaceMetrics() {
    var i, d, sum = 0, maxDev = 0, spike = 0, vs = 0;
    for (i = 0; i <= N; i++) {
      d = state.dR[i] * 12;                    // 世界单位 → cm（1 cm = 1/12 世界单位）
      sum += d * d;
      if (Math.abs(d) > maxDev) maxDev = Math.abs(d);
      vs += Math.pow(state.dY[i] * 12, 2);
    }
    var rms = Math.sqrt(sum / (N + 1));
    for (i = 1; i < N; i++) {
      spike += Math.abs(state.dR[i - 1] - 2 * state.dR[i] + state.dR[i + 1]) * 12;
    }
    spike /= Math.max(1, N - 1);
    var vert = Math.sqrt(vs / (N + 1));

    var smooth = Math.round(clamp(100 - (rms * 11 + spike * 26 + vert * 8), 5, 100));

    var zones = [], bumps = 0;
    SURF_ZONES.forEach(function (z) {
      var acc = 0, cnt = 0;
      var lo = Math.round(z.a * N), hi = Math.round(z.b * N);
      for (var j = lo; j <= hi; j++) { acc += Math.abs(state.dR[j] * 12); cnt++; }
      if (cnt && acc / cnt > 0.12) zones.push(z.name);
    });
    for (i = 1; i < N; i++) {
      var a = state.dR[i - 1], b = state.dR[i], c = state.dR[i + 1];
      if (Math.abs(b) > 0.2 && Math.abs(b) >= Math.abs(a) && Math.abs(b) >= Math.abs(c)) bumps++;
    }
    return { smooth: smooth, rms: rms, maxDev: maxDev, spike: spike, vert: vert, zones: zones, bumps: bumps };
  }

  /* 一维低通：抹掉捏塑留下的尖角，再按 keep 保留一部分手作起伏
     （keep 越小越平整：粗糙器身保留 22%，本来就平顺的保留 55% 手感） */
  function smoothField(arr, keep) {
    var src = arr.slice(0), pass, i, prev;
    for (pass = 0; pass < 2; pass++) {
      prev = src.slice(0);
      for (i = 1; i < N; i++) src[i] = prev[i - 1] * 0.25 + prev[i] * 0.5 + prev[i + 1] * 0.25;
      src[0] = prev[0] * 0.65 + prev[1] * 0.35;
      src[N] = prev[N] * 0.65 + prev[N - 1] * 0.35;
    }
    for (i = 0; i <= N; i++) arr[i] = src[i] * keep;
  }

  /* ② AI 重塑：评估 + 矫正方案，先展示修改清单，由用户决定应用与否
     ------------------------------------------------------------
     修复点：
     · 评分只看滑块、忽略捏塑起伏 → 每次都是同一个分数和同一句「无需调整」；
     · 「应用修改」把 10 项参数整体覆盖、并把捏塑形变清零，改的是比例而不是平整度；
     · 「保持原样」缺少可见反馈，也留着旧方案可供误用。
     现在：评估带上实测表面平整度，分数与文案随关注点浮动；应用以平滑器身为主、
     参数只做柔和过渡；保持原样明确声明未改动任何数据。 */
  function runReshape() {
    if (!window.AIShape) return aiMissing('器型智能辅助');
    var btn = $('aiReshapeBtn');
    var old = btn.textContent;
    btn.disabled = true;
    btn.textContent = '评估中…';
    var era = eraOf(state.era);
    var surf = surfaceMetrics();
    AIShape.run('ai_reshape', {
      params: JSON.parse(JSON.stringify(state.params)),   /* 传 10 项参数对象（此前误传数组，引擎读不到值导致 NaN） */
      dynasty: era.name,
      shape_kind: AIShape.famCN[state.fam] || '瓶',
      free: $('ascFree').checked,
      surface: surf                                     /* 表面起伏实测值：让评分反映「捏得平不平」 */
    }).then(function (json) {
      btn.disabled = false;
      btn.textContent = old;
      lastReshape = json;
      var sc = $('ascScore');
      sc.textContent = json.original_score;
      sc.className = json.original_score >= 85 ? 'hi' : json.original_score >= 60 ? 'mid' : 'low';
      $('ascSug').textContent = json.suggestion;
      $('ascList').innerHTML = json.modify_list.length
        ? json.modify_list.map(function (m) { return '<li>' + m + '</li>'; }).join('')
        : '<li class="ok">无需调整，轮廓与表面都在' + era.name + '审美舒适区内。</li>';

      /* 表面平整度计量条：当前值 + 应用后的预计值 */
      var plan = json.surface_plan;
      var now = plan ? plan.current : surf.smooth;
      if ($('ascFlatNow')) {
        $('ascFlatNow').textContent = now;
        var bar = $('ascFlatBar');
        bar.style.width = clamp(now, 0, 100) + '%';
        bar.className = now >= 85 ? 'hi' : now >= 60 ? 'mid' : 'low';
        $('ascFlatTo').textContent = (plan && plan.expected != null && plan.expected - now >= 3)
          ? '应用后预计 ' + plan.expected : '当前已足够平整';
        if ($('ascFocus')) $('ascFocus').textContent = json.focus ? '本次侧重 · ' + json.focus : '';
      }
      $('aiShapeCard').hidden = false;
    }).catch(function (err) {   // 兜底：失败时恢复按钮并提示
      btn.disabled = false;
      btn.textContent = old;
      flowToast('AI 重塑执行失败：' + (err && err.message ? err.message : err));
    });
  }

  /* 应用修改：以「提高表面平整度」为主，参数只做保留意图的柔和回拉 */
  function applyReshape() {
    if (!lastReshape) return;
    var before = surfaceMetrics();

    /* 0) 先把应用前的器形完整留档：之后点「保持原样」可以原路退回 */
    lastAppliedSnap = {
      params: JSON.parse(JSON.stringify(state.params)),
      dR: state.dR.slice(0),
      dY: state.dY.slice(0)
    };

    /* 1) 参数：只采纳引擎点名的改动；引擎本身已做「保留意图」的部分回拉，
       这里直接落位，保证一次应用后偏离度明显下降、复评分数确实回升 */
    var ch = lastReshape.param_changes;
    if (!ch) {                        // 兼容旧引擎返回值：从 optimized_params 反推变化项
      ch = {};
      for (var k0 in state.params) {
        var t0 = +lastReshape.optimized_params[k0];
        if (isFinite(t0) && Math.round(t0) !== Math.round(state.params[k0])) ch[k0] = t0;
      }
    }
    var np = {}, k, nParam = 0;
    for (k in state.params) {
      var cur = state.params[k], t = +ch[k];
      if (isFinite(t) && Math.round(t) !== Math.round(cur)) {
        np[k] = Math.round(t);
        nParam++;
      } else {
        np[k] = cur;
      }
    }
    state.params = np;

    /* 2) 表面：两遍低通去尖角 + 按粗糙度收缩起伏（这一步才是「变平整」的主效果） */
    var keep = before.smooth >= 88 ? 0.50 : before.smooth >= 70 ? 0.30 : 0.14;
    smoothField(state.dR, keep);
    smoothField(state.dY, Math.max(0.4, keep));

    syncParamUI();
    rebuildPot(true);
    updateHud();
    $('aiShapeCard').hidden = true;

    var after = surfaceMetrics();
    if (nParam === 0 && after.smooth <= before.smooth) {
      showShapeNote('当前轮廓与表面都已在' + eraOf(state.era).name + '舒适区，未做改动（表面平整度 ' +
        after.smooth + '/100）。');
    } else {
      showShapeNote('已应用 AI 重塑：表面平整度 ' + before.smooth + ' → ' + after.smooth +
        '（最大起伏 ' + before.maxDev.toFixed(1) + ' → ' + after.maxDev.toFixed(1) + ' cm）' +
        (nParam ? '，参数柔和微调 ' + nParam + ' 项' : '') + '。' +
        (after.smooth > before.smooth ? '可再点「✦ AI 重塑」收一遍；「参数归位」可还原标本参数。' : ''));
    }
    lastReshape = null;
  }

  /* 保持原样：
     · 刚「应用过修改」→ 撤回这次应用，恢复到应用前的器形（参数 + 表面）；
     · 没有应用过 → 什么都不动，只给出可见反馈。 */
  function rejectReshape() {
    $('aiShapeCard').hidden = true;
    if (lastAppliedSnap) {
      state.params = JSON.parse(JSON.stringify(lastAppliedSnap.params));
      state.dR = lastAppliedSnap.dR.slice(0);
      state.dY = lastAppliedSnap.dY.slice(0);
      lastAppliedSnap = null;
      syncParamUI();
      rebuildPot(true);
      updateHud();
      var m0 = surfaceMetrics();
      showShapeNote('已保持原样：撤回上一次「应用修改」，恢复到应用前的器形与表面（平整度 ' +
        m0.smooth + '/100，最大起伏 ' + m0.maxDev.toFixed(1) + ' cm）。');
      lastReshape = null;
      return;
    }
    var m = surfaceMetrics();
    showShapeNote('已保持原样：轮廓参数与捏塑表面都没有改动（表面平整度 ' + m.smooth +
      '/100，最大起伏 ' + m.maxDev.toFixed(1) + ' cm）。');
    lastReshape = null;              // 作废本次方案，防止后续被误用
  }

  /* ③ 滑块拖动时的畸形风险提示（仅提示，不强行修正） */
  function quickRiskCheck() {
    if (!window.AIShape) return aiMissing('器型智能辅助');
    clearTimeout(riskTimer);
    riskTimer = setTimeout(function () {
      var era = eraOf(state.era);
      var q = AIShape.quickScore(paramsToArr(), era.name, AIShape.famCN[state.fam] || '瓶');
      var bad = q.hard && q.hard.length;
      $('aiReshapeBtn').classList.toggle('warn', !!bad);
      if (bad) {
        showShapeNote('⚠ 轮廓风险：' + q.hard[0][2] + '。可点「✦ AI 重塑」矫正。');
      }
    }, 700);
  }

  /* ==================== 14.10 AI 烧制闭环 ====================
     流程：设胎质/料浓/温度 → 窑火升焰 → ① AIFire.predict 得方案
     → ② repaint 在 UV 贴图上做窑变演化（晕散/浸润/开片/窑变斑）
     → ③ appraise 出鉴评卡片；支持迭代叠烧与撤回/重置。
     引擎见 ai-fire.js（本地工艺知识库，可 configure({endpoint}) 接大模型） */
  var fire = { clay: 60, pig: 55, temp: 1250, iter: 0 };
  var lastFirePlan = null;
  var fireSnap = null;    // 撤回快照 {canvas, iter, plan}
  var firing = false;

  function fireVars() {
    var era = eraOf(state.era);
    var pat = currentPattern(era);
    return {
      dynasty: era.name,
      clay: fire.clay,
      pigment: fire.pig,
      temp: fire.temp,
      density: [0.7, 1, 1.5][state.density],
      iteration: fire.iter,
      pattern_name: pat ? pat.name : ''
    };
  }

  /* 入窑前备份当前贴图，供"撤回上一窑" */
  function snapshotFire() {
    var c = decorCtx.canvas;
    var snap = document.createElement('canvas');
    snap.width = c.width;
    snap.height = c.height;
    snap.getContext('2d').drawImage(c, 0, 0);
    fireSnap = { canvas: snap, iter: fire.iter, plan: lastFirePlan };
  }

  function restoreFire() {
    if (!fireSnap) return;
    var c = decorCtx.canvas;
    decorCtx.clearRect(0, 0, c.width, c.height);
    decorCtx.drawImage(fireSnap.canvas, 0, 0);
    fire.iter = fireSnap.iter;
    lastFirePlan = fireSnap.plan;
    /* 撤回窑次后美化层与旧鉴评不再成立 */
    beautyCanvas = null;
    beautyCount = 0;
    lastFinalAp = null;
    $('appraiseCard').hidden = true;
    decorTex.needsUpdate = true;
    syncFireUI();
  }

  function syncFireUI() {
    $('fireCount').textContent = '第 ' + (fire.iter + 1) + ' 烉';
    $('fireUndo').disabled = !fireSnap || fire.iter === 0;
    $('fireReset').disabled = fire.iter === 0;
  }

  /* 主流程：预测 → 重绘 → 鉴评
     强制迭代约束：fireVars 携带轮次 iteration，AIFire.predict 按轮次抬升开片等级，
     repaint 在上一轮贴图上叠加新肌理（开片纹路与窑变斑位置均随机），
     轮次越高 → 釉晕加深 / 开片增多 / 窑变流淌 / 窑损与珍品概率变化，杜绝重复出同一效果。 */
  function runFiring() {
    if (firing) return;
    if (state.finish <= 0 || !currentPattern(eraOf(state.era))) {
      showShapeNote('⚠ 请先在下方贴上纹样，再入窑烧制。');
      return;
    }
    firing = true;
    snapshotFire();
    var btn = $('fireBtn');
    btn.disabled = true;
    btn.classList.add('on');
    $('kilnGlow').classList.add('on');
    if (!$('fireSkip').checked) showKilnScene();   // 开窑仪式：先入窑场景

    AIFire.run('fire_predict', fireVars()).then(function (plan) {
      lastFirePlan = plan;
      setFinish(2);          // 入窑成釉面
      composeDecor();        // 内部按计划做窑变重绘

      /* 工艺风险提醒（违背朝代烧制特征） */
      if (plan.risk_note) {
        $('atScore').textContent = plan.fire_mode.slice(0, 2);
        $('atJudge').textContent = '⚠ ' + plan.risk_note;
        $('atReplace').hidden = true;
        $('adaptToast').hidden = false;
        clearTimeout(adaptTimer);
        adaptTimer = setTimeout(function () { $('adaptToast').hidden = true; }, 9000);
      }

      /* 窑火仪式：1.6s 出窑 */
      setTimeout(function () {
        fire.iter++;
        syncFireUI();
        btn.disabled = false;
        btn.classList.remove('on');
        $('kilnGlow').classList.remove('on');
        firing = false;
        flowBurnDone();   // 工序⑤ 完成判定 + 烧制轮次持久累计

        /* 开窑分支判定 → 卷帘揭纱出窑（视觉叙事，底层复用烧制链路） */
        AIRitual.run('kiln_roll', { temp: fire.temp, iteration: fire.iter - 1 }).then(function (roll) {
          revealKiln(roll, plan);
        });
      }, 1600);
    });
  }

  /* ---------- 终鉴评 + 一键美化 ----------
     鉴评区分仿古校验 / 自由创作美学；美化不篡改用户构图，
     可取消；最多 3 次防无限迭代。 */
  var lastPatScore = 88;    // 最近纹样适配分（适配检测时缓存）
  var lastFinalAp = null;   // 最近终鉴评结果
  var beautyCanvas = null;  // 美化层画布（composeDecor 时叠加）
  var beautyCount = 0;      // 已美化次数
  var beautifying = false;

  function showFinalAppraise(beautified) {
    var era = eraOf(state.era);
    var shapeScore = 80;
    if (window.AIShape) {
      shapeScore = AIShape.quickScore(paramsToArr(), era.name, AIShape.famCN[state.fam] || '瓶').score;
    }
    return AIFire.run('porcelain_final_appraise', {
      dynasty: era.name,
      free: $('ascFree') ? $('ascFree').checked : false,
      shape_score: shapeScore,
      pattern_score: lastPatScore,
      plan: lastFirePlan || {},
      temp: fire.temp,
      iteration: Math.max(0, fire.iter - 1),
      beautified: beautified
    }).then(function (ap) {
      lastFinalAp = ap;
      var sc = $('apScore');
      sc.textContent = ap.total_score;
      sc.className = ap.total_score >= 85 ? 'hi' : ap.total_score >= 70 ? 'mid' : 'low';
      $('apLabel').textContent = beautified ? '美化后 · 二次鉴评' : 'AI 终鉴评';
      $('apMode').textContent = (lastFirePlan ? lastFirePlan.fire_mode : '常规烧制') + ' · ' +
        ($('ascFree').checked ? '自由创作' : '仿古校验') + ' · 第 ' + fire.iter + ' 烉';
      $('apCon').textContent = ap.conclusion;
      var sb = ap.sub_score;
      $('apSubs').innerHTML =
        '<span>造型 <b>' + sb.shape_score + '</b></span>' +
        '<span>纹样 <b>' + sb.pattern_score + '</b></span>' +
        '<span>釉色 <b>' + sb.glaze_score + '</b></span>';
      $('apHiL').innerHTML = ap.highlights.map(function (t) { return '<li>' + t + '</li>'; }).join('');
      $('apDeL').innerHTML = ap.problems.map(function (t) { return '<li>' + t + '</li>'; }).join('');
      $('apActs').hidden = false;
      $('apBeauty').disabled = beautyCount >= 3;
      $('apBeauty').textContent = beautyCount >= 3 ? '精修次数已达上限'
        : beautyCount > 0 ? '✨ 再次精修' : '✨ 一键美化';
      $('apNote').hidden = true;
      $('appraiseCard').hidden = false;
    });
  }

  /* 一键美化：每次从「未美化的窑变底片」重新精修 → 刷新 3D → 二次鉴评
     旧版在已美化的画布上继续叠加模糊与罩色，越点越糊、颜色越点越闷；
     现在固定以窑变原图为基准，按第 n 次提升精修强度，只提对比与提纯青料。 */
  function runBeauty() {
    if (beautifying || beautyCount >= 3 || !lastFinalAp) return;
    beautifying = true;
    var btn = $('apBeauty');
    btn.textContent = '精修中…';

    /* 渲染一张不含美化层的窑变底片，作为本次精修的基准 */
    var keep = beautyCanvas;
    beautyCanvas = null;
    composeDecor();
    var base = document.createElement('canvas');
    base.width = 2048; base.height = 1024;
    base.getContext('2d').drawImage(decorCtx.canvas, 0, 0);
    beautyCanvas = keep;

    var pass = beautyCount + 1;
    AIFire.run('beautify_uv', { canvas: base, pass: pass, instruction: lastFinalAp.beautify_instruction })
      .then(function (res) {
        beautyCanvas = res.canvas;
        beautyCount = pass;
        composeDecor();   // 重绘管线末尾带出美化层
        $('apUndoBeauty').hidden = false;
        return showFinalAppraise(true);
      })
      .then(function () {
        $('apNote').textContent = '第 ' + beautyCount + ' 次精修：去浮雾 · 提笔触对比 · 青料提纯，全程不加模糊，纹样保持锋利。';
        $('apNote').hidden = false;
        btn.disabled = beautyCount >= 3;
        btn.textContent = beautyCount >= 3 ? '精修次数已达上限' : '✨ 再次精修';
        beautifying = false;
      });
  }

  /* 取消美化：清掉美化层，恢复窑变原貌 */
  function cancelBeauty() {
    beautyCanvas = null;
    beautyCount = 0;
    composeDecor();
    $('apUndoBeauty').hidden = true;
    showFinalAppraise(false);
    showShapeNote('已取消精修，恢复窑变原貌。');
  }

  function undoFire() {
    if (fire.iter > 0) restoreFire();
  }
  function resetFire() {
    if (fire.iter > 0) {
      fire.iter = 0;
      lastFirePlan = null;
      composeDecor();   // 重绘基础贴图（无窑变）
    }
    fireSnap = null;
    beautyCanvas = null;
    beautyCount = 0;
    lastFinalAp = null;
    $('appraiseCard').hidden = true;
    syncFireUI();
  }

  /* 烧制面板三个滑块的数值联动 */
  function syncFireSliders() {
    var clay = +$('fireClay').value;
    fire.clay = clay;
    $('fireClayV').textContent = clay < 30 ? '粗胎' : clay < 70 ? '中胎' : '细胎';
    fire.pig = +$('firePig').value;
    $('firePigV').textContent = fire.pig;
    fire.temp = +$('fireTemp').value;
    $('fireTempV').textContent = fire.temp + '℃';
  }

  /* ==================== 14.12 开窑仪式 · 时光演化 ====================
     新增两大增量模块（引擎见 ai-ritual.js）：
     · 开窑仪式只是视觉叙事包装，底层复用烧制预测 / 窑变重绘；
     · 时光演化 = 参数调整 + 推荐纹样 + 老化重绘（不是切图）。
     （题款落印工序已按需求整体移除） */
  var evoSnap = null;          // 时光演化回退快照

  /* ---------- 模块 2：虚拟窑炉开窑仪式 ---------- */
  function showKilnScene() {
    var ov = $('kilnOverlay');
    $('klText').textContent = '窑火正旺 · 静候开窑…';
    $('klBadge').hidden = true;
    ov.classList.remove('reveal');
    ov.hidden = false;
  }

  function revealKiln(roll, plan) {
    var ov = $('kilnOverlay');
    function afterKiln() {
      ov.hidden = true;
      ov.classList.remove('reveal');
      if (roll.kind === 'damage') {
        drawDamage();
        $('atScore').textContent = '窑损';
        $('atJudge').textContent = '⚠ ' + roll.note + ' 已标记损伤，可直接再点「窑火升焰」复烧。';
        $('atReplace').hidden = true;
        $('adaptToast').hidden = false;
        clearTimeout(adaptTimer);
        adaptTimer = setTimeout(function () { $('adaptToast').hidden = true; }, 9000);
      } else {
        showFinalAppraise(false).then(function () {
          if (roll.kind === 'rare' && lastFinalAp) {
            lastFinalAp.total_score = Math.min(99, lastFinalAp.total_score + 4);
            var sc = $('apScore');
            sc.textContent = lastFinalAp.total_score;
            sc.className = 'hi';
            $('apNote').textContent = '✦ ' + roll.note;
            $('apNote').hidden = false;
          }
        });
      }
    }
    if ($('fireSkip').checked) { afterKiln(); return; }
    /* 卷帘揭纱：纱帘向两侧拉开，露出窑中成品 */
    $('klText').textContent = '开 窑 ！';
    ov.classList.add('reveal');
    var badge = $('klBadge');
    if (roll.kind !== 'normal') {
      badge.textContent = roll.kind === 'rare' ? '✦ 稀有窑变珍品' : '窑损 · 可复烧';
      badge.className = 'kl-badge show ' + roll.kind;
      badge.hidden = false;
    }
    setTimeout(function () {
      afterKiln();
      setTimeout(function () {
        ov.hidden = true;
        ov.classList.remove('reveal');
        badge.hidden = true;
      }, 1000);
    }, 1350);
  }

  /* 窑损视觉：釉面流挂剥裂（浅色竖向流痕，复烧可覆盖） */
  function drawDamage() {
    var c = decorCtx.canvas;
    decorCtx.save();
    decorCtx.globalCompositeOperation = 'source-atop';
    for (var i = 0; i < 4; i++) {
      var x = (0.2 + Math.random() * 0.6) * c.width;
      var y = c.height * 0.22;
      var grad = decorCtx.createLinearGradient(x, y, x, y + c.height * 0.3);
      grad.addColorStop(0, 'rgba(232, 226, 214, .5)');
      grad.addColorStop(1, 'rgba(232, 226, 214, 0)');
      decorCtx.fillStyle = grad;
      decorCtx.fillRect(x - 5, y, 10, c.height * 0.3);
    }
    decorCtx.restore();
    decorTex.needsUpdate = true;
  }

  /* ---------- 模块 1：时光演化 ---------- */
  function applyParamsArr(arr) {
    PKEYS.forEach(function (k, i) { state.params[k] = arr[i]; });
    syncParamUI();
    rebuildPot(true);
  }

  function runEvolve() {
    if (firing) return;
    if (!state.patternId) {
      showShapeNote('⚠ 请先生成青花成品，再启时光演化。');
      return;
    }
    var to = +$('evoRange').value;
    var heavy = $('evoHeavy').checked;
    var locked = $('evoLock').checked;
    /* 快照供一键回退 */
    evoSnap = {
      era: state.era,
      shapeId: state.shapeId,
      params: JSON.parse(JSON.stringify(state.params)),
      patternId: state.patternId
    };
    $('evoBack').disabled = false;

    AIRitual.run('time_evolve', {
      from: 0, to: to, mode: heavy ? 'heavy' : 'light',
      locked: locked, shape_id: state.fam,
      params_full: paramsToArr(),
      free: $('ascFree').checked
    }).then(function (res) {
      /* 重演化且未锁定 → 切到目标朝代代表器型；轻演化仅微调参数 */
      if (heavy && !locked && to < 3) {
        var eraId = ['yuan', 'ming', 'qing'][to];
        if (eraId !== state.era) switchEra(eraId, true);   // keepFlow：演化内部换朝代不触发上游重置
        loadShape(eraOf(eraId).shapes[0]);
      } else if (res.params_full) {
        applyParamsArr(res.params_full);   // 演化结果回写滑块
      }
      /* 适配推荐纹样（目标年代池首推；自由创作不动用户纹样） */
      if (!$('ascFree').checked) {
        var pat = eraOf(state.era).patterns[0];
        if (pat && pat.id !== state.patternId) applyPattern(pat);
      }
      /* 现代 / 重演化：风化 + 土沁老化（老化窑变 + 暖色沁斑） */
      if (res.aged) {
        setFinish(2);
        AIFire.run('fire_predict', {
          dynasty: '清代', clay: fire.clay, pigment: 45,
          temp: 1315, density: [0.7, 1, 1.5][state.density],
          iteration: Math.min(fire.iter, 3), pattern_name: ''
        }).then(function (plan) {
          lastFirePlan = plan;
          composeDecor();
          ageStains();
        });
      }
      var st = $('evoStory');
      st.textContent = '⏳ ' + res.story;
      st.hidden = false;
      showShapeNote('时光演化 → ' + res.to_name + ' 完成。');
    });
  }

  /* 土沁斑：暖褐软斑（岁月痕迹） */
  function ageStains() {
    var c = decorCtx.canvas;
    decorCtx.save();
    decorCtx.globalCompositeOperation = 'source-atop';
    for (var i = 0; i < 5; i++) {
      var x = Math.random() * c.width;
      var y = c.height * (0.5 + Math.random() * 0.45);
      var r = 60 + Math.random() * 120;
      var grad = decorCtx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(122, 90, 52, .12)');
      grad.addColorStop(1, 'rgba(122, 90, 52, 0)');
      decorCtx.fillStyle = grad;
      decorCtx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    decorCtx.restore();
    decorTex.needsUpdate = true;
  }

  /* 一键回退：恢复演化前的朝代/器型/参数/纹样 */
  function undoEvolve() {
    if (!evoSnap) return;
    if (state.era !== evoSnap.era) switchEra(evoSnap.era, true);   // keepFlow：回退内部换朝代不触发上游重置
    var era = eraOf(evoSnap.era);
    var shape = shapeOf(era, evoSnap.shapeId);
    if (shape) loadShape(shape);
    applyParamsArr(PKEYS.map(function (k) { return evoSnap.params[k]; }));
    var pat = patternOf(era, evoSnap.patternId) || findPatternAnywhere(evoSnap.patternId) || currentPattern(era);
    if (pat) applyPattern(pat);
    $('evoStory').hidden = true;
    $('evoBack').disabled = true;
    evoSnap = null;
    showShapeNote('已回退到演化前的模样。');
  }

  /* 题款落印工序已整体移除（含题款图层、预览与落款逻辑） */

  /* ==================== 14.15 工序流程控制 · 五阶解锁 ====================
     全程同一页面：仅通过面板置灰（.flow-lock）、亮起动效（.flow-open）、
     任务气泡与温柔提示控制流程推进，不新增任何独立页面。
     主链路：① 择朝塑坯 → ② 精调形制 → ③ 施纹绘彩
             → ④ 入窑烧制 → ⑤ 鉴评归档
     （原「题款落印」工序已整体移除，其内部工序号 4 不再使用，
       烧制/归档沿用 5/6 的内部编号以保持既有布局与样式不变）
     · 完成判定自动解锁下一工序（flowUnlock），锁定控件被操作时温柔劝返（flowGuard）；
     · 点击进度条已完成步骤可回退：回改上游自动重置下游依赖（flowInvalidate）；
     · 重置流程清空进度与烧制计数（flowReset）；?demo 演示模式一键全开（flowUnlockAll）。 */
  var FLOW_STEPS = [
    { n: 1, key: '坯', name: '择朝塑坯', hint: '点左侧器型载入坯体，或直接在拉坯台上捏塑，也可点「✦ 智能推荐」让 AI 起坯。' },
    { n: 2, key: '形', name: '精调形制', hint: '拖动右侧滑块精修器形，轮廓不妥可点「✦ AI 重塑」，完成后点「确认形制」。' },
    { n: 3, key: '纹', name: '施纹绘彩', hint: '选纹饰区域，从纹样库挑纹、AI 推荐或文字生成青花，映射成功即自动推进。' },
    { n: 5, key: '窑', name: '入窑烧制', hint: '设定胎质、料浓与温度，点「窑火升焰」开烧；烧成后可用时光演化漫游。' },
    { n: 6, key: '藏', name: '鉴评归档', hint: 'AI 鉴评后点「生成青花成品」题名入库；可继续迭代烧制或重置另起一器。' }
  ];
  var FLOW_SEQ = FLOW_STEPS.map(function (s) { return s.n; });   // 实际工序顺序 [1,2,3,5,6]
  var flow = { stage: 1, max: 1, done: {}, burnTotal: 0 };

  /* 按内部工序号取步骤定义（工序号有跳号，不能再用下标直取） */
  function stepOf(n) {
    for (var i = 0; i < FLOW_STEPS.length; i++) if (FLOW_STEPS[i].n === n) return FLOW_STEPS[i];
    return FLOW_STEPS[0];
  }
  function flowNextOf(n) {
    var i = FLOW_SEQ.indexOf(n);
    return i >= 0 && i < FLOW_SEQ.length - 1 ? FLOW_SEQ[i + 1] : n;
  }
  function flowPrevOf(n) {
    var i = FLOW_SEQ.indexOf(n);
    return i > 0 ? FLOW_SEQ[i - 1] : n;
  }

  /* 构建进度条：步骤按钮 + 连接线 + 任务气泡 */
  function flowInit() {
    try { flow.burnTotal = +localStorage.getItem('bw_burn_total') || 0; } catch (e) { /* 隐私模式静默 */ }
    var html = '';
    FLOW_STEPS.forEach(function (s, i) {
      if (i) html += '<span class="flow-link" aria-hidden="true"></span>';
      html += '<button type="button" class="flow-step" data-n="' + s.n + '" title="' + s.hint + '">' +
        '<i>' + s.key + '</i><span>' + s.name + (s.opt ? '<em>可选</em>' : '') + '</span></button>';
    });
    html += '<span class="flow-tip" id="flowTip"></span>';
    $('flowBar').innerHTML = html;
    /* 进度条步骤点击：与「上一步/下一步」共用同一跳转语义 */
    $('flowBar').addEventListener('click', function (ev) {
      var b = ev.target.closest('.flow-step');
      if (!b) return;
      flowJump(+b.dataset.n);
    });
    /* 工序视图切换按钮：上一步 / 下一步 */
    $('flowPrev').addEventListener('click', function () {
      if (flow.stage > 1) flowJump(flowPrevOf(flow.stage));
    });
    $('flowNext').addEventListener('click', function () {
      /* 已是最新进度时不可跳过完成判定，走温柔引导 */
      flowJump(flowNextOf(flow.stage));
    });
    flowSync();
  }

  /* 工序跳转统一入口（进度条 / 上一步 / 下一步共用）：
     后退走 invalidate 重置下游，唯独回到烧制（5）时保留窑变迭代；
     前进仅允许进入已解锁工序，未解锁走温柔引导 */
  function flowJump(n) {
    if (n === flow.stage) { flowToast('当前工序：「' + stepOf(n).name + '」 —— ' + stepOf(n).hint); return; }
    if (n < flow.stage) {
      if (n === 5) flowGoto(5);        // 返回烧制：保留窑变迭代结果，继续叠烧
      else flowInvalidate(n);          // 回改上游：自动重置下游依赖链路
    } else if (n <= flow.max) {
      flowGoto(n);                     // 跳回已解锁工序（数据保留，不重做）
    } else {
      flowGuide(n);
    }
  }

  /* 工序可见性：data-flow 支持 "3-4" 区间（保留区间语法） */
  function flowVisible(needStr, stage) {
    if (needStr.indexOf('-') >= 0) {
      var p = needStr.split('-');
      return stage >= +p[0] && stage <= +p[1];
    }
    return +needStr === stage;
  }

  /* 同步进度条与工序视图：
     视图切换制 —— 页面只渲染当前工序相关面板（flow-hide 隐藏其余），
     #app 的 data-fv 属性驱动栅格布局随工序重排；不做全页置灰。 */
  function flowSync() {
    Array.prototype.forEach.call($('flowBar').querySelectorAll('.flow-step'), function (el) {
      var n = +el.dataset.n;
      el.classList.toggle('done', n < flow.stage || (!!flow.done[n] && n !== flow.stage));
      el.classList.toggle('on', n === flow.stage);
      el.classList.toggle('ready', n > flow.stage && n <= flow.max);
    });
    $('app').setAttribute('data-fv', flow.stage);
    /* 工序② 精调形制：器形只能用右侧参数滑块调节，
       捏塑 / 拉伸 / 压平 三种鼠标手势停用；旋转观察保留（贯穿所有工序） */
    if (flow.stage === 2) {
      drag = null;
      stageEl.classList.remove('dragging');
      stageEl.dataset.mode = 'slider';
      canvas.style.cursor = 'grab';
      ringEl.classList.remove('on');
      var tipS2 = $('stageTip');
      if (tipS2) {
        tipS2.textContent = '工序② · 拖动可旋转观察 · 滚轮缩放 · 器形只用右侧参数调节';
        tipS2.classList.remove('fade');
      }
      updateHud();
    } else if (flow.stage === 1) {
      /* 回到工序①：恢复鼠标手势与提示 */
      stageEl.dataset.mode = state.mode;
      canvas.style.cursor = state.mode === 'orbit' ? 'grab' : 'crosshair';
      var tipS1 = $('stageTip');
      if (tipS1) tipS1.textContent = TIPS[state.mode] || TIPS.pinch;
    }
    /* 工序②「精调形制」完成后器形即定型：工序③起锁定捏塑/拉伸/压平三个塑形按钮
       （置灰禁点），并自动切回旋转观察，防止施纹/烧制时误改已定器形 */
    var shapeLocked = flow.stage >= 3;
    Array.prototype.forEach.call($('modeDock').children, function (el) {
      el.classList.toggle('mode-locked', shapeLocked && el.dataset.mode !== 'orbit');
    });
    if (shapeLocked) setMode('orbit');       // 工序③起器形定格，鼠标只用来旋转观察
    /* 上一步/下一步可用态：首步无上一步；未完成当前工序时下一步不可跳过（温柔引导兜底） */
    var pv = $('flowPrev'), nx = $('flowNext');
    if (pv) pv.disabled = flow.stage <= 1;
    if (nx) {
      nx.disabled = flow.stage >= flow.max;
      nx.classList.toggle('ready', flow.stage < flow.max);
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-flow]'), function (el) {
      var show = flowVisible(el.dataset.flow, flow.stage);
      el.classList.toggle('flow-hide', !show);
      el.classList.remove('flow-open');
      if (show) {
        /* 新视图面板柔和亮起（display 切换后动画自动触发） */
        void el.offsetWidth;
        el.classList.add('flow-open');
      }
    });
    /* 工序③（施纹绘彩）：朝代切换栏从顶栏移到纹样库上方，方便换朝代浏览纹样；
       离开工序③时归位到顶栏（DOM 移动不影响既有事件绑定） */
    var eraTabs = $('eraTabs');
    if (eraTabs) {
      var moved = eraTabs.dataset.moved === '1';
      if (flow.stage === 3 && !moved) {
        var patPane = document.querySelector('.bot-pattern');
        if (patPane) {
          /* 移入纹样库面板内部（标题栏下方），作为紧凑横排小药丸；
             不作为 .app-bottom 的网格子项，避免被栅格 stretch 拉成巨椭圆、挤后其余面板 */
          var patHead = patPane.querySelector('.pane-head');
          if (patHead) patHead.insertAdjacentElement('afterend', eraTabs);
          else patPane.insertBefore(eraTabs, patPane.firstChild);
          eraTabs.dataset.moved = '1';
          eraTabs.classList.add('in-flow');
        }
      } else if (flow.stage !== 3 && moved) {
        var headEl = document.querySelector('.app-head');
        var metaEl = headEl ? headEl.querySelector('.app-meta') : null;
        if (headEl) headEl.insertBefore(eraTabs, metaEl);
        eraTabs.dataset.moved = '0';
        eraTabs.classList.remove('in-flow');
      }
      /* 工序② 只调参数：顶部朝代选择在此工序隐藏 */
      eraTabs.classList.toggle('era-hidden', flow.stage === 2);
    }
    var tip = $('flowTip');
    if (tip) {
      var s = stepOf(flow.stage);
      var ord = ['一', '二', '三', '四', '五'][FLOW_SEQ.indexOf(flow.stage)] || '一';
      tip.textContent = '第' + ord + '道 · ' + s.name + '｜' + s.hint;
    }
    /* 推荐结果卡只在工序① 有意义：离开 / 回到工序① 都不该留下上一轮的结论 */
    if (flow.stage !== 1) hideShapeRec();
    /* 纹样推荐面板挂到了 body，离开工序③ 时手动收起 */
    if (flow.stage !== 3 && $('aiPanel')) $('aiPanel').hidden = true;
    updateHud();   // 工序切换后同步舞台 HUD（湿坯 / 环视 / 参数精修…）
  }

  /* 解锁下一工序但不自动切换视图：停留在当前工序，
     「下一步」按钮亮起（蓝色 ready 态），由用户点击后才进入下一视图 */
  function flowUnlock(n, msg) {
    if (n > flow.max) flow.max = n;
    flowSync();
    flowToast(msg);
  }

  /* 推进到工序 n：切换视图 + 任务气泡提示（面板亮起动效由 flowSync 统一处理） */
  function flowSet(n, msg) {
    if (n > flow.max) flow.max = n;
    flow.stage = n;
    flowSync();
    flowToast(msg || ('✦ 工序推进 —— 「' + stepOf(n).name + '」'));
  }

  /* 不重置数据，仅切换当前工序（跳回已解锁步骤 / 返回继续烧制） */
  function flowGoto(n) {
    flow.stage = n;
    flowSync();
    flowToast('已切至「' + stepOf(n).name + '」 —— ' + stepOf(n).hint);
  }

  /* 回改上游工序：自动重置下游依赖（纹样 / 烧制链路 / 成品预览） */
  function flowInvalidate(n, quiet) {
    flow.stage = n;
    flow.max = n;
    /* 回到「改器形」的工序①/②：朝代跟回器型所属朝代，
       否则器型库会显示另一朝代的卡、与拉坯台上的器物对不上 */
    if (n <= 2 && state.shapeEra && state.shapeEra !== state.era) {
      state.era = state.shapeEra;
      Array.prototype.forEach.call(eraTabsEl.children, function (el) {
        var on = el.dataset.era === state.era;
        el.classList.toggle('on', on);
        el.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      buildShapeList();
      buildPatterns();
    }
    for (var k in flow.done) if (+k >= n) delete flow.done[k];
    if (n <= 3) {
      state.patternId = null;
      setFinish(0);
      syncPatternCards();   // 同步清除纹样卡选中态
    }
    /* 旧窑变 / 美化 / 鉴评建立在上游贴图之上，全部失效 */
    fire.iter = 0;
    lastFirePlan = null;
    fireSnap = null;
    beautyCanvas = null;
    beautyCount = 0;
    lastFinalAp = null;
    $('appraiseCard').hidden = true;
    composeDecor();
    syncFireUI();
    $('pvThumb').innerHTML = '<span>尚未出窑</span>';
    $('pv').classList.remove('ready');   // 收起成品预览卡
    $('pvTitle').textContent = '待烧制';
    $('pvSub').textContent = '选纹样 · 生成成品';
    $('pvTags').hidden = true;
    $('pvDl').hidden = true;
    state.workURL = '';
    flowSync();
    if (!quiet) flowToast('已回到「' + stepOf(n).name + '」 —— 下游纹样与烧制结果已重置，请重新进行。');
  }

  /* 重置整个流程：清空进度记录、烧制计数，回到初始塑坯态（resetAll 末尾调用） */
  function flowReset() {
    flow.stage = 1;
    flow.max = 1;
    flow.done = {};
    flow.burnTotal = 0;
    recState.era = '';          // 重置后重新开始推荐轮次
    recState.idx = -1;
    recState.prefer = '';
    hideShapeRec();
    try { localStorage.removeItem('bw_burn_total'); } catch (e) { /* 静默 */ }
    flowSync();
  }

  /* ?demo 演示模式：跳过全部解锁判定，直达烧成态 */
  function flowUnlockAll() {
    flow.stage = 6;
    flow.max = 6;
    FLOW_STEPS.forEach(function (s) { flow.done[s.n] = true; });
    flowSync();
  }

  /* 温柔引导提示：强行操作锁定控件时劝返（不粗暴报错） */
  function flowGuide(need) {
    flowToast('✿ 「' + stepOf(need).name + '」还未解锁哦 —— 请先完成当前工序「' +
      stepOf(flow.stage).name + '」');
  }

  /* 底部居中提示条（任务气泡） */
  var flowToastTimer = null;
  function flowToast(text) {
    if (!text) return;
    var t = $('flowToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'flowToast';
      t.className = 'flow-toast';
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(flowToastTimer);
    flowToastTimer = setTimeout(function () { t.classList.remove('show'); }, 4600);
  }

  /* 锁定拦截：捕获阶段的 click / pointerdown / Enter 一律温柔劝返 */
  function flowGuard() {
    function needOf(t) {
      var g = t && t.closest ? t.closest('[data-flow]') : null;
      if (!g) return 0;
      var need = +g.getAttribute('data-flow');
      return need > flow.stage ? need : 0;
    }
    function soft(ev) {
      var need = needOf(ev.target);
      if (!need) return;
      ev.preventDefault();
      ev.stopPropagation();
      flowGuide(need);
    }
    document.addEventListener('click', soft, true);
    document.addEventListener('pointerdown', soft, true);
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return;
      var need = needOf(ev.target);
      if (!need) return;
      ev.preventDefault();
      ev.stopPropagation();
      flowGuide(need);
    }, true);
  }

  /* ---- 各工序完成判定（由主链路钩子调用） ---- */
  /* ① 择朝塑坯：手动捏塑 / 点选器型 / AI 推荐任一即成（src: pinch|card|ai）
     只解锁不跳转 —— 停留在①视图，「下一步」亮起由用户点击进入② */
  function flowShapeTouched(src) {
    if (flow.done[1]) return;
    flow.done[1] = true;
    flowUnlock(2, (src === 'ai' ? '✦ AI 已起坯' : '✦ 坯体已成') +
      ' —— 「下一步」已亮起，点击进入精调形制。');
  }
  /* ③ 施纹绘彩：纹样成功映射到器身即成（applyPattern / applyGenerated 钩子）
     只解锁不跳转 —— 「下一步」亮起，进入入窑烧制 */
  function flowPatternDone() {
    if (flow.done[3]) return;
    flow.done[3] = true;
    flowUnlock(5, '✦ 青花已绘成 —— 「下一步」已亮起，进入入窑烧制。');
  }
  /* ④ 入窑烧制：完成一窑即解锁鉴评归档（不自动跳转，出窑停留在烧制看鉴评卡）；
     烧制轮次持久累计（强制迭代） */
  function flowBurnDone() {
    flow.burnTotal++;
    try { localStorage.setItem('bw_burn_total', String(flow.burnTotal)); } catch (e) { /* 静默 */ }
    if (!flow.done[5]) {
      flow.done[5] = true;
      flowUnlock(6, '✦ 开窑大吉（第 ' + fire.iter + ' 烙 · 累计 ' + flow.burnTotal + ' 窑）—— 「下一步」已亮起，鉴评归档可入库。');
    } else {
      flowToast('✦ 第 ' + fire.iter + ' 烙出窑（累计 ' + flow.burnTotal + ' 窑）—— 每窑皆新生，可继续迭代或入库。');
    }
  }
  /* ⑤ 鉴评归档：成品入库完成提示 */
  function flowArchiveDone() {
    flowToast('✦ 作品已题名入库 —— 可继续迭代烧制、时光漫游，或点「重置」另起一器。');
  }

  /* ==================== 15. 启动 ==================== */
  function boot() {
    /* 纹样推荐面板改挂到 body：纹样库所在的 .bot-block 带 backdrop-filter，
       会成为 position:fixed 的包含块，面板会被挤到视口角落/外面（旧版「AI 推荐没反应」的真因） */
    var aiPanelEl = $('aiPanel');
    if (aiPanelEl && aiPanelEl.parentNode !== document.body) document.body.appendChild(aiPanelEl);

    /* 本机多档案作品集：初始化当前用户档案（没有则建「本机访客」） */
    initWorks();

    /* 纹样已内嵌为 base64 库（window.PATTERN_EMBED），file:// 双击直开与 http 模式
       功能完全一致：真实纹样贴坯、烧制、鉴评全链路均可正常使用 */

    state.params = arrToParams(currentShape().d);

    buildEraTabs();
    buildShapeList();
    buildPatterns();
    buildRegions();
    buildDensity();
    buildTones();
    buildParams();
    syncParamUI();
    syncRegionUI();
    syncDensityUI();
    syncToneUI();

    Array.prototype.forEach.call(eraTabsEl.children, function (el) {
      var on = el.dataset.era === state.era;
      el.classList.toggle('on', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    if (!window.THREE) {
      stageEl.insertAdjacentHTML('beforeend',
        '<div style="position:absolute;inset:0;display:grid;place-items:center;z-index:9;' +
        'color:#c8a96b;font-size:13px;letter-spacing:.1em;text-align:center;padding:20px">' +
        'Three.js 未加载<br>请检查 assets/js/vendor/three.min.js</div>');
      return;
    }

    initThree();
    rebuildPot(false);
    setFinish(0);
    setMode('pinch');
    updateHud();
    bindStage();
    bindUI();

    /* 工序流程控制器：构建进度条 + 安装锁定拦截（新增） */
    flowInit();
    flowGuard();

    // 注册 AI 推荐引擎的纹样知识库
    if (window.AIAdvisor) AIAdvisor.registerPool(poolAll());
    // 注册器型智能辅助的器型池
    registerShapePool();

    requestAnimationFrame(tick);

    // URL 直达：?era=qing 切朝代，配合 ?demo 自动铺纹烧制，方便展示与测试
    var mEra = location.search.match(/[?&]era=([a-z]+)/);
    if (mEra && eraOf(mEra[1]) && mEra[1] !== state.era) switchEra(mEra[1]);

    // 演示模式：URL 带 ?demo 时自动铺纹并烧制成青花，方便展示快速出效果
    if (/[?&]demo/.test(location.search)) {
      flowUnlockAll();   // 演示模式跳过全部工序解锁判定
      var demoEra = eraOf(state.era);
      applyPattern(demoEra.patterns[1]);
      setTimeout(function () { generateWork(); }, 1200);
    }

    // ?gen=描述 直达 AI 纹样创作并自动贴上器身（测试/演示两用）
    var mGen = location.search.match(/[?&]gen=([^&]+)/);
    if (mGen && window.AITexture) {
      flowUnlockAll();   // URL 直达属测试通道，跳过工序解锁判定
      $('genTheme').value = decodeURIComponent(mGen[1]);
      openAIPanel();
      aiMode = 'free';
      renderAIRecs();
      setTimeout(function () { runGenerate(undefined, true); }, 300);
    }

    setTimeout(function () { $('stageTip').classList.add('fade'); }, 12000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
