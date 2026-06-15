import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  signInWithPopup, updateProfile, signOut, User as FirebaseUser 
} from 'firebase/auth';
import { 
  Layout, FileText, Grid, Receipt, Award, Settings as SettingsIcon, 
  LogOut, Sparkles, MessageSquare, Loader2, RefreshCw, Smartphone, 
  Computer, ChevronRight, Lock, Eye, EyeOff, UserCheck, AlertTriangle,
  Mail, Columns, ExternalLink, Columns2, Search, Sun, Moon,
  Bell, Trash, Info, X, Check, Save
} from 'lucide-react';
import { auth, googleAuthProvider } from './lib/firebase.ts';

// Tools Imports
import LetterMaker from './components/LetterMaker.tsx';
import DocumentEditor from './components/DocumentEditor.tsx';
import SpreadsheetEditor from './components/SpreadsheetEditor.tsx';
import DebitDepositNotes from './components/DebitDepositNotes.tsx';
import InvoiceMaker from './components/InvoiceMaker.tsx';
import Settings from './components/Settings.tsx';
import AiAssistant from './components/AiAssistant.tsx';
import CommandPalette from './components/CommandPalette.tsx';

type TabType = 'dashboard' | 'documents' | 'spreadsheet' | 'notes' | 'invoices' | 'settings';

interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'save' | 'ai' | 'system' | 'info';
  timestamp: string;
  read: boolean;
}

function getInitialNotifications(): AppNotification[] {
  return [
    {
      id: 'sys-update-v2',
      title: 'WorkSuite AI Update Live',
      message: 'Workspace split-screen, context-aware AI shortcuts, and multi-format File exporters are now available.',
      type: 'system',
      timestamp: new Date(Date.now() - 3600000 * 2).toISOString(), // 2 hours ago
      read: false
    },
    {
      id: 'sys-db-sync',
      title: 'Cloud Workspace Connected',
      message: 'All spreadsheets, document sheets, and transaction logs are successfully synced with secure Firestore nodes.',
      type: 'info',
      timestamp: new Date(Date.now() - 3600000 * 24).toISOString(), // 1 day ago
      read: true
    }
  ];
}

function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return 'Just now';
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  } catch (e) {
    return 'Just now';
  }
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');

  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    try {
      const stored = localStorage.getItem('worksuite-notifications');
      return stored ? JSON.parse(stored) : getInitialNotifications();
    } catch (e) {
      return getInitialNotifications();
    }
  });
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  useEffect(() => {
    const handleAppNotification = (e: Event) => {
      const customEvent = e as CustomEvent<{
        title: string;
        message: string;
        type: 'save' | 'ai' | 'system' | 'info';
      }>;
      if (customEvent.detail) {
        const { title, message, type } = customEvent.detail;
        const newNotification: AppNotification = {
          id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title,
          message,
          type,
          timestamp: new Date().toISOString(),
          read: false
        };
        setNotifications(prev => {
          const next = [newNotification, ...prev];
          localStorage.setItem('worksuite-notifications', JSON.stringify(next));
          return next;
        });
      }
    };

    window.addEventListener('app-notification', handleAppNotification);
    return () => {
      window.removeEventListener('app-notification', handleAppNotification);
    };
  }, []);

  // Theme support
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('worksuite-theme');
    return (saved === 'dark' || saved === 'light') ? saved : 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('worksuite-theme', theme);
  }, [theme]);

  const markAllAsRead = () => {
    setNotifications(prev => {
      const next = prev.map(n => ({ ...n, read: true }));
      localStorage.setItem('worksuite-notifications', JSON.stringify(next));
      return next;
    });
  };

  const deleteNotification = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifications(prev => {
      const next = prev.filter(n => n.id !== id);
      localStorage.setItem('worksuite-notifications', JSON.stringify(next));
      return next;
    });
  };

  const toggleReadNotification = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifications(prev => {
      const next = prev.map(n => n.id === id ? { ...n, read: !n.read } : n);
      localStorage.setItem('worksuite-notifications', JSON.stringify(next));
      return next;
    });
  };

  const clearAllNotifications = () => {
    setNotifications([]);
    localStorage.setItem('worksuite-notifications', JSON.stringify([]));
  };

  // Command palette and cross-module jump states
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);

  // Multi-window and workspace layout options
  const [splitWorkspaceMode, setSplitWorkspaceMode] = useState(false);
  const [secondaryTab, setSecondaryTab] = useState<TabType>('spreadsheet');
  const [standaloneMode, setStandaloneMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Toggle both side panels helper
  const handleToggleBothPanels = () => {
    if (sidebarOpen || aiPanelOpen) {
      setSidebarOpen(false);
      setAiPanelOpen(false);
    } else {
      setSidebarOpen(true);
      setAiPanelOpen(true);
    }
  };

  // Auth form states
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // AI Connection integrations
  const [aiPanelOpen, setAiPanelOpen] = useState(true);
  const [suggestionText, setSuggestionText] = useState<string | null>(null);

  const handleCommandPaletteSelect = (type: 'document' | 'spreadsheet' | 'note' | 'invoice', id: string) => {
    switch (type) {
      case 'document':
        setActiveDocId(id);
        setCurrentTab('documents');
        // If split screen is active, make sure we show it or update secondary panel
        if (splitWorkspaceMode && secondaryTab === 'spreadsheet') {
          // Keep split, documents is renderTabContent on primary anyway!
        }
        break;
      case 'spreadsheet':
        setActiveSheetId(id);
        if (splitWorkspaceMode) {
          setSecondaryTab('spreadsheet');
        } else {
          setCurrentTab('spreadsheet');
        }
        break;
      case 'note':
        setActiveNoteId(id);
        if (splitWorkspaceMode) {
          setSecondaryTab('notes');
        } else {
          setCurrentTab('notes');
        }
        break;
      case 'invoice':
        setActiveInvoiceId(id);
        if (splitWorkspaceMode) {
          setSecondaryTab('invoices');
        } else {
          setCurrentTab('invoices');
        }
        break;
    }
  };

  // Sync state with local events (e.g. from Settings update/logout)
  useEffect(() => {
    const handleLocalProfileUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      if (customEvent.detail) {
        setUser(customEvent.detail);
      }
    };
    const handleLocalLogout = () => {
      setUser(null);
    };

    window.addEventListener('local-profile-updated', handleLocalProfileUpdate);
    window.addEventListener('local-logout', handleLocalLogout);
    return () => {
      window.removeEventListener('local-profile-updated', handleLocalProfileUpdate);
      window.removeEventListener('local-logout', handleLocalLogout);
    };
  }, []);

  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to log out of WorkSuite?")) {
      localStorage.removeItem('worksuite-local-user-active');
      setUser(null);
      try {
        await signOut(auth);
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Load auth state change listeners and query parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('standalone') === 'true') {
      setStandaloneMode(true);
      const tab = params.get('tab') as TabType;
      if (tab) {
        setCurrentTab(tab);
      }
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setAuthLoading(false);
      } else {
        // Fallback to local auth if saved
        const storedLocal = localStorage.getItem('worksuite-local-user-active');
        if (storedLocal) {
          try {
            setUser(JSON.parse(storedLocal));
          } catch (_) {
            setUser(null);
          }
        } else {
          setUser(null);
        }
        setAuthLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Quick guest credentials sign in helper to ease immediate review
  const handleGuestSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    const guestEmail = "guest.worksuite@cloudworkspace.com";
    const guestPassword = "WorkspacePass123!";
    try {
      try {
        const res = await signInWithEmailAndPassword(auth, guestEmail, guestPassword);
        setUser(res.user);
      } catch (authErr: any) {
        if (authErr?.code === 'auth/operation-not-allowed' || authErr?.message?.includes('operation-not-allowed')) {
          // Fallback to localized guest mode directly
          const mockUser = {
            uid: 'local-guest-user',
            email: guestEmail,
            displayName: "Guest Auditor (Local Sandbox)",
            emailVerified: true,
            photoURL: null,
          } as any;
          localStorage.setItem('worksuite-local-user-active', JSON.stringify(mockUser));
          setUser(mockUser);
          
          setNotifications(prev => {
            const next = [
              {
                id: `sys-local-${Date.now()}`,
                title: 'Localized Sandbox Active',
                message: 'Email & Password authentication is pending console setup. Switched to local sandbox session successfully.',
                type: 'system' as const,
                timestamp: new Date().toISOString(),
                read: false
              },
              ...prev
            ];
            localStorage.setItem('worksuite-notifications', JSON.stringify(next));
            return next;
          });
        } else if (authErr?.code === 'auth/user-not-found' || authErr?.code === 'auth/invalid-credential') {
          // auto sign-up guest account if not exists
          const res = await createUserWithEmailAndPassword(auth, guestEmail, guestPassword);
          await updateProfile(res.user, {
            displayName: "Guest Auditor"
          });
          setUser(res.user);
        } else {
          throw authErr;
        }
      }
    } catch (e: any) {
      setAuthError(e.message || "Failed guest login. Check internet connection.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCustomAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      if (isSignUp) {
        if (!fullName.trim()) {
          setAuthError("Display name is required.");
          setAuthLoading(false);
          return;
        }
        try {
          const res = await createUserWithEmailAndPassword(auth, email, password);
          await updateProfile(res.user, { displayName: fullName.trim() });
          setUser(res.user);
        } catch (authErr: any) {
          if (authErr?.code === 'auth/operation-not-allowed' || authErr?.message?.includes('operation-not-allowed')) {
            // Local fallback registration
            const mockUser = {
              uid: 'local-' + email.replace(/[^a-zA-Z0-9]/g, ''),
              email: email,
              displayName: fullName.trim(),
              emailVerified: true,
              photoURL: null,
            } as any;
            localStorage.setItem('worksuite-local-user-active', JSON.stringify(mockUser));
            setUser(mockUser);
            
            setNotifications(prev => {
              const next = [
                {
                  id: `sys-local-${Date.now()}`,
                  title: 'Offline Session Created',
                  message: 'Your portal has switched to a localized sandbox because email/password authentication is pending console setup.',
                  type: 'system' as const,
                  timestamp: new Date().toISOString(),
                  read: false
                },
                ...prev
              ];
              localStorage.setItem('worksuite-notifications', JSON.stringify(next));
              return next;
            });
          } else {
            throw authErr;
          }
        }
      } else {
        try {
          const res = await signInWithEmailAndPassword(auth, email, password);
          setUser(res.user);
        } catch (authErr: any) {
          if (authErr?.code === 'auth/operation-not-allowed' || authErr?.message?.includes('operation-not-allowed') || authErr?.code === 'auth/user-not-found') {
            // Check stored local user
            const storedLocal = localStorage.getItem('worksuite-local-user-active');
            let mockUser: any = null;
            if (storedLocal) {
              try {
                const parsed = JSON.parse(storedLocal);
                if (parsed.email === email) {
                  mockUser = parsed;
                }
              } catch (_) {}
            }
            // Auto create matching offline profile on console auth disabled
            if (!mockUser && (authErr?.code === 'auth/operation-not-allowed' || authErr?.message?.includes('operation-not-allowed'))) {
              mockUser = {
                uid: 'local-' + email.replace(/[^a-zA-Z0-9]/g, ''),
                email: email,
                displayName: email.split('@')[0],
                emailVerified: true,
                photoURL: null,
              };
              localStorage.setItem('worksuite-local-user-active', JSON.stringify(mockUser));
            }

            if (mockUser) {
              setUser(mockUser);
              return;
            }
          }
          throw authErr;
        }
      }
    } catch (e: any) {
      setAuthError(e.message || "Credential configuration challenge.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await signInWithPopup(auth, googleAuthProvider);
      setUser(res.user);
    } catch (e: any) {
      setAuthError(e.message || "Google single sign-on skipped.");
    } finally {
      setAuthLoading(false);
    }
  };

  // Callback to feed content selected into AI context
  const handleSelectContentForAi = (text: string) => {
    // Open AI and pass selected text to suggest rewrites
    setAiPanelOpen(true);
    setSuggestionText(null); // clear old before inserting new prompt
    
    // Auto populate the prompt input field by triggering custom context
    const aiPromptInput = document.querySelector('#ai-assistant-container input') as HTMLInputElement;
    if (aiPromptInput) {
      aiPromptInput.value = `Explain, format, or improve the following selected item: "${text}"`;
      aiPromptInput.focus();
    }
  };

  const handleAdoptingAiText = (text: string) => {
    setSuggestionText(text);
  };

  const clearAdoptedText = () => {
    setSuggestionText(null);
  };

  const handleLaunchNewWindow = () => {
    const url = `${window.location.origin}${window.location.pathname}?standalone=true&tab=${currentTab}`;
    window.open(url, '_blank');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <div className="flex items-center gap-2 text-violet-600 font-mono text-sm font-semibold">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>Starting WorkSuite container...</span>
        </div>
      </div>
    );
  }

  // Auth gate login card
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 font-sans p-6 transition-colors duration-200">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-xl overflow-hidden flex flex-col">
          {/* Cover bar banner */}
          <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-8 py-6 text-white text-center relative">
            <h1 className="text-xl font-black flex items-center justify-center gap-1.5">
              <Sparkles className="h-5 w-5" />
              <span>WorkSuite AI</span>
            </h1>
            <p className="text-[11px] text-violet-100 mt-1 uppercase tracking-wider font-extrabold">All-In-One Productivity Portal</p>
          </div>

          <div className="p-8 space-y-6">
            <div className="text-center">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                {isSignUp ? "Create Workspace Account" : "Access Your WorkSuite Space"}
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Get started now to collaborate and draft docs.</p>
            </div>

            {authError && (
              <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 text-xs rounded-lg flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{authError}</span>
              </div>
            )}

            {/* Forms fields */}
            <form onSubmit={handleCustomAuth} className="space-y-4">
              {isSignUp && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full text-xs border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-violet-500 bg-slate-50/50 dark:bg-slate-950/60 text-slate-900 dark:text-slate-100"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full text-xs border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-violet-500 bg-slate-50/50 dark:bg-slate-950/60 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Secure Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full text-xs border border-slate-200 dark:border-slate-800 rounded-lg pl-3 pr-10 py-2.5 focus:outline-none focus:ring-1 focus:ring-violet-500 bg-slate-50/50 dark:bg-slate-950/60 text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-350 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold text-xs rounded-lg shadow-sm transition cursor-pointer"
              >
                {isSignUp ? "Register Portal Profile" : "Secure Sign In"}
              </button>
            </form>

            <div className="relative flex items-center justify-center border-t border-slate-100 dark:border-slate-800 py-2 text-xs text-slate-400">
              <span className="bg-white dark:bg-slate-900 px-2 select-none relative z-10 transition-colors duration-200">Or Quick Actions</span>
            </div>

            {/* Google provider and guest credentials provider buttons */}
            <div className="space-y-2">
              <button
                onClick={handleGuestSignIn}
                className="w-full py-2.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300 text-xs rounded-lg font-bold transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Computer className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                <span>Instant Sign In with Guest Account</span>
              </button>

              <button
                onClick={handleGoogleSignIn}
                className="w-full py-2.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300 text-xs rounded-lg transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M12 5.04c1.62 0 3.08.56 4.22 1.64l3.15-3.15C17.43 1.68 14.9 1 12 1 7.35 1 3.4 3.65 1.48 7.5l3.86 3C6.29 7.56 8.91 5.04 12 5.04z" />
                  <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.47h6.47c-.28 1.47-1.11 2.71-2.36 3.55l3.64 2.83c2.13-1.97 3.74-4.86 3.74-8.49z" />
                  <path fill="#FBBC05" d="M5.34 14.5c-.24-.71-.38-1.47-.38-2.25s.14-1.54.38-2.25L1.48 7.5C.54 9.15 0 11.02 0 13s.54 3.85 1.48 5.5l3.86-3z" />
                  <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.64-2.83c-1.1.74-2.5 1.18-4.32 1.18-3.09 0-5.71-2.52-6.66-5.46L1.48 15.98C3.4 19.85 7.35 23 12 23z" />
                </svg>
                <span>Continue with Google</span>
              </button>
            </div>

            <div className="text-center text-xs">
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-violet-600 hover:underline font-semibold"
              >
                {isSignUp ? "Already have an account? Sign In" : "Need a workspace account? Register"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render Workspace workstation
  const renderTabContent = (targetTab: TabType = currentTab) => {
    switch (targetTab) {
      case 'dashboard':
        return (
          <LetterMaker 
            userId={user.uid} 
            userDisplayName={user.displayName || 'WorkSuite Colleague'} 
          />
        );
      case 'documents':
        return (
          <DocumentEditor 
            userId={user.uid} 
            onSelectContentForAi={handleSelectContentForAi}
            initialAdoptedText={suggestionText}
            clearAdoptedText={clearAdoptedText}
            activeDocId={activeDocId}
          />
        );
      case 'spreadsheet':
        return (
          <SpreadsheetEditor 
            userId={user.uid} 
            onSelectContentForAi={handleSelectContentForAi}
            activeSheetId={activeSheetId}
            initialAdoptedText={suggestionText}
            clearAdoptedText={clearAdoptedText}
          />
        );
      case 'notes':
        return (
          <DebitDepositNotes 
            userId={user.uid} 
            onSelectContentForAi={handleSelectContentForAi}
            activeNoteId={activeNoteId}
            initialAdoptedText={suggestionText}
            clearAdoptedText={clearAdoptedText}
          />
        );
      case 'invoices':
        return (
          <InvoiceMaker 
            userId={user.uid} 
            onSelectContentForAi={handleSelectContentForAi}
            activeInvoiceId={activeInvoiceId}
            initialAdoptedText={suggestionText}
            clearAdoptedText={clearAdoptedText}
          />
        );
      case 'settings':
        return (
          <Settings 
            userId={user.uid} 
            email={user.email || ''} 
            displayName={user.displayName || ''} 
            photoURL={user.photoURL || undefined}
          />
        );
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Letter Center', icon: Mail },
    { id: 'documents', label: 'Word Processor', icon: FileText },
    { id: 'spreadsheet', label: 'List Grid', icon: Grid },
    { id: 'notes', label: 'Ledger Note', icon: Award },
    { id: 'invoices', label: 'Invoice Maker', icon: Receipt },
    { id: 'settings', label: 'Account Profile', icon: SettingsIcon },
  ] as const;

  return (
    <div className="h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans overflow-hidden transition-colors duration-200" id="worksuite-workstation-main">
      {/* Sidebar Navigation */}
      {!standaloneMode && sidebarOpen && (
        <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0" id="worksuite-sidebar-aside">
          {/* Core Suite Logo Header */}
          <div className="p-6 border-b border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">
                <Sparkles className="h-4.5 w-4.5" />
              </div>
              <div>
                <h1 className="text-base font-bold tracking-tight text-slate-800 dark:text-slate-100 uppercase leading-none">WorkSuite</h1>
                <span className="text-[9px] text-indigo-500 dark:text-indigo-400 font-bold uppercase tracking-wider block mt-1">AI Productivity</span>
              </div>
            </div>
          </div>

          {/* Navigation list */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto scrollbar">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentTab(item.id);
                    // clear AI insert buffer
                    setSuggestionText(null);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    isActive 
                      ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 font-semibold' 
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className="h-4.5 w-4.5 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Logged in User widget in Sidebar footer */}
          <div className="p-4 mt-auto border-t border-slate-100 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/40">
            <div className="flex items-center gap-3 p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-700 dark:text-slate-300 text-xs shrink-0 select-none border border-slate-300 dark:border-slate-700">
                {(user.displayName || user.email || 'W').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate leading-tight">{user.displayName || 'Work Colleague'}</p>
                <p className="text-[9px] text-slate-500 dark:text-slate-400 truncate leading-none mt-0.5">{user.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-rose-500 rounded-lg transition shrink-0 cursor-pointer"
                title="Log Out Profile"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Main viewport area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Workspace Toolbar Header */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8 shrink-0 z-10 transition-colors duration-200">
          <div className="flex items-center gap-3">
            {!standaloneMode && (
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className={`p-2 rounded-lg transition border cursor-pointer flex items-center justify-center ${
                  sidebarOpen 
                    ? 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900' 
                    : 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 font-bold'
                }`}
                title={sidebarOpen ? "Hide Left Sidebar" : "Show Left Sidebar"}
              >
                <Layout className="h-4 w-4" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Active Tool:</h2>
              <span className="text-xs font-extrabold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 rounded-full border border-indigo-100/60 dark:border-indigo-900/40 uppercase tracking-wider">
                {currentTab === 'dashboard' ? 'Letter Center' : currentTab === 'documents' ? 'Word Processor' : currentTab === 'spreadsheet' ? 'List Grid' : currentTab === 'notes' ? 'Ledger Note' : currentTab === 'invoices' ? 'Invoice Maker' : 'Account Profile'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Command Palette Trigger (Desktop search box style) */}
            <button
              id="command-palette-trigger"
              onClick={() => setIsPaletteOpen(true)}
              className="hidden md:flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-650 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs px-3 py-1.5 rounded-lg transition-all shadow-inner relative select-none w-48 text-left cursor-pointer mr-1"
              title="Search document titles, clients, and transaction ledger notes (Ctrl+K)"
            >
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 grow">Search registry...</span>
              <kbd className="text-[9px] bg-white dark:bg-slate-900 px-1.5 py-0.5 border border-slate-200 dark:border-slate-700 rounded font-mono font-bold text-slate-400 dark:text-slate-500 shadow-sm leading-none shrink-0">⌘K</kbd>
            </button>

            {/* Command Palette Trigger (Mobile icon view) */}
            <button
              id="command-palette-trigger-mobile"
              onClick={() => setIsPaletteOpen(true)}
              className="md:hidden p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer mr-1"
              title="Search registry"
            >
              <Search className="h-4 w-4" />
            </button>

            {/* Global Theme Toggle for Dark Mode */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg transition border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer mr-1"
              title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-500 animate-pulse" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>

            {/* Notification Center */}
            <div className="relative" id="notification-center-dropdown">
              <button
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg transition border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer mr-1 relative"
                title="Notifications"
              >
                <Bell className="h-4 w-4" />
                {notifications.some(n => !n.read) && (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
                )}
                {notifications.some(n => !n.read) && (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-indigo-600" />
                )}
              </button>

              {isNotificationsOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setIsNotificationsOpen(false)} />
                  <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg overflow-hidden z-40">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-slate-700 dark:text-slate-300 tracking-wider">NOTIFICATIONS</span>
                        {notifications.filter(n => !n.read).length > 0 && (
                          <span className="px-1.5 py-0.5 text-[9px] bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 font-extrabold rounded-full">
                            {notifications.filter(n => !n.read).length} new
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {notifications.length > 0 && (
                          <>
                            <button
                              onClick={markAllAsRead}
                              className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold transition cursor-pointer"
                            >
                              Mark read
                            </button>
                            <span className="text-slate-300 dark:text-slate-700 text-xs">|</span>
                            <button
                              onClick={clearAllNotifications}
                              className="text-[10px] text-slate-500 hover:text-red-550 dark:hover:text-red-400 hover:underline font-bold transition cursor-pointer"
                            >
                              Clear
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/40">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center flex flex-col items-center justify-center">
                          <div className="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-300 dark:text-slate-600 mb-2">
                            <Bell className="h-5 w-5" />
                          </div>
                          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">All caught up!</span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">No pending workspace updates.</span>
                        </div>
                      ) : (
                        notifications.map((n) => {
                          let IconComp = Info;
                          let iconColor = "text-blue-500 bg-blue-50 dark:bg-blue-950/45";
                          if (n.type === 'save') {
                            IconComp = Save;
                            iconColor = "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/45";
                          } else if (n.type === 'ai') {
                            IconComp = Sparkles;
                            iconColor = "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/45";
                          } else if (n.type === 'system') {
                            IconComp = RefreshCw;
                            iconColor = "text-amber-500 bg-amber-50 dark:bg-amber-950/45";
                          }

                          return (
                            <div
                              key={n.id}
                              onClick={(e) => toggleReadNotification(n.id, e)}
                              className={`p-3.5 flex gap-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition cursor-pointer group ${
                                !n.read ? 'bg-slate-50/50 dark:bg-slate-800/10' : ''
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconColor}`}>
                                <IconComp className="h-4.5 w-4.5" />
                              </div>
                              <div className="flex-1 min-w-0 pr-1">
                                <div className="flex items-start justify-between gap-1.5">
                                  <h3 className={`text-[11px] leading-tight truncate ${
                                    !n.read ? 'font-bold text-slate-800 dark:text-slate-200' : 'text-slate-600 dark:text-slate-400'
                                  }`}>
                                    {n.title}
                                  </h3>
                                  <span className="text-[9px] text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0">
                                    {formatRelativeTime(n.timestamp)}
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed line-clamp-2">
                                  {n.message}
                                </p>
                              </div>
                              <div className="flex flex-col items-center justify-between shrink-0 pl-1">
                                {!n.read && (
                                  <div className="h-1.5 w-1.5 rounded-full bg-indigo-600 mt-1.5" />
                                )}
                                <button
                                  onClick={(e) => deleteNotification(n.id, e)}
                                  className="text-slate-300 dark:text-slate-700 hover:text-red-500 dark:hover:text-red-400 p-0.5 rounded opacity-0 group-hover:opacity-100 transition mt-auto cursor-pointer"
                                  title="Dismiss notification"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Toggle Multi-window Panel split view */}
            <button
              onClick={() => setSplitWorkspaceMode(!splitWorkspaceMode)}
              className={`inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer ${
                splitWorkspaceMode 
                  ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900' 
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
              title="Split workspace menu view to open multiple panels side-by-side"
            >
              <Columns2 className="h-4 w-4" />
              <span className="hidden sm:inline">{splitWorkspaceMode ? "Close Dual Pane" : "Launch Split Screen"}</span>
            </button>

            {/* Detach View Standalone tab link */}
            <button
              onClick={handleLaunchNewWindow}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer"
              title="Shift to another window (opens view in a browser tab)"
            >
              <ExternalLink className="h-4.5 w-4.5" />
            </button>

            <div className="h-6 w-[1.5px] bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block"></div>

            <button
              onClick={handleToggleBothPanels}
              className={`inline-flex items-center gap-1.5 py-2 px-4 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer ${
                (!sidebarOpen && !aiPanelOpen)
                  ? 'bg-amber-600 text-white hover:bg-amber-700 shadow-amber-100 dark:shadow-none'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
              title={(!sidebarOpen && !aiPanelOpen) ? "Show both side panels (Sidebar + AI)" : "Hide both sidebar navigation and AI assistant panel"}
            >
              <Layout className="h-4 w-4" />
              <span>{(!sidebarOpen && !aiPanelOpen) ? "Show Both Panels" : "Hide Both Panels"}</span>
            </button>

            <button
              onClick={() => setAiPanelOpen(!aiPanelOpen)}
              className={`inline-flex items-center gap-1.5 py-2 px-4 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer ${
                aiPanelOpen 
                  ? 'bg-indigo-600 text-white shadow-indigo-100 dark:shadow-none hover:bg-indigo-700' 
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              <span>AI Assistant</span>
            </button>
          </div>
        </header>

        {/* View contents layout (with slide-in side AI assistant) */}
        <div className="flex-1 flex min-h-0 relative">
          {/* Main workspace container */}
          <div className="flex-1 overflow-hidden">
            {splitWorkspaceMode ? (
              <div className="flex-1 overflow-hidden h-full flex flex-col xl:flex-row divide-y xl:divide-y-0 xl:divide-x divide-slate-200 dark:divide-slate-800">
                {/* Left Workspace Pane - Primary Locked Screen (Letter Center desk) */}
                <div className="flex-1 h-1/2 xl:h-full overflow-hidden flex flex-col min-w-0">
                  <div className="bg-slate-100/60 dark:bg-slate-900/40 px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 shrink-0 select-none font-mono">
                    <span className="flex items-center gap-1.5 uppercase tracking-wider text-indigo-700 dark:text-indigo-400">📌 PRIMARY DESK: LETTER CENTER</span>
                    <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 px-1.5 py-0.5 rounded">Pinned</span>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    {renderTabContent('dashboard')}
                  </div>
                </div>

                {/* Right Workspace Pane - Secondary Navigation Option Screen */}
                <div className="flex-1 h-1/2 xl:h-full overflow-hidden flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950">
                  <div className="bg-slate-100/60 dark:bg-slate-900/40 px-4 py-1.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 shrink-0 font-mono">
                    <span className="flex items-center gap-1.5 uppercase tracking-wider text-emerald-700 dark:text-emerald-400 py-1 font-extrabold">⚡ SECONDARY PANELS</span>
                    <div className="flex items-center gap-1 flex-wrap">
                      {(['spreadsheet', 'notes', 'invoices', 'settings'] as TabType[]).map(tab => (
                        <button
                          key={tab}
                          onClick={() => setSecondaryTab(tab)}
                          className={`px-2 py-0.5 text-[10px] rounded transition font-bold cursor-pointer ${
                            secondaryTab === tab 
                              ? 'bg-emerald-600 dark:bg-emerald-700 text-white shadow-sm' 
                              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {tab === 'spreadsheet' ? 'List Grid' : tab === 'notes' ? 'Ledger' : tab === 'invoices' ? 'Invoices' : 'Profile'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    {renderTabContent(secondaryTab)}
                  </div>
                </div>
              </div>
            ) : (
              renderTabContent()
            )}
          </div>

          {/* AI Panel sidebar container */}
          <div 
            className={`transition-all duration-300 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0 ${
              aiPanelOpen ? 'w-80 opacity-100' : 'w-0 opacity-0 overflow-hidden'
            }`}
          >
            <AiAssistant 
              activeContext={currentTab} 
              onSuggestionAdopt={handleAdoptingAiText}
              userId={user?.uid}
            />
          </div>
        </div>
      </main>

      {user && (
        <CommandPalette
          isOpen={isPaletteOpen}
          onClose={() => setIsPaletteOpen(false)}
          userId={user.uid}
          onSelectItem={handleCommandPaletteSelect}
        />
      )}
    </div>
  );
}
