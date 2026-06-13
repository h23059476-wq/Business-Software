import React, { useState, useEffect } from 'react';
import { 
  FileText, Grid, Receipt, Award, DollarSign, Plus, ArrowRight, 
  TrendingUp, TrendingDown, BookOpen, Clock, Sparkles, FolderOpen, AlertCircle
} from 'lucide-react';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import { DocumentData, SpreadsheetData, NoteData, InvoiceData } from '../types.ts';

interface DashboardProps {
  userId: string;
  userDisplayName: string;
  onNavigate: (view: 'dashboard' | 'documents' | 'spreadsheet' | 'notes' | 'invoices' | 'settings') => void;
}

export default function Dashboard({ userId, userDisplayName, onNavigate }: DashboardProps) {
  const [docs, setDocs] = useState<DocumentData[]>([]);
  const [sheets, setSheets] = useState<SpreadsheetData[]>([]);
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [loading, setLoading] = useState(true);

  // Stats
  const [netBalance, setNetBalance] = useState(0);
  const [totalsBilled, setTotalsBilled] = useState(0);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const qD = query(collection(db, 'documents'), where('userId', '==', userId));
        const qS = query(collection(db, 'spreadsheets'), where('userId', '==', userId));
        const qN = query(collection(db, 'notes'), where('userId', '==', userId));
        const qI = query(collection(db, 'invoices'), where('userId', '==', userId));

        const [sD, sS, sN, sI] = await Promise.all([
          getDocs(qD),
          getDocs(qS),
          getDocs(qN),
          getDocs(qI)
        ]);

        const ds: DocumentData[] = [];
        sD.forEach(snap => { ds.push({ id: snap.id, ...snap.data() } as DocumentData); });
        ds.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
        setDocs(ds);

        const ss: SpreadsheetData[] = [];
        sS.forEach(snap => { ss.push({ id: snap.id, ...snap.data() } as SpreadsheetData); });
        ss.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
        setSheets(ss);

        const ns: NoteData[] = [];
        sN.forEach(snap => { ns.push({ id: snap.id, ...snap.data() } as NoteData); });
        ns.sort((a,b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
        setNotes(ns);

        const is: InvoiceData[] = [];
        let totalBillValue = 0;
        sI.forEach(snap => { 
          const element = { id: snap.id, ...snap.data() } as InvoiceData;
          is.push(element);
          totalBillValue += element.totals || 0;
        });
        is.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
        setInvoices(is);
        setTotalsBilled(totalBillValue);

        // Calculate ledgers net
        let deposits = 0;
        let debits = 0;
        ns.forEach(n => {
          if (n.type === 'deposit') deposits += n.amount;
          else debits += n.amount;
        });
        setNetBalance(deposits - debits);

        setLoading(false);
      } catch (err) {
        console.error("Error retrieving dashboard parameters: ", err);
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [userId]);

  // Quick makers
  const triggerQuickMakeDoc = async () => {
    try {
      const obj = {
        userId,
        title: 'New Fast Document',
        content: '<h1>A Fast Document</h1><p>Start writing notes from your Workspace Dashboard...</p>',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await addDoc(collection(db, 'documents'), obj);
      onNavigate('documents');
    } catch (e) {
      console.error(e);
    }
  };

  const triggerQuickMakeSheet = async () => {
    try {
      const obj = {
        userId,
        title: 'New Blank Ledger Grid',
        data: JSON.stringify({
          grid: { "A1": "Description", "B1": "Formula Calc", "A2": "Balance Metric", "B2": "100" },
          cols: ['A', 'B', 'C', 'D'],
          rowsCount: 10
        }),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await addDoc(collection(db, 'spreadsheets'), obj);
      onNavigate('spreadsheet');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8" id="dashboard-hub">
      {/* Greeting Banner */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Welcome back, {userDisplayName || 'User'}</h1>
          <p className="text-slate-500 mt-1">You have {invoices.filter(i => i.status !== 'paid').length} invoices pending payment and {docs.length} active documents.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={triggerQuickMakeSheet}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 transition"
          >
            + New Grid
          </button>
          <button 
            onClick={triggerQuickMakeDoc}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold shadow-sm shadow-indigo-100 hover:bg-indigo-700 transition"
          >
            + New Document
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 font-mono py-12 text-center flex items-center justify-center gap-2">
          <Clock className="h-4 w-4 animate-spin text-indigo-600" />
          <span>Syncing Workspace statistics...</span>
        </div>
      ) : (
        <>
          {/* Statistics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Word Documents Stat */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col gap-1 shadow-sm hover:translate-y-[-1px] transition-all">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Word Documents</p>
              <p className="text-2xl font-bold text-slate-850">{docs.length}</p>
              <div className="mt-2 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-blue-600 h-full" style={{ width: `${Math.min(100, (docs.length / 10) * 100)}%` }}></div>
              </div>
            </div>

            {/* Spreadsheet Stat */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col gap-1 shadow-sm hover:translate-y-[-1px] transition-all">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Spreadsheets</p>
              <p className="text-2xl font-bold text-slate-850">{sheets.length}</p>
              <div className="mt-2 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full" style={{ width: `${Math.min(100, (sheets.length / 5) * 100)}%` }}></div>
              </div>
            </div>

            {/* Ledger Balance Stat */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col gap-1 shadow-sm hover:translate-y-[-1px] transition-all">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ledger Balance</p>
              <p className={`text-2xl font-bold ${netBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                ${netBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-slate-400 font-semibold mt-1">
                {netBalance >= 0 ? "↑ Active healthy profit margin" : "↓ Pending budget deposits"}
              </p>
            </div>

            {/* Invoice Revenue Stat */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col gap-1 shadow-sm hover:translate-y-[-1px] transition-all">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Outstanding Invoices</p>
              <p className="text-2xl font-bold text-indigo-600">
                ${totalsBilled.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-slate-400 font-medium mt-1">
                {invoices.length} invoices generated
              </p>
            </div>
          </div>

          {/* Bottom Table Grid Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
            {/* Word Documents List */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="font-bold text-slate-800 text-sm tracking-tight flex items-center gap-2">
                  <FileText className="h-4.5 w-4.5 text-indigo-500" />
                  <span>Recent Work Documents</span>
                </h3>
                <span 
                  onClick={() => onNavigate('documents')} 
                  className="text-xs text-indigo-600 font-bold cursor-pointer hover:underline"
                >
                  View All
                </span>
              </div>
              <div className="flex-1 overflow-hidden">
                {docs.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <FolderOpen className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-xs">No word documents generated yet.</p>
                  </div>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50/50 text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100 font-bold">
                        <th className="px-6 py-3">Name</th>
                        <th className="px-6 py-3">Type</th>
                        <th className="px-6 py-3">Last Modified</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {docs.slice(0, 4).map(docItem => (
                        <tr 
                          key={docItem.id} 
                          onClick={() => onNavigate('documents')}
                          className="hover:bg-slate-50 cursor-pointer group"
                        >
                          <td className="px-6 py-4 font-semibold text-slate-800 group-hover:text-indigo-600 transition">
                            {docItem.title}
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-600 rounded-full font-bold text-[9px] uppercase tracking-wider">
                              Document
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-400 font-mono">
                            {new Date(docItem.updatedAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Invoices and Clients */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="font-bold text-slate-800 text-sm tracking-tight flex items-center gap-2">
                  <Receipt className="h-4.5 w-4.5 text-indigo-500" />
                  <span>Outstanding Billing Statements</span>
                </h3>
                <span 
                  onClick={() => onNavigate('invoices')} 
                  className="text-xs text-indigo-600 font-bold cursor-pointer hover:underline"
                >
                  Invoice Maker
                </span>
              </div>
              <div className="flex-1 overflow-hidden">
                {invoices.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <AlertCircle className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-xs">No client invoices logged yet.</p>
                  </div>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50/50 text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100 font-bold">
                        <th className="px-6 py-3">Invoice / Client</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3 text-right">Totals Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {invoices.slice(0, 4).map(inv => (
                        <tr 
                          key={inv.id} 
                          onClick={() => onNavigate('invoices')}
                          className="hover:bg-slate-50 cursor-pointer group"
                        >
                          <td className="px-6 py-4 font-semibold text-slate-800 group-hover:text-indigo-600 transition">
                            <span className="block">{inv.invoiceNumber}</span>
                            <span className="text-[10px] text-slate-400 font-normal leading-tight">{inv.clientName}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700'
                            }`}>
                              {inv.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-slate-900 font-mono">
                            ${inv.totals.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
