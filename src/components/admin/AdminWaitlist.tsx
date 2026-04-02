import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, Bell, Search, CheckCircle2, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';

interface Row {
  id: string;
  user_id: string;
  product_id: string;
  created_at: string;
  notified_at: string | null;
  users: { name: string; email: string; phone: string | null } | null;
  products: { title: string; price: number } | null;
}

export const AdminWaitlist: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'notified'>('all');
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('product_waitlist')
        .select('id, user_id, product_id, created_at, notified_at')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      const base = data || [];
      const userIds = [...new Set(base.map((r) => r.user_id))];
      const productIds = [...new Set(base.map((r) => r.product_id))];

      const [{ data: users }, { data: products }] = await Promise.all([
        userIds.length
          ? supabase.from('users').select('id, name, email, phone').in('id', userIds)
          : Promise.resolve({ data: [] as { id: string; name: string; email: string; phone: string | null }[] }),
        productIds.length
          ? supabase.from('products').select('id, title, price').in('id', productIds)
          : Promise.resolve({ data: [] as { id: string; title: string; price: number }[] }),
      ]);

      const uMap = Object.fromEntries((users || []).map((u) => [u.id, u]));
      const pMap = Object.fromEntries((products || []).map((p) => [p.id, p]));

      const merged: Row[] = base.map((r) => ({
        ...r,
        users: uMap[r.user_id] || null,
        products: pMap[r.product_id] || null,
      }));
      setRows(merged);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const markNotified = async (id: string) => {
    setUpdating(id);
    try {
      const { error } = await supabase.from('product_waitlist').update({ notified_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      await fetchRows();
    } catch (e) {
      console.error(e);
      alert('Could not update row');
    } finally {
      setUpdating(null);
    }
  };

  const filtered = rows.filter((r) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (r.users?.name || '').toLowerCase().includes(q) ||
      (r.users?.email || '').toLowerCase().includes(q) ||
      (r.products?.title || '').toLowerCase().includes(q);
    const pending = !r.notified_at;
    const matchesFilter = filter === 'all' || (filter === 'pending' ? pending : !pending);
    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shrink-0">
            <Bell className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Product waitlist</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Users who asked to be notified about a plan (e.g. price drop). Mark as notified after you email them.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#151518] rounded-2xl border border-gray-100 dark:border-[#26262d] p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search user or product…"
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113]"
          >
            <option value="all">All</option>
            <option value="pending">Pending notify</option>
            <option value="notified">Notified</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setFilter('all');
            }}
            className="inline-flex items-center gap-2 px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-[#26262d]"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-[#26262d]">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-[#26262d]">
              <tr>
                <th className="py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase">User</th>
                <th className="py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase">Product</th>
                <th className="py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase">Requested</th>
                <th className="py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.03]">
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{r.users?.name || '—'}</div>
                    <div className="text-xs text-gray-500">{r.users?.email}</div>
                  </td>
                  <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300 max-w-[200px] truncate">{r.products?.title || '—'}</td>
                  <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap">{format(new Date(r.created_at), 'MMM d, yyyy')}</td>
                  <td className="py-2.5 px-3">
                    {r.notified_at ? (
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Notified {format(new Date(r.notified_at), 'MMM d')}</span>
                    ) : (
                      <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Pending</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {!r.notified_at && (
                      <button
                        type="button"
                        disabled={updating === r.id}
                        onClick={() => markNotified(r.id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
                      >
                        {updating === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        Mark notified
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="py-12 text-center text-gray-500 text-sm">No waitlist entries yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};
