#!/usr/bin/env node
/**
 * Folio —— Markdown → 书籍版式 PDF（目录 + 页码 + 页脚页码）
 *
 * 流程：pandoc(md → typst) → 注入 book 模板 → typst compile → PDF
 *
 * 用法：
 *   node folio.cjs 书.md -o 书.pdf --title "我的书"
 *   node folio.cjs 第1章.md 第2章.md -o 书.pdf            # 多文件按给定顺序合并
 *   node folio.cjs -c config.json                          # 从配置文件读
 *
 * 依赖：pandoc + typst（默认取 vendor/ 下便携版，也可 --pandoc-bin/--typst-bin 指定）
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
// 转换中间文件默认放系统临时目录（GUI 也走这里），避免写入安装目录造成卸载残留/权限问题
const TMP = process.env.FOLIO_TMP || path.join(os.tmpdir(), 'folio-runs');

// 界面语言（zh/en）：GUI 经 cfg.lang 传入，CLI 默认中文；转换日志与错误提示随语言切换
let UI_LANG = 'zh';

const MSG = {
  zh: {
    noInput: '没有输入文件',
    nFiles: (n, out) => `输入 ${n} 个文件 → ${out}`,
    step1: '① pandoc：Markdown → Typst …',
    step2: '② 注入书版式模板 …',
    step3: '③ typst：排版出 PDF（目录页码自动回填）…',
    done: (p, k) => `完成：${p}（${k} KB）`,
    notFound: (label, cmd) => `找不到 ${label}（${cmd}）。请先运行 scripts\\setup.cjs，或用 --${label}-bin 指定路径`,
    runErr: (label, msg) => `${label} 执行出错：${msg}`,
    failed: (label, status, tail) => `${label} 执行失败（退出码 ${status}）${tail ? '\n' + tail : ''}`,
  },
  en: {
    noInput: 'No input files',
    nFiles: (n, out) => `Input ${n} file(s) → ${out}`,
    step1: '① pandoc: Markdown → Typst …',
    step2: '② Inject book layout template …',
    step3: '③ typst: typeset the PDF (TOC page numbers are backfilled) …',
    done: (p, k) => `Done: ${p} (${k} KB)`,
    notFound: (label, cmd) => `Cannot find ${label} (${cmd}). Run scripts\\setup.cjs first, or use --${label}-bin`,
    runErr: (label, msg) => `${label} failed to run: ${msg}`,
    failed: (label, status, tail) => `${label} failed (exit code ${status})${tail ? '\n' + tail : ''}`,
  },
};

function T(key, ...args) {
  const m = MSG[UI_LANG] || MSG.zh;
  const v = m[key];
  return typeof v === 'function' ? v(...args) : v;
}

const DEFAULTS = {
  inputs: [],
  output: null,
  title: '',
  subtitle: '',
  toc: { enabled: true, title: '目录', depth: 3 },
  chapterBreak: true,
  page: { paper: 'a4', marginX: '20mm', marginY: '18mm' },
  font: { cjk: 'Microsoft YaHei', mono: 'Consolas', size: '10.5pt', monoSize: '8pt' },
};

const HELP = `Folio —— Markdown → 书籍版式 PDF

用法：
  node folio.cjs <input.md...> -o <out.pdf> [选项]
  node folio.cjs -c config.json

选项：
  -o, --output <file>      输出 PDF（默认：第一个输入同名 .pdf）
  -c, --config <file>      配置文件（JSON）
  --title / --subtitle     书名 / 副标题
  --toc-depth <N>          目录列到几级标题（默认 3）
  --no-toc                 不生成目录
  --no-chapter-break       每个 H1 不另起一页
  --pandoc-bin / --typst-bin  指定 pandoc / typst 二进制路径
`;

function deepMerge(base, extra) {
  const out = { ...base };
  for (const k of Object.keys(extra || {})) {
    const b = base[k];
    const e = extra[k];
    if (e && typeof e === 'object' && !Array.isArray(e) && b && typeof b === 'object' && !Array.isArray(b)) {
      out[k] = deepMerge(b, e);
    } else {
      out[k] = e;
    }
  }
  return out;
}

// 字符串字面量上下文转义（用于 "..." 内）
function strEsc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
// 内容块上下文转义（用于 [...] 内）
function contEsc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/#/g, '\\#').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

// 兼容旧版 md：去掉「## 目录」手写目录、<a id> 锚点、分页 <div>、p.??? 占位（新管线会自己生成目录）
function cleanMarkdown(src) {
  const lines = src.split(/\r?\n/);
  const out = [];
  let inToc = false;
  for (const line of lines) {
    const t = line.trim();
    if (/^#{1,2}\s*目录\s*$/.test(t)) { inToc = true; continue; }
    if (inToc) {
      if (/^#{1,6}\s+/.test(t) || /<div[^>]*page-break/i.test(line)) inToc = false;
      else continue;
    }
    if (/^\s*\[TOC\]\s*$/i.test(t)) continue;
    let l = line
      .replace(/<a\s+id="[^"]*">\s*<\/a>/gi, '')
      .replace(/<\/?div[^>]*>/gi, '')
      .replace(/p\.\?\?\?/g, '');
    out.push(l);
  }
  return out.join('\n');
}

// 列表前补空行：段落/标题后紧跟列表时，pandoc 会输出行内「- 」分隔符导致乱折行；
// 补空行让其变成 loose 列表，pandoc 才输出真正的 Typst 列表语法。代码围栏内不处理。
function normalizeLists(md) {
  const lines = md.split('\n');
  const out = [];
  let fence = null;
  const isListItem = (t) => /^[-*+]\s+/.test(t) || /^\d+[.)]\s+/.test(t);
  for (const line of lines) {
    const t = line.trim();
    if (fence) {
      out.push(line);
      if (/^(```+|~~~+)\s*$/.test(t)) fence = null;
      continue;
    }
    if (/^(```+|~~~+)/.test(t)) { fence = t.slice(0, 3); out.push(line); continue; }
    if (isListItem(t) && out.length) {
      const prev = out[out.length - 1].trim();
      if (prev !== '' && !isListItem(prev)) out.push('');
    }
    out.push(line);
  }
  return out.join('\n');
}

function parseArgs(argv) {
  const flags = {};
  const inputs = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o' || a === '--output') flags.output = argv[++i];
    else if (a === '-c' || a === '--config') flags.config = argv[++i];
    else if (a === '--toc-depth') flags.tocDepth = Number(argv[++i]);
    else if (a === '--no-toc') flags.noToc = true;
    else if (a === '--no-chapter-break') flags.noChapterBreak = true;
    else if (a === '--title') flags.title = argv[++i];
    else if (a === '--subtitle') flags.subtitle = argv[++i];
    else if (a === '--pandoc-bin') flags.pandocBin = argv[++i];
    else if (a === '--typst-bin') flags.typstBin = argv[++i];
    else if (a === '-h' || a === '--help') flags.help = true;
    else if (!a.startsWith('-')) inputs.push(a);
  }
  return { flags, inputs };
}

function findExe(dir, name) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const r = findExe(p, name);
      if (r) return r;
    } else if (entry.name.toLowerCase() === name) {
      return p;
    }
  }
  return null;
}

function findBin(key, flag) {
  if (flag) return flag;
  const vendored = findExe(path.join(ROOT, 'vendor', key), key + '.exe');
  if (vendored) return vendored;
  return key; // 交给 PATH 解析
}

function renderTemplate(cfg) {
  const tpl = fs.readFileSync(path.join(ROOT, 'template', 'book.typ.tpl'), 'utf8');
  const p = cfg.page;
  const f = cfg.font;
  const toc = cfg.toc;

  const h1Show = cfg.chapterBreak
    ? `#show heading.where(level: 1): it => [
  #pagebreak()
  #block(above: 0em, below: 0.7em, inset: (bottom: 0.3em), stroke: (bottom: 0.6pt + rgb("#333333")))[#it]
]`
    : `#show heading.where(level: 1): it => block(above: 0.6em, below: 0.7em, inset: (bottom: 0.3em), stroke: (bottom: 0.6pt + rgb("#333333")), it)`;

  let titleBlock = '';
  if (cfg.title) {
    titleBlock = `#align(center)[#text(size: 20pt, weight: "bold")[${contEsc(cfg.title)}]]\n#v(0.3em)\n`;
    if (cfg.subtitle) titleBlock += `#align(center)[#text(size: 11pt, fill: rgb("#555555"))[${contEsc(cfg.subtitle)}]]\n#v(0.6em)\n`;
    titleBlock += `#line(length: 100%, stroke: 0.6pt + rgb("#999999"))\n#v(0.8em)`;
  }

  const tocBlock = toc.enabled
    ? `#block(above: 0.6em, below: 0.5em, inset: (bottom: 0.3em), stroke: (bottom: 0.6pt + rgb("#333333")))[#text(size: 16pt, weight: "bold")[${contEsc(toc.title)}]]\n#outline(title: none, indent: auto, depth: ${toc.depth})`
    : '';

  return tpl
    .replaceAll('{{DOC_TITLE}}', strEsc(cfg.title))
    .replaceAll('{{CJK_FONT}}', strEsc(f.cjk))
    .replaceAll('{{MONO_FONT}}', strEsc(f.mono))
    .replaceAll('{{BASE_SIZE}}', f.size)
    .replaceAll('{{MONO_SIZE}}', f.monoSize)
    .replaceAll('{{PAPER}}', p.paper)
    .replaceAll('{{MARGIN_X}}', p.marginX)
    .replaceAll('{{MARGIN_Y}}', p.marginY)
    .replaceAll('{{H1_SHOW}}', h1Show)
    .replaceAll('{{TITLE_BLOCK}}', titleBlock)
    .replaceAll('{{TOC_BLOCK}}', tocBlock);
}

function run(cmd, args, cwd, label) {
  let r = spawnSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', windowsHide: true });
  if (r.error && r.error.code === 'EPERM') {
    // 受限环境（如沙箱）无法用管道捕获输出，回退为直接继承
    r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  }
  if (r.error) {
    if (r.error.code === 'ENOENT') {
      throw new Error(T('notFound', label, cmd));
    }
    throw new Error(T('runErr', label, r.error.message));
  }
  if (r.status !== 0) {
    const err = String(r.stderr || '').trim();
    const tail = err ? err.split('\n').slice(-20).join('\n') : '';
    throw new Error(T('failed', label, r.status, tail));
  }
}

/** 执行完整转换。cfg 见 DEFAULTS，可额外带 pandocBin / typstBin。返回 { output, size, runDir } */
function build(cfg, { log = () => {} } = {}) {
  UI_LANG = (cfg && cfg.lang === 'en') ? 'en' : 'zh';
  if (!cfg.inputs || !cfg.inputs.length) throw new Error(T('noInput'));
  if (!cfg.output) cfg.output = cfg.inputs[0].replace(/\.md$/i, '') + '.pdf';

  const pandocBin = findBin('pandoc', cfg.pandocBin);
  const typstBin = findBin('typst', cfg.typstBin);

  const runDir = path.join(TMP, 'run-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6));
  fs.mkdirSync(runDir, { recursive: true });
  const bodyFile = path.join(runDir, 'body.typ');
  const mainFile = path.join(runDir, 'main.typ');
  const outAbs = path.resolve(cfg.output);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });

  // 预处理：清洗旧版目录/锚点/分页 div，保证任意 md 都能进
  const cleanedInputs = cfg.inputs.map((p, i) => {
    let src = fs.readFileSync(p, 'utf8');
    if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
    const tmp = path.join(runDir, 'in-' + String(i).padStart(2, '0') + '.md');
    fs.writeFileSync(tmp, normalizeLists(cleanMarkdown(src)), 'utf8');
    return tmp;
  });

  log(T('nFiles', cfg.inputs.length, outAbs));
  log(T('step1'));
  run(pandocBin, ['-f', 'markdown+tex_math_dollars', '-t', 'typst', '--wrap=none', '-o', bodyFile, ...cleanedInputs.map((x) => path.resolve(x))], ROOT, 'pandoc');

  log(T('step2'));
  fs.writeFileSync(mainFile, renderTemplate(cfg), 'utf8');

  log(T('step3'));
  run(typstBin, ['compile', mainFile, outAbs], runDir, 'typst');

  const size = fs.statSync(outAbs).size;
  log(T('done', outAbs, Math.round(size / 1024)));
  return { output: outAbs, size, runDir };
}

function main() {
  const { flags, inputs } = parseArgs(process.argv.slice(2));
  if (flags.help) {
    process.stdout.write(HELP);
    return;
  }

  let cfg = JSON.parse(JSON.stringify(DEFAULTS));
  if (flags.config) {
    const raw = JSON.parse(fs.readFileSync(flags.config, 'utf8'));
    cfg = deepMerge(cfg, raw);
  }
  if (inputs.length) cfg.inputs = inputs;
  if (flags.output) cfg.output = flags.output;
  if (flags.tocDepth) cfg.toc.depth = flags.tocDepth;
  if (flags.noToc) cfg.toc.enabled = false;
  if (flags.noChapterBreak) cfg.chapterBreak = false;
  if (flags.title) cfg.title = flags.title;
  if (flags.subtitle) cfg.subtitle = flags.subtitle;
  cfg.pandocBin = flags.pandocBin;
  cfg.typstBin = flags.typstBin;

  build(cfg, { log: (m) => console.log(m) });
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error('出错：', e.message || e);
    process.exit(1);
  }
}

module.exports = { build, renderTemplate, deepMerge, DEFAULTS };
