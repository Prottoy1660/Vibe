import { useEffect, useRef, useState } from 'react';
import { Laptop, Loader2, Monitor, Save, Smartphone, UploadCloud } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getApiBaseUrl } from '../../lib/apiBase';
import { toast } from '../../lib/toast';

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
  return {
    enabled: v.enabled === true,
    forceComingSoon: v.forceComingSoon === true,
    windows: {
      ...defaultConfig.windows,
      ...(v.windows ?? {}),
    },
    android: {
      ...defaultConfig.android,
      ...(v.android ?? {}),
    },
    macos: {
      ...defaultConfig.macos,
      ...(v.macos ?? {}),
    },
  };
}

type PlatformKey = 'windows' | 'android' | 'macos';
type FieldKey = keyof PlatformDownload;

const ToggleSwitch = ({
  checked,
  onToggle,
  tone = 'indigo',
  ariaLabel,
}: {
  checked: boolean;
  onToggle: () => void;
  tone?: 'indigo' | 'amber';
  ariaLabel: string;
}) => {
  const activeTrack =
    tone === 'amber'
      ? 'bg-amber-500/90 dark:bg-amber-500'
      : 'bg-indigo-600 dark:bg-indigo-500';
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#151518] ${
        checked ? activeTrack : 'bg-gray-300 dark:bg-[#2e3037]'
      }`}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
    >
      <span
        className={`h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
};

export const AdminAppDownloads = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<DownloadConfig>(defaultConfig);
  const [uploading, setUploading] = useState<Record<PlatformKey, boolean>>({
    windows: false,
    android: false,
    macos: false,
  });
  const windowsUploadRef = useRef<HTMLInputElement>(null);
  const androidUploadRef = useRef<HTMLInputElement>(null);
  const macosUploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        const base = getApiBaseUrl().replace(/\/$/, '');
        const res = await fetch(`${base}/api/admin/ops/app-downloads`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || json?.message || 'Failed to load settings');
        if (cancelled) return;
        setConfig(normalizeConfig(json?.settings));
      } catch (error) {
        console.error('Failed to load app downloads settings', error);
        toast.error('Failed to load download settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPlatformField = (platform: PlatformKey, field: FieldKey, value: string) => {
    setConfig((prev) => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        [field]: value,
      },
    }));
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const base = getApiBaseUrl().replace(/\/$/, '');
      const res = await fetch(`${base}/api/admin/ops/app-downloads`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(config),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || json?.message || 'Failed to save settings');
      toast.success('Download page settings saved');
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error ? error.message : 'Failed to save settings';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleFilePick = async (platform: PlatformKey, file: File | null) => {
    if (!file) return;
    setUploading((prev) => ({ ...prev, [platform]: true }));
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const base = getApiBaseUrl().replace(/\/$/, '');

      const signRes = await fetch(`${base}/api/admin/ops/app-downloads/upload-sign-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          platform,
          file_name: file.name,
          content_type: file.type,
        }),
      });

      const signJson = await signRes.json().catch(() => ({}));
      if (!signRes.ok) throw new Error(signJson?.error || signJson?.message || 'Failed to get upload URL');

      const bucket = String(signJson.bucket || '');
      const path = String(signJson.path || '');
      const tokenForUpload = String(signJson.token || '');
      const publicUrl = String(signJson.public_url || '');
      if (!bucket || !path || !tokenForUpload || !publicUrl) {
        throw new Error('Upload metadata missing from server');
      }

      const { error: uploadErr } = await supabase.storage
        .from(bucket)
        .uploadToSignedUrl(path, tokenForUpload, file);
      if (uploadErr) throw uploadErr;

      setPlatformField(platform, 'url', publicUrl);
      toast.success(`${platform === 'windows' ? 'Windows' : platform === 'android' ? 'Android' : 'macOS'} file uploaded`);
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error ? error.message : 'Upload failed';
      toast.error(msg);
    } finally {
      setUploading((prev) => ({ ...prev, [platform]: false }));
      if (platform === 'windows' && windowsUploadRef.current) windowsUploadRef.current.value = '';
      if (platform === 'android' && androidUploadRef.current) androidUploadRef.current.value = '';
      if (platform === 'macos' && macosUploadRef.current) macosUploadRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Customer app download center</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Control visibility and set direct download links for Windows, Android, and macOS.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-gray-100 dark:border-[#26262d]">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Show download page to customers</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">If disabled, customers see an unavailable message.</p>
          </div>
          <ToggleSwitch
            checked={config.enabled}
            onToggle={() => setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
            ariaLabel="Show download page to customers"
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200/60 bg-amber-50/60 p-3 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
          <span>
            Coming soon is controlled per platform below.
            {config.forceComingSoon ? ' (Legacy global coming soon is currently ON — turn it off to use per-platform toggles.)' : ''}
          </span>
          {config.forceComingSoon ? (
            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, forceComingSoon: false }))}
              className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-amber-500"
            >
              Disable global coming soon
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {([
          { key: 'windows' as const, title: 'Windows download', icon: Laptop },
          { key: 'android' as const, title: 'Android download', icon: Smartphone },
          { key: 'macos' as const, title: 'macOS download', icon: Monitor },
        ]).map(({ key, title, icon: Icon }) => (
          <section key={key} className="rounded-2xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5">
            <div className="mb-4 flex items-center gap-2">
              <Icon className="h-5 w-5 text-indigo-500" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-[#2d2f36] bg-gray-50 dark:bg-[#0f1014] px-3 py-2.5">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-300">Show this platform card</p>
                <ToggleSwitch
                  checked={config[key].enabled}
                  onToggle={() =>
                    setConfig((prev) => ({
                      ...prev,
                      [key]: {
                        ...prev[key],
                        enabled: !prev[key].enabled,
                      },
                    }))
                  }
                  ariaLabel={`Show ${title} card`}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-amber-200/60 dark:border-amber-500/20 bg-amber-50/60 dark:bg-amber-500/10 px-3 py-2.5">
                <p className="text-xs font-medium text-amber-900 dark:text-amber-200">Show &ldquo;Coming soon&rdquo; for this platform</p>
                <ToggleSwitch
                  checked={Boolean(config[key].comingSoon)}
                  onToggle={() =>
                    setConfig((prev) => ({
                      ...prev,
                      // If old global setting is ON from earlier versions, turning on/off per platform should disable it.
                      forceComingSoon: false,
                      [key]: {
                        ...prev[key],
                        comingSoon: !prev[key].comingSoon,
                      },
                    }))
                  }
                  tone="amber"
                  ariaLabel={`Show coming soon for ${title}`}
                />
              </div>

              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                Button title
                <input
                  value={config[key].title}
                  onChange={(e) => setPlatformField(key, 'title', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-indigo-400 dark:border-[#2d2f36] dark:bg-[#0f1014] dark:text-gray-100"
                />
              </label>

              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                Subtitle
                <input
                  value={config[key].subtitle}
                  onChange={(e) => setPlatformField(key, 'subtitle', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-indigo-400 dark:border-[#2d2f36] dark:bg-[#0f1014] dark:text-gray-100"
                />
              </label>

              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                Version
                <input
                  value={config[key].version}
                  onChange={(e) => setPlatformField(key, 'version', e.target.value)}
                  placeholder="e.g. v1.0.4"
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-indigo-400 dark:border-[#2d2f36] dark:bg-[#0f1014] dark:text-gray-100"
                />
              </label>

              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                Download URL (uploaded file link)
                <input
                  value={config[key].url}
                  onChange={(e) => setPlatformField(key, 'url', e.target.value)}
                  placeholder="https://..."
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-indigo-400 dark:border-[#2d2f36] dark:bg-[#0f1014] dark:text-gray-100"
                />
              </label>

              <div className="flex items-center gap-2">
                <input
                  ref={key === 'windows' ? windowsUploadRef : key === 'android' ? androidUploadRef : macosUploadRef}
                  type="file"
                  className="hidden"
                  accept={key === 'windows' ? '.exe,.msi,.zip' : key === 'android' ? '.apk,.aab,.zip' : '.dmg,.pkg,.zip'}
                  onChange={(e) => {
                    void handleFilePick(key, e.target.files?.[0] ?? null);
                  }}
                />
                <button
                  type="button"
                  onClick={() =>
                    (key === 'windows' ? windowsUploadRef.current : key === 'android' ? androidUploadRef.current : macosUploadRef.current)?.click()
                  }
                  disabled={uploading[key]}
                  className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-60 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                >
                  {uploading[key] ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <UploadCloud className="h-3.5 w-3.5" />
                  )}
                  Upload {key === 'windows' ? 'EXE/MSI' : key === 'android' ? 'APK/AAB' : 'DMG/PKG'}
                </button>
                <span className="text-[11px] text-gray-500 dark:text-gray-400">Auto-fills download URL after upload</span>
              </div>

              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                Small note
                <textarea
                  value={config[key].note}
                  onChange={(e) => setPlatformField(key, 'note', e.target.value)}
                  rows={3}
                  className="mt-1 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-indigo-400 dark:border-[#2d2f36] dark:bg-[#0f1014] dark:text-gray-100"
                />
              </label>
            </div>
          </section>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] p-4">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Tip: upload your `.exe`, `.apk`, or `.dmg` files and keep URLs ready. You can hide any single platform card or mark specific platforms as "Coming soon" anytime.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void saveConfig()}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save app download settings
      </button>
    </div>
  );
};

