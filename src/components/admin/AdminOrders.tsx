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
} from 'lucide-react';
import { format } from 'date-fns';
import { getApiBaseUrl } from '../../lib/apiBase';
import { getAccessTokenForApi } from '../../lib/getAccessTokenForApi';
import { toast } from '../../lib/toast';
import { useConfirmDialog } from '../../contexts/ConfirmDialogContext';

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

type FilterKey = 'all' | 'pending' | 'paid' | 'completed' | 'refunded' | 'cancelled';

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

export const AdminOrders = () => {
  const { confirm } = useConfirmDialog();
  const [rawOrders, setRawOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [assigningBulk, setAssigningBulk] = useState(false);
  const [assigningSingle, setAssigningSingle] = useState<string | null>(null);
  const [renewingOrderId, setRenewingOrderId] = useState<string | null>(null);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const token = await getAccessTokenForApi();
      const base = getApiBaseUrl();
      if (token && base) {
        const res = await fetch(`${base}/api/admin/orders/query?limit=200`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.success && Array.isArray(json.orders)) {
          setRawOrders(json.orders as Order[]);
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
        .limit(200);

      if (error) throw error;
      setRawOrders((data as unknown as Order[]) || []);
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
      if (rtTimerRef.current) window.clearTimeout(rtTimerRef.current);
      rtTimerRef.current = window.setTimeout(() => {
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
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-[#26262d] bg-gray-50/50 dark:bg-white/[0.03]">
                  <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Order</th>
                  <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Payment</th>
                  <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Renew</th>
                  <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const pay = paymentLabel(order.payment_method, order.payment_status);
                  const shortOrderId = order.id.slice(0, 8).toUpperCase();
                  const durationMonths = durationToMonths(order.products?.duration);
                  const exp = new Date(order.created_at);
                  exp.setMonth(exp.getMonth() + durationMonths);
                  const daysLeft = Math.ceil((exp.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
                  const isExpired = daysLeft <= 0;
                  return (
                    <tr
                      key={order.id}
                      className="border-b border-gray-100 dark:border-[#26262d] hover:bg-gray-50/60 dark:hover:bg-white/[0.02] align-middle"
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
                        </div>
                      </td>
                      <td className="py-4 px-4 text-right">
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
                                <CheckCircle className="w-3.5 h-3.5" /> Approve
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
                          ? 'No orders in the last 200 rows.'
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
                    <td colSpan={6} className="py-16 text-center text-gray-500 dark:text-gray-400">
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
    </div>
  );
};
