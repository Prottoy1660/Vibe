import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Info, Wrench, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { parsePlatformStatus, type PlatformStatusValue } from '../lib/platformStatus';

const STORAGE_KEY = 'platform_banner_dismissed_id';

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
  const isMaint = status.level === 'maintenance';
  const isDegraded = status.level === 'degraded';
  /** operational + banner = general announcement (still shows when admin enables banner + message) */
  const isOperational = status.level === 'operational';

  const tone = isMaint
    ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-100'
    : isDegraded
      ? 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/35 dark:text-amber-100'
      : 'border-indigo-200 bg-indigo-50 text-indigo-950 dark:border-indigo-900/40 dark:bg-indigo-950/35 dark:text-indigo-100';

  const Icon = isMaint ? Wrench : isOperational ? Info : AlertTriangle;

  return (
    <div className={`relative border-b px-4 py-3 pr-12 ${tone}`}>
      <div className="max-w-6xl mx-auto flex items-start gap-3 text-sm">
        <Icon className="w-5 h-5 shrink-0 mt-0.5 opacity-90" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold flex flex-wrap items-center gap-x-2 gap-y-1">
            {isMaint ? 'Maintenance' : isOperational ? 'Announcement' : 'Service notice'}
            <Link
              to="/status"
              className="inline-flex items-center gap-1 font-normal underline underline-offset-2 hover:opacity-90"
            >
              <Info className="w-3.5 h-3.5" />
              Status page
            </Link>
          </p>
          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-snug opacity-95">{status.message}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          sessionStorage.setItem(STORAGE_KEY, sig);
          setDismissed(true);
        }}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        aria-label="Dismiss banner"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
