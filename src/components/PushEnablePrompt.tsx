import React, { useEffect, useMemo, useState } from 'react';
import { BellRing, Loader2, X } from 'lucide-react';
import {
  enableWebPush,
  getPushPermission,
  isIosDevice,
  isStandalonePwa,
  isWebPushSupported,
} from '../lib/webPushClient';

type Props = {
  userId: string;
};

function storageKey(userId: string) {
  return `push_prompt_state_v1:${userId}`;
}

export const PushEnablePrompt: React.FC<Props> = ({ userId }) => {
  const [perm, setPerm] = useState<NotificationPermission>('default');
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const supported = useMemo(() => isWebPushSupported(), []);
  const ios = useMemo(() => isIosDevice(), []);
  const standalone = useMemo(() => isStandalonePwa(), []);

  useEffect(() => {
    if (!userId) return;
    try {
      const raw = window.localStorage.getItem(storageKey(userId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as { dismissed?: boolean; snooze_until?: number };
      if (parsed.dismissed === true) {
        setDismissed(true);
        return;
      }
      if (typeof parsed.snooze_until === 'number' && Date.now() < parsed.snooze_until) {
        setDismissed(true);
      }
    } catch {
      // ignore malformed storage
    }
  }, [userId]);

  useEffect(() => {
    void (async () => {
      const p = await getPushPermission();
      setPerm(p);
    })();
  }, []);

  if (!supported) return null;
  if (dismissed) return null;
  if (perm === 'granted') return null;

  // On iOS, web push generally requires an installed PWA. Make this explicit to avoid confusion.
  const showIosHint = ios && !standalone;

  return (
    <div className="mb-4 rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-indigo-500/15 p-2 text-indigo-600 dark:text-indigo-400 shrink-0">
            <BellRing className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Turn on notifications
            </p>
            <p className="mt-0.5 text-xs leading-snug text-gray-600 dark:text-gray-400">
              Get reminders on your device even when this tab is closed.
              {showIosHint ? (
                <>
                  {' '}
                  On iPhone/iPad, install the app first (Safari → Share → <span className="font-medium">Add to Home Screen</span>).
                </>
              ) : null}
            </p>
            {perm === 'denied' ? (
              <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
                Notifications are blocked in your browser settings for this site.
              </p>
            ) : err ? (
              <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{err}</p>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            // "X" is a permanent dismiss for this device/browser.
            window.localStorage.setItem(storageKey(userId), JSON.stringify({ dismissed: true }));
            setDismissed(true);
          }}
          className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || perm === 'denied' || showIosHint}
          onClick={() => {
            void (async () => {
              setBusy(true);
              setErr(null);
              try {
                const out = await enableWebPush();
                const p = await getPushPermission();
                setPerm(p);
                if (!out.ok) throw new Error(out.reason || 'Enable failed');
                window.localStorage.setItem(storageKey(userId), JSON.stringify({ dismissed: true }));
                setDismissed(true);
              } catch (e: any) {
                setErr(e?.message || 'Enable failed');
              } finally {
                setBusy(false);
              }
            })();
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Enable notifications
        </button>
        <button
          type="button"
          onClick={() => {
            // "Not now" snoozes the prompt for 7 days.
            const sevenDays = 7 * 24 * 60 * 60 * 1000;
            window.localStorage.setItem(
              storageKey(userId),
              JSON.stringify({ dismissed: false, snooze_until: Date.now() + sevenDays }),
            );
            setDismissed(true);
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-[#303038] bg-white/70 dark:bg-white/5 px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-white"
        >
          Not now
        </button>
      </div>
    </div>
  );
};

