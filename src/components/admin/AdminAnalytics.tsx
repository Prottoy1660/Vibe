import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, TrendingUp, DollarSign, ShoppingCart } from 'lucide-react';
import { 
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, PieChart, Pie, Cell
} from 'recharts';
import { format, subDays, startOfDay, endOfDay, parseISO } from 'date-fns';

interface Order {
  id: string;
  total_amount: number;
  created_at: string;
  status: string;
  payment_method: string;
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
      let query = supabase
        .from('orders')
        .select('id, total_amount, created_at, status, payment_method')
        .in('status', ['completed', 'paid']);

      // Apply time filter
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
    
    // Initialize map based on timeRange to ensure 0-value days exist
    if (timeRange !== 'all') {
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      for (let i = days - 1; i >= 0; i--) {
        const d = subDays(new Date(), i);
        dailyMap[format(d, 'MMM dd')] = 0;
      }
    }

    orders.forEach(order => {
      const dateStr = format(parseISO(order.created_at), 'MMM dd');
      if (dailyMap[dateStr] !== undefined || timeRange === 'all') {
        dailyMap[dateStr] = (dailyMap[dateStr] || 0) + Number(order.total_amount);
      }
    });

    return Object.keys(dailyMap).map(date => ({
      date,
      revenue: dailyMap[date]
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

    return Object.keys(methodMap).map(name => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value: methodMap[name]
    }));
  };

  // Summary Stats
  const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total_amount), 0);
  const totalOrdersCount = orders.length;
  const averageOrderValue = totalOrdersCount > 0 ? totalRevenue / totalOrdersCount : 0;

  const COLORS = ['#8B5CF6', '#EC4899', '#F97316', '#3B82F6', '#10B981'];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-[#151518] p-3 border border-gray-100 dark:border-[#26262d] shadow-xl rounded-xl">
          <p className="text-gray-500 dark:text-gray-400 dark:text-gray-500 text-sm mb-1">{label}</p>
          <p className="text-primary font-bold">৳{payload[0].value.toFixed(2)}</p>
        </div>
      );
    }
    return null;
  };

  if (loading && orders.length === 0) {
    return (
      <div className="flex justify-center py-16 rounded-2xl border border-dashed border-gray-200 dark:border-[#303038] bg-white dark:bg-[#151518]">
        <Loader2 className="animate-spin w-8 h-8 text-indigo-500" />
      </div>
    );
  }

  const dailyRevenueData = processDailyRevenue();
  const paymentMethodData = processPaymentMethods();

  const timeRangeControl = (
    <div className="flex flex-wrap bg-gray-100 dark:bg-black/20 p-1 rounded-xl border border-gray-200/80 dark:border-[#303038]">
      {(['7d', '30d', '90d', 'all'] as const).map((range) => (
        <button
          key={range}
          type="button"
          onClick={() => setTimeRange(range)}
          className={`px-3 sm:px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            timeRange === range
              ? 'bg-white dark:bg-[#151518] text-indigo-600 dark:text-indigo-400 shadow-sm'
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
        <div className="bg-white dark:bg-[#151518] p-6 rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] relative overflow-hidden">
          <div className="absolute right-0 top-0 w-24 h-24 bg-gradient-to-br from-green-400/20 to-emerald-600/5 rounded-bl-full -mr-4 -mt-4"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500">Total Revenue</p>
              <h3 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">৳{totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2})}</h3>
            </div>
            <div className="p-3 bg-green-100 text-green-600 rounded-xl">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#151518] p-6 rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] relative overflow-hidden">
          <div className="absolute right-0 top-0 w-24 h-24 bg-gradient-to-br from-blue-400/20 to-indigo-600/5 rounded-bl-full -mr-4 -mt-4"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500">Completed Orders</p>
              <h3 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">{totalOrdersCount}</h3>
            </div>
            <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
              <ShoppingCart className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#151518] p-6 rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] relative overflow-hidden">
          <div className="absolute right-0 top-0 w-24 h-24 bg-gradient-to-br from-purple-400/20 to-pink-600/5 rounded-bl-full -mr-4 -mt-4"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500">Average Order Value</p>
              <h3 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">৳{averageOrderValue.toFixed(2)}</h3>
            </div>
            <div className="p-3 bg-purple-100 text-purple-600 rounded-xl">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Revenue Trend Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-[#151518] p-6 rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d]">
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Revenue Trend</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">Daily revenue over the selected period</p>
            </div>
          </div>
          
          <div className="h-[300px] w-full">
            {loading ? (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary opacity-50" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyRevenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#9ca3af', fontSize: 12 }} 
                    dy={10}
                    minTickGap={20}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#9ca3af', fontSize: 12 }}
                    tickFormatter={(value) => `৳${value}`}
                    dx={-10}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="#8B5CF6" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorRevenue)" 
                    activeDot={{ r: 6, strokeWidth: 0, fill: '#8B5CF6' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Payment Methods Breakdown */}
        <div className="bg-white dark:bg-[#151518] p-6 rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d]">
          <div className="mb-2">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Payment Methods</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">Distribution of gateways</p>
          </div>
          
          <div className="h-[250px] w-full flex flex-col justify-center">
             {loading ? (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary opacity-50" />
              </div>
            ) : paymentMethodData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentMethodData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {paymentMethodData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => [`${value} Orders`, 'Count']}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36} 
                    iconType="circle"
                    formatter={(value) => <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
                No payment data available
              </div>
            )}
          </div>
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
