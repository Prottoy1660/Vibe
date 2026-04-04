import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Loader2,
  LifeBuoy,
  Search,
  RotateCcw,
  Save,
  Mail,
  User,
  Phone,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';

type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
type TicketCategory = 'general' | 'billing' | 'adobe_access' | 'account' | 'other';

interface TicketRow {
  id: string;
  user_id: string;
  subject: string;
  body: string;
  category: TicketCategory;
  status: TicketStatus;
  admin_reply: string | null;
  replied_at: string | null;
  replied_by: string | null;
  created_at: string;
  updated_at: string;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

const CATEGORY_LABEL: Record<TicketCategory, string> = {
  general: 'General',
  billing: 'Billing',
  adobe_access: 'Adobe access',
  account: 'Account',
  other: 'Other',
};

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

export const AdminSupport = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [userMap, setUserMap] = useState<Record<string, UserRow>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adminReply, setAdminReply] = useState('');
  const [statusEdit, setStatusEdit] = useState<TicketStatus>('open');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);

      if (error) throw error;
      const rows = (data as TicketRow[]) || [];
      setTickets(rows);

      const ids = [...new Set(rows.map((r) => r.user_id))];
      if (ids.length > 0) {
        const { data: users, error: uErr } = await supabase
          .from('users')
          .select('id, name, email, phone')
          .in('id', ids);
        if (uErr) throw uErr;
        const m: Record<string, UserRow> = {};
        (users as UserRow[] | null)?.forEach((u) => {
          m[u.id] = u;
        });
        setUserMap(m);
      } else {
        setUserMap({});
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const selected = tickets.find((t) => t.id === selectedId);

  useEffect(() => {
    if (selected) {
      setAdminReply(selected.admin_reply || '');
      setStatusEdit(selected.status);
    } else {
      setAdminReply('');
      setStatusEdit('open');
    }
  }, [selectedId, selected]);

  const handleSaveReply = async () => {
    if (!selected || !user) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const reply = adminReply.trim();
      const payload: Record<string, unknown> = {
        status: statusEdit,
        admin_reply: reply || null,
        updated_at: new Date().toISOString(),
      };
      if (reply) {
        payload.replied_at = new Date().toISOString();
        payload.replied_by = user.id;
      }

      const { error } = await supabase.from('support_tickets').update(payload).eq('id', selected.id);
      if (error) throw error;
      setSaveMsg({ type: 'ok', text: 'Saved.' });
      await fetchTickets();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      setSaveMsg({ type: 'err', text: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!window.confirm('Are you sure you want to delete this ticket? This action cannot be undone.')) return;
    setDeleting(true);
    setSaveMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const res = await fetch(`/api/admin/ops/support-tickets/${selected.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');

      setTickets((prev) => prev.filter((t) => t.id !== selected.id));
      setSelectedId(null);
      setSaveMsg({ type: 'ok', text: 'Ticket deleted.' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to delete';
      setSaveMsg({ type: 'err', text: msg });
    } finally {
      setDeleting(false);
    }
  };

  const filtered = tickets.filter((t) => {
    const q = searchQuery.trim().toLowerCase();
    const u = userMap[t.user_id];
    const matchesSearch =
      !q ||
      t.subject.toLowerCase().includes(q) ||
      t.body.toLowerCase().includes(q) ||
      (u?.email || '').toLowerCase().includes(q) ||
      (u?.name || '').toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const counts = {
    open: tickets.filter((t) => t.status === 'open').length,
    in_progress: tickets.filter((t) => t.status === 'in_progress').length,
    resolved: tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length,
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
        <div className="relative flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shrink-0">
              <LifeBuoy className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Support tickets</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
                Review user requests, set status, and post a reply — users see your message on their Support page.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#151518] rounded-2xl p-5 border border-gray-100 dark:border-[#26262d]">
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Open</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums mt-1">{counts.open}</p>
        </div>
        <div className="bg-white dark:bg-[#151518] rounded-2xl p-5 border border-gray-100 dark:border-[#26262d]">
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">In progress</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums mt-1">{counts.in_progress}</p>
        </div>
        <div className="bg-white dark:bg-[#151518] rounded-2xl p-5 border border-gray-100 dark:border-[#26262d]">
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Resolved / closed</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums mt-1">{counts.resolved}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-[#151518] rounded-2xl border border-gray-100 dark:border-[#26262d] p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search subject, message, user…"
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          >
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
            }}
            className="inline-flex items-center gap-2 px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-[#26262d] max-h-[560px] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-[#26262d] z-10">
                <tr>
                  <th className="py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase">User</th>
                  <th className="py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase">Subject</th>
                  <th className="py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {filtered.map((t) => {
                  const u = userMap[t.user_id];
                  const active = selectedId === t.id;
                  return (
                    <tr
                      key={t.id}
                      className={`cursor-pointer transition-colors ${active ? 'bg-indigo-50/80 dark:bg-indigo-950/30' : 'hover:bg-gray-50/50 dark:hover:bg-white/[0.03]'}`}
                      onClick={() => setSelectedId(t.id)}
                    >
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[140px]">{u?.name || '—'}</div>
                        <div className="text-xs text-gray-500 truncate max-w-[160px]">{u?.email || t.user_id}</div>
                      </td>
                      <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300 max-w-[200px] truncate">{t.subject}</td>
                      <td className="py-2.5 px-3">
                        <span className="text-xs font-medium capitalize text-gray-600 dark:text-gray-400">{t.status.replace('_', ' ')}</span>
                      </td>
                      <td className="py-2.5 px-3 text-indigo-500">
                        <ChevronRight className="w-4 h-4" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="py-10 text-center text-gray-500 dark:text-gray-400 text-sm">No tickets match.</p>
            )}
          </div>

          <div className="rounded-xl border border-gray-100 dark:border-[#26262d] bg-gray-50/50 dark:bg-[#111113]/50 p-4 sm:p-5 min-h-[320px]">
            {!selected ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-16">Select a ticket to view and reply.</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Customer</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-800 dark:text-gray-200">
                    <span className="inline-flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-gray-400" />
                      {userMap[selected.user_id]?.name || '—'}
                    </span>
                    <span className="inline-flex items-center gap-1 min-w-0">
                      <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="truncate">{userMap[selected.user_id]?.email}</span>
                    </span>
                    {userMap[selected.user_id]?.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-gray-400" />
                        {userMap[selected.user_id]?.phone}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">
                    {CATEGORY_LABEL[selected.category]} · {format(new Date(selected.created_at), 'MMM d, yyyy HH:mm')}
                  </p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{selected.subject}</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 whitespace-pre-wrap">{selected.body}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Status</label>
                  <select
                    value={statusEdit}
                    onChange={(e) => setStatusEdit(e.target.value as TicketStatus)}
                    className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2 text-sm"
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Reply to user</label>
                  <textarea
                    value={adminReply}
                    onChange={(e) => setAdminReply(e.target.value)}
                    rows={6}
                    className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 resize-y min-h-[120px]"
                    placeholder="Your response will appear on the user's Support page."
                  />
                </div>

                {saveMsg && (
                  <p className={`text-sm ${saveMsg.type === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {saveMsg.text}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSaveReply}
                    disabled={saving || deleting}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2.5 text-sm disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save reply & status
                  </button>

                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={saving || deleting}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/40 font-semibold px-4 py-2.5 text-sm disabled:opacity-60 transition-colors"
                  >
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Delete Ticket
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
