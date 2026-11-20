const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tiligramDesktop', {
  isElectron: true,
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  checkForUpdates: (repo) => ipcRenderer.invoke('updater:check', repo),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdateStatus: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('updater:status', handler);
    return () => ipcRenderer.removeListener('updater:status', handler);
  },
  showNotification: (payload) => ipcRenderer.invoke('notification:show', payload),
  onNotificationClick: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('notification:clicked', handler);
    return () => ipcRenderer.removeListener('notification:clicked', handler);
  },
  setBadgeCount: (count) => ipcRenderer.invoke('app:setBadgeCount', count),
});
