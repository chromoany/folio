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

// pandoc 读 markdown 的格式串。必须带 -citations：pandoc 默认把正文里的 @xxx 解析成引文，
// 输出 #cite(<xxx>) 让 typst 报 "does not contain a bibliography" 整本编译失败。
// Folio 不生成参考文献（无 --citeproc / --bibliography），关掉纯赚：@提及 会正常转义成 \@xxx。
const PANDOC_FROM = 'markdown-citations+tex_math_dollars';
// 修补 pandoc 缺口的 Lua 过滤器（HTML 断链 / 空链接与死锚点 / 图片兜底 / raw TeX 保留，
// 随 template/ 一起分发，见该文件头部注释）。缺失时自动降级
const HTML_FIX_LUA = path.join(ROOT, 'template', 'pandoc-html-fix.lua');

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
    // 下面这些是「Folio 改动了你的原文」的提示：任何静默改写都必须留下痕迹
    skipToc: (n) => `[folio] 跳过 ${n} 处手写目录（目录按标题自动生成）`,
    paddedBlocks: (parts) => `[folio] 预处理改动了原文：${parts.join('；')}（pandoc 需要块级语法，否则会折进上一段）`,
    padLists: (n) => `${n} 处列表`,
    padTables: (n) => `${n} 处表格`,
    dashTables: (n) => `[folio] 还原 ${n} 处被误判成表格的分隔线（pandoc 把 --- 当表格边框，会竖排成一列）`,
    narrowColumns: (n) => `[folio] 修正 ${n} 处过窄的表格列宽（pandoc 按字符数估算，中文列会偏窄成竖条）`,
    htmlBlocks: (n) => `[folio] 重组 ${n} 处 HTML 块（原生 markdown 不解析 HTML，不重组会被丢弃）`,
    emptyLinks: (n) => `[folio] ${n} 个链接没有目标（如 [文本](#)），按纯文本排版`,
    deadLinks: (n) => `[folio] ${n} 个链接指向文档里不存在的锚点，降级为纯文本`,
    imgCopied: (n) => `[folio] 复制 ${n} 张图片进转换目录（typst 只能读取转换目录内的图片）`,
    imgMissing: (n) => `[folio] ${n} 张图片未能排版（文件缺失 / 格式不支持 / 远程链接不抓取），已用占位文字替代`,
    rawTex: (n) => `[folio] ${n} 段 LaTeX 命令按原文字面排版（typst 不支持 TeX）`,
    fetchedImages: (n) => `[folio] 联网抓取了 ${n} 张远程图片`,
    fetchFailed: (n, urls) => `[folio] ${n} 张远程图片抓取失败，已用占位文字替代${urls ? '：' + urls : ''}`,
    mermaidRendered: (n) => `[folio] 渲染 ${n} 个 mermaid 图并嵌入 PDF`,
    mermaidFailed: (n) => `[folio] ${n} 个 mermaid 图渲染失败（语法错误或超时），保留为代码块`,
    mermaidSkipped: (n) => `[folio] ${n} 个 mermaid 代码块未渲染（mermaid 需要浏览器内核，命令行模式保留为代码块）`,
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
    // Notes about content Folio changed in the source: every silent rewrite must leave a trace
    skipToc: (n) => `[folio] skipped ${n} hand-written TOC section(s) (the TOC is generated from headings)`,
    paddedBlocks: (parts) => `[folio] source was preprocessed: ${parts.join('; ')} (pandoc needs block-level syntax; otherwise they merge into the previous paragraph)`,
    padLists: (n) => `${n} list(s)`,
    padTables: (n) => `${n} table(s)`,
    dashTables: (n) => `[folio] restored ${n} thematic break(s) mis-parsed as a table (pandoc reads --- as a table border; the column ended up one character wide)`,
    narrowColumns: (n) => `[folio] widened ${n} table(s) with too-narrow columns (pandoc estimates widths by character count, which is off for CJK)`,
    htmlBlocks: (n) => `[folio] rebuilt ${n} HTML block(s) (plain markdown does not parse HTML; they would be dropped)`,
    emptyLinks: (n) => `[folio] ${n} link(s) have no target (e.g. [text](#)); rendered as plain text`,
    deadLinks: (n) => `[folio] ${n} link(s) point to anchors that do not exist in the document; rendered as plain text`,
    imgCopied: (n) => `[folio] copied ${n} image(s) into the run directory (typst can only read images inside it)`,
    imgMissing: (n) => `[folio] ${n} image(s) not typeset (missing file / unsupported format / remote URL); replaced with a placeholder`,
    rawTex: (n) => `[folio] ${n} LaTeX snippet(s) rendered as literal text (typst does not support TeX)`,
    fetchedImages: (n) => `[folio] fetched ${n} remote image(s)`,
    fetchFailed: (n, urls) => `[folio] ${n} remote image(s) failed to fetch; replaced with placeholders${urls ? ': ' + urls : ''}`,
    mermaidRendered: (n) => `[folio] rendered ${n} mermaid diagram(s) into the PDF`,
    mermaidFailed: (n) => `[folio] ${n} mermaid diagram(s) failed to render (bad syntax or timeout); kept as code blocks`,
    mermaidSkipped: (n) => `[folio] ${n} mermaid code block(s) not rendered (mermaid needs a browser engine; CLI keeps them as code blocks)`,
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
  font: { cjk: 'Microsoft YaHei', mono: 'Consolas', monoCjk: 'NSimSun', size: '10.5pt', monoSize: '8pt', leading: '1em' },
  images: { fetchRemote: false }, // 远程图片默认不联网抓取（占位文字排版），抓取走 --fetch-remote-images
  sourceDirs: [], // 相对图片的解析根：GUI 只传内容时带 md 原始目录；空 = 用 inputs 所在目录（CLI）
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
  --leading <LEN>          行距与标题上下间距（Typst 长度，默认 1em，如 0.85em / 1.2em）
  --fetch-remote-images    联网抓取远程图片（默认不抓取，远程图以占位文字排版）
  --no-fetch-remote-images 不抓取远程图片（覆盖配置文件）
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
// report 用来告知「原文被改动了」（结构化事件，由 build 汇总成一行日志）——静默吞内容会让用户以为转换出 bug
function cleanMarkdown(src, report = () => {}) {
  const lines = src.split(/\r?\n/);
  const out = [];
  let inToc = false;
  let tocLines = 0;
  const closeToc = () => {
    if (inToc) report({ type: 'toc', lines: tocLines });
    inToc = false;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (/^#{1,2}\s*目录\s*$/.test(t)) {
      closeToc();
      inToc = true; tocLines = 1;
      continue;
    }
    if (inToc) {
      if (/^#{1,6}\s+/.test(t) || /<div[^>]*page-break/i.test(line)) closeToc();
      else { tocLines++; continue; }
    }
    if (/^\s*\[TOC\]\s*$/i.test(t)) continue;
    let l = line
      .replace(/<a\s+id="[^"]*">\s*<\/a>/gi, '')
      .replace(/<\/?div[^>]*>/gi, '')
      .replace(/p\.\?\?\?/g, '');
    out.push(l);
  }
  closeToc(); // 手写目录一直延续到文件末尾的情况
  return out.join('\n');
}

// 列表前补空行：段落/标题后紧跟列表时，pandoc 会输出行内「- 」分隔符导致乱折行；
// 补空行让其变成 loose 列表，pandoc 才输出真正的 Typst 列表语法。代码围栏内不处理。
function normalizeLists(md, report = () => {}) {
  const lines = md.split('\n');
  const out = [];
  let fence = null;
  let padded = 0;
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
      if (prev !== '' && !isListItem(prev)) { out.push(''); padded++; }
    }
    out.push(line);
  }
  if (padded) report({ type: 'lists', count: padded });
  return out.join('\n');
}

// 管道表格前补空行：pandoc（以及 GFM 规范）要求 pipe table 独占一个块——
// 表格紧跟正文段落（如「说明：」行直接接表）时，整张表会被当作上一段的续行，
// 折叠成一行带 | 的普通文本，PDF 里既没有表格又全部堆在一起。
// 这里扫描「表头行 + 分隔行」形态的表格块，在前面补空行。代码围栏与缩进代码不处理。
function normalizeTables(md, report = () => {}) {
  const LEADING_PIPE = /^[ \t]{0,3}\|/; // 0~3 空格 + |；≥4 空格是缩进代码块，跳过
  const isDelimiterRow = (line) => {
    if (!LEADING_PIPE.test(line)) return false;
    let t = line.trim();
    if (t.startsWith('|')) t = t.slice(1);
    if (t.endsWith('|')) t = t.slice(0, -1);
    const cells = t.split('|');
    if (!cells.length) return false;
    let anyDash = false;
    for (const c of cells) {
      const s = c.trim();
      if (!/^:?-+:?$/.test(s)) return false;
      if (/-/.test(s)) anyDash = true;
    }
    return anyDash;
  };
  const lines = md.split('\n');
  const out = [];
  let fence = null; // 当前围栏字符（``` 或 ~~~）
  let padded = 0;
  let i = 0;
  const lastNonEmpty = (arr) => {
    for (let k = arr.length - 1; k >= 0; k--) if (arr[k].trim() !== '') return arr[k];
    return null;
  };
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (fence) { // 代码围栏内一律原样保留
      out.push(line);
      if (new RegExp('^' + fence + '+\\s*$').test(t)) fence = null;
      i++;
      continue;
    }
    if (/^(```+|~~~+)/.test(t)) { fence = t.slice(0, 3); out.push(line); i++; continue; }
    // 表格起点：当前行是 | 开头的非分隔行，且下一行恰为分隔行
    const next = lines[i + 1];
    if (!isDelimiterRow(line) && LEADING_PIPE.test(line) && next !== undefined && isDelimiterRow(next)) {
      const prev = lastNonEmpty(out);
      if (prev !== null && !LEADING_PIPE.test(prev)) { out.push(''); padded++; } // 与上面正文隔开
      while (i < lines.length && LEADING_PIPE.test(lines[i])) { // 整块表格原样搬入
        out.push(lines[i]);
        i++;
      }
      continue;
    }
    out.push(line);
    i++;
  }
  if (padded) report({ type: 'tables', count: padded });
  return out.join('\n');
}

// pandoc 的 typst writer 按**源文本字符数**估算表格列宽百分比：中文列在源里字符少、
// 实际显示宽度却是两倍，于是中文表格经常拿到 1%~5% 的病态列宽。typst 会照单全收，
// 把那一列压成「一个字一行」的竖条，长内容还直接溢出页面（不报错，只看渲染才发现）。
// 这里把过窄的百分比列宽换成 auto（typst 按实际内容宽度自适应）——只动过窄的列，
// 其余比例原样保留；列宽本来就不是百分比（auto / 1fr / 整数）的表格不受影响。
const MIN_COL_PCT = 10; // 低于可用宽度的 10%（A4 双栏边距下约 17mm）基本放不下几个汉字
function fixNarrowColumns(typ, report = () => {}) {
  let fixed = 0;
  const out = typ.replace(/columns:\s*\(([^()]*)\),/g, (whole, inner) => {
    const parts = inner.split(',').map((s) => s.trim()).filter(Boolean);
    let touched = false;
    const next = parts.map((p) => {
      const m = /^([\d.]+)%$/.exec(p);
      if (m && Number(m[1]) < MIN_COL_PCT) { touched = true; return 'auto'; }
      return p;
    });
    if (!touched) return whole;
    fixed++;
    return `columns: (${next.join(', ')},),`;
  });
  if (fixed) report(T('narrowColumns', fixed));
  return out;
}

function parseArgs(argv) {
  const flags = {};
  const inputs = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o' || a === '--output') flags.output = argv[++i];
    else if (a === '-c' || a === '--config') flags.config = argv[++i];
    else if (a === '--toc-depth') flags.tocDepth = Number(argv[++i]);
    else if (a === '--leading') flags.leading = argv[++i];
    else if (a === '--fetch-remote-images') flags.fetchRemote = true;
    else if (a === '--no-fetch-remote-images') flags.fetchRemote = false;
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

  // H1 的块间距同样随 font.leading 联动（{{LEADING}} 在 renderTemplate 末尾统一替换）
  const h1Show = cfg.chapterBreak
    ? `#show heading.where(level: 1): it => [
  #pagebreak()
  #block(above: 0em, below: 1.5 * {{LEADING}}, inset: (bottom: 0.3em), stroke: (bottom: 0.6pt + rgb("#333333")))[#it]
]`
    : `#show heading.where(level: 1): it => block(above: 2.0 * {{LEADING}}, below: 1.5 * {{LEADING}}, inset: (bottom: 0.3em), stroke: (bottom: 0.6pt + rgb("#333333")), it)`;

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
    .replaceAll('{{MONO_CJK}}', strEsc(f.monoCjk || 'NSimSun'))
    .replaceAll('{{BASE_SIZE}}', f.size)
    .replaceAll('{{MONO_SIZE}}', f.monoSize)
    .replaceAll('{{PAPER}}', p.paper)
    .replaceAll('{{MARGIN_X}}', p.marginX)
    .replaceAll('{{MARGIN_Y}}', p.marginY)
    .replaceAll('{{H1_SHOW}}', h1Show)
    .replaceAll('{{TITLE_BLOCK}}', titleBlock)
    .replaceAll('{{TOC_BLOCK}}', tocBlock)
    // {{LEADING}} 必须最后替换：H1_SHOW 等插入片段里也引用了它
    .replaceAll('{{LEADING}}', strEsc(f.leading || '1em'));
}

function run(cmd, args, cwd, label, opts = {}) {
  const base = { cwd, encoding: 'utf8', windowsHide: true };
  if (opts.env) base.env = { ...process.env, ...opts.env };
  let r = spawnSync(cmd, args, { ...base, stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.error && r.error.code === 'EPERM') {
    // 受限环境（如沙箱）无法用管道捕获输出，回退为直接继承（此时拿不到 stderr，靠报告文件）
    r = spawnSync(cmd, args, { ...base, stdio: 'inherit' });
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
  return String(r.stderr || '').trim();
}

// —— 远程图片抓取（可选）————————————————————————————————————
// pandoc 阶段的过滤器只登记 URL 到清单（pandoc 自带 HTTP 栈会硬崩，不能在 Lua 里抓）；
// 这里逐条抓取、按内容判定真实格式落盘；抓不到就把 image() 调用换成占位文字，保证编译不挂。
const PLACEHOLDER_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAWSURBVChTY7h58+Z/fJgBXQAdDw8FAMOU4oHd5zcwAAAAAElFTkSuQmCC', 'base64');

// 与过滤器 sniff_ext 同一口径：typst 按扩展名选解码器，落盘扩展名必须与内容一致
function sniffExt(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  const head4 = buf.toString('latin1', 0, 4);
  if (head4 === 'GIF8') return 'gif';
  if (head4 === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('latin1', 0, 2) === 'BM') return 'bmp';
  const head = buf.toString('utf8', 0, Math.min(buf.length, 512));
  if (head.includes('<svg') || (head.includes('<?xml') && head.includes('svg'))) return 'svg';
  return null;
}

async function fetchRemoteImages(bodyTyp, manifestFile, mediaDir, log) {
  const lines = fs.existsSync(manifestFile)
    ? fs.readFileSync(manifestFile, 'utf8').split(/\r?\n/).filter((l) => l.includes('\t'))
    : [];
  if (!lines.length) return bodyTyp;
  let ok = 0;
  const failed = [];
  for (const line of lines) {
    const tab = line.indexOf('\t');
    const planned = line.slice(0, tab);
    const url = line.slice(tab + 1);
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const len = Number(res.headers.get('content-length') || 0);
      if (len > 50 * 1024 * 1024) throw new Error('too large');
      const buf = Buffer.from(await res.arrayBuffer());
      const ext = sniffExt(buf);
      if (!ext) throw new Error('not a supported image');
      const finalName = ext === 'png' ? planned : planned.replace(/\.png$/, '.' + ext);
      fs.writeFileSync(path.join(mediaDir, finalName), buf);
      if (finalName !== planned) {
        bodyTyp = bodyTyp.split('"media/' + planned + '"').join('"media/' + finalName + '"');
      }
      ok++;
    } catch (e) {
      failed.push({ planned, url });
    }
  }
  for (const f of failed) {
    // image() 调用整体换成占位文字；万一正则没命中就落一张占位图，编译不能挂
    const esc = f.planned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('image\\("media/' + esc + '", alt: "(?:[^"\\\\]|\\\\.)*"(?:, [^()]*)?\\)', 'g');
    const label = '[' + (UI_LANG === 'en' ? 'image missing: ' : '图片缺失: ') + f.url + ']';
    const next = bodyTyp.replace(re, 'text(fill: gray, ' + strEsc(label) + ')');
    if (next !== bodyTyp) bodyTyp = next;
    else fs.writeFileSync(path.join(mediaDir, f.planned), PLACEHOLDER_PNG);
  }
  if (ok) log(T('fetchedImages', ok));
  if (failed.length) log(T('fetchFailed', failed.length, failed.slice(0, 3).map((f) => f.url).join('  ')));
  return bodyTyp;
}

// —— mermaid 代码块 → SVG 图（可选）———————————————————————————
// 渲染需要浏览器内核（desktop/mermaid.cjs，只有 Electron 主进程有），由调用方经
// cfg.renderMermaid 传入；没有渲染器就保留代码块并记日志，不打断转换。
// 渲染出的 SVG 交给图片管线（内容嗅探为 svg、复制进转换目录）正常排版。
async function extractMermaid(md, runDir, renderFn, counts) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const open = /^(\s*)(`{3,}|~{3,})\s*mermaid\s*$/i.exec(lines[i]);
    if (!open) {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    const fence = open[2];
    const closeRe = new RegExp('^\\s*' + fence[0] + '{' + fence.length + ',}\\s*$');
    let j = i + 1;
    while (j < lines.length && !closeRe.test(lines[j])) j += 1;
    const code = lines.slice(i + 1, j).join('\n');
    const block = lines.slice(i, Math.min(j + 1, lines.length)); // 含开闭围栏，渲染失败时原样放回
    i = j + 1;

    let svg = null;
    if (renderFn) {
      try {
        svg = await renderFn(code);
      } catch (_) {
        svg = null;
      }
    }
    if (svg) {
      counts.rendered += 1;
      const file = path.join(runDir, 'mermaid-' + counts.rendered + '.svg');
      fs.writeFileSync(file, svg, 'utf8');
      // 尖括号目的地址：路径带空格/括号也安全；图片管线负责复制与正名
      out.push('![](<' + file.replace(/\\/g, '/') + '>)');
    } else {
      if (renderFn) counts.failed += 1;
      else counts.skipped += 1;
      for (const l of block) out.push(l);
    }
  }
  return out.join('\n');
}

/** 执行完整转换。cfg 见 DEFAULTS，可额外带 pandocBin / typstBin / renderMermaid（mermaid 渲染钩子）。返回 { output, size, runDir } */
async function build(cfg, { log = () => {} } = {}) {
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
  // 这些函数都会改写原文，改动经 note() 累加，最后汇总成一行日志（多文件时不刷屏）
  const stats = { toc: 0, lists: 0, tables: 0 };
  const note = (e) => {
    if (e.type === 'toc') stats.toc++;
    else if (e.type === 'lists') stats.lists += e.count;
    else if (e.type === 'tables') stats.tables += e.count;
  };
  // mermaid 围栏先抽走（渲染成 SVG 图），再做清洗/补空行——它们自带围栏跳过逻辑
  const mermaid = { rendered: 0, failed: 0, skipped: 0 };
  const cleanedInputs = [];
  for (let i = 0; i < cfg.inputs.length; i++) {
    let src = fs.readFileSync(cfg.inputs[i], 'utf8');
    if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
    src = await extractMermaid(src, runDir, cfg.renderMermaid, mermaid);
    const tmp = path.join(runDir, 'in-' + String(i).padStart(2, '0') + '.md');
    fs.writeFileSync(tmp, normalizeTables(normalizeLists(cleanMarkdown(src, note), note), note), 'utf8');
    cleanedInputs.push(tmp);
  }

  log(T('nFiles', cfg.inputs.length, outAbs));
  if (stats.toc) log(T('skipToc', stats.toc));
  if (mermaid.rendered) log(T('mermaidRendered', mermaid.rendered));
  if (mermaid.failed) log(T('mermaidFailed', mermaid.failed));
  if (mermaid.skipped) log(T('mermaidSkipped', mermaid.skipped));
  if (stats.lists || stats.tables) {
    const parts = [];
    if (stats.lists) parts.push(T('padLists', stats.lists));
    if (stats.tables) parts.push(T('padTables', stats.tables));
    log(T('paddedBlocks', parts));
  }
  log(T('step1'));
  const filterArgs = fs.existsSync(HTML_FIX_LUA) ? ['--lua-filter', HTML_FIX_LUA] : [];
  // 过滤器（HTML 重组 / 分隔线误判还原 / 链接兜底 / 图片兜底 / raw TeX 保留）把改动统计写进
  // 这个文件，再转成界面语言的日志；图片落进 runDir/media，原始 md 目录用于解析相对图片路径
  const reportFile = path.join(runDir, 'filter-report.txt');
  const mediaDir = path.join(runDir, 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  // 相对图片按「原始 md 所在目录」解析：CLI 的 inputs 就是真实路径；GUI 只传内容，
  // 靠 cfg.sourceDirs（Electron 传来的文件真实路径）定位，缺了就只能占位文字
  const dirs = (cfg.sourceDirs && cfg.sourceDirs.length) ? cfg.sourceDirs : cfg.inputs.map((p) => path.dirname(p));
  const srcDirs = [...new Set(dirs.map((d) => path.resolve(d)))].join(';');
  // 抓取远程图片才建清单：过滤器见 FOLIO_MEDIA_MANIFEST 存在才登记 URL，否则远程图走占位文字
  const fetchRemote = !!(cfg.images && cfg.images.fetchRemote);
  const manifestFile = path.join(runDir, 'media-manifest.tsv');
  const env = {
    FOLIO_FILTER_REPORT: reportFile,
    FOLIO_MEDIA_DIR: mediaDir,
    FOLIO_SRC_DIRS: srcDirs,
    FOLIO_LANG: UI_LANG,
  };
  if (fetchRemote) env.FOLIO_MEDIA_MANIFEST = manifestFile;
  const stderr = run(pandocBin, ['-f', PANDOC_FROM, '-t', 'typst', '--wrap=none', ...filterArgs, '-o', bodyFile, ...cleanedInputs.map((x) => path.resolve(x))],
    ROOT, 'pandoc', { env });
  const report = fs.existsSync(reportFile) ? fs.readFileSync(reportFile, 'utf8') : stderr;
  // 报告是逐行 key=N；行首/空白锚定，避免 tables= 撞上 dash_tables= 之类子串
  const grab = (k) => {
    const mm = new RegExp('(?:^|[\\s])' + k + '=(\\d+)').exec(report);
    return mm ? Number(mm[1]) : 0;
  };
  const reportKeys = [
    ['htmlBlocks', 'html_blocks'], ['dashTables', 'dash_tables'],
    ['emptyLinks', 'empty_links'], ['deadLinks', 'dead_links'],
    ['imgCopied', 'img_copied'], ['imgMissing', 'img_missing'], ['rawTex', 'raw_tex'],
  ];
  for (const [key, stat] of reportKeys) {
    const n = grab(stat);
    if (n) log(T(key, n));
  }

  // 远程图片（勾选抓取时）：Node 侧抓取、按内容正名；抓不到降级占位文字
  let bodyTyp = fs.readFileSync(bodyFile, 'utf8');
  if (fetchRemote) bodyTyp = await fetchRemoteImages(bodyTyp, manifestFile, mediaDir, log);
  // pandoc 写出的 typst 列宽可能病态偏窄（中文表格尤甚），编译前兜底一次
  fs.writeFileSync(bodyFile, fixNarrowColumns(bodyTyp, (m2) => log(m2)), 'utf8');

  log(T('step2'));
  fs.writeFileSync(mainFile, renderTemplate(cfg), 'utf8');

  log(T('step3'));
  run(typstBin, ['compile', mainFile, outAbs], runDir, 'typst');

  const size = fs.statSync(outAbs).size;
  log(T('done', outAbs, Math.round(size / 1024)));
  return { output: outAbs, size, runDir };
}

async function main() {
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
  if (flags.leading) cfg.font.leading = flags.leading;
  if (flags.fetchRemote !== undefined) cfg.images.fetchRemote = flags.fetchRemote;
  if (flags.noToc) cfg.toc.enabled = false;
  if (flags.noChapterBreak) cfg.chapterBreak = false;
  if (flags.title) cfg.title = flags.title;
  if (flags.subtitle) cfg.subtitle = flags.subtitle;
  cfg.pandocBin = flags.pandocBin;
  cfg.typstBin = flags.typstBin;

  await build(cfg, { log: (m) => console.log(m) });
}

if (require.main === module) {
  Promise.resolve()
    .then(() => main())
    .catch((e) => {
      console.error('出错：', e.message || e);
      process.exit(1);
    });
}

module.exports = { build, renderTemplate, deepMerge, DEFAULTS };
