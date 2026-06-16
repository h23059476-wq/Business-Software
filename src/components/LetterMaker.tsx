import React, { useState } from 'react';
import { 
  Mail, FileText, Send, Sparkles, Download, FileDown, Check, 
  Copy, RefreshCw, PenTool, LayoutTemplate, Briefcase, FileCode, Landmark
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import AccountsSummary from './AccountsSummary.tsx';

interface LetterMakerProps {
  userId: string;
  userDisplayName: string;
}

type ModeType = 'writer' | 'accounts';

interface LetterTemplate {
  id: string;
  name: string;
  subject: string;
  salutation: string;
  body: string;
  closing: string;
}

const TEMPLATES: LetterTemplate[] = [
  {
    id: 'offer',
    name: 'Employment Offer Letter',
    subject: 'Offer of Employment - Senior Software Engineer',
    salutation: 'Dear Candidate,',
    body: `We are pleased to offer you employment in our company as a Senior Software Engineer. We were impressed by your technical depth and believe you will contribute significantly to the WorkSuite AI initiatives.\n\nYour compensation package will include a competitive base salary, wellness support benefits, and performance bonuses. Your planned initiation date is scheduled next Monday.`,
    closing: 'Warm Regards,\n\nHuman Resources Division\nWorkSuite AI Hub'
  },
  {
    id: 'notice',
    name: 'Official Corporate Notice',
    subject: 'Notice regarding system upgrades and server maintenance',
    salutation: 'To All Workspace Staff,',
    body: `Please review this operational announcement regarding the planned migration of our server environments. This Saturday morning at 02:00 AM local time, developers will perform essential software deployments to increase database speeds.\n\nNo active transactions or spreadsheet grids will be accessible during this brief 2-hour window. Please ensure all key documents are saved.`,
    closing: 'Sincerely,\n\nOperations & Security Council\nCloud Services Division'
  },
  {
    id: 'invoice_cover',
    name: 'Invoice Cover Letter',
    subject: 'Pending Professional Services Statement - INV-2026',
    salutation: 'Dear Valued Client,',
    body: `I hope this letter finds you well. I am submitting this prompt notice along with my professional services invoice INV-2026 for completed design sprints and backend configurations.\n\nPlease find the attached statement with broken down lists, departments, and final credits. As per standard guidelines, please execute payment within 14 business days.`,
    closing: 'Kind Credits,\n\nFreelance Engineering Group\nWorkSuite Portals'
  },
  {
    id: 'recommendation',
    name: 'Letter of Recommendation',
    subject: 'Recommendation for Academic / Corporate Placement',
    salutation: 'To Whom It May Concern,',
    body: `It is my distinct pleasure to write this letter of endorsement for our dedicated colleague. During their tenure with WorkSuite AI, they consistently demonstrated outstanding analytic capacities, meticulous attention to structural details, and strong collaborative leadership.\n\nI recommend their services and expertise without hesitation.`,
    closing: 'With Professional Respect,\n\nManaging Director\nWorkSuite AI Technologies'
  }
];

export default function LetterMaker({ userId, userDisplayName }: LetterMakerProps) {
  const [activeTab, setActiveTab] = useState<ModeType>('writer');
  
  // Letter state
  const [selectedTemplate, setSelectedTemplate] = useState<LetterTemplate>(TEMPLATES[0]);
  const [senderName, setSenderName] = useState(userDisplayName || 'Authorized Executive');
  const [recipientName, setRecipientName] = useState('Recipient Name / Organization');
  const [subject, setSubject] = useState(TEMPLATES[0].subject);
  const [salutation, setSalutation] = useState(TEMPLATES[0].salutation);
  const [letterBody, setLetterBody] = useState(TEMPLATES[0].body);
  const [closing, setClosing] = useState(TEMPLATES[0].closing);

  // AI polishing state
  const [polishing, setPolishing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Handle template switch
  const selectTemplate = (tpl: LetterTemplate) => {
    setSelectedTemplate(tpl);
    setSubject(tpl.subject);
    setSalutation(tpl.salutation);
    setLetterBody(tpl.body);
    setClosing(tpl.closing);
  };

  // Generate Formal Letter PDF
  const handleExportLetterPDF = () => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = 210;
      const margin = 20;
      const contentWidth = pageWidth - (margin * 2);

      let y = 30;

      // Corporate letterhead stamp
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(79, 70, 229); // indigo
      doc.text("WORKSUITE CO.", margin, y);
      
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(156, 163, 175);
      doc.text("AI-POWERED OFFICIAL COMMUNICATION", webpageXPosRightAlign(doc, "AI-POWERED OFFICIAL COMMUNICATION", pageWidth - margin), y);
      y += 10;

      // Ruled line helper
      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageWidth - margin, y);
      y += 12;

      // Meta details (Date, Sender, Receiver)
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(75, 85, 99);
      doc.text(`DATE:`, margin, y);
      doc.setFont("Helvetica", "normal");
      doc.text(new Date().toLocaleDateString(), margin + 18, y);
      y += 6;

      doc.setFont("Helvetica", "bold");
      doc.text(`TO:`, margin, y);
      doc.setFont("Helvetica", "normal");
      doc.text(recipientName, margin + 18, y);
      y += 6;

      doc.setFont("Helvetica", "bold");
      doc.text(`FROM:`, margin, y);
      doc.setFont("Helvetica", "normal");
      doc.text(senderName, margin + 18, y);
      y += 12;

      // Subject Block (Capitalized and centered or bold)
      doc.setFillColor(249, 250, 251);
      doc.rect(margin, y, contentWidth, 10, 'F');
      
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(31, 41, 55);
      doc.text(`SUBJECT: ${subject.toUpperCase()}`, margin + 4, y + 6.5);
      y += 18;

      // Salutation
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(55, 65, 81);
      doc.text(salutation, margin, y);
      y += 10;

      // Document Body paragraphs with wrap safety lines
      const bodyLines = doc.splitTextToSize(letterBody, contentWidth);
      bodyLines.forEach((line: string) => {
        if (y > 270) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += 6.5;
      });
      y += 12;

      // Closing remarks
      const closingLines = doc.splitTextToSize(closing, contentWidth);
      closingLines.forEach((line: string) => {
        if (y > 270) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += 6.5;
      });

      doc.save(`letter_${selectedTemplate.id}.pdf`);
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: {
          title: 'Letter Exported',
          message: `Corporate letter generated and downloaded as "letter_${selectedTemplate.id}.pdf".`,
          type: 'info'
        }
      }));
    } catch (err) {
      console.error(err);
    }
  };

  // Right-align helper for text placement
  const webpageXPosRightAlign = (doc: jsPDF, str: string, boundaryX: number) => {
    const stringWidth = doc.getStringUnitWidth(str) * (doc.getFontSize() / doc.internal.scaleFactor);
    return boundaryX - stringWidth;
  };

  // Polish active letter body with AI Assistance
  const handleAiPolish = async () => {
    setPolishing(true);
    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Rewrite this corporate letter body paragraph in highly formal, professional enterprise English. Keep formatting and spacing paragraphs natural. Return ONLY the rewritten body text, with no introductory or greeting comments. Here is the text: "${letterBody}"`,
          context: "letter_polishing"
        })
      });
      const data = await res.json();
      if (data.text) {
        setLetterBody(data.text.trim());
        window.dispatchEvent(new CustomEvent('app-notification', {
          detail: {
            title: 'Letter Polished by AI',
            message: 'Successfully rewrote and polished letter template body with formal business language.',
            type: 'ai'
          }
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPolishing(false);
    }
  };

  // Copy letter content to clipboard
  const handleCopy = () => {
    const fullText = `TO: ${recipientName}\nFROM: ${senderName}\nDATE: ${new Date().toLocaleDateString()}\n\nSUBJECT: ${subject}\n\n${salutation}\n\n${letterBody}\n\n${closing}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-full flex-col bg-slate-50/50 dark:bg-slate-950/40 text-slate-800 dark:text-slate-100" id="letter-maker-viewport">
      {/* Tab Switcher Headers */}
      <div className="px-4 sm:px-8 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row justify-between sm:items-center shrink-0 py-2 sm:py-0 gap-3">
        <div className="flex gap-4 sm:gap-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab('writer')}
            className={`py-3 sm:py-4 text-xs font-bold uppercase tracking-wider relative border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'writer' 
                ? 'border-indigo-600 text-indigo-700 dark:text-indigo-400 font-extrabold' 
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              <span>Official Letter Maker</span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('accounts')}
            className={`py-3 sm:py-4 text-xs font-bold uppercase tracking-wider relative border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'accounts' 
                ? 'border-indigo-600 text-indigo-700 dark:text-indigo-400 font-extrabold' 
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4" />
              <span>Accounts Summary Logs</span>
            </div>
          </button>
        </div>

        <div className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded px-2.5 py-1 font-mono font-bold self-end sm:self-auto hidden xs:block">
          Workspace Hub v3.2
        </div>
      </div>

      {/* Main Panel views scrollable */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 scrollbar">
        {activeTab === 'accounts' ? (
          <AccountsSummary userId={userId} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-7xl mx-auto items-start">
            
            {/* Column A: Letter Parameters & Templates */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              {/* Preset template selector */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3.5 flex items-center gap-1">
                  <LayoutTemplate className="h-3.5 w-3.5" />
                  <span>Choose Corporate Letter Template</span>
                </h4>
                
                <div className="grid grid-cols-1 gap-2">
                  {TEMPLATES.map(tpl => (
                    <button
                      key={tpl.id}
                      onClick={() => selectTemplate(tpl)}
                      className={`w-full text-left px-3.5 py-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                        selectedTemplate.id === tpl.id 
                          ? 'border-indigo-500 dark:border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-805 dark:text-indigo-300 font-bold font-black' 
                          : 'border-slate-150 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {tpl.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Variables Form inputs */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-4">
                <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <PenTool className="h-3.5 w-3.5" />
                  <span>Configure Metadata Variables</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Sender Name</label>
                    <input
                      type="text"
                      value={senderName}
                      onChange={e => setSenderName(e.target.value)}
                      className="w-full text-xs border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 bg-slate-50/50 dark:bg-slate-950/50 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Recipient Name</label>
                    <input
                      type="text"
                      value={recipientName}
                      onChange={e => setRecipientName(e.target.value)}
                      className="w-full text-xs border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 bg-slate-50/50 dark:bg-slate-950/50 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Subject Line</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    className="w-full text-xs border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 bg-slate-50/50 dark:bg-slate-950/50 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Salutation greeting</label>
                  <input
                    type="text"
                    value={salutation}
                    onChange={e => setSalutation(e.target.value)}
                    className="w-full text-xs border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 bg-slate-50/50 dark:bg-slate-950/50 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Formal Signoff Closing</label>
                  <textarea
                    rows={2}
                    value={closing}
                    onChange={e => setClosing(e.target.value)}
                    className="w-full text-xs border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 bg-slate-50/50 dark:bg-slate-950/50 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Column B: Professional Live Slate Editor Preview */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg overflow-hidden min-h-[500px] flex flex-col">
                {/* Header operations toolbar */}
                <div className="px-6 py-3 border-b border-slate-150 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between flex-wrap gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Official Letter Slate</span>
                  
                  <div className="flex items-center gap-2">
                    {/* AI Polish */}
                    <button
                      onClick={handleAiPolish}
                      disabled={polishing}
                      className="p-1 px-3 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                      title="Rewrite letter content via Gemini AI"
                    >
                      {polishing ? (
                        <RefreshCw className="h-3 w-3 animate-spin text-violet-700 dark:text-violet-300" />
                      ) : (
                        <Sparkles className="h-3 w-3 text-violet-600 dark:text-violet-400" />
                      )}
                      <span>AI Polish Content</span>
                    </button>

                    {/* Copy Full Letter text */}
                    <button
                      onClick={handleCopy}
                      className="p-1 px-3 bg-slate-100/80 dark:bg-slate-800/85 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span>{copied ? 'Copied!' : 'Copy'}</span>
                    </button>

                    {/* Export PDF */}
                    <button
                      onClick={handleExportLetterPDF}
                      className="p-1.5 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 rounded-lg font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                    >
                      <FileDown className="h-4 w-4" />
                      <span>Export PDF</span>
                    </button>
                  </div>
                </div>

                {/* Simulated professional legal page layout */}
                <div className="flex-1 bg-white dark:bg-slate-950 p-4 sm:p-8 md:p-12 font-sans flex flex-col transition-colors duration-200">
                  {/* Fake letter header logo */}
                  <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-4 mb-6">
                    <div>
                      <h4 className="font-extrabold text-slate-800 dark:text-slate-100 tracking-wider text-sm uppercase">WORKSUITE CORPORATIONS</h4>
                      <p className="text-[9px] text-indigo-600 dark:text-indigo-400 font-extrabold font-mono">Durable Cloud Productivity Suite</p>
                    </div>
                    <div className="text-right text-[9px] text-slate-400 dark:text-slate-500 font-medium">
                      <p>Corporate Office Sector 18</p>
                      <p>Suite 100A, Portal Tower</p>
                    </div>
                  </div>

                  {/* Letter details */}
                  <div className="space-y-1 mb-6 text-xs text-slate-500 dark:text-slate-400">
                    <p><span className="font-bold text-slate-600 dark:text-slate-300">DATE:</span> {new Date().toLocaleDateString()}</p>
                    <p><span className="font-bold text-slate-600 dark:text-slate-300">TO:</span> {recipientName}</p>
                    <p><span className="font-bold text-slate-600 dark:text-slate-300">FROM:</span> {senderName}</p>
                  </div>

                  {/* Subject line header block */}
                  <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded border border-slate-100/60 dark:border-slate-800 font-semibold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-tight mb-6">
                    SUBJECT: {subject}
                  </div>

                  {/* Salutation Greeting block */}
                  <div className="text-xs text-slate-800 dark:text-slate-350 font-bold mb-3">
                    {salutation}
                  </div>

                  {/* Letter Body editing region */}
                  <textarea
                    rows={12}
                    value={letterBody}
                    onChange={e => setLetterBody(e.target.value)}
                    className="flex-1 text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-[#fafbfc]/30 dark:bg-slate-900/40 focus:bg-white dark:focus:bg-slate-900 border-0 rounded-lg p-2 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Type or generate the letter content here..."
                  />

                  {/* Closing signature */}
                  <div className="mt-8 border-t border-slate-100 dark:border-slate-800 pt-4 text-xs text-slate-600 dark:text-slate-450 font-medium font-sans whitespace-pre-wrap">
                    {closing}
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
