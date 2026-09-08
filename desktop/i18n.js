'use strict';
/**
 * 主进程文案（托盘菜单、系统弹窗）的中英双语。
 * 语言取 settings.get('language')（安装向导所选 / 软件内设置 / 系统语言兜底）。
 */
const settings = require('./settings');

const MSGS = {
  zh: {
    trayOpen: '打开 Folio',
    trayUpdate: '检查更新',
    trayQuit: '退出',
    closeTitle: '关闭窗口',
    closeMsg: '关闭窗口时，你希望怎样处理？',
    closeDetail: '之后可随时在界面「设置」里更改。',
    trayBtn: '收起至系统托盘（后台继续运行）',
    quitBtn: '直接退出程序',
    updateTitle: '发现新版本',
    updateMsg: (v, c) => `Folio 有新版本 v${v}（当前 v${c}）`,
    updateDetail: '是否前往 GitHub 下载最新版？',
    goDownload: '前往下载',
    later: '稍后再说',
    checkTitle: '检查更新',
    upToDate: (v) => `已是最新版本 v${v}`,
    checkFailed: '检查更新失败：',
    startupFailTitle: 'Folio 启动失败',
    savePdfTitle: '保存 PDF',
    pdfFilter: 'PDF',
  },
  en: {
    trayOpen: 'Open Folio',
    trayUpdate: 'Check for Updates',
    trayQuit: 'Quit',
    closeTitle: 'Close window',
    closeMsg: 'What should happen when the window is closed?',
    closeDetail: 'You can change this anytime in Settings.',
    trayBtn: 'Minimize to system tray (keep running in background)',
    quitBtn: 'Quit the app',
    updateTitle: 'New version available',
    updateMsg: (v, c) => `Folio v${v} is available (current: v${c})`,
    updateDetail: 'Open GitHub to download the latest version?',
    goDownload: 'Go to download',
    later: 'Not now',
    checkTitle: 'Check for Updates',
    upToDate: (v) => `You are up to date (v${v})`,
    checkFailed: 'Update check failed: ',
    startupFailTitle: 'Folio failed to start',
    savePdfTitle: 'Save PDF',
    pdfFilter: 'PDF',
  },
};

function lang() {
  try {
    return settings.get('language') === 'en' ? 'en' : 'zh';
  } catch (_) {
    return 'zh';
  }
}

function t(key, ...args) {
  const m = MSGS[lang()] || MSGS.zh;
  const v = m[key];
  if (typeof v === 'function') return v(...args);
  return v !== undefined ? v : key;
}

module.exports = { t, lang };