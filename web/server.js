/* ============================================================
   AI 问答后端 · 【成员 D 负责】—— 可选，不影响前端基本功能
   ------------------------------------------------------------
   用途：把用户的问题转给大模型，Key只留在这台机器上，
        不会暴露在浏览器里。

   怎么用：
     1) 把 .env.example 复制成 .env，填上你的 API Key
     2) node server.js
     3) 把 modules/library/ai.js 里的 AI_CONFIG.endpoint
        改成 'http://127.0.0.1:8787/api/chat'
     4) 刷新页面

   不配置也能用——那时资料库会退回「本地检索」模式。
   ============================================================ */

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8787;
const KEY = process.env.AI_API_KEY || '';
const BASE = (process.env.AI_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, '');
const MODEL = process.env.AI_MODEL || 'deepseek-chat';

if (!KEY) {
  console.log('');
  console.log('  未检测到 AI_API_KEY。');
  console.log('  服务仍会启动，但 /api/chat 会提示未配置。');
  console.log('  前端会自动退回本地检索模式，功能不受影响。');
  console.log('');
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS); return res.end();
  }

  if (req.url === '/api/health') {
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, configured: !!KEY, model: MODEL }));
  }

  if (req.url !== '/api/chat' || req.method !== 'POST') {
    res.writeHead(404, CORS);
    return res.end(JSON.stringify({ error: 'Not found' }));
  }

  let body = '';
  req.on('data', (c) => {
    body += c;
    if (body.length > 1e6) { req.destroy(); }        // 防止超大请求
  });

  req.on('end', async () => {
    if (!KEY) {
      res.writeHead(503, { ...CORS, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '未配置 AI_API_KEY，请在 .env 中填写' }));
    }

    let question = '', system = '', context = [];
    try {
      const j = JSON.parse(body);
      question = (j.question || '').slice(0, 500);
      system = (j.system || '').slice(0, 2000);
      context = Array.isArray(j.context) ? j.context.slice(0, 12) : [];
    } catch {
      res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '请求格式错误' }));
    }

    if (!question) {
      res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '问题不能为空' }));
    }

    const ctxText = context.length
      ? '\n\n【本地资料库中与该问题相关的条目，可作为参考】\n' +
        context.map((c, i) => `${i + 1}. ${c}`).join('\n')
      : '';

    try {
      const r = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: (system || '你是一个青花瓷讲解员。') + ctxText },
            { role: 'user', content: question },
          ],
          temperature: 0.7,
          max_tokens: 800,
        }),
      });

      const data = await r.json();
      const answer = data?.choices?.[0]?.message?.content
        || data?.error?.message
        || '（模型未返回内容）';

      res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ answer }));
    } catch (err) {
      res.writeHead(502, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '调用失败：' + err.message }));
    }
  });
}).listen(PORT, () => {
  console.log('');
  console.log('  青瓷白 · AI 问答服务已启动');
  console.log(`  地址：http://127.0.0.1:${PORT}`);
  console.log(`  模型：${MODEL}　配置：${KEY ? '已就绪' : '未配置（将退回本地检索）'}`);
  console.log('');
});