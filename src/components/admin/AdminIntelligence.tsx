import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Loader2, RefreshCw, Download, Globe, Monitor, Cpu, Wifi,
  Battery, Eye, ChevronRight, ChevronDown, Search, X,
  Activity, Users, MapPin, Fingerprint
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

interface Session {
  id: string;
  user_id: string;
  created_at: string;
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
  user_email?: string;
}

const COUNTRY_FLAGS: Record<string, string> = {
  'Bangladesh': '🇧🇩', 'United States': '🇺🇸', 'India': '🇮🇳',
  'United Kingdom': '🇬🇧', 'Germany': '🇩🇪', 'Canada': '🇨🇦',
  'Australia': '🇦🇺', 'France': '🇫🇷', 'Japan': '🇯🇵', 'Pakistan': '🇵🇰',
};

const getBrowserIcon = (name: string) => {
  const icons: Record<string, string> = {
    Chrome: '🌐', Firefox: '🦊', Safari: '🧭', Edge: '🔷', Opera: '🅾'
  };
  return icons[name] || '🌍';
};

const getOSIcon = (os: string) => {
  if (os?.includes('Windows')) return '🪟';
  if (os?.includes('macOS') || os?.includes('Mac')) return '🍎';
  if (os?.includes('Android')) return '🤖';
  if (os?.includes('iOS')) return '📱';
  if (os?.includes('Linux')) return '🐧';
  return '💻';
};

const StatBadge = ({ label, value, color }: { label: string; value: string | number; color: string }) => (
  <div className={`flex flex-col items-center p-3 rounded-xl ${color} min-w-[80px]`}>
    <span className="text-lg font-bold">{value}</span>
    <span className="text-[10px] font-medium mt-0.5 opacity-80">{label}</span>
  </div>
);

const InfoRow = ({ label, value, mono = false }: { label: string; value: string | number | boolean | null | undefined; mono?: boolean }) => {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-start justify-between py-2 border-b border-gray-100 dark:border-white/5 last:border-0">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-36">{label}</span>
      <span className={`text-xs text-right break-all ${mono ? 'font-mono bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-200' : 'text-gray-800 dark:text-gray-200'}`}>
        {typeof value === 'boolean' ? (value ? '✅ Yes' : '❌ No') : String(value)}
      </span>
    </div>
  );
};

export const AdminIntelligence = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchSessions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .select('*, users:user_id(email)')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      const mapped = (data || []).map((s: any) => ({
        ...s,
        user_email: s.users?.email || s.user_id,
      }));
      setSessions(mapped);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error fetching intelligence data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchSessions]);

  const filtered = sessions.filter(s => {
    const q = search.toLowerCase();
    return (
      s.user_email?.toLowerCase().includes(q) ||
      s.ip_address?.toLowerCase().includes(q) ||
      s.country?.toLowerCase().includes(q) ||
      s.browser_name?.toLowerCase().includes(q) ||
      s.os?.toLowerCase().includes(q) ||
      s.city?.toLowerCase().includes(q)
    );
  });

  // Compute top stats
  const uniqueIPs = new Set(sessions.map(s => s.ip_address)).size;
  const uniqueUsers = new Set(sessions.map(s => s.user_id)).size;
  const countries = sessions.reduce((acc, s) => {
    if (s.country) acc[s.country] = (acc[s.country] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const topCountry = Object.entries(countries).sort((a, b) => b[1] - a[1])[0];

  const browsers = sessions.reduce((acc, s) => {
    if (s.browser_name) acc[s.browser_name] = (acc[s.browser_name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const topBrowser = Object.entries(browsers).sort((a, b) => b[1] - a[1])[0];

  const exportCSV = () => {
    if (!sessions.length) return;
    const headers = Object.keys(sessions[0]).filter(k => k !== 'user_email');
    const rows = sessions.map(s =>
      headers.map(h => {
        const v = (s as any)[h];
        return typeof v === 'string' && v.includes(',') ? `"${v}"` : (v ?? '');
      }).join(',')
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading user intelligence data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Fingerprint className="w-6 h-6" /> User Intelligence Center
            </h2>
            <p className="text-purple-200 text-sm mt-1">Real-time browser, device & network profiling for every logged-in user.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs bg-white/20 px-2 py-1 rounded-lg">
              Last refresh: {formatDistanceToNow(lastRefresh, { addSuffix: true })}
            </span>
            <button
              onClick={() => setAutoRefresh(a => !a)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${autoRefresh ? 'bg-green-400 text-green-900' : 'bg-white/20 hover:bg-white/30'}`}
            >
              <Activity className="w-3.5 h-3.5" /> {autoRefresh ? 'Live ●' : 'Auto-refresh'}
            </button>
            <button
              onClick={fetchSessions}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-semibold transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-purple-700 rounded-lg text-xs font-bold hover:bg-purple-50 transition-all"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Users, label: 'Total Sessions', value: sessions.length, color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-500/10' },
          { icon: Users, label: 'Unique Users', value: uniqueUsers, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-500/10' },
          { icon: Globe, label: 'Unique IPs', value: uniqueIPs, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
          { icon: MapPin, label: 'Top Country', value: topCountry ? `${COUNTRY_FLAGS[topCountry[0]] || '🌍'} ${topCountry[0]}` : '-', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-500/10' },
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-[#151518] rounded-xl border border-gray-100 dark:border-[#26262d] p-5 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${stat.bg}`}>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{stat.label}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-0.5">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Top Countries & Browsers breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-[#151518] rounded-xl border border-gray-100 dark:border-[#26262d] p-5">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" /> Top Countries
          </h3>
          <div className="space-y-2">
            {Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([country, count]) => (
              <div key={country} className="flex items-center gap-3">
                <span className="text-lg">{COUNTRY_FLAGS[country] || '🌍'}</span>
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-700 dark:text-gray-200 font-medium">{country || 'Unknown'}</span>
                    <span className="text-gray-500 dark:text-gray-400">{count} sessions</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full"
                      style={{ width: `${(count / sessions.length) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
            {Object.keys(countries).length === 0 && <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No data yet</p>}
          </div>
        </div>

        <div className="bg-white dark:bg-[#151518] rounded-xl border border-gray-100 dark:border-[#26262d] p-5">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Monitor className="w-4 h-4 text-primary" /> Browser & OS Distribution
          </h3>
          <div className="space-y-2">
            {Object.entries(browsers).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([browser, count]) => (
              <div key={browser} className="flex items-center gap-3">
                <span className="text-lg">{getBrowserIcon(browser)}</span>
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-700 dark:text-gray-200 font-medium">{browser}</span>
                    <span className="text-gray-500 dark:text-gray-400">{count} sessions</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full"
                      style={{ width: `${(count / sessions.length) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
            {Object.keys(browsers).length === 0 && <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No data yet</p>}
          </div>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="bg-white dark:bg-[#151518] rounded-xl border border-gray-100 dark:border-[#26262d] overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-[#26262d] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">All Sessions</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{filtered.length} of {sessions.length} records</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search IP, country, browser, email..."
              className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-gray-200 dark:border-[#26262d] bg-gray-50 dark:bg-[#111113] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Fingerprint className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">No sessions collected yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Data appears here after the first user login after the SQL migration is applied.</p>
            </div>
          ) : (
            <table className="min-w-full">
              <thead className="bg-gray-50 dark:bg-white/5">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">User</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Location</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Browser / OS</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Screen</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Network</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">When</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {filtered.map(session => (
                  <React.Fragment key={session.id}>
                    <tr
                      className="hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer transition-colors"
                      onClick={() => setExpandedId(expandedId === session.id ? null : session.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                            {(session.user_email?.[0] || '?').toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-800 dark:text-gray-200 max-w-[150px] truncate">{session.user_email}</p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">{session.ip_address}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-base">{COUNTRY_FLAGS[session.country] || '🌍'}</span>
                          <div>
                            <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{session.city || 'Unknown'}</p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500">{session.country}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-xs font-medium text-gray-800 dark:text-gray-200">
                            {getBrowserIcon(session.browser_name)} {session.browser_name} {session.browser_version?.split('.')[0]}
                          </p>
                          <p className="text-[10px] text-gray-400 dark:text-gray-500">
                            {getOSIcon(session.os)} {session.os}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-700 dark:text-gray-300">{session.screen_width}×{session.screen_height}</p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">{session.pixel_ratio}x DPR</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          session.connection_type === '4g' ? 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400' :
                          session.connection_type === '3g' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400' :
                          'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
                        }`}>
                          <Wifi className="w-2.5 h-2.5" />
                          {session.connection_type?.toUpperCase() || 'WiFi'}
                        </span>
                        {session.downlink && <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{session.downlink} Mbps</p>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-600 dark:text-gray-300">{formatDistanceToNow(new Date(session.created_at), { addSuffix: true })}</p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">{format(new Date(session.created_at), 'MMM d, HH:mm')}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {expandedId === session.id
                          ? <ChevronDown className="w-4 h-4 text-primary ml-auto" />
                          : <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 ml-auto" />
                        }
                      </td>
                    </tr>

                    {/* Expanded Detail Panel */}
                    {expandedId === session.id && (
                      <tr>
                        <td colSpan={7} className="bg-gray-50/80 dark:bg-white/[0.02] border-t-0">
                          <div className="px-4 py-5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">

                              {/* Network */}
                              <div className="bg-white dark:bg-[#151518] rounded-xl border border-gray-100 dark:border-[#26262d] p-4">
                                <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-1.5">
                                  <Globe className="w-3.5 h-3.5 text-blue-500" /> Network & Location
                                </h4>
                                <div className="space-y-0">
                                  <InfoRow label="IP Address" value={session.ip_address} mono />
                                  <InfoRow label="Country" value={`${COUNTRY_FLAGS[session.country] || ''} ${session.country}`} />
                                  <InfoRow label="City" value={session.city} />
                                  <InfoRow label="Region" value={session.region} />
                                  <InfoRow label="ISP" value={session.isp} />
                                  <InfoRow label="Latitude" value={session.latitude} />
                                  <InfoRow label="Longitude" value={session.longitude} />
                                  <InfoRow label="Timezone" value={session.timezone} />
                                </div>
                              </div>

                              {/* Browser */}
                              <div className="bg-white dark:bg-[#151518] rounded-xl border border-gray-100 dark:border-[#26262d] p-4">
                                <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-1.5">
                                  <Monitor className="w-3.5 h-3.5 text-purple-500" /> Browser & Device
                                </h4>
                                <div className="space-y-0">
                                  <InfoRow label="Browser" value={`${getBrowserIcon(session.browser_name)} ${session.browser_name} ${session.browser_version}`} />
                                  <InfoRow label="OS" value={`${getOSIcon(session.os)} ${session.os}`} />
                                  <InfoRow label="Platform" value={session.platform} />
                                  <InfoRow label="Language" value={session.language} />
                                  <InfoRow label="Cookies" value={session.cookies_enabled} />
                                  <InfoRow label="Do Not Track" value={session.do_not_track || 'Not set'} />
                                  <InfoRow label="Dark Mode" value={session.dark_mode} />
                                  <InfoRow label="Touch Screen" value={session.touch_support} />
                                </div>
                              </div>

                              {/* Hardware */}
                              <div className="bg-white dark:bg-[#151518] rounded-xl border border-gray-100 dark:border-[#26262d] p-4">
                                <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-1.5">
                                  <Cpu className="w-3.5 h-3.5 text-orange-500" /> Hardware
                                </h4>
                                <div className="space-y-0">
                                  <InfoRow label="CPU Cores" value={session.cpu_cores ? `${session.cpu_cores} cores` : null} />
                                  <InfoRow label="Device RAM" value={session.device_memory ? `${session.device_memory} GB` : null} />
                                  <InfoRow label="Screen" value={`${session.screen_width}×${session.screen_height}`} />
                                  <InfoRow label="Color Depth" value={session.color_depth ? `${session.color_depth}-bit` : null} />
                                  <InfoRow label="Pixel Ratio" value={session.pixel_ratio ? `${session.pixel_ratio}×` : null} />
                                  <InfoRow label="Network" value={session.connection_type?.toUpperCase()} />
                                  <InfoRow label="Downlink" value={session.downlink ? `${session.downlink} Mbps` : null} />
                                  <InfoRow label="Latency (RTT)" value={session.rtt ? `${session.rtt} ms` : null} />
                                </div>
                              </div>

                              {/* GPU & Fingerprint */}
                              <div className="bg-white dark:bg-[#151518] rounded-xl border border-gray-100 dark:border-[#26262d] p-4">
                                <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-1.5">
                                  <Activity className="w-3.5 h-3.5 text-green-500" /> GPU & Session
                                </h4>
                                <div className="space-y-0">
                                  <InfoRow label="GPU Renderer" value={session.gpu_renderer} />
                                  <InfoRow label="GPU Vendor" value={session.gpu_vendor} />
                                  <InfoRow label="WebGL Version" value={session.webgl_version} />
                                  <InfoRow label="Battery" value={session.battery_level !== null ? `${session.battery_level}%${session.battery_charging ? ' ⚡ Charging' : ''}` : null} />
                                  <InfoRow label="Referrer" value={session.referrer || 'Direct'} />
                                  <InfoRow label="Canvas Hash" value={session.canvas_fingerprint} mono />
                                </div>

                                {/* User Agent */}
                                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/5">
                                  <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">User Agent</p>
                                  <p className="text-[10px] font-mono text-gray-600 dark:text-gray-300 break-all leading-relaxed bg-gray-50 dark:bg-white/5 p-2 rounded-lg">
                                    {session.user_agent}
                                  </p>
                                </div>
                              </div>

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
    </div>
  );
};
