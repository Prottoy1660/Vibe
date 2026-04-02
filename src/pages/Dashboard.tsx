import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  ShoppingBag, 
  DollarSign, 
  CreditCard, 
  Wallet,
  Info,
  Clock,
  Plus,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';

import { useNavigate } from 'react-router-dom';
import { postJsonWithFallback } from '../lib/apiClient';

interface Stats {
  totalOrders: number;
  totalSpent: number;
  activeSubscriptions: number;
  walletBalance: number;
}

interface Notice {
  id: string;
  title: string;
  content: string;
  type: string;
  created_at: string;
}

/** Turn blocks where every line is a bullet into a list; otherwise keep paragraphs */
function NoticeContent({ content }: { content: string }) {
  const paragraphs = content.trim().split(/\n\n+/);
  return (
    <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
      {paragraphs.map((block, pi) => {
        const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
        const firstBulletIdx = lines.findIndex((l) => /^[-•*]\s+/.test(l) || /^\d+\.\s+/.test(l));
        if (firstBulletIdx > 0) {
          const introLines = lines.slice(0, firstBulletIdx);
          const bulletLines = lines.slice(firstBulletIdx);
          const bulletsOk =
            bulletLines.length > 0 &&
            bulletLines.every((l) => /^[-•*]\s+/.test(l) || /^\d+\.\s+/.test(l));
          if (bulletsOk) {
            return (
              <div key={pi} className="space-y-3">
                <p>{introLines.join(' ')}</p>
                <ul className="list-none space-y-2.5">
                  {bulletLines.map((line, li) => (
                    <li key={li} className="flex gap-2.5">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500 dark:bg-indigo-400" aria-hidden />
                      <span>{line.replace(/^[-•*]\s+/, '').replace(/^\d+\.\s+/, '')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          }
        }
        const isAllBullets =
          lines.length > 0 && lines.every((l) => /^[-•*]\s+/.test(l) || /^\d+\.\s+/.test(l));
        if (isAllBullets) {
          return (
            <ul key={pi} className="list-none space-y-2.5">
              {lines.map((line, li) => (
                <li key={li} className="flex gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500 dark:bg-indigo-400" aria-hidden />
                  <span>{line.replace(/^[-•*]\s+/, '').replace(/^\d+\.\s+/, '')}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={pi} className="whitespace-pre-wrap">
            {block}
          </p>
        );
      })}
    </div>
  );
}

export const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({
    totalOrders: 0,
    totalSpent: 0,
    activeSubscriptions: 0,
    walletBalance: 0,
  });
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [recharging, setRecharging] = useState(false);

  useEffect(() => {
    // Check for successful recharge redirect
    const searchParams = new URLSearchParams(window.location.search);
    const rechargeStatus = searchParams.get('recharge');
    if (rechargeStatus === 'success') {
      window.history.replaceState({}, document.title, window.location.pathname);
      alert('Wallet recharge successful! Your balance has been updated.');
    }

    const fetchDashboardData = async () => {
      if (!user) return;

      try {
        // First check if user is an admin
        const { data: userData } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();

        if (userData?.role === 'admin') {
          navigate('/admin', { replace: true });
          return;
        }

        // Fetch orders for stats
        const { data: orders } = await supabase
          .from('orders')
          .select('id, total_amount, status')
          .eq('user_id', user.id);

        if (orders) {
          const completedOrders = orders.filter(o => o.status === 'completed' || o.status === 'paid');
          
          setStats(prev => ({
            ...prev,
            totalOrders: orders.length,
            totalSpent: completedOrders.reduce((sum, order) => sum + Number(order.total_amount), 0),
            activeSubscriptions: completedOrders.length, // Simplified for now
          }));
        }

        // Fetch actual wallet balance
        const { data: walletData } = await supabase
          .from('users')
          .select('wallet_balance')
          .eq('id', user.id)
          .single();
          
        if (walletData) {
          setStats(prev => ({
            ...prev,
            walletBalance: Number(walletData.wallet_balance) || 0,
          }));
        }

        // Fetch notices
        const { data: noticesData } = await supabase
          .from('notices')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(5);

        if (noticesData) {
          setNotices(noticesData);
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [user]);

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const userInitials = userName.substring(0, 2).toUpperCase();

  const handleRecharge = async () => {
    const amount = Number(rechargeAmount);
    if (isNaN(amount) || amount < 10) {
      alert('Please enter a valid amount (minimum 10 BDT)');
      return;
    }

    setRecharging(true);
    try {
      if (!user) return;
      
      const data = await postJsonWithFallback('/api/payment/recharge', {
        user_id: user.id,
        amount: amount,
        full_name: user?.user_metadata?.full_name || 'Customer',
        email: user?.email,
        frontend_url: window.location.origin
      });
      if (data.success && data.payment_url) {
        window.location.href = data.payment_url;
      } else {
        throw new Error(data.message || 'Failed to initialize recharge payment');
      }
    } catch (error: any) {
      console.error('Recharge error:', error);
      alert('Failed to process recharge: ' + error.message);
    } finally {
      setRecharging(false);
    }
  };

  const statCards = [
    {
      key: 'orders',
      title: 'Orders',
      value: stats.totalOrders.toString(),
      caption: 'Lifetime count',
      icon: ShoppingBag,
      iconWrap: 'bg-violet-100 dark:bg-violet-500/15',
      iconClass: 'text-violet-600 dark:text-violet-400',
    },
    {
      key: 'spent',
      title: 'Spent',
      value: `৳${stats.totalSpent.toFixed(2)}`,
      caption: 'Paid & completed',
      icon: DollarSign,
      iconWrap: 'bg-emerald-100 dark:bg-emerald-500/15',
      iconClass: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      key: 'subs',
      title: 'Subscriptions',
      value: stats.activeSubscriptions.toString(),
      caption: 'Active seats',
      icon: CreditCard,
      iconWrap: 'bg-amber-100 dark:bg-amber-500/15',
      iconClass: 'text-amber-700 dark:text-amber-400',
    },
    {
      key: 'wallet',
      title: 'Wallet',
      value: `৳${stats.walletBalance.toFixed(2)}`,
      caption: 'Tap to add funds',
      icon: Wallet,
      iconWrap: 'bg-sky-100 dark:bg-sky-500/15',
      iconClass: 'text-sky-600 dark:text-sky-400',
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-16 bg-gray-200 dark:bg-white/10 rounded-2xl" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-gray-200 dark:bg-white/10 rounded-xl" />
            ))}
          </div>
          <div className="h-40 bg-gray-200 dark:bg-white/10 rounded-xl" />
          <div className="h-48 bg-gray-200 dark:bg-white/10 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16 max-w-5xl mx-auto">
      {/* Title + greeting (sign out stays in the app header only) */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-white/10 flex items-center justify-center font-semibold text-violet-300 dark:text-violet-200 text-sm shrink-0">
          {userInitials}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-indigo-400 dark:text-indigo-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            Your dashboard
          </p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight mt-0.5">
            Hi, {userName}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Quick snapshot of orders, wallet, and announcements. Use the sidebar to open Store, Orders, or Adobe Email.
          </p>
        </div>
      </div>

      {/* Stats — compact, no decorative waves */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((stat, idx) => (
          <motion.div
            key={stat.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            role={stat.key === 'wallet' ? 'button' : undefined}
            tabIndex={stat.key === 'wallet' ? 0 : undefined}
            onClick={() => stat.key === 'wallet' && setShowRechargeModal(true)}
            onKeyDown={(e) => stat.key === 'wallet' && e.key === 'Enter' && setShowRechargeModal(true)}
            className={`rounded-xl border border-gray-200/90 dark:border-[#2a2a32] bg-white dark:bg-[#121214] p-4 shadow-sm dark:shadow-none transition-colors ${
              stat.key === 'wallet'
                ? 'cursor-pointer hover:border-indigo-500/40 hover:bg-indigo-500/[0.03] ring-1 ring-transparent hover:ring-indigo-500/20'
                : ''
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className={`p-2 rounded-lg ${stat.iconWrap}`}>
                <stat.icon className={`w-5 h-5 ${stat.iconClass}`} />
              </div>
            </div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-500 mt-3">
              {stat.title}
            </p>
            <p className="text-xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums mt-0.5">{stat.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 leading-snug">{stat.caption}</p>
            {stat.key === 'wallet' && (
              <span className="mt-2 inline-flex items-center gap-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                <Plus className="w-3.5 h-3.5" />
                Add funds
              </span>
            )}
          </motion.div>
        ))}
      </div>

      {/* Service highlights — calmer cards, less visual noise */}
      <section aria-label="Service highlights">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">What we offer</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-gray-200/90 dark:border-[#2a2a32] bg-white dark:bg-[#121214] p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400">Authentic subscriptions</p>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mt-0.5">
                Vibe Access × Adobe Creative Cloud
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                Trusted access for Bangladesh — Illustrator, Photoshop, Premiere, After Effects, Lightroom, and more.
              </p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              {['Ai', 'Ps', 'Pr', 'Ae', 'Lr'].map((abbr) => (
                <div
                  key={abbr}
                  className="w-8 h-8 rounded-lg bg-violet-500/10 dark:bg-violet-500/15 border border-violet-500/20 flex items-center justify-center text-[10px] font-bold text-violet-700 dark:text-violet-300"
                >
                  {abbr}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200/90 dark:border-[#2a2a32] bg-gradient-to-br from-emerald-950/40 via-[#121214] to-[#121214] p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-emerald-400/90">Bundles</p>
              <h3 className="text-base font-semibold text-gray-100 mt-0.5">Creative stock & tools in one place</h3>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                Storyblocks, Freepik, Envato Elements, Motion Array, plus Adobe — check the store for current plans.
              </p>
            </div>
            <div className="shrink-0 w-14 h-14 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center">
              <span className="text-sm font-bold text-emerald-300">ALL</span>
            </div>
          </div>
        </div>
      </section>

      {/* Notices */}
      <section className="rounded-2xl border border-gray-200/90 dark:border-[#2a2a32] bg-white dark:bg-[#121214] shadow-sm dark:shadow-none overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-white/5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Info className="w-4 h-4" />
              </span>
              Notices
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 pl-10">
              Official updates and how-tos from the team.
            </p>
          </div>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/5 px-2.5 py-1 rounded-full tabular-nums">
            {notices.length} active
          </span>
        </div>

        <div className="p-5 sm:p-6">
          {notices.length > 0 ? (
            <ul className="space-y-4">
              {notices.map((notice) => (
                <li
                  key={notice.id}
                  className="rounded-xl border border-gray-100 dark:border-white/10 bg-gray-50/80 dark:bg-white/[0.03] p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 pr-2">{notice.title}</h4>
                    <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 px-2 py-0.5 rounded-md shrink-0">
                      {notice.type || 'Info'}
                    </span>
                  </div>

                  <NoticeContent content={notice.content} />

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-4 pt-3 border-t border-gray-200/80 dark:border-white/10 text-xs text-gray-500 dark:text-gray-500">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>{formatDistanceToNow(new Date(notice.created_at), { addSuffix: true })}</span>
                    <span className="text-gray-300 dark:text-gray-600" aria-hidden>
                      ·
                    </span>
                    <time dateTime={notice.created_at}>{new Date(notice.created_at).toLocaleDateString()}</time>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-10 rounded-xl border border-dashed border-gray-200 dark:border-white/10">
              <div className="mx-auto w-11 h-11 rounded-xl bg-gray-100 dark:bg-white/5 flex items-center justify-center mb-3">
                <Info className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">No notices right now</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">We will post notices here when there is something important.</p>
            </div>
          )}
        </div>
      </section>

      {/* Wallet Recharge Modal */}
      <AnimatePresence>
        {showRechargeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowRechargeModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-[#151518] rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative z-10 border border-gray-100 dark:border-[#26262d]"
            >
              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Recharge Wallet</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  Add funds to your Vibe Access wallet. These funds will be securely held and automatically used for your auto-renewing subscriptions, so you never lose access.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Amount (BDT)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <span className="text-gray-500 dark:text-gray-400 font-medium font-mono text-lg">৳</span>
                      </div>
                      <input
                        type="number"
                        min="10"
                        value={rechargeAmount}
                        onChange={(e) => setRechargeAmount(e.target.value)}
                        placeholder="e.g. 500"
                        className="block w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-[#111113] border border-gray-200 dark:border-[#26262d] rounded-xl text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all font-medium text-lg"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {[150, 300, 500, 1000].map(amt => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setRechargeAmount(amt.toString())}
                        className="flex-1 py-2 text-sm font-medium border border-gray-200 dark:border-[#26262d] rounded-lg text-gray-600 dark:text-gray-300 hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-colors"
                      >
                        ৳{amt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-white/5 border-t border-gray-100 dark:border-[#26262d] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowRechargeModal(false)}
                  disabled={recharging}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-[#151518] border border-gray-200 dark:border-[#26262d] rounded-lg hover:bg-gray-50 dark:hover:bg-[#1c1c21] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRecharge}
                  disabled={recharging || !rechargeAmount || Number(rechargeAmount) < 10}
                  className="px-6 py-2 text-sm font-medium text-white bg-primary disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 rounded-lg shadow-sm transition-all focus:ring-2 focus:ring-offset-2 focus:ring-primary flex items-center"
                >
                  {recharging ? (
                    'Processing...'
                  ) : (
                    <>
                      <Wallet className="w-4 h-4 mr-2" />
                      Recharge via UddoktaPay
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
