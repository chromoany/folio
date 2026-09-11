#!/usr/bin/env node
/**
 * Folio Windows 发布打包（可复现）：electron-packager → 精简 → Inno Setup → dist/*.exe
 *
 * 精简项（功能/转换输出零变化）：
 *   1. locales 只保留 en-US / zh-CN（界面仅中英双语），删其余 ~46MB
 *   2. UPX 压缩 vendor 里的 pandoc.exe / typst.exe（运行时自解压，输出不变，磁盘 -130MB 左右）
 *   3. 通过 packager ignore 把 examples/scripts/packaging/assets/README/.git* 等运行时
 *      不需要的文件挡在安装包外
 *
 * 用法：node scripts/package.cjs
 * 环境变量：
 *   UPX_BIN            指定 upx.exe 路径（默认自动找 D:\Programs\upx 下或 PATH）
 *   FOLIO_SKIP_UPX=1   跳过 UPX 压缩（调试用）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, '.build', 'electron');
const APP_DIR = path.join(OUT_DIR, 'folio-win32-x64');
const DIST_DIR = path.join(ROOT, 'dist');
const ISS = path.join(ROOT, 'packaging', 'setup.iss');
const ISCC = 'D:\\Programs\\Inno Setup 6\\ISCC.exe';
const VERSION = require(path.join(ROOT, 'package.json')).version;
const SETUP_EXE = `folio-${VERSION}-setup.exe`;

// ---- 工具 ----
function dirSize(d) {
  let s = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    s += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return s;
}
function mb(n) { return (n / 1048576).toFixed(1) + ' MB'; }
function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8', windowsHide: true,
    stdio: 'pipe', maxBuffer: 64 * 1024 * 1024, ...opts,
  });
  if (r.error) throw new Error(`${cmd} 无法运行: ${r.error.message}`);
  if (r.status !== 0) {
    const tail = String(r.stderr || r.stdout || '').trim().split('\n').slice(-15).join('\n');
    throw new Error(`${cmd} 退出码 ${r.status}\n${tail}`);
  }
  return r;
}

// 查找 pandoc.exe / typst.exe（vendor 下递归）
function findExes(root, names) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (names.includes(e.name.toLowerCase())) out.push(p);
    }
  })(root);
  return out;
}

function findUpx() {
  if (process.env.UPX_BIN && fs.existsSync(process.env.UPX_BIN)) return process.env.UPX_BIN;
  const base = 'D:\\Programs\\upx';
  if (fs.existsSync(base)) {
    const hit = findExes(base, ['upx.exe'])[0];
    if (hit) return hit;
  }
  return 'upx'; // PATH
}

async function pack() {
  const t0 = Date.now();
  console.log('① electron-packager …');
  const { packager } = require('@electron/packager');
  rmrf(APP_DIR);
  const ignore = [
    /^\/dist($|\/)/, /^\/\.build($|\/)/, /^\/node_modules($|\/)/,
    /^\/examples($|\/)/, /^\/scripts($|\/)/, /^\/packaging($|\/)/,
    /^\/assets($|\/)/, /^\/\.git($|\/)/,
    // temp/ 是本地临时产物目录（探针脚本、离线打包镜像等），绝不能进安装包：
    // 曾因为它没被忽略，把两份 150MB 的 electron zip 一起打进 resources/app/temp/，安装包从 ~150MB 涨到 450MB
    /^\/temp($|\/)/,
    /^\/README\.md$/, /^\/README\.zh\.md$/,
    /^\/\.gitignore$/, /^\/\.gitattributes$/,
    /^\/config\.example\.json$/,
  ];
  const appPaths = await packager({
    dir: ROOT,
    name: 'folio',
    platform: 'win32',
    arch: 'x64',
    out: OUT_DIR,
    asar: false,
    overwrite: true,
    prune: true,
    ignore,
  });
  console.log('   产出: ' + appPaths[0]);

  const before = dirSize(APP_DIR);
  console.log(`② 精简前安装体积: ${mb(before)}`);

  // 精简 1：locales 只留中英
  const locDir = path.join(APP_DIR, 'locales');
  if (fs.existsSync(locDir)) {
    const keep = new Set(['en-US.pak', 'zh-CN.pak']);
    let saved = 0;
    for (const f of fs.readdirSync(locDir)) {
      if (!keep.has(f)) {
        saved += fs.statSync(path.join(locDir, f)).size;
        fs.unlinkSync(path.join(locDir, f));
      }
    }
    console.log(`③ locales 仅保留 en-US/zh-CN，删除 ${mb(saved)}`);
  }

  // 精简 2：UPX 压缩 pandoc/typst
  if (process.env.FOLIO_SKIP_UPX === '1') {
    console.log('④ 跳过 UPX（FOLIO_SKIP_UPX=1）');
  } else {
    const upx = findUpx();
    const exes = findExes(path.join(APP_DIR, 'resources', 'app', 'vendor'), ['pandoc.exe', 'typst.exe']);
    if (exes.length) {
      console.log(`④ UPX(${upx}) 压缩: ${exes.map((x) => path.basename(path.dirname(x))).join(', ')}`);
      const r = spawnSync(upx, ['-q', ...exes], { encoding: 'utf8', windowsHide: true, stdio: 'pipe', maxBuffer: 16 * 1024 * 1024 });
      if (r.error) throw new Error(`upx 无法运行: ${r.error.message}`);
      if (r.status !== 0) {
        console.warn('   ⚠ upx 压缩失败（保留原版继续）：' + String(r.stderr || r.stdout || '').trim().split('\n').slice(-8).join('\n'));
      } else {
        for (const x of exes) console.log(`   - ${path.basename(x)} → ${mb(fs.statSync(x).size)}`);
      }
    }
  }

  const after = dirSize(APP_DIR);
  console.log(`⑤ 精简后安装体积: ${mb(after)}（省 ${mb(before - after)}）`);

  // 步骤⑥ Inno Setup 出安装包
  console.log('⑥ Inno Setup 编译安装包 …');
  run(ISCC, [ISS], { cwd: ROOT });
  const exe = path.join(DIST_DIR, SETUP_EXE);
  if (!fs.existsSync(exe)) throw new Error('未找到安装包: ' + exe);
  console.log('完成: ' + exe + '（' + mb(fs.statSync(exe).size) + '），耗时 ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
}

pack().catch((e) => { console.error('打包失败: ' + e.message); process.exit(1); });
