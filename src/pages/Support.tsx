import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Loader2,
  LifeBuoy,
  Send,
  AlertCircle,
  CheckCircle2,
  Clock,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { format } from 'date-fns';

type TicketCategory = 'general' | 'billing' | 'adobe_access' | 'account' | 'other';
type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

interface SupportTicketReply {
  id: string;
  body: string;
  created_at: string;
}

interface SupportTicket {
  id: string;
  subject: string;
  body: string;
  category: TicketCategory;
  status: TicketStatus;
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
  support_ticket_replies?: SupportTicketReply[] | null;
}

const CATEGORY_LABEL: Record<TicketCategory, string> = {
  general: 'General',
  billing: 'Billing & payments',
  adobe_access: 'Adobe access',
  account: 'Account',
  other: 'Other',
};

const STATUS_STYLE: Record<TicketStatus, { label: string; className: string }> = {
  open: {
    label: 'Open',
    className: 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300',
  },
  in_progress: {
    label: 'In progress',
    className: 'bg-sky-100 dark:bg-sky-500/15 text-sky-800 dark:text-sky-300',
  },
  resolved: {
    label: 'Resolved',
    className: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
  },
  closed: {
    label: 'Closed',
    className: 'bg-zinc-200 dark:bg-white/10 text-zinc-700 dark:text-zinc-300',
  },
};

export const Support = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [category, setCategory] = useState<TicketCategory>('general');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const fetchTickets = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error: qErr } = await supabase
        .from('support_tickets')
        .select(
          'id, subject, body, category, status, admin_reply, replied_at, created_at, support_ticket_replies ( id, body, created_at )',
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (qErr) throw qErr;
      setTickets((data as SupportTicket[]) || []);
      setListError(null);
    } catch (e) {
      console.error(e);
      setListError('Could not load your tickets. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const s = subject.trim();
    const b = body.trim();
    if (s.length < 3) {
      setFormError('Please enter a clear subject (at least 3 characters).');
      return;
    }
    if (b.length < 10) {
      setFormError('Please describe your issue in more detail (at least 10 characters).');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    setSuccess(null);
    try {
      const { error: insErr } = await supabase.from('support_tickets').insert({
        user_id: user.id,
        subject: s.slice(0, 300),
        body: b.slice(0, 8000),
        category,
        status: 'open',
      });
      if (insErr) throw insErr;
      setSubject('');
      setBody('');
      setCategory('general');
      setSuccess('Your request was submitted. We will get back to you here.');
      await fetchTickets();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
        <div className="relative flex flex-col md:flex-row md:items-start gap-4">
          <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shrink-0">
            <LifeBuoy className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">Support</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 max-w-2xl leading-relaxed">
              Describe your issue below. Our team will review it and reply on this page when there is an update.
            </p>
            <p className="text-sm text-indigo-800/90 dark:text-indigo-200/90 mt-4 max-w-2xl leading-relaxed">
              Quick answers first? Use the <span className="font-semibold">Help</span> chat bubble (bottom-right). For a
              human, open a ticket here or use WhatsApp from that chat.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] shadow-sm dark:shadow-none p-6 sm:p-7">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2.5">
              <MessageSquare className="w-5 h-5 shrink-0 text-indigo-500" aria-hidden />
              New request
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 mb-6 leading-relaxed max-w-md">
              Include steps to reproduce, order ID if relevant, and what you expected to happen.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {formError && (
                <div className="flex gap-3 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3.5 text-sm leading-relaxed text-red-800 dark:text-red-200">
                  <AlertCircle className="w-5 h-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
                  <span>{formError}</span>
                </div>
              )}
              {success && (
                <div className="flex gap-3 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3.5 text-sm leading-relaxed text-emerald-800 dark:text-emerald-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  <span>{success}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TicketCategory)}
                  className="w-full rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#111113] text-gray-900 dark:text-gray-100 px-3.5 py-3 text-sm focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none transition-shadow"
                >
                  {(Object.keys(CATEGORY_LABEL) as TicketCategory[]).map((k) => (
                    <option key={k} value={k}>
                      {CATEGORY_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={300}
                  className="w-full rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#111113] px-3.5 py-3 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500/30 outline-none transition-shadow"
                  placeholder="Short summary of the problem"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Details</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                  maxLength={8000}
                  className="w-full rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#111113] px-3.5 py-3.5 text-sm leading-relaxed text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500/30 outline-none resize-y min-h-[140px]"
                  placeholder="What happened? What have you tried?"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3.5 px-4 text-sm transition-colors disabled:opacity-60 disabled:pointer-events-none shadow-md shadow-indigo-500/20"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Submit request
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Your requests</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
              Open a ticket to read what you sent and any reply from the team.
            </p>
          </div>

          {listError && (
            <div className="flex gap-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3.5 text-sm leading-relaxed text-amber-900 dark:text-amber-200">
              <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <span>{listError}</span>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-20 rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518]">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" aria-hidden />
            </div>
          ) : tickets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 dark:border-[#303038] bg-gray-50/60 dark:bg-white/[0.03] px-8 py-12 text-center">
              <Clock className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-4" aria-hidden />
              <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed max-w-sm mx-auto">
                No tickets yet. Submit a request on the left when you need help.
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {tickets.map((t) => {
                const st = STATUS_STYLE[t.status];
                const open = expandedId === t.id;
                return (
                  <li
                    key={t.id}
                    className="rounded-2xl border border-gray-200/90 dark:border-[#2e2e36] bg-white dark:bg-[#151518] shadow-sm dark:shadow-none overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(open ? null : t.id)}
                      className="w-full text-left px-5 py-4 sm:px-6 sm:py-5 flex items-start gap-4 hover:bg-gray-50/90 dark:hover:bg-white/[0.04] transition-colors"
                    >
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${st.className}`}>
                            {st.label}
                          </span>
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            {CATEGORY_LABEL[t.category]}
                          </span>
                        </div>
                        <p className="text-base font-medium text-gray-900 dark:text-gray-100 leading-snug">{t.subject}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {format(new Date(t.created_at), 'MMM d, yyyy · h:mm a')}
                        </p>
                      </div>
                      {open ? (
                        <ChevronUp className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" aria-hidden />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" aria-hidden />
                      )}
                    </button>

                    {open && (
                      <div className="border-t border-gray-100 dark:border-white/[0.08] bg-gray-50/40 dark:bg-black/25">
                        <div
                          className="max-h-[min(64vh,540px)] overflow-y-auto overscroll-contain scroll-smooth px-5 py-5 sm:px-6 sm:py-6"
                          role="region"
                          aria-label="Ticket conversation"
                        >
                          <div className="space-y-6">
                            <div>
                              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2.5">You sent</p>
                              <div className="rounded-2xl border border-gray-200/80 dark:border-white/10 bg-white dark:bg-[#1a1a20] px-4 py-4 sm:px-5 sm:py-4 shadow-sm dark:shadow-none">
                                <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                                  {t.body}
                                </p>
                              </div>
                            </div>
                            {(() => {
                              const thread = [...(t.support_ticket_replies || [])].sort(
                                (a, b) =>
                                  new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
                              );
                              if (thread.length > 0) {
                                return (
                                  <div className="space-y-5">
                                    {thread.map((r) => (
                                      <div key={r.id}>
                                        <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                                          <span className="inline-flex items-center gap-1.5">
                                            <CheckCircle2 className="w-4 h-4 shrink-0 opacity-90" aria-hidden />
                                            Reply from support
                                          </span>
                                          <span className="text-gray-500 dark:text-gray-400 font-normal">
                                            {format(new Date(r.created_at), 'MMM d, yyyy · h:mm a')}
                                          </span>
                                        </p>
                                        <div className="rounded-2xl border border-indigo-200/70 dark:border-indigo-500/35 bg-indigo-50/80 dark:bg-indigo-950/35 px-4 py-4 sm:px-5 sm:py-5 shadow-sm dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
                                          <p className="text-sm leading-relaxed text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
                                            {r.body}
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                );
                              }
                              if (t.admin_reply) {
                                return (
                                  <div>
                                    <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                                      <span className="inline-flex items-center gap-1.5">
                                        <CheckCircle2 className="w-4 h-4 shrink-0 opacity-90" aria-hidden />
                                        Reply from support
                                      </span>
                                      {t.replied_at && (
                                        <span className="text-gray-500 dark:text-gray-400 font-normal">
                                          {format(new Date(t.replied_at), 'MMM d, yyyy · h:mm a')}
                                        </span>
                                      )}
                                    </p>
                                    <div className="rounded-2xl border border-indigo-200/70 dark:border-indigo-500/35 bg-indigo-50/80 dark:bg-indigo-950/35 px-4 py-4 sm:px-5 sm:py-5 shadow-sm dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
                                      <p className="text-sm leading-relaxed text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
                                        {t.admin_reply}
                                      </p>
                                    </div>
                                  </div>
                                );
                              }
                              return (
                                <div className="rounded-xl border border-dashed border-gray-300/80 dark:border-white/15 bg-white/50 dark:bg-white/[0.03] px-4 py-4 text-center">
                                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                                    No reply yet — we will show the team&apos;s message here when it arrives.
                                  </p>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
