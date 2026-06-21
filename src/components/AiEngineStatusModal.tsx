import { useState, useEffect } from 'react';
import { 
  X, RefreshCw, Play, Pause, CheckCircle2, AlertTriangle, 
  Trash2, Database, ShieldAlert, Cpu, Award, Download, 
  Search, ShieldCheck, HardDrive, Info
} from 'lucide-react';
import { 
  getLocalModelId, getLocalAiStatus, getLocalAiProgress, 
  getLocalAiLastError, subscribeToAiProgress, pauseLocalAiLoading, 
  resumeLocalAiLoading, verifyLocalModelIntegrity, ModelIntegrityReport,
  startLocalAiBackgroundLoading
} from '../lib/aiService.ts';

interface AiEngineStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AiEngineStatusModal({ isOpen, onClose }: AiEngineStatusModalProps) {
  const [status, setStatus] = useState<'idle' | 'downloading' | 'paused' | 'ready' | 'error'>(getLocalAiStatus());
  const [progress, setProgress] = useState<{ progress: number; text: string }>(getLocalAiProgress());
  const [errorMsg, setErrorMsg] = useState<string | null>(getLocalAiLastError());
  const [activeModel, setActiveModel] = useState<string>(getLocalModelId());
  
  // Integrity check states
  const [verifying, setVerifying] = useState(false);
  const [integrityReport, setIntegrityReport] = useState<ModelIntegrityReport | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Subscribe to progress and state updates
  useEffect(() => {
    if (!isOpen) return;

    setActiveModel(getLocalModelId());
    setStatus(getLocalAiStatus());
    setErrorMsg(getLocalAiLastError());

    const updateStatus = () => {
      setStatus(getLocalAiStatus());
      setErrorMsg(getLocalAiLastError());
    };

    const unsubscribe = subscribeToAiProgress((report) => {
      setProgress({
        progress: Math.min(100, Math.floor(report.progress * 100)),
        text: report.text
      });
    });

    const handleStarted = () => {
      setStatus('downloading');
      setErrorMsg(null);
    };
    const handleProgress = (e: any) => {
      setStatus('downloading');
      if (e.detail) {
        setProgress({
          progress: Math.min(100, Math.floor(e.detail.progress * 100)),
          text: e.detail.text
        });
      }
    };
    const handlePaused = () => {
      setStatus('paused');
    };
    const handleCompleted = () => {
      setStatus('ready');
      setErrorMsg(null);
      // Automatically run a check upon completion to keep everything in sync
      runIntegrityCheck();
    };
    const handleFailed = (e: any) => {
      setStatus('error');
      setErrorMsg(e.detail?.error || 'Initialization aborted.');
    };
    const handleModelSwapped = () => {
      setActiveModel(getLocalModelId());
      updateStatus();
      setIntegrityReport(null);
    };

    window.addEventListener('ai-download-started', handleStarted);
    window.addEventListener('ai-download-progress', handleProgress);
    window.addEventListener('ai-download-paused', handlePaused);
    window.addEventListener('ai-download-completed', handleCompleted);
    window.addEventListener('ai-download-failed', handleFailed);
    window.addEventListener('ai-model-swapped', handleModelSwapped);

    // Initial check on opens to see if files are present
    runIntegrityCheck();

    return () => {
      unsubscribe();
      window.removeEventListener('ai-download-started', handleStarted);
      window.removeEventListener('ai-download-progress', handleProgress);
      window.removeEventListener('ai-download-paused', handlePaused);
      window.removeEventListener('ai-download-completed', handleCompleted);
      window.removeEventListener('ai-download-failed', handleFailed);
      window.removeEventListener('ai-model-swapped', handleModelSwapped);
    };
  }, [isOpen]);

  const runIntegrityCheck = async () => {
    setVerifying(true);
    try {
      const rep = await verifyLocalModelIntegrity();
      setIntegrityReport(rep);
    } catch (e) {
      console.error(e);
    } finally {
      setVerifying(false);
    }
  };

  const handlePauseResume = () => {
    if (status === 'downloading') {
      pauseLocalAiLoading();
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: {
          title: 'Downloads Suspended',
          message: 'WebGPU download throttled and resources released.',
          type: 'info'
        }
      }));
    } else if (status === 'paused' || status === 'error' || status === 'idle') {
      resumeLocalAiLoading();
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: {
          title: 'Resuming Model Caching',
          message: 'Connecting to HuggingFace cluster to fetch remaining binary weights.',
          type: 'info'
        }
      }));
    }
  };

  const clearBrowserModelCache = async () => {
    if (typeof window === 'undefined' || !window.caches) return;
    
    if (confirm("Are you sure you want to permanently delete the cached model files for this system? This will clear up gigabytes of browser storage but you will need to re-download the weights to run AI offline again.")) {
      try {
        const keys = await window.caches.keys();
        const deletedKeys = [];
        for (const k of keys) {
          if (k.includes('web_llm') || k.includes(activeModel)) {
            await window.caches.delete(k);
            deletedKeys.push(k);
          }
        }
        
        // Clear cached state representation
        localStorage.removeItem('worksuite_use_local_ai'); // deactivate local AI mode
        window.dispatchEvent(new CustomEvent('ai-mode-changed'));
        
        window.dispatchEvent(new CustomEvent('app-notification', {
          detail: {
            title: 'Memory Purged Successfully',
            message: `Cleared ${deletedKeys.length} browser cache partitions.`,
            type: 'success'
          }
        }));
        
        runIntegrityCheck();
        setStatus('idle');
        setProgress({ progress: 0, text: 'Model memory cleared.' });
      } catch (err) {
        alert("Failed to purge storage: " + err);
      }
    }
  };

  if (!isOpen) return null;

  // Filter verified files
  const filteredFiles = integrityReport?.files.filter(f => 
    f.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
    f.url.toLowerCase().includes(searchFilter.toLowerCase())
  ) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay background */}
      <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />

      {/* Main card panel */}
      <div 
        className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
        id="ai-engine-status-modal-card"
      >
        {/* Header line */}
        <div className="px-6 py-5.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">AI Local Engine Center</h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 uppercase tracking-wide font-semibold">WebGPU Web-LLM Orchestrator</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition cursor-pointer"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Inner Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Active Model & Download State Panel */}
          <div className="p-5.5 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-850 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-150 dark:border-slate-800/60">
              <div className="space-y-0.5">
                <span className="text-[10px] font-black uppercase text-indigo-500 tracking-wider">Active Local Core</span>
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 font-mono">{activeModel}</h4>
              </div>
              <div className="flex items-center gap-2">
                {status === 'ready' && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] bg-emerald-50 dark:bg-emerald-950/45 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40 font-black uppercase tracking-wider">
                    Online (Ready)
                  </span>
                )}
                {status === 'downloading' && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] bg-indigo-50 dark:bg-indigo-950/45 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 font-black uppercase tracking-wider animate-pulse">
                    Downloading weights
                  </span>
                )}
                {status === 'paused' && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] bg-amber-50 dark:bg-amber-950/45 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40 font-black uppercase tracking-wider">
                    Paused
                  </span>
                )}
                {status === 'error' && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] bg-rose-50 dark:bg-rose-950/45 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/40 font-black uppercase tracking-wider">
                    Load Error
                  </span>
                )}
                {status === 'idle' && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] bg-slate-100 dark:bg-slate-850 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 font-black uppercase tracking-wider thin">
                    Unloaded
                  </span>
                )}
              </div>
            </div>

            {/* Downloader controls */}
            <div className="space-y-3">
              {(status === 'downloading' || status === 'paused' || status === 'error' || status === 'idle') && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-500 dark:text-slate-400 font-medium truncate max-w-[70%]">
                      {progress.text || 'Prepare for downloads...'}
                    </span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                      {progress.progress || 0}%
                    </span>
                  </div>

                  <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ${
                        status === 'paused' ? 'bg-amber-500' : status === 'error' ? 'bg-rose-500' : 'bg-indigo-600 dark:bg-indigo-500'
                      }`} 
                      style={{ width: `${progress.progress || 0}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Error Box display */}
              {status === 'error' && errorMsg && (
                <div className="p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-100/65 dark:border-rose-900/40 rounded-xl flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="text-[10px] uppercase font-black tracking-widest text-rose-800 dark:text-rose-300">GPU Compile Failed</p>
                    <p className="text-[10px] text-rose-600 dark:text-rose-400 leading-normal">{errorMsg}</p>
                  </div>
                </div>
              )}

              {/* Control Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 pt-1.5">
                {(status === 'downloading' || status === 'paused' || status === 'error' || status === 'idle') && (
                  <button
                    onClick={handlePauseResume}
                    className={`px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer transition ${
                      status === 'downloading' 
                        ? 'bg-amber-550 hover:bg-amber-600 text-white shadow-md' 
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md'
                    }`}
                  >
                    {status === 'downloading' ? (
                      <>
                        <Pause className="h-3.5 w-3.5" />
                        <span>Pause Download</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5" />
                        <span>{status === 'paused' ? 'Resume Download' : 'Start Model Download'}</span>
                      </>
                    )}
                  </button>
                )}

                {status === 'ready' && (
                  <div className="w-full p-4 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-xl border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="h-4.5 w-4.5" />
                      <div>
                        <p className="font-bold">Offline Engine is Fully Compiled</p>
                        <p className="text-[10px] text-emerald-500/80 leading-tight">All sharded parameter weights are cached in your browser cache memory.</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('app-notification', {
                          detail: {
                            title: 'Re-initializing Engine',
                            message: 'Purging transient instances and building fresh WebGPU device pipeline...',
                            type: 'info'
                          }
                        }));
                        startLocalAiBackgroundLoading();
                      }}
                      className="px-2.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-700 dark:text-emerald-400 rounded-lg text-[10px] font-black transition cursor-pointer"
                    >
                      FORCED RESTART
                    </button>
                  </div>
                )}

                {/* Hard purge cache database */}
                {(integrityReport && integrityReport.files.length > 0) && (
                  <button
                    onClick={clearBrowserModelCache}
                    className="ml-auto px-3.5 py-2 text-xs font-bold bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 dark:bg-slate-800 dark:hover:bg-rose-950/20 dark:text-slate-400 dark:hover:text-rose-400 rounded-lg flex items-center gap-1.5 cursor-pointer transition"
                    title="Delete files from Cache Storage to recover disk space"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Purge Cache ({integrityReport.totalSizeMb} MB)</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Verification section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/60">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-indigo-500" />
                <h4 className="text-xs font-black uppercase text-slate-800 dark:text-slate-100 tracking-wider">Browser Cache Memory File Integrity</h4>
              </div>
              <button
                onClick={runIntegrityCheck}
                disabled={verifying}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 rounded-lg text-[10px] font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-55 transition"
              >
                <RefreshCw className={`h-3 w-3 ${verifying ? 'animate-spin' : ''}`} />
                <span>{verifying ? 'Verifying...' : 'Verify Files'}</span>
              </button>
            </div>

            {/* Model block checklist of files */}
            {integrityReport ? (
              <div className="space-y-3">
                {/* Result summary banner */}
                {integrityReport.status === 'pristine' && (
                  <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-3">
                    <ShieldCheck className="h-5 w-5 shrink-0" />
                    <div>
                      <p className="font-bold uppercase tracking-wider text-[11px]">Integrity Check Approved (100% Valid)</p>
                      <p className="text-[10px] text-emerald-600/85 dark:text-emerald-400/80 leading-normal mt-0.5">
                        Completed verification on <strong>{integrityReport.files.length}</strong> parameters bins and WebAssembly config targets. Model caches are mathematically verified and perfectly aligned for client-side evaluation.
                      </p>
                    </div>
                  </div>
                )}

                {integrityReport.status === 'incomplete' && (
                  <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
                    <div>
                      <p className="font-bold uppercase tracking-wider text-[11px]">Incomplete Local Cache Detected</p>
                      <p className="text-[10px] text-amber-600/85 dark:text-amber-400/80 leading-normal mt-0.5">
                        Found <strong>{integrityReport.files.length}</strong> segments in cache, but some critical shards or config layouts are still pending download. Let downloading run to conclusion before enabling local AI triggers.
                      </p>
                    </div>
                  </div>
                )}

                {integrityReport.status === 'no_cache' && (
                  <div className="p-5 text-center bg-slate-50 dark:bg-slate-950/20 rounded-xl border border-slate-100 dark:border-slate-800/65 flex flex-col items-center justify-center">
                    <HardDrive className="h-8 w-8 text-slate-300 dark:text-slate-700 mb-2.5" />
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No Cached Files Detected</p>
                    {integrityReport.error ? (
                      <div className="mt-2 text-[10px] text-amber-600 dark:text-amber-450 bg-amber-500/5 px-3 py-2.5 rounded-lg border border-amber-550/20 max-w-md text-left">
                        <p className="font-bold flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                          <span>Iframe Sandbox Security Warning:</span>
                        </p>
                        <p className="font-mono mt-1 text-[9px] bg-slate-150 dark:bg-slate-900/60 p-1 rounded overflow-x-auto text-slate-600 dark:text-slate-400">{integrityReport.error}</p>
                        <p className="mt-2 leading-relaxed text-slate-500 dark:text-slate-400 font-medium">Note: Browsers prevent direct Cache API inspection inside sandboxed iframe previews. This does not block actual model load or runtime execution. Open the application in a new tab for unconstrained monitoring.</p>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 max-w-sm mt-1">
                        No model shards have been saved in browser cache storage folders yet. Trigger background downloading to start local caching on your GPU.
                      </p>
                    )}
                  </div>
                )}

                {/* Shard list breakdown with search */}
                {integrityReport.files.length > 0 && (
                  <div className="space-y-2.5">
                    {/* Search filter input segment */}
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input 
                        type="text"
                        value={searchFilter}
                        onChange={e => setSearchFilter(e.target.value)}
                        placeholder="Search cached parameter shards, tokenizer configurations..."
                        className="w-full text-xs bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-850 px-9 py-2 rounded-lg font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800 dark:text-slate-200"
                      />
                    </div>

                    <div className="border border-slate-150 dark:border-slate-800 rounded-xl overflow-hidden">
                      <div className="bg-slate-50 dark:bg-slate-950/60 px-4 py-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider grid grid-cols-12 gap-2">
                        <span className="col-span-6">Segment Target File</span>
                        <span className="col-span-3 text-right">Allocation Size</span>
                        <span className="col-span-3 text-right">Verification Status</span>
                      </div>
                      <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/40">
                        {filteredFiles.length === 0 ? (
                          <div className="p-6 text-center text-xs text-slate-400 italic">
                            No files match the lookup filters.
                          </div>
                        ) : (
                          filteredFiles.map((file, i) => (
                            <div key={i} className="px-4 py-2.5 grid grid-cols-12 gap-2 items-center text-[11px] hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                              <span className="col-span-6 font-mono text-slate-700 dark:text-slate-350 truncate block" title={file.name}>
                                {file.name}
                              </span>
                              <span className="col-span-3 text-right font-mono text-slate-500 font-medium">
                                {file.sizeBytes > 0 
                                  ? `${(file.sizeBytes / (1024 * 1024)).toFixed(1)} MB` 
                                  : 'pending download'
                                }
                              </span>
                              <span className="col-span-3 text-right flex justify-end">
                                {file.status === 'verified' && (
                                  <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400">
                                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                                    <span>VERIFIED</span>
                                  </span>
                                )}
                                {file.status === 'cached' && (
                                  <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-blue-600 dark:text-blue-400">
                                    <Download className="h-3 w-3 shrink-0 animate-pulse" />
                                    <span>PARTIAL</span>
                                  </span>
                                )}
                                {file.status === 'missing' && (
                                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500">
                                    <Info className="h-3 w-3 shrink-0 text-slate-350" />
                                    <span>PENDING</span>
                                  </span>
                                )}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-400 italic flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-indigo-500" />
                <span>Running browser storage checks...</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer line */}
        <div className="px-6 py-4.5 bg-slate-50/50 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>Web-LLM model parameters are served by HuggingFace CDN layer.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-black bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg cursor-pointer transition uppercase"
          >
            Close Orchestrator
          </button>
        </div>
      </div>
    </div>
  );
}
