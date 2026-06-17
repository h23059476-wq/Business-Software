import React, { useState, useEffect } from 'react';
import { 
  Building2, Plus, Trash2, Download, Search, Sparkles, RefreshCw, 
  Settings, Save, FileDown, ArrowUpDown, ChevronRight, AlertCircle, Edit2
} from 'lucide-react';
import { 
  db, handleFirestoreError,
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot
} from '../lib/firebase.ts';
import { AccountSummaryData } from '../types.ts';
import { jsPDF } from 'jspdf';

interface AccountsSummaryProps {
  userId: string;
}

export default function AccountsSummary({ userId }: AccountsSummaryProps) {
  const [accounts, setAccounts] = useState<AccountSummaryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'sr' | 'name' | 'dept' | 'credit'>('sr');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Input states for new item
  const [newSr, setNewSr] = useState('');
  const [newName, setNewName] = useState('');
  const [newDept, setNewDept] = useState('');
  const [newCredit, setNewCredit] = useState<number | ''>('');
  
  // Edit mode states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSr, setEditSr] = useState('');
  const [editName, setEditName] = useState('');
  const [editDept, setEditDept] = useState('');
  const [editCredit, setEditCredit] = useState<number>(0);

  // AI Generation state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Listen to accounts
  useEffect(() => {
    if (!db || !userId) return;
    const q = query(
      collection(db, 'accounts'),
      where('userId', '==', userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: AccountSummaryData[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as AccountSummaryData);
      });
      setAccounts(items);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Loading error in Accounts Summary: ", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  // Handle Add Item
  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSr.trim() || !newName.trim() || !newDept.trim() || newCredit === '') return;

    try {
      const payload = {
        userId,
        sr: newSr.trim(),
        name: newName.trim(),
        dept: newDept.trim(),
        credit: Number(newCredit),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'accounts'), payload);
      
      // Clear inputs
      setNewSr('');
      setNewName('');
      setNewDept('');
      setNewCredit('');
    } catch (err) {
      console.error("Error creating Account summary entry: ", err);
    }
  };

  // Start Inline Editing
  const startEditing = (acc: AccountSummaryData) => {
    setEditingId(acc.id);
    setEditSr(acc.sr);
    setEditName(acc.name);
    setEditDept(acc.dept);
    setEditCredit(acc.credit);
  };

  // Save Inline Editing
  const saveEditing = async (id: string) => {
    try {
      const ref = doc(db, 'accounts', id);
      await updateDoc(ref, {
        sr: editSr,
        name: editName,
        dept: editDept,
        credit: Number(editCredit),
        updatedAt: new Date().toISOString()
      });
      setEditingId(null);
    } catch (err) {
      console.error("Failed to edit account node: ", err);
    }
  };

  // Delete Item
  const handleDeleteAccount = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'accounts', id));
    } catch (err) {
      console.error("Error deleting Account summary entry: ", err);
    }
  };

  // Autocomplete mock data entries via AI
  const handleAiAutoFill = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: "Generate a list of 4 realistic corporate corporate accounts summaries. Each record must have exactly: Serial Number (e.g. S-101), Name of holder, Department of the holder, and Credit numeric dollars count. Return ONLY a valid JSON array of objects representing this list, with keys 'sr', 'name', 'dept', and 'credit' as a numeric value. No other text around the JSON array.",
          context: "accounts_summary"
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Extract JSON array
      const text = data.text || '';
      const startIdx = text.indexOf('[');
      const endIdx = text.lastIndexOf(']');
      if (startIdx === -1 || endIdx === -1) {
        throw new Error("Could not parse JSON array from AI output.");
      }
      
      const jsonStr = text.substring(startIdx, endIdx + 1);
      const parsedArray = JSON.parse(jsonStr);

      for (const item of parsedArray) {
        if (item.sr && item.name && item.dept && typeof item.credit !== 'undefined') {
          await addDoc(collection(db, 'accounts'), {
            userId,
            sr: String(item.sr),
            name: String(item.name),
            dept: String(item.dept),
            credit: Number(item.credit),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
      }
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Failed to generate mock indices.");
    } finally {
      setAiLoading(false);
    }
  };

  // Sort and filter logic
  const handleSort = (field: 'sr' | 'name' | 'dept' | 'credit') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const filteredAccounts = accounts
    .filter(acc => {
      const search = searchQuery.toLowerCase();
      return (
        acc.sr.toLowerCase().includes(search) ||
        acc.name.toLowerCase().includes(search) ||
        acc.dept.toLowerCase().includes(search)
      );
    })
    .sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      } else {
        return sortOrder === 'asc' 
          ? (aVal as number) - (bVal as number) 
          : (bVal as number) - (aVal as number);
      }
    });

  // Export full accounts list as PDF
  const handleExportPDF = () => {
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

      // Draw PDF branding
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(20);
      doc.setTextColor(79, 70, 229); // Violet brand color
      doc.text("WorkSuite Portal", margin, y);
      y += 8;

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(31, 41, 55); // Slate slate-800
      doc.text("Accounts Summary Statement", margin, y);
      y += 6;

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(107, 114, 128); // Slate slate-400
      doc.text(`Generated on ${new Date().toLocaleString()} | User Scope ID: ${userId.substring(0, 8)}...`, margin, y);
      y += 8;

      // Horizontal ruled separator line
      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageWidth - margin, y);
      y += 10;

      // Draw Grid / Table header columns
      const colWidths = [24, 52, 48, 46]; // Sums up to 170 (Content width: 210 - 40 = 170)
      
      // Header fill background tint
      doc.setFillColor(243, 244, 246);
      doc.rect(margin, y, contentWidth, 8, 'F');

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(55, 65, 81);

      const headers = ["Serial No", "Account Name", "Department", "Credit Balance"];
      let x = margin;
      headers.forEach((h, i) => {
        const align = i === 3 ? 'right' : 'left';
        const txtX = align === 'right' ? x + colWidths[i] - 3 : x + 3;
        doc.text(h, txtX, y + 5.5, { align });
        x += colWidths[i];
      });

      doc.line(margin, y + 8, pageWidth - margin, y + 8);
      y += 8;

      // Elements table rows
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(75, 85, 99);

      let totalCredits = 0;

      filteredAccounts.forEach((acc, index) => {
        // Stripe rows alternatively
        if (index % 2 === 1) {
          doc.setFillColor(249, 250, 251);
          doc.rect(margin, y, contentWidth, 7.5, 'F');
        }

        let currX = margin;
        
        // Sr No
        doc.setFont("Helvetica", "bold");
        doc.text(acc.sr, currX + 3, y + 5);
        currX += colWidths[0];

        // Name
        doc.setFont("Helvetica", "normal");
        const cutName = acc.name.length > 25 ? acc.name.substring(0, 24) + '..' : acc.name;
        doc.text(cutName, currX + 3, y + 5);
        currX += colWidths[1];

        // Dept
        const cutDept = acc.dept.length > 25 ? acc.dept.substring(0, 24) + '..' : acc.dept;
        doc.text(cutDept, currX + 3, y + 5);
        currX += colWidths[2];

        // Credit
        doc.setFont("Helvetica", "bold");
        doc.setTextColor(31, 41, 55);
        const creditString = `$${acc.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        doc.text(creditString, currX + colWidths[3] - 3, y + 5, { align: 'right' });
        
        totalCredits += acc.credit;
        y += 7.5;

        // Draw light bottom border
        doc.setDrawColor(243, 244, 246);
        doc.line(margin, y, pageWidth - margin, y);
      });

      // Show total summary row
      y += 4;
      doc.setDrawColor(156, 163, 175);
      doc.setLineWidth(0.6);
      doc.line(margin, y, pageWidth - margin, y);
      
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(17, 24, 39);
      doc.text("Total Credit Portfolio Balance", margin + 3, y + 6.5);
      
      const totalStr = `$${totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
      doc.text(totalStr, pageWidth - margin - 3, y + 6.5, { align: 'right' });

      doc.save(`accounts_summary_${new Date().toISOString().substring(0,10)}.pdf`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col" id="accounts-summary-wrapper">
      {/* Widget Header Toolbar */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/40 dark:bg-slate-950/40">
        <div>
          <h3 className="font-bold text-slate-850 dark:text-slate-100 text-base tracking-tight flex items-center gap-2">
            <Building2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <span>Interactive Accounts Summary Node</span>
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Maintain audit logs of client accounts departments, serial credits, and portfolio statistics.</p>
        </div>

        <div className="flex items-center gap-2">
          {/* AI Generator Button */}
          <button
            onClick={handleAiAutoFill}
            disabled={aiLoading}
            className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-150 dark:border-indigo-800 text-indigo-700 dark:text-indigo-305 text-xs rounded-lg font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            {aiLoading ? (
              <RefreshCw className="h-3 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-4" />
            )}
            <span>AI Generate Mock Entries</span>
          </button>

          {/* PDF exporter button */}
          <button
            onClick={handleExportPDF}
            className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-150 dark:border-rose-900/50 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-xs font-bold rounded-lg transition flex items-center gap-1.5 shadow-sm cursor-pointer"
            title="Export full account summary table to PDF"
          >
            <FileDown className="h-3.5 w-3.5" />
            <span>Export Statement</span>
          </button>
        </div>
      </div>

      {aiError && (
        <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/80 rounded-lg text-red-655 dark:text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{aiError}</span>
        </div>
      )}

      {/* Grid Layout containing Input Form and Live Registry Table side by side */}
      <div className="p-6 grid grid-cols-1 xl:grid-cols-12 gap-6 min-h-0">
        
        {/* Left Column: Register New Record Form */}
        <form onSubmit={handleAddAccount} className="xl:col-span-4 bg-slate-50/50 dark:bg-slate-950/40 p-5 rounded-xl border border-slate-100 dark:border-slate-800/80 flex flex-col gap-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Add Account Record</h4>
          
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Serial Number</label>
            <input
              type="text"
              required
              placeholder="e.g. SR-101"
              value={newSr}
              onChange={e => setNewSr(e.target.value)}
              className="w-full text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-805 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Account Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Alice Cooper"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="w-full text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-805 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Department</label>
            <input
              type="text"
              required
              placeholder="e.g. Sales / Operations"
              value={newDept}
              onChange={e => setNewDept(e.target.value)}
              className="w-full text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-805 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Credit ($)</label>
            <input
              type="number"
              required
              placeholder="e.g. 1500"
              value={newCredit}
              onChange={e => setNewCredit(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-805 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition shadow-sm mt-2 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Create Entry</span>
          </button>
        </form>

        {/* Right Column: Live Synced Accounts Registry Table */}
        <div className="xl:col-span-8 flex flex-col gap-4 min-h-0">
          
          {/* Table Controls (Search filter) */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </span>
            <input
              type="text"
              placeholder="Filter by Name, Serial Code or Department..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 dark:border-slate-805 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-505 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
            />
          </div>

          {/* Table box layout */}
          <div className="border border-slate-150 dark:border-slate-800 rounded-xl overflow-hidden flex-1 overflow-x-auto bg-white dark:bg-slate-900">
            {loading ? (
              <div className="text-center py-12 text-slate-400 font-mono text-xs flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-indigo-6 * * *" />
                <span>Synchronizing database...</span>
              </div>
            ) : filteredAccounts.length === 0 ? (
              <div className="text-center py-12 text-slate-400 bg-slate-5/20 dark:bg-slate-950/20">
                <Building2 className="h-10 w-10 text-slate-200 dark:text-slate-820 dark:text-slate-800 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">No account entries cataloged.</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Add an entry manually or use AI simulation.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-150 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 select-none">
                    <th onClick={() => handleSort('sr')} className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <span>Sr. No</span>
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </th>
                    <th onClick={() => handleSort('name')} className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <span>Name</span>
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </th>
                    <th onClick={() => handleSort('dept')} className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <span>Department</span>
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </th>
                    <th onClick={() => handleSort('credit')} className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <span>Credit ($)</span>
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs text-slate-705 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900">
                  {filteredAccounts.map((acc, keyIdx) => {
                    const isEditing = editingId === acc.id;
                    return (
                      <tr key={acc.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-950/40 transition font-sans">
                        {/* Sr Column */}
                        <td className="px-4 py-3 font-semibold text-slate-850 dark:text-slate-200">
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editSr} 
                              onChange={e => setEditSr(e.target.value)}
                              className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-slate-800 dark:text-slate-100 text-xs w-20 rounded"
                            />
                          ) : (
                            acc.sr
                          )}
                        </td>

                        {/* Name Column */}
                        <td className="px-4 py-3 font-medium">
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editName} 
                              onChange={e => setEditName(e.target.value)}
                              className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-slate-800 dark:text-slate-100 text-xs w-full rounded"
                            />
                          ) : (
                            acc.name
                          )}
                        </td>

                        {/* Department Column */}
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editDept} 
                              onChange={e => setEditDept(e.target.value)}
                              className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-slate-800 dark:text-slate-100 text-xs w-full rounded"
                            />
                          ) : (
                            acc.dept
                          )}
                        </td>

                        {/* Credit balances Column */}
                        <td className="px-4 py-3 text-right font-bold text-slate-800 dark:text-slate-100 font-mono">
                          {isEditing ? (
                            <input 
                              type="number" 
                              value={editCredit} 
                              onChange={e => setEditCredit(Number(e.target.value))}
                              className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-slate-800 dark:text-slate-100 text-xs w-28 text-right rounded"
                            />
                          ) : (
                            `$${acc.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                          )}
                        </td>

                        {/* Action Nodes */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {isEditing ? (
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => saveEditing(acc.id)}
                                type="button"
                                className="p-1 px-2.5 bg-emerald-600 font-bold hover:bg-emerald-700 text-white rounded transition text-[10px] cursor-pointer"
                                title="Save change"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                type="button"
                                className="p-1 px-2.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded transition text-[10px] cursor-pointer"
                                title="Cancel change"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-end items-center gap-2">
                              <button
                                onClick={() => startEditing(acc)}
                                className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer"
                                title="Edit this entry"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteAccount(acc.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer"
                                title="Delete this entry"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          
          {/* Table cumulative sum tracker footer banner */}
          {!loading && filteredAccounts.length > 0 && (
            <div className="p-3.5 bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-800 rounded-xl flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
              <span className="font-semibold text-slate-500 dark:text-slate-400">Total Credits Listed:</span>
              <span className="font-black text-slate-850 dark:text-slate-105 dark:text-slate-100 font-mono text-sm">
                ${filteredAccounts.reduce((sum, item) => sum + item.credit, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
