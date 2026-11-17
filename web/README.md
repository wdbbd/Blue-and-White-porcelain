# 青瓷白 · 中国传统青花瓷数字馆

一个纯静态的网页项目，零依赖、零构建。三位成员各自负责一个模块，互不干扰。

---

## 一、先看这里：文件结构与归属

```
web/
├── index.html                ← 首页（成员 A）
│
├── modules/                  ← ★ 每个人只改自己那个文件夹
│   ├── home/                 ← 成员 A：首页总览（含匠人板块）
│   │   ├── （页面在项目根目录 index.html）
│   │   ├── home.css          样式
│   │   ├── home.js           逻辑
│   │   └── （内容在 assets/data/masters.js）
│   │
│   ├── timeline/             ← 成员 B：时间长廊
│   │   ├── index.html        页面结构
│   │   ├── timeline.css      样式
│   │   ├── timeline.js       逻辑
│   │   └── eras.js           ★ 朝代内容（日常主要改这个）
│   │
│   ├── gallery/              ← 成员 C：三维展厅
│   │   ├── index.html
│   │   ├── gallery.css
│   │   ├── gallery.js
│   │   ├── exhibits.js       ★ 展品数据（日常主要改这个）
│   │   ├── vessel3d.js       3D 引擎
│   │   └── hands.js          摄像头手势
│   │
│   └── library/              ← 成员 D：资料库
│       ├── index.html
│       ├── library.css
│       ├── library.js
│       └── ai.js             ★ AI 接口配置
│
├── assets/                   ← 共享层（除非大改，否则都别动）
│   ├── css/
│   │   ├── tokens.css        ★ 全站唯一的颜色/间距定义
│   │   ├── base.css          基础样式 + 卡片/按钮/页脚
│   │   └── nav.css           导航栏样式
│   ├── js/
│   │   └── site.js           导航栏/页脚自动生成
│   ├── data/
│   │   ├── site.config.js    ★ 改导航栏只改这里
│   │   ├── masters.js        匠人数据（成员 A 维护）
│   │   └── manifest.json     全部图片清单（自动生成，勿手改）
│   ├── img/                  416 张图片 + 缩略图
│   └── video/                （视频素材，未启用）
│
└── tools/
    └── build_assets.py       图片批处理脚本（新增素材时才用）
```

### 三个人的边界

| 成员 | 负责模块 | 日常改什么 |
|------|---------|-----------|
| **A** | 首页 + 三维展厅 | `modules/home/`、`modules/gallery/`、`assets/data/masters.js` |
| **B** | 时间长廊 | `modules/timeline/` |
| **C** | 资料库 | `modules/library/` |

> **重要**：`assets/css/tokens.css`、`assets/js/site.js`、`assets/css/base.css` 是共享层。
> 三个人都可以用，但改动前先在群里说一声，避免覆盖别人的修改。

### ⚠️ 三条铁律（能避免 90% 的冲突）

1. **只改自己模块文件夹里的文件**，别人的文件夹一律不碰。
2. **内容写进数据文件，不要写进 HTML。** 数据文件（`eras.js` / `exhibits.js` /
   `masters.js`）是纯对象，照抄现有格式改就行，不会影响别人。
3. **共享层三个文件要改先说一声。** 尤其是 `tokens.css` —— 改主色会影响全站。

---

## 一点五、改代码速查表（按人分）

### 成员 A：首页 + 展厅

| 想做什么 | 改哪个文件 |
|---------|-----------|
| 改首屏大字、按钮文案 | `index.html` 里 `.hero-t`、`.hero-d` |
| 改三大分区介绍文字 | `index.html` 里 `.c-card` 的 `<p>` |
| 改青花工艺四道工序 | `modules/home/home.js` 顶部的 `CRAFT` 数组 |
| 改匠人资料 | `assets/data/masters.js` |
| 调整首页配色/间距 | `modules/home/home.css` |
| **上架新展品** | `modules/gallery/exhibits.js` 加一个对象 |
| 改3D 器型形状 | `modules/gallery/vessel3d.js` 的 `PROFILES` |
| 调整展厅布局 | `modules/gallery/gallery.css` |

### 成员 B：长廊

| 想做什么 | 改哪个文件 |
|---------|-----------|
| **改朝代介绍、工艺**（最常用） | `modules/timeline/eras.js` |
| 改展品显示数量（现在每个时期 8 件） | `timeline.js` 里 `pick(era.id, 8)` 的 `8` |
| 改长廊整体布局 | `modules/timeline/timeline.css` |
| 改左右墙标题文字 | `timeline.js` 里 `wall-t` 那两行 |

### 成员 C：资料库

| 想做什么 | 改哪个文件 |
|---------|-----------|
| 改热门关键词 | `library.js` 里 `HOT` 数组 |
| 改筛选分类 | `library.js` 顶部 `TYPES` 数组 |
| 改每页显示条数 | `library.js` 里 `PAGE = 48` |
| 改 AI 人设/语气 | `ai.js` 里 `systemPrompt` |
| 调资料库视觉 | `modules/library/library.css` |

---

## 二、每天怎么更新（最重要的一节）

### 原则：**内容改数据文件，样式改自己的 CSS**

绝大多数日常更新不需要碰 HTML。

### 场景 1：改文案 / 加展品 / 改朝代内容

只改对应的 `.js` 数据文件，格式是纯对象，照抄现有的改：

**加一件展厅展品** → 编辑 `modules/gallery/exhibits.js`，在数组里加一项：

```js
{
  id: 'new-piece-01',                      // 唯一标识，英文，不重复
  name: '青花缠枝花卉纹罐',                 // 器物名
  dynasty: '明',cat: '罐类',                // 朝代、类别
  img: 'img/shapes/罐类/明/xxx.jpg',        // 大图路径（相对 assets/）
  thumb: 'img/shapes/罐类/明/xxx_t.jpg',    // 缩略图路径
  profile: 'jar',                          // 3D 器型，见下方器型表
  tags: ['青花', '缠枝', '明代'],
  desc: '一句话简介，显示在展品信息栏。',
  detail: ['第一段详细说明。', '第二段详细说明。'],
},
```

**改长廊文案** → 编辑 `modules/timeline/eras.js`，改对应朝代的 `intro` 或 `craft`。

**改匠人资料** → 编辑 `assets/data/masters.js`。

### 场景 2：改样式

改自己模块的 `.css` 文件。**不要**为了改颜色去改 HTML 的内联样式。

如果需要调整全站配色（主色、背景色、字体），改 `assets/css/tokens.css` 里的 `:root` 变量，
例如：

```css
--c-celadon: #7a9e9e;   /* 天青 · 主色 */
```

### 场景 3：改导航栏

编辑 `assets/data/site.config.js`，四个页面会自动同步，不用逐个改 HTML。

---

## 三、怎么本地预览

需要用本地服务器打开（直接双击 `index.html` 的话，浏览器会因为安全策略
拦截 JSON 读取和摄像头）。

**方式一（推荐）**：在 `web` 文件夹下执行

```bash
python -m http.server 8899
```

然后浏览器打开 `http://127.0.0.1:8899`

**方式二**：用 VS Code 的 Live Server 插件，右键 `index.html` → Open with Live Server

> 每次改完代码，浏览器按 `Ctrl + F5` 强制刷新即可看到效果，无需任何构建步骤。

---

## 四、新增图片素材怎么办

把新图片按下面的结构放进 `_tmp_extract`（或任意目录），然后跑一次脚本：

```bash
python tools/build_assets.py
```

脚本会做三件事：压缩成网页用的大图（最长边1400px）、生成缩略图（520px）、
更新 `assets/data/manifest.json`。

之后新图片就会自动出现在资料库里。

---

## 五、AI 问答怎么接（需要你自己操作）

现在默认是**离线检索模式**：直接在本地资料库里找相关条目，
不需要任何配置就能用。想换成真正的 AI 问答：

**第 1 步**：在 `web` 目录下新建 `server.js`（内容见 `server.example.js`），
或者直接用我准备好的 `server.js`：

```bash
node server.js
```

**第 2 步**：设置 API Key。复制 `.env.example` 为 `.env`，填入你的 key：

```
AI_API_KEY=sk-xxxxxxxxxxxx
AI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat
```

**第 3 步**：编辑 `modules/library/ai.js`，把 `AI_CONFIG.endpoint` 改成：

```js
endpoint: 'http://127.0.0.1:8787/api/chat',
```

刷新页面，右上角会显示「AI 已连接」。

> 支持任何 OpenAI 格式的接口：DeepSeek、通义千问、Kimi、OpenAI 都可以。
> Key 只存在你本机的 `.env` 里，不会暴露给浏览器。

---

## 六、摄像头手势怎么用

展厅页面点「开启手势控制」，浏览器会请求摄像头权限，允许后：

- 手掌左右移动 → 器物跟着旋转
- 不给权限也能用，用鼠标拖动旋转

**注意**：摄像头功能要求 `https://` 或 `localhost` 环境。如果部署到公网，
必须用 HTTPS，否则浏览器不会给摄像头权限。

---

## 七、部署上线

整个 `web` 文件夹就是成品，直接传到任何静态托管即可：

- **GitHub Pages**：推到仓库 → Settings → Pages → 选择分支
- **Vercel / Netlify**：拖拽整个 `web` 文件夹到网页上，无需构建命令
- **本地局域网分享**：用 `python -m http.server` + 同事访问你的 `内网IP:8899`

---

## 八、素材统计

| 类型 | 数量 |
|------|------|
| 纹样图片 | 67 张（15 个朝代/时期） |
| 器型图片 | 349 张（8 大类） |
| 匠人照片 | 6 张 |
| **合计** | **422 张图片 + 422 张缩略图** |
| 视频文献 | 13 部（工艺类6 + 欣赏类 7，尚未启用） |