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
  XCircle,
  Fingerprint,
  Gift,
  TrendingUp,
  ShieldAlert,
  LayoutDashboard,
  LifeBuoy,
  Settings,
  Bell,
  Megaphone,
  Music2,
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
import { AdminRedeemCodes } from '../components/admin/AdminRedeemCodes';
import { AdminTutorialHelp } from '../components/admin/AdminTutorialHelp';
import { AdminOpsCenter } from '../components/admin/AdminOpsCenter';
import { AdminGrowthOps } from '../components/admin/AdminGrowthOps';
import { AdminSupport } from '../components/admin/AdminSupport';
import { AdminPlatformSettings } from '../components/admin/AdminPlatformSettings';
import { AdminWaitlist } from '../components/admin/AdminWaitlist';
import { AdminUserNotifications } from '../components/admin/AdminUserNotifications';
import { AdminLobbyMusic } from '../components/admin/AdminLobbyMusic';
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
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {activeTab === 'analytics' ? 'Financial Analytics' : 'Admin Panel'}
        </h1>
        {activeTab === 'analytics' && (
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <ShieldAlert className="w-4 h-4 text-indigo-500" />
            Admin
          </div>
        )}
      </div>

      {/* Header section for desktop — Financial Analytics uses its own hero inside AdminAnalytics */}
      {activeTab !== 'analytics' && (
        <div className="hidden md:flex justify-between items-center bg-white dark:bg-[#151518] p-6 rounded-2xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] transition-colors duration-300">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {activeTab === 'overview' && 'Admin Dashboard'}
            {activeTab === 'products' && 'Product Management'}
            {activeTab === 'orders' && 'Order Management'}
            {activeTab === 'users' && 'User Management'}
            {activeTab === 'coupons' && 'Coupon Management'}
            {activeTab === 'notices' && 'Notice Management'}
            {activeTab === 'user_notifications' && (
              <span className="flex items-center gap-2">
                <Megaphone className="w-6 h-6" />
                User notifications
              </span>
            )}
            {activeTab === 'emails' && 'Email Inventory'}
            {activeTab === 'user_emails' && 'User Subscriptions'}
            {activeTab === 'intelligence' && (
              <span className="flex items-center gap-2">
                <Fingerprint className="w-6 h-6" />
                User Intelligence
              </span>
            )}
            {activeTab === 'redeem' && (
              <span className="flex items-center gap-2">
                <Gift className="w-6 h-6" />
                Redeem Codes
              </span>
            )}
            {activeTab === 'tutorial_help' && 'Tutorial & Help Page'}
            {activeTab === 'ops' && 'Ops Center'}
            {activeTab === 'growth_ops' && 'Growth Ops'}
            {activeTab === 'support' && (
              <span className="flex items-center gap-2">
                <LifeBuoy className="w-6 h-6" />
                Support tickets
              </span>
            )}
            {activeTab === 'lobby_music' && (
              <span className="flex items-center gap-2">
                <Music2 className="w-6 h-6" />
                Lobby music
              </span>
            )}
          </h1>
          <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            <ShieldAlert className="w-5 h-5 text-indigo-500" />
            Administrator Access
          </div>
        </div>
      )}

      {activeTab === 'products' && <AdminProducts />}
      {activeTab === 'orders' && <AdminOrders />}
      {activeTab === 'users' && <AdminUsers />}
      {activeTab === 'coupons' && <AdminCoupons />}
      {activeTab === 'notices' && <AdminNotices />}
      {activeTab === 'emails' && <AdminEmails />}
      {activeTab === 'analytics' && <AdminAnalytics />}
      {activeTab === 'user_emails' && <AdminUserEmails />}
      {activeTab === 'intelligence' && <AdminIntelligence />}
      {activeTab === 'redeem' && <AdminRedeemCodes />}
      {activeTab === 'tutorial_help' && <AdminTutorialHelp />}
      {activeTab === 'ops' && <AdminOpsCenter />}
      {activeTab === 'growth_ops' && <AdminGrowthOps />}
      {activeTab === 'support' && <AdminSupport />}
      {activeTab === 'platform_settings' && <AdminPlatformSettings />}
      {activeTab === 'lobby_music' && <AdminLobbyMusic />}
      {activeTab === 'user_notifications' && <AdminUserNotifications />}
      {activeTab === 'waitlist' && <AdminWaitlist />}

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="relative overflow-hidden rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
            <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
            <div className="relative flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shrink-0">
                  <LayoutDashboard className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Admin overview</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
                    Quick read on users, the shared email pool, and subscription health. Revenue charts are below — open{' '}
                    <span className="font-medium text-gray-800 dark:text-gray-200">Financial Analytics</span> in the sidebar for the same view on its own page.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/admin?tab=analytics')}
                className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-500/25 transition-colors"
              >
                <TrendingUp className="w-4 h-4" />
                Full financial analytics
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 dark:border-[#26262d] bg-indigo-50/40 dark:bg-indigo-500/5 px-4 py-3 flex items-start gap-2">
            <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-800 dark:text-gray-200">Pool</span> counts come from the inventory you upload.{' '}
              <span className="font-medium text-gray-800 dark:text-gray-200">Health</span> counts apply to Adobe emails already assigned from orders (excludes refunded/cancelled).
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 md:p-6 shadow-sm dark:shadow-none">
              <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
                Platform &amp; email pool
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl border border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Active users</span>
                    <div className="p-1.5 bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-lg">
                      <Users className="w-4 h-4" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{stats.activeUsers}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-1">Registered accounts</p>
                </div>
                <div className="rounded-xl border border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Emails used</span>
                    <div className="p-1.5 bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 rounded-lg">
                      <Mail className="w-4 h-4" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{stats.emailsUsed}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-1">Assigned or used from pool</p>
                </div>
                <div className="rounded-xl border border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Remaining</span>
                    <div className="p-1.5 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-lg">
                      <Mail className="w-4 h-4" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{stats.emailsRemaining}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-1">Available in pool</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 md:p-6 shadow-sm dark:shadow-none">
              <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
                Assigned email health
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl border border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Expiring soon</span>
                    <div className="p-1.5 bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 rounded-lg">
                      <AlertCircle className="w-4 h-4" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{stats.expiringSoon}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-1">Within 7 days</p>
                </div>
                <div className="rounded-xl border border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Expired</span>
                    <div className="p-1.5 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-lg">
                      <XCircle className="w-4 h-4" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{stats.expired}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-1">Past renewal window</p>
                </div>
                <div className="rounded-xl border border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Replaced</span>
                    <div className="p-1.5 bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-gray-300 rounded-lg">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{stats.replaced}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-1">Superseded by a new assign</p>
                </div>
              </div>
            </div>
          </div>

          <AdminAnalytics embedded />
        </div>
      )}
    </div>
  );
};