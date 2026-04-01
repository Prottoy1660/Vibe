import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  ShoppingBag, 
  DollarSign, 
  CreditCard, 
  Wallet,
  LogOut,
  Info,
  Clock
} from 'lucide-react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';

import { useNavigate } from 'react-router-dom';

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

  useEffect(() => {
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
      icon: DollarSign,
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
      <div className="bg-white dark:bg-[#151518] rounded-2xl p-6 shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] flex items-center justify-between transition-colors duration-300">
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
          className="flex items-center space-x-2 px-4 py-2 border border-gray-200 dark:border-[#26262d] rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
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
            className="bg-white dark:bg-[#151518] rounded-2xl p-6 shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] transition-colors duration-300 relative overflow-hidden group"
          >
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-xl ${stat.bgColor.split(' ')[0]} dark:${stat.bgColor.split(' ')[0].replace('100', '500/10').replace('10', '500/10')}`}>
                  <stat.icon className={`w-6 h-6 ${stat.color} dark:${stat.color.replace('500', '400')}`} />
                </div>
                <span className="text-sm font-medium text-gray-400 dark:text-gray-500">{stat.title}</span>
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
        <div className="rounded-xl overflow-hidden shadow-soft dark:shadow-none h-48 relative bg-gradient-to-br from-primary to-secondary p-6 text-white flex flex-col justify-center">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white dark:bg-[#151518] opacity-10 rounded-full blur-2xl"></div>
          <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-32 h-32 bg-white dark:bg-[#151518] opacity-10 rounded-full blur-xl"></div>
          
          <div className="relative z-10">
            <p className="text-sm font-medium mb-2 opacity-90">Bangladesh's Trusted Source For Authentic Subscriptions</p>
            <h3 className="text-2xl font-bold mb-4">Vibe Access x Adobe</h3>
            <div className="flex space-x-2">
              {['Ai', 'Ps', 'Pr', 'Ae', 'Lr'].map(icon => (
                <div key={icon} className="w-8 h-8 rounded-md bg-white/20 flex items-center justify-center font-bold text-xs backdrop-blur-sm border border-white/30">
                  {icon}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl overflow-hidden shadow-soft dark:shadow-none h-48 relative bg-gradient-to-br from-slate-100 via-white to-slate-200 dark:from-[#111113] dark:via-[#151518] dark:to-[#1c1c21] p-6 text-slate-900 dark:text-white border border-slate-200/80 dark:border-[#26262d] flex flex-col justify-center transition-colors duration-300">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 dark:from-emerald-500/20 dark:to-teal-500/20"></div>
          
          <div className="relative z-10 flex justify-between items-center h-full">
            <div className="w-1/2">
              <h3 className="text-xl font-bold mb-2">Everything in ONE Bundle!</h3>
              <p className="text-xs text-slate-600 dark:text-gray-300">Storyblocks, Freepik, Envato Elements, Motion Array, Adobe Creative Cloud</p>
            </div>
            <div className="w-1/2 relative h-full flex items-center justify-center">
              <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-yellow-400 to-red-500 animate-pulse opacity-80 blur-sm absolute"></div>
              <div className="w-20 h-20 rounded-full bg-white border-2 border-slate-200 dark:bg-slate-800 dark:border-slate-700 z-10 flex items-center justify-center shadow-2xl transition-colors duration-300">
                <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-orange-500">ALL</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notices Panel */}
      <div className="bg-white dark:bg-[#151518] rounded-2xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] overflow-hidden transition-colors duration-300">
        <div className="p-6 border-b border-gray-100 dark:border-[#26262d] flex justify-between items-center">
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
        
        <div className="p-6">
          {notices.length > 0 ? (
            <div className="space-y-4">
              {notices.map((notice) => (
                <div key={notice.id} className="border border-blue-100 dark:border-blue-900/30 rounded-xl p-5 bg-blue-50/50 dark:bg-blue-500/5 transition-colors">
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
                      <p key={i}>{paragraph}</p>
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
    </div>
  );
};
