'use strict';
/**
 * 预加载脚本：把「语言已更改」通知桥接给主进程，
 * 让主进程能即时重建托盘菜单文案（页面本身通过 HTTP API 保存语言设置）。
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('folio', {
  setLanguage: (lang) => ipcRenderer.send('folio:set-language', String(lang)),
});