# 青瓷白 · 中国传统青花瓷数字馆

一个纯静态的青花瓷数字馆：首页 + 时间长廊（3D 走廊）+ 制瓷工序（3D 工序）+ AI 制作 + 资料库。
除 `server.js`（可选的 AI 代理）外没有任何依赖、没有构建步骤，改完 `Ctrl+F5` 就能看到效果。

> 本说明按 **2026-11-17 的实际文件重建**，与旧版结构图不同。旧文档里提到的
> `modules/timeline/index.html`、`gallery/exhibits.js`、`vessel3d.js`、`hands.js` 都已经不存在了。

---

## 一、文件结构（真实）

```
web/
├── index.html                        ← 首页（约 85 KB；器物图外置在 assets/img/exhibits/，导航是手写的）
├── README.md                         ← 本文件
├── server.js                         ← 可选：AI 问答代理（Node，无依赖）
├── .env.example                      ← AI Key 模板
│
├── modules/                          ★ 各自只改自己那个文件夹
│   ├── home/                         ⚠ 未被首页引用的死文件（首页全内联），仅留档勿改
│   │   ├── home.css
│   │   └── home.js
│   │
│   ├── gallery/                      ← 制瓷工序（单文件页）
│   │   ├── index.html                ← 65 KB：CSS + 8 道工序面板 + 交互全在文件里
│   │   └── libs/three.min.js         ← three.js r147 本地副本（不再走 CDN）
│   │
│   ├── ai/                           ← AI 生图页
│   │   ├── index.html
│   │   ├── ai.css
│   │   └── ai.js
│   │
│   ├── library/                      ← 资料库
│   │   ├── index.html
│   │   ├── library.css
│   │   ├── library.js                ← HOT / TYPES / PAGE 常量
│   │   └── ai.js                     ★ AI 接口配置（endpoint / systemPrompt）
│   │
│   └── timeline/                     ← 时间长廊
│       ├── eras.js                   ← 朝代文案（2D 版的资料，也当内容底稿）
│       └── immersive/                ← 3D 走廊本体
│           ├── walk/
│           │   ├── index.html        ★ 导航指向的正式入口（20.5 MB 打包单文件）
│           │   ├── index.esm.html    ← 同一页面的 ESM 版入口（改动调试用）
│           │   ├── interaction.js    ← 行走 / 拖拽 / 悬停查看的交互
│           │   ├── steps.json        ★ 各朝代工序卡数据（7 朝 × 8 步）
│           │   └── lib/              ← three.module.js / GLTFLoader / DRACO
│           ├── js/                   ← 3D 场景源码（main.js、config.js、
│           │   │                       entrance-gate.js、era-atmosphere.js、
│           │   │                       three-loader.js、patterns.data.js）
│           ├── css/style.css
│           ├── libs/                 ← three.min.js、addons、draco
│           ├── models/
│           │   ├── corridor_new.glb  ★ 走廊模型（13.2 MB，页面在用的就是这个）
│           │   └── corridor.glb      ← 上一版模型（13.9 MB，当前无引用）
│           ├── assets/
│           │   ├── patterns/<era>/   ← 左墙纹样（era：tang/song/yuan/ming/qing/minguo/modern）
│           │   ├── vessels/<era>/    ← 左墙器型
│           │   └── *.svg             ← 墙面纹样贴图
│           └── build-patterns.js     ← 扫描 assets/ 生成 js/patterns.data.js
│               build-vessels.js      ← 器型壁纸构建脚本
│
├── assets/                           ← 共享层（除非大改，否则别动）
│   ├── css/
│   │   ├── tokens.css                ★ 全站颜色/间距/字号定义
│   │   ├── base.css                  ← 基础样式、卡片、页脚、.reveal 入场动画
│   │   └── nav.css                   ← 导航栏样式
│   ├── js/site.js                    ← 导航栏、页脚自动生成 + 滚动收起 + reveal
│   ├── data/
│   │   ├── site.config.js            ★ 改导航栏只改这里
│   │   ├── masters.js                ← 匠人数据
│   │   ├── china-geo.json            ← 中国省界 GeoJSON（DataV 下载的本地副本，首页产地地图用）
│   │   └── manifest.json             ← 图片清单（build_assets.py 生成，勿手改）
│   ├── img/
│   │   ├── patterns/                 67 张纹样 + 67 缩略图（15 个朝代目录）
│   │   ├── shapes/                   349 张器型 + 349 缩略图（8 大类）
│   │   ├── masters/                  6 位匠人 + 6 缩略图
│   │   └── exhibits/                 8 张器物图（首页首屏瓷盘 + 六个盘 + 模态占位）
│   └── video/                        空目录，视频素材未接入
│
└── tools/
    └── build_assets.py               ← 原始素材 → 网页图片 + manifest.json
```

---

## 二、四个模块的边界

| 成员 | 负责 | 日常改什么 |
|------|------|-----------|
| **A** | 首页 + 制瓷页 | `index.html`、`modules/home/`、`modules/gallery/index.html`、`assets/data/masters.js` |
| **B** | 时间长廊 | `modules/timeline/`（含 `immersive/`） |
| **C** | 资料库 | `modules/library/` |
| **D** | AI 制作 | `modules/ai/`、`server.js`、`.env` |

### 三条铁律

1. **只改自己模块文件夹里的文件**，别人的一律不碰。
2. **内容写进数据文件，不要写进 HTML**（`steps.json`、`masters.js`、`library.js` 里的数组）。
3. **共享层三个文件要改，先在群里说一声**：`tokens.css`（主色）、`base.css`、`site.js`。它们头部的注释也写着「模块共用，任何人都不要改动」——真要覆盖，写在自己页面里用 `body[data-page="…"]` 作用域限定。

### 改导航栏

只改 `assets/data/site.config.js`：增删项、改 `text`/`en`/`href`。
**注意**：除首页之外的页面都靠 `site.js` 自动生成导航，但 **首页顶栏是手写的**，改名时要同步改 `index.html` 里那一处，否则首页和别的页会不一样。

---

## 三、速查表

| 想做什么 | 改哪个文件 |
|---|---|
| 改首页大字 / 分区文案 | `index.html`（`.hero`、`.sec-h` 等） |
| 改首页导航、字号 | `index.html` 顶部 `<style>` 里的 `.nav` / `.brand` |
| 改匠人资料 | `assets/data/masters.js` |
| 改制瓷页标题、工序文案 | `modules/gallery/index.html` 里的 `STAGES` 数组 |
| 改制瓷页配色/字号 | 同一文件的 `<style>`，深场用 `:root` 变量，纸面段在 `.craft` 一带 |
| 改长廊工序卡文案 | `modules/timeline/immersive/walk/steps.json` |
| 改长廊朝代介绍 | `modules/timeline/eras.js` |
| 长廊左墙换图 | 把图放进 `immersive/assets/patterns|vessels/<era>/`，再 `node build-patterns.js` |
| 改资料库分类/条数 | `modules/library/library.js` 里 `TYPES`、`PAGE` |
| 改 AI 人设/接口 | `modules/library/ai.js`、`server.js` |
| 全站主色 | `assets/css/tokens.css` 的 `:root` |

---

## 四、本地预览

```bash
cd "D:\Blue and White porcelain\web"
python -m http.server 8899
```

浏览器打开 `http://127.0.0.1:8899`。

- 首页、制瓷页、长廊页双击 `index.html` 也能看（`file://` 可用）。
- **但资料库必须走服务器**：它 `fetch('assets/data/manifest.json')`，`file://` 下会被安全策略拦掉。
- 长廊页首次加载要 20 MB + 13 MB 模型，等 5~10 秒属正常。

---

## 五、新增图片素材

### 资料库 / 纹样 / 器型（走 Python）

1. 把 `资料素材\青花瓷资料收集 (2).zip`、`青花瓷视频和文献收集.zip` 解压到：

   ```
   D:\Blue and White porcelain\_work\青花瓷资料收集\        ← 里面是 名称\、器型\
   D:\Blue and White porcelain\_work\传承人故事文章与照片\
   ```

2. 跑脚本：

   ```bash
   python tools\build_assets.py
   ```

脚本会压缩大图（最长边 1400）、生成缩略图（520）、重写 `assets/data/manifest.json`。
新图随即出现在资料库。

> `build_assets.py` 头部的 `SRC` / `SRC2` 两条路径写的就是上面的 `_work` 目录；
> 换位置改那两行即可。**注意：2026-11-17 清理时旧解包目录已删除，跑之前先解压。**

### 长廊左墙（走 Node）

```bash
cd modules\timeline\immersive
node build-patterns.js
```

扫描 `assets/patterns|vessels/<era>/` 下的图片，重写 `js/patterns.data.js`，再刷新页面。

---

## 六、AI 问答怎么接

默认是**离线检索**（只在本地清单里找条目），不需要配置。

想接真模型：

1. `node server.js`（默认 8787 端口，读 `.env`）
2. 复制 `.env.example` 为 `.env`，填：

   ```
   AI_API_KEY=sk-xxxxxxxx
   AI_BASE_URL=https://api.deepseek.com/v1
   AI_MODEL=deepseek-chat
   ```

3. 把 `modules/library/ai.js` 的 `AI_CONFIG.endpoint` 改成 `http://127.0.0.1:8787/api/chat`。
4. 刷新，右上角显示「AI 已连接」。

Key 只在本机 `.env` 里，不会进浏览器。任何 OpenAI 格式的接口都行。

---

## 七、部署

整个 `web` 文件夹就是成品，直接丢静态托管即可（GitHub Pages / Vercel / Netlify 拖拽）。
需要 AI 问答时才有额外的 Node 进程，托管到无 Node 的地方就把 `ai.js` 保持离线模式。

---

## 八、2026-11-17 清理记录（别再去找这些）

已删除、且**页面没有引用**，属于旧构建与临时文件：

| 删掉的 | 原因 |
|---|---|
| `web.zip` | 11/8 的整站旧快照，`web/` 已比它新 |
| `_tmp_extract`、`_tmp_extract2` | 资料素材 zip 的解包副本，zip 仍在 `资料素材/` |
| `_tmp_extract3` | 56 张按朝代编号的 PNG，站点与素材 zip 里均无同名文件 |
| `web\_backup\` | 旧版首页/展厅/时间轴备份（含弃用的中国地图页） |
| `modules\timeline.zip` | 长廊模块的旧压缩包，放在模块目录里没被引用 |
| `immersive\index.html`、`standalone.html` | 「实景漫游·单文件版」11/8 旧构建，两文件完全相同，已被 `walk\index.html` 取代 |
| `immersive\stream.html`、`procedural.html`、`_diag.js`、`_verify.js`、`blender.css`、`poster.jpg`、`g-01~04.png` | 旧入口页 / 调试脚本 / 只被它们引用的配图 |
| `walk\_test.html`、`*.bak`、`*.bak3` | 打包自检页与脚本备份 |

清理后 `web` 从 405 MB 降到 208 MB，全站容量 1.86 GB → 0.97 GB（其中 `资料素材/` 757 MB 原样保留）。

---

## 九、已知缺口（谁有空谁补）

1. **长廊左墙的工序卡图缺**：`walk/index.html` 会按 `steps.json` 的 `img` 找 `walk/cards/<era>_0N.png`
   和 `immersive/assets/patterns/<era>_0N.png`，这两套图目前不存在，控制台会打「[交互] 卡图缺失」，
   卡面显示为空。补图或改成按 `patterns.data.js` 取图即可。
2. `immersive/models/corridor.glb` 已无引用，留着当上一版模型，确认不要可删。
3. `assets/video/` 仍是空目录名，占位用（exhibits 已投入使用）。
4. 制瓷页已改为 three.js 实时工序演示（r147 本地库），不再有摄像头手势；资料库之外没有需要摄像头/HTTPS 的功能。

---

## 十、素材统计

| 类型 | 数量 |
|------|------|
| 纹样图片 | 67 张（15 个朝代/时期）+ 67 缩略图 |
| 器型图片 | 349 张（8 大类）+ 349 缩略图 |
| 匠人照片 | 6 张 + 6 缩略图 |
| **合计** | **422 张图 + 422 缩略图（844 个文件）** |
| 长廊左墙 | 纹样 / 器型各按 7 个 era 分目录，另有墙面 SVG 贴图 16 个 |
| 视频文献 | 13 部（工艺 6 + 欣赏 7），尚未接入页面 |

---

## 十一、视觉系统：白地青花（2026-11 重塑）

首页是"纸"，制瓷页是"窑房"——明暗对照，不要把它们调成同一个底色。

### 色板：青花分五色
`index.html` 的 `:root` 里定义，**改颜色只改这五个值**（另有瓷白底与窑火色）：

| 令牌 | 色值 | 用途 |
|------|------|------|
| `--q-tou` 头浓 | `#1F3D5F` | 标题、正文强调、结构线深端 |
| `--q-zheng` 正浓 | `#2C5780` | 正文、链接 |
| `--q-er` 二浓 | `#44688A` | 次级文字 |
| `--q-dan` 正淡 | `#7E9BB3` | 仅装饰（细线、大号数字），不可当文字色 |
| `--q-ying` 影淡 | `#C3D2DB` | 水洗层、分隔线 |
| `--bg` 瓷白 | `#F7F2E5` | 页面底色（配 `--bg-2` 作渐变） |
| `--kiln` 窑火 | `#B3502A` | 窑章强调色 |

旧变量名（`--ink/--text/--dim/--blue/--blue-hi`）保留并指向新色板，旧规则不用改。

### 字体
- 正文 `--serif`：Noto Serif SC。
- 批注 `--kai`：系统楷体（`Kaiti SC/STKaiti/KaiTi`），用于图注、藏品签说明、尾声诗句、凡例——**这些地方别改回宋体**，楷体是"图录感"的关键。

### 章节出场手法（每章只做一件事，别再统一加 `.rise` 上浮）
| 章节 | 手法 | 实现位置 |
|------|------|----------|
| 首屏 | 鼠标划过竖排"青花"，钴蓝在字内洇开 | `h1` 的 `--mx/--my/--a` + `@property --a` |
| 壹 釉下 | 三条波线像落笔一样描出（`stroke-dashoffset`） | `.dg-wave path` + `pathLength="1"` |
| 贰 钴料 | 四枚色点如点釉般晕开 | `.cobalt .row.in .chip` |
| 叁 产地 | 省份由核心到边缘依次浮现 | `.map-svg.born .prov` 按 `lv4→lv0` 延迟 |
| 肆 器 | 换盘时像唱片停针：转一下、落定 | `@keyframes settle` |
| 伍 纹样 | 卡片轻微歪斜（贴图感），悬停贴正；点开从卡片原地放大 | `.pat` 的 `--tilt` + 弹层 `transform-origin` |
| 陆 窑 | **整章滚入时变暗成窑房**，温度计数与八道工序逐个点灯 | `#kiln.in-kiln` + `.step.lit` |
| 尾声 | 静止（纸页合上） | 无动效 |

`.rise` 现在只是"内容常显"的空类，保留是为了不动旧标记；新内容不需要再加。

### 注意
- 窑章 8 道工序为四列两行（`≥980px`），改动 `.steps` 列数前先看 `760px` 断点。
- 器物的 `drop-shadow` 在纸底上很敏感，超过 `.2` 的不透明度就会糊成方块——调整时以截图放大边缘为准。
