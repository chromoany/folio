// 验证工具：解析 PDF 书签（目录），打印每条标题对应的真实页码
// 用法：node scripts/check-toc.cjs book.pdf
'use strict';
const fs = require('fs');
const pdf = fs.readFileSync(process.argv[2]).toString('latin1');

const objs = {};
const objRe = /(\d+) 0 obj\s*([\s\S]*?)\s*endobj/g;
let m;
while ((m = objRe.exec(pdf))) objs[m[1]] = m[2];

// Pages 根节点的 /Kids 里是页面对象引用，按顺序即页码
let pagesId = null;
for (const [id, body] of Object.entries(objs)) {
  if (/\/Type\s*\/Pages\b/.test(body)) { pagesId = id; break; }
}
const kids = objs[pagesId].match(/\/Kids\s*\[([\s\S]*?)\]/);
const pageRefs = kids ? [...kids[1].matchAll(/(\d+) 0 R/g)].map((x) => x[1]) : [];

// 标题是十六进制字符串 <FEFF...>（UTF-16BE，带 BOM）
function extractTitle(body) {
  const t = body.match(/\/Title\s*<([0-9A-Fa-f]+)>/);
  if (!t) return '(no title)';
  let bytes = Buffer.from(t[1], 'hex');
  if (bytes[0] === 0xfe && bytes[1] === 0xff) bytes = bytes.subarray(2);
  let out = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  }
  return out;
}

// /Dest 指向间接数组 [页引用 0 R /XYZ ...]
function destPage(body) {
  const d = body.match(/\/Dest\s+(\d+) 0 R/);
  if (!d) return '?';
  const arr = objs[d[1]];
  if (!arr) return '?';
  const pg = arr.match(/\[?\s*(\d+) 0 R/);
  if (!pg) return '?';
  const idx = pageRefs.indexOf(pg[1]);
  return idx < 0 ? '?' : idx + 1;
}

const firstRef = pdf.match(/\/Outlines\s*\/First\s+(\d+) 0 R/);
if (!firstRef) { console.log('无书签'); process.exit(0); }

const out = [];
(function walk(ref, depth) {
  if (!objs[ref]) return;
  const body = objs[ref];
  out.push({ depth, title: extractTitle(body), page: destPage(body) });
  const f = body.match(/\/First\s+(\d+) 0 R/);
  if (f) walk(f[1], depth + 1);
  const n = body.match(/\/Next\s+(\d+) 0 R/);
  if (n) walk(n[1], depth);
})(firstRef[1], 0);

for (const e of out) {
  console.log('  '.repeat(e.depth) + `${e.title}  →  p.${e.page}`);
}
console.log(`\n共 ${out.length} 个目录条目，${pageRefs.length} 页`);
