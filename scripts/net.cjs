#!/usr/bin/env node
/**
 * 网络助手：检测到 Clash(127.0.0.1:7897) 时自动走代理访问 HTTPS。
 * - 用 Node 原生 fetch + NODE_USE_ENV_PROXY（Node 24 支持运行时读取 HTTP(S)_PROXY）。
 * - 响应按 Buffer 收齐后一次性 utf8 解码，避免跨 TCP 分包的中文假 U+FFFD。
 * 用法（命令行）：
 *   node net.cjs get <url> [outFile]        # GET，保存到 outFile（二进制）或打印文本
 *   node net.cjs json <url>                 # GET 并打印 JSON
 * 内部导出 request() 供其它脚本复用（Release 上传等）。
 */
'use strict';
const net = require('net');
const fs = require('fs');

function proxyAlive(timeoutMs = 400) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port: 7897 });
    s.setTimeout(timeoutMs);
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    s.once('timeout', () => { s.destroy(); resolve(false); });
  });
}

/** 返回 true 表示已在进程内启用代理 */
async function enableProxy() {
  if (process.env.NO_FOLIO_PROXY) return false;
  const alive = await proxyAlive();
  if (alive) {
    if (!process.env.HTTP_PROXY) process.env.HTTP_PROXY = 'http://127.0.0.1:7897';
    if (!process.env.HTTPS_PROXY) process.env.HTTPS_PROXY = 'http://127.0.0.1:7897';
    if (!process.env.NO_PROXY) process.env.NO_PROXY = '127.0.0.1,localhost';
    process.env.NODE_USE_ENV_PROXY = '1';
  }
  return alive;
}

/**
 * 发起请求（自动跟随重定向；返回完整响应体）。
 * @param {string} url
 * @param {{method?:string, headers?:object, body?:string|object|Buffer}} opts
 * @returns {Promise<{status:number, headers:object, body:Buffer}>}
 */
async function request(url, opts = {}) {
  const { method = 'GET', headers = {}, body } = opts;
  await enableProxy();
  const hdrs = { 'User-Agent': 'folio', ...headers };
  let payload;
  if (body === undefined) payload = undefined;
  else if (Buffer.isBuffer(body) || typeof body === 'string') payload = body;
  else payload = JSON.stringify(body);
  const r = await fetch(url, { method, headers: hdrs, body: payload });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, headers: Object.fromEntries(r.headers.entries()), body: buf };
}

async function main() {
  const [cmd, url, outFile] = process.argv.slice(2);
  const r = await request(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (r.status >= 400) throw new Error('HTTP ' + r.status + ' ' + r.body.toString('utf8').slice(0, 300));
  if (cmd === 'get' && outFile) {
    fs.writeFileSync(outFile, r.body);
    console.log('saved ' + outFile + ' (' + r.body.length + ' B)');
  } else {
    process.stdout.write(r.body.toString('utf8'));
  }
}

if (require.main === module) {
  main().catch((e) => { console.error('net error:', e.message); process.exit(1); });
}

module.exports = { request, proxyAlive, enableProxy };
