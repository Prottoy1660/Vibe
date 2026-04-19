import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Search, ShoppingCart, Loader2, CreditCard, Sparkles, Package, Copy, Check, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { postJsonWithFallback } from '../lib/apiClient';
import { isStalePendingOrder, PENDING_CHECKOUT_VISIBLE_MS } from '../lib/orderHistoryVisibility';
import { toast } from '../lib/toast';

interface Order {
  id: string;
  created_at: string;
  status: string;
  total_amount: number;
  /** Set when checkout called /api/payment/create; drives Pay now retry gateway. */
  payment_method: string | null;
  product: {
    title: string;
    title_bn: string;
  };
}

function gatewayForPaymentRetry(paymentMethod: string | null | undefined): 'uddoktapay' | 'bkash_tokenized' {
  const m = (paymentMethod || '').toLowerCase().replace(/_/g, ' ');
  if (m.includes('bkash tokenized')) return 'bkash_tokenized';
  return 'uddoktapay';
}

type StatusFilter = 'all' | 'pending' | 'paid' | 'completed' | 'issue';

function statusCaption(effectiveStatus: string): string {
  switch (effectiveStatus.toLowerCase()) {
    case 'completed':
      return 'Order complete — open Adobe Email for login.';
    case 'paid':
      return 'Paid — we are assigning access; check Adobe Email shortly.';
    case 'pending':
      return 'Complete payment to confirm this order.';
    case 'cancelled':
      return 'This order was cancelled.';
    case 'refunded':
      return 'This order was refunded.';
    default:
      return '';
  }
}

export const Orders = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const getPendingRemainingMs = (createdAt: string) => {
    const created = new Date(createdAt).getTime();
    return PENDING_CHECKOUT_VISIBLE_MS - (nowMs - created);
  };

  const getEffectiveStatus = (order: Order) => {
    if (order.status !== 'pending') return order.status;
    return isStalePendingOrder(order.status, order.created_at, nowMs) ? 'expired' : 'pending';
  };

  const fetchOrders = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          created_at,
          status,
          total_amount,
          payment_method,
          product:product_id (title, title_bn)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const formattedOrders = data.map((item: any) => ({
          id: item.id,
          created_at: item.created_at,
          status: item.status,
          total_amount: item.total_amount,
          payment_method: typeof item.payment_method === 'string' ? item.payment_method : null,
          product: {
            title: item.product?.title || 'Unknown Product',
            title_bn: item.product?.title_bn || '',
          },
        }));
        setOrders(formattedOrders);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  // Realtime: update Orders table without manual refresh.
  const rtTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!user) return;

    const schedule = () => {
      if (rtTimerRef.current) window.clearTimeout(rtTimerRef.current);
      rtTimerRef.current = window.setTimeout(() => {
        void fetchOrders();
      }, 700);
    };

    const channel = supabase
      .channel(`orders_rt:${user.id}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${user.id}` },
        () => schedule(),
      )
      .subscribe();

    return () => {
      if (rtTimerRef.current) window.clearTimeout(rtTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [user, fetchOrders]);

  const activeOrders = useMemo(
    () => orders.filter((order) => getEffectiveStatus(order) !== 'expired'),
    [orders, nowMs]
  );

  const filteredOrders = useMemo(() => {
    let list = activeOrders.filter(
      (order) =>
        order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.product.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (statusFilter === 'all') return list;

    list = list.filter((order) => {
      const s = getEffectiveStatus(order).toLowerCase();
      if (statusFilter === 'pending') return s === 'pending';
      if (statusFilter === 'paid') return s === 'paid';
      if (statusFilter === 'completed') return s === 'completed';
      if (statusFilter === 'issue') return s === 'cancelled' || s === 'refunded';
      return true;
    });

    return list;
  }, [activeOrders, searchQuery, statusFilter, nowMs]);

  const counts = useMemo(() => {
    const c = { all: activeOrders.length, pending: 0, paid: 0, completed: 0, issue: 0 };
    for (const o of activeOrders) {
      const s = getEffectiveStatus(o).toLowerCase();
      if (s === 'pending') c.pending++;
      else if (s === 'paid') c.paid++;
      else if (s === 'completed') c.completed++;
      else if (s === 'cancelled' || s === 'refunded') c.issue++;
    }
    return c;
  }, [activeOrders, nowMs]);

  /** Solid dark pills in dark mode so text never inherits low-contrast white on pastel. */
  const getStatusBadge = (status: string, createdAt?: string) => {
    const base =
      'px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border';
    switch (status.toLowerCase()) {
      case 'completed':
        return (
          <span
            className={`${base} border-emerald-200 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100`}
          >
            Completed
          </span>
        );
      case 'paid':
        return (
          <span
            className={`${base} border-sky-200 bg-sky-100 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100`}
          >
            Paid
          </span>
        );
      case 'pending':
        if (!createdAt) {
          return (
            <span
              className={`${base} border-amber-200 bg-amber-100 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100`}
            >
              Pending
            </span>
          );
        }
        const remainingMs = getPendingRemainingMs(createdAt);
        const remainingMinutes = Math.max(0, Math.ceil(remainingMs / (60 * 1000)));
        return (
          <span
            className={`${base} border-amber-200 bg-amber-100 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100`}
          >
            {remainingMinutes > 0 ? `Pay within ~${remainingMinutes}m` : 'Pending'}
          </span>
        );
      case 'expired':
        return (
          <span
            className={`${base} border-zinc-200 bg-zinc-100 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200`}
          >
            Expired
          </span>
        );
      case 'cancelled':
        return (
          <span
            className={`${base} border-red-200 bg-red-100 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100`}
          >
            Cancelled
          </span>
        );
      case 'refunded':
        return (
          <span
            className={`${base} border-zinc-300 bg-zinc-200 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100`}
          >
            Refunded
          </span>
        );
      default:
        return (
          <span
            className={`${base} border-zinc-200 bg-zinc-100 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100`}
          >
            {status}
          </span>
        );
    }
  };

  const handlePayNow = async (order: Order) => {
    try {
      setProcessingId(order.id);
      const gateway = gatewayForPaymentRetry(order.payment_method);
      const data = await postJsonWithFallback(
        '/api/payment/create',
        {
          order_id: order.id,
          amount: order.total_amount,
          full_name: user?.user_metadata?.full_name || 'Customer',
          email: user?.email,
          frontend_url: window.location.origin,
          user_id: user?.id,
          wallet_deduction: 0,
          gateway,
        },
        { skipErrorPageRedirect: true },
      );
      if (data.success && data.payment_url) {
        window.location.href = data.payment_url as string;
      } else {
        throw new Error(
          (typeof data.message === 'string' && data.message) ||
            (typeof data.error === 'string' && data.error) ||
            'Failed to initialize payment',
        );
      }
    } catch (error: unknown) {
      console.error('Payment retry error:', error);
      const err = error as { message?: string; apiBody?: { message?: string; needs_bkash_agreement?: boolean } };
      let msg =
        (typeof err.apiBody?.message === 'string' && err.apiBody.message) ||
        (error instanceof Error ? error.message : '') ||
        '';
      msg = msg.replace(/\s*\[\/api\/[^\]]+\]\s*$/, '').trim();
      if (err.apiBody?.needs_bkash_agreement) {
        msg =
          msg ||
          'Link your Bkash wallet from checkout first (one-time OTP), then pay from your orders or checkout.';
      }
      toast.error(
        msg ||
          'Failed to process payment retry. Please try again from the store checkout or create a new order.',
      );
    } finally {
      setProcessingId(null);
    }
  };

  const copyOrderId = (id: string) => {
    void navigator.clipboard.writeText(id);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 2000);
  };

  const filterTabs = useMemo(() => {
    const tabs: { key: StatusFilter; label: string }[] = [
      { key: 'all', label: 'All' },
      { key: 'pending', label: 'Awaiting payment' },
      { key: 'paid', label: 'Paid' },
      { key: 'completed', label: 'Completed' },
    ];
    if (counts.issue > 0) tabs.push({ key: 'issue', label: 'Cancelled / refunded' });
    return tabs;
  }, [counts.issue]);

  return (
    <div className="space-y-6 pb-16 max-w-5xl mx-auto px-0 sm:px-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            Purchases
          </p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight mt-1">Your orders</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-lg">
            See payment status, open Adobe access when ready, or copy an order ID for support.
          </p>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total orders', value: counts.all, tone: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/10' },
          { label: 'Awaiting payment', value: counts.pending, tone: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-500/10' },
          { label: 'Paid (processing)', value: counts.paid, tone: 'text-sky-700 dark:text-sky-400', bg: 'bg-sky-500/10' },
          { label: 'Completed', value: counts.completed, tone: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-gray-200/90 dark:border-[#2a2a32] bg-white dark:bg-[#121214] px-4 py-3 shadow-sm dark:shadow-none"
          >
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wide">{s.label}</p>
            <p className={`text-xl font-semibold tabular-nums mt-0.5 ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-200/90 dark:border-[#2a2a32] bg-white dark:bg-[#121214] shadow-sm dark:shadow-none overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-white/5 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {filterTabs.map((tab) => {
                const n =
                  tab.key === 'all'
                    ? counts.all
                    : tab.key === 'pending'
                      ? counts.pending
                      : tab.key === 'paid'
                        ? counts.paid
                        : tab.key === 'completed'
                          ? counts.completed
                          : counts.issue;
                const active = statusFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setStatusFilter(tab.key)}
                    className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-indigo-600 text-white dark:bg-indigo-500 shadow-sm'
                        : 'bg-gray-50 dark:bg-white/5 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-white/10 hover:border-indigo-300 dark:hover:border-indigo-500/40'
                    }`}
                  >
                    {tab.label}
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-xs tabular-nums ${
                        active ? 'bg-white/20' : 'bg-white dark:bg-white/10 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      {n}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="relative w-full lg:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-gray-200 dark:border-[#2e2e36] bg-white dark:bg-[#16161a] py-2.5 pl-10 pr-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none"
                placeholder="Search by product or order ID…"
                aria-label="Search orders"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-14 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        ) : filteredOrders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full divide-y divide-gray-100 dark:divide-white/10">
              <thead>
                <tr className="bg-gray-50/90 dark:bg-white/[0.03] text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <th scope="col" className="px-4 sm:px-5 py-3 whitespace-nowrap">
                    Order
                  </th>
                  <th scope="col" className="px-4 sm:px-5 py-3 min-w-[140px]">
                    Product
                  </th>
                  <th scope="col" className="px-4 sm:px-5 py-3 hidden sm:table-cell whitespace-nowrap">
                    Date
                  </th>
                  <th scope="col" className="px-4 sm:px-5 py-3 whitespace-nowrap">
                    Total
                  </th>
                  <th scope="col" className="px-4 sm:px-5 py-3 min-w-[160px]">
                    Status
                  </th>
                  <th scope="col" className="px-4 sm:px-5 py-3 text-right whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {filteredOrders.map((order) => {
                  const effectiveStatus = getEffectiveStatus(order);
                  const cap = statusCaption(effectiveStatus);
                  return (
                    <tr key={order.id} className="hover:bg-gray-50/80 dark:hover:bg-white/[0.02] transition-colors align-middle">
                      <td className="px-4 sm:px-5 py-3 align-middle">
                        <span className="font-mono text-xs font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                          #{order.id.substring(0, 8)}
                        </span>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 sm:hidden whitespace-nowrap">
                          {format(new Date(order.created_at), 'MMM d, yyyy')}
                        </p>
                      </td>
                      <td className="px-4 sm:px-5 py-3 min-w-0 max-w-[200px] sm:max-w-[280px] align-middle">
                        <span
                          className="text-sm font-medium text-gray-900 dark:text-gray-100 block truncate"
                          title={order.product.title}
                        >
                          {order.product.title}
                        </span>
                      </td>
                      <td className="px-4 sm:px-5 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap hidden sm:table-cell align-middle">
                        {format(new Date(order.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 sm:px-5 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap tabular-nums align-middle">
                        ৳{Number(order.total_amount).toFixed(2)}
                      </td>
                      <td className="px-4 sm:px-5 py-3 min-w-0 max-w-[220px] sm:max-w-[300px] align-middle">
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="shrink-0">{getStatusBadge(effectiveStatus, order.created_at)}</div>
                          {cap ? (
                            <p
                              className="min-w-0 truncate text-[11px] sm:text-xs text-gray-500 dark:text-gray-400"
                              title={cap}
                            >
                              {cap}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 sm:px-5 py-3 text-right align-middle">
                        <div className="flex flex-col items-end gap-1.5">
                          {effectiveStatus === 'pending' ? (
                            <button
                              type="button"
                              onClick={() => void handlePayNow(order)}
                              disabled={processingId === order.id}
                              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 disabled:opacity-50 transition-colors"
                            >
                              {processingId === order.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                              ) : (
                                <CreditCard className="h-3.5 w-3.5 shrink-0" />
                              )}
                              Pay now
                            </button>
                          ) : null}
                          {(effectiveStatus === 'paid' || effectiveStatus === 'completed') && (
                            <Link
                              to="/adobe-email"
                              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/15 transition-colors"
                            >
                              <Package className="h-3.5 w-3.5 shrink-0" />
                              Adobe email
                              <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                            </Link>
                          )}
                          <button
                            type="button"
                            onClick={() => copyOrderId(order.id)}
                            className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                          >
                            {copiedId === order.id ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                Copy full ID
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-14 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5">
              <ShoppingCart className="h-7 w-7 text-gray-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">No orders match</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto">
              {searchQuery || statusFilter !== 'all'
                ? 'Try another filter or clear the search.'
                : 'When you buy from the store, your orders will show up here.'}
            </p>
            {(searchQuery || statusFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                }}
                className="mt-4 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Reset filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
