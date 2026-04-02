import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Search, Filter, ShoppingCart, Loader2, CreditCard } from 'lucide-react';
import { format } from 'date-fns';
import { postJsonWithFallback } from '../lib/apiClient';

interface Order {
  id: string;
  created_at: string;
  status: string;
  total_amount: number;
  product: {
    title: string;
    title_bn: string;
  };
}

export const Orders = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const getPendingRemainingMs = (createdAt: string) => {
    const created = new Date(createdAt).getTime();
    return 30 * 60 * 1000 - (nowMs - created);
  };

  const getEffectiveStatus = (order: Order) => {
    if (order.status !== 'pending') return order.status;
    return getPendingRemainingMs(order.created_at) <= 0 ? 'expired' : 'pending';
  };

  useEffect(() => {
    const fetchOrders = async () => {
      if (!user) return;
      
      try {
        const { data, error } = await supabase
          .from('orders')
          .select(`
            id,
            created_at,
            status,
            total_amount,
            product:product_id (title, title_bn)
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        // Transform data
        if (data) {
          const formattedOrders = data.map((item: any) => {
            return {
              id: item.id,
              created_at: item.created_at,
              status: item.status,
              total_amount: item.total_amount,
              product: {
                title: item.product?.title || 'Unknown Product',
                title_bn: item.product?.title_bn || ''
              }
            };
          });
          setOrders(formattedOrders);
        }
      } catch (error) {
        console.error('Error fetching orders:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [user]);

  const filteredOrders = orders
    .filter((order) => getEffectiveStatus(order) !== 'expired')
    .filter(order =>
      order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.product.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const getStatusBadge = (status: string, createdAt?: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return <span className="px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Completed</span>;
      case 'paid':
        return <span className="px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">Paid</span>;
      case 'pending':
        if (!createdAt) {
          return <span className="px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400">Pending</span>;
        }
        const remainingMs = getPendingRemainingMs(createdAt);
        const remainingMinutes = Math.max(0, Math.ceil(remainingMs / (60 * 1000)));
        return (
          <span className="px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400">
            Time Left: {remainingMinutes}m
          </span>
        );
      case 'expired':
        return <span className="px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-gray-400">Expired</span>;
      case 'cancelled':
        return <span className="px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Cancelled</span>;
      default:
        return <span className="px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 dark:bg-white/10 text-gray-800 dark:text-gray-100">{status}</span>;
    }
  };

  const handlePayNow = async (orderId: string, amount: number) => {
    try {
      setProcessingId(orderId);
      const data = await postJsonWithFallback('/api/payment/create', {
        order_id: orderId,
        amount: amount,
        full_name: user?.user_metadata?.full_name || 'Customer',
        email: user?.email,
        frontend_url: window.location.origin
      });
      if (data.success && data.payment_url) {
        window.location.href = data.payment_url;
      } else {
        throw new Error(data.message || data.error || 'Failed to initialize payment');
      }
    } catch (error) {
      console.error('Payment retry error:', error);
      alert('Failed to process payment retry. Please try creating a new order.');
    } finally {
      setProcessingId(null);
    }
  };

  const getTimelineSteps = (status: string) => {
    const normalized = status.toLowerCase();
    const steps = ['Order', 'Payment', 'Provisioning', 'Completed'];
    let activeIndex = 0;
    if (normalized === 'pending') activeIndex = 0;
    else if (normalized === 'paid') activeIndex = 1;
    else if (normalized === 'completed') activeIndex = 3;
    else if (normalized === 'cancelled' || normalized === 'expired' || normalized === 'refunded') activeIndex = -1;
    return { steps, activeIndex };
  };

  return (
    <div className="space-y-6 pb-12 max-w-6xl mx-auto">
      <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-2">
        <span>Orders</span> <span className="mx-2">&gt;</span> <span>List</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Orders</h1>

      <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-[#26262d] flex justify-end gap-3 bg-gray-50/50 dark:bg-white/5">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400 dark:text-gray-500" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full sm:w-64 pl-10 pr-3 py-2 border border-gray-200 dark:border-[#26262d] rounded-lg text-sm focus:ring-primary focus:border-primary outline-none dark:bg-[#111113] dark:text-gray-100"
              placeholder="Search orders..."
            />
          </div>
          <button className="flex items-center justify-center p-2 border border-gray-200 dark:border-[#26262d] rounded-lg bg-white dark:bg-[#151518] text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-[#1c1c21] dark:bg-white/5 transition-colors relative">
            <Filter className="h-5 w-5" />
            <span className="absolute -top-1 -right-1 bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] flex items-center justify-center">
              0
            </span>
          </button>
        </div>

        {loading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredOrders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-white/10">
              <thead className="bg-gray-50 dark:bg-white/5">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Order ID</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Product</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Date</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Total</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Status</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-[#151518] divide-y divide-gray-200 dark:divide-white/10">
                {filteredOrders.map((order) => {
                  const effectiveStatus = getEffectiveStatus(order);
                  const timeline = getTimelineSteps(effectiveStatus);
                  return (
                  <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-[#1c1c21] dark:bg-white/5 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                      #{order.id.substring(0, 8)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">
                      {order.product.title}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">
                      {format(new Date(order.created_at), 'MMM dd, yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                      ৳{order.total_amount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(effectiveStatus, order.created_at)}
                      <div className="mt-2 flex items-center gap-1.5">
                        {timeline.steps.map((step, idx) => {
                          const activeIndex = timeline.activeIndex;
                          const active = activeIndex >= 0 && idx <= activeIndex;
                          return (
                            <div key={step} className="flex items-center">
                              <span
                                title={step}
                                className={`h-1.5 w-7 rounded-full ${active ? 'bg-indigo-500' : 'bg-gray-200 dark:bg-white/10'}`}
                              />
                              {idx < 3 ? <span className="w-1" /> : null}
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {effectiveStatus === 'pending' && (
                        <button
                          onClick={() => handlePayNow(order.id, order.total_amount)}
                          disabled={processingId === order.id}
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-lg shadow-sm text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 transition-colors"
                        >
                          {processingId === order.id ? (
                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                          )}
                          Pay Now
                        </button>
                      )}
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-16 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center mb-4 border border-gray-100 dark:border-[#26262d]">
              <ShoppingCart className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">No orders yet</h3>
            <p className="text-gray-500 dark:text-gray-400 dark:text-gray-500 text-sm max-w-md">
              {searchQuery 
                ? `No orders found matching "${searchQuery}"` 
                : "Your orders will appear here once you make a purchase"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};