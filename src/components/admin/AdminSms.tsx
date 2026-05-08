import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, MessageSquareText, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { postJsonWithFallback } from '../../lib/apiClient';
import { Link } from 'react-router-dom';
import { parseDurationToMonths } from '../../lib/durationUtils';

type SmsUser = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
};

type SmsOrder = {
  user_id: string | null;
  created_at: string;
  products: { duration: string | null } | { duration: string | null }[] | null;
};

type SendSmsResponse = {
  success?: boolean;
  error?: string;
  upstream?: {
    error?: number;
    msg?: string;
    data?: {
      request_id?: number;
    };
  };
  sent_count?: number;
  request_id?: number | null;
};

type RecipientMode = 'selected_users' | 'all_users' | 'custom_numbers';
type UserSegment = 'all_accounts' | 'active_subscribers' | 'near_expiry_subscribers' | 'expired_subscribers' | 'new_users';

function normalizeBdPhoneLocal(raw: string): string | null {
  const cleaned = String(raw || '').replace(/\D/g, '').trim();
  if (!cleaned) return null;
  if (/^8801\d{9}$/.test(cleaned)) return cleaned;
  if (/^01\d{9}$/.test(cleaned)) return `88${cleaned}`;
  if (/^1\d{9}$/.test(cleaned)) return `880${cleaned}`;
  return null;
}

function parseCustomNumbers(raw: string): {
  entriesCount: number;
  invalidCount: number;
  duplicateCount: number;
  validNumbers: string[];
} {
  const tokens = raw
    .split(/[\n,;]+/)
    .map((v) => v.trim())
    .filter(Boolean);

  const normalized = tokens.map((v) => normalizeBdPhoneLocal(v)).filter(Boolean) as string[];
  const uniqueValid = [...new Set(normalized)];
  return {
    entriesCount: tokens.length,
    invalidCount: tokens.filter((v) => !normalizeBdPhoneLocal(v)).length,
    duplicateCount: Math.max(0, normalized.length - uniqueValid.length),
    validNumbers: uniqueValid,
  };
}

export const AdminSms: React.FC = () => {
  const [mode, setMode] = useState<RecipientMode>('selected_users');
  const [users, setUsers] = useState<SmsUser[]>([]);
  const [orders, setOrders] = useState<SmsOrder[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingSegments, setLoadingSegments] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [customNumbers, setCustomNumbers] = useState('');
  const [userSegment, setUserSegment] = useState<UserSegment>('all_accounts');
  const [newUserDays, setNewUserDays] = useState(7);
  const [senderId, setSenderId] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadUsers = async () => {
    if (users.length > 0 || loadingUsers) return;
    setLoadingUsers(true);
    try {
      const pageSize = 1000;
      const rows: SmsUser[] = [];
      let from = 0;

      while (true) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
          .from('users')
          .select('id, name, phone, email, created_at')
          .order('created_at', { ascending: false })
          .range(from, to);
        if (error) throw error;

        const chunk = (data || []) as SmsUser[];
        rows.push(...chunk);
        if (chunk.length < pageSize || rows.length >= 10000) break;
        from += pageSize;
      }

      setUsers(rows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load users';
      setFeedback({ type: 'err', text: msg });
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadSegmentOrders = async () => {
    if (loadingSegments || orders.length > 0 || userSegment === 'all_accounts') return;
    setLoadingSegments(true);
    try {
      const pageSize = 1000;
      const rows: SmsOrder[] = [];
      let from = 0;

      while (true) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
          .from('orders')
          .select('user_id, created_at, products:product_id(duration)')
          .in('status', ['paid', 'completed'])
          .order('created_at', { ascending: false })
          .range(from, to);
        if (error) throw error;

        const chunk = (data || []) as SmsOrder[];
        rows.push(...chunk);
        if (chunk.length < pageSize || rows.length >= 30000) break;
        from += pageSize;
      }

      setOrders(rows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load subscription segments';
      setFeedback({ type: 'err', text: msg });
    } finally {
      setLoadingSegments(false);
    }
  };

  useEffect(() => {
    if (mode === 'all_users' && userSegment !== 'all_accounts') {
      void loadSegmentOrders();
    }
  }, [mode, userSegment]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = (u.name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const phone = (u.phone || '').toLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q);
    });
  }, [users, query]);

  const selectedUsersWithPhone = useMemo(() => {
    return users.filter((u) => selectedUserIds.has(u.id) && u.phone && u.phone.trim());
  }, [users, selectedUserIds]);

  const allUsersWithPhone = useMemo(() => {
    return users.filter((u) => u.phone && u.phone.trim());
  }, [users]);

  const segmentStats = useMemo(() => {
    const now = Date.now();
    const hasSubscription = new Set<string>();
    const activeSubscription = new Set<string>();
    const nearExpirySubscription = new Set<string>();

    for (const order of orders) {
      if (!order.user_id) continue;
      hasSubscription.add(order.user_id);

      const product = Array.isArray(order.products) ? order.products[0] : order.products;
      const months = parseDurationToMonths(product?.duration || '1 Month');
      const startAt = new Date(order.created_at);
      if (Number.isNaN(startAt.getTime())) continue;
      const expiresAt = new Date(startAt);
      expiresAt.setMonth(expiresAt.getMonth() + months);
      const expiresMs = expiresAt.getTime();
      if (expiresMs >= now) {
        activeSubscription.add(order.user_id);
        const daysLeft = Math.ceil((expiresMs - now) / (24 * 60 * 60 * 1000));
        if (daysLeft >= 0 && daysLeft <= 3) nearExpirySubscription.add(order.user_id);
      }
    }

    return { hasSubscription, activeSubscription, nearExpirySubscription };
  }, [orders]);

  const segmentedUsersWithPhone = useMemo(() => {
    const now = Date.now();
    const windowDays = Math.max(1, Math.min(365, Number(newUserDays) || 7));
    const nowMinusWindow = now - windowDays * 24 * 60 * 60 * 1000;

    return allUsersWithPhone.filter((u) => {
      if (userSegment === 'all_accounts') return true;

      const hasSub = segmentStats.hasSubscription.has(u.id);
      const isActive = segmentStats.activeSubscription.has(u.id);
      const isNearExpiry = segmentStats.nearExpirySubscription.has(u.id);

      if (userSegment === 'active_subscribers') return isActive;
      if (userSegment === 'near_expiry_subscribers') return isNearExpiry;
      if (userSegment === 'expired_subscribers') return hasSub && !isActive;
      if (userSegment === 'new_users') {
        const createdAt = new Date(u.created_at).getTime();
        return !hasSub && !Number.isNaN(createdAt) && createdAt >= nowMinusWindow;
      }
      return false;
    });
  }, [
    allUsersWithPhone,
    newUserDays,
    segmentStats.activeSubscription,
    segmentStats.hasSubscription,
    segmentStats.nearExpirySubscription,
    userSegment,
  ]);

  const customParseResult = useMemo(() => parseCustomNumbers(customNumbers), [customNumbers]);

  const recipientCount = useMemo(() => {
    if (mode === 'selected_users') return selectedUsersWithPhone.length;
    if (mode === 'all_users') return segmentedUsersWithPhone.length;
    return customParseResult.validNumbers.length;
  }, [mode, selectedUsersWithPhone.length, segmentedUsersWithPhone.length, customParseResult.validNumbers.length]);

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      for (const u of filteredUsers) {
        if (u.phone && u.phone.trim()) next.add(u.id);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedUserIds(new Set());

  const handleSend = async () => {
    setFeedback(null);
    const text = message.trim();
    if (!text) {
      setFeedback({ type: 'err', text: 'SMS message is required.' });
      return;
    }

    let recipients: string[] = [];
    if (mode === 'selected_users') {
      recipients = selectedUsersWithPhone.map((u) => String(u.phone || '').trim());
      if (!recipients.length) {
        setFeedback({ type: 'err', text: 'Select at least one user with a phone number.' });
        return;
      }
    } else if (mode === 'all_users') {
      recipients = segmentedUsersWithPhone.map((u) => String(u.phone || '').trim());
      if (!recipients.length) {
        setFeedback({ type: 'err', text: 'No users found in this segment with a phone number.' });
        return;
      }
    } else {
      recipients = customParseResult.validNumbers;
      if (!recipients.length) {
        setFeedback({ type: 'err', text: 'Enter at least one valid number (e.g. +8801XXXXXXXXX / 8801XXXXXXXXX / 01XXXXXXXXX).' });
        return;
      }
    }

    setSending(true);
    try {
      const payload: Record<string, unknown> = {
        msg: text,
        to: recipients,
        recipient_mode: mode,
      };
      if (senderId.trim()) payload.sender_id = senderId.trim();
      if (scheduleAt.trim()) payload.schedule = new Date(scheduleAt).toISOString();

      const out = await postJsonWithFallback<SendSmsResponse>('/api/admin/sms/send', payload, {
        skipErrorPageRedirect: true,
      });

      const statusMsg = out?.upstream?.msg || 'SMS request submitted.';
      const requestIdText = out?.request_id ? ` Request ID: ${out.request_id}.` : '';
      setFeedback({
        type: 'ok',
        text: `Submitted to ${out?.sent_count || recipients.length} number(s). ${statusMsg}${requestIdText}`,
      });
      setMessage('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send SMS';
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
            <MessageSquareText className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Bulk SMS sender</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Send SMS to selected users, segmented users, or custom numbers from one place.
            </p>
            <p className="mt-2 text-sm">
              <Link to="/admin?tab=sms_history" className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                Open SMS history →
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Recipient mode
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode('selected_users');
                  void loadUsers();
                }}
                className={`rounded-xl px-3 py-2 text-sm font-medium ${
                  mode === 'selected_users'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 dark:bg-[#202027] dark:text-gray-200'
                }`}
              >
                Selected users
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('all_users');
                  void loadUsers();
                  if (userSegment !== 'all_accounts') void loadSegmentOrders();
                }}
                className={`rounded-xl px-3 py-2 text-sm font-medium ${
                  mode === 'all_users'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 dark:bg-[#202027] dark:text-gray-200'
                }`}
              >
                Segment users
              </button>
              <button
                type="button"
                onClick={() => setMode('custom_numbers')}
                className={`rounded-xl px-3 py-2 text-sm font-medium ${
                  mode === 'custom_numbers'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 dark:bg-[#202027] dark:text-gray-200'
                }`}
              >
                Custom numbers
              </button>
            </div>
          </div>

          {mode === 'selected_users' && (
            <div className="rounded-xl border border-gray-200 p-3 dark:border-[#26262d]">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => void loadUsers()}
                  placeholder="Search by name/email/phone"
                  className="min-w-[220px] flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-[#31313a] dark:bg-[#101015] dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 dark:bg-[#202027] dark:text-gray-200"
                >
                  Select filtered
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 dark:bg-[#202027] dark:text-gray-200"
                >
                  Clear
                </button>
              </div>
              <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-gray-100 dark:border-[#23232a]">
                {loadingUsers ? (
                  <div className="flex items-center gap-2 p-3 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading users...
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="p-3 text-sm text-gray-500">No users found.</div>
                ) : (
                  filteredUsers.map((u) => {
                    const isChecked = selectedUserIds.has(u.id);
                    return (
                      <label key={u.id} className="flex cursor-pointer items-center gap-2 border-b border-gray-100 px-3 py-2 text-sm dark:border-[#23232a]">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleUser(u.id)}
                          disabled={!u.phone || !u.phone.trim()}
                        />
                        <span className="min-w-0 flex-1 truncate text-gray-800 dark:text-gray-100">
                          {(u.name || u.email || 'Unnamed user') + (u.phone ? ` (${u.phone})` : ' (No phone)')}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {mode === 'all_users' && (
            <div className="rounded-xl border border-gray-200 p-3 dark:border-[#26262d]">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    User segment
                  </label>
                  <select
                    value={userSegment}
                    onChange={(e) => setUserSegment(e.target.value as UserSegment)}
                    className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-[#26262d] dark:bg-[#0f0f12] dark:text-gray-100"
                  >
                    <option value="all_accounts">All account users</option>
                    <option value="active_subscribers">Active subscribers</option>
                    <option value="near_expiry_subscribers">Near expiry (0-3 days left)</option>
                    <option value="expired_subscribers">Expired subscribers</option>
                    <option value="new_users">New users (no subscription yet)</option>
                  </select>
                </div>

                {userSegment === 'new_users' && (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      New user window (days)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={newUserDays}
                      onChange={(e) => setNewUserDays(Math.max(1, Math.min(365, Number(e.target.value) || 7)))}
                      className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-[#26262d] dark:bg-[#0f0f12] dark:text-gray-100"
                    />
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Segment recipients: {segmentedUsersWithPhone.length}
                {(loadingUsers || loadingSegments) ? ' (loading...)' : ''}
              </p>
            </div>
          )}

          {mode === 'custom_numbers' && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Custom numbers (comma/newline separated)
              </label>
              <textarea
                value={customNumbers}
                onChange={(e) => setCustomNumbers(e.target.value)}
                rows={4}
                placeholder={'8801XXXXXXXXX\n01XXXXXXXXX'}
                className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-[#26262d] dark:bg-[#0f0f12] dark:text-gray-100"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Entered: {customParseResult.entriesCount} | Valid: {customParseResult.validNumbers.length} | Invalid: {customParseResult.invalidCount} | Duplicates: {customParseResult.duplicateCount}
              </p>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Sender ID (optional)
              </label>
              <input
                value={senderId}
                onChange={(e) => setSenderId(e.target.value)}
                placeholder="Approved sender id"
                className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-[#26262d] dark:bg-[#0f0f12] dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Schedule (optional)
              </label>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-[#26262d] dark:bg-[#0f0f12] dark:text-gray-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={1000}
              placeholder="Write your SMS message..."
              className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-[#26262d] dark:bg-[#0f0f12] dark:text-gray-100"
            />
            <p className="mt-1 text-xs text-gray-400">
              Recipients: {recipientCount} | Message length: {message.length} / 1000
            </p>
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
          onClick={() => void handleSend()}
          disabled={sending}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-primary/25 transition hover:bg-primary/90 disabled:opacity-60 dark:bg-violet-600 dark:hover:bg-violet-500"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send SMS
        </button>
      </div>
    </div>
  );
};
