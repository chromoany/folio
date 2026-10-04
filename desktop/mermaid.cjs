'use strict';
/**
 * mermaid 渲染器：mermaid 源码 → SVG 字符串，供 bin/folio.cjs 预处理把
 * ```mermaid 代码块换成图片。mermaid 需要真实 DOM 布局，纯 node 渲染不了，
 * 这里借 Electron 的隐藏 BrowserWindow 跑 vendor/mermaid/mermaid.min.js。
 * 非 Electron 环境（CLI / 浏览器版 GUI）返回 null 渲染器，调用方保留代码块并记日志。
 * 依赖文件由 scripts/setup.cjs 按 npm registry 完整性校验下载。
 */
const fs = require('fs');
const path = require('path');

const MERMAID_JS = path.join(__dirname, '..', 'vendor', 'mermaid', 'mermaid.min.js');

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

  async function ensureReady() {
    if (ready) return ready;
    ready = (async () => {
      win = new electron.BrowserWindow({
        show: false,
        webPreferences: { sandbox: true, contextIsolation: true },
      });
      await win.loadURL('about:blank');
      const src = fs.readFileSync(MERMAID_JS, 'utf8');
      // 注入整包 + 初始化一次。两个关键点：
      //   securityLevel=strict：文档内容不可信，禁脚本与回调；
      //   htmlLabels: false 必须放**顶层**——mermaid v12 里写在 flowchart: {} 下只改配置
      //   不改渲染路径，图里文字仍走 foreignObject；typst 的 SVG 渲染器不认它，文字会消失
      await win.webContents.executeJavaScript(
        src + '\n;globalThis.mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral", suppressErrorRendering: true, htmlLabels: false });',
        true,
      );
    })().catch((e) => {
      ready = null;
      throw e;
    });
    return ready;
  }

  /** 渲染一段 mermaid 源码，返回 SVG 字符串；失败 / 超时返回 null（调用方保留代码块） */
  async function render(code, timeoutMs = 20000) {
    await ensureReady();
    if (!win || win.isDestroyed()) {
      ready = null;
      await ensureReady();
    }
    const id = 'folio-m-' + (++seq);
    const js = '(async () => { try { const r = await globalThis.mermaid.render('
      + JSON.stringify(id) + ', ' + JSON.stringify(code)
      + '); return r && r.svg ? r.svg : null; } catch (e) { return null; } })()';
    return Promise.race([
      win.webContents.executeJavaScript(js, true),
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  }

  return render;
}

module.exports = { getMermaidRenderer };
