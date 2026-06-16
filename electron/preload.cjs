// Electron Preload Script (CommonJS — required for sandboxed preloads).
const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal, secure bridge to the React frontend.
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  ping: () => ipcRenderer.invoke('ping'),
  getServerPort: () => ipcRenderer.invoke('get-server-port'),
});
