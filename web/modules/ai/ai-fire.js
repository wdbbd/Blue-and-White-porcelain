/* ============================================================
   AI 烧制闭环引擎 · ai-fire.js
   ------------------------------------------------------------
   对应三套提示词的本地实现（输出与提示词约定一致的 JSON）：
   ① predict(vars)  烧制参数推理
      vars = { dynasty, clay 0-100, pigment 0-100, temp ℃,
               density 纹样密度系数, iteration 已烧次数, pattern_name }
      → { type:'fire_predict', fire_mode, glow_intensity, crack_level,
          color_shift, ai_paint_instruction, risk_note }
   ② repaint(canvas, plan, iteration)  窑变重绘 UV 贴图
      晕散扩散 + 釉面浸润 + 自然开片 + 窑变肌理；
      保留原纹样构图（在成品贴图上叠加演化，不篡改主体）；
      迭代烧制逐轮加深、开片增多；输出仍为 UV 可用贴图。
   ③ appraise(vars)  成品鉴评
      → { type:'porcelain_appraise', score, conclusion, highlight,
          defect_suggest }
   约束：烧制不是滤镜——全部效果由工艺参数驱动；自由创作模式不强制
   古范式；参数极端时给极限效果并提示。
   真实多模态接口：AIFire.configure({ endpoint }) 后 run() 改 POST。
   ============================================================ */
(function () {
  'use strict';

  var cfg = { endpoint: '' };
  function configure(o) { for (var k in o) cfg[k] = o[k]; }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function hashStr(s) {
    var h = 9;
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 387420489);
    return h >>> 0;
  }
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- 朝代典型烧成温度区间（简化工艺常识） ---------- */
  var ERA_TEMP = {
    元代: [1260, 1320], 明代: [1250, 1300], 清代: [1260, 1300],
    宋代: [1220, 1280], 唐代: [1180, 1260]
  };

  /* ============================================================
     ① 烧制参数推理
     ============================================================ */
  function predict(vars) {
    var dynasty = vars.dynasty || '元代';
    var clay = clamp(vars.clay || 60, 0, 100);
    var pigment = clamp(vars.pigment || 55, 0, 100);
    var temp = clamp(vars.temp || 1250, 900, 1400);
    var density = vars.density || 1;
    var iter = vars.iteration || 0;

    /* 类型判断 */
    var fire_mode, glow, crack, shift;
    if (temp < 1150) {
      fire_mode = '低温淡釉';
      glow = Math.round(pigment * 0.34 + (temp - 900) / 40);
      crack = 0;
      shift = '偏浅淡雅，青料呈色偏灰青，釉面温润';
    } else if (temp <= 1280) {
      fire_mode = '常规烧制';
      glow = Math.round(pigment * 0.55 + (temp - 1150) / 6);
      crack = Math.round(clamp((temp - 1180) / 40 + (density - 1) * 2, 0, 2));
      shift = '钴蓝纯正，浓淡层次分明，釉面光洁';
    } else {
      fire_mode = '高温窑变';
      glow = Math.round(pigment * 0.72 + (temp - 1280) / 3.5);
      crack = Math.round(clamp(2 + (temp - 1280) / 25 + (density - 1) * 2.5, 2, 5));
      shift = '浓艳深沉，边缘泛紫黑铁斑，带随机窑变肌理';
    }
    glow = clamp(glow, 5, 100);
    /* 迭代烧制：效果逐轮加深、开片增多 */
    if (iter > 0) {
      glow = clamp(glow + iter * 6, 5, 100);
      crack = clamp(crack + (iter >= 2 ? 1 : 0) + (iter >= 4 ? 1 : 0), 0, 5);
      shift += '；第 ' + (iter + 1) + ' 烉叠加釉层，色泽加深';
    }

    var range = ERA_TEMP[dynasty] || [1220, 1300];
    var risk = '';
    if (temp < range[0] - 30) risk = '低于' + dynasty + '典型成瓷温度（' + range[0] + '-' + range[1] + '℃），胎体可能生烧，青花浮而不定。';
    else if (temp > range[1] + 30) risk = '超出' + dynasty + '工艺温度上限（' + range[0] + '-' + range[1] + '℃），易流釉粘连与过度窑变。';
    else if (dynasty === '清代' && temp > range[1] + 8) risk = '清代青花讲究细腻，温度偏高会失其精丽。';
    else if (dynasty === '元代' && pigment < 30) risk = '元代苏麻离青料性浓烈，料淡则失其雄浑气。';

    var instruction = '窑变重绘指令：晕散扩散 ' + Math.round(glow / 25) + 'px；' +
      '开片 ' + crack + ' 级（纹路密度随纹样密度 ×' + density + '）；' +
      '色泽 ' + shift + (temp > 1280 ? '；加窑变斑肌理' : '') +
      (iter > 0 ? '；在上一烛建果上叠加第 ' + (iter + 1) + ' 烉釉层' : '；单次烧制') + '。';

    return Promise.resolve({
      type: 'fire_predict',
      fire_mode: fire_mode,
      glow_intensity: glow,
      crack_level: crack,
      color_shift: shift,
      ai_paint_instruction: instruction,
      risk_note: risk,
      /* 内部重绘参数（提示词外的前端补充） */
      _paint: {
        glowPx: Math.round(glow / 25),
        crack: crack,
        kiln: temp > 1280,
        density: density,
        iter: iter,
        seed: hashStr([dynasty, clay, pigment, temp, density, iter].join('|'))
      }
    });
  }

  /* ============================================================
     ② 窑变重绘：在 UV 贴图上做烧制演化（保留纹样主体）
     ============================================================ */
  function repaint(canvas, plan, iter) {
    var p = plan._paint || {};
    var W = canvas.width, H = canvas.height;
    var g = canvas.getContext('2d');
    var rnd = mulberry32(p.seed || 1);

    /* 1. 青料晕散：模糊自叠加，让笔画边缘洇出钴蓝光晕 */
    var glowPx = (p.glowPx || 2) + iter * 0.6;
    if (glowPx >= 1) {
      var tmp = document.createElement('canvas');
      tmp.width = W; tmp.height = H;
      tmp.getContext('2d').drawImage(canvas, 0, 0);
      g.save();
      g.globalAlpha = clamp(0.16 + glowPx * 0.09, 0, 0.5);
      g.filter = 'blur(' + glowPx.toFixed(1) + 'px)';
      g.drawImage(tmp, 0, 0);
      g.filter = 'none';
      g.restore();
    }

    /* 2. 釉面浸润：整面极淡钴蓝罩染（贴图透明区不动，只在有料处浸润） */
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(47, 95, 158, ' + (0.05 + iter * 0.03).toFixed(3) + ')';
    g.fillRect(0, 0, W, H);
    /* 3. 高温窑变斑：几团深蓝/紫铁斑，位置随机、边缘极软 */
    if (p.kiln) {
      var n = 3 + Math.floor(rnd() * 3);
      for (var i = 0; i < n; i++) {
        var cx = rnd() * W, cy = H * (0.2 + rnd() * 0.6), r = 60 + rnd() * 140;
        var grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        var col = rnd() > 0.5 ? '58, 70, 120' : '30, 52, 96';
        grad.addColorStop(0, 'rgba(' + col + ', 0.16)');
        grad.addColorStop(1, 'rgba(' + col + ', 0)');
        g.fillStyle = grad;
        g.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    }
    /* 4. 自然开片：细裂纹网络，纹路数随等级与迭代增加 */
    var lines = (p.crack || 0) * 9 + iter * 4;
    g.strokeStyle = 'rgba(55, 75, 100, 0.16)';
    g.lineWidth = 1;
    for (i = 0; i < lines; i++) {
      var x0 = rnd() * W, y0 = rnd() * H;
      g.beginPath();
      g.moveTo(x0, y0);
      var seg = 3 + Math.floor(rnd() * 4), x = x0, y = y0;
      for (var s = 0; s < seg; s++) {
        x += (rnd() - 0.5) * 46;
        y += (rnd() - 0.35) * 40;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.restore();
    return canvas;
  }

  /* ============================================================
     ③ 成品鉴评
     vars = { dynasty, shape, pattern, plan(fire_predict), free }
     ============================================================ */
  function appraise(vars) {
    var dynasty = vars.dynasty || '元代';
    var plan = vars.plan || {};
    var free = !!vars.free;
    var range = ERA_TEMP[dynasty] || [1220, 1300];
    var temp = vars.temp || 1250;
    var glow = plan.glow_intensity || 50;
    var crack = plan.crack_level || 0;
    var iter = vars.iteration || 0;

    var score = 76;
    var hi = [], de = [];
    if (temp >= range[0] && temp <= range[1]) { score += 8; hi.push('烧成温度贴合' + dynasty + '工艺区间'); }
    else if (!free) { score -= 7; de.push('温度偏离' + dynasty + '典型区间（' + range[0] + '-' + range[1] + '℃）'); }
    else { score += 2; }

    if (glow >= 40 && glow <= 78) { score += 6; hi.push('料色浓淡得宜，晕散自然'); }
    else if (glow > 78) { de.push('料色过艳，晕散略过头'); score -= 4; }
    else { de.push('发色偏淡，可适当提高料浓或温度'); score -= 4; }

    if (crack >= 1 && crack <= 3) { score += 6; hi.push('开片细密自然，添古意'); }
    else if (crack > 3) { score -= 8; de.push('开片过密，釉面有惊裂之嫌'); }
    if (iter === 0) hi.push('单次成烧，釉面清亮');
    else if (iter <= 2) { score += 3; hi.push(iter + ' 烉叠烧，釉层厚润'); }
    else { score -= 6; de.push('烧制 ' + (iter + 1) + ' 烉偏多，纹样有积料模糊风险'); }

    score = clamp(Math.round(score), 30, 99);
    var conclusion = free
      ? '自由创作佳作：造型与纹样自成一格，窑火效果' + (score >= 80 ? '颇具偶然天成之趣' : '尚有打磨空间') + '。'
      : '该' + dynasty + '风' + (vars.shape || '器') + '烧成' + (score >= 85 ? '颇为出色，得古瓷气韵' : score >= 70 ? '整体成立，细节尚可推敲' : '与' + dynasty + '工艺尚有距离') + '。';
    var highlight = hi.length ? hi.join('；') + '。' : '釉面完整，青花纹样清晰。';
    var defect = de.length ? de.join('；') + '。' : '几无可挑剔，可尝试更高温度探索窑变趣味。';

    return Promise.resolve({
      type: 'porcelain_appraise',
      score: score,
      conclusion: conclusion,
      highlight: highlight,
      defect_suggest: defect
    });
  }

  /* ============================================================
     ④ 终鉴评（多维评分 + 美化指令）
     vars = { dynasty, free, shape_score, pattern_score, plan, temp,
              iteration, beautified }
     ------------------------------------------------------------
     每次开窑的评分与评语都要有差异：
       · 三项子分带「窑火手感」浮动（±2 以内）+ 序号错位，连续两次必然不同分；
       · 亮点 / 问题按同义话术池随机抽取并打乱顺序，条数与措辞每次不同；
       · 结论按档位从多条话术中随机取，并带入分数与朝代，不再固定一句。
     ============================================================ */
  var appraiseSeq = 0;
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function shuffled(a) {
    var out = a.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  function finalAppraise(vars) {
    var dynasty = vars.dynasty || '元代';
    var free = !!vars.free;
    var plan = vars.plan || {};
    var range = ERA_TEMP[dynasty] || [1220, 1300];
    var temp = vars.temp || 1250;
    var iter = vars.iteration || 0;
    var glow = plan.glow_intensity || 50;
    var crack = plan.crack_level || 0;
    var seq = appraiseSeq++;

    /* 釉色质感分（工艺驱动） */
    var glaze = 72;
    var hi = [], de = [];
    if (temp >= range[0] && temp <= range[1]) {
      glaze += 9;
      hi.push(pick([
        '烧成温度贴合' + dynasty + '工艺区间',
        '火候正好落在' + dynasty + '典型温区（' + range[0] + '–' + range[1] + '℃）',
        '窑温与' + dynasty + '胎釉脾气相合'
      ]));
    } else if (!free) {
      glaze -= 8;
      de.push(pick([
        '温度偏离' + dynasty + '典型区间，釉面风格存疑',
        '火候偏出' + dynasty + '温区（' + range[0] + '–' + range[1] + '℃），釉色略失准',
        '窑温不在' + dynasty + '常规范围，胎釉结合不够稳'
      ]));
    } else glaze += 3;

    if (glow >= 40 && glow <= 78) {
      glaze += 7;
      hi.push(pick([
        '料色浓淡得宜，晕散自然',
        '青料发色沉稳，浓淡过渡自然',
        '钴蓝层次分明，无浮料感'
      ]));
    } else if (glow > 78) {
      glaze -= 5;
      de.push(pick([
        '料色偏艳，晕散略过头',
        '青料过浓，边缘有积料堆积',
        '发色过重，细部被料光吃掉'
      ]));
    } else {
      glaze -= 5;
      de.push(pick([
        '发色偏淡，可提高料浓或温度',
        '青料略薄，纹样气势不足',
        '色泽偏灰，可再添一分料浓'
      ]));
    }

    if (crack >= 1 && crack <= 3) {
      glaze += 6;
      hi.push(pick([
        '开片细密自然，添古意',
        '釉面开片疏密有致，有岁月感',
        '细开片走线自然，不伤纹样'
      ]));
    } else if (crack > 3) {
      glaze -= 9;
      de.push(pick([
        '开片过密，釉面有惊裂之嫌',
        '开片太碎，釉面显得毛躁',
        '裂片过重，压住了纹样细节'
      ]));
    }

    if (iter === 0) {
      hi.push(pick(['单次成烧，釉面清亮', '一火烧成，釉层干净', '首窑即成，釉面通透']));
    } else if (iter <= 2) {
      glaze += 4;
      hi.push(pick([
        iter + ' 烉叠烧，釉层厚润',
        '叠烧 ' + (iter + 1) + ' 烉，釉面更显肥润',
        '二次入窑，釉层有厚度但不滞'
      ]));
    } else {
      glaze -= 7;
      de.push(pick([
        '叠烧偏多，纹样有积料模糊风险',
        '入窑次数偏多，细部开始发闷',
        '釉层过厚，局部纹样被盖'
      ]));
    }

    /* 窑火手感浮动：子分每次略有差异，序号错位保证连开两窑不会同分 */
    glaze = clamp(Math.round(glaze + (Math.random() * 2 - 1) * 2.2 + ((seq % 3) - 1) * 0.8), 25, 99);
    var shape = clamp(Math.round((vars.shape_score || 80) + (Math.random() * 2 - 1) * 1.8 + (seq % 2 ? 1 : -1)), 25, 99);
    var pattern = clamp(Math.round((vars.pattern_score || 85) + (Math.random() * 2 - 1) * 2.4), 25, 99);
    var total = Math.round(shape * 0.34 + pattern * 0.33 + glaze * 0.33 + (vars.beautified ? 3 : 0) + (Math.random() * 2 - 1) * 1.1);
    total = clamp(total, 25, 99);

    /* 亮点 / 问题补全（每次抽取不同措辞） */
    if (shape >= 85) hi.push(pick([
      '造型得' + dynasty + '器物气韵',
      '器形比例稳，轮廓有' + dynasty + '气息',
      '形制端正，立得住'
    ]));
    else de.push(pick([
      '造型与' + dynasty + '范式尚有差距，可试「AI 重塑」',
      '器形比例还可再收，轮廓略显生硬',
      '形制尚欠' + dynasty + '气度，建议回炉重校'
    ]));

    if (pattern >= 85) hi.push(pick([
      '纹样与曲面贴合度高',
      '纹样随器身弧度走得顺，无拉扯',
      '构图与器形咬合紧密'
    ]));
    else de.push(pick([
      '纹样在该曲面适配度一般，可换区域或纹样',
      '纹样在弧面略有拉伸，建议换区域',
      '纹样密度与曲面不够匹配'
    ]));

    if (free) hi.push(pick(['自由创作不受朝代范式拘束', '自由创作，个性鲜明', '跳出范式，自成一格']));

    /* 打乱并控制条数：每次亮点/问题的组合与顺序都不同 */
    hi = shuffled(hi).slice(0, 4);
    de = shuffled(de).slice(0, 3);
    if (!hi.length) hi.push('釉面完整，青花纹样清晰。');
    if (!de.length) de.push(pick([
      '几无可挑剔，可尝试更高温度探索窑变趣味。',
      '整体无硬伤，不妨再叠一窑看釉色变化。',
      '细节干净，下一步可追求更浓的窑变。'
    ]));

    /* 美化指令：指向最弱维度 */
    var weakest = [{ k: '纹样', v: pattern }, { k: '釉色', v: glaze }].sort(function (a, b) { return a.v - b.v; })[0];
    var instr = weakest.k === '釉色'
      ? '柔和釉晕、调整青花浓淡至适中、开片分布均匀化' + (crack > 3 ? '、减淡开片' : '')
      : '修正纹样疏密节奏、修补衔接断裂处、增强与器身曲面的贴合感';
    var suggest = total < 88 || de.length >= 2;

    var tier = total >= 88 ? 'hi' : total >= 75 ? 'mid' : 'low';
    var CONC = {
      hi: [
        dynasty + '风格复刻佳品，得古瓷三昧。',
        '此器' + total + ' 分：气韵、发色、火候俱在，堪称' + dynasty + '一脉。',
        '开窑见喜，' + (vars.shape || '器') + '与纹样相得益彰，可入藏品之列。'
      ],
      mid: [
        dynasty + '风格整体成立，个别维度尚可精进。',
        '此器' + total + ' 分：骨架与发色都稳，细处再收一收便是好器。',
        '成器端正，若在釉色上再进半步，气韵更足。'
      ],
      low: [
        '与' + dynasty + '工艺特征尚有距离，可回炉再试。',
        '此器' + total + ' 分：火候与发色都欠些火候，建议调整参数复烧。',
        '整体偏生，建议先稳住温度再谈窑变。'
      ]
    };
    var conclusion = free
      ? pick([
        '自由创作作品：' + (total >= 85 ? '构图与气韵俱佳，自成一格。' : '已具雏形，细节尚可推敲。'),
        '自由创作 ' + total + ' 分：' + (total >= 85 ? '不受范式束缚，反而有意外之趣。' : '想法很好，工艺再稳一点更好。'),
        '跳出范式的一件：' + (total >= 85 ? '釉色与构图互相成全。' : '胆量够，火候还差一口气。')
      ])
      : pick(CONC[tier]);

    return Promise.resolve({
      type: 'porcelain_final_appraise',
      total_score: total,
      sub_score: { shape_score: shape, pattern_score: pattern, glaze_score: glaze },
      conclusion: conclusion,
      highlights: hi,
      problems: de,
      beautify_instruction: instr,
      is_suggest_beautify: suggest
    });
  }

  /* ============================================================
     ⑤ 一键美化：精修烧成贴图（不篡改用户构图）
     ------------------------------------------------------------
     旧版是「模糊 + 整面罩蓝」，叠加几次只会越来越糊、颜色越来越闷。
     现在改为真正的精修，且每次从「未美化的窑变贴图」重新计算：
       ① 压掉窑变浮雾（极淡 alpha 减半）——轮廓重新站起来；
       ② 笔触对比曲线 —— 中高调更实，细线不发虚；
       ③ 青料提纯：向钴蓝料色靠拢但保持原明度 —— 不靠加深颜色；
       ④ 对比度/饱和度滤镜重绘 —— 轻度锐化，全程不加模糊。
     第 n 次精修强度递增（0.26 / 0.36 / 0.46），不会再糊。
     ============================================================ */
  function beautify(canvas, opts) {
    opts = opts || {};
    var pass = clamp(opts.pass || 1, 1, 3);
    var W = canvas.width, H = canvas.height;
    var out = document.createElement('canvas');
    out.width = W; out.height = H;
    var g = out.getContext('2d');
    g.drawImage(canvas, 0, 0);

    /* ①②③ 像素级精修：重分布墨量（去浮雾、提笔锋），不改浓淡总量 */
    var img = g.getImageData(0, 0, W, H);
    var d = img.data;
    var tR = 47, tG = 95, tB = 158;                 // 青花料色 #2f5f9e
    var tLum = 0.299 * tR + 0.587 * tG + 0.114 * tB;
    var w = 0.45 + pass * 0.15;                      // 精修强度：0.60 / 0.75 / 0.90
    var mix = 0.18 + pass * 0.06;                    // 色相提纯：0.24 / 0.30 / 0.36
    var n = W * H;
    var A0 = new Float32Array(n), A1 = new Float32Array(n);
    var p, sum0 = 0, sum1 = 0;

    /* 1) 取 alpha，做软阈值 S 曲线：淡晕压掉、实笔立住（先不改总量） */
    for (p = 0; p < n; p++) {
      var a0 = d[p * 4 + 3] / 255;
      A0[p] = a0;
      if (!a0) { A1[p] = 0; continue; }
      var t = clamp((a0 - 0.10) / 0.52, 0, 1);
      var s = t * t * (3 - 2 * t);
      var av = a0 * (1 - w) + s * w;
      A1[p] = av;
      sum0 += a0; sum1 += av;
    }
    /* 2) 墨量归一：精修前后总墨量不变 —— 只让笔锋变利，不让颜色变厚重 */
    var scale = clamp(sum0 / Math.max(1e-6, sum1), 0.72, 1.28);

    /* 3) 回写：alpha 重分布 + 等明度青料提纯 */
    for (p = 0; p < n; p++) {
      var a0b = A0[p];
      if (!a0b) continue;
      var A = clamp(A1[p] * scale, 0, 1);
      var i = p * 4;
      var lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      var f = lum / tLum;
      d[i] = d[i] * (1 - mix) + tR * f * mix;
      d[i + 1] = d[i + 1] * (1 - mix) + tG * f * mix;
      d[i + 2] = d[i + 2] * (1 - mix) + tB * f * mix;
      d[i + 3] = Math.round(A * 255);
    }
    g.putImageData(img, 0, 0);

    /* ④ 轻度锐化：只用对比度滤镜重绘，不加模糊、不强行提饱和 */
    var sharp = document.createElement('canvas');
    sharp.width = W; sharp.height = H;
    sharp.getContext('2d').drawImage(out, 0, 0);
    g.clearRect(0, 0, W, H);
    g.filter = 'contrast(' + (1.04 + pass * 0.015).toFixed(3) + ')';
    g.drawImage(sharp, 0, 0);
    g.filter = 'none';

    return Promise.resolve({
      canvas: out,
      note: '第 ' + pass + ' 次精修：去浮雾 · 提笔触对比 · 青料提纯（全程不加模糊，纹样保持锋利）。'
    });
  }

  /* ============================================================
     ⑥ 作品归档打标签
     ============================================================ */
  function tagging(vars) {
    var dynasty = vars.dynasty || '元代';
    var shape = vars.shape || '罐';
    var pattern = vars.pattern || '缠枝纹';
    var free = !!vars.free;
    var score = vars.score || 80;
    var glaze = vars.fire_mode || '常规烧制';

    var glazeTag = { '低温淡釉': '淡雅釉色', '常规烧制': '正烧釉色', '高温窑变': '窑变肌理' }[glaze] || '正烧釉色';
    var title = free
      ? '意造 · ' + pattern.replace(/纹$/, '') + shape
      : dynasty.replace('代', '韵') + ' · ' + pattern.replace(/纹$/, '') + shape;

    return Promise.resolve({
      type: 'works_tagging',
      title: title,
      category: free ? '自由创作' : '仿古复刻',
      tags: [dynasty + '青花', shape, pattern, glazeTag, score >= 85 ? '甲等' : score >= 70 ? '乙等' : '习作'],
      archive_note: (free ? '创意' : '仿古') + '作品：' + dynasty + '风' + shape + '，饰' + pattern +
        '，' + glazeTag + '，AI 终评 ' + score + ' 分。'
    });
  }

  /* ---------- 统一入口（预留真实多模态接口） ---------- */
  function run(promptType, vars) {
    if (cfg.endpoint) {
      return fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_type: promptType, vars: vars })
      }).then(function (res) { return res.json(); });
    }
    if (promptType === 'fire_predict') return predict(vars);
    if (promptType === 'porcelain_final_appraise') return finalAppraise(vars);
    if (promptType === 'beautify_uv') return beautify(vars.canvas, { pass: vars.pass, instruction: vars.instruction });
    if (promptType === 'works_tagging') return tagging(vars);
    return appraise(vars);
  }

  window.AIFire = {
    configure: configure,
    run: run,
    predict: predict,
    repaint: repaint,
    appraise: appraise,
    finalAppraise: finalAppraise,
    beautify: beautify,
    tagging: tagging
  };
})();
