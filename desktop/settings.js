'use strict';
/**
 * 设置持久化。
 * Electron 下存到 app.getPath('userData')；纯 Node（浏览器版）下存到 %APPDATA%\mdbook。
 * 目前唯一设置：closeBehavior（关闭窗口行为）
 *   'tray' = 收起至系统托盘（后台继续运行）
 *   'quit' = 直接退出进程
 *   null   = 未选择（首次关闭时询问）
 */
const fs = require('fs');
const path = require('path');

let baseDir;
try {
  const { app } = require('electron');
  baseDir = app.getPath('userData');
} catch (_) {
  baseDir = path.join(process.env.APPDATA || process.env.HOME || process.cwd(), 'mdbook');
}

const FILE = path.join(baseDir, 'settings.json');
const DEFAULTS = { closeBehavior: null };

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    cache = Object.assign({}, DEFAULTS, JSON.parse(raw));
  } catch (_) {
    cache = Object.assign({}, DEFAULTS);
  }
  return cache;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(load(), null, 2), 'utf8');
  } catch (_) {
    /* 忽略写失败（如只读目录） */
  }
}

function get(key) {
  return load()[key];
}

function set(key, value) {
  load()[key] = value;
  save();
}

module.exports = { get, set, load };
