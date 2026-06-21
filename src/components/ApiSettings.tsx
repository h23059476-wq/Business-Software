import React, { useState, useEffect } from 'react';
import { 
  Key, Sparkles, CheckCircle2, AlertTriangle, ExternalLink, Eye, EyeOff, 
  ShieldAlert, Cpu, Download, ToggleLeft, ToggleRight, RefreshCw, Zap, Server
} from 'lucide-react';
import { 
  LOCAL_MODELS, getLocalModelId, setLocalModelId, isLocalAiActive, 
  setLocalAiActive, checkWebGPUSupport, getOrInitLocalEngine,
  getLocalAiStatus, getLocalAiProgress, getLocalAiLastError,
  subscribeToAiProgress, startLocalAiBackgroundLoading
} from '../lib/aiService.ts';

export default function ApiSettings() {
  // Cloud States
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [savedKey, setSavedKey] = useState('');

  // Mode & Local States
  const [isLocalMode, setIsLocalMode] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [gpuSupported, setGpuSupported] = useState(true);
  
  // Local Download & Test states
  const [localLoading, setLocalLoading] = useState(false);
  const [localProgress, setLocalProgress] = useState({ progress: 0, text: 'Idle' });
  const [localFeedback, setLocalFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Load existing configuration on mount
  useEffect(() => {
    const key = localStorage.getItem('worksuite_custom_gemini_api_key') || '';
    setApiKey(key);
    setSavedKey(key);

    setIsLocalMode(isLocalAiActive());
    setSelectedModel(getLocalModelId());
    setGpuSupported(checkWebGPUSupport());

    // Subscribe to progress
    const unsubscribe = subscribeToAiProgress((report) => {
      setLocalProgress({
        progress: Math.floor(report.progress * 100),
        text: report.text
      });
    });

    const statusCheck = () => {
      const status = getLocalAiStatus();
      if (status === 'downloading') {
        setLocalLoading(true);
        setLocalFeedback(null);
      } else if (status === 'ready') {
        setLocalLoading(false);
      } else if (status === 'error') {
        setLocalLoading(false);
        const err = getLocalAiLastError();
        setLocalFeedback({
          success: false,
          message: err || 'GPU memory allocation failed. Try smaller model sizes.'
        });
      } else {
        setLocalLoading(false);
      }
    };

    statusCheck();

    // Listen to custom download events to update local states reactively
    const handleStarted = () => {
      setLocalLoading(true);
      setLocalFeedback(null);
    };
    const handleCompleted = () => {
      setLocalLoading(false);
      setLocalFeedback({
        success: true,
        message: `Local model initialized! It is cached in your browser storage and will start instantly next time.`
      });
    };
    const handleFailed = (event: any) => {
      setLocalLoading(false);
      setLocalFeedback({
        success: false,
        message: event.detail?.error || 'GPU memory allocation failed.'
      });
    };
    
    const handleModelSwapped = () => {
      setSelectedModel(getLocalModelId());
      setLocalFeedback(null);
      setLocalLoading(false);
    };

    window.addEventListener('ai-download-started', handleStarted);
    window.addEventListener('ai-download-completed', handleCompleted);
    window.addEventListener('ai-download-failed', handleFailed);
    window.addEventListener('ai-model-swapped', handleModelSwapped);

    return () => {
      unsubscribe();
      window.removeEventListener('ai-download-started', handleStarted);
      window.removeEventListener('ai-download-completed', handleCompleted);
      window.removeEventListener('ai-download-failed', handleFailed);
      window.removeEventListener('ai-model-swapped', handleModelSwapped);
    };
  }, []);

  // Sync mode changes
  const handleToggleMode = (activeLocal: boolean) => {
    if (activeLocal && !gpuSupported) {
      alert("Your computer or browser doesn't seem to support WebGPU. Local AI requires a modern browser and a compatible GPU.");
      return;
    }
    setLocalAiActive(activeLocal);
    setIsLocalMode(activeLocal);

    window.dispatchEvent(new CustomEvent('app-notification', {
      detail: {
        title: activeLocal ? 'Local Offline Mode Active' : 'Cloud Gemini Active',
        message: activeLocal 
          ? 'WorkSuite will now direct AI queries directly to your local WebGPU engine.'
          : 'WorkSuite will now run AI queries through the Gemini Cloud API.',
        type: 'info'
      }
    }));
  };

  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    setLocalModelId(modelId);
    setLocalFeedback(null);
  };

  // Cloud API Save Logic
  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = apiKey.trim();
    
    if (cleanKey === '') {
      localStorage.removeItem('worksuite_custom_gemini_api_key');
      setSavedKey('');
      setTestResult({
        success: false,
        message: 'API Key removed. The app will return to offline core document mode.'
      });
      window.dispatchEvent(new CustomEvent('custom-api-key-updated', { detail: { key: null } }));
      return;
    }

    localStorage.setItem('worksuite_custom_gemini_api_key', cleanKey);
    setSavedKey(cleanKey);
    window.dispatchEvent(new CustomEvent('custom-api-key-updated', { detail: { key: cleanKey } }));

    // Auto run verification
    await runConnectionTest(cleanKey);
  };

  const handleClearKey = () => {
    localStorage.removeItem('worksuite_custom_gemini_api_key');
    setApiKey('');
    setSavedKey('');
    setTestResult(null);
    window.dispatchEvent(new CustomEvent('custom-api-key-updated', { detail: { key: null } }));
  };

  const runConnectionTest = async (keyToTest: string) => {
    setTesting(true);
    setTestResult(null);
    try {
      const isElectron = typeof window !== 'undefined' && ((window as any).electronAPI || window.navigator.userAgent.includes('Electron'));
      const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';
      const apiTargetUrl = (isElectron || isFileProtocol) ? 'http://localhost:3000/api/ai/assistant' : '/api/ai/assistant';

      const res = await fetch(apiTargetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-api-key': keyToTest
        },
        body: JSON.stringify({
          prompt: "Say 'Cloud Connection Successful!' in exactly one short line.",
          context: "connection_test"
        })
      });

      const data = await res.json();
      if (res.ok && data.text) {
        setTestResult({
          success: true,
          message: data.text.trim()
        });
        window.dispatchEvent(new CustomEvent('app-notification', {
          detail: {
            title: 'Gemini Cloud Activated',
            message: 'Your Google Gemini key tested successfully and has been configured.',
            type: 'ai'
          }
        }));
      } else {
        throw new Error(data.error || 'Server rejected key credentials.');
      }
    } catch (err: any) {
      console.error('[Gemini Key Probe] Failed:', err);
      setTestResult({
        success: false,
        message: err.message || 'Verification timed out or failed. Please verify spelling.'
      });
    } finally {
      setTesting(false);
    }
  };

  // Local Offline Download/Warming up Logic
  const handleLoadLocalModel = async () => {
    setLocalFeedback(null);
    // Directly dispatch start progress globally
    window.dispatchEvent(new CustomEvent('app-notification', {
      detail: {
        title: 'Local Downloading Started',
        message: 'The selected model class is now caching in the background. You are free to work on notes, lists, or letters!',
        type: 'info'
      }
    }));
    try {
      await startLocalAiBackgroundLoading();
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: {
          title: 'Local Engine Active',
          message: 'Model compilation is complete. Off-grid local WebGPU execution is 105% optimized!',
          type: 'success'
        }
      }));
    } catch (err: any) {
      console.error('[Local Model Load Error]:', err);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-fade-in" id="ai-engine-setup-vault">
      {/* Page Title */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Cpu className="h-5 w-5 text-indigo-500" />
            <span>AI Brain Engine Hub</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Choose whether to query Google Gemini in the cloud or download local models to operate 100% offline via your GPU.
          </p>
        </div>

        {/* Global Toggle Selector */}
        <div className="flex items-center gap-3 bg-slate-100 dark:bg-slate-950 p-1.5 rounded-xl border border-slate-200 dark:border-slate-850">
          <button
            onClick={() => handleToggleMode(false)}
            className={`px-4 py-2 rounded-lg font-black text-xs flex items-center gap-1.5 transition cursor-pointer ${
              !isLocalMode 
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100'
            }`}
          >
            <Server className="h-3.5 w-3.5" />
            <span>Cloud Gemini</span>
          </button>
          <button
            onClick={() => handleToggleMode(true)}
            className={`px-4 py-2 rounded-lg font-black text-xs flex items-center gap-1.5 transition cursor-pointer ${
              isLocalMode 
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100'
            }`}
          >
            <Zap className="h-3.5 w-3.5 animate-pulse" />
            <span>Local GPU (Option C)</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* MAIN PANEL CONTENT */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* OPTION C: LOCAL GPU OFFLINE WORKSPACE */}
          {isLocalMode ? (
            <div className="bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-950 rounded-xl shadow-sm p-6 space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-500 rounded-lg">
                    <Zap className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">Local WebGPU Processing pipeline</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Run safe, lightweight LLM models entirely in your web components.</p>
                  </div>
                </div>

                {/* Compatibility Badge */}
                <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                  gpuSupported 
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-150 dark:border-emerald-900' 
                    : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-150 dark:border-rose-900'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${gpuSupported ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                  <span>{gpuSupported ? 'WebGPU Online' : 'No GPU Support'}</span>
                </span>
              </div>

              {/* Model Choice Card Selection */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  Select Model Weight Class (Downloads to Device Cache)
                </label>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {LOCAL_MODELS.map((m) => {
                    const isSelected = selectedModel === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleModelChange(m.id)}
                        disabled={localLoading}
                        className={`text-left p-4.5 rounded-xl border transition flex flex-col justify-between cursor-pointer group ${
                          isSelected
                            ? 'border-indigo-500 dark:border-indigo-400 bg-indigo-50/20 dark:bg-indigo-950/10 shadow-sm ring-1 ring-indigo-500/20'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="space-y-1">
                          <p className={`text-xs font-black ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-200'}`}>
                            {m.name}
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                            {m.description}
                          </p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                          <span className="text-[9px] font-bold py-0.5 px-2 bg-slate-100 dark:bg-slate-800/80 rounded text-slate-600 dark:text-slate-300">
                            {m.size}
                          </span>
                          <span className="text-[9px] text-indigo-500 italic font-black opacity-0 group-hover:opacity-100 transition-opacity">
                            {m.downloads}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Advanced Local Engine Orchestrator Controller Row Widget */}
              <div className="p-4.5 bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-950 text-indigo-500 rounded-lg shrink-0">
                    <Cpu className="h-4.5 w-4.5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-800 dark:text-slate-250 uppercase tracking-wider">Advanced AI Engine Status Orchestrator</h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">Monitor active download streams at file granularity, trigger hardware-level download pause/resume, and run physical SHA-256 binary files verification.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('open-ai-engine-modal'));
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] uppercase rounded-lg shadow-sm transition whitespace-nowrap cursor-pointer select-none active:scale-95"
                >
                  Configure Local Engine
                </button>
              </div>

              {/* Progress and Actions Block */}
              <div className="p-5 bg-slate-50/60 dark:bg-slate-950/20 border border-slate-150 dark:border-slate-850/80 rounded-xl space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Prepare Model Weights</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      The browser will coordinate weights from HuggingFace to your cache. No internet is needed after caching.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleLoadLocalModel}
                    disabled={localLoading || !gpuSupported}
                    className="py-2.5 px-5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-xs rounded-lg transition-all shadow shrink-0 flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {localLoading ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    <span>{localLoading ? 'Downloading / Loading...' : 'Download & Start'}</span>
                  </button>
                </div>

                {/* Progress Stats Visual */}
                {localLoading && (
                  <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-850">
                    <div className="flex items-center justify-between text-[11px] font-black text-slate-500 dark:text-slate-400">
                      <span className="animate-pulse">{localProgress.text}</span>
                      <span>{localProgress.progress}%</span>
                    </div>
                    {/* Progress tracking line */}
                    <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${localProgress.progress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Local Feedback Notice */}
              {localFeedback && (
                <div className={`p-4 rounded-xl border flex items-start gap-3 text-xs leading-relaxed ${
                  localFeedback.success 
                    ? 'bg-emerald-50/50 dark:bg-emerald-950/15 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300' 
                    : 'bg-rose-50/50 dark:bg-rose-950/15 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300'
                }`}>
                  {localFeedback.success ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5">
                    <p className="font-bold">{localFeedback.success ? 'Success: Engine Configured!' : 'Setup Interrupted'}</p>
                    <p className="opacity-90 leading-normal">{localFeedback.message}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            
            /* CLOUD GEMINI SETUP FOR CLOUD */
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-6 space-y-6">
              <div className="pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <Server className="h-4 w-4 text-indigo-500" />
                    <span>Cloud Gemini API Config</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Configure Google Cloud infrastructure for zero latency, server-supported execution.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveKey} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      Gemini API Key
                    </label>
                    {savedKey && (
                      <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>Configured</span>
                      </span>
                    )}
                  </div>

                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="AIzaSy..."
                      className="w-full text-xs font-mono border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-10 py-3 bg-slate-50/30 dark:bg-slate-950/20 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-100 font-medium"
                    />
                    <Key className="absolute left-3 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                    
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      title={showKey ? "Hide API Key" : "Show API Key"}
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 pt-2">
                  <button
                    type="submit"
                    disabled={testing}
                    className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-all shadow p-2 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{testing ? 'Testing Key...' : savedKey ? 'Saved & Verified' : 'Save & Configure'}</span>
                  </button>

                  {savedKey && (
                    <button
                      type="button"
                      onClick={handleClearKey}
                      className="py-2.5 px-3 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-950 text-slate-600 dark:text-slate-400 font-bold text-xs rounded-lg transition cursor-pointer"
                    >
                      Clear Key
                    </button>
                  )}
                </div>
              </form>

              {/* Test Status Feedback Display */}
              {testResult && (
                <div className={`p-4 rounded-xl border flex items-start gap-3 text-xs leading-relaxed ${
                  testResult.success 
                    ? 'bg-emerald-50/50 dark:bg-emerald-950/15 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300' 
                    : 'bg-rose-50/50 dark:bg-rose-950/15 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300'
                }`}>
                  {testResult.success ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <p className="font-bold">{testResult.success ? 'Connectivity Verified' : 'Authentication Error'}</p>
                    <p className="font-mono text-[11px] opacity-90 leading-tight">{testResult.message}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* SIDE BAR / INFO STATS */}
        <div className="lg:col-span-4 space-y-6">
          {/* Active Settings Info */}
          <div className="bg-slate-50 dark:bg-slate-900/40 p-6 rounded-xl border border-slate-100 dark:border-slate-800 space-y-4">
            <h4 className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 text-indigo-500" />
              <span>Vault Information</span>
            </h4>
            
            <div className="space-y-3.5">
              <div className="space-y-0.5 text-xs">
                <p className="text-slate-400 font-bold uppercase text-[9px]">Active Engine</p>
                <p className="font-black text-slate-800 dark:text-slate-100 flex items-center gap-1">
                  <span>{isLocalMode ? 'WebGPU Local LLM' : 'Google Gemini API'}</span>
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping"></span>
                </p>
              </div>

              <div className="space-y-0.5 text-xs">
                <p className="text-slate-400 font-bold uppercase text-[9px]">Local Caching Storage</p>
                <p className="text-slate-600 dark:text-slate-300">
                  Cache Storage API keeps your models. Chrome, Edge, and the Electron client cache these weights permanently so they load offline without re-downloading.
                </p>
              </div>

              <div className="space-y-0.5 text-xs">
                <p className="text-slate-400 font-bold uppercase text-[9px]">General Privacy pledge</p>
                <p className="text-slate-600 dark:text-slate-300">
                  When running GPU models locally, your messages, templates, financial journals and letters remain on this computer and are never broadcasted anywhere.
                </p>
              </div>
            </div>
          </div>

          {/* Quick links to get a key */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 p-6 rounded-xl border border-indigo-100 dark:border-indigo-950 space-y-4">
            <h4 className="text-xs font-black text-indigo-900 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              <span>Google Cloud Access</span>
            </h4>
            <p className="text-[11px] text-indigo-950/70 dark:text-indigo-300/80 leading-relaxed">
              If your client doesn't support WebGPU or you prefer not to wait for large model downloads, paste an API key from Google AI Studio. Caching will be completely bypassed.
            </p>
            <a
              href="https://aistudio.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-black text-indigo-600 dark:text-indigo-400 hover:underline hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer"
            >
              <span>Get Free Gemini Key</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
