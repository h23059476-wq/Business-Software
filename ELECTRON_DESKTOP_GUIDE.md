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

## 🎨 Professional Visual Configurations Implemented
1.  **Fully Custom Icon Brushing**: Integrated the high-definition square brand icon (`src-tauri/icons/icon.ico`) as the default taskbar launch shortcut, execution window profile, and target installer identity.
2.  **Immersive Screen Space**: Disabled boring standard system browser dropdown menus (`Menu.setApplicationMenu(null)`) to give you more visual area and a truly premium application atmosphere.
3.  **Intelligent Route Resolution**: Configured Vite asset mapping dynamically (`base: './'`) to resolve file systems seamlessly (`file://` pathways) inside Electron's sandbox, preventing white screen errors.
