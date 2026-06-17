import http from "http";
import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";
import { Jimp } from "jimp";

dotenv.config();

const PORT = Number(process.env.PORT) || 5000;
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("⚠️  GEMINI_API_KEY is not set — AI assistant features will not work. Add it via the Secrets panel.");
}

const ai = new GoogleGenAI({ apiKey: apiKey ?? "missing" });

// Simple in-memory rate limiter for the AI endpoint
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string, maxReqs = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxReqs) return false;
  entry.count++;
  return true;
}

async function startServer() {
  const app = express();

  // Security & utility middleware
  app.use(express.json({ limit: "2mb" }));
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // Sync PWA icons at startup (non-blocking)
  (async () => {
    try {
      const publicDir = path.join(process.cwd(), "public");
      const electronIconDir = path.join(process.cwd(), "electron", "icons");
      if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
      if (!fs.existsSync(electronIconDir)) fs.mkdirSync(electronIconDir, { recursive: true });
      const sourceIcon = path.join(process.cwd(), "src/assets/images/worksuite_app_icon_1781631721250.jpg");
      if (fs.existsSync(sourceIcon)) {
        const image = await Jimp.read(sourceIcon);
        await image.write(path.join(publicDir, "icon.png") as any);
        await image.write(path.join(electronIconDir, "icon.png") as any);
        console.log("✓ PWA icons synced");
      }
    } catch (err) {
      console.warn("Icon sync skipped:", (err as Error).message);
    }
  })();

  // AI Assistant endpoint
  app.post("/api/ai/assistant", async (req, res) => {
    if (!apiKey) {
      return res.status(503).json({ error: "AI service is not configured. Set the GEMINI_API_KEY secret." });
    }

    const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0] ?? req.socket.remoteAddress ?? "unknown";
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
    }

    try {
      const { prompt, context, persona, fileData } = req.body;
      if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      const systemInstructions: Record<string, string> = {
        universal: `You are the WorkSuite Built-in AI Productivity Assistant. 
Help users with general tasks inside their WorkSuite document hub:
- Creating content for documents, fixing grammar and formatting.
- Generating tables or data arrays for spreadsheets.
- Writing transaction descriptions and drafting invoice items.
Keep your explanations concise, elegant, and action-oriented. Return standard clean Markdown.`,

        writer: `You are the WorkSuite AI Editor and Pro-Writer Co-Pilot.
Your expertise: drafting professional copy, business proposals, executive outlines, blog posts, letters, email campaigns, resumes, and official correspondence.
You excel at correcting tone, polishing grammar, and formatting elegant textual structures.
Style directive: Always make your text feel professional, crisp, and beautifully styled in markdown. Avoid fluff.`,

        analyst: `You are the WorkSuite Grid Excel and Spreadsheet Data Analyst.
Your focus: creating and structuring tabular data rows, CSV grids, budget templates, data matrices, and writing complex functions/formulas (SUM, AVERAGE, VLOOKUP, COUNTIF, etc.).
When generating spreadsheet data, always structure as beautifully aligned markdown tables.
Additionally, output a raw CSV data bracket when generating tabular rows:
[CSV_IMPORT]
Column1,Column2,Column3
value1,value2,value3
[/CSV_IMPORT]
Keep formula explanations crisp, structured, and mathematical.`,

        accounting: `You are the WorkSuite Financial Accounting and Billing Copilot.
Your expertise: cash transaction logs, ledger deposit and debit balance accounts, expense tracking, professional client billing descriptions, invoice item arrays, and payment reminders.
Use clear lists of line items, precise descriptions, and structured double-entry ledger summaries.
Your tone should be authoritative, clear, and highly organized.

When suggesting credit/debit records:
[TX_RECORD: title="Record Title" type="deposit|debit" amount="value" description="short explanation"]

When advising on invoice line items:
[INVOICE_ITEM: description="Software Consulting Services" price="150" quantity="10"]`,
      };

      const systemInstruction = systemInstructions[persona] ?? systemInstructions.universal;

      let userMessage = "";
      if (fileData && typeof fileData.name === "string") {
        userMessage += `[USER HAS IMPORTED DATA FROM THEIR DEVICE]\n`;
        userMessage += `File: ${fileData.name} (${fileData.size} bytes, ${fileData.type})\n\n`;
        userMessage += `---- BEGIN FILE CONTENT ----\n${fileData.content}\n---- END FILE CONTENT ----\n\n`;
        userMessage += `Analyze this file and answer the prompt below. Output [CSV_IMPORT], [TX_RECORD], or [INVOICE_ITEM] tags as appropriate.\n\n`;
      }

      if (context) userMessage += `Current View Context: ${context}\n\n`;
      userMessage += `User Prompt: ${prompt.trim()}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: userMessage,
        config: { systemInstruction, temperature: 0.7 },
      });

      res.json({ text: response.text });
    } catch (error: any) {
      const msg = error?.message || "An error occurred with the AI service";
      console.error("Gemini API error:", msg);
      res.status(500).json({ error: msg });
    }
  });

  // Create shared HTTP server so Vite HMR WebSocket shares the same port
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, { maxAge: "1y", etag: true }));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`✓ Server running on http://localhost:${PORT}`);
  });
}

startServer();
