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

  // ② 模板占位符全部替换干净（目录/书名/另起页三种分支都过一遍）
  const { renderTemplate, DEFAULTS } = require(path.join(ROOT, 'bin', 'folio.cjs'));
  const variants = [
    ['默认（无书名、有目录）', { ...DEFAULTS }],
    ['带书名副标题 + 不另起页', { ...DEFAULTS, title: '书名', subtitle: '副标题', chapterBreak: false }],
    ['不生成目录', { ...DEFAULTS, toc: { enabled: false, title: '目录', depth: 3 } }],
    ['自定义字体三档', { ...DEFAULTS, font: { ...DEFAULTS.font, cjk: 'SimSun', latin: 'Times New Roman', mono: 'Courier New', leading: '1.2em' } }],
  ];
  for (const [name, cfg] of variants) {
    const typ = renderTemplate(cfg);
    const left = typ.match(/\{\{[A-Z_]+\}\}/g);
    if (left) problems.push(`版式模板 ${name}：占位符未替换 —— ${[...new Set(left)].join(', ')}`);
  }

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
