export function getApiBaseUrl() {
  const envUrl = (import.meta.env.VITE_API_URL || '').trim();
  if (envUrl) return envUrl.replace(/\/+$/, '');

  // Safe fallback for production if VITE_API_URL isn't configured.
  // In local dev, backend typically runs on 3001.
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3001';
  }

  return 'https://vibeaccessbd.shop';
}

