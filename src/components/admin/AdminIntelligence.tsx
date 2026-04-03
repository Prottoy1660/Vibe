import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Loader2,
  RefreshCw,
  Download,
  Globe,
  Monitor,
  Cpu,
  Wifi,
  ChevronRight,
  ChevronDown,
  Search,
  X,
  Activity,
  Users,
  MapPin,
  Fingerprint,
  Trash2,
  Smartphone,
  Chrome,
  Compass,
  AppWindow,
  Apple,
  LayoutGrid,
  Bot,
  Terminal,
  Laptop,
  Check,
  X as XIcon,
  Sparkles,
  Info,
  BarChart3,
  Table2,
} from 'lucide-react';
import { format, formatDistanceToNow, subDays } from 'date-fns';

interface Session {
  id: string;
  user_id: string;
  created_at: string;
  user_email?: string;
  user_name?: string;
  user_phone?: string;
  ip_address: string;
  country: string;
  city: string;
  region: string;
  isp: string;
  latitude: number | null;
  longitude: number | null;
  browser_name: string;
  browser_version: string;
  user_agent: string;
  language: string;
  timezone: string;
  cookies_enabled: boolean;
  do_not_track: string;
  os: string;
  platform: string;
  cpu_cores: number;
  device_memory: number;
  touch_support: boolean;
  screen_width: number;
  screen_height: number;
  color_depth: number;
  pixel_ratio: number;
  gpu_renderer: string;
  gpu_vendor: string;
  webgl_version: string;
  connection_type: string;
  downlink: number;
  rtt: number;
  battery_level: number | null;
  battery_charging: boolean | null;
  dark_mode: boolean;
  page_url: string;
  referrer: string;
  canvas_fingerprint: string;
}

const COUNTRY_FLAGS: Record<string, string> = {
  Bangladesh: '🇧🇩',
  'United States': '🇺🇸',
  India: '🇮🇳',
  'United Kingdom': '🇬🇧',
  Germany: '🇩🇪',
  Canada: '🇨🇦',
  Australia: '🇦🇺',
  France: '🇫🇷',
  Japan: '🇯🇵',
  Pakistan: '🇵🇰',
};

const getBrowserIcon = (name: string, className = 'w-4 h-4') => {
  if (name?.includes('Chrome')) return <Chrome className={className} />;
  if (name?.includes('Safari')) return <Compass className={className} />;
  if (name?.includes('Edge')) return <AppWindow className={className} />;
  if (name?.includes('Firefox')) return <Globe className={className} />;
  if (name?.includes('Opera')) return <Globe className={className} />;
  return <Globe className={className} />;
};

const getOSIcon = (os: string, className = 'w-4 h-4') => {
  if (os?.includes('Windows')) return <LayoutGrid className={className} />;
  if (os?.includes('macOS') || os?.includes('Mac')) return <Apple className={className} />;
  if (os?.includes('Android')) return <Bot className={className} />;
  if (os?.includes('iOS')) return <Smartphone className={className} />;
  if (os?.includes('Linux')) return <Terminal className={className} />;
  return <Laptop className={className} />;
};

const InfoRow = ({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) => {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-start justify-between py-2 border-b border-gray-100 dark:border-white/5 last:border-0">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-36">{label}</span>
      <span
        className={`text-xs text-right break-all flex items-center justify-end gap-1.5 ${
          mono
            ? 'font-mono bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-200'
            : 'text-gray-800 dark:text-gray-200'
        }`}
      >
        {typeof value === 'boolean' ? (
          value ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-500" /> Yes
            </>
          ) : (
            <>
              <XIcon className="w-3.5 h-3.5 text-red-500" /> No
            </>
          )
        ) : (
          value
        )}
      </span>
    </div>
  );
};

type MainTab = 'overview' | 'sessions';

export const AdminIntelligence = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const firstLoad = useRef(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [deleting, setDeleting] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>('overview');

  const fetchSessions = useCallback(async () => {
    if (firstLoad.current) setLoading(true);
    else setRefreshing(true);
    try {
      await supabase.from('user_sessions').delete().lt('created_at', subDays(new Date(), 7).toISOString());

      const { data, error } = await supabase
        .from('user_sessions')
        .select('*, users:user_id(email, name, phone, role)')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      const mapped = (data || [])
        .map((s: any) => ({
          ...s,
          user_email: s.users?.email || '',
          user_name: s.users?.name || '',
          user_phone: s.users?.phone || '',
          user_role: s.users?.role || '',
        }))
        // Admins should not be captured/shown in Intelligence.
        .filter((s: any) => s.user_role !== 'admin');

      setSessions(mapped);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error fetching intelligence data:', err);
    } finally {
      if (firstLoad.current) {
        setLoading(false);
        firstLoad.current = false;
      }
      setRefreshing(false);
    }
  }, []);

  const handleDeleteAll = async () => {
    if (!window.confirm('Delete all session snapshots? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await supabase.from('user_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      setSessions([]);
      setExpandedId(null);
    } catch (err) {
      console.error('Delete all failed:', err);
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchSessions]);

  const filtered = sessions.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.user_email?.toLowerCase().includes(q) ||
      s.user_name?.toLowerCase().includes(q) ||
      s.user_phone?.toLowerCase().includes(q) ||
      s.ip_address?.toLowerCase().includes(q) ||
      s.country?.toLowerCase().includes(q) ||
      s.browser_name?.toLowerCase().includes(q) ||
      s.os?.toLowerCase().includes(q) ||
      s.city?.toLowerCase().includes(q)
    );
  });

  const uniqueIPs = new Set(sessions.map((s) => s.ip_address)).size;
  const uniqueUsers = new Set(sessions.map((s) => s.user_id)).size;
  const countries = sessions.reduce((acc, s) => {
    if (s.country) acc[s.country] = (acc[s.country] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const topCountry = Object.entries(countries).sort((a, b) => b[1] - a[1])[0];

  const browsers = sessions.reduce((acc, s) => {
    if (s.browser_name) acc[s.browser_name] = (acc[s.browser_name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const exportCSV = () => {
    if (!sessions.length) return;
    const headers = Object.keys(sessions[0]).filter((k) => k !== 'user_email');
    const rows = sessions.map((s) =>
      headers
        .map((h) => {
          const v = (s as any)[h];
          return typeof v === 'string' && v.includes(',') ? `"${v}"` : (v ?? '');
        })
        .join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `user_intelligence_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statCards = [
    {
      icon: Users,
      label: 'Total sessions',
      value: sessions.length,
      accent: 'text-violet-600 dark:text-violet-400',
      bg: 'bg-violet-50 dark:bg-violet-500/10',
    },
    {
      icon: Users,
      label: 'Unique users',
      value: uniqueUsers,
      accent: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-500/10',
    },
    {
      icon: Globe,
      label: 'Unique IPs',
      value: uniqueIPs,
      accent: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    },
    {
      icon: MapPin,
      label: 'Top country',
      value: topCountry ? (
        <span className="flex items-center gap-1.5 text-base">
          {COUNTRY_FLAGS[topCountry[0]] ? <span>{COUNTRY_FLAGS[topCountry[0]]}</span> : <Globe className="w-4 h-4 text-gray-500" />}
          {topCountry[0]}
        </span>
      ) : (
        '—'
      ),
      accent: 'text-orange-600 dark:text-orange-400',
      bg: 'bg-orange-50 dark:bg-orange-500/10',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">User intelligence</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
                Browser, device, and network snapshots collected at login. Data older than{' '}
                <strong className="font-medium text-gray-800 dark:text-gray-200">7 days</strong> is removed automatically.
                Use <strong className="font-medium">Overview</strong> for summaries and <strong className="font-medium">Sessions</strong>{' '}
                for the full list.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-600 dark:text-gray-400 px-2 py-1 rounded-lg bg-white/60 dark:bg-white/5 border border-gray-200/80 dark:border-[#303038]">
              Last refresh: {formatDistanceToNow(lastRefresh, { addSuffix: true })}
            </span>
            <button
              type="button"
              onClick={() => setAutoRefresh((a) => !a)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                autoRefresh
                  ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-500/30'
                  : 'bg-white/80 dark:bg-white/5 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-[#303038] hover:border-indigo-300'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              {autoRefresh ? 'Auto-refresh on (30s)' : 'Auto-refresh off'}
            </button>
            <button
              type="button"
              onClick={() => fetchSessions()}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh now
            </button>
            <button
              type="button"
              onClick={exportCSV}
              disabled={!sessions.length}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#151518] hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={handleDeleteAll}
              disabled={deleting || sessions.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border border-red-100 dark:border-red-500/25 hover:bg-red-100/80 disabled:opacity-40"
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Clear all data
            </button>
          </div>
        </div>

        <div className="relative mt-6 flex flex-wrap gap-2 p-1 rounded-xl bg-white/60 dark:bg-black/20 border border-gray-200/80 dark:border-[#303038]">
          {[
            { id: 'overview' as const, label: 'Overview', sub: 'Charts & KPIs', icon: BarChart3 },
            { id: 'sessions' as const, label: 'Sessions', sub: 'Search & detail', icon: Table2 },
          ].map((t) => {
            const Icon = t.icon;
            const active = mainTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setMainTab(t.id)}
                className={`flex-1 min-w-[160px] flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
                  active
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="text-left">
                  <span className="block">{t.label}</span>
                  <span className={`block text-[11px] font-normal ${active ? 'text-indigo-100' : 'text-gray-500'}`}>
                    {t.sub}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {loading && sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-gray-200 dark:border-[#303038] bg-white dark:bg-[#151518]">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-3" />
          <p className="text-sm text-gray-500">Loading sessions…</p>
        </div>
      ) : (
        <>
          {mainTab === 'overview' && (
            <>
              <div className="rounded-xl border border-gray-100 dark:border-[#26262d] bg-indigo-50/40 dark:bg-indigo-500/5 px-4 py-3 flex items-start gap-2">
                <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Totals are computed from the <strong className="font-medium text-gray-800 dark:text-gray-200">latest 500</strong>{' '}
                  rows after the 7-day cleanup. Showing fewer countries usually means geo lookup failed or users are on VPN.
                </p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((stat, i) => (
                  <div
                    key={i}
                    className="bg-white dark:bg-[#151518] rounded-2xl border border-gray-100 dark:border-[#26262d] p-5 flex items-center gap-4 shadow-sm dark:shadow-none"
                  >
                    <div className={`p-3 rounded-xl ${stat.bg}`}>
                      <stat.icon className={`w-5 h-5 ${stat.accent}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{stat.label}</p>
                      <div className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-0.5 truncate">{stat.value}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-[#151518] rounded-2xl border border-gray-100 dark:border-[#26262d] p-5">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-indigo-500" /> Sessions by country
                  </h3>
                  <div className="space-y-3">
                    {Object.entries(countries)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 5)
                      .map(([country, count]) => (
                        <div key={country} className="flex items-center gap-3">
                          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-gray-50 dark:bg-white/5 text-lg">
                            {COUNTRY_FLAGS[country] ? <span>{COUNTRY_FLAGS[country]}</span> : <Globe className="w-4 h-4 text-gray-500" />}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-gray-700 dark:text-gray-200 font-medium truncate">{country || 'Unknown'}</span>
                              <span className="text-gray-500 dark:text-gray-400 shrink-0 ml-2">{count} sessions</span>
                            </div>
                            <div className="h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                                style={{ width: `${sessions.length ? (count / sessions.length) * 100 : 0}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    {Object.keys(countries).length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-8">No country data yet — location may show as unknown.</p>
                    )}
                  </div>
                </div>

                <div className="bg-white dark:bg-[#151518] rounded-2xl border border-gray-100 dark:border-[#26262d] p-5">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-indigo-500" /> Sessions by browser
                  </h3>
                  <div className="space-y-3">
                    {Object.entries(browsers)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 5)
                      .map(([browser, count]) => (
                        <div key={browser} className="flex items-center gap-3">
                          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-gray-50 dark:bg-white/5">
                            {getBrowserIcon(browser, 'w-4 h-4 text-blue-500')}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-gray-700 dark:text-gray-200 font-medium truncate">{browser}</span>
                              <span className="text-gray-500 dark:text-gray-400 shrink-0 ml-2">{count} sessions</span>
                            </div>
                            <div className="h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-sky-500 to-cyan-500 rounded-full"
                                style={{ width: `${sessions.length ? (count / sessions.length) * 100 : 0}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    {Object.keys(browsers).length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-8">No browser data yet.</p>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-center">
                <button
                  type="button"
                  onClick={() => setMainTab('sessions')}
                  className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Open session table →
                </button>
              </p>
            </>
          )}

          {mainTab === 'sessions' && (
            <div className="bg-white dark:bg-[#151518] rounded-2xl border border-gray-100 dark:border-[#26262d] overflow-hidden shadow-sm dark:shadow-none">
              <div className="p-4 border-b border-gray-100 dark:border-[#26262d] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gray-50/50 dark:bg-white/[0.02]">
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Fingerprint className="w-5 h-5 text-indigo-500" /> All sessions
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {filtered.length} shown · {sessions.length} loaded · Click a row for full technical detail
                  </p>
                </div>
                <div className="relative w-full sm:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search email, IP, country, browser…"
                    className="w-full pl-9 pr-9 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                {filtered.length === 0 ? (
                  <div className="py-16 text-center px-4">
                    <Fingerprint className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
                    <p className="text-gray-600 dark:text-gray-300 font-medium">
                      {sessions.length === 0 ? 'No sessions yet' : 'No rows match your search'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                      Sessions appear after users sign in with intelligence collection enabled. Try clearing the search or refresh.
                    </p>
                  </div>
                ) : (
                  <table className="min-w-[900px] w-full">
                    <thead className="bg-gray-50/80 dark:bg-white/[0.03]">
                      <tr>
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">User</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Location</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Browser / OS</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Screen</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Network</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">When</th>
                        <th className="px-4 py-3 w-10" aria-hidden />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                      {filtered.map((session) => (
                        <React.Fragment key={session.id}>
                          <tr
                            className="hover:bg-gray-50/80 dark:hover:bg-white/[0.03] cursor-pointer transition-colors"
                            onClick={() => setExpandedId(expandedId === session.id ? null : session.id)}
                          >
                            <td className="px-4 py-3 align-top">
                              <div className="flex items-center gap-2">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                  {(session.user_name?.[0] || session.user_email?.[0] || '?').toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  {session.user_name && (
                                    <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate max-w-[150px]">
                                      {session.user_name}
                                    </p>
                                  )}
                                  <p className="text-[10px] text-gray-500 truncate max-w-[170px]" title={session.user_email}>
                                    {session.user_email || `${session.user_id.slice(0, 8)}…`}
                                  </p>
                                  {session.user_phone && (
                                    <p className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">{session.user_phone}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="flex items-start gap-1.5">
                                <span className="text-base shrink-0 mt-0.5">
                                  {COUNTRY_FLAGS[session.country] ? <span>{COUNTRY_FLAGS[session.country]}</span> : <Globe className="w-4 h-4 text-gray-500" />}
                                </span>
                                <div>
                                  <p className="text-xs font-medium text-gray-800 dark:text-gray-200">
                                    {session.city || 'Unknown'}
                                  </p>
                                  <p className="text-[10px] text-gray-500">{session.country || '—'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <p className="text-xs font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                                {getBrowserIcon(session.browser_name, 'w-3.5 h-3.5 text-blue-500 shrink-0')}{' '}
                                <span>
                                  {session.browser_name} {session.browser_version?.split('.')[0]}
                                </span>
                              </p>
                              <p className="text-[10px] text-gray-500 flex items-center gap-1.5 mt-0.5">
                                {getOSIcon(session.os, 'w-3 h-3 text-gray-400 shrink-0')} <span className="truncate max-w-[140px]">{session.os}</span>
                              </p>
                            </td>
                            <td className="px-4 py-3 align-top text-xs text-gray-700 dark:text-gray-300">
                              {session.screen_width}×{session.screen_height}
                              <span className="block text-[10px] text-gray-500">{session.pixel_ratio}x DPR</span>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                                  session.connection_type === '4g'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
                                    : session.connection_type === '3g'
                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
                                      : 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300'
                                }`}
                              >
                                <Wifi className="w-2.5 h-2.5" />
                                {(session.connection_type || 'wifi').toUpperCase()}
                              </span>
                              {session.downlink ? (
                                <p className="text-[10px] text-gray-500 mt-0.5">{session.downlink} Mbps</p>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 align-top">
                              <p className="text-xs text-gray-600 dark:text-gray-300">
                                {formatDistanceToNow(new Date(session.created_at), { addSuffix: true })}
                              </p>
                              <p className="text-[10px] text-gray-500">{format(new Date(session.created_at), 'MMM d, HH:mm')}</p>
                            </td>
                            <td className="px-4 py-3 text-right align-top">
                              {expandedId === session.id ? (
                                <ChevronDown className="w-4 h-4 text-indigo-500 ml-auto" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />
                              )}
                            </td>
                          </tr>

                          {expandedId === session.id && (
                            <tr>
                              <td colSpan={7} className="bg-gray-50/90 dark:bg-white/[0.02] border-t-0">
                                <div className="px-4 py-5">
                                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3">Technical detail</p>
                                  {/* Keep Technical detail readable across devices.
                                      Max 2 columns so blocks don't become too narrow. */}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <DetailBlock title="User" icon={Users}>
                                      <InfoRow label="Full name" value={session.user_name || '—'} />
                                      <InfoRow label="Email" value={session.user_email || '—'} />
                                      <InfoRow label="Phone" value={session.user_phone || '—'} />
                                      <InfoRow label="User ID" value={session.user_id} mono />
                                    </DetailBlock>
                                    <DetailBlock title="Network & location" icon={Globe}>
                                      <InfoRow label="IP" value={session.ip_address} mono />
                                      <InfoRow
                                        label="Country"
                                        value={
                                          <span className="flex items-center gap-1.5 justify-end">
                                            {COUNTRY_FLAGS[session.country] ? <span>{COUNTRY_FLAGS[session.country]}</span> : null}{' '}
                                            {session.country || '—'}
                                          </span>
                                        }
                                      />
                                      <InfoRow label="City" value={session.city} />
                                      <InfoRow label="Region" value={session.region} />
                                      <InfoRow label="ISP" value={session.isp} />
                                      <InfoRow label="Timezone" value={session.timezone} />
                                    </DetailBlock>
                                    <DetailBlock title="Browser & device" icon={Monitor}>
                                      <InfoRow
                                        label="Browser"
                                        value={
                                          <span className="flex items-center gap-1 justify-end">
                                            {getBrowserIcon(session.browser_name, 'w-4 h-4 text-blue-500')}
                                            {session.browser_name} {session.browser_version}
                                          </span>
                                        }
                                      />
                                      <InfoRow
                                        label="OS"
                                        value={
                                          <span className="flex items-center gap-1 justify-end">
                                            {getOSIcon(session.os, 'w-4 h-4 text-gray-500')}
                                            {session.os}
                                          </span>
                                        }
                                      />
                                      <InfoRow label="Platform" value={session.platform} />
                                      <InfoRow label="Language" value={session.language} />
                                      <InfoRow label="Cookies" value={session.cookies_enabled} />
                                      <InfoRow label="Do not track" value={session.do_not_track || 'Not set'} />
                                      <InfoRow label="Dark mode pref." value={session.dark_mode} />
                                      <InfoRow label="Touch" value={session.touch_support} />
                                    </DetailBlock>
                                    <DetailBlock title="Hardware" icon={Cpu}>
                                      <InfoRow label="CPU cores" value={session.cpu_cores ? `${session.cpu_cores}` : null} />
                                      <InfoRow label="Device RAM" value={session.device_memory ? `${session.device_memory} GB` : null} />
                                      <InfoRow label="Screen" value={`${session.screen_width}×${session.screen_height}`} />
                                      <InfoRow label="Color depth" value={session.color_depth ? `${session.color_depth}-bit` : null} />
                                      <InfoRow label="Pixel ratio" value={session.pixel_ratio ? `${session.pixel_ratio}×` : null} />
                                      <InfoRow label="Connection" value={session.connection_type?.toUpperCase()} />
                                      <InfoRow label="Downlink" value={session.downlink ? `${session.downlink} Mbps` : null} />
                                      <InfoRow label="RTT" value={session.rtt ? `${session.rtt} ms` : null} />
                                    </DetailBlock>
                                    <DetailBlock title="GPU & session" icon={Activity}>
                                      <InfoRow label="GPU renderer" value={session.gpu_renderer} />
                                      <InfoRow label="GPU vendor" value={session.gpu_vendor} />
                                      <InfoRow label="WebGL" value={session.webgl_version} />
                                      <InfoRow
                                        label="Battery"
                                        value={
                                          session.battery_level !== null
                                            ? `${session.battery_level}%${session.battery_charging ? ' (charging)' : ''}`
                                            : null
                                        }
                                      />
                                      <InfoRow label="Referrer" value={session.referrer || 'Direct'} />
                                      <InfoRow label="Canvas hash" value={session.canvas_fingerprint} mono />
                                      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/5">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">User agent</p>
                                        <p className="text-[10px] font-mono text-gray-600 dark:text-gray-300 break-all leading-relaxed bg-gray-50 dark:bg-white/5 p-2 rounded-lg">
                                          {session.user_agent}
                                        </p>
                                      </div>
                                    </DetailBlock>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

function DetailBlock({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-[#151518] rounded-xl border border-gray-100 dark:border-[#26262d] p-4">
      <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-indigo-500" />
        {title}
      </h4>
      <div className="space-y-0">{children}</div>
    </div>
  );
}
