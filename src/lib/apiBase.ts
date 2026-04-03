function stripWww(host: string) {
  return host.replace(/^www\./i, '');
}

export function getApiBaseUrl() {
  const envUrl = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1';

    if (!isLocal && envUrl) {
      try {
        const envHost = new URL(envUrl).host;
        // Apex vs www (or same site, different host label) — use same-origin so /api calls are not CORS-blocked
        if (envHost !== window.location.host && stripWww(envHost) === stripWww(window.location.host)) {
          return window.location.origin.replace(/\/+$/, '');
        }
      } catch {
        /* fall through */
      }
    }

    if (envUrl) return envUrl;

    if (isLocal) return 'http://localhost:3001';
    return window.location.origin.replace(/\/+$/, '');
  }

  if (envUrl) return envUrl;
  return '';
}

