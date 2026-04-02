import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ExternalLink, Info, Wrench, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { parsePlatformStatus, type PlatformStatusValue } from '../lib/platformStatus';

const STORAGE_KEY = 'platform_banner_dismissed_id';

type LevelKey = 'maintenance' | 'degraded' | 'operational';

const LEVEL: Record<
  LevelKey,
  {
    label: string;
    Icon: typeof Wrench;
    stripe: string;
    iconBox: string;
    labelTone: string;
  }
> = {
  maintenance: {
    label: 'Maintenance',
    Icon: Wrench,
    stripe: 'border-l-red-500',
    iconBox: 'bg-red-500/[0.08] text-red-600 dark:text-red-400',
    labelTone: 'text-red-700 dark:text-red-300',
  },
  degraded: {
    label: 'Service impact',
    Icon: AlertTriangle,
    stripe: 'border-l-amber-500',
    iconBox: 'bg-amber-500/[0.08] text-amber-700 dark:text-amber-300',
    labelTone: 'text-amber-800 dark:text-amber-200',
  },
  operational: {
    label: 'Announcement',
    Icon: Info,
    stripe: 'border-l-primary',
    iconBox: 'bg-primary/10 text-primary dark:text-violet-400',
    labelTone: 'text-gray-900 dark:text-gray-100',
  },
};

export const PlatformBanner: React.FC = () => {
  const [status, setStatus] = useState<PlatformStatusValue | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase.from('system_settings').select('value').eq('key', 'platform_status').maybeSingle();
        if (error) return;
        const v = parsePlatformStatus(data?.value);
        setStatus(v);
        const sig = `${v.level}:${v.message}:${v.show_banner}`;
        const last = sessionStorage.getItem(STORAGE_KEY);
        if (last === sig) setDismissed(true);
      } catch {
        /* ignore */
      }
    };
    load();
  }, []);

  if (!status?.show_banner || !status.message?.trim()) return null;
  if (dismissed) return null;

  const sig = `${status.level}:${status.message}:${status.show_banner}`;
  const key: LevelKey =
    status.level === 'maintenance' ? 'maintenance' : status.level === 'degraded' ? 'degraded' : 'operational';
  const { label, Icon, stripe, iconBox, labelTone } = LEVEL[key];

  return (
    <div
      className={`relative border-b border-gray-200 bg-white dark:border-[#26262d] dark:bg-[#111113] ${stripe} border-l-4`}
      role="region"
      aria-label="Platform status"
    >
      <div className="mx-auto flex max-w-6xl items-start gap-4 px-4 py-3.5 pr-14 md:px-8 md:pr-16">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBox}`}>
          <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-3 sm:gap-y-0">
            <span className={`text-sm font-semibold tracking-tight ${labelTone}`}>{label}</span>
            <span className="hidden text-gray-300 dark:text-gray-600 sm:inline" aria-hidden>
              ·
            </span>
            <Link
              to="/status"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition hover:text-primary/80 dark:text-violet-400 dark:hover:text-violet-300"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
              Status page
            </Link>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{status.message}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          sessionStorage.setItem(STORAGE_KEY, sig);
          setDismissed(true);
        }}
        className="absolute right-2 top-3 rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.06] dark:hover:text-gray-200 md:right-4 md:top-1/2 md:-translate-y-1/2"
        aria-label="Dismiss banner"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
};
