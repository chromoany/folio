'use strict';
/**
 * Folio 桌面版入口（Electron 主进程）
 * 复用 gui/server.cjs 作为本地服务，再用独立窗口加载 127.0.0.1:4680。
 * 打包后自带 Chromium 内核，不依赖系统浏览器。
 * 行为：最小化 → 任务栏；关闭 → 首次询问（托盘 / 退出），之后按设置执行。
 * 语言：托盘菜单与系统弹窗文案跟随界面语言（settings.language），
 *       界面内切换语言后经 preload 通知本进程即时重建托盘菜单。
 * 主题：界面外观主题（settings.theme）同步给 nativeTheme，窗口初始背景色随之切换，
 *       避免黑夜模式下启动 / 缩放时闪一下白底。
 */
const { app, BrowserWindow, dialog, Tray, Menu, nativeImage, shell, ipcMain, session, nativeTheme } = require('electron');
const http = require('http');
const https = require('https');
const path = require('path');
const settings = require('./settings');
const { t } = require('./i18n');

const PORT = Number(process.env.FOLIO_GUI_PORT || 4680);
const URL = `http://127.0.0.1:${PORT}`;
const RELEASE_API = 'https://api.github.com/repos/chromoany/folio/releases/latest';
const RELEASE_PAGE = 'https://github.com/chromoany/folio/releases/latest';

// 让 server.cjs 不要再用系统浏览器打开
process.env.FOLIO_GUI_NO_OPEN = '1';

// 窗口背景色，须与 gui/index.html 里 --bg 的取值保持一致
const THEME_BG = { light: '#f5f6f8', dark: '#16181d' };

let mainWindow = null;
let tray = null;
let isQuitting = false;

// 把界面主题同步给原生层：themeSource 决定页面里的 prefers-color-scheme、
// 原生控件（滚动条 / 下拉列表 / 系统弹窗）配色与窗口标题栏明暗
function syncTheme() {
  const pref = settings.get('theme');
  nativeTheme.themeSource = settings.THEMES.includes(pref) ? pref : 'system';
  applyWindowBackground();
}

function applyWindowBackground() {
  if (!mainWindow) return;
  mainWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? THEME_BG.dark : THEME_BG.light);
}

function showWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 820,
    minWidth: 640,
    minHeight: 560,
    title: 'Folio',
    icon: path.join(path.dirname(process.execPath), 'folio.ico'),
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? THEME_BG.dark : THEME_BG.light,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(URL);

  // 关闭：首次询问，之后按设置（托盘 / 退出）
  mainWindow.on('close', (event) => {
    if (isQuitting) return; // 真正退出，放行
    event.preventDefault();
    handleClose();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

async function handleClose() {
  let behavior = settings.get('closeBehavior');
  if (!behavior) {
    const r = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: t('closeTitle'),
      message: t('closeMsg'),
      detail: t('closeDetail'),
      buttons: [t('trayBtn'), t('quitBtn')],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    behavior = r.response === 0 ? 'tray' : 'quit';
    settings.set('closeBehavior', behavior);
  }
  if (behavior === 'tray') {
    mainWindow.hide();
  } else {
    isQuitting = true;
    app.quit();
  }
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: t('trayOpen'), click: showWindow },
    { label: t('trayUpdate'), click: () => checkForUpdates(true) },
    { type: 'separator' },
    { label: t('trayQuit'), click: () => { isQuitting = true; app.quit(); } },
  ]);
}

function createTray() {
  const iconPath = path.join(path.dirname(process.execPath), 'folio.ico');
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Folio');
  rebuildTrayMenu();
  tray.on('click', showWindow);
}

// 按当前界面语言重建托盘菜单（语言切换时调用）
function rebuildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu());
}

// 界面里切换语言后，主进程同步重建托盘菜单文案
ipcMain.on('folio:set-language', () => {
  rebuildTrayMenu();
});

// ---- 自动更新检查 ----

function compareVersions(a, b) {
  const pa = String(a).replace(/^v/i, '').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/i, '').split('.').map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Folio', Accept: 'application/vnd.github+json' },
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('timeout')));
  });
}

async function checkForUpdates(manual) {
  const current = app.getVersion();
  try {
    const data = await httpsGetJson(RELEASE_API);
    const latest = String(data.tag_name || '').replace(/^v/i, '');
    if (compareVersions(latest, current) > 0) {
      const r = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: t('updateTitle'),
        message: t('updateMsg', latest, current),
        detail: t('updateDetail'),
        buttons: [t('goDownload'), t('later')],
        defaultId: 0,
        cancelId: 1,
      });
      if (r.response === 0) shell.openExternal(RELEASE_PAGE);
    } else if (manual) {
      await dialog.showMessageBox(mainWindow, { type: 'info', title: t('checkTitle'), message: t('upToDate', current) });
    }
  } catch (e) {
    if (manual) {
      await dialog.showMessageBox(mainWindow, { type: 'warning', title: t('checkTitle'), message: t('checkFailed') + (e.message || e) });
    }
    // 非手动：静默失败，不打扰用户
  }
}

function waitForServer(cb) {
  let tries = 0;
  const tick = () => {
    const req = http.get(URL, () => { req.destroy(); cb(); });
    req.on('error', () => {
      if (++tries > 60) cb(); // 超时也打开，页面会显示错误
      else setTimeout(tick, 150);
    });
    req.setTimeout(400, () => { req.destroy(); });
  };
  tick();
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.chromoany.folio');

  // 主题：启动即应用；页面里改主题会经 POST /api/settings 落盘，
  // 本进程与 gui/server.cjs 同进程，故监听设置变更即可即时同步
  nativeTheme.on('updated', applyWindowBackground);
  settings.onChange((key) => { if (key === 'theme') syncTheme(); });
  syncTheme();

  // PDF 下载时弹「另存为」对话框。
  // 用 setSaveDialogOptions 定制系统自带保存对话框即可（只弹一个）；
  // 不要在此叠加 dialog.showSaveDialog：will-download 里若不同步调用
  // setSavePath，Electron 会自己再弹一次系统保存框，造成两个弹窗。
  session.defaultSession.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({
      title: t('savePdfTitle'),
      defaultPath: item.getFilename(),
      filters: [{ name: t('pdfFilter'), extensions: ['pdf'] }],
    });
  });

  try {
    require('../gui/server.cjs'); // 启动本地服务（FOLIO_GUI_NO_OPEN 已设，不会开浏览器）
  } catch (e) {
    dialog.showErrorBox(t('startupFailTitle'), String((e && e.stack) || e));
    app.quit();
    return;
  }
  waitForServer(createWindow);
  createTray();

  // 启动后延迟自动检查更新（静默，失败不打扰）
  setTimeout(() => checkForUpdates(false), 3000);
});

app.on('window-all-closed', () => { app.quit(); });

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => { isQuitting = true; });