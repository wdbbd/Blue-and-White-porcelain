/* =====================================================================
   器型图挑选 + 复制脚本（一次性）
   ---------------------------------------------------------------------
   从 _tmp_extract/青花瓷资料收集/器型/<类别>/<朝代>/ 中，按类别均衡
   抽样每个朝代的器型图，复制到 assets/vessels/<era>/。
   目的：上侧两行（2×6=12 张）呈现该朝代代表性器型。
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const SRC = 'D:/赛事作品/Blue and White porcelain/Blue and White porcelain/_tmp_extract/青花瓷资料收集/器型';
const DST = path.join(__dirname, 'assets', 'vessels');

const PER_ERA = 12;   // 每个朝代抽 12 张

// 朝代目录名 → era key
const ERA_MAP = [
  { dir: '元', key: 'yuan' },
  { dir: '明', key: 'ming' },
  { dir: '清', key: 'qing' },
  { dir: '民国', key: 'minguo' },
  { dir: '现', key: 'modern' },   // 另有 '现代' 目录，合并处理
];
const MODERN_EXTRA = '现代';

function imgs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f) && !/_t\.(jpe?g|png|webp)$/i.test(f))
    .sort();
}

// 收集某朝代在各大类下的图片，按 类别 分组
function gather(dynastyDirs) {
  const groups = {};   // 类别 -> [绝对路径]
  const cats = fs.readdirSync(SRC).filter((c) => fs.statSync(path.join(SRC, c)).isDirectory());
  cats.forEach((cat) => {
    dynastyDirs.forEach((d) => {
      const p = path.join(SRC, cat, d);
      const list = imgs(p);
      if (list.length) {
        groups[cat] = (groups[cat] || []).concat(list.map((f) => path.join(p, f)));
      }
    });
  });
  return groups;
}

// 轮转取样：在各类别间轮流取，保证类别均衡
function pickBalanced(groups, n) {
  const buckets = Object.keys(groups).map((k) => ({ k, arr: groups[k].slice() }));
  const out = [];
  let i = 0;
  while (out.length < n && buckets.some((b) => b.arr.length)) {
    const b = buckets[i % buckets.length];
    if (b.arr.length) out.push(b.arr.shift());
    i++;
  }
  return out;
}

const summary = {};
ERA_MAP.forEach(({ dir, key }) => {
  const dirs = key === 'modern' ? [dir, MODERN_EXTRA] : [dir];
  const groups = gather(dirs);
  const picked = pickBalanced(groups, PER_ERA);

  const outDir = path.join(DST, key);
  fs.mkdirSync(outDir, { recursive: true });
  picked.forEach((src) => {
    const base = path.basename(src);
    fs.copyFileSync(src, path.join(outDir, base));
  });
  summary[key] = { total: Object.values(groups).reduce((a, b) => a + b.length, 0), picked: picked.length, cats: Object.keys(groups).length };
});

Object.keys(summary).forEach((k) => {
  console.log(k + ': 可选 ' + summary[k].total + ' 张（' + summary[k].cats + ' 类）→ 抽取 ' + summary[k].picked + ' 张');
});
console.log('\n已复制到 assets/vessels/<era>/');
