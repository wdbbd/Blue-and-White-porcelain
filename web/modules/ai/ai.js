/* ============================================================
   AI 生图 · 真正的 AI 图像生成
   ------------------------------------------------------------
   不再用 Canvas 画线条：
   选纹样 → 写意象 → 由图像模型（Pollinations / Flux）生成一只青花盘。
   若配置了 OpenAI 兼容的图像接口，可改为自己的服务（见 .env.example）。
   DeepSeek 只负责题名、七言诗和英文绘图提示词；图像由图像模型生成。
   ============================================================ */
(function () {
  'use strict';

  var BASE = '../../';
  var $ = function (id) { return document.getElementById(id); };

  var STYLES = [
    { id: 'peony', name: '缠枝牡丹', en: 'PEONY SCROLL', era: '元', border: 'an ornate peony scroll border',
      src: 'assets/img/patterns/元代/缠枝牡丹纹.jpg', note: '花头饱满，枝蔓回环' },
    { id: 'lotus', name: '缠枝莲', en: 'LOTUS SCROLL', era: '元', border: 'a lotus scroll border',
      src: 'assets/img/patterns/元代/缠枝莲纹.jpg', note: '莲瓣层叠，一池清气' },
    { id: 'dragon', name: '云龙', en: 'CLOUD DRAGON', era: '元', border: 'a cloud-and-dragon border',
      src: 'assets/img/patterns/元代/云龙纹.jpg', note: '龙身夭矫，云气翻涌' },
    { id: 'wave', name: '海水江崖', en: 'WAVES & CLIFFS', era: '明·永宣', border: 'a waves-and-cliffs border',
      src: 'assets/img/patterns/明·永宣(永乐、宣德)/海水江崖纹.jpg', note: '波涛叠起，江山在握' },
    { id: 'bird', name: '花鸟', en: 'FLOWERS & BIRDS', era: '明·永宣', border: 'a flower-and-bird border',
      src: 'assets/img/patterns/明·永宣(永乐、宣德)/花鸟纹.jpg', note: '花枝禽语，生机入瓷' },
    { id: 'landscape', name: '写意山水', en: 'LANDSCAPE', era: '明末', border: 'a landscape border',
      src: 'assets/img/patterns/明末-天启、崇祯/写意山水纹.jpg', note: '远山淡影，一笔千里' }
  ];

  var LOCAL = {
    peony: { title: '缠枝春信', line: '缠枝不断春消息，一朵青花一段香。' },
    lotus: { title: '一池青莲', line: '一池清气出莲瓣，半是青花半是春。' },
    dragon: { title: '云起龙骧', line: '一从云气起龙吟，万里风涛入青花。' },
    wave: { title: '海天青处', line: '海色连天青未了，潮声落笔化成瓷。' },
    bird: { title: '花间青语', line: '花间禽语才收笔，春色已随青釉来。' },
    landscape: { title: '山水清音', line: '远山淡影入青釉，一笔江南一笔秋。' }
  };

  var DEFAULT_PROMPT = '月下青花，一枝梅影';
  var CHIPS = ['月下青花', '海上云龙', '缠枝莲茶盘', '山水小景', '花鸟春风', '一池莲花'];
  var VIBES = ['delicate', 'luminous', 'crisp', 'misty', 'ornate', 'serene', 'vivid', 'refined', 'airy', 'richly detailed'];
  var LOAD_STEPS = ['研墨 · 调钴料', '起稿 · 定器形', '分水 · 铺青花', '入窑 · 等火候', '出窑 · 定色'];

  var plate = $('plate');
  var stage = $('plateStage');
  var styleGrid = $('styleGrid');
  var promptEl = $('prompt');
  var genBtn = $('genBtn');
  var styleNow = $('styleNow');
  var statusEl = $('status');
  var capTitle = $('capTitle');
  var capLine = $('capLine');
  var capMeta = $('capMeta');
  var loading = $('plateLoading');
  var loadText = $('loadText');
  var loadSub = $('loadSub');
  var loadBar = $('loadBar');
  var plateEmpty = $('plateEmpty');
  var shuffleBtn = $('shuffle');
  var dlBtn = $('dl2');

  var esc = window.esc || function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  var state = {
    styleId: 'peony',
    prompt: DEFAULT_PROMPT,
    seed: 0,
    imageUrl: '',
    remoteUrl: '',
    title: '',
    line: '',
    ai: false,
    busy: false
  };

  function getStyle() {
    for (var i = 0; i < STYLES.length; i++) if (STYLES[i].id === state.styleId) return STYLES[i];
    return STYLES[0];
  }
  function styleUrl(s) { return BASE + encodeURI(s.src); }

  /* ---------------- 样式卡 ---------------- */
  function buildStyles() {
    STYLES.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'style-card' + (s.id === state.styleId ? ' on' : '');
      b.setAttribute('data-id', s.id);
      b.setAttribute('aria-pressed', s.id === state.styleId ? 'true' : 'false');
      b.innerHTML =
        '<span class="style-swatch"></span>' +
        '<b>' + s.name + '</b>' +
        '<em>' + s.en + '</em>' +
        '<small>' + s.era + ' · ' + s.note + '</small>';
      b.querySelector('.style-swatch').style.backgroundImage = 'url("' + styleUrl(s) + '")';
      b.addEventListener('click', function () { selectStyle(s.id); });
      styleGrid.appendChild(b);
    });
  }

  function syncStyleUI() {
    var s = getStyle();
    styleNow.textContent = s.name;
    Array.prototype.forEach.call(styleGrid.children, function (el) {
      var on = el.getAttribute('data-id') === s.id;
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (!state.imageUrl) {
      plateEmpty.querySelector('p').innerHTML = s.name + ' · ' + s.era + '<br>写下意象，点生成';
    }
  }

  function selectStyle(id) {
    if (state.busy) return;
    state.styleId = id;
    syncStyleUI();
    if (state.imageUrl) {
      setStatus('已换成「' + getStyle().name + '」边饰，点「生成」重新绘制一只。');
    } else {
      setStatus('已选「' + getStyle().name + '」。写下你想看见的画面，再点生成。');
    }
  }

  /* ---------------- 提示词 / 图像 URL ---------------- */
  function cleanScene(scene) {
    return String(scene || '')
      .replace(/\b(flat painting|blue and white porcelain style|central circular composition|elegant ink lines|porcelain|plate|bowl|camera|top view|top-down|photograph|3d|sphere|background|lighting|shadow|shadows)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildImagePrompt(scene, style, vibe) {
    scene = String(scene || '').replace(/\s+/g, ' ').trim();
    var s = style || getStyle();
    var fallback = {
      peony: 'a peony branch with three blossoms and leaves',
      lotus: 'lotus flowers and broad leaves in a pond',
      dragon: 'a five-clawed dragon among clouds above cresting waves',
      wave: 'cresting waves and rocky cliffs',
      bird: 'two birds on flowering branches',
      landscape: 'distant mountains, a river and a small pavilion'
    };
    if (!scene) scene = fallback[s.id] || fallback.peony;
    var mood = vibe || VIBES[Math.floor(Math.random() * VIBES.length)];
    var comps = [
      'a dense, richly layered composition',
      'a sparse, airy composition',
      'a centered symmetrical composition',
      'an asymmetrical composition',
      'a border-emphasized composition',
      'a medallion-centered composition'
    ];
    var comp = comps[Math.floor(Math.random() * comps.length)];
    return (
      'A white Chinese blue-and-white porcelain plate, top view, flat and round, filling the frame. ' +
      'The porcelain is white with hand-painted cobalt blue decoration: ' + s.border + ' around the rim; ' +
      'in the center, ' + scene + ', painted in cobalt blue with fine brushwork, ' + mood + ', ' + comp + ', ' +
      'ultra-detailed fine brushwork, intricate cobalt details, sharp focus, 8K, museum quality porcelain photography, no text, no watermark, no blur'
    ).slice(0, 950);
  }

  function pollinationsUrl(prompt, seed, model) {
    return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) +
      '?width=1024&height=1024&seed=' + seed + '&model=' + (model || 'flux') +
      '&nologo=true&private=true&r=' + Math.random().toString(36).slice(2, 10);
  }

  /* ---------------- AI 题名 + 英文绘图提示词 ---------------- */
  function askAI(prompt, style) {
    if (!window.fetch || !window.AbortController) return Promise.resolve(null);
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 6500);
    return fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        system: '你是青花瓷纹样设计师。根据用户的中文意象，输出 JSON：{"title":"四字题名","line":"一句七言诗","imagePrompt":"只写圆盘中央的平面绘画场景，英文 15-35 词"}。imagePrompt 只描述花枝、云龙、山水、月影等平面纹样本身；不要写盘子、碗、相机、俯视、光线、背景、3D、球体、边饰。只输出 JSON，不要解释，不要 Markdown。',
        question: '用户意象：' + prompt + '。边饰：' + style.name + '（' + style.era + '）。'
      })
    }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (d) {
      var txt = (d && (d.answer || d.text)) || '';
      var m = txt.match(/\{[\s\S]*\}/);
      if (!m) return null;
      try {
        var j = JSON.parse(m[0]);
        if (!j.title) return null;
        return {
          title: String(j.title).replace(/[「」“”"]/g, '').slice(0, 6),
          line: String(j.line || '').replace(/[「」“”"]/g, '').slice(0, 30),
          imagePrompt: j.imagePrompt ? String(j.imagePrompt).replace(/[\r\n]+/g, ' ').slice(0, 700) : '',
          ai: true
        };
      } catch (e) { return null; }
    }).catch(function () { return null; }).then(function (v) {
      clearTimeout(timer);
      return v;
    });
  }

  /* ---------------- 取图 / 重试 ----------------
     之前把 <img> 直接指向服务地址，服务繁忙时返回的 503 错误图
     也会被当成“生成成功”显示出来。这里改为 fetch 取 blob：
     先校验 HTTP 状态与 content-type，只有真正的图片才上盘；
     繁忙时换模型/换 seed 重试，仍失败就明确提示，不显示错误图。 */
  function delay(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function fetchImage(url) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 45000);
    return fetch(url, { cache: 'no-store', signal: ctrl.signal })
      .then(function (r) {
        if (!r.ok) {
          var e = new Error('http' + r.status);
          e.status = r.status;
          throw e;
        }
        var ct = (r.headers.get('content-type') || '').toLowerCase();
        if (ct.indexOf('image/') !== 0) throw new Error('badtype');
        return r.blob();
      })
      .then(function (b) {
        clearTimeout(timer);
        if (!b || b.size < 4000) throw new Error('toosmall');
        return b;
      })
      .catch(function (e) {
        clearTimeout(timer);
        throw e;
      });
  }

  var seenHashes = {};

  function blobHash(blob) {
    return blob.arrayBuffer().then(function (buf) {
      var a = new Uint8Array(buf);
      var h = 2166136261 >>> 0;
      var step = Math.max(1, Math.floor(a.length / 4096));
      for (var i = 0; i < a.length; i += step) {
        h ^= a[i];
        h = Math.imul(h, 16777619) >>> 0;
      }
      return h.toString(36);
    });
  }

  function fetchWithRetry(prompt, seed) {
    var models = ['gptimage', 'flux', 'turbo'];
    var tries = 0;
    function attempt() {
      var model = models[tries % models.length];
      var url = pollinationsUrl(prompt, seed + tries * 137 + (tries ? Math.floor(Math.random() * 997) : 0), model);
      return fetchImage(url).then(function (blob) {
        return blobHash(blob).then(function (hash) {
          if (seenHashes[hash] && tries < 4) {
            tries++;
            loadSub.textContent = '换一张构图，避免重复…';
            return delay(700).then(attempt);
          }
          seenHashes[hash] = true;
          return { blob: blob, url: url };
        });
      }).catch(function (err) {
        tries++;
        if (tries < 6) {
          loadSub.textContent = '图像服务繁忙，正在换一条线路重试…';
          return delay(1600).then(attempt);
        }
        throw err;
      });
    }
    return attempt();
  }

  function normalizePlate(blob) {
    return new Promise(function (resolve) {
      var im = new Image();
      var url = URL.createObjectURL(blob);
      im.onload = function () {
        try {
          var scale = 2.0;
          var c = document.createElement('canvas');
          c.width = Math.round(im.naturalWidth * scale);
          c.height = Math.round(im.naturalHeight * scale);
          var g = c.getContext('2d');
          g.imageSmoothingEnabled = true;
          g.imageSmoothingQuality = 'high';
          g.drawImage(im, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          var w = c.width, h = c.height;
          var id = g.getImageData(0, 0, w, h);
          var d = id.data;

          // 轻微提对比
          for (var k = 0; k < d.length; k += 4) {
            d[k] = Math.max(0, Math.min(255, (d[k] - 128) * 1.06 + 128));
            d[k + 1] = Math.max(0, Math.min(255, (d[k + 1] - 128) * 1.06 + 128));
            d[k + 2] = Math.max(0, Math.min(255, (d[k + 2] - 128) * 1.06 + 128));
          }

          // 5 点反锐化，把 AI 图的细节提亮
          var src = new Uint8ClampedArray(d);
          var amt = .7, kc = 1 + 4 * amt, kn = -amt;
          for (var yy = 1; yy < h - 1; yy++) {
            for (var xx = 1; xx < w - 1; xx++) {
              var p = (yy * w + xx) * 4;
              for (var ch = 0; ch < 3; ch++) {
                var v = src[p + ch] * kc +
                  (src[p - 4 + ch] + src[p + 4 + ch] + src[p - w * 4 + ch] + src[p + w * 4 + ch]) * kn;
                d[p + ch] = v < 0 ? 0 : v > 255 ? 255 : v;
              }
            }
          }

          g.putImageData(id, 0, 0);
          c.toBlob(function (b) { resolve(b || blob); }, 'image/jpeg', .95);
        } catch (e) {
          try { URL.revokeObjectURL(url); } catch (e2) {}
          resolve(blob);
        }
      };
      im.onerror = function () {
        try { URL.revokeObjectURL(url); } catch (e) {}
        resolve(blob);
      };
      im.src = url;
    });
  }
  var stepTimer = null;
  var stepIndex = 0;

  function setStatus(text) { statusEl.innerHTML = text; }

  function startLoading() {
    state.busy = true;
    stage.classList.add('loading');
    genBtn.disabled = true;
    loading.hidden = false;
    stepIndex = 0;
    loadText.textContent = LOAD_STEPS[0];
    loadSub.textContent = 'AI 正在绘制 · 通常 10–30 秒';
    loadBar.style.width = '8%';
    stage.style.setProperty('--prog', 8);
    setStatus('AI 正在把文字译成青花，请稍候…');
    clearInterval(stepTimer);
    stepTimer = setInterval(function () {
      stepIndex = Math.min(LOAD_STEPS.length - 1, stepIndex + 1);
      loadText.textContent = LOAD_STEPS[stepIndex];
      var pct = Math.min(90, 8 + stepIndex * 18);
      loadBar.style.width = pct + '%';
      stage.style.setProperty('--prog', pct);
    }, 900);
  }

  function stopLoading() {
    state.busy = false;
    clearInterval(stepTimer);
    stepTimer = null;
    loadBar.style.width = '100%';
    stage.style.setProperty('--prog', 100);
    setTimeout(function () {
      stage.classList.remove('loading');
      loading.hidden = true;
      genBtn.disabled = false;
    }, 380);
  }

  function updateCaption(seed) {
    capTitle.textContent = state.title;
    capLine.textContent = state.line;
    capMeta.innerHTML =
      '<span>' + (state.ai ? 'AI 题名' : '本地题名') + '</span>' +
      '<span>· <b>' + getStyle().name + '</b></span>' +
      '<span>· SEED ' + seed + '</span>';
  }

  function generate() {
    if (state.busy) return;
    var prompt = promptEl.value.trim();
    if (!prompt) {
      promptEl.focus();
      setStatus('先写一句你想要的画面，比如「月下青花」。');
      return;
    }
    state.prompt = prompt;
    var style = getStyle();
    var seed = Math.floor(1 + Math.random() * 999999999);
    var local = LOCAL[style.id] || LOCAL.peony;
    state.seed = seed;
    state.title = local.title;
    state.line = local.line;
    state.ai = false;

    startLoading();

    askAI(prompt, style).then(function (ai) {
      if (ai && ai.title) {
        state.title = ai.title;
        state.line = ai.line || local.line;
        state.ai = true;
      }
      var scene = cleanScene((ai && ai.imagePrompt) ? ai.imagePrompt : '');
      var vibe = VIBES[Math.floor(Math.random() * VIBES.length)];
      var imagePrompt = buildImagePrompt(scene, style, vibe);
      return fetchWithRetry(imagePrompt, seed).then(function (res) {
        return normalizePlate(res.blob).then(function (blob) {
          var old = state.imageUrl;
          state.imageUrl = URL.createObjectURL(blob);
          state.remoteUrl = res.url;
          plate.src = state.imageUrl;
          stage.classList.add('has-img');
          if (old && old.indexOf('blob:') === 0) {
            setTimeout(function () { URL.revokeObjectURL(old); }, 600);
          }
          updateCaption(seed);
          stopLoading();
          setStatus('已生成。可继续换一句意象，或点「保存原图」下载原图。');
        });
      });
    }).catch(function (err) {
      stopLoading();
      if (!state.imageUrl) {
        plateEmpty.querySelector('p').innerHTML = '这一张没有生成成功<br>请稍后重试';
      }
      setStatus('图像服务' + (err && (err.status === 503 || err.message === 'timeout') ? '繁忙' : '暂时不可用') +
        '，请稍后再试一次。AI 生图需要联网，通常 10–30 秒出一张。');
    });
  }

  /* ---------------- 下载 ---------------- */
  function download() {
    if (!state.imageUrl) {
      setStatus('先生成一张青花盘，再保存。');
      return;
    }
    var name = 'qinghua-ai-' + getStyle().id + '-' + state.seed + '.jpg';
    fetch(state.imageUrl).then(function (r) {
      if (!r.ok) throw new Error('fetch');
      return r.blob();
    }).then(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 900);
      setStatus('已保存原图 · ' + name);
    }).catch(function () {
      window.open(state.imageUrl, '_blank', 'noopener');
      setStatus('已在新标签打开原图，可右键另存为。');
    });
  }

  /* ---------------- 换一个 ---------------- */
  var SHUFFLE = [
    '月下青花，一枝梅影',
    '海上云龙，风涛入瓷',
    '一池莲花，清露未干',
    '远山淡影，一舟千里',
    '花间鸟语，春色满盘',
    '竹石清风，半窗疏影',
    '云气生时，青欲滴',
    '婴戏庭前，春色照人'
  ];
  function shuffle() {
    if (state.busy) return;
    var s = STYLES[Math.floor(Math.random() * STYLES.length)];
    var p = SHUFFLE[Math.floor(Math.random() * SHUFFLE.length)];
    state.styleId = s.id;
    promptEl.value = p;
    syncStyleUI();
    generate();
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    var q = '';
    try {
      var params = new URLSearchParams(location.search);
      q = (params.get('prompt') || '').trim();
      var sid = params.get('style');
      if (sid) {
        for (var i = 0; i < STYLES.length; i++) if (STYLES[i].id === sid) state.styleId = sid;
      }
    } catch (e) {}

    if (q) state.prompt = q;
    promptEl.value = state.prompt;
    buildStyles();
    syncStyleUI();

    CHIPS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = c;
      b.addEventListener('click', function () {
        promptEl.value = c;
        state.prompt = c;
        setStatus('已填入「' + esc(c) + '」，点「生成」开始画。');
      });
      $('chips').appendChild(b);
    });

    genBtn.addEventListener('click', generate);
    promptEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); generate(); }
    });
    dlBtn.addEventListener('click', download);
    shuffleBtn.addEventListener('click', shuffle);

    capTitle.textContent = '青花 · AI 生图';
    capLine.textContent = '选一种纹样，写下你想看见的画面。';
    capMeta.innerHTML = '<span>AI 真图生成</span><span>· 约 10–30 秒</span>';
    if (q) setStatus('已带入展厅器物「' + esc(q) + '」，可直接生成。');
    else setStatus('选好纹样，写下意象，点「生成」。');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
