import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { 
  Users, 
  ShoppingBag, 
  Mail, 
  Upload,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Ticket,
  Package,
  ArrowLeft,
  Info,
  XCircle
} from 'lucide-react';
import { format, addMonths, isPast, parseISO, differenceInDays } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';

import { AdminProducts } from '../components/admin/AdminProducts';
import { AdminOrders } from '../components/admin/AdminOrders';
import { AdminUsers } from '../components/admin/AdminUsers';
import { AdminCoupons } from '../components/admin/AdminCoupons';
import { AdminNotices } from '../components/admin/AdminNotices';
import { AdminEmails } from '../components/admin/AdminEmails';
import { AdminUserEmails } from '../components/admin/AdminUserEmails';
import { AdminAnalytics } from '../components/admin/AdminAnalytics';
import { AdminBulkUpload } from '../components/admin/AdminBulkUpload';
import { AdminIntelligence } from '../components/admin/AdminIntelligence';
import { TrendingUp, ShieldAlert } from 'lucide-react';

export const AdminDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  
  // Read activeTab from URL, default to 'overview'
  const activeTab = searchParams.get('tab') || 'overview';

  const setActiveTab = (tab: string) => {
    navigate(`/admin?tab=${tab}`);
  };

  const [stats, setStats] = useState({
    activeUsers: 0,
    emailsUsed: 0,
    emailsRemaining: 0,
    expiringSoon: 0,
    expired: 0,
    replaced: 0
  });
  const [loading, setLoading] = useState(true);
  
  const [bulkUploadText, setBulkUploadText] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  useEffect(() => {
    const checkAdminAndFetchData = async () => {
      if (!user) return;
      
      try {
        // 1. Check if user is admin
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();
          
        if (userError || userData?.role !== 'admin') {
          setIsAdmin(false);
          navigate('/');
          return;
        }
        
        setIsAdmin(true);
        
        // 2. Fetch stats
        // Active Users
        const { count: activeUsers } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true });
          
        // Email Stats from Pool
        const { data: emails } = await supabase
          .from('emails_pool')
          .select('status');
          
        const emailsUsed = emails?.filter(e => e.status === 'assigned' || e.status === 'used').length || 0;
        const emailsRemaining = emails?.filter(e => e.status === 'available').length || 0;

        // User Emails Status Stats
        const { data: userEmails } = await supabase
          .from('user_emails')
          .select(`
            id,
            assigned_at,
            order_id,
            orders:order_id (
              created_at,
              status,
              products:product_id (duration)
            )
          `)
          .order('assigned_at', { ascending: false });

        let expiringSoon = 0;
        let expired = 0;
        let replaced = 0;

        if (userEmails) {
          // Group by order_id to find replaced
          const groupedByOrder = userEmails.reduce((acc: any, curr: any) => {
            const oId = curr.order_id || 'unassigned';
            if (!acc[oId]) acc[oId] = [];
            acc[oId].push(curr);
            return acc;
          }, {});

          Object.values(groupedByOrder).forEach((orderGroup: any) => {
            orderGroup.forEach((item: any, index: number) => {
              const isReplaced = index > 0;
              const isRevoked = item.orders?.status === 'refunded' || item.orders?.status === 'cancelled';
              
              if (isRevoked) return; // Skip revoked in these specific counts

              if (isReplaced) {
                replaced++;
                return;
              }

              if (item.orders && item.orders.products) {
                const durationStr = item.orders.products.duration.toLowerCase();
                let monthsToAdd = 1;
                
                if (durationStr.includes('year') || durationStr.includes('yr')) {
                  const match = durationStr.match(/\d+/);
                  monthsToAdd = match ? parseInt(match[0]) * 12 : 12;
                } else {
                  const match = durationStr.match(/\d+/);
                  monthsToAdd = match ? parseInt(match[0]) : 1;
                }

                const orderDate = parseISO(item.orders.created_at);
                const expiresAt = addMonths(orderDate, monthsToAdd);
                const isExp = isPast(expiresAt);
                const daysLeft = isExp ? 0 : differenceInDays(expiresAt, new Date());

                if (isExp) {
                  expired++;
                } else if (daysLeft <= 7) {
                  expiringSoon++;
                }
              }
            });
          });
        }
        
        setStats({
          activeUsers: activeUsers || 0,
          emailsUsed,
          emailsRemaining,
          expiringSoon,
          expired,
          replaced
        });
        
      } catch (error) {
        console.error('Error in admin dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    checkAdminAndFetchData();
  }, [user, navigate]);

  const handleBulkUpload = async () => {
    if (!bulkUploadText.trim()) return;
    
    setUploadLoading(true);
    setUploadMessage(null);
    
    try {
      const lines = bulkUploadText.split('\n').filter(line => line.trim() !== '');
      const newEmails = [];
      
      for (const line of lines) {
        const [email, password] = line.split(',').map(s => s.trim());
        if (email && password) {
          newEmails.push({
            email,
            password,
            status: 'available'
          });
        }
      }
      
      if (newEmails.length === 0) {
        setUploadMessage({ type: "error", text: "No valid email, password pairs found." });
        setUploadLoading(false);
        return;
      }
      
      const { error } = await supabase
        .from('emails_pool')
        .insert(newEmails);
        
      if (error) {
        if (error.code === '23505') {
          setUploadMessage({ type: 'error', text: 'One or more emails already exist in the database.' });
        } else {
          throw error;
        }
      } else {
        setUploadMessage({ type: 'success', text: `Successfully uploaded ${newEmails.length} emails.` });
        setBulkUploadText('');
        
        // Refresh stats
        setStats(prev => ({
          ...prev,
          emailsRemaining: prev.emailsRemaining + newEmails.length
        }));
      }
    } catch (error) {
      console.error('Error uploading emails:', error);
      setUploadMessage({ type: 'error', text: 'An error occurred during upload.' });
    } finally {
      setUploadLoading(false);
    }
  };

  if (loading || isAdmin === null) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isAdmin === false) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Mobile Menu Button & Title */}
      <div className="flex items-center justify-between md:hidden bg-white dark:bg-[#151518] p-4 rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] mb-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Admin Panel</h1>
      </div>

      {/* Header section for desktop */}
      <div className="hidden md:flex justify-between items-center bg-white dark:bg-[#151518] p-6 rounded-2xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] transition-colors duration-300">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {activeTab === 'overview' && 'Admin Dashboard'}
          {activeTab === 'products' && 'Product Management'}
          {activeTab === 'orders' && 'Order Management'}
          {activeTab === 'users' && 'User Management'}
          {activeTab === 'coupons' && 'Coupon Management'}
          {activeTab === 'notices' && 'Notice Management'}
          {activeTab === 'emails' && 'Email Inventory'}
          {activeTab === 'analytics' && 'Financial Analytics'}
          {activeTab === 'user_emails' && 'User Subscriptions'}
          {activeTab === 'intelligence' && '🔍 User Intelligence'}
        </h1>
        <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">
          <ShieldAlert className="w-5 h-5 text-indigo-500" />
          Administrator Access
        </div>
      </div>

      {activeTab === 'products' && <AdminProducts />}
      {activeTab === 'orders' && <AdminOrders />}
      {activeTab === 'users' && <AdminUsers />}
      {activeTab === 'coupons' && <AdminCoupons />}
      {activeTab === 'notices' && <AdminNotices />}
      {activeTab === 'emails' && <AdminEmails />}
      {activeTab === 'analytics' && <AdminAnalytics />}
      {activeTab === 'user_emails' && <AdminUserEmails />}
      {activeTab === 'intelligence' && <AdminIntelligence />}

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            
            <div className="bg-white dark:bg-[#151518] rounded-xl p-5 shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Active Users</p>
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.activeUsers}</h3>
            </div>
            
            <div className="bg-white dark:bg-[#151518] rounded-xl p-5 shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Emails Used</p>
                <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                  <Mail className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.emailsUsed}</h3>
            </div>
            
            <div className="bg-white dark:bg-[#151518] rounded-xl p-5 shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Emails Remaining</p>
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <Mail className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.emailsRemaining}</h3>
            </div>

            <div className="bg-white dark:bg-[#151518] rounded-xl p-5 shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Expiring Soon</p>
                <div className="p-2 bg-yellow-50 text-yellow-600 rounded-lg">
                  <AlertCircle className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.expiringSoon}</h3>
            </div>

            <div className="bg-white dark:bg-[#151518] rounded-xl p-5 shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Expired Accounts</p>
                <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                  <XCircle className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.expired}</h3>
            </div>

            <div className="bg-white dark:bg-[#151518] rounded-xl p-5 shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Replaced Emails</p>
                <div className="p-2 bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 rounded-lg">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.replaced}</h3>
            </div>

          </div>

          <div className="mt-8">
            <AdminAnalytics />
          </div>
        </div>
      )}
    </div>
  );
};