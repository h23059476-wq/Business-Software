import express from "express";
import path from "path";
import fs from "fs";
import type { GoogleGenAI as GoogleGenAIType } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();

// The Gemini client is created lazily so the server can boot (and serve the
// rest of the application) even when no API key is configured yet. This is
// important for the packaged desktop app, where the key is supplied at runtime.
let aiClient: GoogleGenAIType | null = null;
async function getAiClient(): Promise<GoogleGenAIType> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Set it in your environment (or the desktop app's API key setting) to enable the AI assistant."
    );
  }
  if (!aiClient) {
    const { GoogleGenAI } = await import("@google/genai");
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

export interface StartServerOptions {
  /** Port to listen on. Defaults to PORT env var or 3000. Use 0 for a random free port. */
  port?: number;
  /** Directory containing the built client assets (production only). */
  distDir?: string;
  /** Force production (static) mode regardless of NODE_ENV. */
  production?: boolean;
  /** Host interface to bind. Defaults to 0.0.0.0. */
  host?: string;
}

export async function startServer(options: StartServerOptions = {}): Promise<{ port: number }> {
  const app = express();
  const isProduction = options.production ?? process.env.NODE_ENV === "production";
  const requestedPort = options.port ?? (process.env.PORT ? Number(process.env.PORT) : 3000);
  const host = options.host ?? "0.0.0.0";
  const distDir = options.distDir ?? process.env.DIST_DIR ?? path.join(process.cwd(), "dist");

  // Sync PWA icons to the public folder at server startup (development only,
  // since the source assets are not shipped with the packaged desktop app).
  if (!isProduction) {
    try {
      const publicDir = path.join(process.cwd(), "public");
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      const sourceIcon = path.join(process.cwd(), "src/assets/images/worksuite_app_icon_1781547652851.jpg");
      const targetIcon = path.join(publicDir, "icon.png");
      if (fs.existsSync(sourceIcon)) {
        fs.copyFileSync(sourceIcon, targetIcon);
        console.log("PWA icon synchronized: ", targetIcon);
      }
    } catch (err) {
      console.warn("Non-blocking PWA icon copy skipped:", err);
    }
  }

  app.use(express.json({ limit: "25mb" }));

  // API Route for AI Assistant
  app.post("/api/ai/assistant", async (req, res) => {
    try {
      const { prompt, context, persona, fileData } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      let systemInstruction = `You are the WorkSuite Built-in AI Productivity Assistant. 
You help users with general tasks, and specifically tasks inside their WorkSuite document hub:
- Creating content for their word processor (Google Docs clone).
- Fixing text, grammar, formatting.
- Generating tables or data arrays for their Spreadsheets.
- Writing deposit or debit transaction descriptions.
- Drafting professional invoice bullet items or billing descriptions.

Keep your explanations concise, elegant, and action-oriented. Return standard clean Markdown.`;

      if (persona === 'writer') {
        systemInstruction = `You are the WorkSuite AI Editor and Pro-Writer Co-Pilot. 
Your specialized expertise is drafting professional copy, formal business proposals, executive outlines, blog posts, letters, email campaigns, resumes, and official correspondence.
You excel at correcting tone, polishing grammar, and formatting elegant textual structures.
Style directive: Always make your text feel professional, crisp, and beautifully styled in markdown. Avoid fluff.`;
      } else if (persona === 'analyst') {
        systemInstruction = `You are the WorkSuite Grid Excel and Spreadsheet Data Analyst. 
Your specialized focus is creating and structuring tabular data rows, CSV grids, budget templates, data matrices, and writing complex functions/formulas (such as SUM, AVERAGE, VLOOKUP, COUNTIF, etc.).
When generating spreadsheet layout cells or importing CSV/device lists, always structure them as beautifully aligned markdown tables.
Additionally, you MUST output a raw CSV data bracket at the end if you generate tabular rows (which the application can automatically inject into the grid cells):
[CSV_IMPORT]
Column1,Column2,Column3
value1,value2,value3
[/CSV_IMPORT]
Keep explanations of formulas crisp, structured, and mathematical.`;
      } else if (persona === 'accounting') {
        systemInstruction = `You are the WorkSuite Financial Accounting and billing Copilot. 
Your specialized expertise is cash transaction logs, ledger deposit and debit balance accounts, expense tracking lists, drafting professional client billing descriptions, invoice item arrays, and polite but assertive payment reminders.
Use clear lists of line items, precise descriptions, and structured double-entry ledger summaries. 
Your tone should be authoritative, clear, and highly organized regarding transaction recording.

When suggesting credit/debit records, write a special log container at the bottom/top of your response so the user can import it automatically:
[TX_RECORD: title="Record Title" type="deposit|debit" amount="value" description="short explanation"]

When advising on invoice line items or billing items, write a special item tag so the user can add it to their client billing sheet:
[INVOICE_ITEM: description="Software Consulting Services" price="150" quantity="10"]`;
      }

      // Build richer context if file data is attached from device
      let userMessage = "";
      if (fileData) {
        userMessage += `[USER HAS IMPORTED DATA FROM THEIR DEVICE]\n`;
        userMessage += `Imported File Name: ${fileData.name}\n`;
        userMessage += `File Size: ${fileData.size} bytes\n`;
        userMessage += `File MIME Type: ${fileData.type}\n\n`;
        userMessage += `---- BEGIN ATTACHED DEVICE FILE CONTENT ----\n`;
        userMessage += `${fileData.content}\n`;
        userMessage += `---- END ATTACHED DEVICE FILE CONTENT ----\n\n`;
        userMessage += `The user is importing this file from their device. Please analyze this file content, handle its records, and answer the prompt below. If spreadsheets, notes, or invoices are active, output the corresponding [CSV_IMPORT], [TX_RECORD], or [INVOICE_ITEM] tags so the system can absorb the records natively.\n\n`;
      }

      if (context) {
        userMessage += `Current View Context: ${context}\n\n`;
      }

      userMessage += `User Message/Prompt: ${prompt}`;

      const ai = await getAiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: userMessage,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API error:", error);
      res.status(500).json({ error: error.message || "An error occurred with the AI service" });
    }
  });

  if (!isProduction) {
    // Vite middleware for development (dynamic import keeps vite out of the
    // packaged production bundle, where it is not installed).
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return await new Promise((resolve) => {
    const server = app.listen(requestedPort, host, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : requestedPort;
      console.log(`Server running on http://localhost:${actualPort}`);
      console.log(`WORKSUITE_SERVER_READY:${actualPort}`);
      resolve({ port: actualPort });
    });
  });
}

// Auto-start when run directly (npm run dev / npm start). When embedded inside
// the Electron desktop shell, the host calls startServer() explicitly instead.
if (process.env.WORKSUITE_EMBEDDED !== "1") {
  startServer();
}
