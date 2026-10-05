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
const { getMermaidRenderer } = require('../desktop/mermaid.cjs');

// mermaid 图渲染钩子：桌面版（本文件跑在 Electron 主进程）拿到浏览器内核渲染器；
// 纯 node 直跑本服务时为 null，转换照常、mermaid 保留代码块并在日志提示
const mermaidRender = getMermaidRenderer();

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

// 字体名会被插进 Typst 模板的字符串字面量：禁引号/反斜杠/换行/控制字符并限长。
// 空串 = 用默认值（英文字体留空还有「跟随中文字体」的语义，调用方据此决定要不要覆盖）。
function safeFont(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  // eslint-disable-next-line no-control-regex
  if (s.length > 80 || /["\\\r\n\t\u0000-\u001f]/.test(s)) {
    throw new Error(L('字体名不合法：' + s, 'Invalid font family: ' + s));
  }
  return s;
}

// 转换与 /api/fonts 都要读 bin/folio.cjs：每次重新 require，避免长驻服务用旧代码（DEFAULTS 单一来源）
function freshCli() {
  const cliPath = require.resolve('../bin/folio.cjs');
  delete require.cache[cliPath];
  return require(cliPath);
}

// 数值型排版参数：界面传数字，这里换算成 Typst 长度（unit='pt'/'mm'）；未传或空串 = 用默认值。
// 越界直接拒绝，避免一个手滑的 0 或 999 排版成一页一个字（或让 typst 编译失败）。
function clipNum(v, zhLabel, enLabel, lo, hi, unit) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) {
    throw new Error(L(`${zhLabel}应在 ${lo}–${hi} 之间`, `${enLabel} must be between ${lo} and ${hi}`));
  }
  return unit ? n + unit : n;
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

    if (req.method === 'GET' && u.pathname === '/api/fonts') {
      // 界面「选项」卡片所需的一切元数据，单一来源都是 bin/folio.cjs（别在 html 里再抄一份）：
      //   三档字族的候选清单（FONT_CHOICES + 本机已装字族，`typst fonts` 现查、成功一次即缓存）
      //   两个方案（STYLE_PRESETS / SIZE_PRESETS）：简单模式选它、详细模式按它填字段
      //   各类默认值（font / page / heading）与纸张清单：详细模式各项的兜底与下拉项
      const fresh = freshCli();
      let installed = null;
      try { installed = fresh.listFonts(); } catch (_) { installed = null; }
      sendJson(res, 200, {
        ok: true,
        installed,
        choices: fresh.FONT_CHOICES,
        defaults: fresh.DEFAULTS.font, // 字号方案 default 档 = 这里的值（0.8em 之外的默认字号都在内）
        page: fresh.DEFAULTS.page,
        papers: fresh.PAPERS,
        heading: fresh.DEFAULTS.heading,
        styles: fresh.STYLE_PRESETS,
        sizes: fresh.SIZE_PRESETS,
      });
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

      // 调节方式（界面「简单 / 详细」两档）：
      //   简单 = 只认两个方案（style / preset）+ 书名、输出、目录、分页、远程图这些文档级开关，
      //          字体/字号/行距/纸张/页边距/标题样式/mermaid 一律按下不表（由方案基线决定）。
      //   详细 = 逐项都认，显式给的值压过方案基线。
      // 界面在简单模式下本就不发这些字段，这里再挡一道，免得旧界面或手写请求把「简单」悄悄变成「详细」。
      const simple = String(b.mode || '') === 'simple';
      const pick = (v) => (simple ? undefined : v);

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

      // 每次转换都重新加载最新 folio.cjs，避免旧服务驻留旧代码导致旧效果
      const fresh = freshCli();
      // 行距：只收 Typst 长度（如 1em / 1.2em / 11pt），乱值直接拒绝，避免拼进排版模板
      const leading = String(pick(b.leading) || '').trim();
      if (leading && !/^\d+(\.\d+)?(em|pt|mm|cm|in)$/.test(leading)) {
        throw new Error(L('行距格式不对，应为如 1em / 11pt 这样的长度', 'Invalid line spacing — use a length like 1em / 11pt'));
      }
      // mermaid 图的主题/连线曲线：口味型配置，界面下拉选择；白名单外的值直接拒绝
      const mermaidTheme = String(pick(b.mermaidTheme) || '').trim();
      const mermaidCurve = String(pick(b.mermaidCurve) || '').trim();
      if (mermaidTheme && !fresh.MERMAID_THEMES.includes(mermaidTheme)) {
        throw new Error(L('不支持的 mermaid 主题：' + mermaidTheme, 'Unsupported mermaid theme: ' + mermaidTheme));
      }
      if (mermaidCurve && !fresh.MERMAID_CURVES.includes(mermaidCurve)) {
        throw new Error(L('不支持的 mermaid 连线曲线：' + mermaidCurve, 'Unsupported mermaid line curve: ' + mermaidCurve));
      }
      // 版式方案 / 字号方案：口味型配置，界面下拉选择；白名单外的值直接拒绝
      const style = String(b.style || '').trim();
      if (style && !fresh.STYLE_CHOICES.includes(style)) {
        throw new Error(L('不支持的版式方案：' + style, 'Unsupported layout preset: ' + style));
      }
      const preset = String(b.preset || '').trim();
      if (preset && preset !== 'default' && !fresh.SIZE_PRESETS[preset]) {
        throw new Error(L('不支持的字号方案：' + preset, 'Unsupported font size preset: ' + preset));
      }
      // 字体四档（中文 / 西文 / 等宽 / 等宽中文）：只为合法性把关，是否装机由 build() 查已装清单后在日志里提示。
      // 未传 = 用默认值；西文传空串 = 「跟随中文字体」（要与「未传」区分开，不能一并丢掉）。
      const font = {};
      if (!simple) {
        const cjk = safeFont(b.fontCjk);
        if (cjk) font.cjk = cjk;
        if (b.fontLatin !== undefined) font.latin = safeFont(b.fontLatin);
        const mono = safeFont(b.fontMono);
        if (mono) font.mono = mono;
        const monoCjk = safeFont(b.fontMonoCjk);
        if (monoCjk) font.monoCjk = monoCjk;
      }
      // 字号（详细模式）：正文 / 代码块 / 一至四级标题，单位 pt
      if (!simple) {
        const size = clipNum(b.size, '正文字号', 'Body font size', 5, 40, 'pt');
        const monoSize = clipNum(b.monoSize, '代码字号', 'Code font size', 5, 40, 'pt');
        if (size) font.size = size;
        if (monoSize) font.monoSize = monoSize;
        const headSizes = [[1, '一级标题字号', 'H1 size'], [2, '二级标题字号', 'H2 size'], [3, '三级标题字号', 'H3 size'], [4, '四级标题字号', 'H4 size']];
        for (const [lvl, zh, en] of headSizes) {
          // 标题字号在模板里自带 pt 后缀（{{HEADING_SIZES}} 是 `size: ${h1}pt`），所以这里只传数字
          const v = clipNum(b['h' + lvl], zh, en, 5, 48);
          if (v) font['h' + lvl] = v;
        }
      }
      // 页面（详细模式）：纸张 + 左右/上下页边距（mm）
      const page = {};
      if (!simple) {
        const paper = String(b.paper || '').trim();
        if (paper && !fresh.PAPERS.includes(paper)) {
          throw new Error(L('不支持的纸张：' + paper, 'Unsupported paper size: ' + paper));
        }
        if (paper) page.paper = paper;
        const marginX = clipNum(b.marginX, '左右页边距', 'Side margin', 5, 60, 'mm');
        const marginY = clipNum(b.marginY, '上下页边距', 'Top/bottom margin', 5, 60, 'mm');
        if (marginX) page.marginX = marginX;
        if (marginY) page.marginY = marginY;
      }
      // 标题样式开关（详细模式）：只认布尔值，未传就交给方案基线 / 默认值
      const heading = {};
      if (!simple) {
        for (const [key, field] of [['center', 'headingCenter'], ['rule', 'headingRule'], ['cjkStyles', 'headingCjkStyles']]) {
          if (typeof b[field] === 'boolean') heading[key] = b[field];
        }
      }
      // 方案基线 + 显式字段的合并交给 resolveConfig（与 CLI 同一份逻辑），别在这里再手写一遍 merge
      const cfg = fresh.resolveConfig({
        inputs,
        output,
        title: b.title || '',
        subtitle: b.subtitle || '',
        chapterBreak: b.chapterBreak !== false,
        toc: { enabled: b.toc !== false, title: L('目录', 'Contents'), depth: Number(b.tocDepth) || 3 },
        style: style || undefined,
        font,
        heading,
        page,
        mermaid: { ...(mermaidTheme ? { theme: mermaidTheme } : {}), ...(mermaidCurve ? { curve: mermaidCurve } : {}) },
        images: { fetchRemote: b.fetchRemote === true }, // 远程图片联网抓取（默认关，占位文字排版）
        // 本地图片按 md 原始目录解析：Electron 经 preload 传真实路径（f.path），
        // 浏览器拿不到路径时退回旧行为——图片以占位文字排版并在日志提示
        sourceDirs: [...new Set(files.map((f) => (f.path ? path.dirname(path.resolve(String(f.path))) : null)).filter(Boolean))],
        renderMermaid: mermaidRender || undefined, // mermaid 图渲染（桌面版才有，纯 node 保留代码块）
        lang: settings.get('language'), // 转换日志/错误提示随界面语言
      }, style || undefined);
      const logs = [];
      const r = await fresh.build(cfg, { log: (m) => logs.push(m) });
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