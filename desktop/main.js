'use strict';
/**
 * mdbook 桌面版入口（Electron 主进程）
 * 复用 gui/server.cjs 作为本地服务，再用独立窗口加载 127.0.0.1:4680。
 * 打包后自带 Chromium 内核，不依赖系统浏览器。
 */
const { app, BrowserWindow, dialog } = require('electron');
const http = require('http');
const path = require('path');

const PORT = Number(process.env.MDBOOK_GUI_PORT || 4680);
const URL = `http://127.0.0.1:${PORT}`;

// 让 server.cjs 不要再用系统浏览器打开
process.env.MDBOOK_GUI_NO_OPEN = '1';

let mainWindow = null;

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
  mainWindow.on('closed', () => { mainWindow = null; });
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
});

app.on('window-all-closed', () => { app.quit(); });

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
