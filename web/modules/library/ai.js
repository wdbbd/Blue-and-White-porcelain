/* ============================================================
   AI 问答 · 【成员 D 负责】
   ------------------------------------------------------------
   当前默认是「离线检索」模式：直接在本地资料库里找答案，
   不需要任何配置就能用。

   想接入真正的AI？三步：
   1) 在项目根目录跑  node server.js  （附带 .env.example，改key 即可）
   2) 或者把 AI_CONFIG 里的 endpoint 指向你自己的接口
   3) 刷新页面，右上角会显示「AI 已连接」
   ------------------------------------------------------------
   详细说明见 README 的「AI 问答接入」一节。
   ============================================================ */

var AI_CONFIG = {
  // 留空 =离线模式（本地检索）；填入 = 调用真实 AI
  // 例：'http://127.0.0.1:8787/api/chat'
  endpoint: '',

  // 送给模型的背景资料（让回答更贴合本项目）
  systemPrompt:
    '你是一个青花瓷数字馆的讲解员。请用简体中文回答，语气克制、专业、通俗，' +
    '以200 字以内为宜。青花瓷知识要点：唐代长沙窑已有釉下钴蓝彩；' +
    '元代景德镇用进口钴料「苏麻离青」，发色浓艳有铁锈斑；' +
    '明永宣延续苏麻离青，分水技法成熟；清康熙青花蓝中泛绿称「翠毛蓝」，' +
    '层次可达八九级；豆青、郎红等为高温颜色釉。若资料不确定，请明确说明。',
};

window.LIB_AI = {
  config: AI_CONFIG,

  /** 是否已接入真实 AI */
  online: function () { return !!AI_CONFIG.endpoint; },

  /**
   * 提问。
   * @param {string} q 问题
   * @param {object[]} corpus 本地资料（用于离线检索兜底）
   * @returns {Promise<{text:string, source:string}>}
   */
  ask: function (q, corpus) {
    if (AI_CONFIG.endpoint) {
      return fetch(AI_CONFIG.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          system: AI_CONFIG.systemPrompt,
          // 附上最相关的几条资料，减少模型编造
          context: (corpus || []).slice(0, 8).map(function (c) {
            return c.title + '（' + c.meta + '）';
          }),
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) { return { text: d.answer || d.text || '', source: 'AI 生成' }; })
        .catch(function () {
          return { text: localAnswer(q, corpus), source: '本地检索（AI 暂不可用）' };
        });
    }
    return Promise.resolve({ text: localAnswer(q, corpus), source: '本地检索' });
  },
};

/* ---------------- 离线检索：从资料库里找最相关的条目 ---------------- */
function localAnswer(q, corpus) {
  if (!corpus || !corpus.length) return '资料库里还没有相关内容。';

  var terms = String(q).toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fa5]{2,}/g) || [];
  var scored = corpus.map(function (c) {
    var hay = (c.title + ' ' + c.meta + ' ' + (c.desc || '')).toLowerCase();
    var s = 0;
    terms.forEach(function (t) { if (hay.indexOf(t) >= 0) s += t.length; });
    return { c: c, s: s };
  }).sort(function (a, b) { return b.s - a.s; });

  var top = scored.filter(function (x) { return x.s > 0; }).slice(0, 5);
  if (!top.length) {
    return '资料库里没有匹配「' + q + '」的条目。\n\n' +
      '你可以换个更具体的说法，比如「元代梅瓶」「康熙青花」「缠枝莲纹」，' +
      '也可以先在上方用关键词检索翻看资料。';
  }

  var lines = top.map(function (x, i) {
    return (i + 1) + '. ' + x.c.title + '（' + x.c.meta + '）\n   ' + (x.c.desc || '点击查看详情');
  });

  return '根据资料库，与「' + q + '」最相关的条目是：\n\n' + lines.join('\n\n') +
    '\n\n以上为资料库中的原始条目摘要。接入 AI 接口后，这里会给出综合性的讲解。';
}