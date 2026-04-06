import { useEffect, useMemo } from 'react';

export const DesktopOauthCallback = () => {
  const links = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        deepLinkUrl: 'vibeaccess://auth-callback',
        intentUrl: 'vibeaccess://auth-callback',
        isAndroid: false,
        isWindows: false,
      };
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
    const isWindows = ua.includes('windows');
    const fallbackHttpUrl = (() => {
      // Keep tokens when falling back to this page (Android Chrome requires http(s) fallback).
      const base = `${window.location.origin}${window.location.pathname}`;
      return `${base}${qs ? `?${qs}&manual=1` : '?manual=1'}`;
    })();

    const intentUrl = isAndroid
      ? `intent://auth-callback${qs ? `?${qs}` : ''}#Intent;scheme=vibeaccess;package=com.vibeaccess.desktop;S.browser_fallback_url=${encodeURIComponent(fallbackHttpUrl)};end`
      : deepLinkUrl;

    return { deepLinkUrl, intentUrl, isAndroid, isWindows };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Best-effort handoff back to the app after OAuth.
    // Browsers may block automatic app openings; the button below is the reliable fallback.
    const timers: number[] = [];

    if (links.isAndroid) {
      // On Android, some browsers block immediate intent navigation but allow a delayed attempt.
      timers.push(
        window.setTimeout(() => {
          try {
            window.location.href = links.intentUrl;
          } catch {
            // ignore
          }
        }, 650),
      );
      // Secondary attempt via direct scheme.
      timers.push(
        window.setTimeout(() => {
          try {
            window.location.href = links.deepLinkUrl;
          } catch {
            // ignore
          }
        }, 1200),
      );
    } else {
      timers.push(window.setTimeout(() => window.location.replace(links.intentUrl), 250));
    }

    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [links.intentUrl]);

  return (
    <div className="relative min-h-screen bg-gray-50 dark:bg-[#09090b]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/3 h-56 w-56 rounded-full bg-indigo-500/15 blur-3xl dark:bg-indigo-900/20" />
        <div className="absolute -bottom-28 right-1/4 h-56 w-56 rounded-full bg-violet-500/10 blur-3xl dark:bg-violet-900/20" />
      </div>

      {/* Popup-style overlay */}
      <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg rounded-3xl border border-gray-200 bg-white/90 p-6 text-center shadow-xl backdrop-blur dark:border-[#26262d] dark:bg-[#151518]/90 sm:p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
            <span className="text-xl font-black">VA</span>
          </div>

          <h1 className="mt-4 text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
            {links.isWindows ? 'Open Vibe Access (Windows)' : links.isAndroid ? 'Open Vibe Access (Android)' : 'Open Vibe Access'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            Login is complete. Tap the button below to return to the app and finish signing in.
          </p>

          <a
            href={links.intentUrl}
            className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
          >
            Open app
          </a>

          {links.isAndroid ? (
            <a
              href={links.deepLinkUrl}
              className="mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 dark:border-[#2b2d34] dark:bg-[#111113] dark:text-gray-100 dark:hover:bg-[#151518]"
            >
              Try alternative link
            </a>
          ) : null}

          <p className="mt-4 text-xs text-gray-500 dark:text-gray-500">
            If nothing happens, make sure the Vibe Access app is installed and try again. On Android, you may also need to allow “Open supported links”.
          </p>
        </div>
      </div>
    </div>
  );
};
