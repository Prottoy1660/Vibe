import React, { useState } from 'react';
import { Loader2, Megaphone, Send, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { getApiBaseUrl } from '../../lib/apiBase';

function apiUrl(path: string) {
  const b = getApiBaseUrl().replace(/\/$/, '');
  return b ? `${b}${path}` : path;
}

async function adminFetch(path: string, method: string = 'GET', body?: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(apiUrl(path), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body && method !== 'GET' ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || json?.message || 'Request failed');
  return json;
}

type InboxWithUser = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
  recipient: { email: string; name: string } | null;
};

export const AdminUserNotifications: React.FC = () => {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [recipientsRaw, setRecipientsRaw] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const parseEmails = (raw: string) => {
    const parts = raw
      .split(/[\n,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return [...new Set(parts)];
  };

  const send = async () => {
    setFeedback(null);
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) {
      setFeedback({ type: 'err', text: 'Title and message are required.' });
      return;
    }
    const emails = parseEmails(recipientsRaw);
    if (emails.length === 0) {
      setFeedback({ type: 'err', text: 'Add at least one recipient email (one per line).' });
      return;
    }

    setSending(true);
    try {
      const list: { id: string; email: string }[] = [];
      const seen = new Set<string>();
      const missing: string[] = [];

      for (const email of emails) {
        const { data, error: oneErr } = await supabase.from('users').select('id, email').ilike('email', email).maybeSingle();
        if (oneErr) throw oneErr;
        if (data) {
          if (!seen.has(data.id)) {
            seen.add(data.id);
            list.push(data);
          }
        } else {
          missing.push(email);
        }
      }

      if (list.length === 0) {
        setFeedback({
          type: 'err',
          text: `No matching accounts for: ${emails.slice(0, 5).join(', ')}${emails.length > 5 ? '…' : ''}`,
        });
        return;
      }

      const adminId = user?.id;
      const inserts = list.map((r) => ({
        user_id: r.id,
        title: t,
        body: b,
        created_by: adminId ?? null,
      }));

      const { error: insErr } = await supabase.from('user_inbox').insert(inserts);
      if (insErr) throw insErr;

      // Best-effort: also push to browser notifications (only reaches devices that enabled it).
      let pushSent = 0;
      for (const r of list) {
        try {
          const out = await adminFetch('/api/push/admin/send', 'POST', {
            user_id: r.id,
            title: t,
            body: b,
            url: '/app',
          });
          if (out?.sent) pushSent += Number(out.sent) || 0;
        } catch {
          // ignore push failures; inbox delivery already succeeded
        }
      }

      const missingUnique = [...new Set(missing)];
      const okMsg =
        `Delivered to ${list.length} account${list.length !== 1 ? 's' : ''}.` +
        (pushSent ? ` Push sent: ${pushSent}.` : '') +
        (missingUnique.length ? ` Not found: ${missingUnique.join(', ')}` : '');
      setFeedback({ type: 'ok', text: okMsg });
      setTitle('');
      setBody('');
      setRecipientsRaw('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to send notifications.';
      setFeedback({ type: 'err', text: msg });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-soft dark:border-[#26262d] dark:bg-[#151518] dark:shadow-none">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary dark:text-violet-400">
            <Megaphone className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Notify users</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Send a personal message to selected customers. It appears in the bell next to the theme toggle (not on admin
              pages). Use for billing, access, or urgent account updates.
            </p>
            <p className="mt-2 text-sm">
              <Link to="/admin?tab=user_inbox_history" className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                Open delivery history →
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Recipients (account email, one per line)
            </label>
            <textarea
              value={recipientsRaw}
              onChange={(e) => setRecipientsRaw(e.target.value)}
              rows={5}
              placeholder={'user@example.com\nother@example.com'}
              className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-[#26262d] dark:bg-[#0f0f12] dark:text-gray-100"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Short subject"
              className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-[#26262d] dark:bg-[#0f0f12] dark:text-gray-100"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Message
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              maxLength={8000}
              placeholder="Important details for the customer…"
              className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-[#26262d] dark:bg-[#0f0f12] dark:text-gray-100"
            />
            <p className="mt-1 text-xs text-gray-400">{body.length} / 8000</p>
          </div>
        </div>

        {feedback && (
          <div
            className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${
              feedback.type === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100'
                : 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-100'
            }`}
          >
            {feedback.type === 'ok' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => void send()}
          disabled={sending}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-primary/25 transition hover:bg-primary/90 disabled:opacity-60 dark:bg-violet-600 dark:hover:bg-violet-500"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send notifications
        </button>
      </div>
    </div>
  );
};
