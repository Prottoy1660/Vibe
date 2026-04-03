import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  ShoppingBag, 
  CreditCard, 
  Wallet,
  LogOut,
  Info,
  Clock,
  Plus,
  Sparkles,
  Infinity as InfinityIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';

import { useNavigate } from 'react-router-dom';
import {
  IllustratorMark,
  PhotoshopMark,
  PremiereMark,
  AfterEffectsMark,
  LightroomMark,
} from '../components/auth/AdobeCreativeSuiteIcons';
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

const TakaIcon = ({ className }: { className?: string }) => (
  <span className={`flex items-center justify-center font-bold text-[1.35rem] leading-none ${className}`}>
    ৳
  </span>
);

export const Dashboard = () => {
  const { user, signOut } = useAuth();
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

      let didRedirect = false;
      try {
        // First check if user is an admin
        const { data: userData } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();

        if (userData?.role === 'admin') {
          didRedirect = true;
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
        // If we redirected to admin, keep loading true to avoid showing customer dashboard UI briefly.
        if (!didRedirect) setLoading(false);
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
      title: 'Total Orders',
      value: stats.totalOrders.toString(),
      caption: 'Your lifetime orders',
      icon: ShoppingBag,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      waveColor: '#8B5CF6',
    },
    {
      title: 'Total Spent',
      value: `৳${stats.totalSpent.toFixed(2)}`,
      caption: 'Total amount spent',
      icon: TakaIcon,
      color: 'text-green-500',
      bgColor: 'bg-green-100',
      waveColor: '#22C55E',
    },
    {
      title: 'Active Subscriptions',
      value: stats.activeSubscriptions.toString(),
      caption: 'Currently active plans',
      icon: CreditCard,
      color: 'text-orange-500',
      bgColor: 'bg-orange-100',
      waveColor: '#F97316',
    },
    {
      title: 'Wallet Balance',
      value: `৳${stats.walletBalance.toFixed(2)}`,
      caption: 'Available balance',
      icon: Wallet,
      color: 'text-blue-500',
      bgColor: 'bg-blue-100',
      waveColor: '#3B82F6',
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
        <div className="animate-pulse space-y-6">
          <div className="h-24 bg-gray-200 rounded-xl"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
          <div className="h-64 bg-gray-200 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard Overview</h1>
      </div>

      {/* Welcome Card */}
      <div className="bg-white dark:bg-[#151518] rounded-2xl p-4 sm:p-6 shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-colors duration-300">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary dark:bg-slate-800 dark:text-white flex items-center justify-center font-bold text-lg transition-colors duration-300">
            {userInitials}
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Welcome</p>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{userName}</h2>
          </div>
        </div>
        <button 
          onClick={signOut}
          className="flex items-center justify-center space-x-2 w-full sm:w-auto px-4 py-2 border border-gray-200 dark:border-[#26262d] rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign out</span>
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className={`bg-white dark:bg-[#151518] rounded-2xl p-6 shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] transition-colors duration-300 relative overflow-hidden group ${stat.title === 'Wallet Balance' ? 'ring-1 ring-primary/20 cursor-pointer hover:shadow-md' : ''}`}
            onClick={() => stat.title === 'Wallet Balance' && setShowRechargeModal(true)}
          >
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-xl ${stat.bgColor.split(' ')[0]} dark:${stat.bgColor.split(' ')[0].replace('100', '500/10').replace('10', '500/10')}`}>
                  <stat.icon className={`w-6 h-6 ${stat.color} dark:${stat.color.replace('500', '400')}`} />
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm font-medium text-gray-400 dark:text-gray-500">{stat.title}</span>
                  {stat.title === 'Wallet Balance' && (
                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full mt-1 flex items-center">
                      <Plus className="w-3 h-3 mr-0.5" /> ADD FUNDS
                    </span>
                  )}
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stat.value}</h3>
            </div>
            
            {/* Decorative subtle wave animation */}
            <div className="absolute bottom-0 left-0 right-0 h-12 opacity-10 transform translate-y-4 group-hover:translate-y-2 transition-transform duration-500">
              <svg viewBox="0 0 1440 320" className="w-full h-full" preserveAspectRatio="none">
                <path 
                  fill={stat.waveColor} 
                  fillOpacity="1" 
                  d="M0,96L48,112C96,128,192,160,288,160C384,160,480,128,576,122.7C672,117,768,149,864,154.7C960,160,1056,139,1152,122.7C1248,107,1344,96,1392,90.7L1440,85.3L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
                ></path>
              </svg>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Promo Banners */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl overflow-hidden shadow-soft dark:shadow-none h-full min-h-[12rem] relative bg-gradient-to-br from-primary to-secondary p-6 sm:p-8 text-white flex flex-col md:flex-row items-center justify-between gap-8 md:gap-4">
          <div className="absolute top-0 right-0 -mt-20 -mr-10 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl mix-blend-overlay pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-40 h-40 bg-purple-900 opacity-30 rounded-full blur-2xl pointer-events-none"></div>
          
          <div className="relative z-10 w-full md:w-3/5 flex flex-col justify-center">
            <span className="inline-block px-3 py-1 mb-4 text-[10px] w-fit uppercase tracking-widest font-bold bg-white/10 rounded-full backdrop-blur-md border border-white/20 text-white shadow-sm">
              Official Partner Perks
            </span>
            <h3 className="text-3xl sm:text-4xl font-black mb-3 tracking-tight flex items-center flex-wrap gap-2">
              Vibe <span className="font-light text-white/50 font-serif italic">×</span> Adobe
            </h3>
            <p className="text-sm font-medium text-white/80 max-w-md leading-relaxed hidden sm:block">
              Bangladesh's trusted source for authentic creative subscriptions. Everything a professional needs.
            </p>
          </div>

          <div className="relative z-10 w-full md:w-2/5 flex items-center justify-center min-h-[140px] perspective-1000">
            <div className="relative w-40 h-36">
              {/* Central Hero Icon - Photoshop */}
              <motion.div 
                className="absolute inset-0 m-auto w-16 h-16 z-30 drop-shadow-2xl"
                animate={{ y: [-4, 4, -4] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              >
                <PhotoshopMark className="w-full h-full rounded-2xl ring-1 ring-white/10 shadow-xl" />
              </motion.div>

              {/* Top Left - Illustrator */}
              <motion.div 
                className="absolute top-0 left-2 w-11 h-11 z-20 drop-shadow-xl"
                animate={{ y: [0, -5, 0], rotate: [-8, -12, -8] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              >
                <IllustratorMark className="w-full h-full rounded-xl ring-1 ring-white/20 shadow-lg" />
              </motion.div>

              {/* Top Right - Premiere */}
              <motion.div 
                className="absolute top-2 right-1 w-10 h-10 z-10 drop-shadow-xl"
                animate={{ y: [0, 4, 0], rotate: [12, 16, 12] }}
                transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 2 }}
              >
                <PremiereMark className="w-full h-full rounded-xl ring-1 ring-white/20 shadow-lg" />
              </motion.div>

              {/* Bottom Left - After Effects */}
              <motion.div 
                className="absolute bottom-1 left-0 w-12 h-12 z-40 drop-shadow-xl"
                animate={{ y: [4, -4, 4], rotate: [-15, -10, -15] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              >
                <AfterEffectsMark className="w-full h-full rounded-2xl ring-1 ring-white/20 shadow-lg" />
              </motion.div>

              {/* Bottom Right - Lightroom */}
              <motion.div 
                className="absolute bottom-3 right-4 w-10 h-10 z-20 drop-shadow-xl"
                animate={{ y: [-3, 3, -3], rotate: [10, 5, 10] }}
                transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
              >
                <LightroomMark className="w-full h-full rounded-xl ring-1 ring-white/20 shadow-lg" />
              </motion.div>
            </div>
          </div>
        </div>

        <div className="rounded-xl overflow-hidden shadow-soft dark:shadow-none h-full min-h-[12rem] relative bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-[#0d0f12] dark:via-[#13151a] dark:to-[#090a0c] p-6 sm:p-8 text-slate-900 dark:text-white border border-slate-200/80 dark:border-white/5 flex flex-col md:flex-row items-center justify-between gap-8 md:gap-4 transition-colors duration-300 group">
          
          {/* Ambient Background Blur Glows */}
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-48 h-48 bg-indigo-500/10 dark:bg-indigo-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-indigo-500/20 transition-colors duration-700"></div>
          <div className="absolute bottom-0 right-20 -mb-10 w-48 h-48 bg-purple-500/10 dark:bg-purple-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-purple-500/20 transition-colors duration-700"></div>
          
          <div className="relative z-10 w-full md:w-3/5 flex flex-col justify-center">
            <span className="inline-block px-3 py-1 mb-4 text-[10px] w-fit uppercase tracking-widest font-bold bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-full border border-indigo-500/20 shadow-sm transition-colors">
              Adobe CC Bundle
            </span>
            <h3 className="text-3xl sm:text-4xl font-black mb-3 tracking-tight">
              All <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500">Adobe Apps</span>
            </h3>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 max-w-md leading-relaxed hidden sm:block transition-colors">
              Photoshop, Illustrator, Premiere Pro, After Effects, and 20+ more. Unlock full access to the complete Creative Cloud suite.
            </p>
            {/* Mobile simplified text */}
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 max-w-md leading-relaxed block sm:hidden">
              Photoshop, Illustrator, Premiere & 20+ more Adobe apps in one bundle.
            </p>
          </div>

          <div className="relative z-10 w-full md:w-2/5 flex items-center justify-center min-h-[140px] mt-2 md:mt-0">
            {/* Orbital UI Design */}
            <div className="relative w-32 h-32 md:w-36 md:h-36 flex items-center justify-center">
              
              {/* Outer Orbiting Ring 1 (Indigo) */}
              <motion.div 
                className="absolute inset-[-15%] rounded-full border border-indigo-500/10 dark:border-indigo-400/10 border-t-indigo-500/60 dark:border-t-indigo-400/60"
                animate={{ rotate: 360 }}
                transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
              >
                <div className="absolute top-0 left-1/2 w-1.5 h-1.5 bg-indigo-400 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.8)] -translate-x-1/2 -translate-y-1/2"></div>
              </motion.div>
              
              {/* Outer Orbiting Ring 2 (Violet) */}
              <motion.div 
                className="absolute inset-[-2%] rounded-full border border-violet-500/10 dark:border-violet-400/10 border-b-violet-500/60 dark:border-b-violet-400/60"
                animate={{ rotate: -360 }}
                transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
              >
                <div className="absolute bottom-0 left-1/2 w-2 h-2 bg-violet-400 rounded-full shadow-[0_0_8px_rgba(139,92,246,0.8)] -translate-x-1/2 translate-y-1/2"></div>
              </motion.div>

              {/* Inner Orbiting Ring 3 (Purple) */}
              <motion.div 
                className="absolute inset-[12%] rounded-full border border-purple-500/10 dark:border-purple-400/10 border-r-purple-500/60 dark:border-r-purple-400/60"
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              />

              {/* Central Glowing Orb (Cosmic Indigo Core) */}
              <motion.div 
                className="absolute inset-[25%] rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 shadow-[0_0_30px_rgba(99,102,241,0.4)] flex items-center justify-center p-[2px]"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="w-full h-full bg-gradient-to-br from-white to-slate-200 dark:from-[#13151a] dark:to-[#090b0e] rounded-full flex items-center justify-center shadow-inner relative overflow-hidden backdrop-blur-md">
                  <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent dark:from-white/10 dark:to-transparent"></div>
                  
                  {/* Holographic Icon Styling */}
                  <InfinityIcon className="w-10 h-10 md:w-12 md:h-12 text-slate-800 dark:text-white drop-shadow-md relative z-10" strokeWidth={1.5} />
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* Notices Panel */}
      <div className="bg-white dark:bg-[#151518] rounded-2xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] overflow-hidden transition-colors duration-300">
        <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-[#26262d] flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
              <span className="bg-primary/10 dark:bg-primary/20 text-primary dark:text-indigo-400 p-1.5 rounded-lg mr-2">
                <Info className="w-5 h-5" />
              </span>
              Important Notices
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Stay updated with the latest announcements</p>
          </div>
          <span className="bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 text-xs font-medium px-2.5 py-1 rounded-full">
            {notices.length} notice{notices.length !== 1 ? 's' : ''}
          </span>
        </div>
        
        <div className="p-4 sm:p-6">
          {notices.length > 0 ? (
            <div className="space-y-4">
              {notices.map((notice) => (
                <div key={notice.id} className="border border-blue-100 dark:border-blue-900/30 rounded-xl p-4 sm:p-5 bg-blue-50/50 dark:bg-blue-500/5 transition-colors">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="font-semibold text-blue-900 dark:text-blue-100 flex items-center">
                      <Info className="w-4 h-4 mr-2 text-blue-500 dark:text-blue-400" />
                      {notice.title}
                    </h4>
                    <span className="bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 text-xs font-medium px-2.5 py-0.5 rounded-full">
                      Info
                    </span>
                  </div>
                  
                  <div className="text-sm text-blue-800 dark:text-blue-200/80 space-y-2 mb-4">
                    {notice.content.split('\n').map((paragraph, i) => (
                      <p key={i} className="break-words leading-relaxed">{paragraph}</p>
                    ))}
                  </div>
                  
                  <div className="flex items-center text-xs text-blue-600/70 dark:text-blue-400/60">
                    <Clock className="w-3 h-3 mr-1" />
                    {formatDistanceToNow(new Date(notice.created_at), { addSuffix: true })} • 
                    {new Date(notice.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="mx-auto w-12 h-12 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-3">
                <Info className="w-6 h-6 text-gray-400 dark:text-gray-500" />
              </div>
              <p className="text-gray-500 dark:text-gray-400 font-medium">No new notices</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">You're all caught up!</p>
            </div>
          )}
        </div>
      </div>

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
                      Bkash, Nagad, Rocket (UddoktaPay)
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
