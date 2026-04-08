import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useConfirmDialog } from '../../contexts/ConfirmDialogContext';
import { CheckSquare, Loader2, RefreshCw, Search, Square, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type Row = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
  users?: { email: string | null; name: string | null; phone: string | null } | null;
};

export const AdminUserInboxHistory: React.FC = () => {
  const { confirm } = useConfirmDialog();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(0);
  const pageRef = useRef(0);
  const [hasMore, setHasMore] = useState(true);

  const pageSize = 60;

  const loadPage = useCallback(async (opts?: { reset?: boolean }) => {
    const reset = opts?.reset === true;
    if (reset) {
      setLoading(true);
      setPage(0);
      pageRef.current = 0;
      setHasMore(true);
      setSelected({});
    } else {
      setRefreshing(true);
    }
    try {
      const nextPage = reset ? 0 : pageRef.current;
      const from = nextPage * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from('user_inbox')
        .select('id, user_id, title, body, read_at, created_at, users:user_id(email, name, phone)')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      const list = (data || []) as any as Row[];
      setRows((prev) => (reset ? list : [...prev, ...list]));
      setHasMore(list.length === pageSize);
      if (reset) {
        pageRef.current = 1;
        setPage(1);
      } else {
        pageRef.current = pageRef.current + 1;
        setPage(pageRef.current);
      }
    } catch (e) {
      console.error(e);
      if (reset) setRows([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadPage({ reset: true });
  }, [loadPage]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const email = (r.users?.email || '').toLowerCase();
      const name = (r.users?.name || '').toLowerCase();
      const phone = (r.users?.phone || '').toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        r.body.toLowerCase().includes(q) ||
        email.includes(q) ||
        name.includes(q) ||
        phone.includes(q) ||
        r.user_id.toLowerCase().includes(q)
      );
    });
  }, [rows, search]);

  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);
  const allVisibleSelected = useMemo(() => filtered.length > 0 && filtered.every((r) => selected[r.id]), [filtered, selected]);

  const toggleSelectAllVisible = () => {
    const next: Record<string, boolean> = { ...selected };
    const toValue = !allVisibleSelected;
    for (const r of filtered) next[r.id] = toValue;
    setSelected(next);
  };

  const deleteIds = async (ids: string[]) => {
    if (ids.length === 0) return;
    const ok = await confirm({
      title: `Delete ${ids.length} message${ids.length !== 1 ? 's' : ''}?`,
      description: 'This removes notifications from user inbox. They will no longer see them.\n\nThis cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    setDeleting(true);
    try {
      const { error } = await supabase.from('user_inbox').delete().in('id', ids);
      if (error) throw error;
      setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
      setSelected((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Delivery history</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              All inbox notifications you sent to users. Search, select, and delete when needed.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadPage({ reset: true })}
              disabled={refreshing || deleting}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void deleteIds(selectedIds)}
              disabled={deleting || selectedIds.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-200 border border-red-100 dark:border-red-500/25 hover:bg-red-100/80 disabled:opacity-40"
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Delete selected ({selectedIds.length})
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#151518] rounded-2xl border border-gray-100 dark:border-[#26262d] overflow-hidden shadow-sm dark:shadow-none">
        <div className="p-4 border-b border-gray-100 dark:border-[#26262d] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gray-50/50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSelectAllVisible}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#111113] text-xs font-semibold text-gray-700 dark:text-gray-200"
              title="Select all visible"
            >
              {allVisibleSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              Select
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Loaded {rows.length} · Showing {filtered.length}
            </span>
          </div>
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, body, email, phone…"
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
            <p className="text-gray-600 dark:text-gray-300 font-medium">No messages found</p>
            <p className="text-xs text-gray-500 mt-1">Try clearing the search or send a test notification.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full">
              <thead className="bg-gray-50/80 dark:bg-white/[0.03]">
                <tr>
                  <th className="px-4 py-3 w-10" aria-hidden />
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">To</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Message</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">When</th>
                  <th className="px-4 py-3 w-28" aria-hidden />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {filtered.map((r) => {
                  const email = r.users?.email || '';
                  const name = r.users?.name || '';
                  const phone = r.users?.phone || '';
                  const isUnread = !r.read_at;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/80 dark:hover:bg-white/[0.03]">
                      <td className="px-4 py-3 align-top">
                        <button
                          type="button"
                          onClick={() => setSelected((p) => ({ ...p, [r.id]: !p[r.id] }))}
                          className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                          title="Select"
                        >
                          {selected[r.id] ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate max-w-[260px]">
                            {name || email || `${r.user_id.slice(0, 8)}…`}
                          </p>
                          <p className="text-[10px] text-gray-500 truncate max-w-[320px]">{email || r.user_id}</p>
                          {phone ? <p className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">{phone}</p> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{r.title}</p>
                        <p className="mt-1 text-xs text-gray-600 dark:text-gray-300 line-clamp-2 max-w-[520px]">{r.body}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                            isUnread
                              ? 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200'
                              : 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-200'
                          }`}
                        >
                          {isUnread ? 'Unread' : 'Read'}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-gray-600 dark:text-gray-300">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        <button
                          type="button"
                          disabled={deleting}
                          onClick={() => void deleteIds([r.id])}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200 dark:hover:bg-red-950/45"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && hasMore ? (
          <div className="p-4 border-t border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518]">
            <button
              type="button"
              onClick={() => void loadPage()}
              disabled={refreshing}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#111113] px-4 py-2.5 text-sm font-semibold text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-50"
            >
              {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Load more
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

