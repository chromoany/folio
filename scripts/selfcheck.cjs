#!/usr/bin/env node
/**
 * 发版前静态自检：node scripts/selfcheck.cjs（scripts/package.cjs 打包前会自动跑一遍）
 *
 * 只查「运行时才炸、且现场现象含糊」的低级错误 —— 这些错误在 v1.7.13 上真实发生过：
 *  ① mermaid 的三段注入脚本必须能被 JS 解析。v1.7.13 的 render 脚本少写了一个 `}`，
 *     渲染进程只回一句 "Script failed to execute"，用户看到的现象是「mermaid 没渲染了」，
 *     排查要从 Electron IPC 一路倒推回字符串拼接，代价极高。
 *  ② 版式模板的占位符必须被全部替换干净。renderTemplate 用 replaceAll 替换，写错名字不会报错，
 *     占位符会以字面量留在 Typst 源码里（轻则编译失败，重则排版出怪东西）。
 *  ③ config.example.json 的键必须都在 DEFAULTS 里 —— 防止文档示例与代码悄悄漂移。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const problems = [];

function checkParses(label, code) {
  try {
    new vm.Script(code);
  } catch (e) {
    problems.push(`${label}：脚本无法解析 —— ${e.message}`);
  }
}

function run() {
  problems.length = 0;

  // ① mermaid 注入脚本
  const mm = require(path.join(ROOT, 'desktop', 'mermaid.cjs'));
  checkParses('mermaid 注入脚本', mm.buildInjectScript('var x = 1;'));
  checkParses('mermaid initialize 脚本', mm.buildInitScript({ theme: 'neutral', curve: 'basis' }));
  checkParses('mermaid render 脚本', mm.buildRenderScript('folio-m-1', 'graph TD\n  A --> B'));
  checkParses('mermaid render 脚本（含引号/反斜杠的图源）', mm.buildRenderScript('folio-m-2', 'graph TD\n  A["a\\"b"] --> B'));

  // ② 模板占位符全部替换干净（目录/书名/另起页/版式方案/字号方案都过一遍）
  const { renderTemplate, resolveConfig, DEFAULTS, STYLE_PRESETS, SIZE_PRESETS } = require(path.join(ROOT, 'bin', 'folio.cjs'));
  const variants = [
    ['默认（无书名、有目录）', { ...DEFAULTS }],
    ['带书名副标题 + 不另起页', { ...DEFAULTS, title: '书名', subtitle: '副标题', chapterBreak: false }],
    ['不生成目录', { ...DEFAULTS, toc: { enabled: false, title: '目录', depth: 3 } }],
    ['自定义字体三档', { ...DEFAULTS, font: { ...DEFAULTS.font, cjk: 'SimSun', latin: 'Times New Roman', mono: 'Courier New', leading: '1.2em' } }],
    ['版式方案 ctexart（含居中标题、无下划线）', resolveConfig({}, 'ctexart')],
    ['版式方案 ctexart + 不另起页', resolveConfig({ chapterBreak: false }, 'ctexart')],
    ['版式方案 ctexart + 不生成目录', resolveConfig({ toc: { enabled: false, title: '目录', depth: 3 } }, 'ctexart')],
  ];
  // 字号方案逐档过一遍（default/未知值必须不覆盖任何字号）
  for (const name of [...Object.keys(SIZE_PRESETS), 'default', 'nonsense']) {
    variants.push([`字号方案 ${name}`, resolveConfig({ font: { preset: name } })]);
  }
  for (const [name, cfg] of variants) {
    const typ = renderTemplate(cfg);
    const left = typ.match(/\{\{[A-Z_]+\}\}/g);
    if (left) problems.push(`版式模板 ${name}：占位符未替换 —— ${[...new Set(left)].join(', ')}`);
  }
  // 两个方案都只给基线：显式写的 font.* / leading 必须压过方案的默认值
  const over = resolveConfig({ font: { cjk: 'KaiTi', leading: '1.3em' } }, 'ctexart');
  if (over.font.cjk !== 'KaiTi' || over.font.leading !== '1.3em') {
    problems.push('版式方案覆盖了用户显式指定的字体/行距（应当只提供基线默认值）');
  }
  const base = resolveConfig({}, 'ctexart');
  const p = STYLE_PRESETS.ctexart;
  if (base.font.cjk !== p.font.cjk || base.font.leading !== p.leading) {
    problems.push('版式方案 ctexart 的基线默认值没有铺进配置');
  }
  // ctexart 自带五号体系：没特别指定时字号方案应当就是 normal
  if (base.font.preset !== 'normal' || base.font.size !== SIZE_PRESETS.normal.size) {
    problems.push('版式方案 ctexart 没有带上自己的字号口径（应为 normal）');
  }
  // 字号方案同样只是基线：命中档位要把 size/monoSize/h1–h4 铺进配置，显式字号仍优先
  const SIZE_KEYS = ['size', 'monoSize', 'h1', 'h2', 'h3', 'h4'];
  for (const [name, t2] of Object.entries(SIZE_PRESETS)) {
    const c = resolveConfig({ font: { preset: name } });
    for (const k of SIZE_KEYS) {
      if (c.font[k] !== t2[k]) problems.push(`字号方案 ${name} 没有把 font.${k} 铺成 ${t2[k]}（实际 ${c.font[k]}）`);
    }
    if (resolveConfig({ font: { preset: name, size: '13pt' } }).font.size !== '13pt') {
      problems.push(`字号方案 ${name} 覆盖了显式指定的 font.size（应当只提供基线默认值）`);
    }
  }
  // default / 未知档不覆盖任何字号（未知值本身由 build() 拒绝，这里只确认字号没被悄悄改过）
  for (const name of ['default', 'nonsense']) {
    const c = resolveConfig({ font: { preset: name } });
    for (const k of ['size', 'monoSize', 'h1']) {
      if (c.font[k] !== DEFAULTS.font[k]) problems.push(`字号方案 ${name} 改动了 font.${k}（应当原样不覆盖）`);
    }
  }
  // 未知版式方案由 build() 拒绝；这里只确认不会被 baseConfig 悄悄当成合法方案
  if (resolveConfig({}, 'nope').style !== 'nope') problems.push('未知版式方案没有透传给 build() 校验');

  // ③ 配置示例的键必须在 DEFAULTS 里（含嵌套一层）
  try {
    const example = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.example.json'), 'utf8'));
    const walk = (ex, def, prefix) => {
      for (const k of Object.keys(ex)) {
        if (!(k in def)) { problems.push(`config.example.json：${prefix}${k} 不在 DEFAULTS 里`); continue; }
        const e = ex[k];
        if (e && typeof e === 'object' && !Array.isArray(e) && def[k] && typeof def[k] === 'object') walk(e, def[k], prefix + k + '.');
      }
    };
    walk(example, DEFAULTS, '');
  } catch (e) {
    problems.push('config.example.json 读取/解析失败：' + e.message);
  }

  if (problems.length) {
    console.error('自检未通过：');
    for (const p of problems) console.error('  ✗ ' + p);
    return false;
  }
  console.log('自检通过：mermaid 注入脚本可解析、模板占位符齐全、config.example.json 与 DEFAULTS 一致');
  return true;
}

module.exports = { run };

if (require.main === module) process.exit(run() ? 0 : 1);
