import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, X, Send, Loader2, Ticket, ExternalLink, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getJsonWithFallback, postJsonWithFallback } from '../../lib/apiClient';
import { cn } from '../../lib/utils';

type ChatRole = 'user' | 'assistant';

type ChatMsg = {
  id: string;
  role: ChatRole;
  content: string;
};

type SupportMeta = {
  help_chat_enabled?: boolean;
  whatsapp_e164: string | null;
  ai_enabled: boolean;
};

type TicketCategory = 'general' | 'billing' | 'adobe_access' | 'account' | 'other';

type PendingTicket = {
  subject: string;
  body: string;
  category: TicketCategory;
};

type ReplyPayload = {
  success?: boolean;
  message?: string;
  suggest_ticket?: boolean;
  ticket_subject?: string | null;
  ticket_body?: string | null;
  ticket_category?: TicketCategory | null;
  error?: string;
  whatsapp_e164?: string | null;
};

const SUGGESTED_PROMPTS: { label: string; text: string }[] = [
  { label: 'পেমেন্ট ও অর্ডার · Payment', text: 'আমার পেমেন্ট বা অর্ডার নিয়ে সাহায্য চাই।' },
  { label: 'Adobe ইমেইল / অ্যাক্সেস', text: 'Adobe ইমেইল বা লগইনে সমস্যা হচ্ছে, কী করব?' },
  { label: 'Wallet ও রিচার্জ', text: 'ওয়ালেট বা রিচার্জ সম্পর্কে জানতে চাই।' },
  { label: 'রেফারেল প্রোগ্রাম', text: 'রেফারেল বোনাস কীভাবে কাজ করে?' },
  { label: 'অ্যাকাউন্ট / লগইন', text: 'অ্যাকাউন্ট বা লগইনে সমস্যা।' },
  { label: 'মানুষের সাথে কথা · Human', text: 'আমি একজন মানুষের সাথে কথা বলতে চাই বা টিকিট খুলতে চাই।' },
];

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function SupportChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState<SupportMeta | null>(null);
  const [metaChecked, setMetaChecked] = useState(false);
  const [panelRefreshing, setPanelRefreshing] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [ticketFlash, setTicketFlash] = useState<string | null>(null);
  const [pendingTicket, setPendingTicket] = useState<PendingTicket | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : newId(),
  );

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await getJsonWithFallback<SupportMeta>('/api/support-chat/meta');
        if (!cancelled) setMeta(m);
      } catch {
        if (!cancelled) setMeta({ help_chat_enabled: true, whatsapp_e164: null, ai_enabled: false });
      } finally {
        if (!cancelled) setMetaChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPanelRefreshing(true);
    (async () => {
      try {
        const m = await getJsonWithFallback<SupportMeta>('/api/support-chat/meta');
        if (!cancelled) setMeta(m);
      } catch {
        /* keep previous meta */
      } finally {
        if (!cancelled) setPanelRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, open]);

  const sendTurns = useCallback(async (nextMessages: ChatMsg[]) => {
    const turns = nextMessages.map((m) => ({ role: m.role, content: m.content }));
    setLoading(true);
    setTicketFlash(null);
    try {
      const data = await postJsonWithFallback<ReplyPayload>('/api/support-chat/reply', {
        messages: turns,
        session_id: sessionIdRef.current,
      });
      const errCode = (data as any).error;
      if (
        data.success === false ||
        errCode === 'ai_disabled' ||
        errCode === 'help_chat_disabled' ||
        errCode === 'ai_quota'
      ) {
        const fallback =
          typeof data.message === 'string'
            ? data.message
            : 'এই মুহূর্তে চ্যাট অ্যাসিস্ট্যান্ট চালু নেই। সাপোর্ট পেজ থেকে টিকিট খুলুন বা WhatsApp ব্যবহার করুন।';
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: 'assistant', content: fallback },
        ]);
        setPendingTicket(null);
        return;
      }
      const text = (data.message || '').trim() || '…';
      setMessages((prev) => [...prev, { id: newId(), role: 'assistant', content: text }]);

      if (
        data.suggest_ticket &&
        data.ticket_subject &&
        data.ticket_body &&
        ['general', 'billing', 'adobe_access', 'account', 'other'].includes(String(data.ticket_category || 'general'))
      ) {
        setPendingTicket({
          subject: data.ticket_subject.slice(0, 300),
          body: data.ticket_body.slice(0, 8000),
          category: (data.ticket_category as TicketCategory) || 'general',
        });
      } else {
        setPendingTicket(null);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong.';
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: 'assistant',
          content: `দুঃখিত, এখন উত্তর দিতে পারছি না। আবার চেষ্টা করুন, অথবা Support পেজে টিকিট খুলুন।\n\n(${msg})`,
        },
      ]);
      setPendingTicket(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSend = async (raw?: string) => {
    const t = (raw ?? input).trim();
    if (!t || loading || (open && panelRefreshing)) return;
    setInput('');
    const userMsg: ChatMsg = { id: newId(), role: 'user', content: t };
    const next = [...messages, userMsg];
    setMessages(next);

    if (!meta?.ai_enabled) {
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: 'assistant',
          content:
            'এই মুহূর্তে AI সহায়ক চালু নেই। দয়া করে নিচের বাটন থেকে WhatsApp বা Support টিকিট ব্যবহার করুন — আমরা খুব শীঘ্রই সাহায্য করব।',
        },
      ]);
      return;
    }

    await sendTurns(next);
  };

  if (!metaChecked) {
    return null;
  }
  if (meta?.help_chat_enabled === false) {
    return null;
  }

  const panelBusy = open && panelRefreshing;

  const openTicketFromAssistant = async () => {
    if (!pendingTicket || ticketSubmitting) return;
    if (!user) {
      setTicketFlash('টিকিট খুলতে লগ ইন করুন — তারপর আবার চেষ্টা করুন।');
      return;
    }
    setTicketSubmitting(true);
    setTicketFlash(null);
    try {
      const res = await postJsonWithFallback<{ success?: boolean; ticket_id?: string; message?: string }>(
        '/api/support-chat/ticket',
        {
          subject: pendingTicket.subject,
          body: pendingTicket.body,
          category: pendingTicket.category,
        },
      );
      if (res.success) {
        setTicketFlash('টিকিট সফলভাবে খোলা হয়েছে। Support পেজ থেকে স্ট্যাটাস দেখুন।');
        setPendingTicket(null);
      } else {
        setTicketFlash(res.message || 'টিকিট খুলতে ব্যর্থ।');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'টিকিট খুলতে ব্যর্থ।';
      setTicketFlash(msg);
    } finally {
      setTicketSubmitting(false);
    }
  };

  const waLink = meta?.whatsapp_e164 ? `https://wa.me/${meta.whatsapp_e164}` : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'fixed z-[60] flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-300',
          'bg-gradient-to-br from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500',
          'bottom-20 right-4 md:bottom-8 md:right-6',
          'ring-2 ring-white/20 dark:ring-white/10',
          open && 'scale-95 opacity-90',
        )}
        aria-label={open ? 'Close help chat' : 'Open help chat'}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-7 w-7" />}
      </button>

      {open && (
        <div
          className={cn(
            'fixed z-[59] flex flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl dark:border-[#2a2a32] dark:bg-[#121214]',
            'bottom-36 right-4 h-[min(560px,calc(100vh-8rem))] w-[min(100vw-2rem,400px)] md:bottom-24 md:right-6 md:h-[520px] md:w-[400px]',
          )}
          role="dialog"
          aria-label="Help chat"
        >
          <div className="relative shrink-0 border-b border-gray-100 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 px-4 py-3.5 text-white">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm leading-tight">Vibe সহায়তা</p>
                  <p className="text-xs text-white/85 mt-0.5 line-clamp-2">
                    সাধারণ প্রশ্নের দ্রুত উত্তর — প্রয়োজনে টিকিট বা WhatsApp
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 hover:bg-white/10 transition-colors shrink-0"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {waLink ? (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 px-2.5 py-1.5 text-xs font-medium backdrop-blur transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  WhatsApp
                </a>
              ) : null}
              <Link
                to="/support"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 px-2.5 py-1.5 text-xs font-medium backdrop-blur transition-colors"
                onClick={() => setOpen(false)}
              >
                <Ticket className="h-3.5 w-3.5" />
                Support
              </Link>
            </div>
          </div>

          <div
            ref={listRef}
            className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-gradient-to-b from-gray-50/80 to-white dark:from-[#161618] dark:to-[#121214]"
          >
            {panelBusy && (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                সংযোগ হচ্ছে…
              </div>
            )}

            {messages.length === 0 && !loading && !panelBusy && (
              <div className="rounded-xl border border-indigo-100/80 dark:border-indigo-500/20 bg-indigo-50/40 dark:bg-indigo-950/20 px-3 py-2.5 text-xs text-gray-600 dark:text-gray-400">
                নিচের একটি টপিক বেছে নিন, অথবা নিজের ভাষায় লিখুন। আমরা আপনার ভাষায় উত্তর দেওয়ার চেষ্টা করব।
              </div>
            )}

            {messages.length === 0 &&
              !panelBusy &&
              SUGGESTED_PROMPTS.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  disabled={loading || panelBusy}
                onClick={() => void handleSend(c.text)}
                  className="block w-full text-left rounded-xl border border-gray-200 dark:border-[#2e2e36] bg-white dark:bg-[#1a1a1f] px-3 py-2.5 text-xs text-gray-800 dark:text-gray-200 hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-colors disabled:opacity-50"
                >
                  <span className="font-medium text-indigo-700 dark:text-indigo-300">{c.label}</span>
                  <span className="block text-[11px] text-gray-500 dark:text-gray-500 mt-0.5 line-clamp-2">{c.text}</span>
                </button>
              ))}

            {messages.map((m) => (
              <div
                key={m.id}
                className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                    m.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-md shadow-md shadow-indigo-600/20'
                      : 'bg-white dark:bg-[#1e1e24] text-gray-800 dark:text-gray-100 border border-gray-100 dark:border-[#2a2a32] rounded-bl-md shadow-sm',
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-gray-100 dark:border-[#2a2a32] bg-white dark:bg-[#1e1e24] px-4 py-3 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                  <span className="text-xs">লিখছি…</span>
                </div>
              </div>
            )}

            {ticketFlash && (
              <p className="text-xs text-center text-amber-700 dark:text-amber-300 px-1">{ticketFlash}</p>
            )}

            {pendingTicket && !loading && (
              <div className="rounded-xl border border-emerald-200/80 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-950/25 p-3">
                <p className="text-xs font-medium text-emerald-900 dark:text-emerald-200 mb-2">
                  এই বিষয়ে টিমের কাছে টিকিট পাঠাবেন?
                </p>
                <button
                  type="button"
                  disabled={ticketSubmitting}
                  onClick={() => void openTicketFromAssistant()}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-2.5 px-3 transition-colors disabled:opacity-60"
                >
                  {ticketSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
                  টিকিট খুলুন
                </button>
                {!user && (
                  <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-2 text-center">
                    <Link to="/login" className="underline font-medium text-indigo-600 dark:text-indigo-400">
                      লগ ইন
                    </Link>{' '}
                    করতে হবে।
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-gray-100 dark:border-[#26262d] p-3 bg-white dark:bg-[#121214]">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="আপনার প্রশ্ন লিখুন…"
                maxLength={2000}
                disabled={loading || panelBusy}
                className="flex-1 rounded-xl border border-gray-200 dark:border-[#2e2e36] bg-gray-50 dark:bg-[#1a1a1f] px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={loading || panelBusy || !input.trim()}
                className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
