import { useEffect, useMemo } from 'react';

export const DesktopOauthCallback = () => {
  const links = useMemo(() => {
    if (typeof window === 'undefined') {
      return { deepLinkUrl: 'vibeaccess://auth-callback', intentUrl: 'vibeaccess://auth-callback' };
    }

    // Supabase often returns tokens in the URL hash. Convert hash params -> query params so Android intent URLs work.
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    const hashParams = new URLSearchParams(hash);
    const queryParams = new URLSearchParams(window.location.search);

    const merged = new URLSearchParams();
    // Prefer hash tokens (typical implicit flow) but keep existing query too.
    for (const [k, v] of queryParams.entries()) merged.set(k, v);
    for (const [k, v] of hashParams.entries()) merged.set(k, v);

    const qs = merged.toString();
    const deepLinkUrl = `vibeaccess://auth-callback${qs ? `?${qs}` : ''}`;

    // Android Chrome is most reliable with intent:// links (opens app chooser/prompt).
    const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '').toLowerCase() : '';
    const isAndroid = ua.includes('android');
    const intentUrl = isAndroid
      ? `intent://auth-callback${qs ? `?${qs}` : ''}#Intent;scheme=vibeaccess;package=com.vibeaccess.desktop;end`
      : deepLinkUrl;

    return { deepLinkUrl, intentUrl };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Try immediate handoff back to the desktop app after OAuth.
    window.location.replace(links.intentUrl);
  }, [links.intentUrl]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#09090b] px-4">
      <div className="max-w-md w-full rounded-2xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Signing you into Vibe Access app</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          If the app did not open automatically, tap the button below.
        </p>
        <a
          href={links.intentUrl}
          className="mt-5 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Open app
        </a>
      </div>
    </div>
  );
};
