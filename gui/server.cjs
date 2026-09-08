#!/usr/bin/env node
/**
 * Folio 图形界面本地服务：127.0.0.1:4680
 * 桌面版由 desktop/main.js 内嵌启动；浏览器版可双击根目录「启动.vbs」→ 自动开浏览器。
 * 界面语言：settings.language（安装向导 / 软件设置），错误文案随语言输出。
 * 说明：转换的临时文件一律写到用户数据目录（%APPDATA%\folio\gui-runs），
 *       不再写入安装目录，避免卸载后残留 resources 等文件夹。
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { build } = require('../bin/folio.cjs');
const settings = require('../desktop/settings.js');

const RUNS = path.join(settings.getBaseDir(), 'gui-runs');
const PORT = Number(process.env.FOLIO_GUI_PORT || 4680);

const jobs = new Map(); // id -> { pdf, name }

// 双语文案：按当前界面语言返回
function L(zh, en) {
  try {
    return settings.get('language') === 'en' ? en : zh;
  } catch (_) {
    return zh;
  }
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 50 * 1024 * 1024) { reject(new Error(L('内容过大', 'Content too large'))); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch (e) { reject(new Error(L('JSON 解析失败', 'Invalid JSON'))); } });
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
// 清理超过 1 天的历史转换临时目录，避免用户数据目录无限膨胀
function cleanupOldRuns() {
  try {
    if (!fs.existsSync(RUNS)) return;
    const day = 24 * 60 * 60 * 1000;
    for (const name of fs.readdirSync(RUNS)) {
      const p2 = path.join(RUNS, name);
      try {
        const st = fs.statSync(p2);
        if (st.isDirectory() && Date.now() - st.mtimeMs > day) fs.rmSync(p2, { recursive: true, force: true });
      } catch (_) {}
    }
  } catch (_) {}
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
    if (req.method === 'GET' && u.pathname === '/api/settings') {
      sendJson(res, 200, { ok: true, settings: settings.load() });
      return;
    }

    if (req.method === 'POST' && u.pathname === '/api/settings') {
      const b = await readBody(req);
      if (b.closeBehavior !== undefined) {
        if (['tray', 'quit'].includes(b.closeBehavior)) {
          settings.set('closeBehavior', b.closeBehavior);
        } else {
          throw new Error(L('无效的关闭行为设置', 'Invalid close-behavior setting'));
        }
      }
      if (b.language !== undefined) {
        if (['zh', 'en'].includes(b.language)) {
          settings.set('language', b.language);
        } else {
          throw new Error(L('无效的语言设置', 'Invalid language setting'));
        }
      }
      sendJson(res, 200, { ok: true, settings: settings.load() });
      return;
    }
    if (req.method === 'POST' && u.pathname === '/api/convert') {
      const b = await readBody(req);
      const files = (b.files || []).filter((f) => f && f.name);
      if (!files.length) throw new Error(L('请先选择要转换的 .md 文件', 'Please select the .md file(s) to convert first'));

      const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
      const runDir = path.join(RUNS, id);
      const inputDir = path.join(runDir, 'inputs');
      fs.mkdirSync(inputDir, { recursive: true });

      const inputs = files.map((f, i) => {
        const p2 = path.join(inputDir, String(i).padStart(2, '0') + '-' + safeName(f.name));
        fs.writeFileSync(p2, String(f.content ?? ''), 'utf8');
        return p2;
      });

      const outBase = b.title ? safeName(b.title) : safeName(files[0].name.replace(/\.md$/i, ''));
      const output = b.output ? path.resolve(b.output) : path.join(runDir, outBase + '.pdf');

      const cfg = {
        inputs,
        output,
        title: b.title || '',
        subtitle: b.subtitle || '',
        chapterBreak: b.chapterBreak !== false,
        toc: { enabled: b.toc !== false, title: L('目录', 'Contents'), depth: Number(b.tocDepth) || 3 },
        page: { paper: 'a4', marginX: '20mm', marginY: '18mm' },
        font: { cjk: 'Microsoft YaHei', mono: 'Consolas', size: '10.5pt', monoSize: '8pt' },
        lang: settings.get('language'), // 转换日志/错误提示随界面语言
      };      // 每次转换都重新加载最新 folio.cjs，避免旧服务驻留旧代码导致旧效果
      const cliPath = require.resolve('../bin/folio.cjs');
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
      if (!job || !fs.existsSync(job.pdf)) { sendJson(res, 404, { ok: false, error: L('文件不存在或已过期', 'File not found or expired') }); return; }
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
      const p2 = u.searchParams.get('path');
      if (!p2 || !fs.existsSync(p2)) { sendJson(res, 404, { ok: false, error: L('文件不存在', 'File not found') }); return; }
      openPath(p2);
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { ok: false, error: L('未找到该接口', 'API endpoint not found') });
  } catch (e) {
    sendJson(res, 500, { ok: false, error: e.message || String(e) });
  }
}
fs.mkdirSync(RUNS, { recursive: true });
cleanupOldRuns();

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
      if (!process.env.FOLIO_GUI_NO_OPEN) openPath(url);
      console.log('旧服务未能停止，直接用现有服务：' + url);
      process.exit(0);
    }
    throw e;
  });
  srv.listen(PORT, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${PORT}`;
    console.log('Folio GUI 已启动：' + url);
    if (!process.env.FOLIO_GUI_NO_OPEN) openPath(url);
  });
}
startServer(0);