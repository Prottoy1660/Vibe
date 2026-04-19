import React, { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  Users,
  Mail,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Info,
  XCircle,
  Fingerprint,
  Gift,
  TrendingUp,
  ShieldAlert,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  Music2,
  MessageCircle,
  Wallet,
  BellRing,
  Download,
  CreditCard,
} from 'lucide-react';
import { format, addMonths, isPast, parseISO, differenceInDays } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';

/** Tab panels load on demand — avoids shipping recharts + heavy admin UI on first /admin paint */
const AdminProducts = React.lazy(() => import('../components/admin/AdminProducts').then((m) => ({ default: m.AdminProducts })));
const AdminOrders = React.lazy(() => import('../components/admin/AdminOrders').then((m) => ({ default: m.AdminOrders })));
const AdminUsers = React.lazy(() => import('../components/admin/AdminUsers').then((m) => ({ default: m.AdminUsers })));
const AdminCoupons = React.lazy(() => import('../components/admin/AdminCoupons').then((m) => ({ default: m.AdminCoupons })));
const AdminNotices = React.lazy(() => import('../components/admin/AdminNotices').then((m) => ({ default: m.AdminNotices })));
const AdminWelcomePopup = React.lazy(() =>
  import('../components/admin/AdminWelcomePopup').then((m) => ({ default: m.AdminWelcomePopup })),
);
const AdminEmails = React.lazy(() => import('../components/admin/AdminEmails').then((m) => ({ default: m.AdminEmails })));
const AdminUserEmails = React.lazy(() => import('../components/admin/AdminUserEmails').then((m) => ({ default: m.AdminUserEmails })));
const AdminAnalytics = React.lazy(() => import('../components/admin/AdminAnalytics').then((m) => ({ default: m.AdminAnalytics })));
const AdminFinance = React.lazy(() => import('../components/admin/AdminFinance').then((m) => ({ default: m.AdminFinance })));
const AdminExpenses = React.lazy(() => import('../components/admin/AdminExpenses.tsx').then((m) => ({ default: m.AdminExpenses })));
const AdminIntelligence = React.lazy(() => import('../components/admin/AdminIntelligence').then((m) => ({ default: m.AdminIntelligence })));
const AdminRedeemCodes = React.lazy(() => import('../components/admin/AdminRedeemCodes').then((m) => ({ default: m.AdminRedeemCodes })));
const AdminTutorialHelp = React.lazy(() => import('../components/admin/AdminTutorialHelp').then((m) => ({ default: m.AdminTutorialHelp })));
const AdminOpsCenter = React.lazy(() => import('../components/admin/AdminOpsCenter').then((m) => ({ default: m.AdminOpsCenter })));
const AdminGrowthOps = React.lazy(() => import('../components/admin/AdminGrowthOps').then((m) => ({ default: m.AdminGrowthOps })));
const AdminSupport = React.lazy(() => import('../components/admin/AdminSupport').then((m) => ({ default: m.AdminSupport })));
const AdminPlatformSettings = React.lazy(() => import('../components/admin/AdminPlatformSettings').then((m) => ({ default: m.AdminPlatformSettings })));
const AdminWaitlist = React.lazy(() => import('../components/admin/AdminWaitlist').then((m) => ({ default: m.AdminWaitlist })));
const AdminUserNotifications = React.lazy(() => import('../components/admin/AdminUserNotifications').then((m) => ({ default: m.AdminUserNotifications })));
const AdminUserInboxHistory = React.lazy(() => import('../components/admin/AdminUserInboxHistory').then((m) => ({ default: m.AdminUserInboxHistory })));
const AdminPushSubscriptions = React.lazy(() => import('../components/admin/AdminPushSubscriptions').then((m) => ({ default: m.AdminPushSubscriptions })));
const AdminLobbyMusic = React.lazy(() => import('../components/admin/AdminLobbyMusic').then((m) => ({ default: m.AdminLobbyMusic })));
const AdminSupportChatSettings = React.lazy(() =>
  import('../components/admin/AdminSupportChatSettings').then((m) => ({ default: m.AdminSupportChatSettings })),
);
const AdminSidebarConfig = React.lazy(() =>
  import('../components/admin/AdminSidebarConfig').then((m) => ({ default: m.AdminSidebarConfig }))
);
const AdminAppDownloads = React.lazy(() =>
  import('../components/admin/AdminAppDownloads').then((m) => ({ default: m.AdminAppDownloads }))
);
const AdminActivityLog = React.lazy(() =>
  import('../components/admin/AdminActivityLog').then((m) => ({ default: m.AdminActivityLog }))
);
const AdminSubscriptionReminders = React.lazy(() =>
  import('../components/admin/AdminSubscriptionReminders').then((m) => ({ default: m.AdminSubscriptionReminders })),
);
const AdminUddoktaPaySettings = React.lazy(() =>
  import('../components/admin/AdminUddoktaPaySettings').then((m) => ({ default: m.AdminUddoktaPaySettings })),
);
const AdminBkashTokenizedSettings = React.lazy(() =>
  import('../components/admin/AdminBkashTokenizedSettings').then((m) => ({ default: m.AdminBkashTokenizedSettings })),
);

const AdminTabFallback = () => (
  <div className="flex justify-center items-center py-16">
    <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
  </div>
);
export const AdminDashboard = () => {
  const { user, loading: authLoading, isAdmin, isSuperAdmin, role } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
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

  // Redirect non-admin users (uses cached role from AuthContext — no extra query)
  useEffect(() => {
    if (authLoading || role === null) return;
    if (!user) {
      navigate('/login', { replace: true });
    } else if (!isAdmin) {
      navigate('/', { replace: true });
    }
  }, [user, isAdmin, role, authLoading, navigate]);

  const fetchAdminStats = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!user || !isAdmin) return;
      const silent = opts?.silent === true;
      if (!silent) setLoading(true);
      try {
        // Fetch all stats in parallel (2-3x faster than sequential)
        const [usersResult, emailsResult, userEmailsResult] = await Promise.all([
          supabase
            .from('users')
            .select('*', { count: 'exact', head: true }),
          supabase
            .from('emails_pool')
            .select('status'),
          supabase
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
            .order('assigned_at', { ascending: false }),
        ]);

        const activeUsers = usersResult.count;
        const emails = emailsResult.data;
        const userEmails = userEmailsResult.data;

        const emailsUsed = emails?.filter((e) => e.status === 'assigned' || e.status === 'used').length || 0;
        const emailsRemaining = emails?.filter((e) => e.status === 'available').length || 0;

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
          replaced,
        });
      } catch (error) {
        console.error('Error in admin dashboard:', error);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [user, isAdmin],
  );

  // Initial load for overview stats.
  useEffect(() => {
    if (!user || !isAdmin) return;
    void fetchAdminStats();
  }, [user, isAdmin, fetchAdminStats]);

  // Realtime auto-refresh for the Overview cards.
  const adminOverviewRtTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!user || !isAdmin || activeTab !== 'overview') return;

    const schedule = () => {
      if (adminOverviewRtTimerRef.current) window.clearTimeout(adminOverviewRtTimerRef.current);
      adminOverviewRtTimerRef.current = window.setTimeout(() => {
        void fetchAdminStats({ silent: true });
      }, 900);
    };

    const channel = supabase
      .channel(`admin_overview_rt:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => schedule())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emails_pool' }, () => schedule())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_emails' }, () => schedule())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => schedule())
      .subscribe();

    return () => {
      if (adminOverviewRtTimerRef.current) window.clearTimeout(adminOverviewRtTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [user, isAdmin, activeTab, fetchAdminStats]);

  if (authLoading || loading || role === null) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Mobile Menu Button & Title */}
      <div className="flex items-center justify-between md:hidden bg-white dark:bg-[#151518] p-4 rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] mb-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {activeTab === 'analytics'
            ? 'Financial Analytics'
            : activeTab === 'finance'
              ? 'Profit'
              : activeTab === 'expenses'
                ? 'Expenses'
              : activeTab === 'activity'
                ? 'Activity log'
                : activeTab === 'subscription_reminders'
                  ? 'Subscription reminders'
                  : activeTab === 'app_downloads'
                    ? 'App downloads'
                  : 'Admin Panel'}
        </h1>
        {(activeTab === 'analytics' ||
          activeTab === 'finance' ||
          activeTab === 'expenses' ||
          activeTab === 'activity' ||
          activeTab === 'subscription_reminders') && (
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <ShieldAlert className="w-4 h-4 text-indigo-500" />
            Admin
          </div>
        )}
      </div>

      {/* Header section for desktop — Financial Analytics uses its own hero inside AdminAnalytics */}
      {activeTab !== 'analytics' && activeTab !== 'finance' && activeTab !== 'activity' && (
        <div className="hidden md:flex justify-between items-center bg-white dark:bg-[#151518] p-6 rounded-2xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] transition-colors duration-300">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {activeTab === 'overview' && 'Admin Dashboard'}
            {activeTab === 'products' && 'Product Management'}
            {activeTab === 'orders' && 'Order Management'}
            {activeTab === 'users' && 'User Management'}
            {activeTab === 'coupons' && 'Coupon Management'}
            {activeTab === 'notices' && 'Notice Management'}
            {activeTab === 'welcome_popup' && 'Welcome popup'}
            {activeTab === 'user_notifications' && (
              <span className="flex items-center gap-2">
                <Megaphone className="w-6 h-6" />
                User notifications
              </span>
            )}
            {activeTab === 'user_inbox_history' && (
              <span className="flex items-center gap-2">
                <Megaphone className="w-6 h-6" />
                Delivery history
              </span>
            )}
            {activeTab === 'push_notifications' && (
              <span className="flex items-center gap-2">
                <BellRing className="w-6 h-6" />
                Push notifications
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
            {activeTab === 'support_chat_ai' && (
              <span className="flex items-center gap-2">
                <MessageCircle className="w-6 h-6" />
                Help chat (AI)
              </span>
            )}
            {activeTab === 'lobby_music' && (
              <span className="flex items-center gap-2">
                <Music2 className="w-6 h-6" />
                Lobby music
              </span>
            )}
            {activeTab === 'sidebar_config' && (
              <span className="flex items-center gap-2">
                <ShieldAlert className="w-6 h-6" />
                Sidebar Visibility
              </span>
            )}
            {activeTab === 'platform_settings' && 'Platform status'}
            {activeTab === 'uddoktapay' && (
              <span className="flex items-center gap-2">
                <CreditCard className="w-6 h-6" />
                UddoktaPay payments
              </span>
            )}
            {activeTab === 'bkash_tokenized' && (
              <span className="flex items-center gap-2">
                <CreditCard className="w-6 h-6" />
                bKash tokenized
              </span>
            )}
            {activeTab === 'subscription_reminders' && (
              <span className="flex items-center gap-2">
                <BellRing className="w-6 h-6" />
                Subscription reminders
              </span>
            )}
            {activeTab === 'waitlist' && 'Waitlist'}
            {activeTab === 'app_downloads' && (
              <span className="flex items-center gap-2">
                <Download className="w-6 h-6" />
                App downloads
              </span>
            )}
          </h1>
          <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            <ShieldAlert className="w-5 h-5 text-indigo-500" />
            {isSuperAdmin && activeTab === 'sidebar_config' ? 'Super Admin Access' : 'Administrator Access'}
          </div>
        </div>
      )}

      <Suspense fallback={<AdminTabFallback />}>
        {activeTab === 'products' && <AdminProducts />}
        {activeTab === 'orders' && <AdminOrders />}
        {activeTab === 'users' && <AdminUsers />}
        {activeTab === 'coupons' && <AdminCoupons />}
        {activeTab === 'notices' && <AdminNotices />}
        {activeTab === 'welcome_popup' && <AdminWelcomePopup />}
        {activeTab === 'emails' && <AdminEmails />}
        {activeTab === 'analytics' && <AdminAnalytics />}
        {activeTab === 'finance' && <AdminFinance />}
        {activeTab === 'expenses' && <AdminExpenses />}
        {activeTab === 'activity' && <AdminActivityLog />}
        {activeTab === 'user_emails' && <AdminUserEmails />}
        {activeTab === 'intelligence' && <AdminIntelligence />}
        {activeTab === 'redeem' && <AdminRedeemCodes />}
        {activeTab === 'tutorial_help' && <AdminTutorialHelp />}
        {activeTab === 'ops' && <AdminOpsCenter />}
        {activeTab === 'growth_ops' && <AdminGrowthOps />}
        {activeTab === 'support' && <AdminSupport />}
        {activeTab === 'support_chat_ai' && <AdminSupportChatSettings />}
        {activeTab === 'platform_settings' && <AdminPlatformSettings />}
        {activeTab === 'uddoktapay' && <AdminUddoktaPaySettings />}
        {activeTab === 'bkash_tokenized' && <AdminBkashTokenizedSettings />}
        {activeTab === 'subscription_reminders' && <AdminSubscriptionReminders />}
        {activeTab === 'lobby_music' && <AdminLobbyMusic />}
        {activeTab === 'user_notifications' && <AdminUserNotifications />}
        {activeTab === 'user_inbox_history' && <AdminUserInboxHistory />}
        {activeTab === 'push_notifications' && <AdminPushSubscriptions />}
        {activeTab === 'waitlist' && <AdminWaitlist />}
        {activeTab === 'app_downloads' && <AdminAppDownloads />}
        {activeTab === 'sidebar_config' && isSuperAdmin && <AdminSidebarConfig />}
      </Suspense>

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
                    Quick read on users, the shared email pool, and subscription health. Use{' '}
                    <span className="font-medium text-gray-800 dark:text-gray-200">Profit &amp; expenses</span> for dated
                    sales, net profit after costs, and{' '}
                    <span className="font-medium text-gray-800 dark:text-gray-200">Financial Analytics</span> for charts.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => navigate('/admin?tab=finance')}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-500 shadow-md shadow-violet-500/25 transition-colors"
                >
                  <Wallet className="w-4 h-4" />
                  Profit &amp; expenses
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/admin?tab=analytics')}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-500/25 transition-colors"
                >
                  <TrendingUp className="w-4 h-4" />
                  Financial analytics
                </button>
              </div>
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

          <Suspense fallback={<AdminTabFallback />}>
            <AdminFinance embedded />
          </Suspense>

          <Suspense fallback={<AdminTabFallback />}>
            <AdminAnalytics embedded />
          </Suspense>
        </div>
      )}
    </div>
  );
};