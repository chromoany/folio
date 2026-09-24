#!/usr/bin/env node
/**
 * Folio 图形界面本地服务：127.0.0.1:4680
 * 桌面版由 desktop/main.js 内嵌启动。
 * 界面语言：settings.language（安装向导 / 软件设置），错误文案随语言输出。
 * 说明：转换的临时文件一律写到用户数据目录（%APPDATA%\folio\gui-runs），
 *       不再写入安装目录，避免卸载后残留 resources 等文件夹。
 * 安全：所有请求先过 originAllowed（Host 白名单 + Origin 同源校验），
 *       /api/open 只允许打开本进程转换产出的 PDF 及其所在目录。
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
// 设置弹窗里显示的版本号，单一来源就是 package.json（桌面版 app.getVersion() 读的也是它）
const VERSION = require(path.join(__dirname, '..', 'package.json')).version;

const jobs = new Map(); // id -> { pdf, name, dir }
const MAX_JOBS = 50;    // 内存里最多保留 50 个转换结果，超出淘汰最早的（防长驻进程缓慢泄漏）

// 允许「打开」的绝对路径（小写化）：仅限本进程里转换产出的 PDF 及其所在目录。
// /api/open 由此收口：恶意网页再也不能让本机打开任意文件/文件夹。
const openables = new Map(); // 小写路径 -> 引用计数（同目录产出多个 PDF 时按计数清理）

function trackOpenable(p) {
  const k = String(p).toLowerCase();
  openables.set(k, (openables.get(k) || 0) + 1);
}
function untrackOpenable(p) {
  const k = String(p).toLowerCase();
  const n = (openables.get(k) || 0) - 1;
  if (n <= 0) openables.delete(k); else openables.set(k, n);
}

// 双语文案：按当前界面语言返回
function L(zh, en) {
  try {
    return settings.get('language') === 'en' ? en : zh;
  } catch (_) {
    return zh;
  }
}

function sendJson(res, code, obj) {
  if (res.writableEnded || res.destroyed) return; // 连接已断（如请求体超限后被销毁），不再写响应
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

// ---- 请求来源校验（防恶意网页跨源调用 / 防 DNS rebinding）----
// 服务只服务本机 GUI。浏览器里任意网页都能向 127.0.0.1:4680 发跨源请求（同源策略拦不住
// 「写出型」请求），DNS rebinding 更能把攻击者域名直接解析到 127.0.0.1 绕过来源——两条路都堵死：
//   ① Host 必须是 127.0.0.1:<port> / localhost:<port>（rebinding 场景 Host 是攻击者域名，直接拒绝）
//   ② 带 Origin 头的请求（浏览器对跨源请求 / POST 自动附加）必须同源；无 Origin 视为本机直接访问放行
function originAllowed(req) {
  const host = String(req.headers.host || '').toLowerCase();
  if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  const o = String(origin).toLowerCase();
  return o === `http://127.0.0.1:${PORT}` || o === `http://localhost:${PORT}`;
}

// 请求体按字节累积（Buffer），收齐后一次性 utf8 解码再 JSON.parse：
// 之前按字符串拼接，多字节 UTF-8 字符被 TCP 分包截断时会变成 U+FFFD 乱码
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 50 * 1024 * 1024) { reject(new Error(L('内容过大', 'Content too large'))); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(new Error(L('JSON 解析失败', 'Invalid JSON'))); }
    });
    req.on('error', reject);
  });
}
function safeName(n) {
  const b = path.basename(String(n || ''));
  return b.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || 'input.md';
}

function openPath(p) {
  // start 的第一个参数是窗口标题，必须留一个空字符串占位；路径里的引号一律去掉，防 cmd 元字符注入
  spawn('cmd', ['/c', 'start', '', String(p).replace(/"/g, '')], { stdio: 'ignore', detached: true, windowsHide: true }).unref();
}
// 杀掉占用指定端口的进程（旧服务），保证每次双击都用最新代码。
// 必须按列解析：只在 TCP LISTENING 行的「本地地址」列上精确匹配 :<port> 结尾——
// 之前的整行 includes(':4680') 会误中远程地址 :46800 / :14680 之类，taskkill /F 杀错无关进程。
function killPortOwner(port) {
  try {
    const out = execSync('netstat -ano -p tcp', { encoding: 'utf8', windowsHide: true });
    for (const line of out.split(/\r?\n/)) {
      if (!line.toUpperCase().includes('LISTENING')) continue;
      const cols = line.trim().split(/\s+/);
      // netstat -ano 行：Proto 本地地址 远程地址 State PID
      if (cols.length < 4 || cols[0].toUpperCase() !== 'TCP') continue;
      const local = cols[1].toLowerCase();
      const pid = cols[cols.length - 1];
      if (!/^\d+$/.test(pid) || Number(pid) === process.pid) continue;
      if (local.endsWith(`:${port}`)) {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore', windowsHide: true });
        return true;
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
    if (!originAllowed(req)) { sendJson(res, 403, { ok: false, error: L('拒绝跨源请求', 'Cross-origin request rejected') }); return; }
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
      sendJson(res, 200, { ok: true, version: VERSION, settings: settings.load() });
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
      if (b.theme !== undefined) {
        if (settings.THEMES.includes(b.theme)) {
          settings.set('theme', b.theme);
        } else {
          throw new Error(L('无效的主题设置', 'Invalid theme setting'));
        }
      }
      sendJson(res, 200, { ok: true, version: VERSION, settings: settings.load() });
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
        font: { cjk: 'Microsoft YaHei', mono: 'Consolas', monoCjk: 'NSimSun', size: '10.5pt', monoSize: '8pt' },
        lang: settings.get('language'), // 转换日志/错误提示随界面语言
      };      // 每次转换都重新加载最新 folio.cjs，避免旧服务驻留旧代码导致旧效果
      const cliPath = require.resolve('../bin/folio.cjs');
      delete require.cache[cliPath];
      const fresh = require(cliPath);
      const logs = [];
      const r = fresh.build(cfg, { log: (m) => logs.push(m) });
      trackOpenable(r.output);
      trackOpenable(path.dirname(r.output));
      jobs.set(id, { pdf: r.output, name: path.basename(r.output), dir: path.dirname(r.output) });
      while (jobs.size > MAX_JOBS) {
        const oldest = jobs.keys().next().value;
        const j0 = jobs.get(oldest);
        untrackOpenable(j0.pdf);
        untrackOpenable(j0.dir);
        jobs.delete(oldest);
      }
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
      // 只允许打开本进程转换产出的 PDF 或其所在目录（dir=1）；其余一律 403
      const p2 = u.searchParams.get('path');
      if (!p2 || !fs.existsSync(p2)) { sendJson(res, 404, { ok: false, error: L('文件不存在', 'File not found') }); return; }
      const wantDir = u.searchParams.get('dir') === '1';
      const rp = path.resolve(p2);
      let target;
      if (wantDir) {
        // 兼容两种传法：给目录就开目录，给文件就开其所在目录（前端只拿得到 savedTo 文件路径）
        target = fs.statSync(rp).isDirectory() ? rp : path.dirname(rp);
      } else {
        target = rp;
      }
      if (!openables.has(target.toLowerCase())) {
        sendJson(res, 403, { ok: false, error: L('只允许打开本次转换的输出文件', 'Only outputs of this session can be opened') });
        return;
      }
      openPath(target);
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