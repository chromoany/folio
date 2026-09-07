#!/usr/bin/env node
/**
 * mdbook 图形界面本地服务：127.0.0.1:4680
 * 双击根目录「启动.vbs」→ 自动开浏览器 → 选文件 → 转换
 * 测试时可设环境变量 MDBOOK_GUI_NO_OPEN=1 禁止自动开浏览器
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { build } = require('../bin/mdbook.cjs');

const ROOT = path.resolve(__dirname, '..');
const RUNS = path.join(ROOT, '.build', 'gui-runs');
const PORT = Number(process.env.MDBOOK_GUI_PORT || 4680);

const jobs = new Map(); // id -> { pdf, name }

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 50 * 1024 * 1024) { reject(new Error('内容过大')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch (e) { reject(new Error('JSON 解析失败')); } });
    req.on('error', reject);
  });
}

function safeName(n) {
  const b = path.basename(String(n || ''));
  return b.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || 'input.md';
}

function openPath(p) {
  spawn('cmd', ['/c', 'start', '', p], { stdio: 'ignore', detached: true }).unref();
}

// 杀掉占用指定端口的进程（旧服务），保证每次双击都用最新代码
function killPortOwner(port) {
  try {
    const out = execSync('netstat -ano -p tcp', { encoding: 'utf8', windowsHide: true });
    for (const line of out.split(/\r?\n/)) {
      if (line.includes(`:${port}`) && line.toUpperCase().includes('LISTENING')) {
        const pid = line.trim().split(/\s+/).pop();
        if (/^\d+$/.test(pid)) {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore', windowsHide: true });
          return true;
        }
      }
    }
  } catch (_) {}
  return false;
}

async function handle(req, res) {
  try {
    const u = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
      return;
    }

    if (req.method === 'GET' && u.pathname === '/icon.png') {
      const icon = path.join(__dirname, 'icon.png');
      if (fs.existsSync(icon)) {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400' });
        res.end(fs.readFileSync(icon));
        return;
      }
    }

    if (req.method === 'POST' && u.pathname === '/api/convert') {
      const b = await readBody(req);
      const files = (b.files || []).filter((f) => f && f.name);
      if (!files.length) throw new Error('请先选择要转换的 .md 文件');

      const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
      const runDir = path.join(RUNS, id);
      const inputDir = path.join(runDir, 'inputs');
      fs.mkdirSync(inputDir, { recursive: true });

      const inputs = files.map((f, i) => {
        const p = path.join(inputDir, String(i).padStart(2, '0') + '-' + safeName(f.name));
        fs.writeFileSync(p, String(f.content ?? ''), 'utf8');
        return p;
      });

      const outBase = b.title ? safeName(b.title) : safeName(files[0].name.replace(/\.md$/i, ''));
      const output = b.output ? path.resolve(b.output) : path.join(runDir, outBase + '.pdf');

      const cfg = {
        inputs,
        output,
        title: b.title || '',
        subtitle: b.subtitle || '',
        chapterBreak: b.chapterBreak !== false,
        toc: { enabled: b.toc !== false, title: '目录', depth: Number(b.tocDepth) || 3 },
        page: { paper: 'a4', marginX: '20mm', marginY: '18mm' },
        font: { cjk: 'Microsoft YaHei', mono: 'Consolas', size: '10.5pt', monoSize: '8pt' },
      };
      // 每次转换都重新加载最新 mdbook.cjs，避免旧服务驻留旧代码导致旧效果
      const cliPath = require.resolve('../bin/mdbook.cjs');
      delete require.cache[cliPath];
      const fresh = require(cliPath);
      const logs = [];
      const r = fresh.build(cfg, { log: (m) => logs.push(m) });
      jobs.set(id, { pdf: r.output, name: path.basename(r.output) });
      sendJson(res, 200, { ok: true, id, name: path.basename(r.output), savedTo: b.output ? r.output : null, size: r.size, logs });
      return;
    }

    if (req.method === 'GET' && u.pathname === '/api/download') {
      const job = jobs.get(u.searchParams.get('id'));
      if (!job || !fs.existsSync(job.pdf)) { sendJson(res, 404, { ok: false, error: '文件不存在或已过期' }); return; }
      const buf = fs.readFileSync(job.pdf);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': buf.length,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(job.name)}`,
      });
      res.end(buf);
      return;
    }

    if (req.method === 'GET' && u.pathname === '/api/open') {
      const p = u.searchParams.get('path');
      if (!p || !fs.existsSync(p)) { sendJson(res, 404, { ok: false, error: '文件不存在' }); return; }
      openPath(p);
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { ok: false, error: '未找到该接口' });
  } catch (e) {
    sendJson(res, 500, { ok: false, error: e.message || String(e) });
  }
}

fs.mkdirSync(RUNS, { recursive: true });

function startServer(attempt) {
  const srv = http.createServer(handle);
  srv.on('error', (e) => {
    if (e.code === 'EADDRINUSE' && attempt < 3) {
      console.log('检测到旧服务，正在杀掉并用最新代码重启…');
      killPortOwner(PORT);
      setTimeout(() => startServer(attempt + 1), 600);
      return;
    }
    if (e.code === 'EADDRINUSE') {
      const url = `http://127.0.0.1:${PORT}`;
      if (!process.env.MDBOOK_GUI_NO_OPEN) openPath(url);
      console.log('旧服务未能停止，直接用现有服务：' + url);
      process.exit(0);
    }
    throw e;
  });
  srv.listen(PORT, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${PORT}`;
    console.log('mdbook GUI 已启动：' + url);
    if (!process.env.MDBOOK_GUI_NO_OPEN) openPath(url);
  });
}
startServer(0);
