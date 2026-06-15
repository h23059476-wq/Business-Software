import { jsPDF } from 'jspdf';

export function generateGuidePDF(): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 20;
  const contentWidth = pageWidth - (margin * 2);

  // Helper to draw a top banner decorative element on pages
  const drawPageDecorations = (pageNumber: number, totalPages: number) => {
    // Top border colored bar
    doc.setFillColor(79, 70, 229); // indigo-600
    doc.rect(0, 0, pageWidth, 4, 'F');

    // Logo mark in corner
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175); // gray-400
    doc.text("WORKSUITE // STATIONS", margin, 12);

    // Footer lines
    doc.setDrawColor(243, 244, 246); // gray-100
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text("WorkSuite Official Handbook & Resource Guide", margin, pageHeight - 10);
    doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: "right" });
  };

  // ==================== PAGE 1: TITLE & EXECUTIVE SUMMARY ====================
  // Add first page decorations
  drawPageDecorations(1, 2);

  let y = 35;

  // Title section
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(30, 27, 75); // very dark indigo
  doc.text("WORKSUITE", margin, y);
  y += 10;

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(79, 70, 229); // Indigo 600
  doc.text("THE INTELLIGENT PRODUCTIVITY PORTAL", margin, y);
  y += 12;

  // Horizontal line separating header
  doc.setDrawColor(229, 231, 235); // gray-200
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);
  y += 12;

  // Executive summary
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39); // deep black/slate
  doc.text("EXECUTIVE PORTAL OVERVIEW", margin, y);
  y += 7;

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(55, 65, 81); // gray-700
  const summaryParagraph = 
    "WorkSuite is an advanced, highly modular desktop workstation engineered for modern professionals demanding peak document compilation, financial ledger management, high-impact letters, and structured data analysis. Built on an offline-resilient, local Sandbox architecture with native Firebase cloud sync options, WorkSuite offers secure and instant operations suited for any workflow tier.";
  const summaryLines = doc.splitTextToSize(summaryParagraph, contentWidth);
  summaryLines.forEach((line: string) => {
    doc.text(line, margin, y);
    y += 6;
  });
  y += 4;

  // Visual feature grid box
  doc.setFillColor(249, 250, 251); // gray-50
  doc.setDrawColor(229, 231, 235); // gray-200
  doc.setLineWidth(0.3);
  doc.rect(margin, y, contentWidth, 42, 'FD');

  let boxY = y + 7;
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 27, 75);
  doc.text("CORE ARCHITECTURAL STRENGTHS //", margin + 6, boxY);
  boxY += 6;

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(75, 85, 99); // gray-600

  doc.text("• Dual-Auth Paradigm:", margin + 8, boxY);
  doc.setFont("Helvetica", "bold");
  doc.text("Connect clouds using Firebase SSO or work isolated inside safe local sandboxes.", margin + 43, boxY);
  boxY += 5;

  doc.setFont("Helvetica", "normal");
  doc.text("• Contextual AI Engine:", margin + 8, boxY);
  doc.setFont("Helvetica", "bold");
  doc.text("Double click content in any module to pull text instantly into your active AI side-panel.", margin + 43, boxY);
  boxY += 5;

  doc.setFont("Helvetica", "normal");
  doc.text("• Sharp Vector Printers:", margin + 8, boxY);
  doc.setFont("Helvetica", "bold");
  doc.text("Immediate local compilation yields infinitely scalable, razor-sharp PDF sheets.", margin + 43, boxY);
  boxY += 5;

  doc.setFont("Helvetica", "normal");
  doc.text("• Secure Local Cache:", margin + 8, boxY);
  doc.setFont("Helvetica", "bold");
  doc.text("Never lose progress. Automatic local state replication prevents layout timeouts.", margin + 43, boxY);
  
  y += 50;

  // Core navigation highlights
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39);
  doc.text("STATION NAVIGATION INDEX", margin, y);
  y += 7;

  // Let's create an elegant mini index table with borders
  const stations = [
    { name: "Letter Center", purpose: "Draft and export custom professional letters and cover page kits." },
    { name: "Word Processor", purpose: "Format textual documents with smart character stats and AI writing prompts." },
    { name: "List Grid", purpose: "Organize cells, evaluate formulas, and structure data securely." },
    { name: "Ledger Note", purpose: "Maintain custom credit/debit transaction books with dual balance columns." },
    { name: "Invoice Maker", purpose: "Design itemized billings with adjustable tax and instant previews." }
  ];

  stations.forEach((station) => {
    // Name
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(79, 70, 229); // Indigo 600
    doc.text(station.name, margin, y);

    // Purpose description
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(55, 65, 81);
    doc.text(station.purpose, margin + 40, y);
    y += 8;
  });


  // ==================== PAGE 2: DETAILED MODULE GUIDE ====================
  doc.addPage();
  drawPageDecorations(2, 2);

  y = 30;

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(30, 27, 75);
  doc.text("DETAILED RUNTIME WALKTHROUGH", margin, y);
  y += 10;

  // 1. Double Entry Ledger Ledger (Ledger Note)
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(17, 24, 39);
  doc.text("1. TRANSACTION LEDGERING & DOUBLE-ENTRY LOGIC", margin, y);
  y += 5;

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(75, 85, 99);
  const ledgerPara = "The Ledger Note module models formal bookkeeping standards. All items entered require categorization under credit (incoming deposit) or debit (outgoing payments). The ledger system dynamically aggregates live credit sums and debit sums, reporting back an honest balance sheet difference to keep business books aligned.";
  const ledgerLines = doc.splitTextToSize(ledgerPara, contentWidth);
  ledgerLines.forEach((line: string) => {
    doc.text(line, margin, y);
    y += 5;
  });
  y += 6;

  // 2. Client Invoicing (Invoice Maker)
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(17, 24, 39);
  doc.text("2. COMPLYING INVOICING METADATA SCHEMA", margin, y);
  y += 5;

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(75, 85, 99);
  const invoicePara = "Each invoice represents standard B2B transaction configurations. Customize payment due frames, issue dates, and unique tax calculations. Individual line items compile live row percentages and global totals. High-touch actions like instant PDF pre-compilation allow auditing before printing.";
  const invoiceLines = doc.splitTextToSize(invoicePara, contentWidth);
  invoiceLines.forEach((line: string) => {
    doc.text(line, margin, y);
    y += 5;
  });
  y += 6;

  // 3. Command Palette Commands
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(17, 24, 39);
  doc.text("3. INTEGRATED COMMAND PALETTE DICTIONARY (Ctrl+K / Cmd+K)", margin, y);
  y += 5;

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(75, 85, 99);
  const palettePara = "Access search queries universally across WorkSuite. Press (Command/Control + K) from any active screen to initiate search. The palette indexes recent doc names, active invoice recipient titles, client letter leads, and credit classifications. Clicking any result automatically shifts focus to that precise record, accelerating complex office workflows.";
  const paletteLines = doc.splitTextToSize(palettePara, contentWidth);
  paletteLines.forEach((line: string) => {
    doc.text(line, margin, y);
    y += 5;
  });
  y += 10;

  // Keyboard shortcut table inside page 2
  doc.setFillColor(243, 244, 246); // clean light grey background
  doc.rect(margin, y, contentWidth, 34, 'F');

  let tableY = y + 6;
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30, 27, 75);
  doc.text("KEYBOARD SHORTCUT DICTIONARY", margin + 6, tableY);
  tableY += 6;

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(55, 65, 81);

  // Shortcut rows
  doc.setFont("Helvetica", "bold");
  doc.text("Cmd/Ctrl + K", margin + 8, tableY);
  doc.setFont("Helvetica", "normal");
  doc.text("Toggle Master Unified Search Command Palette", margin + 40, tableY);
  tableY += 5;

  doc.setFont("Helvetica", "bold");
  doc.text("Double-Click Text", margin + 8, tableY);
  doc.setFont("Helvetica", "normal");
  doc.text("Select text and auto-import into context-aware AI panel side buffer", margin + 40, tableY);
  tableY += 5;

  doc.setFont("Helvetica", "bold");
  doc.text("Alt + Arrow Down", margin + 8, tableY);
  doc.setFont("Helvetica", "normal");
  doc.text("Cycle active document tabs inside split view workstation", margin + 40, tableY);
  tableY += 5;

  doc.setFont("Helvetica", "bold");
  doc.text("Ctrl + S", margin + 8, tableY);
  doc.setFont("Helvetica", "normal");
  doc.text("Triggers instantaneous client-side persistence replica updates", margin + 40, tableY);

  y += 45;

  // Closing Signoff
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(79, 70, 229);
  doc.text("READY FOR EXPORT //", margin, y);
  y += 5;

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(156, 163, 175);
  doc.text("Compile time stamps and signatures automatically generated. Press 'Finalize Export' to download standard file locally.", margin, y);

  return doc;
}
