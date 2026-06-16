# WorkSuite AI
### All-In-One Professional Productivity Portal & Desktop Workstation

WorkSuite AI is a full-stack, enterprise-grade workspace workstation that unifies professional documentation drafting, ledger-ready financial tracking, grid spreadsheets, ledger note-taking, invoicing, and contextual generative AI assistants. 

Boasting a desktop-first design language styled with high-contrast layouts, deep indigo details, and comfortable whitespace balance, WorkSuite is built to run effortlessly as a standard full-stack web service, an offline-first Progressive Web App (PWA), or a standalone desktop application compiled on Electron.

---

## 🎨 Visual Identity & Core Design Vibe
- **Slate & Indigo Canvas**: High-contrast typography paired with spacious bounding boxes, elegant padding variations, and micro-interactions optimized for professional use.
- **Responsive Layout Fluidity**: Fluid layouts wrapping clean widescreen panels, scaling smoothly from massive monitor setups to laptop screens and mobile touch displays.
- **Architectural Honesty**: Zero bloated metrics or unneeded terminal chatter. Status indicators are localized, straightforward, and objective.

---

## 🚀 Key Functional Modules

### 1. 📊 Central Workstation Dashboard
- **Consolidated Workspace**: Real-time summary overview across recent document drafts, invoices, and accounting logs.
- **Fast Templates**: Boot and initialize blank canvases or stylized standard presets with a single click.

### 2. 📝 Cloud-Synced Document Editor
- **Rich Context Controls**: Focus environments supporting bold, italic, underline, header levels, and structural alignments.
- **Smart PDF Engraving**: Generates highly polished PDF print exports directly on the client with metadata headers.
- **Autonomous Auto-Saving**: Uses standard `onSnapshot` subscriptions sync-locking content dynamically with Firestore.

### 3. 📈 Grid Spreadsheet Engine
- **Independent Formula Rows**: Calculate sums, averages, and coordinate balances on-the-fly.
- **Dynamic Headers**: Edit table structure, resize matrices, and auto-export clean spreadsheets easily.

### 4. 💰 Business Accounts Ledger & Invoices
- **Double-Entry Ledger Logs**: Track account definitions, active balances, assets, liabilities, and multi-currency records.
- **Invoices & Professional Letters**: Rapid templates with custom customer metadata, itemized tables, auto-calculated VAT/taxes, and clean layout patterns.

### 5. 🤖 Contextual AI Assistant
- **Gemini-Powered Workspace Integration**: Analyze financial ledger sheets or summarize active document drafts without leaking API credentials to client-side browsers.
- **No-Lag Streaming & Prompts**: High-integrity prompts compiled using the `@google/genai` TypeScript SDK server-side.

---

## 🏗️ Technical Architecture & Infrastructure Blueprint

```
                      +-------------------------------------------------------------+
                      |                      WorkSuite Desktop                      |
                      +-----------------------------+-------------------------------+
                                                    | (Launches native window shell)
                                                    v
+--------------------------+          +---------------------------+          +-------------------------+
|    Client-Side Shell     |          |       Express Server      |          |    Cloud Integrations   |
+--------------------------+          +---------------------------+          +-------------------------+
| - React 19 / Vite 6      |          | - tsx Runtime Runner      |          | - Google Gemini Pro SDK |
| - Tailwind Engine v4     | <======> | - Vite Dev Middleware     | <======> | - Firebase Auth         |
| - Service Worker / Cache |  (APIs)  | - PWA Copy Operations     |          | - Cloud Firestore Sync  |
| - Local Offline Fallback |          | - CJS esbuild Compiles   |          | - Native Local Sandbox  |
+--------------------------+          +---------------------------+          +-------------------------+
```

### 1. Unified Full-Stack Bridge (`server.ts`)
- **Dual-Mode Engine**: Operates as a development server injecting Vite's hot-reload middlewares, and falls back to serving a self-contained, high-performance static build directory in production.
- **Server-Side API Proxing**: Proxies all Gemini AI calls through secure Express endpoints (`/api/chat`, etc.) ensuring strict API key safety.

### 2. Standard PWA Capability (`public/sw.js` & `public/manifest.json`)
- **Offline Caching Engine**: Custom lifecycle service workers caching critical application structures (`index.html`, etc.) for seamless offline loads and immediate boot times.
- **Local Application Manifest**: Prompts web clients to download and launch WorkSuite AI as a native standalone application on your laptop or mobile desktop with an elegant custom system launcher icon.

### 3. Fail-Safe Firebase Sandboxing
- **Uninterrupted Operations**: If unconfigured Firebase configurations, blocked preview domains, or browser connection restrictions prevent cloud authentication, the boot loader seamlessly launches the **Localized Sandbox Mode**.
- **Offline Local Preservation**: Preserves configurations inside local namespaces so users are never greeted by crash screens, enabling immediate sandbox operation.

---

## 📁 Repository Structure

```
├── electron/                   # Desktop client wrapper structures
│   ├── icons/                  # Custom circular desktop application icons
│   ├── main.js                 # Electron main thread orchestration
│   └── preload.js              # IPC bridge mapping secure host functions
├── public/                     # Static app files served under the root URL
│   ├── icon.png                # Core icon used in standard PWA execution
│   ├── manifest.json            # Dynamic manifest describing desktop PWA setup
│   └── sw.js                   # Client-side custom caching service worker
├── src/                        # Primary React front-end workspace
│   ├── assets/                 # Vector illustrations and media catalogs
│   ├── components/             # Granular UI layouts and workspace modules
│   │   ├── AccountsSummary.tsx # Accounting engine widgets and registers
│   │   ├── AiAssistant.tsx     # Floating assistant sidepanel with Gemini SDK
│   │   ├── DocumentEditor.tsx  # Dynamic WYSIWYG editor with live auto-save
│   │   ├── InvoiceMaker.tsx    # Invoice design tool and VAT calculator
│   │   ├── SpreadsheetEditor.tsx # Grid formulas and formula controllers
│   │   └── Settings.tsx        # Local account preferences, offline resets
│   ├── App.tsx                 # Core application entrypoint and root provider
│   ├── index.css               # Tailwind CSS integrations and font setup
│   └── types.ts                # Strict common TypeScript definitions
├── server.ts                   # Core full-stack server running Express
├── package.json                # Project dependencies, build actions, electron specs
└── vite.config.ts              # Vite configurations loading ES plugins
```

---

## 🛠️ Installation & Execution Commands

### 1. Developer Setup
Install initial packages and launch the server:
```bash
# Install required libraries
npm install

# Run the unified full-stack application (Server & Web Client on http://localhost:3000)
npm run dev
```

### 2. Build for Production Web
Transpile components, build optimized static assets, bundle server files, and boot standalone production code:
```bash
# Build Vite client & compile the Express server into dist/server.cjs via esbuild
npm run build

# Start the unified final standalone production service
npm run start
```

### 3. Desktop Application Construction (Electron Shell)
WorkSuite can be launched or compiled as a standalone native desktop workspace application on laptops/desktops:
```bash
# Run the local Electron development shell targeting the active server
npm run dev:desktop

# Build and package WorkSuite as a standalone local Windows installer (.exe)
npm run build:desktop
```

---

## ⚙️ Environment Variables (`.env.example`)
To configure the cloud APIs without exposing keys to user browsers, configure `.env`:
```env
# Google Gemini Generative AI Server-Side Secret Key (Strictly Server-Only)
GEMINI_API_KEY=your_gemini_api_key_goes_here
```
