/// <reference types="vite-plugin-pwa/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { RootErrorBoundary } from './components/RootErrorBoundary';
import { toast } from './lib/toast';
import './index.css';

function isChunkLoadFailure(err: unknown): boolean {
  const msg =
    (err instanceof Error ? err.message : typeof err === 'string' ? err : '')?.toString?.() || '';
  const lower = msg.toLowerCase();
  // Avoid false positives from unrelated extension/runtime script errors.
  const looksLikeAppAssetFailure =
    lower.includes('/assets/') ||
    lower.includes('assets/') ||
    lower.includes('.js') ||
    lower.includes('.mjs');
  return (
    looksLikeAppAssetFailure &&
    (/ChunkLoadError/i.test(msg) ||
      /Loading chunk [\d]+ failed/i.test(msg) ||
      /Failed to fetch dynamically imported module/i.test(msg) ||
      /Importing a module script failed/i.test(msg))
  );
}

function reloadOnceForChunkFailure() {
  const key = 'reloaded_for_chunk_failure_v1';
  if (typeof window === 'undefined') return;
  try {
    if (sessionStorage.getItem(key) === '1') return;
    sessionStorage.setItem(key, '1');
  } catch {
    // ignore
  }
  // Hard reload: bypass SW/HTTP caches as much as possible.
  const u = new URL(window.location.href);
  u.searchParams.set('__r', Date.now().toString());
  window.location.replace(u.toString());
}

if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID !== 'function') {
  const fallbackRandomUUID = () => {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    value: fallbackRandomUUID,
    configurable: true,
    writable: false,
  });
}

// If a deploy happens while a user is browsing, old cached chunks can mismatch new HTML.
// Catch the common "chunk failed to load" errors and force a one-time reload.
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    const anyE = e as any;
    if (isChunkLoadFailure(anyE?.error || anyE?.message)) reloadOnceForChunkFailure();
  });
  window.addEventListener('unhandledrejection', (e) => {
    const anyE = e as any;
    if (isChunkLoadFailure(anyE?.reason)) reloadOnceForChunkFailure();
  });
}

// Register PWA service worker
const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
const isAndroidRuntime = userAgent.includes('android');
const isTauriRuntime =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

if ('serviceWorker' in navigator && !isTauriRuntime && !isAndroidRuntime) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      // Do not force immediate activation checks while user is actively browsing;
      // this helps avoid unexpected refresh behavior after tab switches.
      immediate: false,
      onNeedRefresh() {
        toast.message('New version available', {
          description: 'Reload to update. Your current page will not auto-reload.',
          duration: Infinity,
          action: {
            label: 'Reload now',
            onClick: () => updateSW(true),
          },
        });
      },
    });
  }).catch(() => {});
}

const el = document.getElementById('root');
if (!el) {
  throw new Error('Missing #root element in index.html');
}

createRoot(el).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>
);
