import React, { useState, useEffect } from 'react';
import { 
  X, FileDown, Printer, RefreshCw, AlertCircle, Eye, Check, Loader2 
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { motion, AnimatePresence } from 'motion/react';

interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  pdfGenerator: () => jsPDF;
  fileName: string;
}

export default function PdfPreviewModal({ 
  isOpen, 
  onClose, 
  title, 
  pdfGenerator, 
  fileName 
}: PdfPreviewModalProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDoneExporting, setIsDoneExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
        setPdfUrl(null);
      }
      return;
    }

    setLoading(true);
    setError(null);
    setIsDoneExporting(false);

    // Timeout to let the modal paint first and render smoothly
    const timer = setTimeout(() => {
      try {
        const doc = pdfGenerator();
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
        setLoading(false);
      } catch (err: any) {
        console.error("Error generating PDF preview: ", err);
        setError("Failed to compile preview layout. However, you can still attempt to export.");
        setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [isOpen, pdfGenerator]);

  // Clean up URL on unmount
  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  const handlePrint = () => {
    if (!pdfUrl) return;
    try {
      const printWindow = window.open(pdfUrl, '_blank');
      if (printWindow) {
        printWindow.focus();
        printWindow.print();
      } else {
        // Fallback print triggers standard window print as second option
        window.print();
      }
    } catch (err) {
      console.error("Print action failed: ", err);
      // Fallback
      window.print();
    }
  };

  const handleExport = () => {
    try {
      const doc = pdfGenerator();
      doc.save(fileName);
      setIsDoneExporting(true);
      setTimeout(() => setIsDoneExporting(false), 3000);
    } catch (err) {
      console.error("Export failed: ", err);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" 
          id="pdf-preview-modal-backdrop"
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ 
              type: "spring", 
              damping: 24, 
              stiffness: 280,
              mass: 0.9,
              delay: 0.05
            }}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden max-sm:h-[95vh]"
          >
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/35 flex items-center justify-center text-rose-600 dark:text-rose-455">
              <Eye className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">PDF Export Preview</h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{title}</p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200/80 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 text-slate-400 dark:text-slate-500 rounded-lg transition"
            title="Close Preview Screen"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Modal Main Grid */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 bg-slate-100/50 dark:bg-slate-950/20">
          
          {/* Left panel: PDF frame viewport */}
          <div className="flex-1 h-full min-h-0 relative p-6 max-md:p-3 flex items-center justify-center bg-slate-100/30 dark:bg-slate-950/30">
            {loading ? (
              <div className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 font-mono text-xs gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" />
                <span>Compiling pixel-perfect page vectors...</span>
              </div>
            ) : error ? (
              <div className="max-w-md p-6 bg-red-50 dark:bg-red-955/20 border border-red-100 dark:border-red-900/30 rounded-xl text-center text-red-650 dark:text-red-400 text-xs flex flex-col items-center gap-2.5">
                <AlertCircle className="h-8 w-8 text-red-500" />
                <p className="font-semibold">{error}</p>
              </div>
            ) : pdfUrl ? (
              <div className="w-full h-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-805 shadow-lg bg-white dark:bg-slate-900">
                <iframe 
                  src={`${pdfUrl}#toolbar=0&navpanes=0`} 
                  className="w-full h-full border-none" 
                  title="PDF Live Engine View"
                />
              </div>
            ) : (
              <div className="text-slate-400 dark:text-slate-500 text-xs font-mono">No document compiled.</div>
            )}
          </div>

          {/* Right Action panel */}
          <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col gap-6 select-none shrink-0">
            
            {/* Quick Summary Metadata */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Document Profile</h4>
              
              <div className="bg-slate-50 dark:bg-slate-950/40 p-4 border border-slate-100 dark:border-slate-805/80 rounded-xl space-y-2.5 text-xs text-slate-600 dark:text-slate-350">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-slate-400 dark:text-slate-500 shrink-0">Target File:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[150px]" title={fileName}>{fileName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 dark:text-slate-500">PDF Version:</span>
                  <span className="font-mono text-[10px] text-slate-700 dark:text-slate-300">A4 Format (1.4)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 dark:text-slate-500">Rendering Mode:</span>
                  <span className="text-emerald-600 dark:text-emerald-450 font-medium font-sans">Vector Output</span>
                </div>
              </div>
            </div>

            {/* Core Operations Shortcut actions */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Actions Registry</h4>

              {/* Print Shortcut Button */}
              <button
                onClick={handlePrint}
                disabled={loading || !!error}
                className="w-full py-2.5 px-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                title="Print current compiled PDF statement"
              >
                <Printer className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                <span>Print Document</span>
              </button>

              {/* Finalize Export / Download PDF */}
              <button
                onClick={handleExport}
                disabled={loading}
                className={`w-full py-2.5 px-4 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm focus:ring-1 focus:ring-indigo-500 text-white cursor-pointer ${
                  isDoneExporting 
                    ? 'bg-emerald-600 hover:bg-emerald-700' 
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
                title="Save compiled statement with vector definitions to disk"
              >
                {isDoneExporting ? (
                  <>
                    <Check className="h-4 w-4" />
                    <span>PDF Downloaded!</span>
                  </>
                ) : (
                  <>
                    <FileDown className="h-4 w-4" />
                    <span>Finalize Export</span>
                  </>
                )}
              </button>
            </div>

            {/* Pro-tips banner in sidebar footer */}
            <div className="mt-auto bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 p-3.5 rounded-xl text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed flex gap-2">
              <AlertCircle className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
              <span>
                <b>Pro Tip:</b> Our vector compilation keeps fonts extremely sharp at any zoom level, perfect for professional distribution.
              </span>
            </div>

          </div>

        </div>

      </motion.div>
    </motion.div>
    )}
  </AnimatePresence>
);
}
