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

async function startServer() {
  const app = express();
  const PORT = 5000;

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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
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
