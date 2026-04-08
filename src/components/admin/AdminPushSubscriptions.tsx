import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { BellRing, Loader2, RefreshCw, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type PushRow = {
  id: string;
  user_id: string;
  endpoint: string;
  user_agent: string | null;
  created_at: string;
  last_used_at: string | null;
  users?: { email: string | null; name: string | null; phone: string | null } | null;
};

type Grouped = {
  user_id: string;
  email: string;
  name: string;
  phone: string;
  devices: number;
  last_used_at: string | null;
  last_seen: string;
};

function safeStr(v: unknown) {
  return typeof v === 'string' ? v : '';
}

export const AdminPushSubscriptions: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<Grouped[]>([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase
        .from('push_subscriptions')
        .select('id, user_id, endpoint, user_agent, created_at, last_used_at, users:user_id(email, name, phone)')
        .order('created_at', { ascending: false })
        .limit(2000);

      if (error) throw error;
      const list = (data || []) as any as PushRow[];

      const byUser = new Map<string, Grouped>();
      for (const r of list) {
        const uid = r.user_id;
        const u = (r as any).users as PushRow['users'];
        const email = safeStr(u?.email) || '';
        const name = safeStr(u?.name) || '';
        const phone = safeStr(u?.phone) || '';

        const prev = byUser.get(uid);
        const lastUsed = r.last_used_at || null;
        if (!prev) {
          byUser.set(uid, {
            user_id: uid,
            email,
            name,
            phone,
            devices: 1,
            last_used_at: lastUsed,
            last_seen: r.created_at,
          });
        } else {
          prev.devices += 1;
          // last_seen: newest created_at
          if (new Date(r.created_at).getTime() > new Date(prev.last_seen).getTime()) prev.last_seen = r.created_at;
          // last_used_at: newest
          if (lastUsed) {
            const prevTs = prev.last_used_at ? new Date(prev.last_used_at).getTime() : 0;
            const nextTs = new Date(lastUsed).getTime();
            if (nextTs > prevTs) prev.last_used_at = lastUsed;
          }
        }
      }

      const grouped = [...byUser.values()].sort((a, b) => {
        const at = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
        const bt = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
        if (bt !== at) return bt - at;
        return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime();
      });

      setRows(grouped);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.email.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.phone.toLowerCase().includes(q) ||
      r.user_id.toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
              <BellRing className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Push notifications</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
                Shows which users enabled browser/device notifications (Web Push). One user can have multiple devices.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => void load()}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#151518] rounded-2xl border border-gray-100 dark:border-[#26262d] overflow-hidden shadow-sm dark:shadow-none">
        <div className="p-4 border-b border-gray-100 dark:border-[#26262d] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gray-50/50 dark:bg-white/[0.02]">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Enabled users</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {filtered.length} shown · {rows.length} total
            </p>
          </div>
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search email, name, phone, user id…"
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center px-4">
            <BellRing className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
            <p className="text-gray-600 dark:text-gray-300 font-medium">No enabled users found</p>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              Users must accept notification permission and subscribe on at least one device.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full">
              <thead className="bg-gray-50/80 dark:bg-white/[0.03]">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">User</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Devices</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Last push</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Subscribed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {filtered.map((r) => (
                  <tr key={r.user_id} className="hover:bg-gray-50/80 dark:hover:bg-white/[0.03]">
                    <td className="px-4 py-3 align-top">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate max-w-[260px]">
                          {r.name || r.email || `${r.user_id.slice(0, 8)}…`}
                        </p>
                        <p className="text-[10px] text-gray-500 truncate max-w-[320px]">
                          {r.email || r.user_id}
                        </p>
                        {r.phone ? (
                          <p className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">{r.phone}</p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300">
                        {r.devices}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-gray-600 dark:text-gray-300">
                      {r.last_used_at ? formatDistanceToNow(new Date(r.last_used_at), { addSuffix: true }) : '—'}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-gray-600 dark:text-gray-300">
                      {formatDistanceToNow(new Date(r.last_seen), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

