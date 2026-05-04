import webpush from 'web-push';

export type PersonalOrderAlertSettings = {
  enabled: boolean;
  telegram_enabled: boolean;
  telegram_bot_token: string;
  telegram_chat_ids: string[];
  email_enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass: string;
  email_from: string;
  email_to: string[];
  browser_push_enabled: boolean;
  browser_push_all_admins: boolean;
  browser_push_admin_user_ids: string[];
};

export type PersonalOrderAdminAlertTarget = {
  id: string;
  user_id: string;
  status?: string | null;
  payment_status?: string | null;
  created_at: string;
  total_amount?: number | string | null;
  personal_email?: string | null;
  delivered_at?: string | null;
  last_manual_alert_at?: string | null;
  last_manual_urgent_alert_at?: string | null;
  users?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  products?: {
    title?: string | null;
    duration?: string | null;
    price?: number | string | null;
  } | null;
};

const PERSONAL_ORDER_ALERTS_SETTINGS_KEY = 'personal_order_alerts';
const DEFAULT_PERSONAL_ORDER_ALERTS: PersonalOrderAlertSettings = {
  enabled: false,
  telegram_enabled: false,
  telegram_bot_token: '',
  telegram_chat_ids: [],
  email_enabled: false,
  smtp_host: '',
  smtp_port: 587,
  smtp_secure: false,
  smtp_user: '',
  smtp_pass: '',
  email_from: '',
  email_to: [],
  browser_push_enabled: false,
  browser_push_all_admins: true,
  browser_push_admin_user_ids: [],
};

const vapidPublicKey = (process.env.WEB_PUSH_VAPID_PUBLIC_KEY || process.env.VITE_WEB_PUSH_PUBLIC_KEY || '').trim();
const vapidPrivateKey = (process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '').trim();
const vapidSubject = (process.env.WEB_PUSH_SUBJECT || process.env.FRONTEND_URL || 'mailto:admin@example.com').trim();
const frontendBaseUrl = (process.env.FRONTEND_URL || process.env.VITE_SITE_URL || '').trim().replace(/\/+$/, '');

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function clampStr(value: unknown, maxLen: number) {
  const s = typeof value === 'string' ? value : value == null ? '' : String(value);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function splitLines(value: unknown, maxItems: number, maxLen: number) {
  return String(value || '')
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((part) => clampStr(part, maxLen));
}

function safeEmailList(value: unknown, maxItems = 20) {
  return splitLines(value, maxItems, 200).filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

function safeIdList(value: unknown, maxItems = 20) {
  return splitLines(value, maxItems, 120).filter((id) => id.length >= 6);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizePersonalOrderAlertSettings(value: unknown): PersonalOrderAlertSettings {
  const obj = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    enabled: obj.enabled === true,
    telegram_enabled: obj.telegram_enabled === true,
    telegram_bot_token: clampStr(obj.telegram_bot_token, 300),
    telegram_chat_ids: safeIdList(obj.telegram_chat_ids, 20),
    email_enabled: obj.email_enabled === true,
    smtp_host: clampStr(obj.smtp_host, 200),
    smtp_port: clampInt(obj.smtp_port, 1, 65535, 587),
    smtp_secure: obj.smtp_secure === true,
    smtp_user: clampStr(obj.smtp_user, 200),
    smtp_pass: clampStr(obj.smtp_pass, 500),
    email_from: clampStr(obj.email_from, 200),
    email_to: safeEmailList(obj.email_to, 20),
    browser_push_enabled: obj.browser_push_enabled === true,
    browser_push_all_admins: obj.browser_push_all_admins !== false,
    browser_push_admin_user_ids: safeIdList(obj.browser_push_admin_user_ids, 50),
  };
}

export async function loadPersonalOrderAlertSettings(supabase: any): Promise<PersonalOrderAlertSettings> {
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', PERSONAL_ORDER_ALERTS_SETTINGS_KEY)
    .maybeSingle();
  return {
    ...DEFAULT_PERSONAL_ORDER_ALERTS,
    ...sanitizePersonalOrderAlertSettings(data?.value),
  };
}

type AlertKind = 'new' | 'overdue' | 'urgent';

function buildAlertCopy(order: PersonalOrderAdminAlertTarget, kind: AlertKind = 'new') {
  const amount = Number(order.total_amount || order.products?.price || 0);
  const productTitle = String(order.products?.title || 'Personal Adobe plan').trim();
  const duration = String(order.products?.duration || '').trim();
  const buyerName = String(order.users?.name || '').trim();
  const buyerEmail = String(order.users?.email || '').trim();
  const buyerPhone = String(order.users?.phone || '').trim();
  const adobeEmail = String(order.personal_email || '').trim();
  const created = order.created_at ? new Date(order.created_at) : new Date();
  const createdLabel = Number.isNaN(created.getTime()) ? String(order.created_at || '') : created.toLocaleString('en-BD');
  const orderUrl = frontendBaseUrl ? `${frontendBaseUrl}/admin?tab=orders` : '';
  const supportUrl = frontendBaseUrl ? `${frontendBaseUrl}/support` : '';
  const titles =
    kind === 'urgent'
      ? {
          heading: 'Urgent personal order is still pending manual setup.',
          title: `Urgent: personal order still pending - ${productTitle}`,
        }
      : kind === 'overdue'
        ? {
            heading: 'Personal order is overdue for manual setup.',
            title: `Overdue: personal order needs action - ${productTitle}`,
          }
        : {
            heading: 'New personal order requires manual setup.',
            title: `New personal order: ${productTitle}`,
          };
  const lines = [
    titles.heading,
    `Order ID: ${order.id}`,
    `Product: ${productTitle}${duration ? ` (${duration})` : ''}`,
    `Customer: ${buyerName || 'Customer'}`,
    `Customer account email: ${buyerEmail || '—'}`,
    `Customer phone: ${buyerPhone || '—'}`,
    `Adobe access email: ${adobeEmail || '—'}`,
    `Amount: BDT ${Number.isFinite(amount) ? amount : 0}`,
    `Ordered: ${createdLabel}`,
  ];
  if (orderUrl) lines.push(`Open admin: ${orderUrl}`);
  if (supportUrl) lines.push(`Support page: ${supportUrl}`);
  const title = titles.title;
  return {
    title,
    text: lines.join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
        <h2 style="margin:0 0 12px">${escapeHtml(titles.heading)}</h2>
        <p style="margin:0 0 10px"><strong>Order ID:</strong> ${escapeHtml(order.id)}</p>
        <p style="margin:0 0 10px"><strong>Product:</strong> ${escapeHtml(`${productTitle}${duration ? ` (${duration})` : ''}`)}</p>
        <p style="margin:0 0 10px"><strong>Customer:</strong> ${escapeHtml(buyerName || 'Customer')}</p>
        <p style="margin:0 0 10px"><strong>Customer account email:</strong> ${escapeHtml(buyerEmail || '—')}</p>
        <p style="margin:0 0 10px"><strong>Customer phone:</strong> ${escapeHtml(buyerPhone || '—')}</p>
        <p style="margin:0 0 10px"><strong>Adobe access email:</strong> ${escapeHtml(adobeEmail || '—')}</p>
        <p style="margin:0 0 10px"><strong>Amount:</strong> BDT ${Number.isFinite(amount) ? amount : 0}</p>
        <p style="margin:0 0 10px"><strong>Ordered:</strong> ${escapeHtml(createdLabel)}</p>
        ${orderUrl ? `<p style="margin:0 0 8px"><strong>Open admin:</strong> <a href="${escapeHtml(orderUrl)}">${escapeHtml(orderUrl)}</a></p>` : ''}
        ${supportUrl ? `<p style="margin:0"><strong>Support page:</strong> <a href="${escapeHtml(supportUrl)}">${escapeHtml(supportUrl)}</a></p>` : ''}
      </div>
    `,
  };
}

async function sendTelegramAlert(settings: PersonalOrderAlertSettings, copy: ReturnType<typeof buildAlertCopy>) {
  if (!settings.telegram_enabled || !settings.telegram_bot_token || !settings.telegram_chat_ids.length) {
    return { attempted: false, sent: 0 };
  }
  let sent = 0;
  for (const chatId of settings.telegram_chat_ids) {
    const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(settings.telegram_bot_token)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: copy.text,
        disable_web_page_preview: true,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok !== true) {
      throw new Error(json?.description || 'Telegram send failed');
    }
    sent += 1;
  }
  return { attempted: true, sent };
}

async function sendEmailAlert(settings: PersonalOrderAlertSettings, copy: ReturnType<typeof buildAlertCopy>) {
  if (
    !settings.email_enabled ||
    !settings.smtp_host ||
    !settings.email_from ||
    !settings.email_to.length
  ) {
    return { attempted: false, sent: 0 };
  }
  const nodemailer = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host: settings.smtp_host,
    port: settings.smtp_port,
    secure: settings.smtp_secure,
    auth: settings.smtp_user ? { user: settings.smtp_user, pass: settings.smtp_pass } : undefined,
  });
  await transport.sendMail({
    from: settings.email_from,
    to: settings.email_to.join(', '),
    subject: copy.title,
    text: copy.text,
    html: copy.html,
  });
  return { attempted: true, sent: settings.email_to.length };
}

async function sendBrowserPushAlert(supabase: any, settings: PersonalOrderAlertSettings, copy: ReturnType<typeof buildAlertCopy>) {
  if (!settings.browser_push_enabled || !vapidPublicKey || !vapidPrivateKey) {
    return { attempted: false, sent: 0, removed: 0 };
  }
  let targetUserIds = settings.browser_push_admin_user_ids;
  if (settings.browser_push_all_admins) {
    const { data: admins, error: adminsError } = await supabase
      .from('users')
      .select('id')
      .in('role', ['admin', 'super_admin'])
      .limit(500);
    if (adminsError) throw adminsError;
    targetUserIds = (admins || []).map((row: any) => String(row.id || '')).filter(Boolean);
  }
  const uniqueUserIds = [...new Set(targetUserIds)];
  if (!uniqueUserIds.length) {
    return { attempted: false, sent: 0, removed: 0 };
  }
  let sent = 0;
  let removed = 0;
  for (const userId of uniqueUserIds) {
    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId)
      .limit(20);
    if (error) throw error;
    for (const sub of subs || []) {
      try {
        await webpush.sendNotification(
          {
            endpoint: (sub as any).endpoint,
            keys: { p256dh: (sub as any).p256dh, auth: (sub as any).auth },
          } as any,
          JSON.stringify({
            title: copy.title,
            body: copy.text.split('\n').slice(0, 3).join(' · '),
            url: '/admin?tab=orders',
          }),
        );
        sent += 1;
        await supabase.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', (sub as any).id);
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          removed += 1;
          await supabase.from('push_subscriptions').delete().eq('id', (sub as any).id);
        }
      }
    }
  }
  return { attempted: true, sent, removed };
}

export async function sendPersonalOrderAdminAlerts(
  supabase: any,
  order: PersonalOrderAdminAlertTarget,
  settingsInput?: PersonalOrderAlertSettings,
  kind: AlertKind = 'new',
) {
  const settings = settingsInput || (await loadPersonalOrderAlertSettings(supabase));
  if (!settings.enabled) {
    return {
      enabled: false,
      telegram: { attempted: false, sent: 0 },
      email: { attempted: false, sent: 0 },
      browser_push: { attempted: false, sent: 0, removed: 0 },
    };
  }
  const copy = buildAlertCopy(order, kind);
  const telegram = await sendTelegramAlert(settings, copy);
  const email = await sendEmailAlert(settings, copy);
  const browser_push = await sendBrowserPushAlert(supabase, settings, copy);
  return { enabled: true, telegram, email, browser_push };
}

function isPendingManualPersonalOrder(order: PersonalOrderAdminAlertTarget) {
  return order.status === 'pending' && order.payment_status === 'paid' && !!order.personal_email;
}

async function loadPersonalEtaMinutes(supabase: any) {
  const { data } = await supabase.from('system_settings').select('value').eq('key', 'personal_subscriptions').maybeSingle();
  const value = data?.value && typeof data.value === 'object' ? (data.value as Record<string, unknown>) : {};
  const rawEta = Number(value.delivery_eta_minutes);
  return Number.isFinite(rawEta) ? Math.min(7 * 24 * 60, Math.max(15, Math.floor(rawEta))) : 30;
}

export async function runPendingPersonalOrderEscalations(
  supabase: any,
  options?: { forceAllOverdue?: boolean },
) {
  const settings = await loadPersonalOrderAlertSettings(supabase);
  if (!settings.enabled) return { scanned: 0, overdue: 0, urgent: 0, skipped: 0 };

  const etaMinutes = await loadPersonalEtaMinutes(supabase);
  const now = Date.now();
  const urgentMinutes = Math.max(60, etaMinutes + 30);
  const { data: rows, error } = await supabase
    .from('orders')
    .select(
      `
      id,
      user_id,
      status,
      payment_status,
      created_at,
      total_amount,
      personal_email,
      delivered_at,
      last_manual_alert_at,
      last_manual_urgent_alert_at,
      users: user_id (name, email, phone),
      products: product_id (title, duration, price, is_personal)
    `,
    )
    .eq('payment_status', 'paid')
    .eq('status', 'pending')
    .not('personal_email', 'is', null)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw error;

  let overdue = 0;
  let urgent = 0;
  let skipped = 0;
  for (const row of (rows || []) as PersonalOrderAdminAlertTarget[]) {
    if (!isPendingManualPersonalOrder(row) || !(row as any)?.products?.is_personal) {
      skipped += 1;
      continue;
    }
    const createdTs = new Date(row.created_at).getTime();
    if (!Number.isFinite(createdTs)) {
      skipped += 1;
      continue;
    }
    const ageMinutes = Math.floor((now - createdTs) / 60000);
    const shouldUrgent = options?.forceAllOverdue
      ? ageMinutes >= urgentMinutes
      : ageMinutes >= urgentMinutes && !row.last_manual_urgent_alert_at;
    const shouldOverdue = options?.forceAllOverdue
      ? ageMinutes >= etaMinutes
      : ageMinutes >= etaMinutes && !row.last_manual_alert_at;

    if (!shouldOverdue && !shouldUrgent) {
      skipped += 1;
      continue;
    }

    const kind: AlertKind = shouldUrgent ? 'urgent' : 'overdue';
    await sendPersonalOrderAdminAlerts(supabase, row, settings, kind);
    const updates: Record<string, string> = {};
    if (shouldOverdue) updates.last_manual_alert_at = new Date().toISOString();
    if (shouldUrgent) updates.last_manual_urgent_alert_at = new Date().toISOString();
    const { error: updateError } = await supabase.from('orders').update(updates).eq('id', row.id);
    if (updateError) throw updateError;
    if (shouldUrgent) urgent += 1;
    else overdue += 1;
  }

  return { scanned: (rows || []).length, overdue, urgent, skipped };
}

export const PERSONAL_ORDER_ALERTS_SETTINGS_KEY_EXPORT = PERSONAL_ORDER_ALERTS_SETTINGS_KEY;
