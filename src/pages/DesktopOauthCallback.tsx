import { useEffect, useMemo } from 'react';

export const DesktopOauthCallback = () => {
  const deepLinkUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'vibeaccess://auth-callback';
    const hash = window.location.hash || '';
    const query = window.location.search || '';
    if (hash) return `vibeaccess://auth-callback${hash}`;
    if (query) return `vibeaccess://auth-callback${query}`;
    return 'vibeaccess://auth-callback';
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Try immediate handoff back to the desktop app after OAuth.
    window.location.replace(deepLinkUrl);
  }, [deepLinkUrl]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#09090b] px-4">
      <div className="max-w-md w-full rounded-2xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Signing you into Vibe Access app</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          If the desktop app did not open automatically, click the button below.
        </p>
        <a
          href={deepLinkUrl}
          className="mt-5 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Open desktop app
        </a>
      </div>
    </div>
  );
};
