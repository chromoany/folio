#!/usr/bin/env node
/**
 * 下载最新版 pandoc + typst 便携版到 vendor/（放项目内，D 盘，不占 C 盘）
 * 用法：node scripts/setup.cjs
 * 依赖：Node.js（用自带 fetch 联网，天然 UTF-8，无 PowerShell 编码/执行策略问题）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const VENDOR = path.resolve(__dirname, '..', 'vendor');
const UA = { 'User-Agent': 'folio-setup' };

async function latestAsset(repo, re) {
  const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: UA });
  if (!r.ok) throw new Error(`${repo} API 请求失败：HTTP ${r.status}`);
  const rel = await r.json();
  const asset = (rel.assets || []).find((a) => re.test(a.name));
  if (!asset) throw new Error(`${repo} 未找到匹配 ${re} 的资产`);
  return { version: rel.tag_name, id: asset.id, name: asset.name };
}

// 走 API 资产端点：会 302 到 release-assets CDN（部分网络下 github.com 主站被墙）
async function downloadAsset(repo, id, dest) {
  const url = `https://api.github.com/repos/${repo}/releases/assets/${id}`;
  const r = await fetch(url, { headers: { ...UA, 'Accept': 'application/octet-stream' }, redirect: 'follow' });
  if (!r.ok) throw new Error(`下载失败：HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

function extract(zip, dest) {
  fs.mkdirSync(dest, { recursive: true });
  // Windows 自带 bsdtar（tar.exe）可解 zip
  const r = spawnSync('tar', ['-xf', zip, '-C', dest], { stdio: 'inherit' });
  if (r.error || r.status !== 0) {
    // 回退：PowerShell Expand-Archive
    const r2 = spawnSync('powershell', ['-NoProfile', '-Command',
      `Expand-Archive -Path '${zip}' -DestinationPath '${dest}' -Force`], { stdio: 'inherit' });
    if (r2.error || r2.status !== 0) throw new Error('解压失败');
  }
}

(async () => {
  fs.mkdirSync(VENDOR, { recursive: true });
  for (const [repo, re, key] of [
    ['jgm/pandoc', /windows-x86_64\.zip$/, 'pandoc'],
    ['typst/typst', /x86_64-pc-windows-msvc\.zip$/, 'typst'],
  ]) {
    const a = await latestAsset(repo, re);
    console.log(`[${key}] ${a.version} (${a.name})`);
    const zip = path.join(VENDOR, `${key}.zip`);
    await downloadAsset(repo, a.id, zip);
    extract(zip, path.join(VENDOR, key));
    fs.unlinkSync(zip);
  }
  console.log('完成。二进制已放入 vendor/');
})().catch((e) => { console.error('出错：', e.message); process.exit(1); });
