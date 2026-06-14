# 🖥️ WorkSuite Tauri Desktop App Guide (Tauri v2)

This document contains instructions and reference materials for running and building **WorkSuite** as a native desktop application on macOS, Windows, or Linux using **Tauri v2**.

---

## 🚀 Rapid Desktop Dev Script Shortcuts

The following scripts have been registered in your core `package.json`:

*   **`npm run dev:desktop`** - Launches the app in local Tauri desktop/development mode.
*   **`npm run build:desktop`** - Compiles the app with Vite and packages it into a signed, optimized native platform installer (e.g., `.dmg`, `.msi`, `.deb`).
*   **`npm run tauri <command>`** - Direct access to the Tauri v2 CLI utilities.

---

## 🛠️ Local Machine Prerequisites

Before running the desktop application locally, your machine requires the standard rustups and operating system compiler toolchains. Install them according to your platform:

### 1. Install Rust
Tauri uses Rust for compile-time optimization and secure system-level hooks.
*   **macOS / Linux / Windows WSL**:
    ```bash
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
    ```
*   **Windows**: Download and run the standalone `rustup-init.exe` installer from [rustup.rs](https://rustup.rs/).

### 2. Install Platform System Dependencies
Select your host OS build prerequisites below:

#### 🍏 macOS (Xcode Command Line Tools)
Run this command in the terminal to configure the native Clang/C++ compiler toolchain:
```bash
xcode-select --install
```

#### 🪟 Windows (MSVC)
1. Download the **Visual Studio Installer** (Community or higher edition is free).
2. Install the **Desktop development with C++** workload.
3. Keep the default selections (MSVC, Windows SDK, CMake).

#### 🐧 Linux (Debian/Ubuntu)
Install GTK, WebKit2, and other system development headers:
```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

---

## 💻 Local Desktop Workflow Execution

Once prerequisites are configured on your machine, clone/download your compiled workspace and run:

1.  **Install Node Modules**:
    ```bash
    npm install
    ```
2.  **Launch the Desktop App**:
    ```bash
    npm run dev:desktop
    ```
    *Tauri will automatically spin up the Vite dev server, mount a native OS secure webview window, and pipe live hot-reloads straight into your desktop frame.*

3.  **Compile Native Installers**:
    ```bash
    npm run build:desktop
    ```
    *This generates an optimized desktop package tailored specifically for your target architecture (e.g., Intel/Apple Silicon on macOS).*

---

## 📦 What Was Built (Tauri v2 Scaffolding)

The following structure was created and configured to bridge WorkSuite to the desktop workspace:
1.  **`package.json`**: Integrated `@tauri-apps/api` (for secure file systems & windows events) and `@tauri-apps/cli` (for builds) along with custom execution commands.
2.  **`src-tauri/Cargo.toml`**: Standard Rust workspace manifest defining dependencies such as state serialization (`serde`, `serde_json`).
3.  **`src-tauri/build.rs`**: Built-in compile bridge.
4.  **`src-tauri/src/main.rs`**: Secure entry point initializing the desktop window process.
5.  **`src-tauri/tauri.conf.json`**: Primary system specification configuration (e.g., window size, responsive behaviors, and Vite dev bindings).
