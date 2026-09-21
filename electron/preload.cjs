// Exposes a small, explicit API to the page. Nothing else from Node reaches the renderer.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  onActiveWindow(cb) {
    const handler = (_event, win) => cb(win);
    ipcRenderer.on('active-window', handler);
    return () => ipcRenderer.removeListener('active-window', handler);
  },
  activeWindow: () => ipcRenderer.invoke('active-window'),
  windows: () => ipcRenderer.invoke('windows'),
  apps: () => ipcRenderer.invoke('apps'),
  loadStore: () => ipcRenderer.invoke('store:load'),
  saveStore: (data) => ipcRenderer.invoke('store:save', data),
  quit: () => ipcRenderer.invoke('quit'),
});
