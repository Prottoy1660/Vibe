import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';
import {
  tryProcessReferralRewardsForOrder,
  loadReferralSettings,
  adminGrantReferralRewardRow,
} from '../lib/referralEngine.js';
import {
  loadSupportChatStored,
  resolveSupportChatRuntime,
  mergeSupportChatPatch,
  toAdminSettingsPayload,
  invalidateSupportChatRuntimeCache,
  SUPPORT_CHAT_SETTINGS_KEY,
} from '../lib/supportChatSettings.js';
import {
  loadUddoktaPayStored,
  mergeUddoktaPayPatch,
  resolveUddoktaPayCredentials,
  toUddoktaPayAdminSettingsPayload,
  invalidateUddoktaPayCredentialsCache,
  UDDOKTAPAY_SETTINGS_KEY,
  isUddoktaPayOfferedAtCheckout,
  resolveUddoktaPayCheckoutToggle,
} from '../lib/uddoktapaySettings.js';
import {
  loadBkashTokenizedStored,
  mergeBkashTokenizedPatch,
  resolveBkashTokenizedCredentials,
  toBkashTokenizedAdminSettingsPayload,
  invalidateBkashTokenizedCredentialsCache,
  BKASH_TOKENIZED_SETTINGS_KEY,
  getBkashTokenizedCredentialsCached,
  isBkashTokenizedOfferedAtCheckout,
  resolveBkashTokenizedCheckoutToggle,
} from '../lib/bkashTokenizedSettings.js';
import { bkashGrantToken } from '../lib/bkashTokenizedClient.js';
import { bkashRefundTokenized } from '../lib/bkashTokenizedRefund.js';
import {
  loadReminderIntegrationsStored,
  mergeReminderIntegrationsPatch,
  resolveReminderOutbound,
  toReminderIntegrationsAdminPayload,
  SUBSCRIPTION_REMINDER_INTEGRATIONS_KEY,
} from '../lib/reminderIntegrationSettings.js';
import { runSubscriptionExpiryReminders } from '../lib/subscriptionExpiryReminders.js';
import { sendSubscriptionReminderTestToAdmin } from '../lib/subscriptionReminderAdminTest.js';
import { attachAdminActivityLogging } from '../lib/adminActivityLog.js';
import {
  seizeRedeemOrderForUnpaid,
  restoreRedeemOrderAfterSeize,
} from '../lib/redeemSeizeUnpaid.js';
import { fallbackPopularPersonPrefixes, pickRandomPrefixes } from '../lib/emailPrefixDataset.js';
import {
  loadPersonalOrderAlertSettings,
  runPendingPersonalOrderEscalations,
  sanitizePersonalOrderAlertSettings,
  PERSONAL_ORDER_ALERTS_SETTINGS_KEY_EXPORT,
} from '../lib/personalOrderAdminAlerts.js';

dotenv.config();

const router = express.Router();

const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[admin] Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY for admin API.');
}

type AppDownloadsPlatform = {
  enabled: boolean;
  comingSoon: boolean;
  title: string;
  subtitle: string;
  version: string;
  url: string;
  note: string;
};

type AppDownloadsConfig = {
  enabled: boolean;
  forceComingSoon: boolean;
  windows: AppDownloadsPlatform;
  android: AppDownloadsPlatform;
  macos: AppDownloadsPlatform;
};

const APP_DOWNLOADS_DEFAULT: AppDownloadsConfig = {
  enabled: false,
  forceComingSoon: false,
  windows: {
    enabled: true,
    comingSoon: false,
    title: 'Windows App',
    subtitle: 'Optimized desktop application for Windows 10/11.',
    version: '',
    url: '',
    note: '',
  },
  android: {
    enabled: true,
    comingSoon: false,
    title: 'Android App',
    subtitle: 'Fast mobile app with your full customer panel.',
    version: '',
    url: '',
    note: '',
  },
  macos: {
    enabled: true,
    comingSoon: false,
    title: 'macOS App',
    subtitle: 'Native-feel desktop app for MacBook and iMac.',
    version: '',
    url: '',
    note: '',
  },
};

const EMAIL_TEAM_LIFECYCLE_SETTINGS_KEY = 'email_team_lifecycle';
const EMAIL_TEAM_LIFECYCLE_DEFAULT = {
  expiry_days: 14,
  remind_before_days: 2,
} as const;
const PERSONAL_ORDER_ALERTS_SETTINGS_KEY = PERSONAL_ORDER_ALERTS_SETTINGS_KEY_EXPORT;
const SMS_NET_BD_ENDPOINT = 'https://api.sms.net.bd/sendsms';

function normalizeBdPhone(raw: string): string | null {
  const cleaned = String(raw || '').replace(/[^\d+]/g, '').trim();
  if (!cleaned) return null;
  if (/^8801\d{9}$/.test(cleaned)) return cleaned;
  if (/^01\d{9}$/.test(cleaned)) return `88${cleaned}`;
  return null;
}

function toSmsNetBdSchedule(input: string): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(
    d.getSeconds(),
  )}`;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function clampFloat(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitizeEmailTeamLifecycleSettings(value: unknown) {
  const obj = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const expiry_days = clampInt(obj.expiry_days, 1, 365, EMAIL_TEAM_LIFECYCLE_DEFAULT.expiry_days);
  const remind_before_days = clampInt(obj.remind_before_days, 0, 120, EMAIL_TEAM_LIFECYCLE_DEFAULT.remind_before_days);
  return {
    expiry_days,
    remind_before_days: Math.min(remind_before_days, Math.max(0, expiry_days - 1)),
  };
}

function fallbackTeamNameSuggestions(): string[] {
  return ['Pixel Loom', 'Nova Grid', 'Luma Craft', 'Vivid Lab', 'Frame Nest', 'Arc Studio', 'Glyph Works', 'Hue Foundry'];
}

function parseNameSuggestions(raw: string, count: number): string[] {
  const cleaned = String(raw || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as { names?: unknown[] };
    const arr = Array.isArray(parsed.names) ? parsed.names : [];
    const names = arr
      .filter((n) => typeof n === 'string')
      .map((n) => String(n).trim().slice(0, 40))
      .filter((n) => n.length >= 2)
      .filter((n) => /^[a-z0-9 .&+\-]+$/i.test(n));
    return [...new Set(names)].slice(0, count);
  } catch {
    const lines = cleaned
      .split('\n')
      .map((l) => l.replace(/^[\s\-*0-9.)]+/, '').trim())
      .filter((l) => l.length >= 2)
      .map((l) => l.slice(0, 40))
      .filter((n) => /^[a-z0-9 .&+\-]+$/i.test(n));
    return [...new Set(lines)].slice(0, count);
  }
}

function parsePrefixSuggestions(raw: string, count: number): string[] {
  const cleaned = String(raw || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const sanitize = (v: string) =>
    v
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .replace(/^\d+/, '')
      .slice(0, 16);

  try {
    const parsed = JSON.parse(cleaned) as { prefixes?: unknown[]; names?: unknown[] };
    const arr = Array.isArray(parsed.prefixes) ? parsed.prefixes : Array.isArray(parsed.names) ? parsed.names : [];
    const tokens = arr
      .filter((n) => typeof n === 'string')
      .map((n) => sanitize(String(n)))
      .filter((n) => n.length >= 3);
    return [...new Set(tokens)].slice(0, count);
  } catch {
    const tokens = cleaned
      .split(/[\n,]+/)
      .map((s) => sanitize(s.replace(/^[\s\-*0-9.)]+/, '').trim()))
      .filter((n) => n.length >= 3);
    return [...new Set(tokens)].slice(0, count);
  }
}

function clampStr(v: unknown, maxLen: number) {
  const s = typeof v === 'string' ? v : v == null ? '' : String(v);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function sanitizeAppDownloadsPlatform(v: unknown, fallback: AppDownloadsPlatform): AppDownloadsPlatform {
  const obj = (v && typeof v === 'object') ? (v as Record<string, unknown>) : {};
  return {
    enabled: obj.enabled === true,
    comingSoon: obj.comingSoon === true,
    title: clampStr(obj.title ?? fallback.title, 120),
    subtitle: clampStr(obj.subtitle ?? fallback.subtitle, 220),
    version: clampStr(obj.version ?? '', 60),
    url: clampStr(obj.url ?? '', 900),
    note: clampStr(obj.note ?? '', 500),
  };
}

function sanitizeAppDownloadsConfig(value: unknown): AppDownloadsConfig {
  const v = (value && typeof value === 'object') ? (value as Record<string, unknown>) : {};
  return {
    enabled: v.enabled === true,
    forceComingSoon: v.forceComingSoon === true,
    windows: sanitizeAppDownloadsPlatform(v.windows, APP_DOWNLOADS_DEFAULT.windows),
    android: sanitizeAppDownloadsPlatform(v.android, APP_DOWNLOADS_DEFAULT.android),
    macos: sanitizeAppDownloadsPlatform(v.macos, APP_DOWNLOADS_DEFAULT.macos),
  };
}

function durationToMonths(duration: string | null | undefined) {
  const raw = String(duration || '').toLowerCase();
  if (!raw) return 1;
  if (raw.includes('year') || raw.includes('yr')) {
    const match = raw.match(/\d+/);
    return match ? Math.max(1, Number(match[0]) * 12) : 12;
  }
  const match = raw.match(/\d+/);
  return match ? Math.max(1, Number(match[0])) : 1;
}

/**
 * Release pool emails linked to an order and mark the order refunded (shared by admin refund route).
 */
async function releaseOrderEmailsAndMarkRefunded(orderId: string): Promise<void> {
  const { data: userEmails } = await supabase.from('user_emails').select('email_id').eq('order_id', orderId);

  if (userEmails && userEmails.length > 0) {
    const emailIds = userEmails.map((ue: { email_id: string }) => ue.email_id);

    const { data: poolRows, error: poolErr } = await supabase
      .from('emails_pool')
      .select('id,current_users,product_id,assigned_at,is_burned')
      .in('id', emailIds);

    if (poolErr) throw poolErr;

    const productIds = Array.from(new Set((poolRows || []).map((r: { product_id: string | null }) => r.product_id).filter(Boolean)));

    let productsRows: { id: string; max_users_per_email: number | null }[] = [];
    if (productIds.length > 0) {
      const { data: pr, error: prodErr } = await supabase
        .from('products')
        .select('id,max_users_per_email')
        .in('id', productIds as string[]);
      if (prodErr) throw prodErr;
      productsRows = (pr || []) as { id: string; max_users_per_email: number | null }[];
    }

    const maxMap = new Map(productsRows.map((p) => [p.id, p.max_users_per_email]));

    for (const row of poolRows || []) {
      const r = row as {
        id: string;
        current_users: number | null;
        product_id: string | null;
        is_burned: boolean | null;
      };
      if (r.is_burned) continue;

      const current = Number(r.current_users || 0);
      const nextCount = Math.max(0, current - 1);
      const maxUsers = Number(maxMap.get(r.product_id as string) || 1);

      if (nextCount === 0) {
        const { error: uErr } = await supabase
          .from('emails_pool')
          .update({
            status: 'available',
            assigned_at: null,
            product_id: null,
            current_users: 0,
          })
          .eq('id', r.id);
        if (uErr) throw uErr;
      } else {
        const { error: uErr } = await supabase
          .from('emails_pool')
          .update({
            current_users: nextCount,
            status: nextCount >= maxUsers ? 'assigned' : 'available',
          })
          .eq('id', r.id);
        if (uErr) throw uErr;
      }
    }

    const { error: delUe } = await supabase.from('user_emails').delete().eq('order_id', orderId);
    if (delUe) throw delUe;
  }

  const { error: ordErr } = await supabase
    .from('orders')
    .update({ status: 'refunded', payment_status: 'refunded' })
    .eq('id', orderId);
  if (ordErr) throw ordErr;
}

/**
 * Release pool emails linked to an order without changing order status.
 * Used before hard-deleting orders so email slot counters stay consistent.
 */
async function releaseOrderEmailsOnly(orderId: string): Promise<void> {
  const { data: userEmails } = await supabase.from('user_emails').select('email_id').eq('order_id', orderId);
  if (!userEmails || userEmails.length === 0) return;

  const emailIds = userEmails.map((ue: { email_id: string }) => ue.email_id);
  const { data: poolRows, error: poolErr } = await supabase
    .from('emails_pool')
    .select('id,current_users,product_id,is_burned')
    .in('id', emailIds);
  if (poolErr) throw poolErr;

  const productIds = Array.from(new Set((poolRows || []).map((r: { product_id: string | null }) => r.product_id).filter(Boolean)));
  let productsRows: { id: string; max_users_per_email: number | null }[] = [];
  if (productIds.length > 0) {
    const { data: pr, error: prodErr } = await supabase
      .from('products')
      .select('id,max_users_per_email')
      .in('id', productIds as string[]);
    if (prodErr) throw prodErr;
    productsRows = (pr || []) as { id: string; max_users_per_email: number | null }[];
  }

  const maxMap = new Map(productsRows.map((p) => [p.id, p.max_users_per_email]));

  for (const row of poolRows || []) {
    const r = row as {
      id: string;
      current_users: number | null;
      product_id: string | null;
      is_burned: boolean | null;
    };
    if (r.is_burned) continue;
    const current = Number(r.current_users || 0);
    const nextCount = Math.max(0, current - 1);
    const maxUsers = Number(maxMap.get(r.product_id as string) || 1);

    if (nextCount === 0) {
      const { error: uErr } = await supabase
        .from('emails_pool')
        .update({
          status: 'available',
          assigned_at: null,
          product_id: null,
          current_users: 0,
        })
        .eq('id', r.id);
      if (uErr) throw uErr;
    } else {
      const { error: uErr } = await supabase
        .from('emails_pool')
        .update({
          current_users: nextCount,
          status: nextCount >= maxUsers ? 'assigned' : 'available',
        })
        .eq('id', r.id);
      if (uErr) throw uErr;
    }
  }

  const { error: delUe } = await supabase.from('user_emails').delete().eq('order_id', orderId);
  if (delUe) throw delUe;
}

// Middleware to verify admin
const verifyAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token || token === 'undefined') {
      return res.status(401).json({ error: 'Missing Authorization token' });
    }
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check if user is admin in public.users
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin' && userData?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    attachAdminActivityLogging(req, res, user.id);
    next();
  } catch (err) {
    console.error('Verify admin error:', err);
    res.status(500).json({ error: 'Server error during authorization' });
  }
};

async function recalculateEmailPoolOccupancy(emailId: string): Promise<void> {
  const { data: poolRow, error: poolErr } = await supabase
    .from('emails_pool')
    .select('id, product_id, is_burned')
    .eq('id', emailId)
    .maybeSingle();
  if (poolErr) throw poolErr;
  if (!poolRow) throw new Error('Email pool row not found');
  if ((poolRow as any).is_burned) return;

  const { count: activeCount, error: countErr } = await supabase
    .from('user_emails')
    .select('id', { count: 'exact', head: true })
    .eq('email_id', emailId)
    .eq('is_active', true);
  if (countErr) throw countErr;

  const nextCount = Number(activeCount || 0);
  if (nextCount <= 0) {
    const { error: resetErr } = await supabase
      .from('emails_pool')
      .update({
        current_users: 0,
        status: 'available',
        product_id: null,
        assigned_at: null,
      })
      .eq('id', emailId);
    if (resetErr) throw resetErr;
    return;
  }

  let maxUsers = 1;
  const productId = (poolRow as any).product_id as string | null;
  if (productId) {
    const { data: prod, error: prodErr } = await supabase
      .from('products')
      .select('max_users_per_email')
      .eq('id', productId)
      .maybeSingle();
    if (prodErr) throw prodErr;
    maxUsers = Math.max(1, Number((prod as any)?.max_users_per_email || 1));
  }

  const { error: updErr } = await supabase
    .from('emails_pool')
    .update({
      current_users: nextCount,
      status: nextCount >= maxUsers ? 'assigned' : 'available',
    })
    .eq('id', emailId);
  if (updErr) throw updErr;
}

router.get('/emails/:emailId/assignments', verifyAdmin, async (req, res) => {
  try {
    const emailId = String(req.params.emailId || '').trim();
    if (!emailId) return res.status(400).json({ success: false, error: 'emailId is required' });

    const { data: poolRow, error: poolErr } = await supabase
      .from('emails_pool')
      .select('id, email, status, current_users, product_id, assigned_at, is_burned')
      .eq('id', emailId)
      .maybeSingle();
    if (poolErr) throw poolErr;
    if (!poolRow) return res.status(404).json({ success: false, error: 'Email not found in pool' });

    const { data: assignments, error: assignErr } = await supabase
      .from('user_emails')
      .select('id, user_id, order_id, is_active')
      .eq('email_id', emailId)
      .eq('is_active', true)
      .order('id', { ascending: true });
    if (assignErr) throw assignErr;

    const rows = (assignments || []) as Array<{
      id: string;
      user_id: string;
      order_id: string;
      is_active: boolean;
    }>;
    const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
    const orderIds = [...new Set(rows.map((r) => r.order_id).filter(Boolean))];

    let usersMap = new Map<string, { name: string | null; email: string | null; phone: string | null }>();
    if (userIds.length > 0) {
      const { data: userRows, error: userErr } = await supabase
        .from('users')
        .select('id, name, email, phone')
        .in('id', userIds);
      if (userErr) throw userErr;
      usersMap = new Map(
        ((userRows || []) as Array<{ id: string; name: string | null; email: string | null; phone: string | null }>).map((u) => [
          u.id,
          { name: u.name, email: u.email, phone: u.phone },
        ]),
      );
    }

    let ordersMap = new Map<string, { status: string | null; payment_status: string | null; created_at: string | null }>();
    if (orderIds.length > 0) {
      const { data: orderRows, error: orderErr } = await supabase
        .from('orders')
        .select('id, status, payment_status, created_at')
        .in('id', orderIds);
      if (orderErr) throw orderErr;
      ordersMap = new Map(
        ((orderRows || []) as Array<{ id: string; status: string | null; payment_status: string | null; created_at: string | null }>).map(
          (o) => [o.id, { status: o.status, payment_status: o.payment_status, created_at: o.created_at }],
        ),
      );
    }

    return res.json({
      success: true,
      email: poolRow,
      assignments: rows.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        order_id: r.order_id,
        created_at: null,
        user: usersMap.get(r.user_id) || null,
        order: ordersMap.get(r.order_id) || null,
      })),
    });
  } catch (error: any) {
    console.error('admin email assignments:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load slot assignments' });
  }
});

router.post('/emails/:emailId/release-assignment', verifyAdmin, async (req, res) => {
  try {
    const emailId = String(req.params.emailId || '').trim();
    const assignmentId = String(req.body?.assignment_id || '').trim();
    const releaseAll = req.body?.release_all === true;
    if (!emailId) return res.status(400).json({ success: false, error: 'emailId is required' });
    if (!releaseAll && !assignmentId) {
      return res.status(400).json({ success: false, error: 'assignment_id is required when release_all is false' });
    }

    let q = supabase
      .from('user_emails')
      .select('id')
      .eq('email_id', emailId)
      .eq('is_active', true);
    if (!releaseAll) q = q.eq('id', assignmentId);
    const { data: targetRows, error: targetErr } = await q;
    if (targetErr) throw targetErr;
    if (!targetRows || targetRows.length === 0) {
      return res.status(404).json({ success: false, error: 'No active assignment found for this request' });
    }

    const ids = targetRows.map((r: any) => String(r.id));
    const { error: relErr } = await supabase.from('user_emails').update({ is_active: false }).in('id', ids);
    if (relErr) throw relErr;

    await recalculateEmailPoolOccupancy(emailId);

    return res.json({
      success: true,
      released: ids.length,
      message: releaseAll ? 'All users removed from this slot' : 'User removed from this slot',
    });
  } catch (error: any) {
    console.error('admin release email assignment:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to release slot assignment' });
  }
});

/**
 * List orders with service role (bypasses RLS). Admin UI used to query PostgREST as the logged-in user;
 * if public.users.role is missing/wrong, is_admin() is false and only own rows appear — empty order/finance/analytics.
 */
router.get('/orders/query', verifyAdmin, async (req, res) => {
  try {
    const limit = Math.min(5000, Math.max(1, Number(req.query.limit) || 200));
    const paymentStatus = typeof req.query.payment_status === 'string' ? req.query.payment_status.trim() : '';
    const from = typeof req.query.from === 'string' ? req.query.from.trim() : '';
    const to = typeof req.query.to === 'string' ? req.query.to.trim() : '';

    let q = supabase
      .from('orders')
      .select(
        `
        *,
        users: user_id (email, name, phone),
        products (title, is_personal, duration, price),
        user_emails (id)
      `,
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    if (paymentStatus) {
      q = q.eq('payment_status', paymentStatus);
    }
    if (from) {
      q = q.gte('created_at', from);
    }
    if (to) {
      q = q.lte('created_at', to);
    }

    const { data, error } = await q;
    if (error) throw error;
    return res.json({ success: true, orders: data || [] });
  } catch (e: any) {
    console.error('admin orders/query:', e);
    return res.status(500).json({ error: e?.message || 'Failed to list orders' });
  }
});

/**
 * Full admin refund: optional bKash API reversal (when order was paid via tokenized bKash), then email release + refunded status.
 * Requires admin JWT (verifyAdmin). bKash credentials never leave the server.
 */
router.post('/orders/:orderId/refund', verifyAdmin, async (req, res) => {
  try {
    const orderId = req.params.orderId;
    if (!orderId) return res.status(400).json({ success: false, error: 'orderId required' });

    const reason =
      typeof (req.body as any)?.reason === 'string' && String((req.body as any).reason).trim()
        ? String((req.body as any).reason).trim().slice(0, 255)
        : 'Admin refund';

    const { data: order, error: oErr } = await supabase
      .from('orders')
      .select(
        'id, user_id, status, payment_status, payment_method, bkash_payment_id, bkash_trx_id, bkash_gateway_amount',
      )
      .eq('id', orderId)
      .single();

    if (oErr || !order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (order.status === 'refunded' && order.payment_status === 'refunded') {
      return res.status(400).json({ success: false, error: 'Order is already refunded.' });
    }

    if (!['paid', 'completed'].includes(String(order.status))) {
      return res.status(400).json({ success: false, error: 'Only paid or completed orders can be refunded.' });
    }

    const pm = String(order.payment_method || '');
    const wantsBkashRefund = pm.includes('bkash');
    let refundTrxId: string | null = null;

    if (wantsBkashRefund) {
      const pid = typeof order.bkash_payment_id === 'string' ? order.bkash_payment_id.trim() : '';
      const trx = typeof order.bkash_trx_id === 'string' ? order.bkash_trx_id.trim() : '';
      const gw = Number(order.bkash_gateway_amount);

      if (!pid || !trx) {
        return res.status(400).json({
          success: false,
          error:
            'This order was marked bKash but is missing bKash payment ID or transaction ID, so the bKash Refund API cannot be called. Use bKash merchant portal or settle manually.',
        });
      }
      if (!Number.isFinite(gw) || gw <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing bKash gateway amount on this order; cannot determine refund amount.',
        });
      }

      const creds = await getBkashTokenizedCredentialsCached(supabase);
      if (!creds) {
        return res.status(503).json({
          success: false,
          error: 'bKash credentials are not configured on the server; cannot call refund API.',
        });
      }

      const idToken = await bkashGrantToken(creds);
      const refundAmount = gw % 1 === 0 ? String(Math.round(gw)) : gw.toFixed(2);
      const sku = `order-${orderId.replace(/-/g, '').slice(0, 20)}`;

      const refundJson = await bkashRefundTokenized({
        creds,
        idToken,
        paymentId: pid,
        trxId: trx,
        refundAmount,
        sku,
        reason,
      });

      refundTrxId = String(refundJson.refundTrxId || '').trim() || null;

      const { error: metaErr } = await supabase
        .from('orders')
        .update({ bkash_refund_trx_id: refundTrxId })
        .eq('id', orderId);
      if (metaErr) console.error('orders bkash_refund_trx_id update:', metaErr);
    }

    await releaseOrderEmailsAndMarkRefunded(orderId);

    try {
      await supabase.from('payment_events').insert({
        order_id: orderId,
        user_id: order.user_id,
        event_type: 'admin_refund_completed',
        amount: Number(order.bkash_gateway_amount) || null,
        gateway: wantsBkashRefund ? 'bkash_tokenized' : 'admin',
        message: wantsBkashRefund
          ? `Admin refund; bKash refund trx: ${refundTrxId || 'n/a'}`
          : 'Admin refund (non-bKash gateway)',
        meta: {
          bkash_refund_trx_id: refundTrxId,
          reason,
        },
      });
    } catch (pe) {
      console.error('payment_events admin_refund:', pe);
    }

    return res.json({
      success: true,
      message: wantsBkashRefund
        ? `Refunded via bKash API and access released.${refundTrxId ? ` Refund trx: ${refundTrxId}.` : ''}`
        : 'Order refunded and email access released where linked.',
      bkash_refund_trx_id: refundTrxId,
    });
  } catch (e: any) {
    console.error('admin orders/refund:', e);
    return res.status(500).json({ success: false, error: e?.message || 'Refund failed' });
  }
});

router.delete('/orders/:orderId', verifyAdmin, async (req, res) => {
  try {
    const orderId = req.params.orderId;
    if (!orderId) return res.status(400).json({ success: false, error: 'Order ID is required.' });

    await releaseOrderEmailsOnly(orderId);
    const { error } = await supabase.from('orders').delete().eq('id', orderId);
    if (error) throw error;

    return res.json({ success: true, message: 'Order deleted and slot counters synced.' });
  } catch (error: any) {
    console.error('delete order with sync:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to delete order.' });
  }
});

router.post('/orders/delete-pending', verifyAdmin, async (_req, res) => {
  try {
    const { data: rows, error: qErr } = await supabase
      .from('orders')
      .select('id')
      .eq('status', 'pending')
      .neq('payment_method', 'redeem_code')
      .limit(5000);
    if (qErr) throw qErr;

    const ids = (rows || []).map((r: any) => String(r.id));
    for (const id of ids) {
      await releaseOrderEmailsOnly(id);
    }
    if (ids.length > 0) {
      const { error: delErr } = await supabase.from('orders').delete().in('id', ids);
      if (delErr) throw delErr;
    }

    return res.json({ success: true, deleted: ids.length });
  } catch (error: any) {
    console.error('delete pending orders with sync:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to delete pending orders.' });
  }
});

router.get('/finance/operational-expenses', verifyAdmin, async (req, res) => {
  try {
    const from = typeof req.query.from === 'string' ? req.query.from.trim() : '';
    const to = typeof req.query.to === 'string' ? req.query.to.trim() : '';
    let q = supabase
      .from('operational_expenses')
      .select('*')
      .order('expense_date', { ascending: false })
      .limit(5000);
    if (from) {
      q = q.gte('expense_date', from);
    }
    if (to) {
      q = q.lte('expense_date', to);
    }
    const { data, error } = await q;
    if (error) throw error;
    return res.json({ success: true, expenses: data || [] });
  } catch (e: any) {
    console.error('admin finance/operational-expenses:', e);
    return res.status(500).json({ error: e?.message || 'Failed to load expenses' });
  }
});

router.post('/finance/operational-expenses', verifyAdmin, async (req, res) => {
  try {
    const body = (req.body || {}) as Record<string, any>;

    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const expense_date = typeof body.expense_date === 'string' ? body.expense_date.trim() : '';
    const currency = body.currency === 'USD' ? 'USD' : 'BDT';
    const amount = Number(body.amount);
    const amount_original = body.amount_original == null ? null : Number(body.amount_original);
    const fx_rate_to_bdt = body.fx_rate_to_bdt == null ? null : Number(body.fx_rate_to_bdt);

    if (!category) return res.status(400).json({ error: 'category is required' });
    if (!expense_date) return res.status(400).json({ error: 'expense_date is required' });
    if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: 'amount must be >= 0' });
    if (amount_original != null && (!Number.isFinite(amount_original) || amount_original < 0)) {
      return res.status(400).json({ error: 'amount_original must be >= 0' });
    }
    if (fx_rate_to_bdt != null && (!Number.isFinite(fx_rate_to_bdt) || fx_rate_to_bdt <= 0)) {
      return res.status(400).json({ error: 'fx_rate_to_bdt must be > 0' });
    }

    const payload: any = {
      category,
      amount,
      currency,
      amount_original,
      fx_rate_to_bdt: fx_rate_to_bdt ?? 1,
      fx_source: typeof body.fx_source === 'string' ? body.fx_source.trim() : null,
      vendor_name: typeof body.vendor_name === 'string' ? body.vendor_name.trim() : null,
      payment_method: typeof body.payment_method === 'string' ? body.payment_method.trim() : null,
      tags: Array.isArray(body.tags) ? body.tags.filter((t: any) => typeof t === 'string' && t.trim()) : [],
      attachment_urls: Array.isArray(body.attachment_urls)
        ? body.attachment_urls.filter((u: any) => typeof u === 'string' && u.startsWith('http'))
        : [],
      expense_date,
      note: typeof body.note === 'string' ? body.note.trim() || null : null,
      is_recurring_template: body.is_recurring_template === true,
      recurrence_interval: typeof body.recurrence_interval === 'string' ? body.recurrence_interval : null,
      next_due_date: typeof body.next_due_date === 'string' ? body.next_due_date : null,
      template_active: body.template_active === true,
      template_id: typeof body.template_id === 'string' ? body.template_id : null,
    };

    const { data, error } = await supabase.from('operational_expenses').insert(payload).select('*').single();
    if (error) throw error;
    return res.json({ success: true, expense: data });
  } catch (e: any) {
    console.error('finance/operational-expenses create:', e);
    return res.status(500).json({ error: e?.message || 'Failed to create expense' });
  }
});

router.delete('/finance/operational-expenses/:id', verifyAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id is required' });
    const { error } = await supabase.from('operational_expenses').delete().eq('id', id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (e: any) {
    console.error('finance/operational-expenses delete:', e);
    return res.status(500).json({ error: e?.message || 'Failed to delete expense' });
  }
});

router.patch('/finance/presets', verifyAdmin, async (req, res) => {
  try {
    const { key, value } = (req.body || {}) as { key?: string; value?: any };
    const allowed = new Set([
      'operational_expense_categories',
      'operational_payment_methods',
      'operational_category_budgets',
    ]);
    if (!key || typeof key !== 'string' || !allowed.has(key)) {
      return res.status(400).json({ error: 'Invalid key' });
    }
    if (value === null || value === undefined || typeof value !== 'object') {
      return res.status(400).json({ error: 'Invalid value' });
    }
    const { error } = await supabase.from('system_settings').upsert(
      {
        key,
        value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    );
    if (error) throw error;
    return res.json({ success: true });
  } catch (e: any) {
    console.error('finance/presets patch:', e);
    return res.status(500).json({ error: e?.message || 'Failed to save preset' });
  }
});

router.post('/finance/expense-attachments/upload-sign-url', verifyAdmin, async (req, res) => {
  try {
    const { file_name, content_type } = (req.body || {}) as {
      file_name?: string;
      content_type?: string;
    };
    if (!file_name || typeof file_name !== 'string') {
      return res.status(400).json({ error: 'file_name is required' });
    }
    const lower = file_name.toLowerCase();
    const allowed = ['.png', '.jpg', '.jpeg', '.webp', '.pdf'];
    if (!allowed.some((ext) => lower.endsWith(ext))) {
      return res.status(400).json({ error: 'Invalid file type (allowed: png, jpg, webp, pdf)' });
    }

    const bucket = 'expense-attachments';
    const cleaned = file_name.replace(/[^a-zA-Z0-9._-]+/g, '-');
    const filePath = `expenses/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${cleaned}`;

    const { data: bucketInfo } = await supabase.storage.getBucket(bucket);
    if (!bucketInfo) {
      const { error: createErr } = await supabase.storage.createBucket(bucket, {
        public: true,
        fileSizeLimit: '20MB',
      });
      if (createErr && !String(createErr.message || '').toLowerCase().includes('already')) {
        throw createErr;
      }
    }

    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(filePath);
    if (error || !data) throw error || new Error('Failed to create signed upload URL');
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(filePath);

    return res.json({
      success: true,
      bucket,
      path: filePath,
      token: data.token,
      signed_url: data.signedUrl,
      public_url: pub.publicUrl,
      content_type: content_type || '',
    });
  } catch (error: any) {
    console.error('expense attachments signed upload error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/finance/recurring/run', verifyAdmin, async (_req, res) => {
  try {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    const { data: templates, error } = await supabase
      .from('operational_expenses')
      .select('*')
      .eq('is_recurring_template', true)
      .eq('template_active', true)
      .lte('next_due_date', todayStr)
      .limit(500);
    if (error) throw error;

    let generated = 0;
    for (const t of templates || []) {
      const interval = String((t as any).recurrence_interval || '').toLowerCase();
      if (interval !== 'weekly' && interval !== 'monthly') continue;

      // Create an instance expense row (BDT equivalent is stored in `amount`).
      const insertPayload: any = {
        category: (t as any).category,
        amount: (t as any).amount,
        currency: (t as any).currency || 'BDT',
        amount_original: (t as any).amount_original ?? (t as any).amount,
        fx_rate_to_bdt: (t as any).fx_rate_to_bdt ?? 1,
        fx_source: (t as any).fx_source ?? null,
        vendor_name: (t as any).vendor_name ?? null,
        payment_method: (t as any).payment_method ?? null,
        tags: (t as any).tags ?? [],
        attachment_urls: (t as any).attachment_urls ?? [],
        expense_date: (t as any).next_due_date || todayStr,
        note: (t as any).note ?? null,
        template_id: (t as any).id,
        is_recurring_template: false,
      };

      const { error: insErr } = await supabase.from('operational_expenses').insert(insertPayload);
      if (!insErr) generated++;

      const due = new Date(String((t as any).next_due_date || todayStr) + 'T12:00:00Z');
      const next = new Date(due);
      if (interval === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
      else next.setUTCMonth(next.getUTCMonth() + 1);
      const nextStr = next.toISOString().slice(0, 10);

      await supabase
        .from('operational_expenses')
        .update({ next_due_date: nextStr, last_generated_at: new Date().toISOString() })
        .eq('id', (t as any).id);
    }

    return res.json({ success: true, generated });
  } catch (e: any) {
    console.error('finance recurring/run:', e);
    return res.status(500).json({ error: e?.message || 'Failed to run recurring expenses' });
  }
});

router.delete('/users/:id', verifyAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    // Prevent deleting admins for safety/security.
    const { data: userRow, error: userRowErr } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (userRowErr) {
      return res.status(500).json({ error: 'Failed to read user role before delete' });
    }

    if (userRow?.role === 'admin' || userRow?.role === 'super_admin') {
      return res.status(403).json({ error: 'Admins cannot be deleted' });
    }

    // Delete from auth.users (This cascades to public.users if FK is setup, otherwise we delete manually)
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    
    if (authError) {
      console.error('Error deleting from auth:', authError);
      return res.status(500).json({ error: authError.message });
    }

    // Also explicitly delete from public.users just in case cascade is not set
    await supabase.from('users').delete().eq('id', userId);

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/users/:id/impersonate', verifyAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    const authHeader = req.headers.authorization;
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim() || '';
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { data: authUserData, error: authUserErr } = await supabase.auth.getUser(token);
    if (authUserErr || !authUserData?.user?.id) return res.status(401).json({ error: 'Unauthorized' });

    const actorId = authUserData.user.id;
    const { data: actorRow, error: actorErr } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', actorId)
      .single();
    if (actorErr || !actorRow || (actorRow.role !== 'admin' && actorRow.role !== 'super_admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { data: targetRow, error: targetErr } = await supabase
      .from('users')
      .select('id, email, is_banned')
      .eq('id', userId)
      .single();
    if (targetErr || !targetRow?.email) {
      return res.status(404).json({ error: 'Target user not found' });
    }
    if (targetRow.is_banned === true) {
      return res.status(400).json({ error: 'Cannot impersonate a banned user' });
    }

    const redirectTo = process.env.FRONTEND_URL || undefined;
    const { data: linkData, error: linkErr } = await (supabase.auth.admin as any).generateLink({
      type: 'magiclink',
      email: targetRow.email,
      options: redirectTo ? { redirectTo } : undefined,
    });
    if (linkErr) {
      console.error('impersonate generate link error:', linkErr);
      return res.status(500).json({ error: linkErr.message || 'Failed to generate login link' });
    }

    const actionLink =
      linkData?.properties?.action_link ||
      linkData?.action_link ||
      null;
    if (!actionLink) {
      return res.status(500).json({ error: 'Magic link not returned by auth provider' });
    }

    return res.json({
      success: true,
      action_link: actionLink,
      target_user_id: targetRow.id,
      target_email: targetRow.email,
    });
  } catch (error: any) {
    console.error('impersonate user error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.delete('/ops/support-tickets/:id', verifyAdmin, async (req, res) => {
  try {
    const ticketId = req.params.id;
    const { error } = await supabase.from('support_tickets').delete().eq('id', ticketId);
    if (error) throw error;
    res.json({ success: true, message: 'Ticket deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/ops/sidebar-config', verifyAdmin, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '') || '';
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super Admin access required' });
    }

    const { hidden_tabs } = req.body;
    if (!Array.isArray(hidden_tabs)) {
      return res.status(400).json({ error: 'hidden_tabs must be an array' });
    }

    const { error } = await supabase
      .from('system_settings')
      .upsert({ key: 'admin_sidebar_config', value: { hidden_tabs } });

    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    console.error('sidebar config error:', error);
    res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/sms/send', verifyAdmin, async (req, res) => {
  try {
    const smsApiKey = (process.env.SMS_NET_BD_API_KEY || process.env.SMS_API_KEY || '').trim();
    if (!smsApiKey) {
      return res.status(500).json({ error: 'SMS API key not configured on server (SMS_NET_BD_API_KEY).' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const msg = String((body as Record<string, unknown>).msg || '').trim();
    if (!msg) return res.status(400).json({ error: 'msg is required' });
    const recipientModeRaw = String((body as Record<string, unknown>).recipient_mode || 'unknown');
    const recipientMode = ['selected_users', 'all_users', 'custom_numbers'].includes(recipientModeRaw)
      ? recipientModeRaw
      : 'unknown';

    const rawTo = Array.isArray((body as Record<string, unknown>).to)
      ? ((body as Record<string, unknown>).to as unknown[])
      : [String((body as Record<string, unknown>).to || '')];
    const normalized = [...new Set(rawTo.map((v) => normalizeBdPhone(String(v || ''))).filter(Boolean) as string[])];

    if (!normalized.length) {
      return res.status(400).json({ error: 'No valid recipient number found. Use 8801XXXXXXXXX or 01XXXXXXXXX format.' });
    }
    if (normalized.length > 5000) {
      return res.status(400).json({ error: 'Too many recipients in one request. Max 5000 numbers.' });
    }

    const senderId = String((body as Record<string, unknown>).sender_id || '').trim();
    const scheduleRaw = String((body as Record<string, unknown>).schedule || '').trim();
    const schedule = scheduleRaw ? toSmsNetBdSchedule(scheduleRaw) : null;
    if (scheduleRaw && !schedule) {
      return res.status(400).json({ error: 'Invalid schedule format' });
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim() || '';
    const { data: authData } = await supabase.auth.getUser(token);
    const adminId = authData?.user?.id || null;

    const form = new URLSearchParams();
    form.set('api_key', smsApiKey);
    form.set('msg', msg);
    form.set('to', normalized.join(','));
    if (senderId) form.set('sender_id', senderId);
    if (schedule) form.set('schedule', schedule);

    const upstreamRes = await fetch(SMS_NET_BD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const upstreamText = await upstreamRes.text();
    let upstreamJson: any = null;
    try {
      upstreamJson = upstreamText ? JSON.parse(upstreamText) : {};
    } catch {
      upstreamJson = { error: 409, msg: upstreamText || 'Upstream returned non-JSON response' };
    }

    const upstreamError = Number(upstreamJson?.error ?? 409);
    if (!upstreamRes.ok || upstreamError !== 0) {
      const batchIdFailed = crypto.randomUUID();
      const failedRows = normalized.map((phone) => ({
        batch_id: batchIdFailed,
        admin_id: adminId,
        recipient_phone: phone,
        message: msg,
        sender_id: senderId || null,
        schedule_at: schedule ? new Date(schedule.replace(' ', 'T') + 'Z').toISOString() : null,
        provider: 'sms.net.bd',
        provider_request_id: String(upstreamJson?.data?.request_id || ''),
        provider_error_code: upstreamError,
        provider_message: String(upstreamJson?.msg || ''),
        recipient_mode: recipientMode,
      }));
      const { error: logErr } = await supabase.from('sms_send_logs').insert(failedRows);
      if (logErr) console.error('sms log insert error (failed send):', logErr);
      return res.status(400).json({
        error: upstreamJson?.msg || `SMS provider request failed (${upstreamError})`,
        upstream: upstreamJson,
      });
    }

    const batchId = crypto.randomUUID();
    const logRows = normalized.map((phone) => ({
      batch_id: batchId,
      admin_id: adminId,
      recipient_phone: phone,
      message: msg,
      sender_id: senderId || null,
      schedule_at: schedule ? new Date(schedule.replace(' ', 'T') + 'Z').toISOString() : null,
      provider: 'sms.net.bd',
      provider_request_id: String(upstreamJson?.data?.request_id || ''),
      provider_error_code: upstreamError,
      provider_message: String(upstreamJson?.msg || ''),
      recipient_mode: recipientMode,
    }));
    const { error: logErr } = await supabase.from('sms_send_logs').insert(logRows);
    if (logErr) console.error('sms log insert error:', logErr);

    return res.json({
      success: true,
      sent_count: normalized.length,
      request_id: upstreamJson?.data?.request_id ?? null,
      upstream: upstreamJson,
    });
  } catch (error: any) {
    console.error('sms send error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/sms-pricing', verifyAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'sms_pricing')
      .maybeSingle();
    if (error) throw error;
    const obj = (data?.value || {}) as Record<string, unknown>;
    const costPerSms = clampFloat(obj.cost_per_sms, 0, 100, 0.4);
    const currency = typeof obj.currency === 'string' && obj.currency.trim() ? obj.currency.trim().toUpperCase() : 'BDT';
    return res.json({ success: true, settings: { cost_per_sms: costPerSms, currency } });
  } catch (error: any) {
    console.error('sms pricing get error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.patch('/ops/sms-pricing', verifyAdmin, async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const costPerSms = clampFloat(body.cost_per_sms, 0, 100, 0.4);
    const currency =
      typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim().toUpperCase().slice(0, 8) : 'BDT';
    const settings = { cost_per_sms: Number(costPerSms.toFixed(4)), currency };
    const { error } = await supabase.from('system_settings').upsert({ key: 'sms_pricing', value: settings });
    if (error) throw error;
    return res.json({ success: true, settings });
  } catch (error: any) {
    console.error('sms pricing patch error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/email-team-lifecycle', verifyAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', EMAIL_TEAM_LIFECYCLE_SETTINGS_KEY)
      .maybeSingle();
    if (error) throw error;
    const settings = sanitizeEmailTeamLifecycleSettings(data?.value || {});
    return res.json({ success: true, settings });
  } catch (error: any) {
    console.error('email team lifecycle settings get:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.patch('/ops/email-team-lifecycle', verifyAdmin, async (req, res) => {
  try {
    const patch = req.body || {};
    const settings = sanitizeEmailTeamLifecycleSettings({
      expiry_days: patch.expiry_days,
      remind_before_days: patch.remind_before_days,
    });
    const { error } = await supabase
      .from('system_settings')
      .upsert({ key: EMAIL_TEAM_LIFECYCLE_SETTINGS_KEY, value: settings });
    if (error) throw error;
    return res.json({ success: true, settings });
  } catch (error: any) {
    console.error('email team lifecycle settings patch:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/personal-order-alerts', verifyAdmin, async (_req, res) => {
  try {
    const settings = await loadPersonalOrderAlertSettings(supabase);
    const { data: admins, error: adminsError } = await supabase
      .from('users')
      .select('id, name, email, phone, role')
      .in('role', ['admin', 'super_admin'])
      .order('created_at', { ascending: true })
      .limit(200);
    if (adminsError) throw adminsError;
    return res.json({ success: true, settings, admins: admins || [] });
  } catch (error: any) {
    console.error('personal order alerts get:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.patch('/ops/personal-order-alerts', verifyAdmin, async (req, res) => {
  try {
    const current = await loadPersonalOrderAlertSettings(supabase);
    const settings = sanitizePersonalOrderAlertSettings({
      ...current,
      ...(req.body && typeof req.body === 'object' ? req.body : {}),
    });
    const { error } = await supabase
      .from('system_settings')
      .upsert({ key: PERSONAL_ORDER_ALERTS_SETTINGS_KEY, value: settings, updated_at: new Date().toISOString() });
    if (error) throw error;
    return res.json({ success: true, settings });
  } catch (error: any) {
    console.error('personal order alerts patch:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/personal-order-overdue-alerts', verifyAdmin, async (req, res) => {
  try {
    const result = await runPendingPersonalOrderEscalations(supabase, {
      forceAllOverdue: req.body?.force_all === true,
    });
    return res.json({ success: true, result });
  } catch (error: any) {
    console.error('personal order overdue alerts:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/email-team-name-suggestions', verifyAdmin, async (req, res) => {
  try {
    const count = clampInt(req.body?.count, 3, 12, 8);
    const context = typeof req.body?.context === 'string' ? req.body.context.trim().slice(0, 200) : '';
    const stored = await loadSupportChatStored(supabase);
    const runtime = resolveSupportChatRuntime(stored);
    const geminiKey = runtime.geminiKey;
    const geminiModel = runtime.geminiModel || 'gemini-2.0-flash';

    if (!geminiKey) {
      return res.status(400).json({ error: 'Gemini API key is not configured in server/support AI settings.' });
    }

    const prompt = [
      'Generate short creative team names for Adobe/design email pools.',
      'Output strict JSON only: {"names":["Name 1","Name 2", ...]}',
      `Return exactly ${count} unique names.`,
      'Constraints: 2-3 words max, professional, brand-like, easy to type, English only.',
      'Avoid trademarked exact major brand names.',
      context ? `Context: ${context}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(geminiKey)}`;
    const aiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 500,
          responseMimeType: 'application/json',
        },
      }),
    });
    const aiJson = (await aiRes.json()) as any;
    if (!aiRes.ok) {
      const msg = aiJson?.error?.message || `Gemini HTTP ${aiRes.status}`;
      throw new Error(msg);
    }

    const text = aiJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let names = parseNameSuggestions(text, count);
    if (names.length < 3) {
      names = fallbackTeamNameSuggestions().slice(0, count);
    }
    return res.json({ success: true, names });
  } catch (error: any) {
    console.error('email team name suggestions error:', error);
    return res.status(500).json({ error: error?.message || 'Failed to generate suggestions' });
  }
});

router.post('/ops/email-prefix-suggestions', verifyAdmin, async (req, res) => {
  try {
    const count = clampInt(req.body?.count, 4, 2000, 12);
    const stored = await loadSupportChatStored(supabase);
    const runtime = resolveSupportChatRuntime(stored);
    const geminiKey = runtime.geminiKey;
    const geminiModel = runtime.geminiModel || 'gemini-2.0-flash';

    if (!geminiKey) {
      return res.json({ success: true, prefixes: pickRandomPrefixes(fallbackPopularPersonPrefixes(2000), count) });
    }

    const prompt = [
      'Generate globally diverse popular PERSON names only for email prefixes.',
      'Must be inspired by public/pop-culture people (actors/actresses/performers) from Hollywood, Turkish and Korean industries.',
      'Do not output company/brand/studio words.',
      'Output strict JSON only: {"prefixes":["name1","name2",...]}',
      `Return exactly ${count} unique single-token prefixes.`,
      'Each prefix rules: lowercase, a-z0-9 only, 3-16 chars, no spaces.',
    ].join('\n');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(geminiKey)}`;
    const aiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 500,
          responseMimeType: 'application/json',
        },
      }),
    });
    const aiJson = (await aiRes.json()) as any;
    if (!aiRes.ok) {
      const msg = aiJson?.error?.message || `Gemini HTTP ${aiRes.status}`;
      throw new Error(msg);
    }

    const text = aiJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let prefixes = parsePrefixSuggestions(text, count);
    if (prefixes.length < 4) {
      prefixes = pickRandomPrefixes(fallbackPopularPersonPrefixes(2000), count);
    }
    return res.json({ success: true, prefixes });
  } catch (error: any) {
    console.error('email prefix suggestions error:', error);
    return res.json({ success: true, prefixes: pickRandomPrefixes(fallbackPopularPersonPrefixes(2000), 12) });
  }
});

router.get('/ops/app-downloads', verifyAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'customer_app_downloads')
      .maybeSingle();
    if (error) throw error;
    // IMPORTANT: Always return a small fixed-shape payload.
    // This prevents admin UI crashes if this settings row ever got polluted with a huge object.
    const sanitized = sanitizeAppDownloadsConfig((data?.value as any) || {});
    return res.json({ success: true, settings: sanitized });
  } catch (error: any) {
    console.error('app downloads get error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/activity-logging/settings', verifyAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'admin_activity_logging')
      .maybeSingle();
    if (error) throw error;
    const value = (data?.value || {}) as { enabled?: boolean; log_reads?: boolean };
    return res.json({
      success: true,
      settings: {
        enabled: value.enabled !== false,
        log_reads: value.log_reads === true,
      },
    });
  } catch (error: any) {
    console.error('activity logging settings get:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.patch('/ops/activity-logging/settings', verifyAdmin, async (req, res) => {
  try {
    const body = (req.body && typeof req.body === 'object') ? (req.body as Record<string, unknown>) : {};
    const value = {
      enabled: body.enabled !== false,
      log_reads: body.log_reads === true,
    };

    const { error } = await supabase
      .from('system_settings')
      .upsert(
        {
          key: 'admin_activity_logging',
          value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      );
    if (error) throw error;

    return res.json({ success: true, settings: value });
  } catch (error: any) {
    console.error('activity logging settings patch:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.patch('/ops/app-downloads', verifyAdmin, async (req, res) => {
  try {
    const incoming = (req.body || {}) as Record<string, unknown>;
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'customer_app_downloads')
      .maybeSingle();
    const existingSanitized = sanitizeAppDownloadsConfig((data?.value as any) || {});
    const incomingSanitized = sanitizeAppDownloadsConfig(incoming || {});
    // Shallow-merge safe top-level toggles, deep-merge per platform, discard unknown keys.
    const merged: AppDownloadsConfig = {
      ...existingSanitized,
      enabled: incomingSanitized.enabled,
      forceComingSoon: incomingSanitized.forceComingSoon,
      windows: { ...existingSanitized.windows, ...incomingSanitized.windows },
      android: { ...existingSanitized.android, ...incomingSanitized.android },
      macos: { ...existingSanitized.macos, ...incomingSanitized.macos },
    };
    const { error } = await supabase.from('system_settings').upsert(
      {
        key: 'customer_app_downloads',
        value: merged,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );
    if (error) throw error;
    return res.json({ success: true, settings: merged });
  } catch (error: any) {
    console.error('app downloads patch error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/app-downloads/upload-sign-url', verifyAdmin, async (req, res) => {
  try {
    const { platform, file_name, content_type } = (req.body || {}) as {
      platform?: 'windows' | 'android' | 'macos';
      file_name?: string;
      content_type?: string;
    };
    if (!platform || (platform !== 'windows' && platform !== 'android' && platform !== 'macos')) {
      return res.status(400).json({ error: 'Invalid platform' });
    }
    if (!file_name || typeof file_name !== 'string') {
      return res.status(400).json({ error: 'file_name is required' });
    }

    const lower = file_name.toLowerCase();
    const allowedWindows = ['.exe', '.msi', '.zip'];
    const allowedAndroid = ['.apk', '.aab', '.zip'];
    const allowedMacos = ['.dmg', '.pkg', '.zip'];
    const allowed = platform === 'windows' ? allowedWindows : platform === 'android' ? allowedAndroid : allowedMacos;
    const extOk = allowed.some((ext) => lower.endsWith(ext));
    if (!extOk) {
      return res.status(400).json({ error: `Invalid file type for ${platform}` });
    }

    const bucket = 'app-downloads';
    const cleaned = file_name.replace(/[^a-zA-Z0-9._-]+/g, '-');
    const filePath = `${platform}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${cleaned}`;

    const { data: bucketInfo } = await supabase.storage.getBucket(bucket);
    if (!bucketInfo) {
      const { error: createErr } = await supabase.storage.createBucket(bucket, {
        public: true,
        fileSizeLimit: '300MB',
      });
      if (createErr && !String(createErr.message || '').toLowerCase().includes('already')) {
        throw createErr;
      }
    }

    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(filePath);
    if (error || !data) throw error || new Error('Failed to create signed upload URL');

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return res.json({
      success: true,
      bucket,
      path: filePath,
      token: data.token,
      signed_url: data.signedUrl,
      public_url: pub.publicUrl,
      content_type: content_type || '',
    });
  } catch (error: any) {
    console.error('app downloads signed upload error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.put('/users/:id', verifyAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { name, email, phone, password, avatar_url } = req.body;

    // 1. Prepare Auth Updates (Email, Password, Phone metadata)
    const authUpdateData: any = {};
    if (email) authUpdateData.email = email;
    if (password) authUpdateData.password = password;
    if (phone) authUpdateData.phone = phone;

    const userMetadata: any = {};
    if (name) userMetadata.full_name = name;
    if (phone) userMetadata.phone = phone;
    
    if (Object.keys(userMetadata).length > 0) {
      authUpdateData.user_metadata = userMetadata;
    }

    if (Object.keys(authUpdateData).length > 0) {
      const { error: authError } = await supabase.auth.admin.updateUserById(userId, authUpdateData);
      if (authError) {
        console.error('Error updating auth user:', authError);
        return res.status(400).json({ error: authError.message });
      }
    }

    // 2. Prepare Public Profile Updates (Name, Phone, Avatar)
    const publicUpdateData: any = {};
    if (name) publicUpdateData.name = name;
    if (email) publicUpdateData.email = email; // Also sync email to public table
    if (phone) publicUpdateData.phone = phone;
    if (avatar_url !== undefined) publicUpdateData.avatar_url = avatar_url;

    if (Object.keys(publicUpdateData).length > 0) {
      const { error: publicError } = await supabase
        .from('users')
        .update(publicUpdateData)
        .eq('id', userId);

      if (publicError) {
        console.error('Error updating public user:', publicError);
        return res.status(400).json({ error: publicError.message });
      }
    }

    // 3. Log the activity
    const changes: string[] = [];
    if (name) changes.push('Name');
    if (email) changes.push('Email');
    if (phone) changes.push('Phone Number');
    if (password) changes.push('Password');
    if (avatar_url !== undefined) changes.push('Avatar');

    if (changes.length > 0) {
      // Get the admin's user ID from the token we verified earlier
      const authHeader = req.headers.authorization;
      const token = authHeader?.replace('Bearer ', '') || '';
      const { data: { user: adminUser } } = await supabase.auth.getUser(token);

      await supabase.from('user_activity_logs').insert({
        user_id: userId,
        action_type: 'admin_update',
        changed_by: adminUser?.id || null,
        details: { message: `Admin updated ${changes.join(', ')}` }
      });
    }

    res.json({ success: true, message: 'User updated successfully' });
  } catch (error: any) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/ops/support-summary/:userId', verifyAdmin, async (req, res) => {
  try {
    const userId = req.params.userId;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const [{ data: profile }, { data: orders }, { data: walletRow }, { data: paymentEvents }, { data: riskEvents }, { data: orderEvents }] =
      await Promise.all([
        supabase.from('users').select('id, name, email, phone, wallet_balance, created_at').eq('id', userId).single(),
        supabase
          .from('orders')
          .select('id, status, payment_status, payment_method, total_amount, created_at, product:product_id(title)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase.from('users').select('wallet_balance').eq('id', userId).single(),
        supabase
          .from('payment_events')
          .select('id, event_type, amount, message, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('risk_events')
          .select('id, risk_type, severity, message, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('order_events')
          .select('id, order_id, event_type, status, message, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(40),
      ]);

    const failedPayments = (paymentEvents || []).filter((e: any) =>
      String(e.event_type || '').toLowerCase().includes('fail')
    ).length;

    return res.json({
      success: true,
      profile,
      wallet_balance: Number(walletRow?.wallet_balance || 0),
      order_count: orders?.length || 0,
      failed_payments_last: failedPayments,
      latest_orders: orders || [],
      payment_events: paymentEvents || [],
      risk_events: riskEvents || [],
      timeline_events: orderEvents || [],
    });
  } catch (error: any) {
    console.error('ops support-summary error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/risk-overview', verifyAdmin, async (req, res) => {
  try {
    const hours = Math.max(1, Math.min(168, Number(req.query.hours || 24)));
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const [{ data: recentPaymentEvents }, { data: recentRiskEvents }, { data: recentOrders }] = await Promise.all([
      supabase
        .from('payment_events')
        .select('event_type, created_at, user_id')
        .gte('created_at', since),
      supabase
        .from('risk_events')
        .select('risk_type, severity, created_at, user_id')
        .gte('created_at', since),
      supabase
        .from('orders')
        .select('id, user_id, status, payment_status, created_at')
        .gte('created_at', since),
    ]);

    const paymentFailures = (recentPaymentEvents || []).filter((e: any) =>
      String(e.event_type || '').toLowerCase().includes('fail')
    ).length;

    const retrySignals = (recentPaymentEvents || []).filter((e: any) =>
      String(e.event_type || '').toLowerCase().includes('retry')
    ).length;

    const pendingOrders = (recentOrders || []).filter((o: any) => o.status === 'pending').length;
    const suspiciousWallet = (recentRiskEvents || []).filter((r: any) => r.risk_type === 'wallet_anomaly').length;
    const redeemAbuse = (recentRiskEvents || []).filter((r: any) => r.risk_type === 'redeem_abuse').length;

    return res.json({
      success: true,
      window_hours: hours,
      metrics: {
        payment_failures: paymentFailures,
        retries: retrySignals,
        pending_orders: pendingOrders,
        suspicious_wallet_events: suspiciousWallet,
        redeem_abuse_events: redeemAbuse,
        total_risk_events: recentRiskEvents?.length || 0,
      },
      recent_risk_events: (recentRiskEvents || []).slice(0, 50),
    });
  } catch (error: any) {
    console.error('ops risk-overview error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

// Full product list for admin UI (service role — bypasses RLS). Caller must pass verifyAdmin.
router.get('/ops/catalog-products', verifyAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id, title, price, is_active, is_personal')
      .order('title', { ascending: true });
    if (error) throw error;
    return res.json({ success: true, products: data || [] });
  } catch (error: any) {
    console.error('catalog-products error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/run-policies', verifyAdmin, async (req, res) => {
  try {
    const now = Date.now();
    const pendingOlderThan25 = new Date(now - 25 * 60 * 1000).toISOString();
    const pendingYoungerThan30 = new Date(now - 30 * 60 * 1000).toISOString();

    const { data: pendingOrders } = await supabase
      .from('orders')
      .select('id, user_id, created_at, status')
      .eq('status', 'pending')
      .lte('created_at', pendingOlderThan25)
      .gte('created_at', pendingYoungerThan30)
      .limit(500);

    let remindersQueued = 0;
    for (const order of pendingOrders || []) {
      const { data: existing } = await supabase
        .from('notification_queue')
        .select('id')
        .eq('order_id', order.id)
        .eq('template_key', 'pending_25m_reminder')
        .maybeSingle();
      if (existing?.id) continue;

      const { error } = await supabase.from('notification_queue').insert({
        user_id: order.user_id,
        order_id: order.id,
        channel: 'in_app',
        template_key: 'pending_25m_reminder',
        payload: { message: 'Your order is still pending. Complete payment soon before expiry.' },
        status: 'pending',
        scheduled_for: new Date().toISOString(),
      });
      if (!error) remindersQueued++;
    }

    const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000).toISOString();
    const { data: paymentFailures } = await supabase
      .from('payment_events')
      .select('user_id, event_type, created_at')
      .gte('created_at', thirtyMinutesAgo);

    const failureMap: Record<string, number> = {};
    for (const e of paymentFailures || []) {
      const type = String((e as any).event_type || '').toLowerCase();
      if (!type.includes('fail') && !type.includes('error')) continue;
      const uid = (e as any).user_id;
      if (!uid) continue;
      failureMap[uid] = (failureMap[uid] || 0) + 1;
    }

    let throttleFlags = 0;
    for (const [uid, count] of Object.entries(failureMap)) {
      if (count < 3) continue;
      const { data: existingRisk } = await supabase
        .from('risk_events')
        .select('id')
        .eq('user_id', uid)
        .eq('risk_type', 'repeat_payment_failures')
        .gte('created_at', thirtyMinutesAgo)
        .maybeSingle();
      if (existingRisk?.id) continue;

      const { error } = await supabase.from('risk_events').insert({
        user_id: uid,
        risk_type: 'repeat_payment_failures',
        severity: 'medium',
        message: `User has ${count} payment failures within 30 minutes`,
        meta: { failures_30m: count, suggested_action: 'temporary_throttle' },
      });
      if (!error) throttleFlags++;
    }

    return res.json({
      success: true,
      reminders_queued: remindersQueued,
      throttle_flags_created: throttleFlags,
    });
  } catch (error: any) {
    console.error('ops run-policies error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/bulk/orders/status', verifyAdmin, async (req, res) => {
  try {
    const { order_ids, new_status } = req.body as { order_ids: string[]; new_status: string };
    if (!Array.isArray(order_ids) || order_ids.length === 0 || !new_status) {
      return res.status(400).json({ error: 'order_ids and new_status are required' });
    }

    const updates: any = { status: new_status };
    if (new_status === 'completed') updates.payment_status = 'paid';
    if (new_status === 'cancelled') updates.payment_status = 'cancelled';

    const { error } = await supabase.from('orders').update(updates).in('id', order_ids);
    if (error) throw error;

    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '') || '';
    const { data: { user: adminUser } } = await supabase.auth.getUser(token);
    await supabase.from('bulk_action_logs').insert({
      action_type: 'bulk_order_status',
      target_count: order_ids.length,
      payload: { new_status, order_ids },
      performed_by: adminUser?.id || null,
    });

    return res.json({ success: true, updated: order_ids.length });
  } catch (error: any) {
    console.error('bulk order status error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/bulk/notices', verifyAdmin, async (req, res) => {
  try {
    const { user_ids, title, content, type = 'info' } = req.body as {
      user_ids: string[]; title: string; content: string; type?: string;
    };
    if (!Array.isArray(user_ids) || user_ids.length === 0 || !title || !content) {
      return res.status(400).json({ error: 'user_ids, title and content are required' });
    }

    const rows = user_ids.map((uid) => ({
      user_id: uid,
      channel: 'in_app',
      template_key: 'bulk_notice',
      payload: { title, content, type },
      status: 'pending',
      scheduled_for: new Date().toISOString(),
    }));
    const { error } = await supabase.from('notification_queue').insert(rows);
    if (error) throw error;

    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '') || '';
    const { data: { user: adminUser } } = await supabase.auth.getUser(token);
    await supabase.from('bulk_action_logs').insert({
      action_type: 'bulk_notice',
      target_count: user_ids.length,
      payload: { title, content, type },
      performed_by: adminUser?.id || null,
    });

    return res.json({ success: true, queued: user_ids.length });
  } catch (error: any) {
    console.error('bulk notices error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/bulk/renew-offers', verifyAdmin, async (req, res) => {
  try {
    const { user_ids, days = 7 } = req.body as { user_ids?: string[]; days?: number };
    const threshold = Math.max(1, Math.min(30, Number(days) || 7));

    let targets: string[] = [];
    if (Array.isArray(user_ids) && user_ids.length > 0) {
      targets = [...new Set(user_ids)];
    } else {
      const since = new Date(Date.now() - threshold * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentOrders } = await supabase
        .from('orders')
        .select('user_id, created_at, status')
        .eq('status', 'completed')
        .gte('created_at', since)
        .limit(500);
      const recent = (recentOrders || []) as { user_id?: string | null }[];
      targets = [
        ...new Set(
          recent.map((o) => o.user_id).filter((id): id is string => typeof id === 'string' && id.length > 0),
        ),
      ];
    }

    if (targets.length === 0) return res.json({ success: true, queued: 0 });
    const rows = targets.map((uid) => ({
      user_id: uid,
      channel: 'in_app',
      template_key: 'renew_offer',
      payload: { message: 'Your subscription may expire soon. Renew now with one tap.' },
      status: 'pending',
      scheduled_for: new Date().toISOString(),
    }));
    const { error } = await supabase.from('notification_queue').insert(rows);
    if (error) throw error;

    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '') || '';
    const { data: { user: adminUser } } = await supabase.auth.getUser(token);
    await supabase.from('bulk_action_logs').insert({
      action_type: 'bulk_renew_offer',
      target_count: targets.length,
      payload: { days: threshold },
      performed_by: adminUser?.id || null,
    });

    return res.json({ success: true, queued: targets.length });
  } catch (error: any) {
    console.error('bulk renew offers error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/campaigns', verifyAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return res.json({ success: true, campaigns: data || [] });
  } catch (error: any) {
    console.error('campaign list error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/campaigns', verifyAdmin, async (req, res) => {
  try {
    const { name, channel = 'in_app', campaign_type = 'renewal', budget = 0, metadata = {} } = req.body || {};
    if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'Valid name is required' });

    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '') || '';
    const { data: { user: adminUser } } = await supabase.auth.getUser(token);

    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        name: String(name).trim(),
        channel,
        campaign_type,
        status: 'draft',
        budget: Number(budget) || 0,
        metadata,
        created_by: adminUser?.id || null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return res.json({ success: true, campaign: data });
  } catch (error: any) {
    console.error('campaign create error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.put('/ops/campaigns/:id', verifyAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { name, status, budget, metadata } = req.body || {};
    const updates: any = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (status !== undefined) updates.status = status;
    if (budget !== undefined) updates.budget = Number(budget) || 0;
    if (metadata !== undefined) updates.metadata = metadata;

    const { data, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return res.json({ success: true, campaign: data });
  } catch (error: any) {
    console.error('campaign update error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.delete('/ops/campaigns/:id', verifyAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'Campaign id is required' });

    const { error } = await supabase.from('campaigns').delete().eq('id', id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (error: any) {
    console.error('campaign delete error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/campaigns/:id/roi', verifyAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const [{ data: campaign }, { data: events }] = await Promise.all([
      supabase.from('campaigns').select('*').eq('id', id).single(),
      supabase.from('campaign_events').select('event_type, revenue_amount').eq('campaign_id', id),
    ]);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const impressions = (events || []).filter((e: any) => e.event_type === 'impression').length;
    const clicks = (events || []).filter((e: any) => e.event_type === 'click').length;
    const conversions = (events || []).filter((e: any) => e.event_type === 'conversion').length;
    const revenue = (events || [])
      .filter((e: any) => e.event_type === 'conversion')
      .reduce((acc: number, e: any) => acc + Number(e.revenue_amount || 0), 0);
    const cost = Number((campaign as any).budget || 0);
    const roiPercent = cost > 0 ? ((revenue - cost) / cost) * 100 : (revenue > 0 ? 100 : 0);

    return res.json({
      success: true,
      campaign,
      metrics: {
        impressions,
        clicks,
        conversions,
        conversion_rate: clicks > 0 ? (conversions / clicks) * 100 : 0,
        revenue,
        cost,
        roi_percent: roiPercent,
      },
    });
  } catch (error: any) {
    console.error('campaign roi error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/run-reminders', verifyAdmin, async (_req, res) => {
  try {
    const { data: completedOrders } = await supabase
      .from('orders')
      .select('id, user_id, created_at, products:product_id(duration)')
      .eq('status', 'completed')
      .limit(1000);

    let queued = 0;
    const now = Date.now();
    for (const o of completedOrders || []) {
      const months = durationToMonths((o as any).products?.duration);
      const expiry = new Date((o as any).created_at).getTime();
      const expiryAt = new Date(expiry);
      expiryAt.setMonth(expiryAt.getMonth() + months);
      const daysLeft = Math.ceil((expiryAt.getTime() - now) / (24 * 60 * 60 * 1000));
      const key = daysLeft === 7 ? 'expiry_7d' : daysLeft === 3 ? 'expiry_3d' : daysLeft === 1 ? 'expiry_1d' : null;
      if (!key) continue;

      const { data: existing } = await supabase
        .from('notification_queue')
        .select('id')
        .eq('order_id', (o as any).id)
        .eq('template_key', key)
        .maybeSingle();
      if (existing?.id) continue;

      const { error } = await supabase.from('notification_queue').insert({
        user_id: (o as any).user_id,
        order_id: (o as any).id,
        channel: 'in_app',
        template_key: key,
        payload: {
          message: `Your subscription expires in ${daysLeft} day${daysLeft > 1 ? 's' : ''}. Renew now in one tap.`,
          cta: '/orders',
        },
        status: 'pending',
        scheduled_for: new Date().toISOString(),
      });
      if (!error) queued++;
    }

    return res.json({ success: true, queued });
  } catch (error: any) {
    console.error('run reminders error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/subscription-health', verifyAdmin, async (req, res) => {
  try {
    const limit = Math.max(20, Math.min(500, Number(req.query.limit || 120)));
    const { data: orders } = await supabase
      .from('orders')
      .select(
        'id, user_id, status, auto_renew, created_at, users:user_id(email, name, phone), products:product_id(title, duration)'
      )
      .in('status', ['completed', 'paid'])
      .order('created_at', { ascending: false })
      .limit(limit);

    const { data: paymentFails } = await supabase
      .from('payment_events')
      .select('user_id, event_type, created_at')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const failMap: Record<string, number> = {};
    for (const e of paymentFails || []) {
      const type = String((e as any).event_type || '').toLowerCase();
      if (!type.includes('fail') && !type.includes('error')) continue;
      const uid = (e as any).user_id;
      if (!uid) continue;
      failMap[uid] = (failMap[uid] || 0) + 1;
    }

    const now = Date.now();
    const rows = (orders || []).map((o: any) => {
      const months = durationToMonths(o.products?.duration);
      const expiry = new Date(o.created_at);
      expiry.setMonth(expiry.getMonth() + months);
      const daysLeft = Math.ceil((expiry.getTime() - now) / (24 * 60 * 60 * 1000));
      const userFails = failMap[o.user_id] || 0;

      let score = 100;
      const reasons: string[] = [];
      if (daysLeft <= 0) { score -= 65; reasons.push('expired'); }
      else if (daysLeft <= 3) { score -= 40; reasons.push('expiring_soon_3d'); }
      else if (daysLeft <= 7) { score -= 20; reasons.push('expiring_soon_7d'); }
      if (!o.auto_renew) { score -= 15; reasons.push('auto_renew_off'); }
      if (userFails >= 3) { score -= 20; reasons.push('payment_failures_recent'); }

      score = Math.max(0, Math.min(100, score));
      const label = score >= 75 ? 'healthy' : score >= 45 ? 'risk' : 'action_needed';
      return {
        order_id: o.id,
        user_id: o.user_id,
        user_name: o.users?.name || '',
        user_email: o.users?.email || '',
        user_phone: o.users?.phone || '',
        product_title: o.products?.title || 'Unknown',
        auto_renew: !!o.auto_renew,
        days_left: daysLeft,
        score,
        label,
        reasons,
      };
    });

    return res.json({ success: true, rows });
  } catch (error: any) {
    console.error('subscription health error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/analytics/cohort-retention', verifyAdmin, async (req, res) => {
  try {
    const months = Math.max(1, Math.min(12, Number(req.query.months || 6)));
    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const { data: orders } = await supabase
      .from('orders')
      .select('id, user_id, created_at, status')
      .eq('status', 'completed')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true });

    const byUser: Record<string, Date[]> = {};
    for (const o of orders || []) {
      if (!o.user_id) continue;
      byUser[o.user_id] = byUser[o.user_id] || [];
      byUser[o.user_id].push(new Date(o.created_at));
    }

    const cohorts: Record<string, { users: number; retained30: number }> = {};
    for (const [uid, dates] of Object.entries(byUser)) {
      const first = dates[0];
      const cohortKey = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`;
      cohorts[cohortKey] = cohorts[cohortKey] || { users: 0, retained30: 0 };
      cohorts[cohortKey].users += 1;
      const retained = dates.some((d) => d.getTime() - first.getTime() >= 30 * 24 * 60 * 60 * 1000);
      if (retained) cohorts[cohortKey].retained30 += 1;
    }

    const rows = Object.entries(cohorts).map(([cohort, v]) => ({
      cohort,
      users: v.users,
      retained_30d: v.retained30,
      retention_30d_percent: v.users > 0 ? (v.retained30 / v.users) * 100 : 0,
    }));

    return res.json({ success: true, rows });
  } catch (error: any) {
    console.error('cohort retention error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/analytics/funnel', verifyAdmin, async (req, res) => {
  try {
    const days = Math.max(1, Math.min(90, Number(req.query.days || 30)));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const [funnelRes, paymentRes] = await Promise.all([
      supabase.from('funnel_events').select('event_type').gte('created_at', since),
      supabase.from('payment_events').select('event_type').gte('created_at', since),
    ]);

    const count = (arr: any[] | null | undefined, key: string) =>
      (arr || []).filter((x: any) => String(x.event_type || '').toLowerCase() === key).length;

    const storeView = count(funnelRes.data, 'store_view');
    const checkoutStart = count(funnelRes.data, 'checkout_start');
    const paymentInit = count(paymentRes.data, 'payment_init');
    const paid = count(paymentRes.data, 'payment_completed') + count(paymentRes.data, 'wallet_only_paid');

    return res.json({
      success: true,
      window_days: days,
      stages: {
        store_view: storeView,
        checkout_start: checkoutStart,
        payment_init: paymentInit,
        paid,
      },
      conversion: {
        store_to_checkout: storeView > 0 ? (checkoutStart / storeView) * 100 : 0,
        checkout_to_paid: checkoutStart > 0 ? (paid / checkoutStart) * 100 : 0,
        overall: storeView > 0 ? (paid / storeView) * 100 : 0,
      },
    });
  } catch (error: any) {
    console.error('funnel diagnostics error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/analytics/ltv', verifyAdmin, async (req, res) => {
  try {
    const limit = Math.max(20, Math.min(500, Number(req.query.limit || 100)));
    const { data: orders } = await supabase
      .from('orders')
      .select('user_id, total_amount, status, payment_status')
      .in('status', ['completed', 'paid'])
      .eq('payment_status', 'paid')
      .limit(5000);

    const spendMap: Record<string, number> = {};
    for (const o of orders || []) {
      if (!o.user_id) continue;
      spendMap[o.user_id] = (spendMap[o.user_id] || 0) + Number(o.total_amount || 0);
    }
    const sorted = Object.entries(spendMap)
      .map(([user_id, ltv]) => ({ user_id, ltv }))
      .sort((a, b) => b.ltv - a.ltv)
      .slice(0, limit);

    return res.json({ success: true, rows: sorted });
  } catch (error: any) {
    console.error('ltv analytics error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/renewal-packs', verifyAdmin, async (req, res) => {
  try {
    const days = Math.max(1, Math.min(30, Number(req.query.days || 7)));
    const { data: orders } = await supabase
      .from('orders')
      .select('id, user_id, created_at, auto_renew, users:user_id(name, email), products:product_id(title, duration, price)')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1000);

    const now = Date.now();
    const rows: any[] = [];
    for (const o of orders || []) {
      const months = durationToMonths((o as any).products?.duration);
      const exp = new Date((o as any).created_at);
      exp.setMonth(exp.getMonth() + months);
      const daysLeft = Math.ceil((exp.getTime() - now) / (24 * 60 * 60 * 1000));
      if (daysLeft < 0 || daysLeft > days) continue;
      rows.push({
        order_id: (o as any).id,
        user_id: (o as any).user_id,
        user_name: (o as any).users?.name || '',
        user_email: (o as any).users?.email || '',
        product_title: (o as any).products?.title || 'Unknown',
        suggested_price: Number((o as any).products?.price || 0),
        days_left: daysLeft,
        auto_renew: !!(o as any).auto_renew,
      });
    }
    return res.json({ success: true, rows: rows.slice(0, 300) });
  } catch (error: any) {
    console.error('renewal packs error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/referral/settings', verifyAdmin, async (_req, res) => {
  try {
    const settings = await loadReferralSettings(supabase);
    return res.json({ success: true, settings });
  } catch (error: any) {
    console.error('referral settings get:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.patch('/ops/referral/settings', verifyAdmin, async (req, res) => {
  try {
    const { data } = await supabase.from('system_settings').select('value').eq('key', 'referral_program').maybeSingle();
    const merged = { ...((data?.value as any) || {}), ...(req.body || {}) };
    const { error } = await supabase.from('system_settings').upsert(
      {
        key: 'referral_program',
        value: merged,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );
    if (error) throw error;
    return res.json({ success: true, settings: merged });
  } catch (error: any) {
    console.error('referral settings patch:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/referral/rewards', verifyAdmin, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit || 200)));
    const { data: rows, error } = await supabase
      .from('referral_rewards')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    const ids = new Set<string>();
    for (const r of rows || []) {
      ids.add((r as any).referrer_user_id);
      ids.add((r as any).referee_user_id);
    }
    const idList = [...ids].filter(Boolean);
    let userMap: Record<string, any> = {};
    if (idList.length) {
      const { data: users } = await supabase.from('users').select('id,name,email,phone,created_at').in('id', idList);
      userMap = Object.fromEntries((users || []).map((u: any) => [u.id, u]));
    }
    const enriched = (rows || []).map((r: any) => ({
      ...r,
      referrer: userMap[r.referrer_user_id] || null,
      referee: userMap[r.referee_user_id] || null,
    }));
    return res.json({ success: true, rows: enriched });
  } catch (error: any) {
    console.error('referral rewards list:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/referral/rewards/:id/approve', verifyAdmin, async (req, res) => {
  try {
    const out = await adminGrantReferralRewardRow(supabase, req.params.id);
    if (!out.ok) return res.status(400).json({ error: out.error || 'Approve failed' });
    return res.json({ success: true });
  } catch (error: any) {
    console.error('referral approve:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/referral/rewards/:id/reject', verifyAdmin, async (req, res) => {
  try {
    const { data: row } = await supabase.from('referral_rewards').select('status').eq('id', req.params.id).single();
    if (!row) return res.status(404).json({ error: 'Not found' });
    if ((row as any).status === 'granted') {
      return res.status(400).json({ error: 'Already granted' });
    }
    await supabase.from('referral_rewards').update({ status: 'rejected' }).eq('id', req.params.id);
    return res.json({ success: true });
  } catch (error: any) {
    console.error('referral reject:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/referral/process-order/:orderId', verifyAdmin, async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const result = await tryProcessReferralRewardsForOrder(supabase, orderId, { force: true });
    return res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('referral process error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/churn/run-campaign', verifyAdmin, async (req, res) => {
  try {
    const days = Math.max(1, Math.min(30, Number(req.body?.days || 7)));
    const inactiveDays = Math.max(3, Math.min(60, Number(req.body?.inactive_days || 14)));
    const now = Date.now();

    const [{ data: orders }, { data: activity }] = await Promise.all([
      supabase
        .from('orders')
        .select('id, user_id, created_at, status, products:product_id(duration)')
        .eq('status', 'completed')
        .limit(2000),
      supabase
        .from('user_activity_logs')
        .select('user_id, created_at')
        .gte('created_at', new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    const lastSeen: Record<string, number> = {};
    for (const a of activity || []) {
      if (!(a as any).user_id) continue;
      const ts = new Date((a as any).created_at).getTime();
      lastSeen[(a as any).user_id] = Math.max(lastSeen[(a as any).user_id] || 0, ts);
    }

    const targetUserIds = new Set<string>();
    for (const o of orders || []) {
      const uid = (o as any).user_id;
      if (!uid) continue;
      const exp = new Date((o as any).created_at);
      exp.setMonth(exp.getMonth() + durationToMonths((o as any).products?.duration));
      const daysLeft = Math.ceil((exp.getTime() - now) / (24 * 60 * 60 * 1000));
      if (daysLeft < 0 || daysLeft > days) continue;
      const seen = lastSeen[uid] || 0;
      const inactiveFor = seen ? Math.floor((now - seen) / (24 * 60 * 60 * 1000)) : 999;
      if (inactiveFor >= inactiveDays) targetUserIds.add(uid);
    }

    const rows = [...targetUserIds].map((uid) => ({
      user_id: uid,
      channel: 'in_app',
      template_key: 'churn_prevention_offer',
      payload: { message: 'We miss you! Renew now with a special offer.' },
      status: 'pending',
      scheduled_for: new Date().toISOString(),
    }));
    if (rows.length) await supabase.from('notification_queue').insert(rows);

    return res.json({ success: true, queued: rows.length });
  } catch (error: any) {
    console.error('churn campaign error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/process-notification-queue', verifyAdmin, async (req, res) => {
  try {
    const limit = Math.max(10, Math.min(500, Number(req.body?.limit || 200)));
    const nowIso = new Date().toISOString();

    const { data: jobs, error: fetchErr } = await supabase
      .from('notification_queue')
      .select('id, user_id, order_id, channel, template_key, payload, status, scheduled_for')
      .eq('status', 'pending')
      .or(`scheduled_for.is.null,scheduled_for.lte.${nowIso}`)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (fetchErr) throw fetchErr;

    let processed = 0;
    for (const job of jobs || []) {
      // v1 processor: mark as processed (in-app queue consumed)
      // Future: send email/sms providers per channel and then mark result.
      const { error: updateErr } = await supabase
        .from('notification_queue')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('id', (job as any).id)
        .eq('status', 'pending');
      if (!updateErr) processed++;
    }

    return res.json({ success: true, scanned: jobs?.length || 0, processed });
  } catch (error: any) {
    console.error('process notification queue error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

// Admin renew (Option A)
// Creates a new order linked to `renewed_from_order_id` and provisions fresh access.
// Body:
// - charge_wallet?: boolean (default true)
// - preserve_auto_renew?: boolean (default true)
router.post('/orders/:orderId/renew', verifyAdmin, async (req, res) => {
  try {
    const oldOrderId = req.params.orderId;
    const { charge_wallet = true, preserve_auto_renew = true } = req.body || {};

    if (!oldOrderId) return res.status(400).json({ success: false, error: 'orderId required' });

    const { data: oldOrder, error: oldErr } = await supabase
      .from('orders')
      .select(`
        id,
        user_id,
        product_id,
        status,
        payment_status,
        auto_renew,
        personal_email,
        created_at,
        renewed_from_order_id,
        products:product_id (
          id,
          is_personal,
          duration,
          price
        )
      `)
      .eq('id', oldOrderId)
      .single();

    if (oldErr || !oldOrder) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const product = (oldOrder as any).products;
    if (!product) return res.status(400).json({ success: false, error: 'Missing product' });

    const isPersonal = !!product.is_personal;
    const price = Number(product.price || 0);

    if (charge_wallet && price <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid product price for wallet charge' });
    }

    if (!['paid', 'completed'].includes(oldOrder.status)) {
      return res.status(400).json({ success: false, error: 'Order must be paid/completed to renew' });
    }

    // Create the new order first to know the ID for provisioning.
    // (If provisioning fails, we refund best-effort.)
    if (charge_wallet) {
      const { error: deductErr } = await supabase.rpc('deduct_subscription_wallet_combined', {
        p_user_id: oldOrder.user_id,
        p_amount: price,
      });
      if (deductErr) {
        return res.status(400).json({ success: false, error: 'Insufficient wallet balance' });
      }
    }

    const { data: created, error: createErr } = await supabase
      .from('orders')
      .insert({
        user_id: oldOrder.user_id,
        product_id: oldOrder.product_id,
        payment_method: charge_wallet ? 'wallet' : 'admin_renew',
        total_amount: price,
        status: 'completed',
        payment_status: 'paid',
        auto_renew: preserve_auto_renew ? !!oldOrder.auto_renew : false,
        personal_email: isPersonal ? oldOrder.personal_email : null,
        renewed_from_order_id: oldOrder.id,
      })
      .select()
      .single();

    if (createErr || !created) {
      // Refund best-effort if we already charged
      if (charge_wallet) {
        try {
          const { data: uRow } = await supabase.from('users').select('wallet_balance').eq('id', oldOrder.user_id).single();
          const current = Number((uRow as any)?.wallet_balance || 0);
          await supabase.from('users').update({ wallet_balance: current + price }).eq('id', oldOrder.user_id);
        } catch {}
      }
      return res.status(500).json({ success: false, error: 'Failed to create renewed order' });
    }

    // Prevent duplicate renewals from the old order auto-renew flag.
    await supabase.from('orders').update({ auto_renew: false }).eq('id', oldOrder.id);

    // Provision fresh access
    if (isPersonal) {
      const months = durationToMonths(product.duration);
      const email = oldOrder.personal_email;
      const { grantAdobeCloudAccess } = await import('../lib/adobeApi.js');
      const out = await grantAdobeCloudAccess(email, months);
      if (!out?.success) {
        if (charge_wallet) {
          try {
            const { data: uRow } = await supabase.from('users').select('wallet_balance').eq('id', oldOrder.user_id).single();
            const current = Number((uRow as any)?.wallet_balance || 0);
            await supabase.from('users').update({ wallet_balance: current + price }).eq('id', oldOrder.user_id);
          } catch {}
        }
        await supabase.from('orders').update({ status: 'refunded', payment_status: 'refunded' }).eq('id', created.id);
        return res.status(500).json({ success: false, error: out?.error || 'Personal provisioning failed' });
      }
    } else {
      const { data: assignRes, error: assignErr } = await supabase.rpc('assign_email_for_order_strict_24h', {
        p_order_id: created.id,
      });

      if (assignErr || !(assignRes as any)?.success) {
        if (charge_wallet) {
          try {
            const { data: uRow } = await supabase.from('users').select('wallet_balance').eq('id', oldOrder.user_id).single();
            const current = Number((uRow as any)?.wallet_balance || 0);
            await supabase.from('users').update({ wallet_balance: current + price }).eq('id', oldOrder.user_id);
          } catch {}
        }
        await supabase.from('orders').update({ status: 'refunded', payment_status: 'refunded' }).eq('id', created.id);
        return res.status(500).json({ success: false, error: (assignRes as any)?.error || assignErr?.message || 'Provisioning failed' });
      }
    }

    return res.json({ success: true, renewed_order_id: created.id });
  } catch (error: any) {
    console.error('Admin renew error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/subscription-reminder/integrations', verifyAdmin, async (_req, res) => {
  try {
    const stored = await loadReminderIntegrationsStored(supabase);
    const resolved = resolveReminderOutbound(stored);
    return res.json({
      success: true,
      settings: toReminderIntegrationsAdminPayload(stored, resolved),
    });
  } catch (error: any) {
    console.error('subscription-reminder integrations get:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.patch('/ops/subscription-reminder/integrations', verifyAdmin, async (req, res) => {
  try {
    const stored = await loadReminderIntegrationsStored(supabase);
    const merged = mergeReminderIntegrationsPatch(stored, (req.body || {}) as Record<string, unknown>);
    const { error } = await supabase.from('system_settings').upsert(
      {
        key: SUBSCRIPTION_REMINDER_INTEGRATIONS_KEY,
        value: merged as any,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    );
    if (error) throw error;
    const resolved = resolveReminderOutbound(merged);
    return res.json({
      success: true,
      settings: toReminderIntegrationsAdminPayload(merged, resolved),
    });
  } catch (error: any) {
    console.error('subscription-reminder integrations patch:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/subscription-reminder/run', verifyAdmin, async (_req, res) => {
  try {
    const r = await runSubscriptionExpiryReminders(supabase);
    return res.json({ success: true, ...r });
  } catch (error: any) {
    console.error('subscription-reminder run:', error);
    return res.status(500).json({ error: error?.message || 'Failed to run expiry reminders' });
  }
});

router.post('/ops/subscription-reminder/test', verifyAdmin, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
    if (!token) return res.status(401).json({ error: 'No authorization header' });
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user?.id) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    const body = (req.body || {}) as {
      send_email?: boolean;
      send_whatsapp?: boolean;
      test_email?: string;
      test_whatsapp_phone?: string;
    };
    const result = await sendSubscriptionReminderTestToAdmin(supabase, authData.user.id, {
      send_email: body.send_email !== false,
      send_whatsapp: body.send_whatsapp !== false,
      test_email: body.test_email,
      test_whatsapp_phone: body.test_whatsapp_phone,
    });
    return res.json({ success: true, result });
  } catch (error: any) {
    console.error('subscription-reminder test:', error);
    return res.status(500).json({ error: error?.message || 'Test send failed' });
  }
});

router.get('/ops/support-chat/settings', verifyAdmin, async (_req, res) => {
  try {
    const stored = await loadSupportChatStored(supabase);
    const runtime = resolveSupportChatRuntime(stored);
    return res.json({
      success: true,
      settings: toAdminSettingsPayload(stored, runtime),
      effective: {
        help_chat_enabled: runtime.help_chat_enabled,
        training_capture_enabled: runtime.training_capture_enabled,
        ai_configured: runtime.ai_configured,
        whatsapp_e164: runtime.whatsapp_e164,
        provider: runtime.provider,
        openai_model: runtime.openaiModel,
        gemini_model: runtime.geminiModel,
      },
    });
  } catch (error: any) {
    console.error('support-chat settings get:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.patch('/ops/support-chat/settings', verifyAdmin, async (req, res) => {
  try {
    const stored = await loadSupportChatStored(supabase);
    const merged = mergeSupportChatPatch(stored, (req.body || {}) as Record<string, unknown>);
    const { error } = await supabase.from('system_settings').upsert(
      {
        key: SUPPORT_CHAT_SETTINGS_KEY,
        value: merged as any,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    );
    if (error) throw error;
    invalidateSupportChatRuntimeCache();
    const runtime = resolveSupportChatRuntime(merged);
    return res.json({
      success: true,
      settings: toAdminSettingsPayload(merged, runtime),
      effective: {
        help_chat_enabled: runtime.help_chat_enabled,
        training_capture_enabled: runtime.training_capture_enabled,
        ai_configured: runtime.ai_configured,
        whatsapp_e164: runtime.whatsapp_e164,
        provider: runtime.provider,
        openai_model: runtime.openaiModel,
        gemini_model: runtime.geminiModel,
      },
    });
  } catch (error: any) {
    console.error('support-chat settings patch:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/uddoktapay/settings', verifyAdmin, async (_req, res) => {
  try {
    const stored = await loadUddoktaPayStored(supabase);
    const resolved = resolveUddoktaPayCredentials(stored);
    const toggle = resolveUddoktaPayCheckoutToggle(stored);
    return res.json({
      success: true,
      settings: toUddoktaPayAdminSettingsPayload(stored, resolved),
      effective: {
        checkout_ready: Boolean(resolved.apiKey && resolved.baseUrl),
        checkout_offered: isUddoktaPayOfferedAtCheckout(stored, resolved),
        checkout_toggle_locked_by_env: toggle.locked_by_env,
        api_key_from_env: resolved.api_key_from_env,
        base_url_from_env: resolved.base_url_from_env,
      },
    });
  } catch (error: any) {
    console.error('uddoktapay settings get:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.patch('/ops/uddoktapay/settings', verifyAdmin, async (req, res) => {
  try {
    const stored = await loadUddoktaPayStored(supabase);
    const merged = mergeUddoktaPayPatch(stored, (req.body || {}) as Record<string, unknown>);
    const { error } = await supabase.from('system_settings').upsert(
      {
        key: UDDOKTAPAY_SETTINGS_KEY,
        value: merged as any,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    );
    if (error) throw error;
    invalidateUddoktaPayCredentialsCache();
    const resolved = resolveUddoktaPayCredentials(merged);
    const toggle = resolveUddoktaPayCheckoutToggle(merged);
    return res.json({
      success: true,
      settings: toUddoktaPayAdminSettingsPayload(merged, resolved),
      effective: {
        checkout_ready: Boolean(resolved.apiKey && resolved.baseUrl),
        checkout_offered: isUddoktaPayOfferedAtCheckout(merged, resolved),
        checkout_toggle_locked_by_env: toggle.locked_by_env,
        api_key_from_env: resolved.api_key_from_env,
        base_url_from_env: resolved.base_url_from_env,
      },
    });
  } catch (error: any) {
    console.error('uddoktapay settings patch:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/bkash-tokenized/settings', verifyAdmin, async (_req, res) => {
  try {
    const stored = await loadBkashTokenizedStored(supabase);
    const resolved = resolveBkashTokenizedCredentials(stored);
    const toggle = resolveBkashTokenizedCheckoutToggle(stored);
    return res.json({
      success: true,
      settings: toBkashTokenizedAdminSettingsPayload(stored, resolved),
      effective: {
        configured: Boolean(resolved),
        checkout_offered: isBkashTokenizedOfferedAtCheckout(stored, resolved),
        checkout_toggle_locked_by_env: toggle.locked_by_env,
        api_root_from_env: Boolean(resolved?.api_root_from_env),
        app_key_from_env: Boolean(resolved?.app_key_from_env),
      },
    });
  } catch (error: any) {
    console.error('bkash-tokenized settings get:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.patch('/ops/bkash-tokenized/settings', verifyAdmin, async (req, res) => {
  try {
    const stored = await loadBkashTokenizedStored(supabase);
    const merged = mergeBkashTokenizedPatch(stored, (req.body || {}) as Record<string, unknown>);
    const { error } = await supabase.from('system_settings').upsert(
      {
        key: BKASH_TOKENIZED_SETTINGS_KEY,
        value: merged as any,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    );
    if (error) throw error;
    invalidateBkashTokenizedCredentialsCache();
    const resolved = resolveBkashTokenizedCredentials(merged);
    const toggle = resolveBkashTokenizedCheckoutToggle(merged);
    return res.json({
      success: true,
      settings: toBkashTokenizedAdminSettingsPayload(merged, resolved),
      effective: {
        configured: Boolean(resolved),
        checkout_offered: isBkashTokenizedOfferedAtCheckout(merged, resolved),
        checkout_toggle_locked_by_env: toggle.locked_by_env,
        api_root_from_env: Boolean(resolved?.api_root_from_env),
        app_key_from_env: Boolean(resolved?.app_key_from_env),
      },
    });
  } catch (error: any) {
    console.error('bkash-tokenized settings patch:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/support-chat/training', verifyAdmin, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(2000, Number(req.query.limit || 200)));
    const { data: rows, error } = await supabase
      .from('support_chat_training_logs')
      .select('id, created_at, user_id, session_id, role, content, meta')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return res.json({ success: true, rows: rows || [] });
  } catch (error: any) {
    console.error('support-chat training list:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.delete('/ops/support-chat/training', verifyAdmin, async (_req, res) => {
  try {
    const { error } = await supabase
      .from('support_chat_training_logs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
    return res.json({ success: true });
  } catch (error: any) {
    console.error('support-chat training clear:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/activity-logs/purge', verifyAdmin, async (req, res) => {
  try {
    const body = (req.body && typeof req.body === 'object') ? (req.body as Record<string, unknown>) : {};
    const cutoff =
      typeof body.cutoff === 'string' && body.cutoff.trim().length
        ? new Date(body.cutoff).toISOString()
        : new Date().toISOString();

    const { data, error } = await supabase.rpc('admin_purge_activity_logs', {
      p_cutoff: cutoff,
    });
    if (error) throw error;
    return res.json({
      success: true,
      deleted: Number(data || 0),
      cutoff,
    });
  } catch (error: any) {
    console.error('activity-log purge:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

async function enrichRedeemOrderRows(supabase: any, orders: any[]) {
  if (!orders?.length) return orders;
  const ids = orders.map((o: any) => o.id).filter(Boolean);
  const [{ data: uses }, { data: uems }] = await Promise.all([
    supabase.from('redeem_code_uses').select('order_id, redeem_codes(code)').in('order_id', ids),
    supabase
      .from('user_emails')
      .select('order_id, is_active, emails_pool(email)')
      .in('order_id', ids),
  ]);
  const codeByOrder: Record<string, string> = {};
  for (const u of uses || []) {
    const row = u as any;
    const code = row.redeem_codes?.code;
    if (code && row.order_id) codeByOrder[row.order_id] = String(code);
  }
  const emailsByOrder: Record<string, string[]> = {};
  for (const row of uems || []) {
    const r = row as any;
    const em = r.emails_pool?.email;
    if (!r.order_id || !em) continue;
    emailsByOrder[r.order_id] = emailsByOrder[r.order_id] || [];
    emailsByOrder[r.order_id].push(String(em));
  }
  return orders.map((o: any) => ({
    ...o,
    redeem_code_used: codeByOrder[o.id] || null,
    provisioned_emails: emailsByOrder[o.id] || [],
  }));
}

// Pending manual payment after redeem (access may already be completed; payment_status still pending)
router.get('/redeem/pending', verifyAdmin, async (_req, res) => {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id,
        user_id,
        product_id,
        total_amount,
        payment_due_date,
        created_at,
        status,
        payment_status,
        payment_method,
        users: user_id (id, email, name, phone),
        products: product_id (id, title, price)
      `)
      .eq('payment_method', 'redeem_code')
      .eq('payment_status', 'pending')
      .in('status', ['pending', 'completed'])
      .is('redeem_seized_at', null)
      .order('payment_due_date', { ascending: true, nullsFirst: false });
    if (error) throw error;
    const enriched = await enrichRedeemOrderRows(supabase, orders || []);
    return res.json({ success: true, orders: enriched });
  } catch (error: any) {
    console.error('redeem pending list:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

// Revoked / seized redeem orders (audit: user + code + amount preserved on row)
router.get('/redeem/revoked', verifyAdmin, async (_req, res) => {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id,
        user_id,
        product_id,
        total_amount,
        payment_due_date,
        created_at,
        status,
        payment_status,
        redeem_seized_at,
        redeem_seized_by,
        users: user_id (id, email, name, phone),
        products: product_id (id, title, price)
      `)
      .not('redeem_seized_at', 'is', null)
      .order('redeem_seized_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    const enriched = await enrichRedeemOrderRows(supabase, orders || []);
    const adminIds = [...new Set(enriched.map((o: any) => o.redeem_seized_by).filter(Boolean))];
    let adminMap: Record<string, { name: string; email: string }> = {};
    if (adminIds.length) {
      const { data: admins } = await supabase.from('users').select('id, name, email').in('id', adminIds);
      adminMap = Object.fromEntries((admins || []).map((a: any) => [a.id, { name: a.name || '', email: a.email || '' }]));
    }
    const withAdmin = enriched.map((o: any) => ({
      ...o,
      seized_by_admin: o.redeem_seized_by ? adminMap[o.redeem_seized_by] || null : null,
    }));
    return res.json({ success: true, orders: withAdmin });
  } catch (error: any) {
    console.error('redeem revoked list:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

// Seize redeem access: deactivate emails, cancel order, reverse notional revenue (no account ban)
router.post('/redeem/cancel/:orderId', verifyAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId) return res.status(400).json({ error: 'Order ID required' });

    const authHeader = req.headers.authorization;
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim() || '';
    const { data: adminAuth } = await supabase.auth.getUser(token);
    const adminUserId = adminAuth?.user?.id || null;

    const result = await seizeRedeemOrderForUnpaid(supabase, orderId, {
      seizedByUserId: adminUserId,
      source: 'admin',
    });
    if (result.ok === false) {
      const status =
        result.code === 'not_found'
          ? 404
          : result.code === 'admin_user'
            ? 403
            : 400;
      return res.status(status).json({ error: result.error });
    }

    return res.json({
      success: true,
      message: 'Redeem access seized: order cancelled, emails deactivated, amount reversed from records (account not banned).',
    });
  } catch (error: any) {
    console.error('redeem cancel:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

// Restore after seize: ensure not banned, reactivate Adobe emails, new 24h manual-payment window
router.post('/redeem/restore/:orderId', verifyAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId) return res.status(400).json({ error: 'Order ID required' });

    const authHeader = req.headers.authorization;
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim() || '';
    const { data: adminAuth } = await supabase.auth.getUser(token);
    const adminUserId = adminAuth?.user?.id || null;

    const result = await restoreRedeemOrderAfterSeize(supabase, orderId, adminUserId);
    if (result.ok === false) {
      const status =
        result.code === 'not_found'
          ? 404
          : result.code === 'admin_user'
            ? 403
            : 400;
      return res.status(status).json({ error: result.error, code: result.code });
    }

    return res.json({
      success: true,
      message:
        'Access restored: user unbanned, emails reactivated, and a new 24-hour payment window was set. Mark paid when you receive money.',
    });
  } catch (error: any) {
    console.error('redeem restore:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/redeem/mark-paid/:orderId', verifyAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId) return res.status(400).json({ error: 'Order ID required' });

    const { data: before, error: beforeErr } = await supabase
      .from('orders')
      .select('id, user_id, total_amount, payment_method, payment_status, redeem_seized_at, status')
      .eq('id', orderId)
      .single();
    if (beforeErr || !before) return res.status(404).json({ error: 'Order not found' });
    const b = before as any;
    if (b.payment_method !== 'redeem_code' || b.payment_status !== 'pending') {
      return res.status(400).json({ error: 'Not awaiting manual payment for this redeem' });
    }
    if (b.redeem_seized_at) {
      return res.status(400).json({ error: 'This redeem order was seized; restore access first if applicable' });
    }
    if (b.status !== 'pending' && b.status !== 'completed') {
      return res.status(400).json({ error: 'Order is not in a state that can be marked paid for redeem' });
    }

    const { data: updatedRow, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'completed',
        payment_status: 'paid',
        redeem_pending: false,
        payment_due_date: null,
      })
      .eq('id', orderId)
      .eq('payment_method', 'redeem_code')
      .eq('payment_status', 'pending')
      .in('status', ['pending', 'completed'])
      .is('redeem_seized_at', null)
      .select('id')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updatedRow?.id) {
      return res.status(409).json({
        error: 'Could not mark paid (order may have been updated or seized). Refresh and try again.',
      });
    }

    const { data: existingEvt } = await supabase
      .from('payment_events')
      .select('id')
      .eq('order_id', orderId)
      .eq('event_type', 'manual_payment')
      .maybeSingle();
    if (!existingEvt?.id) {
      const { error: paymentError } = await supabase.from('payment_events').insert({
        order_id: orderId,
        user_id: (before as any).user_id,
        event_type: 'manual_payment',
        amount: (before as any).total_amount,
        message: 'Manual payment received for redeem order',
      });
      if (paymentError) console.error('Failed to record payment:', paymentError);
    }

    try {
      await tryProcessReferralRewardsForOrder(supabase, orderId);
    } catch (e) {
      console.error('referral after redeem mark-paid:', e);
    }

    return res.json({ success: true, message: 'Order marked as paid' });
  } catch (error: any) {
    console.error('redeem mark paid:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

export default router;
