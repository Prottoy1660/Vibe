/// <reference types="vite-plugin-pwa/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { RootErrorBoundary } from './components/RootErrorBoundary';
import { toast } from './lib/toast';
import './index.css';

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

// Register PWA service worker
const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
const isAndroidRuntime = userAgent.includes('android');
const isTauriRuntime =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

if ('serviceWorker' in navigator && !isTauriRuntime && !isAndroidRuntime) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      immediate: true,
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
