/* =====================================================================
   Three.js 加载器
   ---------------------------------------------------------------------
   用途：优先使用本地 libs/three.min.js（离线可用，比赛现场更稳），
        若本地文件缺失则自动回退到 CDN，避免白屏。
   注意：本文件只负责保证 window.THREE 存在，不做其它逻辑。
   ===================================================================== */
(function () {
  'use strict';

  // 本地文件是否加载成功？
  if (typeof window.THREE !== 'undefined') {
    console.log('[Three-Loader] 已使用本地 Three.js，版本：', window.THREE.REVISION);
    return;
  }

  console.warn('[Three-Loader] 未找到本地 libs/three.min.js，尝试从 CDN 加载…');

  // 回退方案：按顺序尝试多个 CDN（r128 为稳定经典版，API 与本文档一致）
  var CDN_LIST = [
    'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
    'https://unpkg.com/three@0.128.0/build/three.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
  ];

  // 同步插入 script 标签（document.write 在解析期可用，保证 main.js 之前加载完）
  for (var i = 0; i < CDN_LIST.length; i++) {
    document.write('<script src="' + CDN_LIST[i] + '"><\/script>');
    if (typeof window.THREE !== 'undefined') break;
  }

  if (typeof window.THREE === 'undefined') {
    console.error('[Three-Loader] Three.js 加载失败，请检查 libs/three.min.js 或网络。');
  }
})();
