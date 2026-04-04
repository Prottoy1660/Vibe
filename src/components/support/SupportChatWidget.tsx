import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Send,
  Loader2,
  Ticket,
  ExternalLink,
  BotMessageSquare,
} from 'lucide-react';
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
      <motion.button
        type="button"
        layout
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        className={cn(
          'fixed z-[60] flex h-[3.75rem] w-[3.75rem] items-center justify-center rounded-full text-white shadow-xl',
          'bottom-20 right-4 md:bottom-8 md:right-6',
          'bg-gradient-to-br from-indigo-500 via-violet-600 to-fuchsia-600',
          'shadow-[0_12px_40px_-8px_rgba(99,102,241,0.55),0_4px_16px_-4px_rgba(168,85,247,0.35)]',
          'dark:shadow-[0_16px_48px_-8px_rgba(79,70,229,0.45),0_0_0_1px_rgba(255,255,255,0.08)_inset]',
          'ring-2 ring-white/25 dark:ring-white/12',
          open && 'ring-white/45',
        )}
        aria-label={open ? 'Close help chat' : 'Open help chat'}
      >
        {!open && (
          <>
            <motion.span
              className="pointer-events-none absolute inset-0 rounded-full bg-violet-400/30"
              animate={{ scale: [1, 1.45], opacity: [0.5, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
              aria-hidden
            />
            <motion.span
              className="pointer-events-none absolute inset-0 rounded-full border border-white/20"
              animate={{ scale: [1, 1.15], opacity: [0.6, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: 0.4 }}
              aria-hidden
            />
          </>
        )}
        <span className="relative flex items-center justify-center">
          {open ? (
            <X className="h-6 w-6 drop-shadow-sm" strokeWidth={2.25} />
          ) : (
            <motion.span
              className="relative flex items-center justify-center"
              animate={{ y: [0, -2, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              aria-hidden
            >
              <BotMessageSquare className="h-[1.85rem] w-[1.85rem] drop-shadow-md" strokeWidth={2.2} />
              <motion.span
                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white/40 bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]"
                aria-hidden
                animate={{ scale: [1, 1.15, 1], opacity: [1, 0.85, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              />
            </motion.span>
          )}
        </span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Help chat"
            initial={{ opacity: 0, y: 28, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            className={cn(
              'fixed z-[59] flex flex-col overflow-hidden rounded-[1.65rem]',
              'border border-indigo-100/80 bg-white/98 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-[#0c0c0e]',
              'shadow-[0_0_0_1px_rgba(139,92,246,0.12),0_28px_90px_-20px_rgba(79,70,229,0.45),0_12px_40px_-12px_rgba(0,0,0,0.5)]',
              'bottom-36 right-4 h-[min(560px,calc(100vh-8rem))] w-[min(100vw-2rem,400px)] md:bottom-24 md:right-6 md:h-[520px] md:w-[400px]',
            )}
          >
            <div className="relative shrink-0 overflow-hidden border-b border-white/[0.08] px-4 py-4 text-white">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600" />
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.06]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4V2H2v4h2v4H2v2h4v-2h2zm16 0v-2h4v-4h2v4h-2v2h-4zM6 4V0H4v4H0v2h6V4z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                }}
              />
              <motion.div
                className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-cyan-400/30 blur-3xl"
                animate={{ x: [0, 12, 0], y: [0, 16, 0], opacity: [0.45, 0.65, 0.45] }}
                transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className="pointer-events-none absolute -bottom-14 -left-6 h-40 w-40 rounded-full bg-fuchsia-500/35 blur-3xl"
                animate={{ x: [0, -10, 0], y: [0, -8, 0], opacity: [0.4, 0.6, 0.4] }}
                transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              />
              <div className="relative flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <motion.div
                    initial={{ rotate: -6, scale: 0.92 }}
                    animate={{ rotate: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 20 }}
                    className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] ring-1 ring-white/25 backdrop-blur-md"
                  >
                    <BotMessageSquare className="h-6 w-6 text-white" strokeWidth={2.2} />
                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white/50 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                  </motion.div>
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold leading-tight tracking-tight drop-shadow-sm">Vibe Access</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-snug text-white/88">
                      সাধারণ প্রশ্নের দ্রুত উত্তর — প্রয়োজনে টিকিট বা WhatsApp
                    </p>
                  </div>
                </div>
                <motion.button
                  type="button"
                  onClick={() => setOpen(false)}
                  whileHover={{ scale: 1.06, backgroundColor: 'rgba(255,255,255,0.18)' }}
                  whileTap={{ scale: 0.94 }}
                  className="shrink-0 rounded-xl p-2 text-white/95 transition-colors hover:bg-white/12"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </motion.button>
              </div>
              <div className="relative mt-3.5 flex flex-wrap gap-2">
                {waLink ? (
                  <motion.a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    whileHover={{ scale: 1.04, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-black/20 px-3 py-2 text-xs font-semibold shadow-lg shadow-black/10 ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-black/30"
                  >
                    <ExternalLink className="h-3.5 w-3.5 opacity-95" />
                    WhatsApp
                  </motion.a>
                ) : null}
                <motion.div whileHover={{ scale: 1.04, y: -1 }} whileTap={{ scale: 0.98 }}>
                  <Link
                    to="/support"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-black/20 px-3 py-2 text-xs font-semibold shadow-lg shadow-black/10 ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-black/30"
                    onClick={() => setOpen(false)}
                  >
                    <Ticket className="h-3.5 w-3.5 opacity-95" />
                    Support
                  </Link>
                </motion.div>
              </div>
            </div>

            <div
              ref={listRef}
              className="flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-indigo-50/20 via-white to-violet-50/20 px-3 py-3 dark:from-[#101012] dark:via-[#0e0e10] dark:to-[#0a0a0c]"
            >
              {panelBusy && (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-500 dark:text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                  সংযোগ হচ্ছে…
                </div>
              )}

              {messages.length === 0 && !loading && !panelBusy && (
                <motion.div
                  initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                  className="relative overflow-hidden rounded-2xl border border-indigo-200/40 bg-gradient-to-br from-indigo-50/95 via-white to-violet-50/50 px-3.5 py-3.5 text-xs leading-relaxed text-gray-600 shadow-sm dark:border-indigo-500/20 dark:from-indigo-950/50 dark:via-[#16151c] dark:to-violet-950/30 dark:text-gray-300"
                >
                  <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-indigo-400/15 blur-2xl dark:bg-indigo-500/10" />
                  <p className="relative">
                    নিচের একটি টপিক বেছে নিন, অথবা নিজের ভাষায় লিখুন। আমরা আপনার ভাষায় উত্তর দেওয়ার চেষ্টা করব।
                  </p>
                </motion.div>
              )}

              {messages.length === 0 &&
                !panelBusy &&
                SUGGESTED_PROMPTS.map((c, i) => (
                  <motion.button
                    key={c.label}
                    type="button"
                    disabled={loading || panelBusy}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05, type: 'spring', damping: 24, stiffness: 320 }}
                    whileHover={
                      loading || panelBusy
                        ? {}
                        : { scale: 1.015, x: 2, boxShadow: '0 12px 28px -8px rgba(99,102,241,0.25)' }
                    }
                    whileTap={{ scale: loading || panelBusy ? 1 : 0.99 }}
                    onClick={() => void handleSend(c.text)}
                    className="group relative block w-full overflow-hidden rounded-2xl border border-gray-200/80 bg-white/95 py-2.5 pl-4 pr-3 text-left text-xs text-gray-800 shadow-sm transition-colors before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-full before:bg-gradient-to-b before:from-indigo-500 before:to-violet-500 before:content-[''] hover:border-indigo-300/70 dark:border-[#2c2c34] dark:bg-[#18181d] dark:text-gray-200 dark:before:from-indigo-400 dark:before:to-fuchsia-500 dark:hover:border-indigo-500/40 disabled:opacity-50"
                  >
                    <span className="font-semibold text-indigo-700 transition-colors group-hover:text-indigo-800 dark:text-indigo-300 dark:group-hover:text-indigo-200">
                      {c.label}
                    </span>
                    <span className="mt-0.5 block line-clamp-2 text-[11px] text-gray-500 dark:text-gray-500">
                      {c.text}
                    </span>
                  </motion.button>
                ))}

              {messages.map((m, idx) => (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx * 0.02, 0.2) }}
                  className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[92%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                      m.role === 'user'
                        ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/25 [border-bottom-right-radius:6px]'
                        : 'border border-gray-100/90 bg-white text-gray-800 shadow-md dark:border-[#2a2a32] dark:bg-[#1e1e24] dark:text-gray-100 [border-bottom-left-radius:6px]',
                    )}
                  >
                    {m.content}
                  </div>
                </motion.div>
              ))}

              {loading && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex justify-start"
                >
                  <div className="flex items-center gap-2.5 rounded-2xl border border-indigo-100/80 bg-white px-4 py-3 shadow-md dark:border-[#2a2a32] dark:bg-[#1e1e24]">
                    <span className="flex gap-1">
                      {[0, 1, 2].map((d) => (
                        <motion.span
                          key={d}
                          className="h-2 w-2 rounded-full bg-indigo-400"
                          animate={{ y: [0, -5, 0], opacity: [0.5, 1, 0.5] }}
                          transition={{
                            duration: 0.7,
                            repeat: Infinity,
                            delay: d * 0.12,
                            ease: 'easeInOut',
                          }}
                        />
                      ))}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">লিখছি…</span>
                  </div>
                </motion.div>
              )}

              {ticketFlash && (
                <p className="px-1 text-center text-xs text-amber-700 dark:text-amber-300">{ticketFlash}</p>
              )}

              {pendingTicket && !loading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50/90 to-teal-50/50 p-3.5 dark:border-emerald-500/35 dark:from-emerald-950/40 dark:to-teal-950/20"
                >
                  <p className="mb-2 text-xs font-medium text-emerald-900 dark:text-emerald-200">
                    এই বিষয়ে টিমের কাছে টিকিট পাঠাবেন?
                  </p>
                  <button
                    type="button"
                    disabled={ticketSubmitting}
                    onClick={() => void openTicketFromAssistant()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-semibold text-white shadow-lg shadow-emerald-600/25 transition-colors hover:bg-emerald-500 disabled:opacity-60"
                  >
                    {ticketSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Ticket className="h-4 w-4" />
                    )}
                    টিকিট খুলুন
                  </button>
                  {!user && (
                    <p className="mt-2 text-center text-[11px] text-gray-600 dark:text-gray-400">
                      <Link to="/login" className="font-medium text-indigo-600 underline dark:text-indigo-400">
                        লগ ইন
                      </Link>{' '}
                      করতে হবে।
                    </p>
                  )}
                </motion.div>
              )}
            </div>

            <div className="shrink-0 border-t border-gray-100 bg-white p-3 backdrop-blur-xl dark:border-[#2a2a30] dark:bg-[#141416]">
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
                  className="min-h-[2.75rem] flex-1 rounded-2xl border border-gray-200/90 bg-gray-50/95 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-shadow focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-[#34343c] dark:bg-[#18181c] dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-indigo-500/55 disabled:opacity-60"
                />
                <motion.button
                  type="submit"
                  disabled={loading || panelBusy || !input.trim()}
                  whileHover={{ scale: loading || panelBusy || !input.trim() ? 1 : 1.06 }}
                  whileTap={{ scale: loading || panelBusy || !input.trim() ? 1 : 0.94 }}
                  className={cn(
                    'inline-flex h-11 min-w-[2.75rem] shrink-0 items-center justify-center rounded-2xl text-white shadow-lg transition-shadow',
                    'bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 shadow-indigo-500/35',
                    'disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none',
                  )}
                  aria-label="Send message"
                >
                  <Send className="h-5 w-5" strokeWidth={2.35} />
                </motion.button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
