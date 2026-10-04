'use strict';
/**
 * 预加载脚本：把「语言已更改」通知桥接给主进程，
 * 让主进程能即时重建托盘菜单文案（页面本身通过 HTTP API 保存语言设置）。
 * 另暴露 getPathForFile：转换时本地图片按 md 原始目录解析，
 * 页面必须拿到拖入 / 选择文件的完整路径（浏览器拿不到，Electron 可以）。
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('folio', {
  setLanguage: (lang) => ipcRenderer.send('folio:set-language', String(lang)),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || '';
    } catch (_) {
      return '';
    }
  },
});