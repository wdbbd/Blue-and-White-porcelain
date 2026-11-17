/* ============================================================
   器型智能辅助引擎 · ai-shape.js
   ------------------------------------------------------------
   对应两套提示词的本地实现（输出与提示词约定一致的 JSON）：
   ① recommend({dynasty, prefer})  智能推荐器型
      → { type:'dynasty_shape_recommend', recommend_name, dynasty,
          params:{7 项规格参数}, params_full:{10 项内部滑块值},
          note 推荐理由/适配说明, risk 风险提示, shape_id }
   ② reshape({params, dynasty, shape_kind, free})  AI 重塑
      → { type:'ai_reshape', original_score, optimized_params,
          modify_list[], suggestion }
   约束（避坑指令）：
   · 不生成三维模型，只输出参数集合；
   · AI 只做推荐 / 评估 / 微调，最终控制权留给用户（可拒绝）；
   · 自由创作模式：只提示并矫正畸形，不强改朝代范式。
   ------------------------------------------------------------
   真实接口对接：AIShape.configure({ endpoint }) 后 run() 改为
   POST {prompt_type, vars}；未配置走本地知识库（零网络依赖）。
   ============================================================ */
(function () {
  'use strict';

  var cfg = { endpoint: '' };
  function configure(o) { for (var k in o) cfg[k] = o[k]; }

  /* ---------- 器型类别中文名 ---------- */
  var FAM_CN = {
    vase: '瓶', bottle: '瓶', yuhuchun: '瓶', moon: '瓶', gourd: '瓶', stack: '瓶',
    jar: '罐', bowl: '碗', cup: '杯', dish: '盘', teapot: '壶'
  };

  /* ---------- 内部滑块值 → 物理尺寸（与页面 P 换算一致） ---------- */
  var CONV = {
    h: function (v) { return 18 + v * 0.28; },        // 总高 cm
    mouth: function (v) { return 2 + v * 0.18; },     // 口径 cm
    belly: function (v) { return 6 + v * 0.26; },     // 腹径 cm
    foot: function (v) { return 2 + v * 0.16; },      // 底径 cm
    wall: function (v) { return 0.25 + v * 0.0125; }  // 壁厚 cm
  };
  function phys(key, v) { return CONV[key] ? Math.round(CONV[key](v) * 10) / 10 : v; }

  /* ---------- 器型池（由页面注册） ---------- */
  var POOL = [];   // {eraId, eraName, eraNote, id, name, fam, d[10]}
  function registerShapes(eras) {
    POOL = [];
    (eras || []).forEach(function (e) {
      e.shapes.forEach(function (s) {
        POOL.push({ eraId: e.id, eraName: e.name, eraNote: e.note, id: s.id, name: s.name, fam: s.fam, d: s.d });
      });
    });
  }

  /* ---------- 稳定伪随机（同输入同结果，便于演示复现） ---------- */
  function hashStr(s) {
    var h = 9;
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 387420489);
    return h >>> 0;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ============================================================
     ① 智能推荐：朝代（+ 器类偏好）→ 代表器型 + 初始参数集
     ============================================================ */
  function recommend(vars) {
    var dynasty = vars.dynasty || '元代';
    var prefer = vars.prefer || '';
    var era = null, i;
    for (i = 0; i < POOL.length; i++) if (POOL[i].eraName === dynasty) { era = POOL[i]; break; }
    var pool = POOL.filter(function (p) { return p.eraName === dynasty; });
    if (!pool.length) pool = POOL.slice();

    // 有器类偏好（瓶/碗/罐…）优先匹配；否则取该朝代代表器型（列表首位）
    var cand = pool;
    if (prefer) {
      var hit = pool.filter(function (p) { return FAM_CN[p.fam] === prefer; });
      if (hit.length) cand = hit;
    }
    var pick = cand[hashStr(dynasty + prefer) % cand.length];

    // 在馆藏级默认参数上做 ±3 的轻微扰动，模拟"AI 推荐一套参数"
    var seed = hashStr(pick.id + '|' + dynasty);
    var full = pick.d.map(function (v, k) {
      var j = ((seed >> (k * 3)) % 7) - 3;   // -3 ~ +3
      return clamp(Math.round(v + j), 2, 99);
    });

    /* 规格参数（提示词约定的 7 项） */
    var params = {
      total_height: phys('h', full[0]),
      mouth_diameter: phys('mouth', full[1]),
      belly_diameter: phys('belly', full[2]),
      foot_height: phys('foot', full[3]),
      rim_ratio: full[7],
      wall_thickness: phys('wall', full[6]),
      curve_factor: full[9]
    };

    var note = '推荐「' + pick.name + '」：' + (pool[0] ? pool[0].eraNote : '') +
      '。' + FAM_CN[pick.fam] + '类器形，腹径 ' + params.belly_diameter +
      'cm 与总高 ' + params.total_height + 'cm 比例贴合' + dynasty + '典型审美；' +
      '参数已同步到右侧滑块，可继续微调或捏塑。';
    var risk = dynasty === '元代'
      ? '元代器型厚重，腹部较鼓，拖动口沿参数过大易失稳重感。'
      : dynasty === '清代'
        ? '清代兼有纤秀与丰腴两款，颈部参数不宜过分拉长以免比例失调。'
        : '注意口径与腹径比例，翻沿过大会破坏器物轮廓线。';

    return Promise.resolve({
      type: 'dynasty_shape_recommend',
      recommend_name: pick.name,
      dynasty: dynasty,
      shape_id: pick.id,
      params: params,
      params_full: full,
      note: note,
      risk: risk
    });
  }

  /* ============================================================
     ② AI 重塑：评估当前轮廓 → 保留意图的柔和矫正
     vars = { params:{10 项内部值}, dynasty, shape_kind, free }
     ============================================================ */
  var KEYS = ['h', 'mouth', 'belly', 'foot', 'neck', 'shoulder', 'wall', 'flare', 'sArc', 'bCurve'];
  var KEY_CN = {
    h: '总高', mouth: '口径', belly: '腹径', foot: '底径', neck: '颈长',
    shoulder: '肩宽', wall: '壁厚', flare: '口沿外翻', sArc: '肩部弧度', bCurve: '腹部曲线'
  };

  /* 朝代审美目标区间（内部 0-100 刻度） */
  function dynastyRange(dynasty) {
    // [key]: [min, max] 舒适区
    var base = {
      h: [30, 88], mouth: [12, 70], belly: [40, 90], foot: [18, 66],
      neck: [4, 78], shoulder: [24, 84], wall: [18, 62], flare: [8, 78],
      sArc: [30, 84], bCurve: [34, 82]
    };
    if (dynasty === '元代') { base.belly = [58, 94]; base.foot = [26, 62]; base.h = [40, 86]; }
    if (dynasty === '明代') { base.h = [38, 84]; base.mouth = [12, 58]; }
    if (dynasty === '清代') { base.neck = [10, 88]; base.h = [42, 92]; }
    if (dynasty === '宋代') { base.h = [46, 92]; base.mouth = [8, 52]; }
    return base;
  }

  /* 单项检查：畸形（硬伤）与朝代偏离（软伤） */
  function audit(p, range, shapeCN) {
    var hard = [], soft = [], k, v;
    // 硬伤：任何模式下都要提示
    if (p.wall < 8) hard.push(['wall', 14, '壁厚过薄，烧成易塌陷变形']);
    if (p.wall > 80) hard.push(['wall', 10, '壁厚过厚，器物显得笨拙']);
    if (p.flare > 88) hard.push(['flare', 12, '口沿外翻过度，轮廓线断裂']);
    if (p.belly < 22 && shapeCN !== '杯') hard.push(['belly', 14, '腹部过瘪，失去张力']);
    if (p.mouth > 88 && shapeCN !== '碗' && shapeCN !== '盘') hard.push(['mouth', 14, '口径过大，近乎敞口，比例怪异']);
    if (p.h > 95 || p.h < 6) hard.push(['h', 12, '总高超出常规，重心失稳']);
    if (p.foot > 82 && shapeCN !== '盘') hard.push(['foot', 10, '底径过大，头轻脚重']);
    // 软伤：朝代范式偏离（仿古矫正模式下修，自由创作只提示）
    // 连续计分：偏离越多扣越多，应用修改把参数拉回舒适区后分数自然回升
    for (k in range) {
      v = p[k];
      var lo = range[k][0], hi = range[k][1];
      if (v < lo - 1.5) {
        var dev = lo - v;
        soft.push([k, clamp(dev * 0.55, 0.6, 12), KEY_CN[k] + '低于该朝代舒适区 ' + Math.round(dev) + '，形体偏紧']);
      } else if (v > hi + 1.5) {
        var dev2 = v - hi;
        soft.push([k, clamp(dev2 * 0.55, 0.6, 12), KEY_CN[k] + '超出该朝代舒适区 ' + Math.round(dev2) + '，形体偏松']);
      }
    }
    return { hard: hard, soft: soft };
  }

  /* 评估侧重：只影响评语措辞（分数始终由当前状态决定，重评同分） */
  var FOCUS = [
    { k: 'surface',    cn: '釉面平整' },
    { k: 'proportion', cn: '比例关系' },
    { k: 'silhouette', cn: '轮廓线条' },
    { k: 'balance',    cn: '重心稳度' }
  ];
  var lastFocus = -1;

  function reshape(vars) {
    var p = vars.params || {};
    var dynasty = vars.dynasty || '元代';
    var shapeCN = vars.shape_kind || '瓶';
    var free = !!vars.free;
    var range = dynastyRange(dynasty);
    var res = audit(p, range, shapeCN);
    var surf = vars.surface || null;      /* 页面实测的表面起伏（捏塑形变 dR / dY） */

    var fi = Math.floor(Math.random() * FOCUS.length);
    if (fi === lastFocus && FOCUS.length > 1) {
      fi = (lastFocus + 1 + Math.floor(Math.random() * (FOCUS.length - 1))) % FOCUS.length;
    }
    lastFocus = fi;
    var focus = FOCUS[fi];

    /* 1) 三类扣分：硬伤 / 朝代偏离（自由创作不计） / 表面起伏 */
    var hardPen = 0, softPen = 0, i;
    for (i = 0; i < res.hard.length; i++) hardPen += res.hard[i][1];
    for (i = 0; i < res.soft.length; i++) softPen += res.soft[i][1];
    var surfacePen = surf ? clamp((100 - surf.smooth) * 0.62, 0, 60) : 0;

    /* 2) 分数完全由当前状态决定（同坯重评必同分）：
       硬伤 + 朝代偏离 + 表面起伏，应用修改后三项都会下降 → 分数回升 */
    var score = clamp(Math.round(
      100 - 6 - hardPen - (free ? 0 : softPen) - surfacePen
    ), 18, 98);

    /* 3) 修正方案：参数只做「保留意图」的柔和回拉，表面起伏交给页面做平滑 */
    var opt = {}, changes = {}, modify = [], k, v, target;
    for (i = 0; i < KEYS.length; i++) { k = KEYS[i]; opt[k] = Math.round(p[k]); }
    var pulls = [], hardKeys = {};
    for (i = 0; i < res.hard.length; i++) { pulls.push([res.hard[i][0], 0.45, true, res.hard[i][2]]); hardKeys[res.hard[i][0]] = 1; }
    if (!free) for (i = 0; i < res.soft.length; i++) {
      if (hardKeys[res.soft[i][0]]) continue;   // 已有硬伤修正的参数跳过软伤
      pulls.push([res.soft[i][0], 0.5, false, res.soft[i][2]]);
    }

    var softNotes = [
      '贴合' + dynasty + '范式，保留你的造型走向',
      '向' + dynasty + '典型器物靠拢，创意意图保留',
      dynasty + '化柔化，主体仍是你的比例',
      '参照' + dynasty + '馆藏器微调，手感不变'
    ];
    for (i = 0; i < pulls.length; i++) {
      k = pulls[i][0];
      v = p[k];
      var r = range[k] || [25, 75];
      if (v < r[0]) target = r[0] + (r[1] - r[0]) * 0.12;
      else if (v > r[1]) target = r[1] - (r[1] - r[0]) * 0.12;
      else continue;
      var nv = Math.round(v + (target - v) * pulls[i][1]);
      if (nv !== v) {
        opt[k] = nv;
        changes[k] = nv;
        modify.push(KEY_CN[k] + '：' + v + ' → ' + nv +
          (pulls[i][2] ? '（' + pulls[i][3] + '）'
                       : '（' + softNotes[Math.floor(Math.random() * softNotes.length)] + '）'));
      }
    }

    /* 表面起伏放在清单首位：应用修改的主效果就是「把器身抹平」 */
    var zones = (surf && surf.zones && surf.zones.length) ? surf.zones.join('、') : '器身';
    var hasSurfaceItem = false;
    if (surf && surf.smooth < 96) {
      var bumpTxt = (surf.bumps || 0) > 0 ? '（' + surf.bumps + ' 处明显起伏）' : '';
      modify.unshift('表面平整度 ' + surf.smooth + '/100：' + zones +
        '最大起伏 ' + (surf.maxDev || 0).toFixed(1) + ' cm' + bumpTxt +
        (surf.smooth < 85 ? '，应用后做平滑校正' : '，应用后可再收顺'));
      hasSurfaceItem = true;
    }
    var mParam = modify.length - (hasSurfaceItem ? 1 : 0);

    /* 4) 应用后的平滑力度：越粗糙保留越少，轻微手作保留更多（一次应用就要明显变平） */
    var keep = !surf ? 0 : (surf.smooth >= 88 ? 0.50 : surf.smooth >= 70 ? 0.30 : 0.14);
    var expected = surf ? clamp(Math.round(100 - (100 - surf.smooth) * keep * 0.9), 30, 99) : null;

    /* 5) 综合建议话术池：按档位 + 本次关注点 + 实测数值组合，措辞不再固定 */
    var m = modify.length;
    var flat = surf ? surf.smooth : null;
    var flatTxt = flat === null ? '' : '表面平整度 ' + flat + '/100';
    var rough = !!surf && surf.smooth < 96;
    var POOLS = {
      hi: [
        function () { return flatTxt + (rough
          ? '，' + zones + '仍有起伏，采纳下方平滑后会明显更顺。'
          : '，釉面平顺' + (mParam ? '，另有 ' + mParam + ' 处参数细调。' : '，保持即可。')) + '本次侧重' + focus.cn + '。'; },
        function () { return '评估 ' + score + ' 分：骨架端正、比例成立，' + (mParam ? '微调 ' + mParam + ' 处更显挺拔。' : '可直接进入施纹绘彩。'); },
        function () { return '线条流畅，' + dynasty + '气韵到位；' + (m ? '已给出 ' + m + ' 项柔化建议（侧重' + focus.cn + '）。' : flatTxt + '，' + focus.cn + '也在舒适区。'); },
        function () { return '整体稳重大方' + (rough
          ? '，' + zones + '还有起伏，采纳平滑后更贴近' + dynasty + '典型器。'
          : (mParam ? '，' + mParam + ' 处微调后更显挺拔。' : '，' + focus.cn + '与釉面都在舒适区。')); },
        function () { return '本次从' + focus.cn + '切入：' + (m ? '发现 ' + m + ' 处可优化，幅度都很轻，可放心采纳。' : '没有发现需要改动的地方。'); }
      ],
      mid: [
        function () { return '整体成立，' + (rough
          ? flatTxt + '，' + zones + '起伏偏大，建议先做平滑校正。'
          : (free ? '存在偏离但已标记，改不改由你。' : '已按' + dynasty + '审美生成 ' + mParam + ' 项参数微调，主要创意全部保留。')); },
        function () { return '评估 ' + score + ' 分：' + (rough ? '釉面起伏偏大（' + flat + '/100），' : '') + (mParam ? '另有 ' + mParam + ' 处参数偏离舒适区，' : '') + '本次侧重' + focus.cn + '，' + (free ? '仅提示不强制。' : '采纳后弧线会更顺。'); },
        function () { return '器形基本可信' + (m ? '，下方 ' + m + ' 项建议能让重心更稳、弧度更顺。' : '，保持即可。') + '（本次侧重' + focus.cn + '）'; },
        function () { return flatTxt + '；' + (rough ? '表面需要一次平滑，' : '') + (free ? '自由创作模式只标风险，不动你的比例。' : '参数会做轻微回拉，主体仍按你的手感保留。'); }
      ],
      low: [
        function () { return '轮廓与表面偏差较大（' + score + ' 分）' + (surf ? '，最大起伏 ' + surf.maxDev.toFixed(1) + ' cm' : '') + (free ? '，已逐条标出风险。' : '，已生成 ' + m + ' 项修正方案；也可切到自由创作保留怪器风格。'); },
        function () { return '评估仅 ' + score + ' 分：' + (rough ? '釉面起伏明显，烧成易塌釉。' : '比例接近临界。') + '建议采纳下方平滑与微调，' + (free ? '或继续保持现有造型。' : '改动仍可先点「保持原样」放弃。'); },
        function () { return m + ' 处需要处理，' + (rough ? '其中表面起伏影响最大（' + flatTxt + '）' : '集中在比例与轮廓') + '。' + (free ? '风险已标记。' : '按' + dynasty + '审美平滑回拉后更耐看。'); }
      ]
    };
    var tier = score >= 85 ? 'hi' : score >= 60 ? 'mid' : 'low';
    var sugg = POOLS[tier];
    var suggestion = sugg[Math.floor(Math.random() * sugg.length)]();

    return Promise.resolve({
      type: 'ai_reshape',
      original_score: score,
      optimized_params: opt,
      param_changes: changes,          /* 仅引擎点名要改的参数，页面据此做柔和过渡 */
      modify_list: modify,
      suggestion: suggestion,
      focus: focus.cn,
      surface_plan: surf ? {
        current: surf.smooth,
        expected: expected,
        keep: keep,
        max_dev: surf.maxDev,
        zones: surf.zones
      } : null
    });
  }

  /* ---------- 快速评分（滑块拖动时的畸形风险提示） ---------- */
  function quickScore(p, dynasty, shapeCN) {
    var res = audit(p, dynastyRange(dynasty), shapeCN);
    var pen = 0, i;
    for (i = 0; i < res.hard.length; i++) pen += res.hard[i][1];
    return { score: clamp(100 - pen, 20, 100), hard: res.hard };
  }

  /* ---------- 统一入口（预留真实接口） ---------- */
  function run(promptType, vars) {
    if (cfg.endpoint) {
      return fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_type: promptType, vars: vars })
      }).then(function (res) { return res.json(); });
    }
    if (promptType === 'dynasty_shape_recommend') return recommend(vars);
    return reshape(vars);
  }

  window.AIShape = {
    configure: configure,
    run: run,
    recommend: recommend,
    reshape: reshape,
    quickScore: quickScore,
    registerShapes: registerShapes,
    famCN: FAM_CN
  };
})();
