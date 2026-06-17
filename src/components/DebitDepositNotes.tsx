import React, { useState, useEffect } from 'react';
import { 
  ArrowUpRight, ArrowDownLeft, Plus, DollarSign, Calendar, 
  Trash2, TrendingUp, TrendingDown, BookOpen, Clock, AlertCircle, FileText 
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { NoteData } from '../types.ts';

interface DebitDepositNotesProps {
  userId: string;
  onSelectContentForAi?: (text: string) => void;
  activeNoteId?: string | null;
  initialAdoptedText?: string | null;
  clearAdoptedText?: () => void;
}

export default function DebitDepositNotes({ 
  userId, 
  onSelectContentForAi, 
  activeNoteId,
  initialAdoptedText,
  clearAdoptedText
}: DebitDepositNotesProps) {
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [loading, setLoading] = useState(true);

  // AI Suggestions import queue state
  const [aiTxQueue, setAiTxQueue] = useState<Omit<NoteData, 'id' | 'createdAt'>[]>([]);

  useEffect(() => {
    if (!initialAdoptedText) {
      setAiTxQueue([]);
      return;
    }

    try {
      const rx = /\[TX_RECORD:\s*title="([^"]+)"\s*type="([^"]+)"\s*amount="([^"]+)"\s*description="([^"]+)"\]/g;
      let match;
      const parsedRecords: Omit<NoteData, 'id' | 'createdAt'>[] = [];
      
      while ((match = rx.exec(initialAdoptedText)) !== null) {
        const titleStr = match[1];
        const typeStr = (match[2] === 'debit' || match[2] === 'deposit') ? match[2] : 'deposit';
        const amountNum = parseFloat(match[3]) || 0;
        const descStr = match[4];
        
        parsedRecords.push({
          userId,
          title: titleStr,
          type: typeStr as 'deposit' | 'debit',
          amount: amountNum,
          description: descStr,
          date: new Date().toISOString().substring(0, 10),
          updatedAt: new Date().toISOString()
        });
      }

      setAiTxQueue(parsedRecords);
    } catch (err) {
      console.error("Failed to parse ledger records", err);
    }
  }, [initialAdoptedText]);

  const handleImportAllRecords = async () => {
    if (aiTxQueue.length === 0) return;
    setSubmitting(true);
    try {
      for (const rx of aiTxQueue) {
        await addDoc(collection(db, 'notes'), {
          ...rx,
          createdAt: new Date().toISOString()
        });
      }

      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: {
          title: 'Account Ledger Synced',
          message: `Successfully loaded and saved ${aiTxQueue.length} entries.`,
          type: 'success'
        }
      }));

      setAiTxQueue([]);
      if (clearAdoptedText) clearAdoptedText();
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'notes');
    } finally {
      setSubmitting(false);
    }
  };

  // Scroll to active note if selected from command palette
  useEffect(() => {
    if (activeNoteId) {
      setTimeout(() => {
        const el = document.getElementById(`note-${activeNoteId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    }
  }, [activeNoteId]);

  // Form Fields
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'debit' | 'deposit'>('deposit');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10)); // YYYY-MM-DD
  const [submitting, setSubmitting] = useState(false);

  // Fetch from Firestore
  useEffect(() => {
    const q = query(
      collection(db, 'notes'),
      where('userId', '==', userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notesData: NoteData[] = [];
      snapshot.forEach((docSnap) => {
        notesData.push({ id: docSnap.id, ...docSnap.data() } as NoteData);
      });
      // Sort oldest to newest
      notesData.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
      setNotes(notesData);
      setLoading(false);
    }, (error) => {
      console.error("Firestore listening error in checkbook balance log: ", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  // Calculations
  const totalDeposits = notes
    .filter(n => n.type === 'deposit')
    .reduce((sum, n) => sum + n.amount, 0);

  const totalDebits = notes
    .filter(n => n.type === 'debit')
    .reduce((sum, n) => sum + n.amount, 0);

  const netBalance = totalDeposits - totalDebits;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !amount || submitting) return;

    setSubmitting(true);
    try {
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount < 0) {
        alert("Please enter a valid positive numerical amount.");
        setSubmitting(false);
        return;
      }

      const newNote = {
        userId,
        title: title.trim(),
        type,
        amount: numAmount,
        description: description.trim(),
        date,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'notes'), newNote);
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: {
          title: 'Ledger Record Logged',
          message: `${type === 'deposit' ? 'Deposit' : 'Debit'} of $${newNote.amount.toLocaleString()} logged: "${newNote.title}"`,
          type: 'save'
        }
      }));
      
      // Reset forms
      setTitle('');
      setAmount('');
      setDescription('');
      setDate(new Date().toISOString().substring(0, 10));
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'notes');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to remove this ledger record?")) return;

    try {
      await deleteDoc(doc(db, 'notes', id));
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: {
          title: 'Ledger Record Deleted',
          message: `The transaction has been successfully deleted from the ledger database.`,
          type: 'system'
        }
      }));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `notes/${id}`);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8" id="debit-deposit-notes">
      {/* Page Title */}
      <div className="border-b border-slate-200 pb-5">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Ledger & Transactions</h2>
        <p className="text-slate-500 mt-1">Log financial transactions, draft work group expenses, and audit active balances securely.</p>
      </div>

      {/* AI Transaction Import Queue suggestion */}
      {aiTxQueue.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-sm animate-fade-in text-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <BookOpen className="h-5.5 w-5.5 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
              <div>
                <p className="font-bold text-sm text-slate-900">AI Ledger Imports ready</p>
                <p className="text-xs text-slate-600 mt-1">
                  We parsed <span className="font-bold text-amber-700">{aiTxQueue.length} transaction records</span> from your imported device logs. Would you like to append them permanently to your cash logs?
                </p>
                {/* List items representation */}
                <div className="mt-3 flex flex-wrap gap-2 max-h-24 overflow-y-auto pr-1">
                  {aiTxQueue.map((item, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/80 border border-amber-200 rounded-lg text-[11px] font-medium shadow-2xs">
                      <span className={`w-1.5 h-1.5 rounded-full ${item.type === 'deposit' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      <span className="font-bold text-slate-800">{item.title}</span> 
                      <span className="text-slate-400 font-mono">(${item.amount})</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex sm:flex-col gap-2 shrink-0 md:items-end">
              <button
                type="button"
                onClick={handleImportAllRecords}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition cursor-pointer"
              >
                Import All ({aiTxQueue.length})
              </button>
              <button
                type="button"
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100/80 rounded-xl text-xs font-semibold bg-white text-slate-600 transition cursor-pointer"
                onClick={() => {
                  setAiTxQueue([]);
                  if (clearAdoptedText) clearAdoptedText();
                }}
              >
                Ignore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ledger Cards Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Deposits */}
        <div className="bg-white px-5 py-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between hover:translate-y-[-1px] transition-all">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Deposits</span>
            <div className="text-2xl font-bold text-emerald-600 mt-1">${totalDeposits.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <TrendingUp className="h-5 w-5" />
          </div>
        </div>

        {/* Total Debits */}
        <div className="bg-white px-5 py-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between hover:translate-y-[-1px] transition-all">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Debits</span>
            <div className="text-2xl font-bold text-rose-600 mt-1">${totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
            <TrendingDown className="h-5 w-5" />
          </div>
        </div>

        {/* Net Balance */}
        <div className={`px-5 py-5 rounded-2xl shadow-sm flex items-center justify-between hover:translate-y-[-1px] transition-all ${
          netBalance >= 0 ? "bg-indigo-600 text-white shadow-indigo-100" : "bg-white border border-slate-200 text-rose-600"
        }`}>
          <div>
            <span className={`text-xs font-bold uppercase tracking-widest ${netBalance >= 0 ? 'text-indigo-200' : 'text-slate-400'}`}>Net Ledger Balance</span>
            <div className="text-2xl font-bold mt-1">${netBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div className={`p-2.5 rounded-xl ${netBalance >= 0 ? 'bg-white/10 text-white' : 'bg-rose-50 text-rose-600'}`}>
            <DollarSign className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Grid split form and summary log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form panel */}
        <form onSubmit={handleSubmit} className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
          <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Plus className="h-4.5 w-4.5 text-indigo-600" />
            <span>Create Financial Note</span>
          </h3>

          {/* Type Select buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType('deposit')}
              className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-semibold border transition-all ${
                type === 'deposit' 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <ArrowUpRight className="h-4 w-4" />
              <span>Deposit (+)</span>
            </button>
            <button
              type="button"
              onClick={() => setType('debit')}
              className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-semibold border transition-all ${
                type === 'debit' 
                  ? 'bg-rose-50 text-rose-700 border-rose-200' 
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <ArrowDownLeft className="h-4 w-4" />
              <span>Debit (-)</span>
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Title / Subject</label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Q2 Server Hosting Bill"
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-300 bg-slate-50/50 focus:bg-white transition-all focus:ring-0"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Amount (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 text-xs">$</span>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="249.99"
                  className="w-full text-xs border border-slate-200 rounded-lg pl-7 pr-3 py-2.5 focus:outline-none focus:border-indigo-300 bg-slate-50/50 focus:bg-white transition-all focus:ring-0"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Transaction Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-300 bg-slate-50/50 focus:bg-white transition-all focus:ring-0"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Memo Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Record details about categories, receipts, or external invoices..."
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-300 bg-slate-50/50 focus:bg-white transition-all focus:ring-0"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-indigo-600 text-white font-semibold text-xs rounded-lg shadow-sm hover:bg-indigo-700 shadow-indigo-100 transition-all cursor-pointer"
          >
            {submitting ? "Adding to ledger..." : "Record Transaction"}
          </button>
        </form>

        {/* Historical ledger log list */}
        <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col min-w-0">
          <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2 mb-4">
            <BookOpen className="h-4.5 w-4.5 text-indigo-600" />
            <span>Balance Transaction Logs</span>
          </h3>

          <div className="flex-1 overflow-y-auto space-y-3 max-h-[480px] pr-1.5 scrollbar">
            {loading ? (
              <div className="text-xs text-slate-400 p-8 text-center font-mono flex items-center justify-center gap-2">
                <TrendingUp className="h-4 w-4 animate-spin text-indigo-600" />
                <span>Reading checkbook records...</span>
              </div>
            ) : notes.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <AlertCircle className="h-10 w-10 text-slate-200 mx-auto mb-2" />
                <p className="text-sm">No transaction ledger records logged yet.</p>
                <p className="text-[11px] text-slate-400 mt-1">Submit the ledger note form on the left!</p>
              </div>
            ) : (
              notes.map((note) => (
                <div
                  key={note.id}
                  id={`note-${note.id}`}
                  className={`p-4 rounded-xl border transition-all flex items-start gap-3.5 relative group ${
                    note.id === activeNoteId 
                      ? 'border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-500/30' 
                      : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50/30'
                  }`}
                >
                  {/* Icon indicator */}
                  <div className={`p-2.5 rounded-xl shrink-0 ${
                    note.type === 'deposit' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                  }`}>
                    {note.type === 'deposit' ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                  </div>

                  {/* Body Info */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-slate-800 truncate pr-4">{note.title}</h4>
                      <span className={`text-xs font-bold font-mono ${
                        note.type === 'deposit' ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {note.type === 'deposit' ? '+' : '-'}${note.amount.toFixed(2)}
                      </span>
                    </div>

                    {note.description && (
                      <p className="text-[11px] text-slate-500 whitespace-pre-line leading-relaxed">{note.description}</p>
                    )}

                    <div className="flex items-center gap-3 text-[10px] text-slate-400 select-none">
                      <span className="flex items-center gap-1 font-medium font-mono">
                        <Calendar className="h-3 w-3" />
                        {note.date}
                      </span>
                      {onSelectContentForAi && (
                        <button
                          onClick={() => onSelectContentForAi(`Financial Balance Note detail: [${note.title}] type: [${note.type}] amount: [$${note.amount}] date: [${note.date}]. Description: "${note.description}"`)}
                          type="button"
                          className="text-[10px] text-indigo-600 font-bold hover:underline"
                        >
                          Ask AI about this
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Remove Button */}
                  <button
                    onClick={() => handleDelete(note.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 bg-white hover:bg-rose-50 hover:text-rose-600 text-slate-400 rounded-lg border border-slate-100 transition-all shadow-sm absolute right-2.5 top-2.5 cursor-pointer"
                    title="Remove item"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
