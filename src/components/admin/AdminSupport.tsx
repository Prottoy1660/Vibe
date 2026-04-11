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
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { useConfirmDialog } from '../../contexts/ConfirmDialogContext';
import { cn } from '../Layout';

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

interface TicketReplyRow {
  id: string;
  ticket_id: string;
  body: string;
  created_at: string;
  created_by: string | null;
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

const STATUS_BADGE: Record<TicketStatus, string> = {
  open: 'bg-amber-100 dark:bg-amber-500/15 text-amber-900 dark:text-amber-300',
  in_progress: 'bg-sky-100 dark:bg-sky-500/15 text-sky-900 dark:text-sky-300',
  resolved: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-900 dark:text-emerald-300',
  closed: 'bg-zinc-200 dark:bg-white/10 text-zinc-800 dark:text-zinc-300',
};

export const AdminSupport = () => {
  const { confirm } = useConfirmDialog();
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
  const [repliesByTicket, setRepliesByTicket] = useState<Record<string, TicketReplyRow[]>>({});

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

      const ticketIds = rows.map((r) => r.id);
      if (ticketIds.length > 0) {
        const { data: repData, error: repErr } = await supabase
          .from('support_ticket_replies')
          .select('id, ticket_id, body, created_at, created_by')
          .in('ticket_id', ticketIds)
          .order('created_at', { ascending: true });
        if (repErr) throw repErr;
        const by: Record<string, TicketReplyRow[]> = {};
        for (const r of (repData as TicketReplyRow[]) || []) {
          if (!by[r.ticket_id]) by[r.ticket_id] = [];
          by[r.ticket_id].push(r);
        }
        setRepliesByTicket(by);
      } else {
        setRepliesByTicket({});
      }

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
      setAdminReply('');
      setStatusEdit(selected.status);
    } else {
      setAdminReply('');
      setStatusEdit('open');
    }
  }, [selectedId, selected?.id, selected?.status]);

  const handleSaveReply = async () => {
    if (!selected || !user) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const reply = adminReply.trim();
      const payload: Record<string, unknown> = {
        status: statusEdit,
        updated_at: new Date().toISOString(),
      };
      if (reply) {
        const { error: insErr } = await supabase.from('support_ticket_replies').insert({
          ticket_id: selected.id,
          body: reply.slice(0, 8000),
          created_by: user.id,
        });
        if (insErr) throw insErr;
        payload.admin_reply = reply;
        payload.replied_at = new Date().toISOString();
        payload.replied_by = user.id;
      }

      const { error } = await supabase.from('support_tickets').update(payload).eq('id', selected.id);
      if (error) throw error;
      setSaveMsg({ type: 'ok', text: reply ? 'Reply added.' : 'Status updated.' });
      setAdminReply('');
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
    const ok = await confirm({
      title: 'Delete this ticket?',
      description: 'This action cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
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
    const replyHaystack = (repliesByTicket[t.id] || [])
      .map((r) => r.body)
      .join('\n')
      .toLowerCase();
    const matchesSearch =
      !q ||
      t.subject.toLowerCase().includes(q) ||
      t.body.toLowerCase().includes(q) ||
      (t.admin_reply || '').toLowerCase().includes(q) ||
      replyHaystack.includes(q) ||
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
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 max-w-2xl leading-relaxed">
                Review requests, update status, and reply — users read your message on their Support page. The sidebar
                shows a badge when tickets are open or in progress.
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

      <div className="rounded-2xl border border-gray-200/90 dark:border-[#2e2e36] bg-white dark:bg-[#151518] p-5 sm:p-6 shadow-sm dark:shadow-none">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-5">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search subject, message, user…"
              className="w-full rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#111113] py-3 pl-10 pr-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#111113] px-3.5 py-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
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
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#111113] px-3.5 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Reset
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-stretch xl:gap-8">
          <div className="max-h-[min(78vh,820px)] overflow-auto rounded-xl border border-gray-200 dark:border-[#303038] bg-gray-50/30 dark:bg-black/20 xl:max-h-[min(90vh,940px)] xl:min-h-[min(52vh,480px)]">
            <table className="w-full min-w-[320px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-100/95 dark:border-white/10 dark:bg-[#1c1c22]/95 backdrop-blur-sm">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    User
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Subject
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Status
                  </th>
                  <th className="w-10 px-2 py-3" aria-hidden />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
                {filtered.map((t) => {
                  const u = userMap[t.user_id];
                  const active = selectedId === t.id;
                  const attention = t.status === 'open' || t.status === 'in_progress';
                  return (
                    <tr
                      key={t.id}
                      className={cn(
                        'cursor-pointer transition-colors',
                        active
                          ? 'bg-indigo-50 dark:bg-indigo-950/35'
                          : 'hover:bg-white/80 dark:hover:bg-white/[0.04]',
                        attention && !active && 'border-l-2 border-l-amber-400 dark:border-l-amber-500',
                      )}
                      onClick={() => setSelectedId(t.id)}
                    >
                      <td className="px-4 py-3.5 align-top">
                        <div className="flex items-start gap-2">
                          {attention ? (
                            <span
                              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-400 dark:bg-amber-400"
                              title="Needs attention"
                              aria-hidden
                            />
                          ) : (
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-transparent" aria-hidden />
                          )}
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 dark:text-gray-100">{u?.name || '—'}</div>
                            <div className="mt-0.5 max-w-[200px] truncate text-xs text-gray-500 dark:text-gray-400">
                              {u?.email || t.user_id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="max-w-[220px] px-4 py-3.5 align-top text-gray-800 dark:text-gray-200">
                        <span className="line-clamp-2">{t.subject}</span>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize',
                            STATUS_BADGE[t.status],
                          )}
                        >
                          {t.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-2 py-3.5 align-middle text-indigo-500 dark:text-indigo-400">
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">No tickets match.</p>
            )}
          </div>

          <div className="flex min-h-[min(48vh,420px)] max-h-[min(78vh,820px)] flex-col overflow-hidden rounded-2xl border border-gray-200 dark:border-[#303038] bg-gray-50/40 dark:bg-[#111113]/60 shadow-inner dark:shadow-none xl:min-h-[min(52vh,480px)] xl:max-h-[min(90vh,940px)]">
            {!selected ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
                <LifeBuoy className="h-10 w-10 text-gray-300 dark:text-gray-600" aria-hidden />
                <p className="max-w-xs text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  Select a ticket from the list to read the customer message and send a reply.
                </p>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="shrink-0 border-b border-gray-200 dark:border-white/10 bg-white/80 px-4 py-3 dark:bg-[#16161c]/90 sm:px-5 sm:py-3.5">
                  <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">Customer</p>
                  <div className="flex flex-col gap-2 text-sm text-gray-900 dark:text-gray-100 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-1.5">
                    <span className="inline-flex items-center gap-2">
                      <User className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                      {userMap[selected.user_id]?.name || '—'}
                    </span>
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <Mail className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                      <span className="truncate">{userMap[selected.user_id]?.email}</span>
                    </span>
                    {userMap[selected.user_id]?.phone ? (
                      <span className="inline-flex items-center gap-2">
                        <Phone className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                        {userMap[selected.user_id]?.phone}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Conversation scrolls; reply form stays pinned below (page stays short). */}
                <div
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth px-3 py-3 sm:px-4 sm:py-4 dark:bg-gradient-to-b dark:from-black/15 dark:via-[#12121a]/70 dark:to-black/20"
                  role="region"
                  aria-label="Ticket messages — scroll if long"
                >
                  <div className="space-y-4 sm:space-y-5">
                    <div>
                      <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                        {CATEGORY_LABEL[selected.category]} · {format(new Date(selected.created_at), 'MMM d, yyyy · h:mm a')}
                      </p>
                      <h3 className="text-lg font-semibold leading-snug text-gray-900 dark:text-gray-100">
                        {selected.subject}
                      </h3>
                    </div>

                    <div>
                      <p className="mb-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Customer message</p>
                      <div className="rounded-2xl border border-gray-200/90 bg-white px-4 py-4 shadow-sm dark:border-white/10 dark:bg-[#1a1a20] sm:px-5 sm:py-4">
                        <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                          {selected.body}
                        </p>
                      </div>
                    </div>

                    {(repliesByTicket[selected.id] || []).map((r) => (
                      <div key={r.id}>
                        <p className="mb-2.5 flex flex-wrap items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-300">
                          <span className="inline-flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                            Reply sent to user
                          </span>
                          <span className="font-normal text-gray-500 dark:text-gray-400">
                            {format(new Date(r.created_at), 'MMM d, yyyy · h:mm a')}
                          </span>
                        </p>
                        <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/90 px-4 py-4 dark:border-indigo-500/30 dark:bg-indigo-950/40 sm:px-5 sm:py-4">
                          <p className="text-sm leading-relaxed text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
                            {r.body}
                          </p>
                        </div>
                      </div>
                    ))}
                    {(repliesByTicket[selected.id] || []).length === 0 && selected.admin_reply?.trim() ? (
                      <div>
                        <p className="mb-2.5 flex flex-wrap items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-300">
                          <span className="inline-flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                            Reply sent to user
                          </span>
                          {selected.replied_at ? (
                            <span className="font-normal text-gray-500 dark:text-gray-400">
                              {format(new Date(selected.replied_at), 'MMM d, yyyy · h:mm a')}
                            </span>
                          ) : null}
                        </p>
                        <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/90 px-4 py-4 dark:border-indigo-500/30 dark:bg-indigo-950/40 sm:px-5 sm:py-4">
                          <p className="text-sm leading-relaxed text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
                            {selected.admin_reply}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="shrink-0 border-t border-gray-200 dark:border-white/10 bg-white/95 px-4 py-3 backdrop-blur-sm dark:bg-[#141418]/95 sm:px-5 sm:py-4">
                  <p className="mb-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Reply & status</p>
                  <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,11rem)_1fr] lg:items-end lg:gap-x-4 lg:gap-y-0">
                    <div className="min-w-0">
                      <label className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-gray-200">Status</label>
                      <select
                        value={statusEdit}
                        onChange={(e) => setStatusEdit(e.target.value as TicketStatus)}
                        className="w-full rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100"
                      >
                        {STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0 lg:min-h-0">
                      <label className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-gray-200">Reply to user</label>
                      <textarea
                        value={adminReply}
                        onChange={(e) => setAdminReply(e.target.value)}
                        rows={4}
                        className="w-full resize-y rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#111113] px-3 py-3 text-sm leading-relaxed text-gray-900 dark:text-gray-100 min-h-[92px] max-h-[min(26vh,200px)]"
                        placeholder="Adds a new message for the customer (previous replies stay in the thread). Leave blank to update status only."
                      />
                    </div>
                  </div>

                  {saveMsg ? (
                    <div
                      className={cn(
                        'mt-3 flex items-start gap-2 rounded-xl border px-3.5 py-3 text-sm',
                        saveMsg.type === 'ok'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200'
                          : 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200',
                      )}
                    >
                      {saveMsg.type === 'ok' ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      ) : (
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      )}
                      <span className="leading-relaxed">{saveMsg.text}</span>
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-2.5 sm:gap-3">
                    <button
                      type="button"
                      onClick={handleSaveReply}
                      disabled={saving || deleting}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 transition hover:bg-indigo-500 disabled:opacity-60 sm:px-5"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                      Save reply & status
                    </button>

                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={saving || deleting}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60 dark:border-red-900/50 dark:bg-red-950/35 dark:text-red-300 dark:hover:bg-red-950/50 sm:px-5"
                    >
                      {deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                      Delete ticket
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
