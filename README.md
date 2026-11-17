# 青瓷白 · 中国传统青花瓷数字馆

> Blue and White Porcelain — A Digital Museum of Traditional Chinese Blue-and-White Porcelain

一个纯静态、零依赖的青花瓷数字馆：以网页形式呈现青花瓷的历史、纹样、器型、制瓷工序与匠人故事。开箱即用，改完 `Ctrl+F5` 即可看到效果。

---

## ✨ 功能概览

| 模块 | 说明 |
|------|------|
| **首页** | 全站入口，视觉化呈现青花瓷主题，导航为手写顶栏 |
| **时间长廊** | 3D 走廊沉浸式游览，按朝代（唐/宋/元/明/清/民国/现代）展示纹样与器型 |
| **制瓷工序** | 8 道制瓷工序的分步讲解，含 three.js 交互 |
| **资料库** | 纹样、器型、匠人资料检索与浏览 |
| **AI 制作** | 内置 AI 生图/问答入口（可离线检索，也可接模型） |

---

## 🚀 快速开始

整个项目是**纯静态页面**，无需构建。

```bash
cd web
python -m http.server 8899
```

浏览器打开 <http://127.0.0.1:8899>。

- 首页、制瓷页、长廊页可直接双击 `index.html` 用 `file://` 打开。
- **资料库必须走服务器**：它依赖 `fetch('assets/data/manifest.json')`，`file://` 下会被浏览器安全策略拦截。
- 时间长廊首次加载需约 20 MB 页面 + 13 MB 模型，等待 5~10 秒属正常。

---

## 📁 目录结构

```
.
├── web/                        ← 成品站点（直接部署这个文件夹）
│   ├── index.html              ← 首页
│   ├── server.js               ← 可选：AI 问答代理（Node，无依赖）
│   ├── .env.example            ← AI Key 配置模板
│   ├── assets/                 ← 共享层（css / js / 图片数据）
│   ├── modules/                ← 功能模块（home / gallery / ai / library / timeline）
│   └── tools/                  ← 素材构建脚本（build_assets.py）
├── 资料素材/                    ← 原始素材压缩包（已 gitignore，不随仓库分发）
└── .gitignore
```

> 更详细的模块边界与速查表见 [`web/README.md`](web/README.md)。

---

## 🎨 AI 问答接入（可选）

默认**离线检索**，无需任何配置。想接真实大模型：

```bash
cd web
cp .env.example .env   # 填入你的 API Key
node server.js         # 默认 8787 端口
```

然后把 `web/modules/library/ai.js` 里的 `AI_CONFIG.endpoint` 指向 `http://127.0.0.1:8787/api/chat`。

支持任意 OpenAI 兼容接口（DeepSeek / 通义千问 / Kimi / OpenAI）。

---

## 📦 部署

`web` 文件夹即为成品，直接托管到任意静态服务（GitHub Pages / Vercel / Netlify）。

---

## 📄 许可

素材与代码仅供学习交流使用。原始素材版权归原作者所有。

## 🔗 相关链接

- 仓库地址：<https://github.com/wdbbd/Blue-and-White-porcelain>
