import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

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
  const PORT = 3000;

  app.use(express.json());

  // API Route for AI Assistant
  app.post("/api/ai/assistant", async (req, res) => {
    try {
      const { prompt, context, persona } = req.body;
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
When generating mock data or layouts, always structure them as beautifully aligned markdown tables or CSV blocks.
Keep explanations of formulas crisp, structured, and mathematical.`;
      } else if (persona === 'accounting') {
        systemInstruction = `You are the WorkSuite Financial Accounting and billing Copilot. 
Your specialized expertise is cash transaction logs, ledger deposit and debit balance accounts, expense tracking lists, drafting professional client billing descriptions, invoice item arrays, and polite but assertive payment reminders.
Use clear lists of line items, precise descriptions, and structured double-entry ledger summaries. 
Your tone should be authoritative, clear, and highly organized regarding transaction recording.`;
      }

      const userMessage = context ? `Context of current tool: ${context}\n\nUser request: ${prompt}` : prompt;

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
