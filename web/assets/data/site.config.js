/* ============================================================
   站点配置· 【全站唯一改导航的地方】
   ------------------------------------------------------------
   要增删导航栏目 / 改名字 / 改负责人 → 只改这个文件。
   页面本身不用动。所有页面会自动读取这里。
   ============================================================ */

window.SITE = {
  name: '青瓷白',
  sub: 'Blue & White',
  tagline: '千年青花·一页之间',

  // 导航栏：每位负责人只改自己那一条的 owner 字段即可
  nav: [
    { id: 'home',     text: '首页',   en: 'Home',     owner: '成员 A（首页+展厅）', href: '../index.html',                depth: 1 },
    { id: 'timeline', text: '长廊',   en: 'Timeline', owner: '成员 B（长廊）',     href: '../modules/timeline/immersive/walk/index.html', depth: 2 },
    { id: 'gallery',  text: '制瓷',   en: 'Craft',    owner: '成员 A（首页+展厅）', href: '../modules/gallery/index.html',  depth: 2 },
    { id: 'ai',       text: 'AI制作', en: 'AI Studio', owner: '成员 A（AI 生图）',  href: '../modules/ai/index.html',      depth: 2 },
    { id: 'library',  text: '资料库', en: 'Library',  owner: '成员 C（资料库）',   href: '../modules/library/index.html',  depth: 2 },
  ],

  foot: {
    line1: '青瓷白 · 中国传统青花瓷数字馆',
    line2: '基于项目所收集的 416 件实物图像与13 部影像文献整理而成',
  },
};