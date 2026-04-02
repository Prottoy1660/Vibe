export function getApiBaseUrl() {
  const envUrl = (import.meta.env.VITE_API_URL || '').trim();
  if (envUrl) return envUrl.replace(/\/+$/, '');

  // Fallback when VITE_API_URL isn't configured:
  // - Local dev: backend typically runs on 3001
  // - Production: default to same-origin (Vercel-style /api routes)
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3001';
    return window.location.origin.replace(/\/+$/, '');
  }

  // SSR / non-browser fallback: leave empty so callers can decide
  return '';
}

