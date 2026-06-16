import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Plus, Save, AlignLeft, AlignCenter, AlignRight, 
  Bold, Italic, Underline, Heading1, Heading2, List, ListOrdered, 
  Trash2, Download, Printer, Wand2, RefreshCw, CheckCircle2, FileDown,
  ChevronDown, FolderOpen, Search
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { 
  db, auth, handleFirestoreError, OperationType,
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot
} from '../lib/firebase.ts';
import { DocumentData } from '../types.ts';
import PdfPreviewModal from './PdfPreviewModal.tsx';

interface DocumentEditorProps {
  userId: string;
  onSelectContentForAi?: (text: string) => void;
  initialAdoptedText?: string | null;
  clearAdoptedText?: () => void;
  activeDocId?: string | null;
}

export default function DocumentEditor({ 
  userId, 
  onSelectContentForAi, 
  initialAdoptedText, 
  clearAdoptedText,
  activeDocId
}: DocumentEditorProps) {
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [activeDoc, setActiveDoc] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [docTitle, setDocTitle] = useState('');
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [docListOpen, setDocListOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 768 : true);

  // Find & Replace States
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [matchesCount, setMatchesCount] = useState<number | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Read documents from Firestore
  useEffect(() => {
    const q = query(
      collection(db, 'documents'),
      where('userId', '==', userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docsData: DocumentData[] = [];
      snapshot.forEach((docSnap) => {
        docsData.push({ id: docSnap.id, ...docSnap.data() } as DocumentData);
      });
      setDocuments(docsData);
      
      // Select first document if none active
      if (docsData.length > 0 && !activeDoc) {
        // Find longest or most recently modified
        const sorted = [...docsData].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
        setActiveDoc(sorted[0]);
        setDocTitle(sorted[0].title);
      }
      setLoading(false);
    }, (error) => {
      console.error("Firestore listening error in Documents: ", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  // Sync selected document if activeDocId changes from command palette
  useEffect(() => {
    if (activeDocId && documents.length > 0) {
      const targetDoc = documents.find(d => d.id === activeDocId);
      if (targetDoc) {
        setActiveDoc(targetDoc);
        setDocTitle(targetDoc.title);
      }
    }
  }, [activeDocId, documents]);

  // Handle outside adoption of AI response text
  useEffect(() => {
    if (initialAdoptedText && activeDoc && editorRef.current) {
      // Append or insert at caret
      editorRef.current.focus();
      // Simple insertion of AI text
      const cleanText = initialAdoptedText.replace(/#/g, ''); // strip markdown headers
      document.execCommand('insertHTML', false, `<div>${cleanText.replace(/\n/g, '<br/>')}</div>`);
      handleEditorInput();
      if (clearAdoptedText) clearAdoptedText();
    }
  }, [initialAdoptedText, activeDoc]);

  // Keep track of active document changes
  useEffect(() => {
    if (activeDoc) {
      setDocTitle(activeDoc.title);
      if (editorRef.current) {
        editorRef.current.innerHTML = activeDoc.content || '<p>Start typing here...</p>';
      }
    } else {
      setDocTitle('');
      if (editorRef.current) {
        editorRef.current.innerHTML = '';
      }
    }
  }, [activeDoc?.id]);

  // Debounced Save Utility
  const triggerDebouncedSave = (updatedData: Partial<DocumentData>) => {
    if (!activeDoc) return;
    setSaveStatus('saving');

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const docRef = doc(db, 'documents', activeDoc.id);
        const nextUpdated = {
          ...updatedData,
          updatedAt: new Date().toISOString()
        };

        await updateDoc(docRef, nextUpdated);
        // also local snapshot updates automatically through onSnapshot
        setSaveStatus('saved');
        window.dispatchEvent(new CustomEvent('app-notification', {
          detail: {
            title: 'Document Saved',
            message: `"${nextUpdated.title || activeDoc.title || 'Untitled Document'}" content sync complete.`,
            type: 'save'
          }
        }));
      } catch (error) {
        setSaveStatus('error');
        handleFirestoreError(error, OperationType.UPDATE, `documents/${activeDoc.id}`);
      }
    }, 1500); // 1.5 seconds debounce
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDocTitle(val);
    if (activeDoc) {
      // Update local state briefly to prevent stuttering
      activeDoc.title = val;
      triggerDebouncedSave({ title: val });
    }
  };

  const handleEditorInput = () => {
    if (activeDoc && editorRef.current) {
      const htmlContent = editorRef.current.innerHTML;
      activeDoc.content = htmlContent;
      triggerDebouncedSave({ content: htmlContent });
    }
  };

  // Traverses document text nodes to count find occurrences safely without breaking HTML tags
  const countMatches = (findStr: string, caseSensitive: boolean = false): number => {
    if (!editorRef.current || !findStr) return 0;
    
    let count = 0;
    const walkAndCount = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.nodeValue || '';
        const escaped = findStr.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const flags = caseSensitive ? 'g' : 'gi';
        const regex = new RegExp(escaped, flags);
        const matches = text.match(regex);
        if (matches) {
          count += matches.length;
        }
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          walkAndCount(node.childNodes[i]);
        }
      }
    };

    walkAndCount(editorRef.current);
    return count;
  };

  // Traverses document text nodes to find and replace search query securely
  const performFindAndReplace = (findStr: string, replaceStr: string, caseSensitive: boolean = false): number => {
    if (!editorRef.current || !findStr) return 0;
    
    let matchesCount = 0;
    const walkAndReplace = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.nodeValue || '';
        let newText = '';
        
        const escaped = findStr.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const flags = caseSensitive ? 'g' : 'gi';
        const regex = new RegExp(escaped, flags);
        
        const matches = text.match(regex);
        if (matches) {
          matchesCount += matches.length;
          newText = text.replace(regex, replaceStr);
        } else {
          newText = text;
        }
        
        if (node.nodeValue !== newText) {
          node.nodeValue = newText;
        }
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          walkAndReplace(node.childNodes[i]);
        }
      }
    };

    walkAndReplace(editorRef.current);
    
    if (matchesCount > 0) {
      handleEditorInput(); // Triggers debounced save with new HTML
    }
    
    return matchesCount;
  };

  const handleReplaceAll = () => {
    if (!findText) return;
    const replacedNum = performFindAndReplace(findText, replaceText, matchCase);
    
    window.dispatchEvent(new CustomEvent('app-notification', {
      detail: {
        title: 'Document Bulk Update',
        message: `Successfully replaced ${replacedNum} occurrences of "${findText}".`,
        type: 'system'
      }
    }));
    
    // Refresh match count representation
    setMatchesCount(0);
  };

  // Real-time matches counting hook
  useEffect(() => {
    if (isFindReplaceOpen && findText) {
      const count = countMatches(findText, matchCase);
      setMatchesCount(count);
    } else {
      setMatchesCount(null);
    }
  }, [findText, matchCase, isFindReplaceOpen, activeDoc?.id]);

  const createNewDoc = async () => {
    try {
      setLoading(true);
      const newDocObj = {
        userId,
        title: 'Untitled Document',
        content: '<h1>Untitled Document</h1><p>Start drafting your awesome ideas here...</p>',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'documents'), newDocObj);
      const docCreated = { id: docRef.id, ...newDocObj } as DocumentData;
      setActiveDoc(docCreated);
      setDocTitle(docCreated.title);
      setLoading(false);
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: {
          title: 'Document Created',
          message: `Created new document: "Untitled Document"`,
          type: 'system'
        }
      }));
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'documents');
    }
  };

  const deleteDocument = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this document?")) return;

    try {
      await deleteDoc(doc(db, 'documents', id));
      if (activeDoc?.id === id) {
        setActiveDoc(null);
        setDocTitle('');
      }
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: {
          title: 'Document Deleted',
          message: `Successfully removed document from cloud storage.`,
          type: 'system'
        }
      }));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `documents/${id}`);
    }
  };

  // formatting helper
  const format = (command: string, value: string = '') => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      editorRef.current.focus();
    }
    handleEditorInput();
  };

  const downloadDoc = () => {
    if (!activeDoc || !editorRef.current) return;
    const plaintext = editorRef.current.innerText;
    const blob = new Blob([plaintext], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeDoc.title || 'document'}.txt`;
    link.click();
  };

  const downloadDocCSV = () => {
    if (!activeDoc || !editorRef.current) return;
    const plaintext = editorRef.current.innerText;
    const lines = plaintext.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const csvContent = lines.map(line => `"${line.replace(/"/g, '""')}"`).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeDoc.title || 'document'}.csv`;
    link.click();
  };

  const printDoc = () => {
    if (!editorRef.current) return;
    
    // Check if printing is supported and use a hidden iframe for safe, popup-blocker resistant printing inside sandboxed iframes
    let printIframe = document.getElementById('print-iframe') as HTMLIFrameElement;
    if (!printIframe) {
      printIframe = document.createElement('iframe');
      printIframe.id = 'print-iframe';
      printIframe.style.position = 'absolute';
      printIframe.style.top = '-9999px';
      printIframe.style.left = '-9999px';
      printIframe.style.width = '0px';
      printIframe.style.height = '0px';
      printIframe.style.border = 'none';
      document.body.appendChild(printIframe);
    }

    const doc = printIframe.contentDocument || printIframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(`
        <html>
          <head>
            <title>${docTitle || 'Document'}</title>
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
                padding: 40px; 
                line-height: 1.6; 
                color: #000000; 
                background-color: #ffffff; 
              }
              h1 { 
                text-align: center; 
                font-size: 24px; 
                margin-bottom: 24px; 
                border-b: 1px solid #e2e8f0; 
                padding-bottom: 12px; 
              }
              img { max-width: 100%; height: auto; }
              table { width: 100%; border-collapse: collapse; margin: 16px 0; }
              th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; }
              th { background-color: #f1f5f9; }
            </style>
          </head>
          <body>
            <h1>${docTitle || 'Untitled Document'}</h1>
            <div>${editorRef.current.innerHTML}</div>
          </body>
        </html>
      `);
      doc.close();

      setTimeout(() => {
        try {
          printIframe.contentWindow?.focus();
          printIframe.contentWindow?.print();
        } catch (e) {
          console.error("Iframe print failed, falling back to window.print", e);
          window.print();
        }
      }, 300);
    } else {
      // Fallback to separate window if browser restrictions prevent iframe documents
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        window.print();
        return;
      }
      printWindow.document.write(`
        <html>
          <head>
            <title>${docTitle}</title>
            <style>
              body { font-family: sans-serif; padding: 40px; line-height: 1.6; }
              h1 { text-align: center; }
            </style>
          </head>
          <body>
            <h1>${docTitle}</h1>
            ${editorRef.current.innerHTML}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }
  };

  const generatePDFobj = (): jsPDF => {
    if (!activeDoc || !editorRef.current) {
      throw new Error("Active document and editor structure must exist.");
    }
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const margin = 20;
    const pageWidth = 210;
    const pageHeight = 297;
    const contentWidth = pageWidth - (margin * 2);

    let y = 30;

    const checkAndAddPage = (neededHeight: number) => {
      if (y + neededHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
        return true;
      }
      return false;
    };

    // Header on first page
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(17, 24, 39); // deep slate/black
    
    const titleLines = doc.splitTextToSize(docTitle || activeDoc.title || 'Untitled Document', contentWidth);
    titleLines.forEach((line: string) => {
      checkAndAddPage(8);
      doc.text(line, margin, y);
      y += 8;
    });

    // Subtitle / Date
    checkAndAddPage(6);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128); // gray
    doc.text(`Generated via WorkSuite AI on ${new Date().toLocaleDateString()}`, margin, y);
    y += 6;

    // Rule separator
    checkAndAddPage(4);
    doc.setDrawColor(229, 231, 235); // light gray border
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 10;

    // Extract nodes
    const children = Array.from(editorRef.current.childNodes);

    children.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();
        if (text) {
          doc.setFont("Helvetica", "normal");
          doc.setFontSize(11);
          doc.setTextColor(55, 65, 81);
          const lines = doc.splitTextToSize(text, contentWidth);
          lines.forEach((line: string) => {
            checkAndAddPage(6);
            doc.text(line, margin, y);
            y += 6;
          });
          y += 4;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tagName = el.tagName.toLowerCase();
        const textContent = el.innerText?.trim();

        if (!textContent) {
          y += 4;
          return;
        }

        if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3') {
          doc.setFont("Helvetica", "bold");
          const fontSize = tagName === 'h1' ? 16 : tagName === 'h2' ? 14 : 12;
          doc.setFontSize(fontSize);
          doc.setTextColor(17, 24, 39);
          
          const lines = doc.splitTextToSize(textContent, contentWidth);
          lines.forEach((line: string) => {
            checkAndAddPage(fontSize * 0.5 + 4);
            doc.text(line, margin, y);
            y += fontSize * 0.5 + 4;
          });
          y += 4;
        } else if (tagName === 'ul' || tagName === 'ol') {
          const listItems = Array.from(el.querySelectorAll('li'));
          listItems.forEach((li, idx) => {
            const liText = li.innerText.trim();
            if (!liText) return;

            doc.setFont("Helvetica", "normal");
            doc.setFontSize(11);
            doc.setTextColor(55, 65, 81);

            const bullet = tagName === 'ul' ? '\u2022' : `${idx + 1}.`;
            const bulletWidth = tagName === 'ul' ? 4 : 6;

            const lines = doc.splitTextToSize(liText, contentWidth - bulletWidth);
            lines.forEach((line: string, lineIdx: number) => {
              checkAndAddPage(6);
              if (lineIdx === 0) {
                doc.text(bullet, margin, y);
              }
              doc.text(line, margin + bulletWidth, y);
              y += 6;
            });
            y += 2;
          });
          y += 4;
        } else {
          doc.setFont("Helvetica", "normal");
          doc.setFontSize(11);
          doc.setTextColor(55, 65, 81);

          const lines = doc.splitTextToSize(textContent, contentWidth);
          lines.forEach((line: string) => {
            checkAndAddPage(6);
            doc.text(line, margin, y);
            y += 6;
          });
          y += 4;
        }
      }
    });

    return doc;
  };

  const exportPDF = () => {
    if (!activeDoc || !editorRef.current) return;
    try {
      const docObj = generatePDFobj();
      docObj.save(`${docTitle || activeDoc.title || 'document'}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
    }
  };

  // Ask AI about highlighted selection
  const handleAskAiAboutSelection = () => {
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString().trim() : '';
    if (selectedText && onSelectContentForAi) {
      onSelectContentForAi(selectedText);
    } else if (editorRef.current && onSelectContentForAi) {
      onSelectContentForAi(editorRef.current.innerText);
    }
  };

  return (
    <div className="flex h-full bg-slate-50/50 dark:bg-slate-950/40 text-slate-800 dark:text-slate-100 relative" id="document-processor">
      {/* Scroll shield on mobile */}
      {docListOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-15"
          onClick={() => setDocListOpen(false)}
        />
      )}

      {/* Sidebar - documents list */}
      <div className={`border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0 transition-all duration-300 ${
        docListOpen 
          ? 'w-64 opacity-100 visible' 
          : 'w-0 opacity-0 invisible overflow-hidden border-r-0'
      } fixed md:static inset-y-16 md:inset-y-auto left-0 z-20 h-[calc(100vh-64px)] md:h-auto shadow-lg md:shadow-none`}>
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">My Docs</h3>
          </div>
          <button 
            onClick={createNewDoc}
            className="p-1 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-lg transition cursor-pointer"
            title="Create New Document"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar">
          {loading ? (
            <div className="text-xs text-slate-400 dark:text-slate-500 p-4 font-mono">Loading lists...</div>
          ) : documents.length === 0 ? (
            <div className="text-xs text-slate-400 dark:text-slate-500 p-4 text-center">
              No docs found. Create one to get started!
            </div>
          ) : (
            documents.map((docItem) => (
              <div
                key={docItem.id}
                onClick={() => {
                  setActiveDoc(docItem);
                  // Auto close drawer on mobile upon selection
                  if (window.innerWidth < 768) {
                    setDocListOpen(false);
                  }
                }}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition text-xs ${
                  activeDoc?.id === docItem.id 
                    ? 'bg-indigo-50 dark:bg-indigo-950/45 text-indigo-800 dark:text-indigo-305 font-bold border-l-2 border-indigo-600' 
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                  <span className="truncate">{docItem.title || 'Untitled'}</span>
                </div>
                <button
                  onClick={(e) => deleteDocument(docItem.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer"
                  title="Delete Document"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Editor Main Canvas */}
      {activeDoc ? (
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 relative">
          
          {/* Find and Replace Floating Panel */}
          {isFindReplaceOpen && (
            <div className="absolute top-36 right-8 z-20 w-80 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-850 p-4 animate-fade-in font-sans">
              <div className="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-1.5">
                  <Search className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs font-extrabold text-slate-850 dark:text-slate-200 tracking-wider uppercase">Find & Replace</span>
                </div>
                <button 
                  onClick={() => setIsFindReplaceOpen(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-250 transition p-1 text-base leading-none cursor-pointer"
                >
                  &times;
                </button>
              </div>
              
              <div className="space-y-3.5">
                {/* Search Input */}
                <div>
                  <label className="text-[10px] uppercase font-extrabold text-slate-400 dark:text-slate-500 tracking-wider">Find Text</label>
                  <input 
                    type="text"
                    value={findText}
                    onChange={(e) => setFindText(e.target.value)}
                    placeholder="Enter search phrase..."
                    className="w-full mt-1 px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-100 placeholder:text-slate-400/80"
                  />
                  {findText ? (
                    <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono mt-1 font-bold">
                      {matchesCount === 0 ? 'No matches found' : `${matchesCount} ${matchesCount === 1 ? 'match' : 'matches'} found`}
                    </p>
                  ) : null}
                </div>

                {/* Replace Input */}
                <div>
                  <label className="text-[10px] uppercase font-extrabold text-slate-400 dark:text-slate-500 tracking-wider">Replace With</label>
                  <input 
                    type="text"
                    value={replaceText}
                    onChange={(e) => setReplaceText(e.target.value)}
                    placeholder="Enter replacement..."
                    className="w-full mt-1 px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-100 placeholder:text-slate-400/80"
                  />
                </div>

                {/* Options */}
                <div className="flex items-center gap-2 py-0.5">
                  <input 
                    type="checkbox"
                    id="matchCaseCheckbox"
                    checked={matchCase}
                    onChange={(e) => setMatchCase(e.target.checked)}
                    className="h-3.5 w-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 bg-transparent cursor-pointer"
                  />
                  <label htmlFor="matchCaseCheckbox" className="text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none font-bold">
                    Match Case (Case Sensitive)
                  </label>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-805">
                  <button
                    onClick={() => {
                      const count = countMatches(findText, matchCase);
                      setMatchesCount(count);
                    }}
                    disabled={!findText}
                    className="px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-755 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg font-bold text-slate-600 dark:text-slate-400 transition cursor-pointer disabled:opacity-40"
                  >
                    Find
                  </button>
                  <button
                    onClick={handleReplaceAll}
                    disabled={!findText || matchesCount === 0}
                    className="px-3.5 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-extrabold shadow-xs active:scale-95 transition cursor-pointer disabled:opacity-40"
                  >
                    Replace All
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Header Title Editor */}
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between bg-slate-50/10 dark:bg-slate-950/15 gap-3">
            <div className="flex items-center gap-2 grow">
              {/* Sidebar toggle for mobile/tablets */}
              <button
                onClick={() => setDocListOpen(!docListOpen)}
                className="md:hidden p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-indigo-600 rounded-lg transition border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-900 cursor-pointer"
                title="Toggle Documents List"
              >
                <FolderOpen className="h-4 w-4" />
              </button>
              
              <input
                type="text"
                value={docTitle}
                onChange={handleTitleChange}
                placeholder="Untitled Document"
                className="text-base sm:text-lg font-bold text-slate-850 dark:text-slate-100 bg-transparent hover:bg-slate-100/50 dark:hover:bg-slate-800/40 focus:bg-white dark:focus:bg-slate-950 border-x-0 border-y-0 focus:ring-0 w-full sm:w-96 font-sans no-outline-focus transition"
              />
            </div>

            {/* Sync Save State Indicator */}
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5 font-mono text-slate-400">
                {saveStatus === 'saving' ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin text-amber-500" />
                    <span className="text-amber-500">Auto-saving...</span>
                  </>
                ) : saveStatus === 'error' ? (
                  <span className="text-rose-500">Error saving</span>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-slate-500">Auto-saved</span>
                  </>
                )}
              </div>

               <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    onClick={() => setIsFileMenuOpen(!isFileMenuOpen)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-950/80 font-medium rounded-lg shadow-xs border border-indigo-100 dark:border-indigo-900/40 transition cursor-pointer text-xs"
                    title="File Export Options"
                  >
                    <FolderOpen className="h-4 w-4" />
                    <span>File</span>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {isFileMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setIsFileMenuOpen(false)} />
                      <div className="absolute right-0 mt-1.5 w-52 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1.5 z-20 font-sans">
                        <button
                          onClick={() => {
                            setIsFileMenuOpen(false);
                            setIsPreviewOpen(true);
                          }}
                          className="flex items-center gap-2.5 w-full px-4 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium text-left transition cursor-pointer"
                        >
                          <FileDown className="h-4 w-4 text-rose-500" />
                          <span>Export PDF</span>
                        </button>
                        <button
                          onClick={() => {
                            setIsFileMenuOpen(false);
                            downloadDocCSV();
                          }}
                          className="flex items-center gap-2.5 w-full px-4 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium text-left transition cursor-pointer"
                        >
                          <Download className="h-4 w-4 text-emerald-500" />
                          <span>Export CSV</span>
                        </button>
                        <button
                          onClick={() => {
                            setIsFileMenuOpen(false);
                            downloadDoc();
                          }}
                          className="flex items-center gap-2.5 w-full px-4 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium text-left transition cursor-pointer"
                        >
                          <FileText className="h-4 w-4 text-blue-500" />
                          <span>Export Text / Markdown</span>
                        </button>
                        <div className="border-t border-slate-100 dark:border-slate-750 my-1"></div>
                        <button
                          onClick={() => {
                            setIsFileMenuOpen(false);
                            printDoc();
                          }}
                          className="flex items-center gap-2.5 w-full px-4 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium text-left transition cursor-pointer"
                        >
                          <Printer className="h-4 w-4 text-slate-500" />
                          <span>Print Document</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Document Toolbar */}
          <div className="px-6 py-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap gap-1 items-center bg-slate-50/50 dark:bg-slate-950/40">
            <button
              onClick={() => format('formatBlock', '<h1>')}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 rounded hover:text-slate-900 dark:hover:text-slate-200 font-bold text-sm cursor-pointer"
              title="Heading 1"
            >
              H1
            </button>
            <button
              onClick={() => format('formatBlock', '<h2>')}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 rounded hover:text-slate-900 dark:hover:text-slate-200 font-bold text-sm cursor-pointer"
              title="Heading 2"
            >
              H2
            </button>
            <button
              onClick={() => format('formatBlock', '<p>')}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 rounded hover:text-slate-900 dark:hover:text-slate-200 font-medium text-sm pr-2 border-r border-slate-200 dark:border-slate-800 cursor-pointer"
              title="Paragraph"
            >
              Body
            </button>

            <button
              onClick={() => format('bold')}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 rounded hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
              title="Bold"
            >
              <Bold className="h-4 w-4" />
            </button>
            <button
              onClick={() => format('italic')}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 rounded hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
              title="Italic"
            >
              <Italic className="h-4 w-4" />
            </button>
            <button
              onClick={() => format('underline')}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 rounded hover:text-slate-900 dark:hover:text-slate-200 pr-2 border-r border-slate-200 dark:border-slate-800 cursor-pointer"
              title="Underline"
            >
              <Underline className="h-4 w-4" />
            </button>

            <button
              onClick={() => format('insertUnorderedList')}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 rounded hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
              title="Bullet List"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => format('insertOrderedList')}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 rounded hover:text-slate-900 dark:hover:text-slate-200 pr-2 border-r border-slate-200 dark:border-slate-800 cursor-pointer"
              title="Numbered List"
            >
              <ListOrdered className="h-4 w-4" />
            </button>

            <button
              onClick={() => format('justifyLeft')}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 rounded hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
              title="Align Left"
            >
              <AlignLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => format('justifyCenter')}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 rounded hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
              title="Align Center"
            >
              <AlignCenter className="h-4 w-4" />
            </button>
            <button
              onClick={() => format('justifyRight')}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 rounded hover:text-slate-900 dark:hover:text-slate-205 pr-2 border-r border-slate-200 dark:border-slate-800 cursor-pointer"
              title="Align Right"
            >
              <AlignRight className="h-4 w-4" />
            </button>

            <button
              onClick={() => setIsFindReplaceOpen(!isFindReplaceOpen)}
              className={`p-1.5 rounded transition cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
                isFindReplaceOpen 
                  ? 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-750 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800' 
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-450 hover:text-slate-900 dark:hover:text-slate-100 border border-transparent'
              }`}
              title="Find and Replace Text"
            >
              <Search className="h-4 w-4" />
              <span>Find & Replace</span>
            </button>

            <button
              onClick={handleAskAiAboutSelection}
              className="ml-auto inline-flex items-center gap-1.5 py-1.5 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
              title="Highlight text or click to rewrite/elaborate with AI assistant"
            >
              <Wand2 className="h-3.5 w-3.5" />
              <span>Fix with AI</span>
            </button>
          </div>

          {/* Text Canvas Container */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-6 md:p-12 bg-slate-50 dark:bg-slate-950 flex justify-center">
            <div 
              ref={editorRef}
              contentEditable
              onInput={handleEditorInput}
              className="w-full max-w-4xl bg-white dark:bg-slate-900 min-h-[842px] p-4 sm:p-10 md:p-16 shadow-sm border border-slate-200/60 dark:border-slate-800/80 rounded-2xl focus:outline-none prose prose-slate dark:prose-invert prose-indigo dark:prose-indigo max-w-none prose-p:my-2 prose-h1:my-4 prose-h2:my-3 text-slate-800 dark:text-slate-200"
              style={{ minHeight: '29.7cm' }} // A4 proportions approximately
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-550 p-8 bg-slate-50 dark:bg-slate-950">
          <FileText className="h-12 w-12 text-slate-200 dark:text-slate-800 mb-2" />
          <p className="text-sm">Select an existing document, or create a brand new one!</p>
          <button
            onClick={createNewDoc}
            className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition cursor-pointer"
          >
            Create Document
          </button>
        </div>
      )}

      {/* PDF Export Preview Modal */}
      {activeDoc && (
        <PdfPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          title={`Document: ${docTitle || 'Untitled document'}`}
          pdfGenerator={generatePDFobj}
          fileName={`${docTitle || activeDoc.title || 'document'}.pdf`}
        />
      )}
    </div>
  );
}
