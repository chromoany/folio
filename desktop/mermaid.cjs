'use strict';
/**
 * mermaid 渲染器：mermaid 源码 → SVG 字符串，供 bin/folio.cjs 预处理把
 * ```mermaid 代码块换成图片。mermaid 需要真实 DOM 布局，纯 node 渲染不了，
 * 这里借 Electron 的隐藏 BrowserWindow 跑 vendor/mermaid/mermaid.min.js。
 * 非 Electron 环境（CLI / 浏览器版 GUI）返回 null 渲染器，调用方保留代码块并记日志。
 * 依赖文件由 scripts/setup.cjs 按 npm registry 完整性校验下载。
 *
 * 主题（theme）与连线曲线（flowchart.curve）是口味型配置：不写死统一默认，
 * 由界面/配置经 render(code, { theme, curve }) 逐次传入（默认 neutral / basis）。
 */
const fs = require('fs');
const path = require('path');

const MERMAID_JS = path.join(__dirname, '..', 'vendor', 'mermaid', 'mermaid.min.js');

// 渲染基础配置（安全相关，不开放给用户）+ 可个性化项的默认值
const MERMAID_DEFAULTS = { theme: 'neutral', curve: 'basis' };

function buildInit(opts = {}) {
  return {
    startOnLoad: false,
    securityLevel: 'strict', // 文档内容不可信，禁脚本与回调
    suppressErrorRendering: true,
    // htmlLabels: false 必须放**顶层**——mermaid v12 里写在 flowchart: {} 下只改配置
    // 不改渲染路径，图里文字仍走 foreignObject；typst 的 SVG 渲染器不认它，文字会消失
    htmlLabels: false,
    // layout 必须是 dagre：mermaid v12 默认 layout:"elk"，ELK 把所有连线强制成圆角折线，
    // flowchart.curve 完全不生效（上游 mermaid-js/mermaid#6193）；dagre 才按 curve 插值。
    layout: 'dagre',
    theme: opts.theme || MERMAID_DEFAULTS.theme,
    flowchart: { curve: opts.curve || MERMAID_DEFAULTS.curve },
  };
}

// —— 送进渲染进程的三段脚本 ————————————————————————————————
// 都经 webContents.executeJavaScript 执行，有两条硬约束，改这几行务必对照：
//  ① **完成值必须可结构化克隆**：executeJavaScript 会把脚本的「完成值」克隆回主进程。
//     mermaid.min.js 这段打包容器的完成值是 mermaid API 对象（含函数），克隆不了 ⇒ Promise
//     直接 reject（"An object could not be cloned."）。故注入时末尾补一句原始值语句。
//     （v1.7.12 侥幸没事：那时把 initialize 拼在同一段末尾，而 initialize 返回 undefined；
//      v1.7.13 把 initialize 拆成单独一段后就整片挂了。）
//  ② **语法必须正确**：v1.7.13 的 render 脚本少写了一个 `}`（箭头函数体），于是每次渲染都在
//     解析阶段就 SyntaxError，渲染进程只报 "Script failed to execute"，用户看到的现象是
//     「mermaid 没渲染了」。scripts/selfcheck.cjs 会用 vm 解析这三段脚本兜住这类低级错误。
function buildInjectScript(src) {
  return src + '\n;typeof globalThis.mermaid;';
}

function buildInitScript(opts) {
  return '(async () => { await globalThis.mermaid.initialize(' + JSON.stringify(buildInit(opts)) + '); return true; })()';
}

// 渲染脚本返回 { svg, error }（都是原始值，可克隆）：error 用于把失败原因带回日志——
// 全 0 失败却只说「渲染失败」，出问题时无从下手（v1.7.13 就是这么被用户先发现的）。
function buildRenderScript(id, code) {
  return '(async () => { try { const r = await globalThis.mermaid.render('
    + JSON.stringify(id) + ', ' + JSON.stringify(code)
    + '); return { svg: (r && r.svg) ? r.svg : null, error: r ? null : "no svg returned" }; '
    + '} catch (e) { return { svg: null, error: String((e && e.message) || e) }; } })()';
}

function getMermaidRenderer() {
  let electron = null;
  try {
    electron = require('electron');
  } catch (_) {
    return null;
  }
  if (!electron || !electron.BrowserWindow || !fs.existsSync(MERMAID_JS)) return null;

  let win = null;
  let ready = null;
  let seq = 0;
  let applied = null; // 上次 initialize 的配置串，变了才重新 initialize

  async function ensureReady() {
    if (ready) return ready;
    ready = (async () => {
      win = new electron.BrowserWindow({
        show: false,
        webPreferences: { sandbox: true, contextIsolation: true },
      });
      await win.loadURL('about:blank');
      // 注入整包时必须走 buildInjectScript（完成值换成原始值），别直接 executeJavaScript(src)
      await win.webContents.executeJavaScript(buildInjectScript(fs.readFileSync(MERMAID_JS, 'utf8')), true);
    })().catch((e) => {
      ready = null;
      throw e;
    });
    return ready;
  }

  /**
   * 渲染一段 mermaid 源码。
   * 返回 { svg, error }：成功 svg=字符串、error=null；失败 svg=null、error=原因（超时/SyntaxError/语法错误）
   */
  async function render(code, opts = {}, timeoutMs = 20000) {
    await ensureReady();
    if (!win || win.isDestroyed()) {
      ready = null;
      applied = null;
      await ensureReady();
    }
    const initStr = JSON.stringify(buildInit(opts));
    if (applied !== initStr) {
      await win.webContents.executeJavaScript(buildInitScript(opts), true);
      applied = initStr;
    }
    const id = 'folio-m-' + (++seq);
    const out = await Promise.race([
      win.webContents.executeJavaScript(buildRenderScript(id, code), true),
      new Promise((resolve) => setTimeout(() => resolve({ svg: null, error: 'timeout after ' + timeoutMs + 'ms' }), timeoutMs)),
    ]);
    if (!out || typeof out !== 'object') return { svg: null, error: 'unexpected render result' };
    if (!out.svg) return { svg: null, error: out.error || 'render failed' };
    // 少数图（如 journey）mermaid 绕不开 HTML 标签渲染，typst 的 SVG 渲染器不认 foreignObject，
    // 那部分文字会丢。这里把数量带回去，让 bin/folio.cjs 在日志里说清楚，别让用户以为图是好的。
    const foreignObject = (out.svg.match(/foreignObject/g) || []).length;
    return { svg: out.svg, error: null, foreignObject };
  }

  return render;
}

module.exports = { getMermaidRenderer, buildInit, MERMAID_DEFAULTS, buildInjectScript, buildInitScript, buildRenderScript };
