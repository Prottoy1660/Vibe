import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Loader2,
  ScrollText,
  Search,
  Filter,
  RefreshCw,
  Server,
  Database,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { format, parseISO, startOfDay, endOfDay, subDays } from 'date-fns';
import {
  friendlyActivityTitle,
  humanizeHttpStatus,
  technicalApiLine,
  rowMatchesSearch,
} from '../../lib/adminActivityLogLabels';

interface LogRow {
  id: string;
  actor_id: string | null;
  action: string;
  summary: string;
  details: Record<string, unknown> | null;
  source: string;
  http_method: string | null;
  path: string | null;
  status_code: number | null;
  duration_ms: number | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

type SourceFilter = 'all' | 'api' | 'database';

export const AdminActivityLog = () => {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actorMap, setActorMap] = useState<Record<string, { name: string; email: string }>>({});
  const [q, setQ] = useState('');
  const [source, setSource] = useState<SourceFilter>('all');
  const [dateFrom, setDateFrom] = useState(() => format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const start = startOfDay(parseISO(dateFrom)).toISOString();
      const end = endOfDay(parseISO(dateTo)).toISOString();

      let query = supabase
        .from('admin_activity_logs')
        .select('*')
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false })
        .limit(500);

      if (source === 'api') query = query.eq('source', 'api');
      if (source === 'database') query = query.eq('source', 'database');

      const { data, error } = await query;
      if (error) throw error;

      const list = (data || []) as LogRow[];
      setRows(list);

      const ids = [...new Set(list.map((r) => r.actor_id).filter(Boolean))] as string[];
      if (ids.length) {
        const { data: users } = await supabase.from('users').select('id, name, email').in('id', ids);
        const m: Record<string, { name: string; email: string }> = {};
        for (const u of users || []) {
          m[u.id] = { name: u.name || '—', email: u.email || '' };
        }
        setActorMap(m);
      } else {
        setActorMap({});
      }
    } catch (e) {
      console.error('admin_activity_logs:', e);
      alert(e instanceof Error ? e.message : 'Could not load activity log');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, source]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => rowMatchesSearch(r, s));
  }, [rows, q]);

  const toggleRow = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-6 pb-12">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-slate-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shrink-0">
              <ScrollText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Activity log</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
                Admin API calls and database changes while signed in as admin or super admin. The summary column uses
                plain-language descriptions; expand a row for raw paths and JSON. Sensitive request fields are redacted.
                Entries are append-only.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-4 md:p-5 shadow-sm space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-end gap-3 flex-wrap">
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400 min-w-[140px]">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400 min-w-[140px]">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm"
            />
          </label>
          <div className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Source
            </span>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as SourceFilter)}
              className="px-3 py-2 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm min-w-[160px]"
            >
              <option value="all">All sources</option>
              <option value="api">API only</option>
              <option value="database">Database only</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px] flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1">
              <Search className="w-3.5 h-3.5" /> Search
            </span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search activity, path, HTTP message…"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 shrink-0"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </button>
        </div>

        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Showing up to 500 events in range · {filtered.length} match filters
        </p>
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-20 rounded-2xl border border-dashed border-gray-200 dark:border-[#303038]">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400 rounded-2xl border border-gray-100 dark:border-[#26262d]">
          No activity in this range.
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] overflow-hidden shadow-sm">
          <div className="overflow-x-auto max-h-[min(70vh,720px)] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50/95 dark:bg-[#1a1a1f] backdrop-blur border-b border-gray-100 dark:border-[#26262d]">
                <tr>
                  <th className="py-3 px-3 w-8" />
                  <th className="py-3 px-3 text-[10px] font-bold text-gray-500 uppercase">When</th>
                  <th className="py-3 px-3 text-[10px] font-bold text-gray-500 uppercase">Who</th>
                  <th className="py-3 px-3 text-[10px] font-bold text-gray-500 uppercase">Source</th>
                  <th className="py-3 px-3 text-[10px] font-bold text-gray-500 uppercase">Summary</th>
                  <th className="py-3 px-3 text-[10px] font-bold text-gray-500 uppercase text-right">Result</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const open = !!expanded[r.id];
                  const actor = r.actor_id ? actorMap[r.actor_id] : null;
                  const title = friendlyActivityTitle(r);
                  const httpInfo = humanizeHttpStatus(r.status_code);
                  return (
                    <React.Fragment key={r.id}>
                      <tr
                        className="border-b border-gray-50 dark:border-white/[0.04] hover:bg-gray-50/60 dark:hover:bg-white/[0.02] cursor-pointer"
                        onClick={() => toggleRow(r.id)}
                      >
                        <td className="py-2.5 px-2 text-gray-400">
                          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-300">
                          {format(parseISO(r.created_at), 'MMM d, HH:mm:ss')}
                        </td>
                        <td className="py-2.5 px-3 text-xs max-w-[160px]">
                          {actor ? (
                            <>
                              <span className="font-medium text-gray-900 dark:text-gray-100 block truncate">
                                {actor.name}
                              </span>
                              <span className="text-[10px] text-gray-500 truncate block">{actor.email}</span>
                            </>
                          ) : r.actor_id ? (
                            <span className="font-mono text-[10px] text-gray-400 truncate block">{r.actor_id}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {r.source === 'api' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300">
                              <Server className="w-3 h-3" /> API
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300">
                              <Database className="w-3 h-3" /> DB
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-gray-800 dark:text-gray-200">
                          <span className="font-medium leading-snug">{title}</span>
                          {r.source === 'database' && (
                            <span className="block text-[10px] text-gray-500 mt-0.5 truncate max-w-[min(100vw,28rem)]">
                              {r.summary}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums align-top">
                          {httpInfo ? (
                            <span title={httpInfo.hint} className="inline-block text-left md:text-right">
                              <span
                                className={`text-xs font-bold tabular-nums ${
                                  httpInfo.variant === 'success'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : httpInfo.variant === 'redirect'
                                      ? 'text-sky-600 dark:text-sky-400'
                                      : httpInfo.variant === 'client'
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : httpInfo.variant === 'server'
                                          ? 'text-red-600 dark:text-red-400'
                                          : 'text-gray-500 dark:text-gray-400'
                                }`}
                              >
                                {httpInfo.code}
                              </span>
                              <span className="block text-[10px] font-medium text-gray-600 dark:text-gray-300 max-w-[9rem] md:max-w-none md:ml-0 leading-tight">
                                {httpInfo.label}
                              </span>
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                          {r.duration_ms != null && (
                            <span className="block text-[10px] text-gray-400 mt-0.5">{r.duration_ms} ms</span>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-gray-50/80 dark:bg-black/20 border-b border-gray-100 dark:border-[#26262d]">
                          <td colSpan={6} className="px-4 py-3 text-xs">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {r.source === 'api' && (
                                <div className="md:col-span-2">
                                  <span className="text-[10px] font-bold text-gray-500 uppercase">Technical</span>
                                  <p className="font-mono text-[11px] text-gray-700 dark:text-gray-300 break-all mt-0.5">
                                    {technicalApiLine(r.http_method, r.path)}
                                  </p>
                                  <p className="text-[10px] text-gray-500 mt-1">
                                    Stored summary: <span className="font-mono text-gray-600 dark:text-gray-400">{r.summary}</span>
                                  </p>
                                </div>
                              )}
                              {r.path && r.source !== 'api' && (
                                <div>
                                  <span className="text-[10px] font-bold text-gray-500 uppercase">Path</span>
                                  <p className="font-mono text-gray-800 dark:text-gray-200 break-all">{r.path}</p>
                                </div>
                              )}
                              <div className={r.source === 'api' ? 'md:col-span-2' : ''}>
                                <span className="text-[10px] font-bold text-gray-500 uppercase">Action key</span>
                                <p className="font-mono text-[11px] text-gray-700 dark:text-gray-300 break-all">{r.action}</p>
                              </div>
                              {r.ip_address && (
                                <div>
                                  <span className="text-[10px] font-bold text-gray-500 uppercase">IP</span>
                                  <p className="font-mono text-gray-800 dark:text-gray-200">{r.ip_address}</p>
                                </div>
                              )}
                              {r.user_agent && (
                                <div className="md:col-span-2">
                                  <span className="text-[10px] font-bold text-gray-500 uppercase">User agent</span>
                                  <p className="text-gray-600 dark:text-gray-400 break-all">{r.user_agent}</p>
                                </div>
                              )}
                              <div className="md:col-span-2">
                                <span className="text-[10px] font-bold text-gray-500 uppercase">Details (JSON)</span>
                                <pre className="mt-1 p-3 rounded-xl bg-gray-900/90 text-emerald-100/90 text-[11px] overflow-x-auto max-h-48 overflow-y-auto">
                                  {JSON.stringify(r.details || {}, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
