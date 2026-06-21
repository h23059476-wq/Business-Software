import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { fork } from 'child_process';

// Prevent GPU and sandbox access violations (common on Windows environments)
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let serverProcess = null;

function startBackgroundServer() {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (!isDev) {
    const serverPath = path.join(__dirname, '../dist/server.cjs');
    console.log(`[Electron Main] Spawning packaged production backend server at: ${serverPath}`);
    try {
      serverProcess = fork(serverPath, [], {
        env: { 
          ...process.env, 
          NODE_ENV: 'production',
          PORT: '3000'
        },
        silent: false
      });

      serverProcess.on('error', (err) => {
        console.error('[Electron Main] Background server process failed to start:', err);
      });

      serverProcess.on('exit', (code, signal) => {
        console.log(`[Electron Main] Background server process exited with code ${code} and signal ${signal}`);
      });
    } catch (e) {
      console.error('[Electron Main] Failed to fork background server:', e);
    }
  }
}

async function loadMainPage() {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    console.log('[Electron Main] Running in development mode. Directly loading http://localhost:3000');
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
    return;
  }

  // Packaged mode: Probe the local server's health check before loading URL
  console.log('[Electron Main] Probing local Express server health check at port 3000...');
  const maxAttempts = 30;
  let attempt = 0;

  async function checkHealthAndLoad() {
    try {
      const res = await fetch('http://localhost:3000/api/health');
      if (res.ok) {
        console.log('[Electron Main] Local background server is healthy on port 3000. Loading workspace UI...');
        mainWindow.loadURL('http://localhost:3000');
        return;
      }
    } catch (e) {
      // Ignore - server is starting up
    }

    attempt++;
    if (attempt < maxAttempts) {
      setTimeout(checkHealthAndLoad, 200);
    } else {
      console.error('[Electron Main] Background server did not start on port 3000 in time. Falling back to local index.html file load.');
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
  }

  checkHealthAndLoad();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "WorkSuite Office Workstation",
    icon: path.join(__dirname, 'icons/icon.png'), // standard Windows Icon file
    frame: false, // frameless window for premium, custom-styled title bar
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load either the live web URL or the local fallback
  loadMainPage();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Create clean, borderless immersive application experience by default
  Menu.setApplicationMenu(null);
}

// IPC Handlers
ipcMain.handle('ping', () => 'pong');

ipcMain.on('window-minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

app.whenReady().then(() => {
  // Always boot background server first if packaged
  startBackgroundServer();
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    console.log('[Electron Main] Terminating local background server process...');
    serverProcess.kill();
    serverProcess = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
