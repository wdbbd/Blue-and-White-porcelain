# 青瓷白 · 中国传统青花瓷数字馆

> Blue and White Porcelain — A Digital Museum of Traditional Chinese Blue-and-White Porcelain
>
> 青花 · 一线 —— 白地为纸，钴料为墨，窑火一笔，青花千年。

一个**纯静态、零依赖、零构建**的青花瓷数字馆网站：以网页形式呈现青花瓷的历史沿革、纹样器型、制瓷工序与匠人故事，并提供 AI 生图与问答能力。开箱即用，改完 `Ctrl + F5` 即可看到效果。

---

## 🔗 代码仓库

- **GitHub**：<https://github.com/wdbbd/Blue-and-White-porcelain.git>
- 主页：<https://github.com/wdbbd/Blue-and-White-porcelain>

---

## ✨ 功能概览

站点采用深蓝与宣纸白的中式视觉，顶部为全站手写导航：

| 模块 | 导航 | 说明 |
|------|------|------|
| **首页** | 首页 / HOME | 全站入口。以「青花·一线」为主题首屏，讲述釉下钴蓝工艺、钴料来源，并展示历代精品与经典纹样 |
| **时间长廊** | 长廊 / TIMELINE | 3D 走廊沉浸式漫游，按朝代（唐 / 宋 / 元 / 明 / 清 / 民国 / 现代）依次展示纹样与器型，支持滚轮行走、鼠标拖拽与点击查看 |
| **展厅（制瓷工序）** | 展厅 / GALLERY | 以 three.js 交互分步讲解 8 道制瓷工序 |
| **AI 制作** | AI制作 / AI STUDIO | 选一种青花纹样 + 写下想要的画面，AI 生成一只专属青花圆盘（可复现 seed、保存原图） |
| **资料库** | 资料库 / LIBRARY | 纹样、器型、匠人资料的检索、筛选与浏览，内置 AI 问答 |
| **全站 AI 助手「小青」** | — | 全站统一的 AI 助手入口（最新合并），默认离线检索，可接入大模型 |

---

## 🚀 快速开始

整个项目是**纯静态页面**，无需构建。本地提供 `启动工坊.bat`，双击即可一键启动本地服务并打开 AI 制作页（依赖 Python，使用 8123 端口）。

手动启动方式：

```bash
cd web
python -m http.server 8899
```

浏览器打开 <http://127.0.0.1:8899>。

- 首页、展厅、长廊页可直接双击 `index.html` 用 `file://` 打开。
- **资料库必须走服务器**：它依赖 `fetch('assets/data/manifest.json')`，`file://` 下会被浏览器安全策略拦截。
- 时间长廊首次加载约 20 MB 页面 + 13 MB 模型，等待 5~10 秒属正常。

---

## 📁 目录结构

```
.
├── web/                          ← 成品站点（直接部署这个文件夹）
│   ├── index.html                ← 首页（图片 base64 内嵌，导航手写）
│   ├── server.js                 ← 可选：AI 问答代理（Node，无依赖）
│   ├── .env.example              ← AI Key 配置模板
│   ├── modules/                  ← 功能模块
│   │   ├── home/                 ← 首页配套样式与逻辑
│   │   ├── gallery/              ← 展厅 / 制瓷工序页
│   │   ├── ai/                   ← AI 生图页
│   │   ├── library/              ← 资料库（含 AI 接口配置）
│   │   └── timeline/             ← 时间长廊（含 3D 沉浸式漫游 immersive/）
│   ├── assets/                   ← 共享层（css / js / 图片数据）
│   ├── tools/                    ← 素材构建脚本（build_assets.py）
│   └── README.md                 ← web 模块详细说明
├── 资料素材/                      ← 原始素材压缩包（不随仓库分发）
└── README.md                     ← 本文件
```

> 更详细的模块边界、改代码速查表与素材构建流程见 [`web/README.md`](web/README.md)。

---

## 🎨 AI 能力接入（可选）

默认**离线检索**，无需任何配置即可使用。接入真实大模型：

```bash
cd web
cp .env.example .env     # 填入 API Key
node server.js           # 默认 8787 端口
```

然后把 `web/modules/library/ai.js` 里的 `AI_CONFIG.endpoint` 指向 `http://127.0.0.1:8787/api/chat`。支持任意 OpenAI 兼容接口（DeepSeek / 通义千问 / Kimi / OpenAI）。Key 只保存在本机 `.env`，不会暴露给浏览器。

---

## 📦 部署

`web` 文件夹即为成品，直接托管到任意静态服务（GitHub Pages / Vercel / Netlify）。需要 AI 问答时才额外运行 Node 代理；无 Node 的环境保持离线模式即可。

> 注：仓库当前未启用 GitHub Pages 演示站，请按上文本地启动或自行托管。

---

## 📊 素材统计

| 类型 | 数量 |
|------|------|
| 纹样图片 | 67 张（15 个朝代/时期）+ 缩略图 |
| 器型图片 | 349 张（8 大类）+ 缩略图 |
| 匠人照片 | 6 张 + 缩略图 |
| **图片合计** | **422 张 + 422 张缩略图** |
| 影像文献 | 13 部（工艺 6 + 欣赏 7，尚未接入页面） |

---

## 📄 许可

素材与代码仅供学习交流使用。原始素材版权归原作者所有。
