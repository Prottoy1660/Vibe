import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Loader2,
  ShoppingBag,
  CheckCircle,
  XCircle,
  RotateCcw,
  Trash2,
  Zap,
  ZapOff,
  Sparkles,
  RefreshCw,
  Info,
  User,
  CreditCard,
  Package,
  Search,
  FileText,
} from 'lucide-react';
import { format } from 'date-fns';
import { getApiBaseUrl } from '../../lib/apiBase';
import { getAccessTokenForApi } from '../../lib/getAccessTokenForApi';
import { toast } from '../../lib/toast';
import { useConfirmDialog } from '../../contexts/ConfirmDialogContext';
import { invoiceEligible } from '../../lib/invoiceModel';
import { shouldPauseAdminLiveRefresh } from '../../lib/adminRealtimeGuard';

interface Order {
  id: string;
  user_id: string;
  product_id: string;
  status: string;
  payment_status: string;
  payment_method: string;
  total_amount: number;
  created_at: string;
  /** bKash tokenized audit (set when payment completes via bKash execute). */
  bkash_payment_id?: string | null;
  bkash_trx_id?: string | null;
  bkash_msisdn?: string | null;
  bkash_gateway_amount?: number | null;
  bkash_refund_trx_id?: string | null;
  redeem_seized_at?: string | null;
  personal_email?: string;
  renewed_from_order_id?: string | null;
  auto_renew?: boolean;
  assigned_admin_id?: string | null;
  internal_admin_note?: string | null;
  manual_access_checklist?: Record<string, boolean> | null;
  delivered_at?: string | null;
  last_manual_alert_at?: string | null;
  last_manual_urgent_alert_at?: string | null;
  reopened_at?: string | null;
  reopened_count?: number | null;
  users?: {
    email: string;
    name: string;
    phone?: string;
  };
  products: {
    title: string;
    is_personal?: boolean;
    duration?: string;
    price?: number;
  };
  user_emails?: { id: string }[];
}

type AdminRecipient = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
};

type ManualChecklist = {
  adobe_access_added: boolean;
  customer_email_checked: boolean;
  plan_duration_verified: boolean;
};

const DEFAULT_MANUAL_CHECKLIST: ManualChecklist = {
  adobe_access_added: false,
  customer_email_checked: false,
  plan_duration_verified: false,
};

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

type FilterKey = 'all' | 'pending' | 'paid' | 'completed' | 'refunded' | 'cancelled' | 'personal_manual';

/** Redeem: access may be completed while cash is still due (manual collection). */
function isRedeemAwaitingManualPayment(o: Order): boolean {
  return (
    o.payment_method === 'redeem_code' &&
    o.payment_status === 'pending' &&
    (o.status === 'pending' || o.status === 'completed') &&
    !o.redeem_seized_at
  );
}

function orderMatchesSearch(o: Order, query: string): boolean {
  const q = query.trim().toLowerCase();
  const compactQ = q.replace(/[#\s-]/g, '');
  if (!q) return true;
  const shortId = o.id.slice(0, 8).toLowerCase();
  const compactOrderId = o.id.toLowerCase().replace(/-/g, '');
  const compactShortId = shortId.replace(/-/g, '');
  const haystack = [
    o.id,
    `#${shortId}`,
    shortId,
    o.users?.email,
    o.users?.name,
    o.users?.phone,
    o.products?.title,
    o.personal_email,
    o.payment_method,
    o.status,
    o.payment_status,
    o.bkash_trx_id,
    o.bkash_payment_id,
    o.bkash_msisdn,
  ]
    .filter(Boolean)
    .map((x) => String(x).toLowerCase());
  return (
    haystack.some((s) => s.includes(q)) ||
    compactOrderId.includes(compactQ) ||
    compactShortId.includes(compactQ)
  );
}

function paymentLabel(method: string, paymentStatus: string) {
  const m = (method || '').toLowerCase().replace(/_/g, ' ');
  const pretty =
    m === 'uddoktapay' || m === 'gateway'
      ? 'Gateway'
      : m === 'bkash tokenized' || m === 'bkash_tokenized'
        ? 'bKash (tokenized)'
        : m === 'wallet+bkash tokenized' || m === 'wallet+bkash_tokenized' || m === 'wallet + bkash tokenized'
          ? 'Wallet + bKash'
          : m === 'wallet+gateway' || m === 'wallet + gateway'
            ? 'Wallet + gateway'
            : m === 'wallet'
              ? 'Wallet'
              : m === 'coupon'
                ? 'Coupon'
                : m === 'redeem code' || m === 'redeem_code'
                  ? 'Redeem'
                  : m || 'Unknown';
  const ps = (paymentStatus || '').replace(/_/g, ' ');
  return { pretty, status: ps };
}

function normalizeChecklist(value: Record<string, boolean> | null | undefined): ManualChecklist {
  return {
    adobe_access_added: value?.adobe_access_added === true,
    customer_email_checked: value?.customer_email_checked === true,
    plan_duration_verified: value?.plan_duration_verified === true,
  };
}

function buildPersonalActivationSms(order: Order): string {
  const MAX_SMS_LENGTH = 160;
  const customerName = String(order.users?.name || '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .trim()
    .slice(0, 24) || 'Customer';
  const productTitle = String(order.products?.title || 'subscription')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  const shortTitle = productTitle.length > 18 ? `${productTitle.slice(0, 18)}...` : productTitle;
  const raw = `Dear ${customerName}, your ${shortTitle} is now active. Login and check. Help 01623638558. - Vibe Access`;
  return raw.length > MAX_SMS_LENGTH ? raw.slice(0, MAX_SMS_LENGTH) : raw;
}

function isPendingManualPersonalOrder(order: Order) {
  return order.products?.is_personal && order.payment_status === 'paid' && order.status === 'pending';
}

function formatEtaLabel(totalMinutes: number) {
  if (totalMinutes % (24 * 60) === 0) {
    const days = Math.max(1, Math.round(totalMinutes / (24 * 60)));
    return `Usually within ${days} day${days === 1 ? '' : 's'}`;
  }
  if (totalMinutes % 60 === 0) {
    const hours = Math.max(1, Math.round(totalMinutes / 60));
    return `Usually within ${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return `Usually within ${totalMinutes} minutes`;
}

function getPersonalPriority(order: Order, etaMinutes: number) {
  if (!isPendingManualPersonalOrder(order)) return null;
  const ageMinutes = Math.max(0, Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000));
  if (ageMinutes >= Math.max(60, etaMinutes + 30)) {
    return { label: 'Urgent', tone: 'urgent', ageMinutes };
  }
  if (ageMinutes >= etaMinutes) {
    return { label: 'Delayed', tone: 'delayed', ageMinutes };
  }
  return { label: 'Normal', tone: 'normal', ageMinutes };
}

export const AdminOrders = () => {
  const { confirm } = useConfirmDialog();
  const [rawOrders, setRawOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [assigningBulk, setAssigningBulk] = useState(false);
  const [assigningSingle, setAssigningSingle] = useState<string | null>(null);
  const [renewingOrderId, setRenewingOrderId] = useState<string | null>(null);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [currentAdminId, setCurrentAdminId] = useState('');
  const [adminRecipients, setAdminRecipients] = useState<AdminRecipient[]>([]);
  const [personalEtaMinutes, setPersonalEtaMinutes] = useState(30);
  const [overdueReminding, setOverdueReminding] = useState(false);
  const [opsModalOrder, setOpsModalOrder] = useState<Order | null>(null);
  const [opsModalMode, setOpsModalMode] = useState<'edit' | 'deliver'>('edit');
  const [opsSaving, setOpsSaving] = useState(false);
  const [opsAssignedAdminId, setOpsAssignedAdminId] = useState('');
  const [opsNote, setOpsNote] = useState('');
  const [opsChecklist, setOpsChecklist] = useState<ManualChecklist>(DEFAULT_MANUAL_CHECKLIST);

  useEffect(() => {
    fetchOrders();
    void loadPersonalOpsMeta();
  }, []);

  const loadPersonalOpsMeta = async () => {
    try {
      const [{ data: auth }, { data: settingsRow }, token] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('system_settings').select('value').eq('key', 'personal_subscriptions').maybeSingle(),
        getAccessTokenForApi(),
      ]);
      setCurrentAdminId(auth.user?.id || '');

      const eta = Number((settingsRow?.value as any)?.delivery_eta_minutes || 30);
      if (Number.isFinite(eta)) {
        setPersonalEtaMinutes(Math.min(7 * 24 * 60, Math.max(15, Math.floor(eta))));
      }

      const base = getApiBaseUrl();
      if (token && base) {
        const res = await fetch(`${base}/api/admin/ops/personal-order-alerts`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json?.success && Array.isArray(json.admins)) {
          setAdminRecipients(json.admins);
        }
      }
    } catch (error) {
      console.warn('Failed to load personal order ops meta:', error);
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const token = await getAccessTokenForApi();
      const base = getApiBaseUrl();
      if (token && base) {
        const res = await fetch(`${base}/api/admin/orders/query?limit=5000`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.success && Array.isArray(json.orders)) {
          const rows = json.orders as Order[];
          setRawOrders(rows);
          return;
        }
        if (!res.ok) {
          throw new Error(json.error || `Orders API failed (${res.status})`);
        }
      }

      const { data, error } = await supabase
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
        .limit(5000);

      if (error) throw error;
      const rows = (data as unknown as Order[]) || [];
      setRawOrders(rows);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to load orders. Check API URL, login, and server logs.');
    } finally {
      setLoading(false);
    }
  };

  // Realtime: auto-refresh orders list without manual refresh.
  const rtTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const schedule = () => {
      if (shouldPauseAdminLiveRefresh()) return;
      if (rtTimerRef.current) window.clearTimeout(rtTimerRef.current);
      rtTimerRef.current = window.setTimeout(() => {
        if (shouldPauseAdminLiveRefresh()) return;
        void fetchOrders();
      }, 850);
    };

    const channel = supabase
      .channel('admin_orders_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => schedule())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_emails' }, () => schedule())
      .subscribe();

    return () => {
      if (rtTimerRef.current) window.clearTimeout(rtTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, []);

  const stats = useMemo(() => {
    const o = rawOrders;
    return {
      total: o.length,
      pending: o.filter((x) => x.status === 'pending' || isRedeemAwaitingManualPayment(x)).length,
      paid: o.filter((x) => x.payment_status === 'paid').length,
      completed: o.filter((x) => x.status === 'completed').length,
      refunded: o.filter((x) => x.status === 'refunded').length,
      cancelled: o.filter((x) => x.status === 'cancelled').length,
      personal_manual: o.filter((x) => isPendingManualPersonalOrder(x)).length,
    };
  }, [rawOrders]);

  const adminNameMap = useMemo(() => {
    return new Map(adminRecipients.map((admin) => [admin.id, admin.name || admin.email || admin.id]));
  }, [adminRecipients]);

  const personalSummary = useMemo(() => {
    const personalOrders = rawOrders.filter((order) => order.products?.is_personal);
    const todayKey = new Date().toDateString();
    const todayIncoming = personalOrders.filter((order) => new Date(order.created_at).toDateString() === todayKey).length;
    const deliveredToday = personalOrders.filter(
      (order) => order.delivered_at && new Date(order.delivered_at).toDateString() === todayKey,
    ).length;
    const pendingManual = personalOrders.filter((order) => isPendingManualPersonalOrder(order)).length;
    const avgSource = personalOrders
      .filter((order) => order.delivered_at)
      .map((order) => {
        const ms = new Date(order.delivered_at as string).getTime() - new Date(order.created_at).getTime();
        return ms > 0 ? Math.round(ms / 60000) : 0;
      })
      .filter((minutes) => minutes > 0);
    const avgMinutes = avgSource.length ? Math.round(avgSource.reduce((sum, value) => sum + value, 0) / avgSource.length) : 0;
    return {
      todayIncoming,
      deliveredToday,
      pendingManual,
      avgMinutes,
    };
  }, [rawOrders]);

  const unfulfilledCount = useMemo(() => {
    return rawOrders.filter(o => 
      (o.status === 'paid' || o.status === 'completed') && 
      !o.products?.is_personal && 
      (!o.user_emails || o.user_emails.length === 0)
    ).length;
  }, [rawOrders]);

  const orders = useMemo(() => {
    if (filter === 'all') return rawOrders;
    if (filter === 'pending') {
      return rawOrders.filter((o) => o.status === 'pending' || isRedeemAwaitingManualPayment(o));
    }
    if (filter === 'personal_manual') {
      return rawOrders.filter((o) => isPendingManualPersonalOrder(o));
    }
    if (filter === 'paid') {
      return rawOrders.filter((o) => o.payment_status === 'paid');
    }
    return rawOrders.filter((o) => o.status === filter);
  }, [rawOrders, filter]);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => orderMatchesSearch(o, orderSearchQuery));
  }, [orders, orderSearchQuery]);

  const updateOrderStatus = async (id: string, newStatus: string, userId?: string, isPersonal?: boolean) => {
    try {
      if (newStatus === 'completed' && isPersonal) {
        const row = rawOrders.find((item) => item.id === id);
        if (row) {
          openPersonalOpsModal(row, 'deliver');
          return;
        }
      }

      const updates: any = { status: newStatus };

      if (newStatus === 'completed') {
        updates.payment_status = 'paid';
      }

      const { error } = await supabase.from('orders').update(updates).eq('id', id);

      if (error) throw error;

      if (newStatus === 'completed' && userId && !isPersonal) {
        try {
          const token = await getAccessTokenForApi();
          if (!token) throw new Error('Session expired. Please sign in again.');
          const API_URL = getApiBaseUrl();

          const res = await fetch(`${API_URL}/api/payment/assign-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ order_id: id }),
          });

          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.message || 'Failed to auto-assign email');
          }
        } catch (emailError) {
          console.error('Failed to auto-assign email during manual approval:', emailError);
        }
      }

      fetchOrders();
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Failed to update order status');
    }
  };

  const openPersonalOpsModal = (order: Order, mode: 'edit' | 'deliver') => {
    setOpsModalOrder(order);
    setOpsModalMode(mode);
    setOpsAssignedAdminId(order.assigned_admin_id || currentAdminId || '');
    setOpsNote(order.internal_admin_note || '');
    setOpsChecklist(normalizeChecklist(order.manual_access_checklist));
  };

  const closePersonalOpsModal = () => {
    if (opsSaving) return;
    setOpsModalOrder(null);
    setOpsModalMode('edit');
    setOpsAssignedAdminId('');
    setOpsNote('');
    setOpsChecklist(DEFAULT_MANUAL_CHECKLIST);
  };

  const savePersonalOps = async (action: 'save' | 'deliver' | 'reopen') => {
    if (!opsModalOrder) return;
    if (
      action === 'deliver' &&
      (!opsChecklist.adobe_access_added || !opsChecklist.customer_email_checked || !opsChecklist.plan_duration_verified)
    ) {
      toast.warning('Complete the manual access checklist before marking access ready.');
      return;
    }

    setOpsSaving(true);
    try {
      const updates: Record<string, unknown> = {
        assigned_admin_id: opsAssignedAdminId || null,
        internal_admin_note: opsNote.trim() || null,
        manual_access_checklist: opsChecklist,
      };

      if (action === 'deliver') {
        updates.status = 'completed';
        updates.payment_status = 'paid';
        updates.delivered_at = new Date().toISOString();
      }

      if (action === 'reopen') {
        updates.status = 'pending';
        updates.payment_status = 'paid';
        updates.delivered_at = null;
        updates.reopened_at = new Date().toISOString();
        updates.reopened_count = (opsModalOrder.reopened_count || 0) + 1;
      }

      const { error } = await supabase.from('orders').update(updates).eq('id', opsModalOrder.id);
      if (error) throw error;

      // Personal delivery confirmation SMS (best-effort: order status update should not be blocked by SMS failures).
      if (action === 'deliver') {
        const phone = String(opsModalOrder.users?.phone || '').trim();
        if (phone) {
          try {
            const token = await getAccessTokenForApi();
            if (token) {
              const API_URL = getApiBaseUrl();
              const res = await fetch(`${API_URL}/api/admin/sms/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                  msg: buildPersonalActivationSms(opsModalOrder),
                  to: [phone],
                  recipient_mode: 'selected_users',
                }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok || data?.success !== true) {
                throw new Error(data?.error || 'SMS send failed');
              }
            }
          } catch (smsError: any) {
            console.error('personal delivery sms error:', smsError);
            toast.warning(`Access delivered, but SMS failed: ${smsError?.message || 'Unknown error'}`);
          }
        } else {
          toast.warning('Access delivered, but customer has no phone number for SMS.');
        }
      }

      toast.success(
        action === 'deliver'
          ? 'Personal access marked as ready.'
          : action === 'reopen'
            ? 'Personal order moved back to pending.'
            : 'Personal order notes updated.',
      );
      closePersonalOpsModal();
      fetchOrders();
    } catch (error) {
      console.error('save personal ops error:', error);
      toast.error('Failed to update personal order.');
    } finally {
      setOpsSaving(false);
    }
  };

  const handleSendOverdueReminders = async () => {
    setOverdueReminding(true);
    try {
      const token = await getAccessTokenForApi();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const API_URL = getApiBaseUrl();
      const res = await fetch(`${API_URL}/api/admin/ops/personal-order-overdue-alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ force_all: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to send reminders');
      const result = data.result || {};
      toast.success(
        `Reminder sent. Overdue: ${Number(result.overdue || 0)} · Urgent: ${Number(result.urgent || 0)}`,
      );
      fetchOrders();
    } catch (error: any) {
      console.error('overdue reminder error:', error);
      toast.error(error?.message || 'Failed to send overdue reminders.');
    } finally {
      setOverdueReminding(false);
    }
  };

  const handleBulkAssign = async () => {
    const okBulk = await confirm({
      title: 'Bulk-assign emails to unfulfilled orders?',
      description: 'Matching pool emails will be assigned to all unfulfilled paid orders.',
      confirmLabel: 'Run bulk assign',
    });
    if (!okBulk) return;
    setAssigningBulk(true);
    try {
      const token = await getAccessTokenForApi();
      if (!token) {
        toast.error('Session expired. Please sign in again.');
        return;
      }
      const API_URL = getApiBaseUrl();
      const res = await fetch(`${API_URL}/api/payment/bulk-assign-emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        fetchOrders();
      } else {
        toast.error(data.message || 'Failed to bulk assign emails.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Server error during bulk assign.');
    } finally {
      setAssigningBulk(false);
    }
  };

  const handleSingleAssign = async (orderId: string) => {
    setAssigningSingle(orderId);
    try {
      const token = await getAccessTokenForApi();
      if (!token) {
        toast.error('Session expired. Please sign in again.');
        return;
      }
      const API_URL = getApiBaseUrl();
      const res = await fetch(`${API_URL}/api/payment/assign-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ order_id: orderId })
      });
      const data = await res.json();
      if (data.success) {
        await supabase.from('orders').update({ status: 'completed' }).eq('id', orderId);
        fetchOrders();
      } else {
        toast.error(data.message || 'Failed to assign email.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Server error during assign.');
    } finally {
      setAssigningSingle(null);
    }
  };

  const handleAdminRenew = async (oldOrderId: string) => {
    const ok = await confirm({
      title: 'Admin renew this order?',
      description: 'Creates a renewed order and provisions fresh access.',
      confirmLabel: 'Renew',
    });
    if (!ok) return;
    setRenewingOrderId(oldOrderId);
    try {
      const token = await getAccessTokenForApi();
      if (!token) {
        toast.error('Session expired. Please sign in again.');
        return;
      }
      const API_URL = getApiBaseUrl();

      const res = await fetch(`${API_URL}/api/admin/orders/${oldOrderId}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ charge_wallet: true, preserve_auto_renew: true }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Renew failed');
      }

      toast.success('Order renewed successfully.');
      fetchOrders();
    } catch (err: any) {
      console.error('Admin renew error:', err);
      toast.error(err?.message || 'Failed to renew order');
    } finally {
      setRenewingOrderId(null);
    }
  };

  const handleRefund = async (orderId: string) => {
    const row = rawOrders.find((o) => o.id === orderId);
    const isBkash = Boolean(row && String(row.payment_method || '').includes('bkash'));
    const ok = await confirm({
      title: 'Refund this order?',
      description: isBkash
        ? 'Calls bKash Refund API for the gateway amount, then revokes email access where applicable. Only admins can do this; credentials stay on the server.'
        : "This will revoke the user's email access where applicable.",
      confirmLabel: 'Refund',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const token = await getAccessTokenForApi();
      if (!token) {
        toast.error('Session expired. Please sign in again.');
        return;
      }
      const API_URL = getApiBaseUrl();
      const res = await fetch(`${API_URL}/api/admin/orders/${orderId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: 'Admin refund' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Refund failed');
      }

      toast.success(typeof data.message === 'string' ? data.message : 'Refund completed.');
      fetchOrders();
    } catch (error) {
      console.error('Error processing refund:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to process refund');
    }
  };

  const handleDeleteAllPending = async () => {
    const ok = await confirm({
      title: 'Delete every pending order?',
      description: 'This cannot be undone.',
      confirmLabel: 'Delete all pending',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      setLoading(true);
      const token = await getAccessTokenForApi();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const API_URL = getApiBaseUrl();
      const res = await fetch(`${API_URL}/api/admin/orders/delete-pending`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to delete pending orders');
      }

      toast.success('All pending orders removed.');
      fetchOrders();
    } catch (error) {
      console.error('Error deleting pending orders:', error);
      toast.error('Failed to delete pending orders');
      setLoading(false);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    const ok = await confirm({
      title: 'Permanently delete this order?',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const token = await getAccessTokenForApi();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const API_URL = getApiBaseUrl();
      const res = await fetch(`${API_URL}/api/admin/orders/${orderId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to delete order');

      fetchOrders();
    } catch (error) {
      console.error('Error deleting order:', error);
      toast.error('Failed to delete order');
    }
  };

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: stats.total },
    { key: 'pending', label: 'Pending', count: stats.pending },
    { key: 'personal_manual', label: 'Personal manual', count: stats.personal_manual },
    { key: 'paid', label: 'Paid', count: stats.paid },
    { key: 'completed', label: 'Completed', count: stats.completed },
    { key: 'refunded', label: 'Refunded', count: stats.refunded },
    { key: 'cancelled', label: 'Cancelled', count: stats.cancelled },
  ];

  const money = (n: number) => `BDT ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col gap-4 min-w-0 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="shrink-0 rounded-xl bg-indigo-500/15 p-2.5 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 md:text-2xl">Order management</h2>
              <p className="mt-1 max-w-2xl text-sm leading-snug text-gray-600 dark:text-gray-400">
                Last 200 orders · <strong className="font-medium text-gray-800 dark:text-gray-200">Pending</strong> = gateway approval or redeem
                manual pay · <strong className="font-medium text-gray-800 dark:text-gray-200">BDT</strong>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
            <button
              type="button"
              onClick={handleBulkAssign}
              disabled={loading || assigningBulk || unfulfilledCount === 0}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-transparent px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all active:scale-[0.98] disabled:opacity-50 sm:px-4 sm:text-sm ${
                unfulfilledCount > 0
                  ? 'bg-orange-500 shadow-[0_0_15px_-3px_rgba(249,115,22,0.4)] animate-pulse hover:bg-orange-600'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {assigningBulk ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Sparkles className="h-4 w-4 shrink-0" />}
              Fulfill Missing
              {unfulfilledCount > 0 && (
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold tabular-nums text-white">
                  {unfulfilledCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => fetchOrders()}
              disabled={loading}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition-all hover:bg-white/60 disabled:opacity-50 dark:border-[#303038] dark:text-gray-200 dark:hover:bg-white/5 sm:text-sm"
            >
              <RefreshCw className={`h-4 w-4 shrink-0 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleSendOverdueReminders}
              disabled={overdueReminding || personalSummary.pendingManual === 0}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20 sm:text-sm"
            >
              {overdueReminding ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <RefreshCw className="h-4 w-4 shrink-0" />}
              Send overdue reminders
            </button>
            {stats.pending > 0 && (
              <button
                type="button"
                onClick={handleDeleteAllPending}
                disabled={loading}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100/80 disabled:opacity-50 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20 sm:text-sm"
              >
                <Trash2 className="h-4 w-4 shrink-0" />
                Clear pending
              </button>
            )}
          </div>
        </div>

        <div className="relative mt-6 flex flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
          {filters.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
                  active
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                    : 'bg-white/70 dark:bg-white/5 text-gray-700 dark:text-gray-300 border border-gray-200/80 dark:border-[#303038] hover:border-indigo-300 dark:hover:border-indigo-500/30'
                }`}
              >
                {f.label}
                <span
                  className={`text-[11px] tabular-nums px-1.5 py-0.5 rounded-md ${
                    active ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {f.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm dark:border-[#303038] dark:bg-[#111113]">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Today incoming</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{personalSummary.todayIncoming}</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm dark:border-[#303038] dark:bg-[#111113]">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Pending manual</p>
            <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-300">{personalSummary.pendingManual}</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm dark:border-[#303038] dark:bg-[#111113]">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Delivered today</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">{personalSummary.deliveredToday}</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm dark:border-[#303038] dark:bg-[#111113]">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Avg delivery</p>
            <p className="mt-1 text-2xl font-bold text-indigo-700 dark:text-indigo-300">
              {personalSummary.avgMinutes > 0 ? formatEtaLabel(personalSummary.avgMinutes).replace('Usually within ', '') : '—'}
            </p>
          </div>
        </div>

        <div className="relative mt-5 max-w-xl">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            aria-hidden
          />
          <input
            type="search"
            value={orderSearchQuery}
            onChange={(e) => setOrderSearchQuery(e.target.value)}
            placeholder="Search email, name, phone, order ID, product…"
            aria-label="Search orders"
            className="w-full min-h-[42px] pl-10 pr-10 py-2.5 text-sm rounded-xl border border-gray-200/90 dark:border-[#303038] bg-white/90 dark:bg-[#111113] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/40"
          />
          {orderSearchQuery.trim() ? (
            <button
              type="button"
              onClick={() => setOrderSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 dark:text-gray-400"
            >
              Clear
            </button>
          ) : null}
        </div>
        {orderSearchQuery.trim() && orders.length > 0 ? (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Showing <span className="font-semibold text-gray-800 dark:text-gray-200">{filteredOrders.length}</span> of{' '}
            {orders.length} in this filter
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] overflow-hidden shadow-sm dark:shadow-none">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/5 flex items-center gap-2">
          <Info className="w-4 h-4 text-indigo-500 shrink-0" />
          <p className="text-xs text-gray-600 dark:text-gray-400">
            <strong className="font-medium text-gray-800 dark:text-gray-200">Pending:</strong> gateway approvals assign a
            pool email when possible; redeem rows with “manual pay due” are settled from{' '}
            <strong className="font-medium text-gray-800 dark:text-gray-200">Redeem → Pending payment</strong>.{' '}
            <strong className="font-medium text-gray-800 dark:text-gray-200">Refund:</strong> releases linked pool emails.
          </p>
        </div>

        {loading && rawOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-3" />
            <p className="text-sm text-gray-500">Loading orders…</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-[#26262d] bg-gray-50/50 dark:bg-white/[0.03]">
                  <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Order</th>
                  <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Payment</th>
                  <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Renew</th>
                  <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right sticky right-0 z-20 bg-gray-50/95 dark:bg-[#1a1a1f]/95">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const pay = paymentLabel(order.payment_method, order.payment_status);
                  const shortOrderId = order.id.slice(0, 8).toUpperCase();
                  const durationMonths = durationToMonths(order.products?.duration);
                  const priority = getPersonalPriority(order, personalEtaMinutes);
                  const assignedAdminLabel = order.assigned_admin_id ? adminNameMap.get(order.assigned_admin_id) : '';
                  const exp = new Date(order.created_at);
                  exp.setMonth(exp.getMonth() + durationMonths);
                  const daysLeft = Math.ceil((exp.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
                  const isExpired = daysLeft <= 0;
                  return (
                    <tr
                      key={order.id}
                      className={`border-b border-gray-100 dark:border-[#26262d] hover:bg-gray-50/60 dark:hover:bg-white/[0.02] align-middle ${
                        priority?.tone === 'urgent'
                          ? 'bg-red-50/50 dark:bg-red-500/5'
                          : priority?.tone === 'delayed'
                            ? 'bg-amber-50/50 dark:bg-amber-500/5'
                            : ''
                      }`}
                    >
                      <td className="py-4 px-4 max-w-[220px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Package className="w-4 h-4 text-gray-400 shrink-0" />
                          <span
                            className="block max-w-[170px] truncate font-semibold text-gray-900 dark:text-gray-100"
                            title={order.products?.title || 'Unknown product'}
                          >
                            {order.products?.title || 'Unknown product'}
                          </span>
                          {order.products?.is_personal && (
                            <span className="px-1.5 py-0.5 bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300 text-[10px] rounded-md font-bold uppercase tracking-wide">
                              Personal
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-mono font-semibold text-indigo-700 dark:text-indigo-300 mt-1" title={order.id}>
                          #{shortOrderId}
                        </p>
                        <p className="text-[11px] font-mono text-gray-500 dark:text-gray-400 mt-0.5 truncate" title={order.id}>
                          {order.id}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                          {format(new Date(order.created_at), 'MMM d, yyyy · HH:mm')}
                        </p>
                        <p className="text-[11px] mt-1 text-gray-600 dark:text-gray-300">
                          Expires: {format(exp, 'MMM d, yyyy')} ·{' '}
                          <span className={isExpired ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-emerald-700 dark:text-emerald-300 font-semibold'}>
                            {isExpired ? 'Expired' : `${daysLeft} days left`}
                          </span>
                        </p>
                        {order.renewed_from_order_id ? (
                          <p className="text-[11px] mt-1 text-indigo-700 dark:text-indigo-300">
                            Renewed from: <span className="font-mono">{order.renewed_from_order_id}</span>
                          </p>
                        ) : null}
                        {order.personal_email ? (
                          <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-2 leading-snug">
                            <span className="font-medium text-gray-600 dark:text-gray-400">Requested email: </span>
                            {order.personal_email}
                          </p>
                        ) : null}
                        {assignedAdminLabel ? (
                          <p className="text-[11px] mt-1 text-gray-500 dark:text-gray-400">
                            Assigned admin: <span className="font-medium text-gray-700 dark:text-gray-200">{assignedAdminLabel}</span>
                          </p>
                        ) : null}
                        {order.delivered_at ? (
                          <p className="text-[11px] mt-1 text-emerald-700 dark:text-emerald-300">
                            Delivered: {format(new Date(order.delivered_at), 'MMM d, yyyy · HH:mm')}
                          </p>
                        ) : null}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-start gap-2">
                          <User className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-[180px]">
                              {order.users?.name || 'Unknown'}
                            </p>
                            <p className="text-xs text-gray-500 truncate max-w-[200px]" title={order.users?.email}>
                              {order.users?.email}
                            </p>
                            {order.users?.phone ? (
                              <p className="text-xs text-gray-500 mt-0.5">{order.users.phone}</p>
                            ) : null}
                            {order.internal_admin_note ? (
                              <p className="mt-2 rounded-lg bg-gray-100 px-2.5 py-1.5 text-[11px] leading-relaxed text-gray-600 dark:bg-white/5 dark:text-gray-300">
                                {order.internal_admin_note}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 min-w-[220px]">
                        <div className="flex items-start gap-2">
                          <CreditCard className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                              {money(Number(order.total_amount))}
                            </p>
                            <p className="mt-0.5 max-w-[190px] truncate text-xs capitalize text-gray-500" title={`${pay.pretty} · ${pay.status}`}>
                              {pay.pretty} · {pay.status}
                            </p>
                            {String(order.payment_method || '').includes('bkash') &&
                            (order.bkash_trx_id ||
                              order.bkash_msisdn ||
                              order.bkash_payment_id ||
                              order.bkash_refund_trx_id) ? (
                              <div className="mt-1.5 space-y-0.5 text-[10px] text-gray-600 dark:text-gray-400 font-mono leading-snug">
                                {order.bkash_msisdn ? <p title="Wallet used for bKash">bKash: {order.bkash_msisdn}</p> : null}
                                {order.bkash_trx_id ? <p title="bKash transaction id">Trx: {order.bkash_trx_id}</p> : null}
                                {order.bkash_payment_id ? (
                                  <p className="truncate max-w-[200px]" title="bKash payment id">
                                    PayID: {order.bkash_payment_id}
                                  </p>
                                ) : null}
                                {order.bkash_refund_trx_id ? (
                                  <p className="text-emerald-700 dark:text-emerald-400">Refund trx: {order.bkash_refund_trx_id}</p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] uppercase font-bold tracking-wide ${
                            order.auto_renew
                              ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300'
                              : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400'
                          }`}
                        >
                          {order.auto_renew ? <Zap className="w-3 h-3" /> : <ZapOff className="w-3 h-3" />}
                          {order.auto_renew ? 'Auto on' : 'Auto off'}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-col gap-1 items-start">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium capitalize ${
                              order.status === 'completed'
                                ? 'bg-green-100 dark:bg-emerald-500/15 text-green-800 dark:text-emerald-300'
                                : order.status === 'paid'
                                  ? 'bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300'
                                  : order.status === 'pending'
                                    ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200'
                                    : order.status === 'cancelled'
                                      ? 'bg-red-100 dark:bg-red-500/15 text-red-800 dark:text-red-300'
                                      : order.status === 'refunded'
                                        ? 'bg-gray-200 dark:bg-white/10 text-gray-800 dark:text-gray-200'
                                        : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {order.status}
                          </span>
                          {isRedeemAwaitingManualPayment(order) ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
                              Manual pay due
                            </span>
                          ) : null}
                          {priority ? (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${
                                priority.tone === 'urgent'
                                  ? 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200'
                                  : priority.tone === 'delayed'
                                    ? 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200'
                                    : 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200'
                              }`}
                            >
                              {priority.label}
                            </span>
                          ) : null}
                          {order.reopened_count ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300">
                              Reopened {order.reopened_count}x
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-right sticky right-0 z-10 bg-white/95 dark:bg-[#151518]/95 backdrop-blur-sm">
                        <div className="flex flex-col items-end gap-1.5">
                          {order.status === 'pending' && (
                            <div className="flex flex-wrap justify-end gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  updateOrderStatus(
                                    order.id,
                                    'completed',
                                    order.user_id,
                                    order.products?.is_personal
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20"
                              >
                                <CheckCircle className="w-3.5 h-3.5" /> {order.products?.is_personal ? 'Access given' : 'Approve'}
                              </button>
                              <button
                                type="button"
                                onClick={() => updateOrderStatus(order.id, 'cancelled')}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20"
                              >
                                <XCircle className="w-3.5 h-3.5" /> Reject
                              </button>
                            </div>
                          )}
                          <div className="flex flex-wrap justify-end gap-1">
                            {invoiceEligible(order) && (
                              <button
                                type="button"
                                onClick={() => window.open(`/invoices/${order.id}`, '_blank', 'noopener,noreferrer')}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 border border-slate-200/80 dark:border-white/10"
                                title="Open invoice (print / Save as PDF)"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                Invoice
                              </button>
                            )}
                            {order.products?.is_personal && (
                              <button
                                type="button"
                                onClick={() => openPersonalOpsModal(order, 'edit')}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-500/10 hover:bg-violet-100 dark:hover:bg-violet-500/20"
                              >
                                <Info className="w-3.5 h-3.5" /> Ops
                              </button>
                            )}
                            {order.status === 'paid' && !order.products?.is_personal && (
                              <button
                                type="button"
                                onClick={() => handleSingleAssign(order.id)}
                                disabled={assigningSingle === order.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-all active:scale-95"
                                title="Attempt to assign an email to this user"
                              >
                                {assigningSingle === order.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                Assign
                              </button>
                            )}
                            {(order.status === 'completed' || order.status === 'paid') && (
                              <button
                                type="button"
                                onClick={() => handleAdminRenew(order.id)}
                                disabled={
                                  renewingOrderId === order.id ||
                                  (order.products?.is_personal ? false : !isExpired)
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 disabled:opacity-50"
                                title={order.products?.is_personal ? 'Renew this order' : isExpired ? 'Renew this order' : 'Renew after expiration'}
                              >
                                {renewingOrderId === order.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <RotateCcw className="w-3.5 h-3.5" />
                                )}
                                Renew
                              </button>
                            )}
                            {(order.status === 'completed' || order.status === 'paid') && (
                              <button
                                type="button"
                                onClick={() => handleRefund(order.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10 hover:bg-orange-100 dark:hover:bg-orange-500/20"
                              >
                                <RotateCcw className="w-3.5 h-3.5" /> Refund
                              </button>
                            )}
                            {order.products?.is_personal && order.status === 'completed' && (
                              <button
                                type="button"
                                onClick={() => openPersonalOpsModal(order, 'edit')}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20"
                              >
                                <RotateCcw className="w-3.5 h-3.5" /> Reopen
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteOrder(order.id)}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 border border-gray-200 dark:border-[#303038]"
                              title="Delete order"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {orders.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-gray-500 dark:text-gray-400">
                      <ShoppingBag className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                      <p className="font-medium text-gray-700 dark:text-gray-300">
                        {filter === 'all'
                          ? 'No orders found in loaded history.'
                          : filter === 'pending'
                            ? 'No pending gateway orders or redeem orders awaiting manual payment.'
                            : `No orders with status “${filter}”.`}
                      </p>
                      <p className="text-sm mt-1">Try another filter or refresh.</p>
                    </td>
                  </tr>
                )}
                {orders.length > 0 && filteredOrders.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-gray-500 dark:text-gray-400">
                      <Search className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600 opacity-80" />
                      <p className="font-medium text-gray-700 dark:text-gray-300">No orders match your search.</p>
                      <p className="text-sm mt-1 max-w-md mx-auto">
                        Try another email fragment, name, or order ID—or{' '}
                        <button
                          type="button"
                          onClick={() => setOrderSearchQuery('')}
                          className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
                        >
                          clear search
                        </button>
                        .
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {opsModalOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-[#303038] dark:bg-[#151518]">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-[#26262d]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300">Personal order ops</p>
                <h3 className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">
                  {opsModalOrder.products?.title || 'Personal order'}
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  #{opsModalOrder.id.slice(0, 8).toUpperCase()} · {formatEtaLabel(personalEtaMinutes)}
                </p>
              </div>
              <button
                type="button"
                onClick={closePersonalOpsModal}
                className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-[#303038] dark:text-gray-300 dark:hover:bg-white/5"
              >
                Close
              </button>
            </div>

            <div className="space-y-5 px-5 py-5">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-[#26262d] dark:bg-white/[0.03]">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Customer</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {opsModalOrder.users?.name || 'Unknown'}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{opsModalOrder.users?.email || '—'}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{opsModalOrder.users?.phone || '—'}</p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-[#26262d] dark:bg-white/[0.03]">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Adobe access email</p>
                  <p className="mt-1 text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                    {opsModalOrder.personal_email || '—'}
                  </p>
                  <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                    Ordered {format(new Date(opsModalOrder.created_at), 'MMM d, yyyy · HH:mm')}
                  </p>
                  {opsModalOrder.delivered_at ? (
                    <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                      Delivered {format(new Date(opsModalOrder.delivered_at), 'MMM d, yyyy · HH:mm')}
                    </p>
                  ) : null}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Manual access checklist</p>
                <div className="mt-3 grid gap-2">
                  {[
                    ['adobe_access_added', 'Adobe access added'],
                    ['customer_email_checked', 'Customer email checked'],
                    ['plan_duration_verified', 'Plan duration verified'],
                  ].map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-3 text-sm text-gray-700 dark:border-[#303038] dark:text-gray-200"
                    >
                      <input
                        type="checkbox"
                        checked={opsChecklist[key as keyof ManualChecklist]}
                        onChange={() =>
                          setOpsChecklist((current) => ({
                            ...current,
                            [key]: !current[key as keyof ManualChecklist],
                          }))
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100">Assigned admin</label>
                  <select
                    value={opsAssignedAdminId}
                    onChange={(e) => setOpsAssignedAdminId(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 dark:border-[#303038] dark:bg-[#111113] dark:text-gray-100"
                  >
                    <option value="">Unassigned</option>
                    {adminRecipients.map((admin) => (
                      <option key={admin.id} value={admin.id}>
                        {admin.name || admin.email || admin.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100">Priority</label>
                  <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 dark:border-[#303038] dark:bg-[#111113] dark:text-gray-200">
                    {getPersonalPriority(opsModalOrder, personalEtaMinutes)?.label || 'Ready / not pending'}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100">Internal admin note</label>
                <textarea
                  value={opsNote}
                  onChange={(e) => setOpsNote(e.target.value)}
                  rows={4}
                  placeholder="Access given from panel A, waiting for domain check, customer asked for later..."
                  className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 dark:border-[#303038] dark:bg-[#111113] dark:text-gray-100"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-5 py-4 dark:border-[#26262d]">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Checklist, admin note, delivered time, and reopen history are saved on this order.
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => savePersonalOps('save')}
                  disabled={opsSaving}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-[#303038] dark:text-gray-200 dark:hover:bg-white/5"
                >
                  Save note
                </button>
                {opsModalOrder.status === 'completed' ? (
                  <button
                    type="button"
                    onClick={() => savePersonalOps('reopen')}
                    disabled={opsSaving}
                    className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
                  >
                    Reopen to pending
                  </button>
                ) : null}
                {opsModalOrder.status === 'pending' ? (
                  <button
                    type="button"
                    onClick={() => savePersonalOps('deliver')}
                    disabled={opsSaving}
                    className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {opsSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                    Mark access ready
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
