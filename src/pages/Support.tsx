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

interface SupportTicket {
  id: string;
  subject: string;
  body: string;
  category: TicketCategory;
  status: TicketStatus;
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
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
        .select('id, subject, body, category, status, admin_reply, replied_at, created_at')
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
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
              Describe your issue below. Our team will review it and reply here when there is an update.
            </p>
            <p className="text-sm text-indigo-800/90 dark:text-indigo-200/90 mt-3 max-w-2xl">
              Quick answers first? Use the <span className="font-semibold">Help</span> chat bubble (bottom-right) — the
              assistant can guide you; open a ticket here or use WhatsApp from the chat when you need a person.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] shadow-sm dark:shadow-none p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-indigo-500" />
              New request
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-5">
              Include steps to reproduce, order ID if relevant, and what you expected to happen.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="flex gap-2 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2.5 text-sm text-red-800 dark:text-red-200">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {formError}
                </div>
              )}
              {success && (
                <div className="flex gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2.5 text-sm text-emerald-800 dark:text-emerald-200">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  {success}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TicketCategory)}
                  className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-900 dark:text-gray-100 px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none"
                >
                  {(Object.keys(CATEGORY_LABEL) as TicketCategory[]).map((k) => (
                    <option key={k} value={k}>
                      {CATEGORY_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={300}
                  className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500/30 outline-none"
                  placeholder="Short summary of the problem"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Details</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                  maxLength={8000}
                  className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500/30 outline-none resize-y min-h-[120px]"
                  placeholder="What happened? What have you tried?"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-4 text-sm transition-colors disabled:opacity-60 disabled:pointer-events-none shadow-md shadow-indigo-500/20"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Submit request
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Your requests</h2>

          {listError && (
            <div className="flex gap-2 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {listError}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-16 rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518]">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 dark:border-[#26262d] bg-gray-50/50 dark:bg-white/[0.02] p-10 text-center">
              <Clock className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-600 dark:text-gray-400 text-sm">No tickets yet. Submit a request when you need help.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {tickets.map((t) => {
                const st = STATUS_STYLE[t.status];
                const open = expandedId === t.id;
                return (
                  <li
                    key={t.id}
                    className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] shadow-sm dark:shadow-none overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(open ? null : t.id)}
                      className="w-full text-left px-4 py-4 flex items-start gap-3 hover:bg-gray-50/80 dark:hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${st.className}`}>
                            {st.label}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {CATEGORY_LABEL[t.category]}
                          </span>
                        </div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{t.subject}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {format(new Date(t.created_at), 'MMM d, yyyy · h:mm a')}
                        </p>
                      </div>
                      {open ? (
                        <ChevronUp className="w-5 h-5 text-gray-400 shrink-0" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />
                      )}
                    </button>

                    {open && (
                      <div className="px-4 pb-4 pt-0 border-t border-gray-100 dark:border-white/5 space-y-4">
                        <div>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                            Your message
                          </p>
                          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{t.body}</p>
                        </div>
                        {t.admin_reply ? (
                          <div className="rounded-xl border border-indigo-200/60 dark:border-indigo-500/30 bg-indigo-50/50 dark:bg-indigo-950/25 px-4 py-3">
                            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-1 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Team reply
                              {t.replied_at && (
                                <span className="font-normal text-indigo-600/80 dark:text-indigo-400/80">
                                  · {format(new Date(t.replied_at), 'MMM d, yyyy')}
                                </span>
                              )}
                            </p>
                            <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{t.admin_reply}</p>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500 dark:text-gray-400 italic">No reply yet — we will notify you here.</p>
                        )}
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
