import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, FileText, Grid, Award, Receipt, ArrowRight, CornerDownLeft, X, Loader2, Sparkles, FolderOpen
} from 'lucide-react';
import { db, collection, query, where, getDocs } from '../lib/firebase.ts';
import { motion, AnimatePresence } from 'motion/react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onSelectItem: (type: 'document' | 'spreadsheet' | 'note' | 'invoice', id: string) => void;
}

interface SearchItem {
  id: string;
  title: string;
  subtitle?: string;
  type: 'document' | 'spreadsheet' | 'note' | 'invoice';
  typeName: string;
  updatedAt: string;
}

export default function CommandPalette({ isOpen, onClose, userId, onSelectItem }: CommandPaletteProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [allItems, setAllItems] = useState<SearchItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load items on open
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSelectedIndex(0);
      fetchWorkspaceItems();
      
      // Focus input
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 50);
    }
  }, [isOpen]);

  const fetchWorkspaceItems = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const itemsList: SearchItem[] = [];

      // 1. Fetch Documents
      const docQuery = query(collection(db, 'documents'), where('userId', '==', userId));
      const docSnap = await getDocs(docQuery);
      docSnap.forEach((d) => {
        const data = d.data();
        itemsList.push({
          id: d.id,
          title: data.title || 'Untitled Document',
          subtitle: data.content ? (data.content.replace(/<[^>]*>/g, '').substring(0, 70) + '...') : undefined,
          type: 'document',
          typeName: 'Word Processor',
          updatedAt: data.updatedAt || data.createdAt || ''
        });
      });

      // 2. Fetch Spreadsheets
      const sheetQuery = query(collection(db, 'spreadsheets'), where('userId', '==', userId));
      const sheetSnap = await getDocs(sheetQuery);
      sheetSnap.forEach((s) => {
        const data = s.data();
        itemsList.push({
          id: s.id,
          title: data.title || 'Untitled Spreadsheet',
          subtitle: 'Interactive layout table',
          type: 'spreadsheet',
          typeName: 'List Grid',
          updatedAt: data.updatedAt || data.createdAt || ''
        });
      });

      // 3. Fetch Ledger Notes
      const notesQuery = query(collection(db, 'notes'), where('userId', '==', userId));
      const notesSnap = await getDocs(notesQuery);
      notesSnap.forEach((n) => {
        const data = n.data();
        itemsList.push({
          id: n.id,
          title: data.title || 'Untitled Note',
          subtitle: `${data.type === 'deposit' ? 'Deposit' : 'Debit'} • $${(data.amount || 0).toFixed(2)}${data.description ? ` • ${data.description}` : ''}`,
          type: 'note',
          typeName: 'Ledger Note',
          updatedAt: data.updatedAt || data.createdAt || ''
        });
      });

      // 4. Fetch Invoices
      const invoiceQuery = query(collection(db, 'invoices'), where('userId', '==', userId));
      const invoiceSnap = await getDocs(invoiceQuery);
      invoiceSnap.forEach((inv) => {
        const data = inv.data();
        itemsList.push({
          id: inv.id,
          title: `Invoice ${data.invoiceNumber || 'No-ID'}`,
          subtitle: `Client: ${data.clientName || 'Private Client'} • Status: ${data.status || 'draft'} • Total: $${(data.totals || 0).toFixed(2)}`,
          type: 'invoice',
          typeName: 'Invoice Maker',
          updatedAt: data.updatedAt || data.createdAt || ''
        });
      });

      // Sort items by modification date
      itemsList.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setAllItems(itemsList);
    } catch (err) {
      console.error("Failed fetching search palette documents:", err);
    } finally {
      setLoading(false);
    }
  };

  // Keyboard shortcut listener for K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // Trigger open via custom state trigger or directly via callbacks if we expose it
          const bttn = document.getElementById('command-palette-trigger');
          if (bttn) bttn.click();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Handle inner list keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filtered.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filtered.length);
      scrollSelectedIntoView((selectedIndex + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      scrollSelectedIntoView((selectedIndex - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filtered[selectedIndex];
      if (selected) {
        onSelectItem(selected.type, selected.id);
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const scrollSelectedIntoView = (index: number) => {
    setTimeout(() => {
      const container = listRef.current;
      const selectedElement = container?.children[index] as HTMLElement;
      if (container && selectedElement) {
        const offsetTop = selectedElement.offsetTop;
        const offsetHeight = selectedElement.offsetHeight;
        const containerHeight = container.offsetHeight;
        const scrollTop = container.scrollTop;

        if (offsetTop + offsetHeight > scrollTop + containerHeight) {
          container.scrollTop = offsetTop + offsetHeight - containerHeight;
        } else if (offsetTop < scrollTop) {
          container.scrollTop = offsetTop;
        }
      }
    }, 10);
  };

  const filtered = allItems.filter(item => {
    const searchLower = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(searchLower) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(searchLower)) ||
      item.typeName.toLowerCase().includes(searchLower)
    );
  });

  // Reset selection index if query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  const highlightMatch = (text: string, queryText: string) => {
    if (!queryText) return <span>{text}</span>;
    const index = text.toLowerCase().indexOf(queryText.toLowerCase());
    if (index === -1) return <span>{text}</span>;
    
    const before = text.substring(0, index);
    const match = text.substring(index, index + queryText.length);
    const after = text.substring(index + queryText.length);

    return (
      <span>
        {before}
        <mark className="bg-yellow-100 text-yellow-950 px-0.5 rounded font-bold underline decoration-indigo-500/40">{match}</mark>
        {after}
      </span>
    );
  };

  const getCategoryThemeColors = (type: 'document' | 'spreadsheet' | 'note' | 'invoice') => {
    switch (type) {
      case 'document':
        return { 
          bg: 'bg-violet-50 dark:bg-violet-955/40 text-violet-600 dark:text-violet-400', 
          border: 'border-violet-100 dark:border-violet-900/40', 
          icon: FileText 
        };
      case 'spreadsheet':
        return { 
          bg: 'bg-emerald-50 dark:bg-emerald-955/40 text-emerald-600 dark:text-emerald-400', 
          border: 'border-emerald-100 dark:border-emerald-900/40', 
          icon: Grid 
        };
      case 'note':
        return { 
          bg: 'bg-amber-50 dark:bg-amber-955/40 text-amber-600 dark:text-amber-400', 
          border: 'border-amber-100 dark:border-amber-900/40', 
          icon: Award 
        };
      case 'invoice':
        return { 
          bg: 'bg-rose-50 dark:bg-rose-955/40 text-rose-600 dark:text-rose-400', 
          border: 'border-rose-100 dark:border-rose-900/40', 
          icon: Receipt 
        };
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[999] flex items-start justify-center p-4 sm:p-12 md:p-24" id="command-palette-wrapper">
          {/* Backdrop overlay */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-md" 
            id="command-palette-backdrop"
          />

          {/* Palette Container */}
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', duration: 0.3, bounce: 0.15 }}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-205 dark:border-slate-800 shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[70vh] z-10 relative"
            onKeyDown={handleKeyDown}
          >
            {/* Search Input Bar */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-805 flex items-center gap-3 relative bg-slate-50/50 dark:bg-slate-950/30">
              <Search className="h-5 w-5 text-slate-400 dark:text-slate-500 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type a title, document info, client, or category..."
                className="w-full bg-transparent border-none text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-0 text-sm py-0.5"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-805 rounded-full text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Helper Hint Bar */}
            <div className="bg-slate-100/60 dark:bg-slate-950/60 px-5 py-1.5 border-b border-slate-200 dark:border-slate-805 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-medium">
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-indigo-550 dark:text-indigo-400" />
                <span>Searching WorkSuite Registry</span>
              </span>
              <span className="hidden sm:inline">Use ↑↓ keys to look through • Enter to jump</span>
            </div>

            {/* Results Grid / List */}
            <div 
              ref={listRef} 
              className="flex-1 overflow-y-auto p-3 space-y-1.5 bg-slate-55/35 bg-slate-50/30 dark:bg-slate-950/15 divide-y divide-transparent scrollbar"
              style={{ minHeight: '120px' }}
            >
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400 mb-3" />
                  <p className="text-xs font-semibold">Updating indexes...</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-slate-400 dark:text-slate-555">
                  <FolderOpen className="h-10 w-10 text-slate-200 dark:text-slate-800 mx-auto mb-2.5" />
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">No matching documents found</p>
                  <p className="text-[10px] text-slate-455 dark:text-slate-500 mt-1">Try another keyword, ID status, or client name</p>
                </div>
              ) : (
                filtered.map((item, idx) => {
                  const isSelected = idx === selectedIndex;
                  const config = getCategoryThemeColors(item.type);
                  const Icon = config.icon;

                  return (
                    <div
                      key={`${item.type}-${item.id}`}
                      onClick={() => {
                        onSelectItem(item.type, item.id);
                        onClose();
                      }}
                      className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                        isSelected 
                          ? 'bg-indigo-600/5 dark:bg-indigo-950/30 hover:bg-indigo-600/10 border-indigo-600/30 dark:border-indigo-500/25 ring-1 ring-indigo-600/20 shadow-sm' 
                          : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-850 hover:border-slate-200/80 dark:hover:border-slate-750 hover:bg-slate-50/60 dark:hover:bg-slate-850/40'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {/* Icon identifier */}
                        <div className={`p-2 rounded-lg shrink-0 border ${config.bg} ${config.border}`}>
                          <Icon className="h-4.5 w-4.5" />
                        </div>

                        {/* Title and details */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className={`text-xs font-bold leading-none ${isSelected ? 'text-indigo-950 dark:text-indigo-250 font-extrabold' : 'text-slate-800 dark:text-slate-200'}`}>
                              {highlightMatch(item.title, searchQuery)}
                            </h4>
                            <span className="text-[9px] uppercase tracking-wider bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500 dark:text-slate-400 font-bold">
                              {highlightMatch(item.typeName, searchQuery)}
                            </span>
                          </div>
                          {item.subtitle && (
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-1 leading-normal max-w-lg">
                              {highlightMatch(item.subtitle, searchQuery)}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Jump action hint */}
                      <div className="flex items-center gap-1 text-slate-300 dark:text-slate-600">
                        {isSelected && (
                          <span className="text-[9px] text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider hidden sm:inline mr-1">
                            Go to
                          </span>
                        )}
                        <ArrowRight className={`h-4 w-4 transition-transform ${isSelected ? 'text-indigo-600 dark:text-indigo-400 translate-x-0.5' : 'text-slate-300 dark:text-slate-605'}`} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer ShortCuts Bar */}
            <div className="bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-850 px-5 py-3 flex items-center justify-between gap-4 text-[10px] text-slate-455 dark:text-slate-500 font-mono">
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded shadow-sm">ESC</span>
                <span>to close</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded shadow-sm">⌘ K</span>
                <span>or</span>
                <span className="px-1.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded shadow-sm">Ctrl K</span>
                <span>shortcut toggle</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
