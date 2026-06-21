import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";
import { Jimp } from "jimp";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function generateContentWithRetryAndFallback(contents: any, config: any, requestedModel?: string, customApiKey?: string) {
  const activeApiKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!activeApiKey) {
    throw new Error("GEMINI_API_KEY is not configured. If you are using this application offline or inside an electron runtime, please go to the 'Gemini API Key' tab in the left sidebar and paste your Google AI Studio key.");
  }

  const activeAi = new GoogleGenAI({
    apiKey: activeApiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  const modelsToTry = [
    ...(requestedModel ? [requestedModel] : []),
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-3.1-pro-preview"
  ];

  let lastError: any = null;

  for (const modelName of modelsToTry) {
    let retries = 3;
    let delay = 1000;

    while (retries > 0) {
      try {
        console.log(`[Gemini API] Attempting generateContent with model: ${modelName} (${retries} retries left)...`);
        const response = await activeAi.models.generateContent({
          model: modelName,
          contents,
          config,
        });
        if (response) {
          console.log(`[Gemini API] Success with model: ${modelName}`);
          return response;
        }
      } catch (err: any) {
        lastError = err;
        const statusCode = err?.status || err?.statusCode || (err?.message?.includes("503") ? 503 : null) || (err?.message?.includes("429") ? 429 : null);
        console.warn(`[Gemini API] Model ${modelName} attempt failed:`, err?.message || err);

        const isTransient = statusCode === 503 || statusCode === 429 || 
                            (err?.message && (
                              err.message.includes("503") || 
                              err.message.includes("429") || 
                              err.message.includes("high demand") || 
                              err.message.includes("UNAVAILABLE") ||
                              err.message.includes("busy")
                            ));

        if (isTransient) {
          console.log(`[Gemini API] Transient error detected, waiting ${delay}ms before retrying ${modelName}...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2;
          retries--;
        } else {
          console.log(`[Gemini API] Non-transient error or fallback-worthy error on ${modelName}. Moving to next available model...`);
          break;
        }
      }
    }
  }

  throw lastError || new Error("All models failed to generate content.");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Sync PWA icons to the public folder at server startup
  try {
    const publicDir = path.join(process.cwd(), "public");
    const electronIconDir = path.join(process.cwd(), "electron", "icons");
    
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    if (!fs.existsSync(electronIconDir)) {
      fs.mkdirSync(electronIconDir, { recursive: true });
    }

    const sourceIcon = path.join(process.cwd(), "src/assets/images/worksuite_app_icon_1781631721250.jpg");
    const targetIconPwa = path.join(publicDir, "icon.png");
    const targetIconElectron = path.join(electronIconDir, "icon.png");

    if (fs.existsSync(sourceIcon)) {
      // Use Jimp to convert the JPEG source to a valid, standard PNG image format
      const image = await Jimp.read(sourceIcon);
      await image.write(targetIconPwa as any);
      await image.write(targetIconElectron as any);
      console.log("PWA and Electron icons successfully converted and synchronized with the custom generated branding logo!");
    }
  } catch (err) {
    console.warn("Non-blocking PWA/Electron icon copy skipped:", err);
  }

  app.use(express.json());

  // CORS middleware for cross-origin requests (e.g. from file:// origins in packaged desktop app)
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "X-Requested-With,Content-Type,x-gemini-api-key");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Health check endpoint for Electron/embedded runtime checks
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API Route for AI Assistant
  app.post("/api/ai/assistant", async (req, res) => {
    try {
      const { prompt, context, persona, fileData, messages, model, customApiKey } = req.body;
      const headerKey = req.headers['x-gemini-api-key'] as string;
      const finalCustomKey = customApiKey || headerKey;

      if (!prompt && (!messages || !Array.isArray(messages))) {
        return res.status(400).json({ error: "Prompt or conversation history is required" });
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

      let contents: any[] = [];

      // If persistent chat history messages is passed, construct a multi-turn contents list
      if (messages && Array.isArray(messages) && messages.length > 0) {
        let rawContents = messages
          .filter(m => m && typeof m.content === 'string' && m.content.trim() !== '')
          .map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          }));

        // Keep sequence strictly starting with the user's turn
        while (rawContents.length > 0 && rawContents[0].role === 'model') {
          rawContents.shift();
        }

        // Inject attached file content to the last user message in the conversation
        if (fileData && rawContents.length > 0) {
          const lastIdx = rawContents.length - 1;
          if (rawContents[lastIdx].role === 'user') {
            let enrichedText = `[USER INSTANT FILE IMPORT]\n`;
            enrichedText += `File Name: ${fileData.name}\n`;
            enrichedText += `File MIME Type: ${fileData.type || 'text/plain'}\n`;
            enrichedText += `---- ATTACHED FILE CONTENT ----\n`;
            enrichedText += `${fileData.content}\n`;
            enrichedText += `---- END OF FILE CONTENT ----\n\n`;
            enrichedText += rawContents[lastIdx].parts[0].text;
            rawContents[lastIdx].parts[0].text = enrichedText;
          }
        }

        // Sanitize for alternating roles and merge overlapping same-role messages
        const sanitized: any[] = [];
        for (const turn of rawContents) {
          if (sanitized.length === 0) {
            sanitized.push(turn);
          } else {
            const lastTurn = sanitized[sanitized.length - 1];
            if (lastTurn.role === turn.role) {
              lastTurn.parts[0].text = `${lastTurn.parts[0].text}\n\n${turn.parts[0].text}`;
            } else {
              sanitized.push(turn);
            }
          }
        }

        // If context is present, prefix system instruction or first prompt with view context
        if (context && sanitized.length > 0 && sanitized[0].role === 'user') {
          sanitized[0].parts[0].text = `[View Context: ${context}]\n\n${sanitized[0].parts[0].text}`;
        }

        contents = sanitized;
      }

      // Fallback to single prompt if messages are empty or missing
      if (contents.length === 0) {
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
        contents = [{ role: 'user', parts: [{ text: userMessage }] }];
      }

      console.log(`[Gemini Request] Sending multi-turn chat contents of length ${contents.length} with preferred model ${model || 'default'}`);
      const response = await generateContentWithRetryAndFallback(contents, {
        systemInstruction,
        temperature: 0.7,
      }, model, finalCustomKey);

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API error:", error);
      res.status(500).json({ error: error.message || "An error occurred with the AI service" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fs.existsSync(path.join(__dirname, "index.html"))
      ? __dirname
      : path.join(process.cwd(), "dist");
    console.log(`[Production Server] Serving static files from: ${distPath}`);
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
