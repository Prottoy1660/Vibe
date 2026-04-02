import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Info, AlertTriangle, AlertCircle, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface NoticeRow {
  id: string;
  title: string;
  content: string;
  type: string;
  created_at: string;
}

const DISMISS_PREFIX = 'notice_banner_dismissed_';

function typeStyles(type: string) {
  switch (type) {
    case 'warning':
      return {
        wrap: 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100',
        Icon: AlertTriangle,
      };
    case 'error':
      return {
        wrap: 'border-red-200 bg-red-50 text-red-950 dark:border-red-900/40 dark:bg-red-950/35 dark:text-red-100',
        Icon: AlertCircle,
      };
    default:
      return {
        wrap: 'border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-100',
        Icon: Info,
      };
  }
}

/**
 * Active notices from Admin → Important Notices, shown globally below the top bar for signed-in users.
 */
export const ImportantNoticesBanner: React.FC = () => {
  const [notices, setNotices] = useState<NoticeRow[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const refreshDismissed = useCallback(() => {
    const s = new Set<string>();
    if (typeof sessionStorage === 'undefined') return s;
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(DISMISS_PREFIX) && sessionStorage.getItem(k) === '1') {
        s.add(k.slice(DISMISS_PREFIX.length));
      }
    }
    return s;
  }, []);

  useEffect(() => {
    setDismissed(refreshDismissed());
  }, [refreshDismissed]);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('notices')
          .select('id, title, content, type, created_at')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(8);

        if (error) return;
        setNotices((data as NoticeRow[]) || []);
      } catch {
        /* ignore */
      }
    };
    load();
  }, []);

  const visible = notices.filter((n) => !dismissed.has(n.id));
  if (visible.length === 0) return null;

  return (
    <div className="border-b border-gray-200/80 dark:border-white/10 bg-white dark:bg-[#0f0f10]">
      <div className="max-w-6xl mx-auto px-4 py-2 space-y-2">
        {visible.map((n) => {
          const { wrap, Icon } = typeStyles(n.type);
          return (
            <div key={n.id} className={`relative rounded-xl border px-3 py-2.5 pr-10 text-sm ${wrap}`}>
              <div className="flex items-start gap-2">
                <Icon className="w-4 h-4 shrink-0 mt-0.5 opacity-90" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug">{n.title}</p>
                  <p className="mt-0.5 text-[13px] leading-snug opacity-95 whitespace-pre-wrap">{n.content}</p>
                  <p className="mt-1.5">
                    <Link to="/" className="text-xs font-medium underline underline-offset-2 opacity-90 hover:opacity-100">
                      View dashboard
                    </Link>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  sessionStorage.setItem(`${DISMISS_PREFIX}${n.id}`, '1');
                  setDismissed((prev) => new Set(prev).add(n.id));
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                aria-label="Dismiss notice"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
