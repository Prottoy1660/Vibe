import React, { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { format } from 'date-fns';
import { getApiBaseUrl } from '../../lib/apiBase';

interface Order {
  id: string;
  user_id: string;
  product_id: string;
  status: string;
  payment_status: string;
  payment_method: string;
  total_amount: number;
  created_at: string;
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

function paymentLabel(method: string, paymentStatus: string) {
  const m = (method || '').toLowerCase().replace(/_/g, ' ');
  const pretty =
    m === 'uddoktapay' || m === 'gateway'
      ? 'Gateway'
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
  const [rawOrders, setRawOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [assigningBulk, setAssigningBulk] = useState(false);
  const [assigningSingle, setAssigningSingle] = useState<string | null>(null);
  const [renewingOrderId, setRenewingOrderId] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(
          `
          *,
          users (email, name, phone),
          products (title, is_personal, duration, price),
          user_emails (id)
        `
        )
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setRawOrders((data as unknown as Order[]) || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const o = rawOrders;
    return {
      total: o.length,
      pending: o.filter((x) => x.status === 'pending').length,
      paid: o.filter((x) => x.status === 'paid').length,
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
    return rawOrders.filter((o) => o.status === filter);
  }, [rawOrders, filter]);

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
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token || '';
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
      alert('Failed to update order status');
    }
  };

  const handleBulkAssign = async () => {
    if (!window.confirm('Attempt to assign matching emails to ALL unfulfilled paid orders?')) return;
    setAssigningBulk(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      const API_URL = getApiBaseUrl();
      const res = await fetch(`${API_URL}/api/payment/bulk-assign-emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchOrders();
      } else {
        alert(data.message || 'Failed to bulk assign emails.');
      }
    } catch (err) {
      console.error(err);
      alert('Server error during bulk assign.');
    } finally {
      setAssigningBulk(false);
    }
  };

  const handleSingleAssign = async (orderId: string) => {
    setAssigningSingle(orderId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
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
        alert(data.message || 'Failed to assign email.');
      }
    } catch (err) {
      console.error(err);
      alert('Server error during assign.');
    } finally {
      setAssigningSingle(null);
    }
  };

  const handleAdminRenew = async (oldOrderId: string) => {
    if (!window.confirm('Admin renew: create a renewed order and provision fresh access?')) return;
    setRenewingOrderId(oldOrderId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
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

      alert('Order renewed successfully.');
      fetchOrders();
    } catch (err: any) {
      console.error('Admin renew error:', err);
      alert(err?.message || 'Failed to renew order');
    } finally {
      setRenewingOrderId(null);
    }
  };

  const handleRefund = async (orderId: string) => {
    if (!window.confirm("Refund this order? This will revoke the user's email access where applicable.")) {
      return;
    }

    try {
      const { data: userEmails } = await supabase.from('user_emails').select('email_id').eq('order_id', orderId);

      if (userEmails && userEmails.length > 0) {
        const emailIds = userEmails.map((ue) => ue.email_id);

        const { data: poolRows, error: poolErr } = await supabase
          .from('emails_pool')
          .select('id,current_users,product_id,assigned_at,is_burned')
          .in('id', emailIds);

        if (poolErr) throw poolErr;

        const productIds = Array.from(
          new Set((poolRows || []).map((r) => r.product_id).filter(Boolean))
        );

        const { data: productsRows, error: prodErr } = await supabase
          .from('products')
          .select('id,max_users_per_email')
          .in('id', productIds);

        if (prodErr) throw prodErr;

        const maxMap = new Map((productsRows || []).map((p) => [p.id, p.max_users_per_email]));

        for (const row of poolRows || []) {
          // If already burned, the email is already revoked; just keep it burned.
          if (row.is_burned) continue;

          const current = Number(row.current_users || 0);
          const nextCount = Math.max(0, current - 1);
          const maxUsers = Number(maxMap.get(row.product_id as any) || 1);

          if (nextCount === 0) {
            await supabase
              .from('emails_pool')
              .update({
                status: 'available',
                assigned_at: null,
                product_id: null,
                current_users: 0,
              })
              .eq('id', row.id);
          } else {
            await supabase
              .from('emails_pool')
              .update({
                current_users: nextCount,
                // After refund, the slot is never "full", but compute safely.
                status: nextCount >= maxUsers ? 'assigned' : 'available',
              })
              .eq('id', row.id);
          }
        }

        await supabase.from('user_emails').delete().eq('order_id', orderId);
      }

      const { error } = await supabase
        .from('orders')
        .update({ status: 'refunded', payment_status: 'refunded' })
        .eq('id', orderId);

      if (error) throw error;

      alert('Order refunded and email access released where linked.');
      fetchOrders();
    } catch (error) {
      console.error('Error processing refund:', error);
      alert('Failed to process refund');
    }
  };

  const handleDeleteAllPending = async () => {
    if (!window.confirm('Delete every pending order? This cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.from('orders').delete().eq('status', 'pending');

      if (error) throw error;

      alert('All pending orders removed.');
      fetchOrders();
    } catch (error) {
      console.error('Error deleting pending orders:', error);
      alert('Failed to delete pending orders');
      setLoading(false);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!window.confirm('Permanently delete this order?')) {
      return;
    }

    try {
      const { error } = await supabase.from('orders').delete().eq('id', orderId);

      if (error) throw error;

      fetchOrders();
    } catch (error) {
      console.error('Error deleting order:', error);
      alert('Failed to delete order');
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
        <div className="relative flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Order management</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
                Review recent orders (last 200). Use filters to focus on pending approvals or refunds. Amounts are shown
                in <strong className="font-medium text-gray-800 dark:text-gray-200">BDT</strong>.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleBulkAssign}
              disabled={loading || assigningBulk || unfulfilledCount === 0}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold border border-transparent shadow-sm disabled:opacity-50 transition-all active:scale-95 ${
                unfulfilledCount > 0
                  ? 'bg-orange-500 hover:bg-orange-600 shadow-[0_0_15px_-3px_rgba(249,115,22,0.4)] animate-pulse'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {assigningBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Fulfill Missing
              {unfulfilledCount > 0 && (
                <span className="bg-white/20 text-white px-2 py-0.5 rounded-full text-xs font-bold tabular-nums">
                  {unfulfilledCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => fetchOrders()}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-[#303038] text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-white/60 dark:hover:bg-white/5 disabled:opacity-50 transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {stats.pending > 0 && (
              <button
                type="button"
                onClick={handleDeleteAllPending}
                disabled={loading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 text-sm font-semibold border border-red-100 dark:border-red-500/25 hover:bg-red-100/80 dark:hover:bg-red-500/20 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Clear all pending
              </button>
            )}
          </div>
        </div>

        <div className="relative mt-6 flex flex-wrap gap-2">
          {filters.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
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
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] overflow-hidden shadow-sm dark:shadow-none">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/5 flex items-center gap-2">
          <Info className="w-4 h-4 text-indigo-500 shrink-0" />
          <p className="text-xs text-gray-600 dark:text-gray-400">
            <strong className="font-medium text-gray-800 dark:text-gray-200">Pending:</strong> approve assigns a pool
            email when possible. <strong className="font-medium text-gray-800 dark:text-gray-200">Refund:</strong>{' '}
            releases linked pool emails.
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
                {orders.map((order) => {
                  const pay = paymentLabel(order.payment_method, order.payment_status);
                  const durationMonths = durationToMonths(order.products?.duration);
                  const exp = new Date(order.created_at);
                  exp.setMonth(exp.getMonth() + durationMonths);
                  const daysLeft = Math.ceil((exp.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
                  const isExpired = daysLeft <= 0;
                  return (
                    <tr
                      key={order.id}
                      className="border-b border-gray-100 dark:border-[#26262d] hover:bg-gray-50/60 dark:hover:bg-white/[0.02] align-top"
                    >
                      <td className="py-4 px-4 max-w-[220px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Package className="w-4 h-4 text-gray-400 shrink-0" />
                          <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {order.products?.title || 'Unknown product'}
                          </span>
                          {order.products?.is_personal && (
                            <span className="px-1.5 py-0.5 bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300 text-[10px] rounded-md font-bold uppercase tracking-wide">
                              Personal
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-mono text-gray-500 dark:text-gray-400 mt-1 truncate" title={order.id}>
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
                      <td className="py-4 px-4">
                        <div className="flex items-start gap-2">
                          <CreditCard className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                              {money(Number(order.total_amount))}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5 capitalize">
                              {pay.pretty} · {pay.status}
                            </p>
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
                        {filter === 'all' ? 'No orders in the last 200 rows.' : `No orders with status “${filter}”.`}
                      </p>
                      <p className="text-sm mt-1">Try another filter or refresh.</p>
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
