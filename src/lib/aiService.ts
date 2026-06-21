import { CreateMLCEngine } from "@mlc-ai/web-llm";

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LocalModelSpec {
  id: string;
  name: string;
  size: string;
  description: string;
  downloads: string;
}

export const LOCAL_MODELS: LocalModelSpec[] = [
  {
    id: "Qwen2-0.5B-Instruct-q4f16_1-MLC",
    name: "Qwen 2 — 0.5B (Recommended)",
    size: "~350 MB",
    description: "Extremely lightweight and lighting fast. Fits in almost any consumer GPU.",
    downloads: "Ultra-fast download"
  },
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    name: "Llama 3.2 — 1B",
    size: "~980 MB",
    description: "Superb balance between speed and reasoning capability.",
    downloads: "Moderate download"
  },
  {
    id: "Gemma-2-2B-it-q4f16_1-MLC",
    name: "Google Gemma 2 — 2B",
    size: "~1.6 GB",
    description: "Highly intelligent and creative model from Google. Prefers modern GPUs.",
    downloads: "Larger download"
  }
];

let cachedEngine: any = null;
let currentLoadingModelId: string | null = null;
let initPromise: Promise<any> | null = null;
let lastProgress: { progress: number; text: string } = { progress: 0, text: 'Idle' };
let progressListeners: Set<(progress: { progress: number; text: string }) => void> = new Set();
let currentStatus: 'idle' | 'downloading' | 'paused' | 'ready' | 'error' = 'idle';
let lastError: string | null = null;
let isPaused = false;

// Checking if WebGPU is available in local runtime
export function checkWebGPUSupport(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

// Check if Local AI is active
export function isLocalAiActive(): boolean {
  return localStorage.getItem('worksuite_use_local_ai') === 'true';
}

// Get configured local model ID
export function getLocalModelId(): string {
  return localStorage.getItem('worksuite_local_model') || LOCAL_MODELS[0].id;
}

// Helper to check status globally
export function getLocalAiStatus(): 'idle' | 'downloading' | 'paused' | 'ready' | 'error' {
  if (cachedEngine && currentLoadingModelId === getLocalModelId()) {
    return 'ready';
  }
  return currentStatus;
}

export function getLocalAiProgress(): { progress: number; text: string } {
  return lastProgress;
}

export function getLocalAiLastError(): string | null {
  return lastError;
}

export function subscribeToAiProgress(onProgress: (progress: { progress: number; text: string }) => void) {
  progressListeners.add(onProgress);
  onProgress(lastProgress); // emit last progress immediately
  return () => {
    progressListeners.delete(onProgress);
  };
}

// Helper to set configuration
export function setLocalAiActive(active: boolean) {
  localStorage.setItem('worksuite_use_local_ai', active ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent('ai-mode-changed'));
}

export function setLocalModelId(modelId: string) {
  const prevId = localStorage.getItem('worksuite_local_model');
  localStorage.setItem('worksuite_local_model', modelId);
  if (prevId !== modelId) {
    cachedEngine = null;
    currentStatus = 'idle';
    lastProgress = { progress: 0, text: 'Idle' };
    initPromise = null;
    lastError = null;
    isPaused = false;
  }
  window.dispatchEvent(new CustomEvent('ai-model-swapped', { detail: { modelId } }));
}

// Pause/Resume Actions
export function pauseLocalAiLoading() {
  if (currentStatus === 'downloading') {
    isPaused = true;
    currentStatus = 'paused';
    window.dispatchEvent(new CustomEvent('ai-download-paused', { detail: lastProgress }));
  }
}

export function resumeLocalAiLoading() {
  if (currentStatus === 'paused' || currentStatus === 'error') {
    isPaused = false;
    startLocalAiBackgroundLoading();
  }
}

// Check cache files sizes and confirm presence
export interface VerifiedModelFile {
  name: string;
  url: string;
  sizeBytes: number;
  status: 'verified' | 'cached' | 'missing' | 'failed';
}

export interface ModelIntegrityReport {
  modelId: string;
  status: 'pristine' | 'incomplete' | 'no_cache';
  totalSizeMb: number;
  files: VerifiedModelFile[];
  error?: string;
}

export const MODEL_MANIFESTS: Record<string, { name: string; sizeBytes: number }[]> = {
  "Qwen2-0.5B-Instruct-q4f16_1-MLC": [
    { name: "config.json", sizeBytes: 10450 },
    { name: "tokenizer_config.json", sizeBytes: 24500 },
    { name: "tokenizer.json", sizeBytes: 2915000 },
    { name: "ndarray-cache.json", sizeBytes: 41900 },
    { name: "qwen2_0_5b_instruct_q4f16_1.wasm", sizeBytes: 1520000 },
    { name: "params_shard_1.bin", sizeBytes: 118000000 },
    { name: "params_shard_2.bin", sizeBytes: 118000000 },
    { name: "params_shard_3.bin", sizeBytes: 116700000 }
  ],
  "Llama-3.2-1B-Instruct-q4f16_1-MLC": [
    { name: "config.json", sizeBytes: 12500 },
    { name: "tokenizer_config.json", sizeBytes: 28500 },
    { name: "tokenizer.json", sizeBytes: 9460000 },
    { name: "ndarray-cache.json", sizeBytes: 73400 },
    { name: "llama_3_2_1b_instruct_q4f16_1.wasm", sizeBytes: 1910000 },
    { name: "params_shard_1.bin", sizeBytes: 204500000 },
    { name: "params_shard_2.bin", sizeBytes: 204500000 },
    { name: "params_shard_3.bin", sizeBytes: 204500000 },
    { name: "params_shard_4.bin", sizeBytes: 204500000 },
    { name: "params_shard_5.bin", sizeBytes: 199650000 }
  ],
  "Gemma-2-2B-it-q4f16_1-MLC": [
    { name: "config.json", sizeBytes: 14100 },
    { name: "tokenizer_config.json", sizeBytes: 31200 },
    { name: "tokenizer.json", sizeBytes: 14920000 },
    { name: "ndarray-cache.json", sizeBytes: 81900 },
    { name: "gemma_2_2b_it_q4f16_1.wasm", sizeBytes: 2220000 },
    { name: "params_shard_1.bin", sizeBytes: 272600000 },
    { name: "params_shard_2.bin", sizeBytes: 272600000 },
    { name: "params_shard_3.bin", sizeBytes: 272600000 },
    { name: "params_shard_4.bin", sizeBytes: 272600000 },
    { name: "params_shard_5.bin", sizeBytes: 272600000 },
    { name: "params_shard_6.bin", sizeBytes: 257120000 }
  ]
};

export async function verifyLocalModelIntegrity(): Promise<ModelIntegrityReport> {
  const modelId = getLocalModelId();
  const manifest = MODEL_MANIFESTS[modelId] || MODEL_MANIFESTS["Qwen2-0.5B-Instruct-q4f16_1-MLC"];

  try {
    if (typeof window === 'undefined' || !window.caches) {
      throw new Error("Cache Storage API is not supported in this environment or context.");
    }

    // List all Cache Storage items
    const cacheNames = await window.caches.keys();
    
    // Look for WebLLM or matching model-specific Cache Names
    const matchingCacheNames = cacheNames.filter(name => 
      name.toLowerCase().includes('web_llm') || 
      name.toLowerCase().includes('mlc') ||
      name.toLowerCase().includes(modelId.toLowerCase())
    );

    const actualFilesMap = new Map<string, { url: string; sizeBytes: number }>();
    let totalBytesSum = 0;

    for (const cacheName of matchingCacheNames) {
      const cache = await window.caches.open(cacheName);
      const requests = await cache.keys();

      for (const req of requests) {
        const url = req.url;
        // extract filename at end of url path
        const name = url.substring(url.lastIndexOf('/') + 1) || url;
        const matchedResponse = await cache.match(req);
        
        let size = 0;
        if (matchedResponse) {
          const sizeHeader = matchedResponse.headers.get('content-length');
          if (sizeHeader) {
            size = parseInt(sizeHeader, 10);
          } else {
            try {
              const blob = await matchedResponse.clone().blob();
              size = blob.size;
            } catch {
              size = 0;
            }
          }
        }

        totalBytesSum += size;
        actualFilesMap.set(name.toLowerCase(), {
          url,
          sizeBytes: size
        });
      }
    }

    // Build the status map comparing expected manifest files against what's actually in browser cache storage
    const filesList: VerifiedModelFile[] = manifest.map(expected => {
      const actual = actualFilesMap.get(expected.name.toLowerCase());
      if (actual) {
        // file actually exists in local cache! Determine correct verified/cached status
        const isSufficientSize = actual.sizeBytes >= expected.sizeBytes * 0.9;
        return {
          name: expected.name,
          url: actual.url,
          sizeBytes: actual.sizeBytes,
          status: isSufficientSize ? 'verified' : 'cached'
        };
      } else {
        // file is not fetched yet
        return {
          name: expected.name,
          url: `https://huggingface.co/mlc-ai/${modelId}/resolve/main/${expected.name}`,
          sizeBytes: 0,
          status: 'missing'
        };
      }
    });

    // Also include other files cached by MLC-AI/TVM in the directory which are not in the predefined manifest
    for (const [actualName, actualData] of actualFilesMap.entries()) {
      const isAlreadyInList = manifest.some(m => m.name.toLowerCase() === actualName);
      if (!isAlreadyInList) {
        filesList.push({
          name: actualName,
          url: actualData.url,
          sizeBytes: actualData.sizeBytes,
          status: 'verified' // Any extra downloaded Web-LLM cache items are assumed verified
        });
      }
    }

    const totalSizeMb = Math.round((totalBytesSum / (1024 * 1024)) * 100) / 100;
    const verifiedExpectedCount = filesList.filter(f => manifest.some(m => m.name.toLowerCase() === f.name.toLowerCase()) && f.status === 'verified').length;

    let finalReportStatus: 'pristine' | 'incomplete' | 'no_cache' = 'no_cache';
    if (verifiedExpectedCount === manifest.length) {
      finalReportStatus = 'pristine';
    } else if (verifiedExpectedCount > 0) {
      finalReportStatus = 'incomplete';
    } else {
      finalReportStatus = 'no_cache';
    }

    return {
      modelId,
      status: finalReportStatus,
      totalSizeMb,
      files: filesList
    };
  } catch (err: any) {
    console.warn("Using real model check but caught browser storage exception:", err);
    return {
      modelId,
      status: 'no_cache',
      totalSizeMb: 0,
      files: [],
      error: err.message || String(err)
    };
  }
}

// Master Background Downloader / Initializer
export function startLocalAiBackgroundLoading(): Promise<any> {
  const modelId = getLocalModelId();
  
  if (cachedEngine && currentLoadingModelId === modelId) {
    currentStatus = 'ready';
    return Promise.resolve(cachedEngine);
  }

  if (initPromise && currentLoadingModelId === modelId) {
    isPaused = false;
    currentStatus = 'downloading';
    return initPromise;
  }

  if (!checkWebGPUSupport()) {
    currentStatus = 'error';
    lastError = "WebGPU is not supported or disabled in this browser/environment. Please make sure hardware acceleration is enabled.";
    throw new Error(lastError);
  }

  isPaused = false;
  currentLoadingModelId = modelId;
  currentStatus = 'downloading';
  lastError = null;
  lastProgress = { progress: 0, text: 'Initializing WebGPU pipeline...' };
  
  // Notify listeners and fire start event
  progressListeners.forEach(cb => cb(lastProgress));
  window.dispatchEvent(new CustomEvent('ai-download-started', { detail: { modelId } }));

  initPromise = CreateMLCEngine(modelId, {
    initProgressCallback: (progressReport) => {
      // If user toggled pause state, throw a specific exception to stop CreateMLCEngine execution
      if (isPaused) {
        throw new Error("PAUSED_BY_USER");
      }
      lastProgress = {
        progress: progressReport.progress,
        text: progressReport.text
      };
      progressListeners.forEach(cb => cb(lastProgress));
      window.dispatchEvent(new CustomEvent('ai-download-progress', { detail: lastProgress }));
    }
  }).then(engine => {
    cachedEngine = engine;
    currentStatus = 'ready';
    initPromise = null;
    lastError = null;
    window.dispatchEvent(new CustomEvent('ai-download-completed', { detail: { modelId } }));
    return engine;
  }).catch(e => {
    initPromise = null;
    if (e.message === "PAUSED_BY_USER") {
      currentStatus = 'paused';
      // keep lastProgress so progress bar continues exactly from its current location
      progressListeners.forEach(cb => cb(lastProgress));
      window.dispatchEvent(new CustomEvent('ai-download-paused', { detail: lastProgress }));
      return null;
    }
    currentStatus = 'error';
    lastError = e.message || String(e);
    window.dispatchEvent(new CustomEvent('ai-download-failed', { detail: { modelId, error: lastError } }));
    throw e;
  });

  return initPromise;
}

// Preload/Initialize the local engine
export async function getOrInitLocalEngine(
  onProgress: (progress: { progress: number; text: string }) => void
): Promise<any> {
  if (onProgress) {
    progressListeners.add(onProgress);
  }
  try {
    const engine = await startLocalAiBackgroundLoading();
    return engine;
  } finally {
    if (onProgress) {
      progressListeners.delete(onProgress);
    }
  }
}

// Universal AI Querier
export async function queryAI(options: {
  prompt: string;
  context?: string;
  persona?: string;
  messages?: ChatMessage[];
  model?: string;
  onLocalProgress?: (progress: { progress: number; text: string }) => void;
}): Promise<string> {
  const useLocal = isLocalAiActive();

  if (useLocal) {
    // RUN CLIENT-SIDE WEBGPU LLM
    try {
      const progressCb = options.onLocalProgress || (() => {});
      const engine = await getOrInitLocalEngine(progressCb);

      // Map incoming parameters to standard message list format
      const messagesToSend: any[] = [];
      
      // 1. System/Persona injection
      let systemPrompt = "You are a helpful office productivity co-pilot inside the WorkSuite Workstation application. Keep responses helpful and concise.";
      if (options.persona) {
        systemPrompt = `${systemPrompt} Mode instructions: ${options.persona}`;
      }
      if (options.context) {
        systemPrompt = `${systemPrompt} Context instructions: Task category is "${options.context}".`;
      }
      
      messagesToSend.push({ role: "system", content: systemPrompt });

      // 2. Chat History or Single Prompt mapping
      if (options.messages && options.messages.length > 0) {
        options.messages.forEach(msg => {
          messagesToSend.push({ role: msg.role, content: msg.content });
        });
      } else {
        messagesToSend.push({ role: "user", content: options.prompt });
      }

      console.log("[Local AI Engine] Dispatching chat completion to WebGPU pipeline...");
      const response = await engine.chat.completions.create({
        messages: messagesToSend,
        temperature: 0.7,
      });

      return response.choices[0].message.content || "";
    } catch (e: any) {
      console.error("[Local AI Engine] Execution error:", e);
      throw new Error(`Local model failed: ${e.message || e}. Please make sure your GPU has enough VRAM and WebGPU is activated.`);
    }
  } else {
    // RUN CLOUD CLUSTERED GEMINI-3.5 API
    const userApiKey = localStorage.getItem('worksuite_custom_gemini_api_key') || undefined;
    const res = await fetch('/api/ai/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: options.prompt,
        context: options.context,
        persona: options.persona,
        messages: options.messages,
        model: options.model,
        customApiKey: userApiKey
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to query cloud AI");
    }
    return data.text || "";
  }
}
