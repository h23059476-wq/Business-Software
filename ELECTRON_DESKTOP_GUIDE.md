# 🖥️ WorkSuite Electron Desktop App Guide

This guide contains complete directions for running and packaging **WorkSuite** into a premium Windows desktop application with a single-installer **`setup.exe`** file using **Electron** and **electron-builder**.

---

## 🚀 Native Desktop Quick-Scripts

We have pre-configured two custom commands inside your `package.json` to make running and compiling the app incredibly easy:

*   **`npm run dev:desktop`**
    Launches WorkSuite in a secure, local desktop window frame using the Vite development server with full code hot-reloading.
*   **`npm run build:desktop`**
    Compiles the frontend assets, automatically bundles them, and packages them into a fully-signed, single-installer visual executable (**`setup.exe`**) under the `dist-desktop/` folder.

---

## 🛠️ Step-by-Step Instructions for Windows

Follow these simple steps on your local Windows PC (`D:\software\Business-Software`) to build and launch your desktop app:

### Step 1: Install Local Dependencies (First-Time Only)
Open your terminal (Command Prompt, PowerShell, or Git Bash) inside the project folder and type:
```bash
npm install
```
This downloads and registers Electron, electron-builder, and all styling & UI libraries completely.

### Step 2: Running in Desktop Development Mode
To preview the app frame, see changes live, and inspect the console:
1. Start the main workspace (if it isn't already running):
   ```bash
   npm run dev
   ```
2. In another terminal window or tab, launch the Electron desktop container:
   ```bash
   npm run dev:desktop
   ```
This instantly fires up a native OS application pane with embedded debug tools, exactly like a high-fidelity desktop program.

### Step 3: Compiling Your `setup.exe`
When you are ready to create the final executable installer for distribution:
1. Run the build script:
   ```bash
   npm run build:desktop
   ```
2. Once the script finishes, check the newly created output folder inside your directory:
   **`D:\software\Business-Software\dist-desktop\`**

Inside this folder, you will find:
*   📁 **`WorkSuite Setup 1.0.0.exe`** (Your custom desktop application setup executable!)
*   📦 Dynamic app unpack directories for rapid testing.

---

## 🧠 How the Desktop App Works (Architecture)

Unlike a plain static-file Electron wrapper, WorkSuite ships its **full backend inside
the desktop app**. When the packaged app launches, the Electron main process
(`electron/main.js`):

1. Starts the bundled Express server (`dist/server.cjs`) **in-process** on a free
   local port.
2. Loads the UI from `http://localhost:<port>` (instead of `file://`).

This matters because:
* The AI assistant calls relative endpoints like `/api/ai/assistant`; these only
  work when a server is actually running.
* Firebase Authentication and Firestore treat `localhost` as an authorised origin,
  whereas `file://` origins are rejected — so the cloud sync + login flows work
  correctly in the desktop build.

No separate terminal or `npm run dev` is required for the packaged app — it is fully
self-contained.

---

## 🔑 Enabling the AI Assistant on Desktop

The Gemini API key is never bundled into the installer. The packaged app reads it at
runtime from (in priority order):

1. The `GEMINI_API_KEY` environment variable, or
2. A `worksuite-config.json` file in the per-user app-data directory:
   * **Windows:** `%APPDATA%\WorkSuite\worksuite-config.json`
   ```json
   { "geminiApiKey": "your_gemini_api_key_here" }
   ```

The rest of the suite (documents, spreadsheets, ledger notes, invoices, letters, PDF
export) works fully without a key — only the AI assistant requires one.

---

## 🐧 Building the Windows Installer From Linux/macOS

`electron-builder --win` (the NSIS installer target) requires **Wine** when building
from a non-Windows host. On Debian/Ubuntu:
```bash
sudo dpkg --add-architecture i386
sudo apt-get update
sudo apt-get install -y wine wine64 wine32:i386
```
Building directly on Windows needs no extra tooling.

---

## 🎨 Professional Visual Configurations Implemented
1.  **Fully Custom Icon Brushing**: Integrated the high-definition square brand icon (`electron/icons/icon.ico`) as the default taskbar launch shortcut, execution window profile, and target installer identity.
2.  **Immersive Screen Space**: Disabled boring standard system browser dropdown menus (`Menu.setApplicationMenu(null)`) to give you more visual area and a truly premium application atmosphere.
3.  **Intelligent Route Resolution**: Configured Vite asset mapping dynamically (`base: './'`) so the bundled assets resolve correctly when served over `http://localhost` inside the Electron shell.
