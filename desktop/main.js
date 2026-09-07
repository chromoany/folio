'use strict';
/**
 * mdbook 桌面版入口（Electron 主进程）
 * 复用 gui/server.cjs 作为本地服务，再用独立窗口加载 127.0.0.1:4680。
 * 打包后自带 Chromium 内核，不依赖系统浏览器。
 * 行为：最小化 → 任务栏；关闭 → 首次询问（托盘 / 退出），之后按设置执行。
 */
const { app, BrowserWindow, dialog, Tray, Menu, nativeImage, shell } = require('electron');
const http = require('http');
const https = require('https');
const path = require('path');
const settings = require('./settings');

const PORT = Number(process.env.MDBOOK_GUI_PORT || 4680);
const URL = `http://127.0.0.1:${PORT}`;
const RELEASE_API = 'https://api.github.com/repos/chromoany/mdbook/releases/latest';
const RELEASE_PAGE = 'https://github.com/chromoany/mdbook/releases/latest';

// 让 server.cjs 不要再用系统浏览器打开
process.env.MDBOOK_GUI_NO_OPEN = '1';

let mainWindow = null;
let tray = null;
let isQuitting = false;

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
    title: 'mdbook',
    icon: path.join(path.dirname(process.execPath), 'mdbook.ico'),
    autoHideMenuBar: true,
    backgroundColor: '#f5f6f8',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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
      title: '关闭窗口',
      message: '关闭窗口时，你希望怎样处理？',
      detail: '之后可随时在界面「设置」里更改。',
      buttons: ['收起至系统托盘（后台继续运行）', '直接退出程序'],
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

function createTray() {
  const iconPath = path.join(path.dirname(process.execPath), 'mdbook.ico');
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('mdbook');
  const menu = Menu.buildFromTemplate([
    { label: '打开 mdbook', click: showWindow },
    { label: '检查更新', click: () => checkForUpdates(true) },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', showWindow);
}

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
      headers: { 'User-Agent': 'mdbook', Accept: 'application/vnd.github+json' },
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('请求超时')));
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
        title: '发现新版本',
        message: `mdbook 有新版本 v${latest}（当前 v${current}）`,
        detail: '是否前往 GitHub 下载最新版？',
        buttons: ['前往下载', '稍后再说'],
        defaultId: 0,
        cancelId: 1,
      });
      if (r.response === 0) shell.openExternal(RELEASE_PAGE);
    } else if (manual) {
      await dialog.showMessageBox(mainWindow, { type: 'info', title: '检查更新', message: `已是最新版本 v${current}` });
    }
  } catch (e) {
    if (manual) {
      await dialog.showMessageBox(mainWindow, { type: 'warning', title: '检查更新', message: '检查更新失败：' + (e.message || e) });
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
  app.setAppUserModelId('com.chromoany.mdbook');

  // PDF 下载时弹「另存为」对话框
  app.on('web-contents-created', (_e, contents) => {
    contents.session.on('will-download', (_event, item) => {
      const name = item.getFilename();
      dialog
        .showSaveDialog(mainWindow, {
          title: '保存 PDF',
          defaultPath: name,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        })
        .then((r) => {
          if (r.canceled || !r.filePath) item.cancel();
          else item.setSavePath(r.filePath);
        });
    });
  });

  try {
    require('../gui/server.cjs'); // 启动本地服务（MDBOOK_GUI_NO_OPEN 已设，不会开浏览器）
  } catch (e) {
    dialog.showErrorBox('mdbook 启动失败', String((e && e.stack) || e));
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
