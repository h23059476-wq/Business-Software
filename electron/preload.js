// Electron Preload Script
import { contextBridge, ipcRenderer } from 'electron';

// Expose secure API keys/channels to the React frontend if needed
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  ping: () => ipcRenderer.invoke('ping'),
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
});
