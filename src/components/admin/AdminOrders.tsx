import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, ShoppingBag, CheckCircle, XCircle, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';

interface Order {
  id: string;
  user_id: string;
  product_id: string;
  status: string;
  payment_status: string;
  payment_method: string;
  total_amount: number;
  created_at: string;
  users?: {
    email: string;
    name: string;
    phone?: string;
  };
  products: {
    title: string;
  };
}

export const AdminOrders = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          users (email, name, phone),
          products (title)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data as unknown as Order[] || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (id: string, newStatus: string, userId?: string) => {
    try {
      const updates: any = { status: newStatus };
      
      // If approving a pending order, also mark payment as paid
      if (newStatus === 'completed') {
        updates.payment_status = 'paid';
      }

      const { error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      // If approving, assign an email automatically just like the payment webhook does
      if (newStatus === 'completed' && userId) {
        try {
          const { data: availableEmail } = await supabase
            .from('emails_pool')
            .select('id')
            .eq('status', 'available')
            .limit(1)
            .single();

          if (availableEmail) {
            await supabase
              .from('emails_pool')
              .update({ status: 'assigned', assigned_at: new Date().toISOString() })
              .eq('id', availableEmail.id);

            await supabase
              .from('user_emails')
              .insert({
                user_id: userId,
                email_id: availableEmail.id,
                order_id: id,
                is_active: true
              });

            const currentMonth = new Date().toISOString().substring(0, 7);
            const { data: existingLog } = await supabase
              .from('email_generation_logs')
              .select('id, count')
              .eq('user_id', userId)
              .eq('month', currentMonth)
              .single();

            if (existingLog) {
              await supabase
                .from('email_generation_logs')
                .update({ count: existingLog.count + 1 })
                .eq('id', existingLog.id);
            } else {
              await supabase
                .from('email_generation_logs')
                .insert({
                  user_id: userId,
                  count: 1,
                  month: currentMonth
                });
            }
          } else {
            alert('Order approved, but no available emails in the pool to assign automatically!');
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

  const handleRefund = async (orderId: string) => {
    if (!window.confirm('Are you sure you want to refund this order? This will revoke the user\'s email access.')) {
      return;
    }

    try {
      // 1. Get ALL assigned emails for this order
      const { data: userEmails } = await supabase
        .from('user_emails')
        .select('email_id')
        .eq('order_id', orderId);

      // 2. If emails were assigned, release them back to the pool
      if (userEmails && userEmails.length > 0) {
        const emailIds = userEmails.map(ue => ue.email_id);
        
        await supabase
          .from('emails_pool')
          .update({ status: 'available', assigned_at: null })
          .in('id', emailIds);

        // Delete the user_email linkage
        await supabase
          .from('user_emails')
          .delete()
          .eq('order_id', orderId);
      }

      // 3. Update order status
      const { error } = await supabase
        .from('orders')
        .update({ status: 'refunded', payment_status: 'refunded' })
        .eq('id', orderId);

      if (error) throw error;
      
      alert('Order refunded and email access revoked successfully.');
      fetchOrders();
      
    } catch (error) {
      console.error('Error processing refund:', error);
      alert('Failed to process refund');
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;
  }

  return (
    <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] overflow-hidden transition-colors duration-300">
      <div className="p-6 border-b border-gray-100 dark:border-[#26262d] flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
          <ShoppingBag className="w-5 h-5 mr-2 text-blue-600" />
          Order Management
        </h3>
      </div>

      <div className="p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-[#26262d]">
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Order Details</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Customer</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Amount & Payment</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Status</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id} className="border-b border-gray-100 dark:border-[#26262d] hover:bg-gray-50/50 dark:hover:bg-[#1c1c21]/50 transition-colors duration-300">
                  <td className="py-3 px-4">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{order.products?.title || 'Unknown Product'}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">ID: {order.id.slice(0, 8)}...</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">{format(new Date(order.created_at), 'MMM dd, yyyy HH:mm')}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{order.users?.name || 'Unknown User'}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{order.users?.email}</div>
                    {order.users?.phone && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{order.users?.phone}</div>}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-gray-900 dark:text-gray-100">৳{order.total_amount}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">{order.payment_method} - {order.payment_status}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium capitalize ${
                      order.status === 'completed' ? 'bg-green-100 dark:bg-emerald-500/10 text-green-700 dark:text-emerald-300' : 
                      order.status === 'paid' ? 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300' : 
                      order.status === 'pending' ? 'bg-yellow-100 dark:bg-amber-500/10 text-yellow-700 dark:text-amber-300' : 
                      order.status === 'cancelled' ? 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-300' :
                      order.status === 'refunded' ? 'bg-gray-200 dark:bg-white/10 text-gray-800 dark:text-gray-200' :
                      'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200'
                    }`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      {order.status === 'pending' && (
                        <>
                          <button 
                            onClick={() => updateOrderStatus(order.id, 'completed', order.user_id)}
                            className="p-1.5 text-green-600 dark:text-emerald-400 hover:bg-green-50 dark:hover:bg-emerald-500/10 rounded flex items-center text-xs font-medium transition-colors duration-300"
                            title="Complete Order"
                          >
                            <CheckCircle className="w-4 h-4 mr-1" /> Approve
                          </button>
                          <button 
                            onClick={() => updateOrderStatus(order.id, 'cancelled')}
                            className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded flex items-center text-xs font-medium transition-colors duration-300"
                            title="Cancel Order"
                          >
                            <XCircle className="w-4 h-4 mr-1" /> Reject
                          </button>
                        </>
                      )}
                      
                      {(order.status === 'completed' || order.status === 'paid') && (
                        <button 
                          onClick={() => handleRefund(order.id)}
                          className="p-1.5 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10 rounded flex items-center text-xs font-medium transition-colors duration-300"
                          title="Refund Order & Revoke Access"
                        >
                          <RotateCcw className="w-4 h-4 mr-1" /> Refund
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500 dark:text-gray-400">
                    No orders found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
