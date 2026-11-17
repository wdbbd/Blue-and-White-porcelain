/* =====================================================================
   左墙素材清单生成脚本（纹样 + 器型）
   ---------------------------------------------------------------------
   用途：扫描 assets/patterns/<era>/ 与 assets/vessels/<era>/ 下的图片，
        生成 js/patterns.data.js，供 3D 长廊左墙读取。
        运行后无需手工维护清单。

   运行：node build-patterns.js
   （素材更新后重新跑一次即可）

   产出格式：
     window.DATA_PATTERNS = { tang:[{file,src,name}, …], … }   // 纹样（左墙下侧一行）
     window.DATA_VESSELS  = { yuan:[{file,src,name}, …], … }   // 器型（左墙上侧两行）

   说明：src 已做 encodeURI 处理，中文 / 全角括号 / 空格均可直接使用。
   ===================================================================== */
const fs = require('fs');
const path = require('path');

// era 目录名 → 朝代 key
const ERAS = ['tang', 'song', 'yuan', 'ming', 'qing', 'minguo', 'modern'];

function cleanName(f) {
  let n = f.replace(/\.(jpe?g|png|webp)$/i, '');
  if (/^[0-9a-f]{16,}$/i.test(n)) return '示例图';
  return n;
}

function scan(kind) {
  const root = path.join(__dirname, 'assets', kind);
  const out = {};
  ERAS.forEach(function (era) {
    const dir = path.join(root, era);
    if (!fs.existsSync(dir)) { out[era] = []; return; }
    const files = fs.readdirSync(dir)
      .filter(function (f) { return /\.(jpe?g|png|webp)$/i.test(f); })
      .sort();
    out[era] = files.map(function (f) {
      const rel = 'assets/' + kind + '/' + era + '/' + f;
      return { file: f, src: encodeURI(rel), name: cleanName(f) };
    });
  });
  return out;
}

const patterns = scan('patterns');
const vessels = scan('vessels');

const js =
  '/* 自动生成，请勿手工编辑 —— 由 build-patterns.js 生成 */\n' +
  'window.DATA_PATTERNS = ' + JSON.stringify(patterns, null, 2) + ';\n\n' +
  'window.DATA_VESSELS = ' + JSON.stringify(vessels, null, 2) + ';\n';

fs.writeFileSync(path.join(__dirname, 'js', 'patterns.data.js'), js, 'utf8');

console.log('纹样 patterns:');
ERAS.forEach(function (e) { console.log('  ' + e + ': ' + patterns[e].length + ' 张'); });
console.log('器型 vessels:');
ERAS.forEach(function (e) { console.log('  ' + e + ': ' + vessels[e].length + ' 张'); });
console.log('→ 已写入 js/patterns.data.js');
