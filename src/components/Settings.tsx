import React, { useState, useEffect } from 'react';
import { 
  User, Mail, Shield, LogOut, Check, FileText, Grid, Receipt, 
  DollarSign, Activity, Settings as SettingsIcon, Award, UserCheck 
} from 'lucide-react';
import { updateProfile, signOut } from 'firebase/auth';
import { auth, db } from '../lib/firebase.ts';
import { collection, query, where, getDocs } from 'firebase/firestore';

interface SettingsProps {
  userId: string;
  email: string;
  displayName: string;
  photoURL?: string;
}

export default function Settings({ userId, email, displayName, photoURL }: SettingsProps) {
  const [name, setName] = useState(displayName || 'WorkSuite Colleague');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Statistics
  const [stats, setStats] = useState({
    docsCount: 0,
    sheetsCount: 0,
    notesCount: 0,
    invoicesCount: 0,
    invoiceTotal: 0
  });

  useEffect(() => {
    setName(displayName || 'WorkSuite Colleague');
  }, [displayName]);

  // Load user files stats
  useEffect(() => {
    if (!db || !userId) return;
    const fetchStats = async () => {
      try {
        const qDocs = query(collection(db, 'documents'), where('userId', '==', userId));
        const qSheets = query(collection(db, 'spreadsheets'), where('userId', '==', userId));
        const qNotes = query(collection(db, 'notes'), where('userId', '==', userId));
        const qInvoices = query(collection(db, 'invoices'), where('userId', '==', userId));

        const [sDocs, sSheets, sNotes, sInvoices] = await Promise.all([
          getDocs(qDocs),
          getDocs(qSheets),
          getDocs(qNotes),
          getDocs(qInvoices)
        ]);

        let sumInvoices = 0;
        sInvoices.forEach(docSnap => {
          const dat = docSnap.data();
          sumInvoices += dat.totals || 0;
        });

        setStats({
          docsCount: sDocs.size,
          sheetsCount: sSheets.size,
          notesCount: sNotes.size,
          invoicesCount: sInvoices.size,
          invoiceTotal: sumInvoices
        });
      } catch (err) {
        console.error("Error reading metrics in settings: ", err);
      }
    };

    fetchStats();
  }, [userId]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    setSaving(true);
    setSaved(false);
    try {
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: name.trim()
        });
      } else {
        const storedLocal = localStorage.getItem('worksuite-local-user-active');
        if (storedLocal) {
          const parsed = JSON.parse(storedLocal);
          parsed.displayName = name.trim();
          localStorage.setItem('worksuite-local-user-active', JSON.stringify(parsed));
          window.dispatchEvent(new CustomEvent('local-profile-updated', { detail: parsed }));
        }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error("Error updating user display name:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    if (window.confirm("Are you sure you want to log out of WorkSuite?")) {
      localStorage.removeItem('worksuite-local-user-active');
      window.dispatchEvent(new CustomEvent('local-logout'));
      try {
        await signOut(auth);
      } catch (e) {
        console.error(e);
      }
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8" id="settings-management-panel">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-slate-800">Account & Profile Settings</h2>
        <p className="text-xs text-slate-500">Configure your nickname and inspect your suite metrics ledger.</p>
      </div>

      {/* Grid split */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Editor container card */}
        <div className="md:col-span-7 bg-white p-6 rounded-xl border border-slate-100 shadow-sm space-y-6">
          <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-violet-600" />
            <span>Profile Identity</span>
          </h3>

          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl">
              <div className="h-14 w-14 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-lg border-2 border-white shadow-md">
                {photoURL ? (
                  <img src={photoURL} alt={displayName} className="h-full w-full rounded-full object-cover" />
                ) : (
                  (name || 'W').charAt(0).toUpperCase()
                )}
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-slate-800 truncate">{name}</h4>
                <p className="text-[11px] text-slate-400 truncate">{email}</p>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Display Nickname</label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="WorkSuite User"
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2.5 bg-slate-50/20 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="py-2 px-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-semibold rounded-lg shadow-sm hover:from-violet-700 hover:to-indigo-700 transition flex items-center gap-1"
              >
                {saving ? "Updating..." : "Save Identity"}
                {saved && <Check className="h-3 w-3 text-white" />}
              </button>

              <button
                type="button"
                onClick={handleSignOut}
                className="py-2 px-4 border border-rose-200 hover:bg-rose-50 text-rose-600 text-xs font-semibold rounded-lg transition flex items-center gap-1.5"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Log Out</span>
              </button>
            </div>
          </form>

          {/* Identity Security */}
          <div className="pt-4 border-t border-slate-100 flex items-start gap-2.5 text-xs text-slate-400">
            <Shield className="h-4 w-4 text-violet-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-600">Database Safety</p>
              <p className="text-[11px]">All connections utilize individual Firestore rules, meaning only you can retrieve or edit documents synced with your Firebase UID.</p>
            </div>
          </div>
        </div>

        {/* Statistics panel */}
        <div className="md:col-span-5 bg-white p-6 rounded-xl border border-slate-100 shadow-sm space-y-6">
          <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-2">
            <Activity className="h-4 w-4 text-violet-600" />
            <span>Suite Metrics</span>
          </h3>

          <div className="space-y-4">
            {/* Word documents */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-sky-50 text-sky-600 rounded">
                  <FileText className="h-4 w-4" />
                </div>
                <span className="text-xs font-medium text-slate-600">Word Documents</span>
              </div>
              <span className="text-xs font-bold font-mono text-slate-800">{stats.docsCount}</span>
            </div>

            {/* Spreadsheets */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded">
                  <Grid className="h-4 w-4" />
                </div>
                <span className="text-xs font-medium text-slate-600">Spreadsheets</span>
              </div>
              <span className="text-xs font-bold font-mono text-slate-800">{stats.sheetsCount}</span>
            </div>

            {/* Balances logs */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-amber-50 text-amber-600 rounded">
                  <Award className="h-4 w-4" />
                </div>
                <span className="text-xs font-medium text-slate-600">Financial Ledger Notes</span>
              </div>
              <span className="text-xs font-bold font-mono text-slate-800">{stats.notesCount}</span>
            </div>

            {/* Invoices */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded">
                  <Receipt className="h-4 w-4" />
                </div>
                <span className="text-xs font-medium text-slate-600">Billing Invoices</span>
              </div>
              <span className="text-xs font-bold font-mono text-slate-800">{stats.invoicesCount}</span>
            </div>

            {/* Total balance */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-violet-600 text-white rounded">
                  <DollarSign className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold text-slate-700">Total Billed Invoiced</span>
              </div>
              <span className="text-sm font-black font-mono text-violet-600">${stats.invoiceTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
