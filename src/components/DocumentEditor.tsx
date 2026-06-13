import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Plus, Save, AlignLeft, AlignCenter, AlignRight, 
  Bold, Italic, Underline, Heading1, Heading2, List, ListOrdered, 
  Trash2, Download, Printer, Wand2, RefreshCw, CheckCircle2, FileDown 
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { 
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, 
  onSnapshot 
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase.ts';
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

  const printDoc = () => {
    if (!editorRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
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
          ${editorRef.current.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
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
    <div className="flex h-full bg-slate-50/50 dark:bg-slate-950/40 text-slate-800 dark:text-slate-100" id="document-processor">
      {/* Sidebar - documents list */}
      <div className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0">
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
                onClick={() => setActiveDoc(docItem)}
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
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900">
          {/* Header Title Editor */}
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/10 dark:bg-slate-950/15">
            <input
              type="text"
              value={docTitle}
              onChange={handleTitleChange}
              placeholder="Untitled Document"
              className="text-lg font-bold text-slate-850 dark:text-slate-100 bg-transparent hover:bg-slate-100/50 dark:hover:bg-slate-800/40 focus:bg-white dark:focus:bg-slate-950 border-x-0 border-y-0 focus:ring-0 w-96 font-sans no-outline-focus transition"
            />

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

               <div className="flex items-center gap-1">
                <button 
                  onClick={downloadDoc}
                  className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-850 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                  title="Download TXT"
                >
                  <Download className="h-4 w-4" />
                </button>
                <button 
                  onClick={() => setIsPreviewOpen(true)}
                  className="p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition hover:text-rose-700 dark:hover:text-rose-300 cursor-pointer"
                  title="PDF Preview & Export"
                >
                  <FileDown className="h-4 w-4" />
                </button>
                <button 
                  onClick={printDoc}
                  className="p-1.5 text-slate-500 dark:text-slate-405 hover:text-slate-850 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                  title="Print Document"
                >
                  <Printer className="h-4 w-4" />
                </button>
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
              onClick={handleAskAiAboutSelection}
              className="ml-auto inline-flex items-center gap-1.5 py-1.5 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
              title="Highlight text or click to rewrite/elaborate with AI assistant"
            >
              <Wand2 className="h-3.5 w-3.5" />
              <span>Fix with AI</span>
            </button>
          </div>

          {/* Text Canvas Container */}
          <div className="flex-1 overflow-y-auto p-12 bg-slate-50 dark:bg-slate-950 flex justify-center">
            <div 
              ref={editorRef}
              contentEditable
              onInput={handleEditorInput}
              className="w-full max-w-4xl bg-white dark:bg-slate-900 min-h-[842px] p-16 shadow-sm border border-slate-200/60 dark:border-slate-800/80 rounded-2xl focus:outline-none prose prose-slate dark:prose-invert prose-indigo dark:prose-indigo max-w-none prose-p:my-2 prose-h1:my-4 prose-h2:my-3 text-slate-800 dark:text-slate-200"
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
