import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';

type PlatformDownload = {
  enabled: boolean;
  comingSoon: boolean;
  title: string;
  subtitle: string;
  version: string;
  url: string;
  note: string;
};

type DownloadConfig = {
  enabled: boolean;
  // Legacy global switch (kept for backward compatibility with saved settings).
  // Coming-soon is now controlled per platform.
  forceComingSoon: boolean;
  windows: PlatformDownload;
  android: PlatformDownload;
  macos: PlatformDownload;
};

const defaultConfig: DownloadConfig = {
  enabled: false,
  windows: {
    enabled: true,
    comingSoon: false,
    title: 'Windows App',
    subtitle: 'Optimized desktop application for Windows 10/11.',
    version: '',
    url: '',
    note: '',
  },
  android: {
    enabled: true,
    comingSoon: false,
    title: 'Android App',
    subtitle: 'Fast mobile app with your full customer panel.',
    version: '',
    url: '',
    note: '',
  },
  macos: {
    enabled: true,
    comingSoon: false,
    title: 'macOS App',
    subtitle: 'Native-feel desktop app for MacBook and iMac.',
    version: '',
    url: '',
    note: '',
  },
  forceComingSoon: false,
};

function normalizeConfig(value: unknown): DownloadConfig {
  const v = (value ?? {}) as Partial<DownloadConfig>;
  const forceComingSoon = v.forceComingSoon === true;
  const windows = (v.windows ?? {}) as Partial<PlatformDownload>;
  const android = (v.android ?? {}) as Partial<PlatformDownload>;
  const macos = (v.macos ?? {}) as Partial<PlatformDownload>;
  return {
    enabled: v.enabled === true,
    forceComingSoon,
    windows: {
      ...defaultConfig.windows,
      ...windows,
      comingSoon: forceComingSoon || windows.comingSoon === true,
    },
    android: {
      ...defaultConfig.android,
      ...android,
      comingSoon: forceComingSoon || android.comingSoon === true,
    },
    macos: {
      ...defaultConfig.macos,
      ...macos,
      comingSoon: forceComingSoon || macos.comingSoon === true,
    },
  };
}

type PlatformKey = 'windows' | 'android' | 'macos';

const platformMeta: Record<
  PlatformKey,
  {
    accent: string;
    logoBg: string;
    logo: React.ReactNode;
    eyebrow: string;
    glow: string;
    button: string;
    pill: string;
  }
> = {
  windows: {
    accent: 'from-indigo-500/20 to-violet-500/10 dark:from-[#1a2233] dark:to-[#171b28]',
    logoBg: 'bg-[#0078d4]/10 dark:bg-[#1b2d45]',
    eyebrow: 'Desktop Build',
    glow: 'from-[#2b4b78]/20 via-[#1f2a3d]/10 to-transparent',
    button: 'bg-[#0078d4] hover:bg-[#006ab8] dark:bg-[#1f6fb8] dark:hover:bg-[#2f7fc7]',
    pill: 'text-[#0078d4] bg-[#0078d4]/10 dark:text-[#8ebeff] dark:bg-[#1a2740]',
    logo: (
      <svg viewBox="0 0 128 128" className="h-7 w-7" aria-hidden="true">
        <path
          fill="#0078d4"
          d="M67.328 67.331h60.669V128H67.328zm-67.325 0h60.669V128H.003zM67.328 0h60.669v60.669H67.328zM.003 0h60.669v60.669H.003z"
        />
      </svg>
    ),
  },
  android: {
    accent: 'from-emerald-500/20 to-cyan-500/10 dark:from-[#172a23] dark:to-[#17242b]',
    logoBg: 'bg-[#34A853]/10 dark:bg-[#183429]',
    eyebrow: 'Mobile Build',
    glow: 'from-[#2a5e3a]/20 via-[#1f3128]/10 to-transparent',
    button: 'bg-[#34A853] hover:bg-[#2d8f46] dark:bg-[#2b8a45] dark:hover:bg-[#379d54]',
    pill: 'text-[#34A853] bg-[#34A853]/10 dark:text-[#7bd79a] dark:bg-[#183327]',
    logo: (
      <img
        src="https://upload.wikimedia.org/wikipedia/commons/2/26/Android_Robot_Head_2023.svg"
        alt="Android"
        className="h-7 w-7 object-contain"
        loading="lazy"
        decoding="async"
      />
    ),
  },
  macos: {
    accent: 'from-gray-400/20 to-slate-500/10 dark:from-[#232630] dark:to-[#1c1f29]',
    logoBg: 'bg-black/10 dark:bg-[#2b2d36]',
    eyebrow: 'Mac Build',
    glow: 'from-[#454957]/20 via-[#2c2f39]/10 to-transparent',
    button: 'bg-gray-900 hover:bg-gray-800 dark:bg-[#c5c7cd] dark:hover:bg-[#d8dae0] dark:text-gray-900',
    pill: 'text-gray-800 bg-gray-900/10 dark:text-gray-200 dark:bg-[#2c2f38]',
    logo: (
      <img
        src="https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg"
        alt="Apple"
        className="h-7 w-7 object-contain dark:invert"
        loading="lazy"
        decoding="async"
      />
    ),
  },
};

export const Downloads = () => {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<DownloadConfig>(defaultConfig);

  useEffect(() => {
    let cancelled = false;

    const fetchConfig = async () => {
      try {
        const { data } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'customer_app_downloads')
          .maybeSingle();
        if (cancelled) return;
        setConfig(normalizeConfig(data?.value));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchConfig();

    const channel = supabase
      .channel(`customer_downloads:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings', filter: 'key=eq.customer_app_downloads' },
        () => {
          void fetchConfig();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const cards = useMemo(
    () => [
      { key: 'windows' as const, data: config.windows },
      { key: 'android' as const, data: config.android },
      { key: 'macos' as const, data: config.macos },
    ],
    [config],
  );
  const visibleCards = cards.filter(({ data }) => data.enabled);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-500 dark:border-[#33343b] dark:border-t-indigo-400" />
      </div>
    );
  }

  if (!config.enabled) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">App downloads are currently unavailable</h1>
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
            The download page is temporarily hidden. Please check again later or contact support.
          </p>
        </div>
      </div>
    );
  }

  if (visibleCards.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">No platform is available right now</h1>
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
            Please check back later. The admin has temporarily hidden all platform cards.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-gray-200 bg-white p-6 shadow-sm dark:border-[#2a2d36] dark:bg-[#111319] md:p-8">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 right-1/4 h-56 w-56 rounded-full bg-indigo-400/15 blur-3xl dark:bg-indigo-900/20" />
          <div className="absolute -bottom-28 -left-8 h-56 w-56 rounded-full bg-emerald-400/15 blur-3xl dark:bg-emerald-900/20" />
        </div>

        <div className="relative grid gap-5 md:grid-cols-[1.2fr_0.8fr] md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-900/20 dark:text-indigo-200">
              <Download className="h-3.5 w-3.5" />
              Official Download Hub
            </div>
            <h1 className="mt-3 text-3xl font-bold leading-tight text-gray-900 dark:text-gray-100 md:text-4xl">
              Pick your platform
              <span className="block bg-gradient-to-r from-indigo-500 via-violet-500 to-blue-500 bg-clip-text text-transparent dark:from-indigo-300 dark:via-violet-300 dark:to-blue-300">
                Launch Vibe instantly
              </span>
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              Clean installers, direct links, and the same premium experience across desktop and mobile.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {visibleCards.map(({ key }) => {
              const meta = platformMeta[key];
              return (
                <div key={`${key}-badge`} className="rounded-2xl border border-gray-200 bg-gray-50/80 p-3 text-center dark:border-[#30333c] dark:bg-[#151821]">
                  <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-white/50 bg-white shadow-sm dark:border-[#3a3d46] dark:bg-[#1b1f29]">
                    {meta.logo}
                  </div>
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">{key === 'windows' ? 'Windows' : key === 'android' ? 'Android' : 'macOS'}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {visibleCards.map(({ key, data }) => {
          const canDownload = !data.comingSoon && Boolean(data.url.trim());
          const meta = platformMeta[key];
          return (
            <section
              key={key}
              className="group relative flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-[#2a2d36] dark:bg-[#13151b] md:p-6"
            >
              <div className="pointer-events-none absolute inset-0">
                <div className={`absolute -right-20 -top-20 h-52 w-52 rounded-full bg-gradient-to-br ${meta.glow} blur-3xl opacity-60 transition-opacity duration-300 group-hover:opacity-100`} />
              </div>

              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.pill}`}>{meta.eyebrow}</span>
                  <h2 className="mt-3 text-xl font-bold text-gray-900 dark:text-gray-100">{data.title}</h2>
                  {data.version ? <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Version {data.version}</p> : null}
                </div>
                <div className={`shrink-0 rounded-2xl border border-white/40 p-3 shadow-sm transition-transform duration-300 group-hover:scale-110 dark:border-[#363944] ${meta.logoBg}`}>
                  <div className="h-7 w-7">{meta.logo}</div>
                </div>
              </div>

              <div className={`relative mt-4 rounded-2xl border border-white/40 bg-gradient-to-br ${meta.accent} p-4 dark:border-[#323540]`}>
                <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{data.subtitle}</p>
                {data.note ? <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{data.note}</p> : null}
              </div>

              {canDownload ? (
                <a
                  href={data.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`relative mt-5 inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] ${meta.button}`}
                >
                  <span className="absolute inset-y-0 -left-12 w-10 -skew-x-12 bg-white/35 opacity-0 transition-all duration-500 group-hover:left-[110%] group-hover:opacity-100" />
                  Download now
                  <ArrowRight className="h-4 w-4" />
                </a>
              ) : (
                <div className="mt-5 grid gap-2">
                  <a
                    href="/support"
                    className="inline-flex w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 dark:border-[#343844] dark:bg-[#1c1f29] dark:text-gray-100 dark:hover:bg-[#232635]"
                  >
                    Contact support
                  </a>
                  <button
                    type="button"
                    disabled
                    className="inline-flex w-full cursor-not-allowed items-center justify-center rounded-xl border border-gray-200 bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-500 dark:border-[#343844] dark:bg-[#2a2d37] dark:text-gray-400"
                  >
                    Coming soon
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};

