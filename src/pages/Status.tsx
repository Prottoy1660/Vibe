import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowLeft, CheckCircle2, Loader2, Server, AlertTriangle, Wrench } from 'lucide-react';
import { getApiBaseUrl } from '../lib/apiBase';
import { parsePlatformStatus, type PlatformStatusValue } from '../lib/platformStatus';
import { supabase } from '../lib/supabase';

export const Status: React.FC = () => {
  const [platform, setPlatform] = useState<PlatformStatusValue | null>(null);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const { data } = await supabase.from('system_settings').select('value').eq('key', 'platform_status').maybeSingle();
        setPlatform(parsePlatformStatus(data?.value));
      } catch {
        setPlatform(null);
      }

      const base = getApiBaseUrl();
      if (base) {
        try {
          const r = await fetch(`${base.replace(/\/$/, '')}/api/health`);
          setApiOk(r.ok);
        } catch {
          setApiOk(false);
        }
      } else {
        setApiOk(null);
      }
      setLoading(false);
    };
    run();
  }, []);

  const level = platform?.level ?? 'operational';

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 flex flex-col">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-[#111113]/90 backdrop-blur px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <Link
            to="/app"
            className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to app
          </Link>
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Status</span>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-10 md:py-14">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Activity className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">VibeAccess status</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Platform message and API health check.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121214] p-5 shadow-sm">
              <div className="flex items-start gap-3">
                {level === 'maintenance' ? (
                  <Wrench className="w-6 h-6 text-red-500 shrink-0" />
                ) : level === 'degraded' ? (
                  <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
                )}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Platform</p>
                  <p className="font-semibold capitalize mt-1">{level}</p>
                  {platform?.message?.trim() ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-2 whitespace-pre-wrap">{platform.message}</p>
                  ) : (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">No additional message.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121214] p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <Server className="w-6 h-6 text-indigo-500 shrink-0" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">API</p>
                  <p className="font-semibold mt-1">
                    {apiOk === null ? 'Not checked (no API URL)' : apiOk ? 'Reachable' : 'Unreachable'}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {getApiBaseUrl() || 'Configure VITE_API_URL or use same-origin in production.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-10 text-center">
          © {new Date().getFullYear()} VibeAccess — For account help, use Support in the app after signing in.
        </p>
      </main>
    </div>
  );
};
