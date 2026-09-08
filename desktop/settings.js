'use strict';
/**
 * 设置持久化。
 * Electron 下存到 app.getPath('userData')；纯 Node（浏览器版）下存到 %APPDATA%\folio。
 * 设置项：
 *   closeBehavior：关闭窗口行为
 *     'tray' = 收起至系统托盘（后台继续运行）
 *     'quit' = 直接退出进程
 *     null   = 未选择（首次关闭时询问）
 *   language：界面语言
 *     'zh' / 'en'，由用户在软件「设置」或安装向导中选择；
 *     未显式选择时：优先用安装向导写入的 install-lang.txt，其次跟随系统语言（中文系统 → zh，其余 → en）
 */
const fs = require('fs');
const path = require('path');

let baseDir;
try {
  const { app } = require('electron');
  baseDir = app.getPath('userData');
} catch (_) {
  baseDir = path.join(process.env.APPDATA || process.env.HOME || process.cwd(), 'folio');
}

const FILE = path.join(baseDir, 'settings.json');
const LEGACY_FILE = path.join(process.env.APPDATA || process.env.HOME || process.cwd(), 'mdbook', 'settings.json');
// 安装向导（Inno Setup）在安装结束时写入的首选语言：内容为 zh 或 en
const INSTALL_LANG_FILE = path.join(baseDir, 'install-lang.txt');
const DEFAULTS = { closeBehavior: null, language: null };

// 更名（mdbook → Folio）后迁移旧版设置，避免用户重新选择关闭行为
function migrateLegacy() {
  try {
    if (!fs.existsSync(FILE) && fs.existsSync(LEGACY_FILE)) {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.copyFileSync(LEGACY_FILE, FILE);
    }
  } catch (_) {}
}

// 读取安装向导写入的语言（zh / en），没有则为 null
function installerLanguage() {
  try {
    if (!fs.existsSync(INSTALL_LANG_FILE)) return null;
    const v = fs.readFileSync(INSTALL_LANG_FILE, 'utf8').trim();
    return v === 'zh' || v === 'en' ? v : null;
  } catch (_) {
    return null;
  }
}

// 按系统语言给出默认值：中文系统 → zh，其余 → en
function systemLanguage() {
  try {
    const { app } = require('electron');
    const loc = String(app.getLocale() || '').toLowerCase();
    return loc.indexOf('zh') === 0 ? 'zh' : 'en';
  } catch (_) {
    return 'zh';
  }
}

let cache = null;

function load() {
  if (cache) return cache;
  migrateLegacy();
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    cache = Object.assign({}, DEFAULTS, JSON.parse(raw));
  } catch (_) {
    cache = Object.assign({}, DEFAULTS);
  }
  // language 未显式设置时解析出有效值（不改写磁盘，避免把默认值写进设置文件）
  if (cache.language !== 'zh' && cache.language !== 'en') {
    cache.language = installerLanguage() || systemLanguage();
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

module.exports = { get, set, load, getBaseDir: () => baseDir };