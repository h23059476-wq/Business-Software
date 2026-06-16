import { app, BrowserWindow, Menu, ipcMain, shell, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Prevent GPU and sandbox access violations (common on locked-down Windows hosts).
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow = null;
let serverPort = null;

/**
 * Load the Gemini API key from (in priority order):
 *   1. the GEMINI_API_KEY environment variable
 *   2. a `worksuite-config.json` file in the per-user app data directory
 * so the packaged desktop app can enable the AI assistant without rebuilding.
 */
function loadGeminiApiKey() {
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  try {
    const configPath = path.join(app.getPath('userData'), 'worksuite-config.json');
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (cfg && typeof cfg.geminiApiKey === 'string' && cfg.geminiApiKey.trim()) {
        return cfg.geminiApiKey.trim();
      }
    }
  } catch (err) {
    console.warn('Could not read WorkSuite config:', err);
  }
  return undefined;
}

/**
 * Boot the bundled Express backend in-process so the packaged desktop app
 * behaves exactly like the web app: relative `/api/*` calls work and the UI is
 * served over http://localhost (a Firebase-authorised origin) instead of file://.
 * Returns the port the server is listening on.
 */
async function startEmbeddedServer() {
  const apiKey = loadGeminiApiKey();
  if (apiKey) {
    process.env.GEMINI_API_KEY = apiKey;
  }
  process.env.NODE_ENV = 'production';
  process.env.WORKSUITE_EMBEDDED = '1';

  const distDir = path.join(__dirname, '..', 'dist');
  const serverEntry = path.join(distDir, 'server.cjs');

  const { startServer } = require(serverEntry);
  const { port } = await startServer({
    port: 0, // pick a free ephemeral port
    distDir,
    production: true,
    host: '127.0.0.1',
  });
  return port;
}

function createWindow(startUrl) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    title: 'WorkSuite Office Workstation',
    icon: path.join(__dirname, 'icons/icon.png'),
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Open external links (and OAuth popups) in the user's default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        return { action: 'allow' };
      }
    } catch (_) {}
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Clean, immersive frame without the default browser-style menu bar.
  Menu.setApplicationMenu(null);
}

// IPC Handlers
ipcMain.handle('ping', () => 'pong');
ipcMain.handle('get-server-port', () => serverPort);

async function bootstrap() {
  let startUrl;
  if (isDev) {
    // Connect to the host dev server started via `npm run dev`.
    startUrl = process.env.WORKSUITE_DEV_URL || 'http://localhost:3000';
  } else if (serverPort !== null) {
    // Server already running (e.g. macOS activate after closing all windows).
    startUrl = `http://localhost:${serverPort}`;
  } else {
    try {
      serverPort = await startEmbeddedServer();
      startUrl = `http://localhost:${serverPort}`;
    } catch (err) {
      console.error('Failed to start the embedded WorkSuite server:', err);
      dialog.showErrorBox(
        'WorkSuite failed to start',
        `The application backend could not be started.\n\n${err && err.stack ? err.stack : err}`
      );
      app.quit();
      return;
    }
  }
  createWindow(startUrl);
}

app.whenReady().then(() => {
  bootstrap();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      bootstrap();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
