import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, TrendingUp, DollarSign, ShoppingCart, WalletCards, Sparkles } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format, subDays, startOfDay, endOfDay, parseISO } from 'date-fns';
import { getApiBaseUrl } from '../../lib/apiBase';
import { getAccessTokenForApi } from '../../lib/getAccessTokenForApi';
import { ADMIN_ORDERS_QUERY_LIMIT } from '../../lib/adminDataLimits';

interface Order {
  id: string;
  total_amount: number;
  created_at: string;
  status: string;
  payment_method: string;
  payment_status: string;
}

function formatCurrency(value: number, compact = false) {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('en-BD', {
    maximumFractionDigits: compact ? 1 : 2,
    minimumFractionDigits: compact ? 0 : 2,
    notation: compact ? 'compact' : 'standard',
  }).format(safe);
}

export const AdminAnalytics = ({ embedded = false }: { embedded?: boolean }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  useEffect(() => {
    fetchData();
  }, [timeRange]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = await getAccessTokenForApi();
      const base = getApiBaseUrl();
      if (token && base) {
        let url = `${base}/api/admin/orders/query?payment_status=paid&limit=${ADMIN_ORDERS_QUERY_LIMIT}`;
        if (timeRange !== 'all') {
          const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
          const startDate = subDays(new Date(), days);
          url += `&from=${encodeURIComponent(startDate.toISOString())}`;
        }
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `Analytics ${res.status}`);
        const rows = (json.orders || []) as Order[];
        setOrders(
          rows.map((o) => ({
            id: o.id,
            total_amount: Number(o.total_amount),
            created_at: o.created_at,
            status: o.status,
            payment_method: o.payment_method,
            payment_status: o.payment_status,
          })),
        );
        return;
      }

      let query = supabase
        .from('orders')
        .select('id, total_amount, created_at, status, payment_method, payment_status')
        .eq('payment_status', 'paid')
        .order('created_at', { ascending: false })
        .limit(ADMIN_ORDERS_QUERY_LIMIT);

      if (timeRange !== 'all') {
        const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
        const startDate = subDays(new Date(), days);
        query = query.gte('created_at', startDate.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching analytics data:', error);
    } finally {
      setLoading(false);
    }
  };

  // 1. Process data for Daily Revenue Chart
  const processDailyRevenue = () => {
    const dailyMap: Record<string, number> = {};
    const orderCountMap: Record<string, number> = {};
    
    // Initialize map based on timeRange to ensure 0-value days exist
    if (timeRange !== 'all') {
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      for (let i = days - 1; i >= 0; i--) {
        const d = subDays(new Date(), i);
        dailyMap[format(d, 'MMM dd')] = 0;
        orderCountMap[format(d, 'MMM dd')] = 0;
      }
    }

    orders.forEach(order => {
      const dateStr = format(parseISO(order.created_at), 'MMM dd');
      if (dailyMap[dateStr] !== undefined || timeRange === 'all') {
        dailyMap[dateStr] = (dailyMap[dateStr] || 0) + Number(order.total_amount);
        orderCountMap[dateStr] = (orderCountMap[dateStr] || 0) + 1;
      }
    });

    return Object.keys(dailyMap).map(date => ({
      date,
      revenue: dailyMap[date],
      orders: orderCountMap[date] || 0,
    })).sort((a, b) => {
        // Quick string-based sort assuming they are somewhat ordered or we rely on map insertion order
        return 0; // The map initialization already keeps them in order
    });
  };

  // 2. Process data for Payment Methods Pie Chart
  const processPaymentMethods = () => {
    const methodMap: Record<string, number> = {};
    orders.forEach(order => {
      const method = order.payment_method || 'Unknown';
      methodMap[method] = (methodMap[method] || 0) + 1;
    });

    return Object.keys(methodMap)
      .map(name => ({
        name: name.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
        value: methodMap[name]
      }))
      .sort((a, b) => b.value - a.value);
  };

  // Summary Stats
  const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total_amount), 0);
  const totalOrdersCount = orders.length;
  const averageOrderValue = totalOrdersCount > 0 ? totalRevenue / totalOrdersCount : 0;

  const COLORS = ['#8B5CF6', '#EC4899', '#38BDF8', '#10B981', '#F59E0B'];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-2xl border border-white/15 bg-[#0b1020]/95 px-4 py-3 shadow-[0_16px_40px_-18px_rgba(0,0,0,0.8)] backdrop-blur-xl">
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">{label}</p>
          <p className="mt-1 text-lg font-bold text-white">৳{formatCurrency(Number(payload[0].value || 0))}</p>
          {payload[0]?.payload?.orders ? (
            <p className="mt-1 text-xs text-violet-200/80">{payload[0].payload.orders} paid order(s)</p>
          ) : null}
        </div>
      );
    }
    return null;
  };

  const PaymentTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const row = payload[0]?.payload;
    if (!row) return null;
    return (
      <div className="rounded-2xl border border-white/15 bg-[#0b1020]/95 px-4 py-3 shadow-[0_16px_40px_-18px_rgba(0,0,0,0.8)] backdrop-blur-xl">
        <p className="text-sm font-semibold text-white">{row.name}</p>
        <p className="mt-1 text-xs text-white/60">{row.value} paid order(s)</p>
        <p className="mt-1 text-sm font-semibold text-fuchsia-300">{row.share}% of checkout mix</p>
      </div>
    );
  };

  if (loading && orders.length === 0) {
    return (
      <div className="flex justify-center py-16 rounded-2xl border border-dashed border-gray-200 dark:border-[#303038] bg-white dark:bg-[#151518]">
        <Loader2 className="animate-spin w-8 h-8 text-indigo-500" />
      </div>
    );
  }

  const dailyRevenueData = useMemo(() => processDailyRevenue(), [orders, timeRange]);
  const paymentMethodData = useMemo(() => {
    const rows = processPaymentMethods();
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    return rows.map((row) => ({
      ...row,
      share: total > 0 ? Math.round((row.value / total) * 100) : 0,
    }));
  }, [orders]);
  const totalPaymentMethodOrders = paymentMethodData.reduce((sum, row) => sum + row.value, 0);
  const bestRevenueDay = dailyRevenueData.reduce(
    (best, row) => (row.revenue > best.revenue ? row : best),
    dailyRevenueData[0] || { date: 'N/A', revenue: 0, orders: 0 },
  );
  const activeRevenueDays = dailyRevenueData.filter((row) => row.revenue > 0).length;
  const avgDailyRevenue = dailyRevenueData.length > 0 ? totalRevenue / dailyRevenueData.length : 0;
  const topPaymentMethod = paymentMethodData[0];
  const metricCards = [
    {
      title: 'Total Revenue',
      value: `৳${formatCurrency(totalRevenue)}`,
      subtitle: `${activeRevenueDays} active sales day${activeRevenueDays === 1 ? '' : 's'}`,
      icon: DollarSign,
      glow: 'from-emerald-500/25 via-green-400/10 to-transparent',
      iconWrap: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/25',
      valueClass: 'text-white',
    },
    {
      title: 'Completed Orders',
      value: totalOrdersCount.toLocaleString(),
      subtitle: topPaymentMethod ? `${topPaymentMethod.name} leads checkout usage` : 'No payment activity yet',
      icon: ShoppingCart,
      glow: 'from-sky-500/25 via-blue-400/10 to-transparent',
      iconWrap: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/25',
      valueClass: 'text-white',
    },
    {
      title: 'Average Order Value',
      value: `৳${formatCurrency(averageOrderValue)}`,
      subtitle: bestRevenueDay.revenue > 0 ? `Peak day ${bestRevenueDay.date}` : 'Waiting for paid orders',
      icon: TrendingUp,
      glow: 'from-violet-500/25 via-fuchsia-400/10 to-transparent',
      iconWrap: 'bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/25',
      valueClass: 'text-white',
    },
  ];

  const timeRangeControl = (
    <div className="flex flex-wrap rounded-2xl border border-white/10 bg-white/70 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] backdrop-blur dark:bg-white/[0.04] dark:shadow-none dark:border-white/[0.08]">
      {(['7d', '30d', '90d', 'all'] as const).map((range) => (
        <button
          key={range}
          type="button"
          onClick={() => setTimeRange(range)}
          className={`px-3 sm:px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            timeRange === range
              ? 'bg-[#0b1020] text-white shadow-[0_10px_30px_-14px_rgba(15,23,42,0.8)] dark:bg-white dark:text-[#0b1020]'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          {range === '7d' ? '7 days' : range === '30d' ? '30 days' : range === '90d' ? '3 months' : 'All time'}
        </button>
      ))}
    </div>
  );

  const kpiAndCharts = (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a0f1e] p-5 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.85)]"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${card.glow}`} />
              <div className="absolute -right-10 top-0 h-28 w-28 rounded-full bg-white/5 blur-2xl transition-transform duration-500 group-hover:scale-110" />
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">{card.title}</p>
                  <h3 className={`mt-3 text-3xl font-bold tracking-tight ${card.valueClass}`}>{card.value}</h3>
                  <p className="mt-2 text-sm text-white/60">{card.subtitle}</p>
                </div>
                <div className={`rounded-2xl p-3 ${card.iconWrap}`}>
                  <Icon className="h-6 w-6" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Revenue Trend Chart */}
        <div className="lg:col-span-2 relative overflow-hidden rounded-[28px] border border-white/10 bg-[#090f1d] p-6 shadow-[0_28px_60px_-28px_rgba(0,0,0,0.85)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.18),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.12),transparent_30%)]" />
          <div className="relative mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-200">
                <Sparkles className="h-3.5 w-3.5" />
                Revenue Trend
              </div>
              <p className="mt-4 text-3xl font-bold tracking-tight text-white">৳{formatCurrency(totalRevenue, true)}</p>
              <p className="mt-1 text-sm text-white/55">Daily revenue over the selected period</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:min-w-[240px]">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Peak day</p>
                <p className="mt-2 text-sm font-semibold text-white">{bestRevenueDay.date}</p>
                <p className="text-xs text-violet-200/75">৳{formatCurrency(bestRevenueDay.revenue, true)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Avg / day</p>
                <p className="mt-2 text-sm font-semibold text-white">৳{formatCurrency(avgDailyRevenue, true)}</p>
                <p className="text-xs text-sky-200/75">{activeRevenueDays} active days</p>
              </div>
            </div>
          </div>
          
          <div className="relative h-[320px] w-full">
            {loading ? (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-violet-300 opacity-70" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyRevenueData} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.45}/>
                      <stop offset="60%" stopColor="#8B5CF6" stopOpacity={0.12}/>
                      <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorRevenueStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#8B5CF6"/>
                      <stop offset="100%" stopColor="#38BDF8"/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="rgba(255,255,255,0.12)" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }} 
                    dy={10}
                    minTickGap={20}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                    tickFormatter={(value) => `৳${formatCurrency(Number(value), true)}`}
                    dx={-10}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="url(#colorRevenueStroke)" 
                    strokeWidth={3.5}
                    fillOpacity={1} 
                    fill="url(#colorRevenue)" 
                    activeDot={{ r: 6, strokeWidth: 3, stroke: '#0b1020', fill: '#8B5CF6' }}
                    animationDuration={900}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Payment Methods Breakdown */}
        <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#090f1d] p-6 shadow-[0_28px_60px_-28px_rgba(0,0,0,0.85)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(236,72,153,0.16),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(139,92,246,0.14),transparent_32%)]" />
          <div className="relative mb-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-400/20 bg-fuchsia-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-fuchsia-200">
              <WalletCards className="h-3.5 w-3.5" />
              Payment Methods
            </div>
            <p className="mt-4 text-2xl font-bold text-white">{topPaymentMethod ? topPaymentMethod.name : 'No data yet'}</p>
            <p className="mt-1 text-sm text-white/55">Distribution of gateways across paid orders</p>
          </div>
          
          <div className="relative h-[290px] w-full flex flex-col justify-center">
             {loading ? (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-fuchsia-300 opacity-70" />
              </div>
            ) : paymentMethodData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                  <Pie
                    data={paymentMethodData}
                    cx="50%"
                    cy="50%"
                    innerRadius={72}
                    outerRadius={102}
                    paddingAngle={4}
                    cornerRadius={10}
                    dataKey="value"
                    stroke="none"
                    animationDuration={900}
                  >
                    {paymentMethodData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<PaymentTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="rounded-full border border-white/10 bg-[#0d1324]/90 px-6 py-5 text-center shadow-[0_20px_50px_-28px_rgba(0,0,0,0.95)] backdrop-blur-xl">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/40">Paid Orders</p>
                    <p className="mt-2 text-3xl font-bold text-white">{totalPaymentMethodOrders}</p>
                    <p className="mt-1 text-xs text-fuchsia-200/75">
                      {topPaymentMethod ? `${topPaymentMethod.share}% via ${topPaymentMethod.name}` : 'Waiting for orders'}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/45 text-sm">
                No payment data available
              </div>
            )}
          </div>
          {paymentMethodData.length > 0 ? (
            <div className="relative mt-3 space-y-3">
              {paymentMethodData.map((row, index) => (
                <div key={row.name} className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="truncate text-sm font-medium text-white/85">{row.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-white">{row.value}</span>
                      <span className="ml-2 text-xs text-white/45">{row.share}%</span>
                    </div>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${row.share}%`,
                        background: `linear-gradient(90deg, ${COLORS[index % COLORS.length]}, rgba(255,255,255,0.9))`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

      </div>
    </>
  );

  if (embedded) {
    return (
      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] overflow-hidden shadow-sm dark:shadow-none">
        <div className="px-4 py-4 sm:px-6 border-b border-gray-100 dark:border-[#26262d] bg-gray-50/60 dark:bg-white/[0.02] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-500" />
              Revenue &amp; payments
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-md">
              Completed and paid orders only. Change the range to refresh the chart.
            </p>
          </div>
          {timeRangeControl}
        </div>
        <div className="p-4 sm:p-6 space-y-6">{kpiAndCharts}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Financial Analytics</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-xl">
                Revenue, order volume, and how customers paid — pick a time window below.
              </p>
            </div>
          </div>
        </div>
        <div className="relative mt-6">{timeRangeControl}</div>
      </div>
      {kpiAndCharts}
    </div>
  );
};
