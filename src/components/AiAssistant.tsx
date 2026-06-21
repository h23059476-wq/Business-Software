import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Sparkles, Loader2, Copy, Check, MessageSquare, 
  Trash2, FileText, Grid, Receipt, RefreshCw, CloudLightning, CloudCheck,
  Paperclip, X, FileUp
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { queryAI, isLocalAiActive, getLocalModelId } from '../lib/aiService.ts';
import { 
  db, handleFirestoreError, OperationType,
  collection, query, where, getDocs, setDoc, doc, onSnapshot 
} from '../lib/firebase.ts';

interface AttachedFile {
  name: string;
  type: string;
  content: string;
  size: number;
}

interface AiAssistantProps {
  activeContext: string; // 'dashboard' | 'documents' | 'spreadsheet' | 'notes' | 'invoices' | 'settings'
  onSuggestionAdopt?: (text: string) => void;
  userId?: string;
}

type PersonaType = 'universal' | 'writer' | 'analyst' | 'accounting';

export default function AiAssistant({ activeContext, onSuggestionAdopt, userId }: AiAssistantProps) {
  const [prompt, setPrompt] = useState('');
  const [persona, setPersona] = useState<PersonaType>('universal');
  const [docId, setDocId] = useState<string | null>(null);
  const [dbSync, setDbSync] = useState<'connected' | 'offline' | 'loading'>('offline');
  const [aiEngine, setAiEngine] = useState<'gemini-3.5-flash' | 'gemini-3.1-pro-preview' | 'gemini-3.1-flash-lite'>('gemini-3.5-flash');
  
  // Local WebGPU loading tracking state
  const [localProgressText, setLocalProgressText] = useState<string | null>(null);
  const [localProgressPercent, setLocalProgressPercent] = useState<number>(0);
  const [localActive, setLocalActive] = useState(false);

  const handleSendRef = useRef<any>(null);

  // Sync mode states
  useEffect(() => {
    setLocalActive(isLocalAiActive());
    
    const handleModeChange = () => {
      setLocalActive(isLocalAiActive());
    };
    
    const handlePromptSuggest = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && typeof customEvent.detail.text === 'string') {
        const text = customEvent.detail.text;
        setPrompt(text);
        if (customEvent.detail.autoSubmit && handleSendRef.current) {
          setTimeout(() => {
            handleSendRef.current(undefined, text);
            setPrompt(''); // clear input prompt once active
          }, 150);
        }
      }
    };
    
    window.addEventListener('ai-mode-changed', handleModeChange);
    window.addEventListener('ai-model-swapped', handleModeChange);
    window.addEventListener('ai-prompt-suggest', handlePromptSuggest);
    
    return () => {
      window.removeEventListener('ai-mode-changed', handleModeChange);
      window.removeEventListener('ai-model-swapped', handleModeChange);
      window.removeEventListener('ai-prompt-suggest', handlePromptSuggest);
    };
  }, []);
  
  // File upload state & handlers
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Create system initial message
  const getInitialMessage = (currentPersona: PersonaType) => {
    const personaNames = {
      universal: 'Universal Copilot',
      writer: 'Professional Copywriter & Editor',
      analyst: 'Data Grid Analyst',
      accounting: 'Accounting & billing Copilot'
    };

    const personaContexts = {
      universal: `- Help summarize details, write outlines, or general planning.\n- Address any cross-desk questions or formatting instructions.`,
      writer: `- Draft professional proposals, business newsletters, or emails.\n- Correct sentence structure, fix grammar, or enhance tone.`,
      analyst: `- Construct clean spreadsheet layouts, CSV rows, or data blocks.\n- Explain formulas like SUM, SUMIF, VLOOKUP, or standard grids.`,
      accounting: `- Craft transaction descriptions, debit/deposit entries, and ledger tables.\n- Write invoice bullet points or polite invoice payment reminders.`
    };

    return {
      role: 'assistant' as const,
      content: `Hello! I am your WorkSuite **${personaNames[currentPersona]}**.\n\nI am specialized in this view mode: \n${personaContexts[currentPersona]}\n\nHow can I help you accelerate your work today?`
    };
  };

  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    getInitialMessage('universal')
  ]);
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Auto-switch persona based on active context
  useEffect(() => {
    let targetPersona: PersonaType = 'universal';
    if (activeContext === 'documents' || activeContext === 'document') {
      targetPersona = 'writer';
    } else if (activeContext === 'spreadsheet') {
      targetPersona = 'analyst';
    } else if (activeContext === 'notes' || activeContext === 'invoices') {
      targetPersona = 'accounting';
    }
    setPersona(targetPersona);
  }, [activeContext]);

  // Load chat history from Firestore if user is present
  useEffect(() => {
    if (!userId) {
      setDbSync('offline');
      // Reset message list to the initial state corresponding to current persona
      setMessages([getInitialMessage(persona)]);
      return;
    }

    setDbSync('loading');
    console.log('AiAssistant loading chat history, db:', db, 'userId:', userId);
    if (!db) {
      console.error('AiAssistant: db is undefined or not loaded!');
      setDbSync('offline');
      setMessages([getInitialMessage(persona)]);
      return;
    }
    
    const q = query(
      collection(db, 'ai_chats'),
      where('userId', '==', userId),
      where('context', '==', activeContext)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        const data = docSnap.data();
        setDocId(docSnap.id);
        if (data.messages) {
          try {
            setMessages(JSON.parse(data.messages));
          } catch (e) {
            console.error("Failed to parse chat messages JSON from Firestore:", e);
          }
        }
        setDbSync('connected');
      } else {
        setDocId(null);
        setMessages([getInitialMessage(persona)]);
        setDbSync('connected');
      }
    }, (err) => {
      console.error("Failed to load persistent conversation history:", err);
      setDbSync('offline');
      setMessages([getInitialMessage(persona)]);
      try {
        handleFirestoreError(err, OperationType.LIST, 'ai_chats');
      } catch (_) {
        // Keep it non-blocking for user preview experience but log it fully
      }
    });

    return () => unsubscribe();
  }, [userId, activeContext, persona]);

  // Scroll to bottom on updates
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Save chat state to Firestore
  const saveChatHistory = async (newMessages: typeof messages) => {
    if (!userId) return;
    const currentDocId = docId || `chat_${userId}_${activeContext}`;
    try {
      const serialMessages = JSON.stringify(newMessages);
      const nowIso = new Date().toISOString();

      await setDoc(doc(db, 'ai_chats', currentDocId), {
        id: currentDocId,
        userId,
        messages: serialMessages,
        context: activeContext,
        createdAt: nowIso,
        updatedAt: nowIso
      });
      
      if (!docId) {
        setDocId(currentDocId);
      }
      setDbSync('connected');
    } catch (err) {
      console.error("Failed to cache conversation logs to Firestore:", err);
      setDbSync('offline');
      try {
        handleFirestoreError(err, OperationType.WRITE, `ai_chats/${currentDocId}`);
      } catch (_) {
        // Keep it non-blocking
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setAttachedFile({
        name: file.name,
        type: file.type || 'text/plain',
        content,
        size: file.size
      });
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: {
          title: 'Device File Loaded',
          message: `${file.name} successfully imported. Ask Gemini to parse it!`,
          type: 'success'
        }
      }));
    };
    reader.onerror = () => {
      alert("Failed to read selection from device.");
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input selection
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setAttachedFile({
          name: file.name,
          type: file.type || 'text/plain',
          content,
          size: file.size
        });
        window.dispatchEvent(new CustomEvent('app-notification', {
          detail: {
            title: 'Device Data Dropped',
            message: `${file.name} successfully pre-parsed as AI input context.`,
            type: 'success'
          }
        }));
      };
      reader.onerror = () => {
        alert("Failed to read dropped file.");
      };
      reader.readAsText(file);
    }
  };

  const handleSend = async (e?: React.FormEvent, customUserPrompt?: string) => {
    if (e) e.preventDefault();
    const promptToSend = customUserPrompt || prompt;
    if (!promptToSend.trim() && !attachedFile) return;

    // Reset prompt if it is standard input
    if (!customUserPrompt) {
      setPrompt('');
    }

    const fileDetailsText = attachedFile ? `\n\n[Imported Device File: ${attachedFile.name} (${Math.round(attachedFile.size / 1024 * 10) / 10} KB)]` : '';
    const finalPrompt = promptToSend.trim() || `Analyze the imported file data: ${attachedFile?.name}`;
    const nextMessages = [...messages, { role: 'user' as const, content: `${finalPrompt}${fileDetailsText}` }];
    setMessages(nextMessages);
    setLoading(true);

    const filePayload = attachedFile ? { ...attachedFile } : undefined;
    setAttachedFile(null); // Clear active attachment state

    // Save user's question first
    await saveChatHistory(nextMessages);
    
    setLocalProgressText(null);
    setLocalProgressPercent(0);

    try {
      const aiReply = await queryAI({
        prompt: finalPrompt,
        context: `Current active view is: ${activeContext}.`,
        persona: persona,
        messages: nextMessages,
        model: aiEngine,
        onLocalProgress: (progress) => {
          setLocalProgressText(progress.text);
          setLocalProgressPercent(Math.floor(progress.progress * 100));
        }
      });

      // Clear local download loading state once completed
      setLocalProgressText(null);

      const updatedMessages = [...nextMessages, { role: 'assistant' as const, content: aiReply }];
      
      setMessages(updatedMessages);
      await saveChatHistory(updatedMessages);

      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: {
          title: 'AI Companion Replied',
          message: aiReply.length > 80 ? `${aiReply.substring(0, 80)}...` : aiReply,
          type: 'ai'
        }
      }));
    } catch (err: any) {
      setLocalProgressText(null);
      const errorMsg = `⚠️ Error occurred: ${err.message || 'Failed to reach AI Backend'}`;
      const updatedMessages = [...nextMessages, { role: 'assistant' as const, content: errorMsg }];
      setMessages(updatedMessages);
    } finally {
      setLoading(false);
    }
  };

  // Keep handleSend ref synchronized on every render to avoid stale closures
  useEffect(() => {
    handleSendRef.current = handleSend;
  });

  const handleResetChat = async () => {
    if (loading) return;
    if (window.confirm("Do you want to reset your continuous memory for this view?")) {
      const resetState = [getInitialMessage(persona)];
      setMessages(resetState);
      await saveChatHistory(resetState);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const quickPrompts = {
    universal: [
      "Summarize my active task goals",
      "Draft a daily office agenda list",
      "Suggest a structured routine blueprint"
    ],
    writer: [
      "Draft a formal client resignation letter",
      "Write a persuasive project proposal",
      "Polish grammar and style of simple drafts"
    ],
    analyst: [
      "Generate monthly sale matrices tables",
      "Explain standard VLOOKUP formulas",
      "Outline formatted budget spreadsheet cells"
    ],
    accounting: [
      "Draft a deposit transaction item line",
      "Create client consulting descriptions",
      "Polite but clear late payment reminder"
    ]
  }[persona];

  const getPersonaTheme = () => {
    switch (persona) {
      case 'writer':
        return {
          bg: 'bg-violet-950',
          text: 'text-violet-400',
          accent: 'bg-violet-600',
          hover: 'hover:bg-violet-900',
          border: 'border-violet-900/40',
          glow: 'bg-violet-400/80',
          tabActive: 'bg-violet-600 border-violet-500 text-white'
        };
      case 'analyst':
        return {
          bg: 'bg-emerald-950',
          text: 'text-emerald-400',
          accent: 'bg-emerald-600',
          hover: 'hover:bg-emerald-900',
          border: 'border-emerald-900/40',
          glow: 'bg-emerald-400/80',
          tabActive: 'bg-emerald-600 border-emerald-500 text-white'
        };
      case 'accounting':
        return {
          bg: 'bg-amber-950',
          text: 'text-amber-400',
          accent: 'bg-amber-600',
          hover: 'hover:bg-amber-900',
          border: 'border-amber-900/40',
          glow: 'bg-amber-400/80',
          tabActive: 'bg-amber-600 border-amber-500 text-white'
        };
      default:
        return {
          bg: 'bg-indigo-950',
          text: 'text-indigo-400',
          accent: 'bg-indigo-600',
          hover: 'hover:bg-indigo-900',
          border: 'border-indigo-900/40',
          glow: 'bg-indigo-400/80',
          tabActive: 'bg-indigo-600 border-indigo-500 text-white'
        };
    }
  };

  const themeColors = getPersonaTheme();

  return (
    <div 
      className={`flex flex-col h-full ${themeColors.bg} text-white transition-colors duration-300 relative`} 
      id="ai-assistant-container"
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
    >
      {dragActive && (
        <div className="absolute inset-0 bg-slate-950/90 z-50 flex flex-col items-center justify-center border-4 border-dashed border-indigo-500 rounded-lg p-6 text-center animate-fade-in pointer-events-none">
          <FileUp className="h-12 w-12 text-indigo-400 animate-bounce mb-3" />
          <p className="text-sm font-bold text-indigo-200">Drop Your Device File Here</p>
          <p className="text-xs text-indigo-400 mt-1">Automatically parsing CSV records, JSON tables, logs & reports</p>
        </div>
      )}

      {/* Header Panel */}
      <div className={`flex items-center justify-between p-4 border-b ${themeColors.border} ${themeColors.bg} shrink-0`}>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <span className={`block w-2.5 h-2.5 rounded-full ${themeColors.glow} animate-ping absolute top-0.5 left-0.5`} />
            <span className={`block w-2.5 h-2.5 rounded-full ${themeColors.glow} relative z-10`} />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-indigo-200">WorkSuite AI</h3>
            <div className="flex items-center gap-1 mt-0.5">
              <p className="text-[10px] text-indigo-400">
                {localActive ? 'Local WebGPU Offline' : 'Gemini 3.5 Assistant'}
              </p>
              <span className="text-[9px] text-indigo-500 font-bold">•</span>
              {dbSync === 'connected' ? (
                <div className="flex items-center gap-0.5 text-[9px] text-emerald-400 inline-flex" title="Firestore Connection Active">
                  <span>Sync On</span>
                </div>
              ) : dbSync === 'loading' ? (
                <Loader2 className="h-2 w-2 animate-spin text-indigo-400" />
              ) : (
                <div className="flex items-center gap-0.5 text-[9px] text-indigo-400/80 inline-flex" title="Running in standalone browser state">
                  <span>Sandbox Only</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Reset Chat Button */}
        <button 
          onClick={handleResetChat}
          title="Clear Conversation History"
          className="p-1.5 hover:bg-indigo-900/40 hover:text-white rounded-lg transition text-indigo-400 cursor-pointer"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Local progress bar banner for file weights loading */}
      {localProgressText && (
        <div className="mx-4 my-2.5 p-3.5 rounded-xl bg-slate-900/40 border border-indigo-500/20 text-xs text-white space-y-2 animate-pulse">
          <div className="flex items-center justify-between text-[11px] font-bold tracking-tight text-indigo-200 uppercase">
            <span>{localProgressText}</span>
            <span>{localProgressPercent}%</span>
          </div>
          <div className="w-full bg-slate-950/40 rounded-full h-1.5 overflow-hidden border border-slate-900">
            <div 
              className="bg-indigo-500 h-full rounded-full transition-all duration-300" 
              style={{ width: `${localProgressPercent}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Persona Tabs / Mode Selector */}
      <div className={`px-4 py-2 bg-indigo-950/40 border-b ${themeColors.border} shrink-0 flex flex-col gap-1.5 select-none`}>
        <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Select Expert Persona</p>
        <div className="grid grid-cols-4 gap-1">
          {/* Universal Component */}
          <button
            onClick={() => setPersona('universal')}
            className={`py-1.5 px-0.5 rounded-lg border text-[10px] font-extrabold flex flex-col items-center gap-1 transition ${
              persona === 'universal' 
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md' 
                : 'bg-indigo-900/20 border-indigo-900/40 text-indigo-300 hover:bg-indigo-900/50 hover:text-white'
            }`}
            title="General AI Assistant"
          >
            <Sparkles className="h-3 w-3" />
            <span className="text-[9px]">General</span>
          </button>

          {/* Writer Component */}
          <button
            onClick={() => setPersona('writer')}
            className={`py-1.5 px-0.5 rounded-lg border text-[10px] font-extrabold flex flex-col items-center gap-1 transition ${
              persona === 'writer' 
                ? 'bg-violet-600 border-violet-500 text-white shadow-md' 
                : 'bg-indigo-900/20 border-indigo-900/40 text-indigo-300 hover:bg-indigo-900/50 hover:text-white'
            }`}
            title="Copywriter Editor Persona"
          >
            <FileText className="h-3 w-3" />
            <span className="text-[9px]">Writer</span>
          </button>

          {/* Data Analyst component */}
          <button
            onClick={() => setPersona('analyst')}
            className={`py-1.5 px-0.5 rounded-lg border text-[10px] font-extrabold flex flex-col items-center gap-1 transition ${
              persona === 'analyst' 
                ? 'bg-emerald-600 border-emerald-500 text-white shadow-md' 
                : 'bg-indigo-900/20 border-indigo-900/40 text-indigo-300 hover:bg-indigo-900/50 hover:text-white'
            }`}
            title="Excel Data & Formulas analyst"
          >
            <Grid className="h-3 w-3" />
            <span className="text-[9px]">Analyst</span>
          </button>

          {/* Cash accounting components */}
          <button
            onClick={() => setPersona('accounting')}
            className={`py-1.5 px-0.5 rounded-lg border text-[10px] font-extrabold flex flex-col items-center gap-1 transition ${
              persona === 'accounting' 
                ? 'bg-amber-600 border-amber-500 text-white shadow-md' 
                : 'bg-indigo-900/20 border-indigo-900/40 text-indigo-300 hover:bg-indigo-900/50 hover:text-white'
            }`}
            title="Ledger accounting & billing support"
          >
            <Receipt className="h-3 w-3" />
            <span className="text-[9px]">Finance</span>
          </button>
        </div>

        {/* Gemini Intelligence Engine Selector */}
        <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mt-2 flex items-center gap-1">
          <Sparkles className="h-2.5 w-2.5 text-indigo-300 shrink-0" />
          <span>Gemini Brain Intelligence</span>
        </p>
        <div className="grid grid-cols-3 gap-1">
          <button
            type="button"
            onClick={() => setAiEngine('gemini-3.5-flash')}
            className={`py-1 pb-1.5 px-0.5 rounded-lg border text-[10px] font-extrabold flex flex-col items-center justify-center gap-0.5 transition ${
              aiEngine === 'gemini-3.5-flash' 
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md' 
                : 'bg-indigo-900/20 border-indigo-900/40 text-indigo-300 hover:bg-indigo-900/50 hover:text-white'
            }`}
            title="General Tasks, summaries, & standard queries (Gemini 3.5 Flash)"
          >
            <span className="text-[9px] font-black leading-none">Flash</span>
            <span className="text-[7.5px] text-indigo-300 font-bold leading-none mt-0.5">General</span>
          </button>

          <button
            type="button"
            onClick={() => setAiEngine('gemini-3.1-pro-preview')}
            className={`py-1 pb-1.5 px-0.5 rounded-lg border text-[10px] font-extrabold flex flex-col items-center justify-center gap-0.5 transition ${
              aiEngine === 'gemini-3.1-pro-preview' 
                ? 'bg-rose-600 border-rose-500 text-white shadow-md' 
                : 'bg-indigo-900/20 border-indigo-900/40 text-indigo-300 hover:bg-indigo-900/50 hover:text-white'
            }`}
            title="Deep reasoning, complex mathematical checks, spreadsheets analyzer, & long text drafts (Gemini 3.1 Pro)"
          >
            <span className="text-[9px] font-black leading-none">Pro Brain</span>
            <span className="text-[7.5px] text-indigo-300 font-bold leading-none mt-0.5">Pro Logic</span>
          </button>

          <button
            type="button"
            onClick={() => setAiEngine('gemini-3.1-flash-lite')}
            className={`py-1 pb-1.5 px-0.5 rounded-lg border text-[10px] font-extrabold flex flex-col items-center justify-center gap-0.5 transition ${
              aiEngine === 'gemini-3.1-flash-lite' 
                ? 'bg-emerald-600 border-emerald-500 text-white shadow-md' 
                : 'bg-indigo-900/20 border-indigo-900/40 text-indigo-300 hover:bg-indigo-900/50 hover:text-white'
            }`}
            title="Express Speed responses for quick grammar checks & brief inputs (Gemini 3.1 Flash Lite)"
          >
            <span className="text-[9px] font-black leading-none">Express</span>
            <span className="text-[7.5px] text-indigo-300 font-bold leading-none mt-0.5">Lite Speed</span>
          </button>
        </div>
      </div>

      {/* Messages Window Scroll */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs scrollbar bg-indigo-950/90">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex flex-col max-w-[85%] ${
              msg.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
            }`}
          >
            <span className="text-[9px] text-indigo-400/80 mb-1 font-mono uppercase tracking-wider">
              {msg.role === 'user' ? 'You' : 'AI Companion'}
            </span>
            <div
              className={`p-3.5 rounded-2xl ${
                msg.role === 'user'
                  ? 'bg-indigo-800 text-white rounded-tr-none border border-indigo-700/60'
                  : 'bg-indigo-900/40 text-indigo-100 rounded-tl-none border border-indigo-800/40'
              }`}
            >
              {msg.role === 'user' ? (
                <p className="whitespace-pre-wrap leading-relaxed font-sans">{msg.content}</p>
              ) : (
                <div className="prose prose-sm prose-invert max-w-none text-indigo-100 font-sans leading-relaxed">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>

            {/* Bubble Actions bar */}
            {msg.role === 'assistant' && (
              <div className="flex items-center gap-2.5 mt-1.5 pl-1.5 text-[10px] text-indigo-400 font-medium">
                <button
                  onClick={() => copyToClipboard(msg.content, index)}
                  className="flex items-center gap-1 hover:text-white transition cursor-pointer"
                  title="Copy styled markdown"
                >
                  {copiedIndex === index ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 text-indigo-400" />
                      <span>Copy</span>
                    </>
                  )}
                </button>

                {onSuggestionAdopt && index > 0 && !msg.content.startsWith('⚠️') && (
                  <>
                    <span className="text-indigo-805 font-black">•</span>
                    <button
                      onClick={() => onSuggestionAdopt(msg.content)}
                      className="text-indigo-300 hover:text-white font-black hover:underline cursor-pointer flex items-center gap-0.5"
                    >
                      <Sparkles className="h-2.5 w-2.5" />
                      <span>Insert into Editor</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        
        {loading && (
          <div className="flex items-center gap-2 text-xs text-indigo-400 font-mono italic pl-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
            <span>AI is querying vectors...</span>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Suggested Template Prompts */}
      {quickPrompts.length > 0 && (
        <div className={`px-4 py-3 border-t ${themeColors.border} bg-indigo-950/60 mt-auto shrink-0 animate-fade-in`}>
          <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mb-1.5 px-0.5">Quick Starters</p>
          <div className="flex flex-col gap-1">
            {quickPrompts.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSend(undefined, p)}
                className="w-full text-left p-2 rounded-xl border border-indigo-900/50 hover:bg-indigo-900/60 transition-all flex items-center justify-between text-[11px] text-indigo-200 hover:text-white cursor-pointer group"
              >
                <span className="truncate group-hover:translate-x-0.5 transition-transform duration-200">{p}</span>
                <span className="text-indigo-400 shrink-0 group-hover:text-white">&rarr;</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Footer Form Input */}
      <form onSubmit={handleSend} className={`p-4 border-t ${themeColors.border} bg-indigo-950 flex flex-col gap-2.5 shrink-0`}>
        {attachedFile && (
          <div className="bg-slate-900 border border-indigo-500/30 rounded-xl p-2.5 flex flex-col gap-2 animate-fade-in relative z-20">
            <div className="flex items-center justify-between text-xs text-indigo-200">
              <div className="flex items-center gap-1.5 min-w-0">
                <FileText className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                <span className="font-bold truncate" title={attachedFile.name}>{attachedFile.name}</span>
                <span className="text-[10px] text-indigo-400/80 shrink-0 font-mono">({Math.round(attachedFile.size / 1024 * 10) / 10} KB)</span>
              </div>
              <button 
                type="button" 
                onClick={() => setAttachedFile(null)}
                className="text-indigo-400 hover:text-white p-0.5 rounded transition hover:bg-slate-800"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            {/* Smart Option Chips */}
            <div className="flex flex-col gap-1.5 mt-0.5">
              <p className="text-[9px] text-indigo-400 uppercase tracking-wider font-extrabold px-0.5">Device Import Tools</p>
              <div className="flex flex-wrap gap-1">
                {attachedFile.name.endsWith('.csv') ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSend(undefined, "Analyze this CSV dataset, format it as a beautiful Markdown table, and append the raw [CSV_IMPORT] codes at the bottom")}
                      className="px-2 py-1 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 rounded text-[10px] font-bold border border-emerald-800/20 transition active:scale-95 text-left truncate shrink-0"
                    >
                      📊 Import data grid rows
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSend(undefined, "Generate cash transaction logs from this CSV table rows, attaching [TX_RECORD] codes for all events")}
                      className="px-2 py-1 bg-indigo-900/40 hover:bg-indigo-900 text-indigo-200 rounded text-[10px] font-bold border border-indigo-800/20 transition active:scale-95 text-left truncate shrink-0"
                    >
                      💰 Ledger summary logs
                    </button>
                  </>
                ) : attachedFile.name.endsWith('.json') ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSend(undefined, "Parse this JSON device database, structure its parameters, and pre-format [TX_RECORD] or [INVOICE_ITEM] imports")}
                      className="px-2 py-1 bg-amber-950 hover:bg-amber-900 text-amber-300 rounded text-[10px] font-bold border border-amber-800/20 transition active:scale-95 text-left truncate shrink-0"
                    >
                      💼 Struct to Ledger/Invoice
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSend(undefined, "Format this raw JSON array into structured document data and bullet records")}
                      className="px-2 py-1 bg-indigo-900/40 hover:bg-indigo-900 text-indigo-200 rounded text-[10px] font-bold border border-indigo-800/20 transition active:scale-95 text-left truncate shrink-0"
                    >
                      📄 Document text blocks
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSend(undefined, "Clean spelling, punctuation, and draft an executive summaries from this document file")}
                      className="px-2 py-1 bg-violet-950 hover:bg-violet-900 text-violet-300 rounded text-[10px] font-bold border border-violet-800/20 transition active:scale-95 text-left truncate shrink-0"
                    >
                      ✍️ Refine copy drafts
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSend(undefined, "Extract key items, billing terms, or client data lines as [INVOICE_ITEM] values")}
                      className="px-2 py-1 bg-indigo-900/40 hover:bg-indigo-900 text-indigo-200 rounded text-[10px] font-bold border border-indigo-800/20 transition active:scale-95 text-left truncate shrink-0"
                    >
                      📋 Map billing lines
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 w-full">
          {/* File Input Activator */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            accept=".csv,.json,.txt,.md,.log"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Import device data (CSV, JSON, TXT, MD)"
            className="p-2.5 bg-slate-900 hover:bg-slate-800 text-indigo-300 hover:text-white border border-indigo-800/40 rounded-full transition cursor-pointer shrink-0"
          >
            <Paperclip className="h-3.5 w-3.5" />
          </button>

          <div className="relative w-full">
            <input
              type="text"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              disabled={loading}
              placeholder={attachedFile ? "Specify file task parameters..." : `Ask our ${persona} specialist...`}
              className="w-full bg-white border border-indigo-200 rounded-full py-2.5 pl-4 pr-10 text-xs text-black placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-505 disabled:opacity-50 shadow-xs"
            />
            <button
              type="submit"
              disabled={(!prompt.trim() && !attachedFile) || loading}
              className={`absolute right-1.5 top-1.5 p-1.5 ${themeColors.accent} disabled:bg-indigo-950/20 text-white disabled:text-indigo-500 rounded-full transition-all cursor-pointer`}
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
