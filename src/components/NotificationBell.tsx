import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, CheckCheck, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '../lib/supabase';

export type UserInboxRow = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

type Props = {
  userId: string;
  /** When false, bell is hidden (e.g. admin routes). */
  enabled: boolean;
};

export const NotificationBell: React.FC<Props> = ({ userId, enabled }) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UserInboxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!enabled || !userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_inbox')
        .select('id, user_id, title, body, read_at, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(40);

      if (error) throw error;
      setItems((data as UserInboxRow[]) || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, userId]);

  /** Avoid effect deps on `load` (unstable ref) + unique channel name so Strict Mode / resubscribe never reuses a subscribed channel. */
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!enabled || !userId) return;

    const channelName = `user_inbox_rt:${userId}:${crypto.randomUUID()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_inbox',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadRef.current();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const unread = items.filter((i) => !i.read_at).length;

  const markRead = async (id: string) => {
    setMarkingId(id);
    try {
      const { error } = await supabase.from('user_inbox').update({ read_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId);
      if (error) throw error;
      setItems((prev) => prev.map((r) => (r.id === id ? { ...r, read_at: new Date().toISOString() } : r)));
    } catch {
      /* ignore */
    } finally {
      setMarkingId(null);
    }
  };

  const markAllRead = async () => {
    if (unread === 0) return;
    setMarkingAll(true);
    try {
      const { error } = await supabase
        .from('user_inbox')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('read_at', null);
      if (error) throw error;
      const now = new Date().toISOString();
      setItems((prev) => prev.map((r) => (r.read_at ? r : { ...r, read_at: now })));
    } catch {
      /* ignore */
    } finally {
      setMarkingAll(false);
    }
  };

  if (!enabled || !userId) return null;

  const panel = open ? (
    <div
      ref={panelRef}
      className="fixed z-[100] w-[min(calc(100vw-1.5rem),22rem)] rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-[#26262d] dark:bg-[#151518] md:absolute md:right-0 md:top-full md:mt-2 md:w-96"
      style={
        typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
          ? {
              left: 'max(0.75rem, calc(50% - min(calc(100vw - 1.5rem), 22rem) / 2))',
              top: '4.5rem',
            }
          : undefined
      }
      role="dialog"
      aria-label="Notifications"
    >
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3 dark:border-[#26262d]">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Notifications</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {unread > 0 ? `${unread} unread` : loading ? 'Loading…' : 'All caught up'}
          </p>
        </div>
        {unread > 0 && (
          <button
            type="button"
            onClick={() => void markAllRead()}
            disabled={markingAll}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 dark:text-violet-400 dark:hover:bg-primary/15 disabled:opacity-50"
          >
            {markingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
            Mark all read
          </button>
        )}
      </div>

      <div className="max-h-[min(70vh,24rem)] overflow-y-auto">
        {loading && items.length === 0 ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-7 w-7 animate-spin text-primary/60" />
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">No messages yet.</div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-[#26262d]">
            {items.map((row) => {
              const isUnread = !row.read_at;
              return (
                <li key={row.id}>
                  <div
                    className={
                      'px-4 py-3 transition-colors ' +
                      (isUnread ? 'bg-primary/[0.04] dark:bg-primary/10' : 'hover:bg-gray-50 dark:hover:bg-white/[0.03]')
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{row.title}</p>
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-gray-600 dark:text-gray-400">{row.body}</p>
                        <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
                          {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      {isUnread && (
                        <button
                          type="button"
                          title="Mark as read"
                          onClick={() => void markRead(row.id)}
                          disabled={markingId === row.id}
                          className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-200/80 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
                        >
                          {markingId === row.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 text-gray-400 transition-colors hover:text-primary dark:text-gray-500 dark:hover:text-violet-400"
        title="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white dark:bg-violet-500">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {typeof document !== 'undefined' && open && window.matchMedia('(max-width: 767px)').matches
        ? createPortal(panel, document.body)
        : panel}
    </div>
  );
};
