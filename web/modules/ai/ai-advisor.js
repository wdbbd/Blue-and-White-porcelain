/* ============================================================
   青花 AI 纹样推荐引擎 · ai-advisor.js
   ------------------------------------------------------------
   实现三套推荐提示词的本地知识库版本，输出与提示词约定完全一致的
   JSON 结构，供前端直接解析：
     ① dynastyRecommend(朝代, 器型, 区域)  → 朝代限定推荐
     ② freeRecommend(器型, 区域)           → 自由创作推荐（无朝代）
     ③ adaptCheck(选中纹样, 器型, 区域)     → 适配检测 + 替换建议
   每条推荐含：纹样名称 / 风格描述 / 适配分(0-100) / 适合区域 /
              布局建议 / 风险提示 / 替换候选
   ------------------------------------------------------------
   接入真实大模型：调用 AIAdvisor.configure({ endpoint: '...' })，
   run() 会改为 POST {prompt_type, vars} 到你的接口；
   未配置时使用本地知识库即时计算（无网络依赖，答辩演示零风险）。
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 器型归类：家族 → 提示词用器型名 ---------- */
  var FAMILY_CN = {
    vase: '瓶', bottle: '瓶', yuhuchun: '瓶', moon: '瓶', gourd: '瓶', stack: '瓶',
    jar: '罐', bowl: '碗', cup: '杯', dish: '盘', teapot: '壶'
  };

  /* ---------- 区域键 → 提示词用区域名 ---------- */
  var REGION_CN = { mouth: '口沿', neck: '颈部', shoulder: '肩部', belly: '腹部', foot: '底足', all: '通身' };
  var CN_REGION = { 口沿: 'mouth', 颈部: 'neck', 肩部: 'shoulder', 腹部: 'belly', 底足: 'foot', 足部: 'foot', 通身: 'all' };

  /* ---------- 纹样知识库：按名称关键词归类 ---------- */
  /* cat: 缠枝 | 边饰 | 团花 | 瑞兽 | 人物山水 | 花卉 | 云纹 | 特殊 */
  var CAT_RULES = [
    { kw: ['缠枝', '卷草', '蔓草'], cat: '缠枝' },
    { kw: ['回纹', '弦纹', '菱形', '方格', '锦地', '几何', '镂空'], cat: '边饰' },
    { kw: ['宝相', '团花', '莲瓣', '八宝', '杂宝', '云肩', '如意'], cat: '团花' },
    { kw: ['龙', '凤', '瑞兽', '鱼藻', '麒麟'], cat: '瑞兽' },
    { kw: ['山水', '人物', '婴戏', '博古', '故事'], cat: '人物山水' },
    { kw: ['花鸟', '折枝', '花卉', '牡丹', '菊花', '西洋', '荷塘', '莲纹', '花果'], cat: '花卉' },
    { kw: ['云鹤', '云纹', '海水', '江崖', '鱼藻'], cat: '云纹' }
  ];
  function catOf(name) {
    for (var i = 0; i < CAT_RULES.length; i++) {
      var r = CAT_RULES[i];
      for (var j = 0; j < r.kw.length; j++) if (name.indexOf(r.kw[j]) >= 0) return r.cat;
    }
    return '花卉';
  }

  /* ---------- 类别 → 各区域基础分 / 布局建议 ---------- */
  /* 区域优先级：belly 腹主区 > shoulder 肩 > neck 颈 > mouth 口沿 > foot 底足 > all 通身 */
  var CAT_BASE = {
    缠枝:    { belly: 93, shoulder: 80, neck: 62, mouth: 55, foot: 42, all: 86 },
    花卉:    { belly: 88, shoulder: 82, neck: 60, mouth: 42, foot: 38, all: 76 },
    团花:    { belly: 76, shoulder: 84, neck: 48, mouth: 40, foot: 55, all: 66 },
    瑞兽:    { belly: 90, shoulder: 72, neck: 44, mouth: 34, foot: 36, all: 70 },
    人物山水: { belly: 84, shoulder: 62, neck: 36, mouth: 28, foot: 26, all: 64 },
    云纹:    { belly: 74, shoulder: 88, neck: 78, mouth: 60, foot: 44, all: 78 },
    边饰:    { belly: 52, shoulder: 74, neck: 84, mouth: 92, foot: 86, all: 62 },
    特殊:    { belly: 70, shoulder: 66, neck: 50, mouth: 46, foot: 40, all: 60 }
  };
  var CAT_LAYOUT = {
    缠枝: '环形连续平铺',
    花卉: '环形连续 / 等距散点',
    团花: '独立团花等距排布',
    瑞兽: '通景式主画布局',
    人物山水: '开光式分段布局',
    云纹: '环形带状辅纹',
    边饰: '环形边饰带',
    特殊: '分层带状布局'
  };
  var CAT_DESC = {
    缠枝: '花头连续、枝蔓回旋，曲面延展性最佳',
    花卉: '花姿舒展、疏密有致，适合主视面',
    团花: '圆形成章、向心对称，肩腹点缀端正',
    瑞兽: '气势磅礴、笔力雄浑，主腹最能撑住场面',
    人物山水: '场景叙事、留白意境，宜开光呈现',
    云纹: '流转轻盈、过渡自然，擅长填補与衔接',
    边饰: '几何韵律、周而复始，狭长曲面不变形',
    特殊: '工艺特殊、层次丰富，需配合分段装饰'
  };

  /* ---------- 器型修正：碗/杯/盘腹部按"碗腹"逻辑评估 ---------- */
  function shapeAdjust(cat, region, shapeCN) {
    var d = 0;
    var smallBelly = (shapeCN === '碗' || shapeCN === '杯' || shapeCN === '盘');
    if (smallBelly && region === 'belly') {
      if (cat === '团花') d += 10;           // 碗腹优先团花、莲纹、八宝
      if (cat === '人物山水') d -= 8;        // 小曲面上人物易失真
      if (cat === '瑞兽') d -= 4;
    }
    if (shapeCN === '杯' && region === 'foot' && cat === '边饰') d += 4; // 小底足宜简边饰
    return d;
  }

  /* ---------- 风险提示文案 ---------- */
  function riskOf(cat, region, score) {
    if (score >= 80) return '';
    if (region === 'mouth' || region === 'neck') {
      if (cat === '瑞兽' || cat === '人物山水') return '狭长口沿铺大题材易拉伸变形，建议移至主腹或改用边饰';
      if (cat === '缠枝' || cat === '花卉') return '口沿曲面窄长，花头过密易挤压，建议降低密度';
    }
    if (region === 'foot') return '底足面积小，繁密纹样易显杂乱，宜用简洁边饰';
    if (region === 'all' && (cat === '人物山水' || cat === '瑞兽')) return '通身铺展需分段呼应，单一题材通铺易比例失调';
    if (region === 'belly' && cat === '边饰') return '主腹用细边饰会显得空旷，建议换连续缠枝或主花';
    return '该纹样与目标曲面匹配度一般，注意密度与拉伸比例';
  }

  /* ---------- 伪随机（同输入稳定，避免每次刷新分数跳动） ---------- */
  function jitter(seedStr) {
    var h = 0;
    for (var i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) & 0x7fffffff;
    return (h % 7) - 3; // -3 ~ +3
  }
  function clamp(v) { return Math.max(5, Math.min(100, Math.round(v))); }

  /* ---------- 核心：给一组纹样按 (区域, 器型) 打分排序 ---------- */
  function scoreList(pats, region, shapeCN, limit) {
    var regionKey = CN_REGION[region] || 'belly';
    var scored = pats.map(function (p) {
      var cat = catOf(p.name);
      var s = (CAT_BASE[cat] || CAT_BASE.花卉)[regionKey] +
              shapeAdjust(cat, regionKey, shapeCN) +
              jitter(p.name + regionKey + shapeCN);
      return {
        pattern_name: p.name,
        _pat: p,
        _cat: cat,
        score: clamp(s),
        style_desc: CAT_DESC[cat] || CAT_DESC.花卉,
        best_region: bestRegionOf(cat),
        layout_suggest: CAT_LAYOUT[cat] || CAT_LAYOUT.花卉,
        risk_note: '',
        alternative: []
      };
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    var top = scored.slice(0, limit || 5);
    top.forEach(function (r, i) {
      r.risk_note = riskOf(r._cat, regionKey, r.score);
      // 替换候选：取榜上相邻两名（不同名），语义即"可平替的纹样"
      r.alternative = scored
        .filter(function (o, j) { return o !== r && j < 8; })
        .slice(0, 2).map(function (o) { return o.pattern_name; });
    });
    return { scored: scored, top: top };
  }
  function bestRegionOf(cat) {
    var base = CAT_BASE[cat] || CAT_BASE.花卉;
    var best = 'belly', bv = -1;
    for (var k in base) if (base[k] > bv) { bv = base[k]; best = k; }
    return REGION_CN[best];
  }

  /* ---------- 全量纹样池（由页面注册，避免重复维护数据） ---------- */
  var POOL = [];               // {id,name,src,thumb,eraId,eraName}
  function registerPool(list) { POOL = list || []; }
  function byName(name) {
    for (var i = 0; i < POOL.length; i++) if (POOL[i].name === name) return POOL[i];
    return null;
  }

  /* ============================================================
     ① 朝代限定推荐
     ============================================================ */
  function dynastyRecommend(dynasty, shapeType, decorRegion) {
    var pool = POOL.filter(function (p) { return p.eraName === dynasty; });
    if (!pool.length) pool = POOL.slice();
    var r = scoreList(pool, decorRegion, shapeType, Math.min(6, Math.max(4, pool.length)));
    return {
      result_type: 'dynasty_recommend',
      dynasty: dynasty, shape_type: shapeType, decor_region: decorRegion,
      recommend_list: r.top.map(clean)
    };
  }

  /* ============================================================
     ② 自由创作推荐（无朝代约束）
     ============================================================ */
  function freeRecommend(shapeType, decorRegion) {
    // 同名纹样（跨朝代借用）只保留一份，避免列表出现重复项
    var seen = {}, pool = [];
    POOL.forEach(function (p) { if (!seen[p.name]) { seen[p.name] = 1; pool.push(p); } });
    var r = scoreList(pool, decorRegion, shapeType, 6);
    return {
      result_type: 'free_create_recommend',
      shape_type: shapeType, decor_region: decorRegion,
      recommend_list: r.top.map(clean)
    };
  }

  /* ============================================================
     ③ 适配检测：校验选中纹样，低分给出风险 + 替换建议
     ============================================================ */
  function adaptCheck(selectedPattern, shapeType, decorRegion) {
    var p = byName(selectedPattern);
    if (!p) {
      return { result_type: 'adapt_check', score: 60, judge: '知识库中未收录该纹样，按通用曲面评估。',
               risk_detail: '未收录纹样无法精确评估拉伸与断纹风险。', suggest_replace: [] };
    }
    var regionKey = CN_REGION[decorRegion] || 'belly';
    var cat = catOf(p.name);
    var s = clamp((CAT_BASE[cat] || CAT_BASE.花卉)[regionKey] + shapeAdjust(cat, regionKey, shapeType) + jitter(p.name + regionKey));
    var judge = s >= 80 ? '适配良好：' + cat + '纹样在' + decorRegion + '曲面延展自然，不易断纹。'
              : s >= 65 ? '基本适配：注意平铺密度，避免花头在曲面收口处挤压。'
                        : '适配度偏低：' + cat + '纹样不适合' + decorRegion + '曲面，容易出现拉伸、断纹或比例失调。';
    var reps = [];
    if (s < 75) {
      var sameEra = POOL.filter(function (q) { return q.eraId === p.eraId && q.name !== p.name; });
      reps = scoreList(sameEra.length ? sameEra : POOL.slice(), decorRegion, shapeType, 3)
        .top.filter(function (o) { return o.score > s; })
        .slice(0, 3).map(function (o) { return o.pattern_name; });
    }
    return {
      result_type: 'adapt_check',
      pattern_name: p.name, shape_type: shapeType, decor_region: decorRegion,
      score: s, judge: judge,
      risk_detail: s < 75 ? riskOf(cat, regionKey, s) : '',
      suggest_replace: reps
    };
  }

  /* ---------- 清洗：去掉内部引用，保证输出即约定 JSON ---------- */
  function clean(r) {
    return {
      pattern_name: r.pattern_name,
      style_desc: r.style_desc,
      score: r.score,
      best_region: r.best_region,
      layout_suggest: r.layout_suggest,
      risk_note: r.risk_note,
      alternative: r.alternative
    };
  }

  /* ============================================================
     对外接口：run() 统一入口（预留 LLM 端点）
     ============================================================ */
  var cfg = { endpoint: '' };

  function post(endpoint, payload) {
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) { return res.json(); });
  }

  function run(promptType, vars) {
    // 配置了真实接口则走大模型；否则本地知识库即时计算
    if (cfg.endpoint) {
      return post(cfg.endpoint, { prompt_type: promptType, vars: vars });
    }
    return new Promise(function (resolve) {
      if (promptType === 'dynasty_recommend') {
        resolve(dynastyRecommend(vars.dynasty, vars.shape_type, vars.decor_region));
      } else if (promptType === 'free_create_recommend') {
        resolve(freeRecommend(vars.shape_type, vars.decor_region));
      } else {
        resolve(adaptCheck(vars.selected_pattern, vars.shape_type, vars.decor_region));
      }
    });
  }

  window.AIAdvisor = {
    configure: function (o) { for (var k in o) cfg[k] = o[k]; },
    run: run,
    dynastyRecommend: dynastyRecommend,
    freeRecommend: freeRecommend,
    adaptCheck: adaptCheck,
    registerPool: registerPool,
    familyCN: FAMILY_CN,
    regionCN: REGION_CN,
    catOf: catOf
  };
})();
