import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, Users, RefreshCw, Activity, ArrowUpRight, ArrowDownRight, CreditCard } from 'lucide-react';
import { ResellerApi, Transaction } from '../../services/reseller/resellerApi';
import { Link } from 'react-router-dom';

export const ResellerDashboard = () => {
  const [data, setData] = useState({ 
    balance: 0, 
    totalSpent: 0,
    activeUsers: 0, 
    totalUsers: 0, 
    refunded: 0,
    expired: 0,
    expiringIn7Days: 0
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dashboardData, txData] = await Promise.all([
          ResellerApi.getDashboardData(),
          ResellerApi.getTransactions()
        ]);
        setData(dashboardData);
        setTransactions(txData.slice(0, 5)); // Show only latest 5
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const stats = [
    { name: 'Available Balance', value: `$${data.balance.toFixed(2)}`, icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { name: 'Total Spent', value: `$${data.totalSpent.toFixed(2)}`, icon: CreditCard, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { name: 'Active Users', value: data.activeUsers, icon: Users, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
    { name: 'Expiring in 7 Days', value: data.expiringIn7Days, icon: Activity, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { name: 'Expired Accounts', value: data.expired, icon: RefreshCw, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  ];

  return (
    <div className="space-y-6 lg:space-y-10 pb-10">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl lg:text-4xl font-extrabold text-white tracking-tight">Overview</h1>
          <p className="text-gray-400 mt-1 lg:mt-2 text-base lg:text-lg">Welcome back. Here's what's happening with your account today.</p>
        </div>
        <Link 
          to="/reseller/add-funds" 
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 lg:px-6 lg:py-3 rounded-xl bg-white text-black font-semibold hover:bg-gray-100 transition-all active:scale-95 shadow-lg shadow-white/10 w-full sm:w-auto"
        >
          <DollarSign className="h-5 w-5" />
          Add Funds
        </Link>
      </div>

      {/* Stats Grid */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`h-28 lg:h-36 bg-white/5 animate-pulse rounded-2xl lg:rounded-3xl border border-white/5 ${i === 1 ? 'col-span-2 lg:col-span-1' : ''}`} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.4, ease: "easeOut" }}
              className={`bg-[#111111] border border-white/5 rounded-2xl lg:rounded-3xl p-4 lg:p-6 relative overflow-hidden group hover:border-white/10 transition-all hover:shadow-2xl hover:-translate-y-1 ${i === 0 ? 'col-span-2 lg:col-span-1' : ''}`}
            >
              <div className="absolute -top-6 -right-6 p-4 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-500 ease-out">
                <stat.icon className={`h-24 w-24 lg:h-32 lg:w-32 ${stat.color} blur-xl lg:blur-2xl`} />
              </div>
              <div className="relative z-10 flex flex-col h-full justify-between">
                <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-xl lg:rounded-2xl ${stat.bg} flex items-center justify-center mb-3 lg:mb-4`}>
                  <stat.icon className={`h-5 w-5 lg:h-6 lg:w-6 ${stat.color}`} />
                </div>
                <div>
                  <h3 className="text-2xl lg:text-3xl font-bold text-white mb-0.5 lg:mb-1 tracking-tight">{stat.value}</h3>
                  <p className="text-xs lg:text-sm font-medium text-gray-500 line-clamp-1">{stat.name}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="lg:col-span-2 bg-[#111111] border border-white/5 rounded-3xl p-5 lg:p-8"
        >
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-white tracking-tight">Recent Transactions</h2>
            <Link to="/reseller/transactions" className="text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors">View all &rarr;</Link>
          </div>
          
          <div className="space-y-3">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-white/5 animate-pulse rounded-2xl" />)}
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CreditCard className="h-6 w-6 text-gray-500" />
                </div>
                <p className="text-gray-400 font-medium">No recent transactions</p>
                <p className="text-sm text-gray-500 mt-1">Your transaction history will appear here.</p>
              </div>
            ) : (
              transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-4 sm:p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all group gap-3">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-full flex items-center justify-center ${tx.amount > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                      {tx.amount > 0 ? <ArrowUpRight className="h-4 w-4 sm:h-5 sm:w-5" /> : <ArrowDownRight className="h-4 w-4 sm:h-5 sm:w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-200 group-hover:text-white transition-colors truncate break-words whitespace-normal leading-snug">{tx.description}</p>
                      <p className="text-xs sm:text-sm text-gray-500 mt-0.5">{new Date(tx.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                    </div>
                  </div>
                  <div className={`text-base sm:text-lg font-bold shrink-0 text-right ${tx.amount > 0 ? 'text-emerald-500' : 'text-white'}`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)} <span className="text-xs sm:text-sm font-medium text-gray-500 block sm:inline">USD</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="bg-gradient-to-b from-indigo-600 to-indigo-900 rounded-3xl p-8 flex flex-col relative overflow-hidden"
        >
          {/* Decorative background elements */}
          <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-32 h-32 bg-black/20 rounded-full blur-2xl"></div>

          <div className="relative z-10">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-6 backdrop-blur-md">
              <Activity className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Quick Actions</h2>
            <p className="text-indigo-200 mb-8 leading-relaxed">Streamline your workflow. Activate new users or manage your existing subscriptions.</p>
          </div>
          
          <div className="space-y-3 mt-auto relative z-10">
            <Link to="/reseller/activate" className="flex items-center justify-between p-4 rounded-2xl bg-white text-indigo-900 font-bold hover:bg-gray-50 transition-all active:scale-95 shadow-xl shadow-black/10">
              <span className="flex items-center gap-3"><Users className="h-5 w-5" /> Activate User</span>
              <ArrowUpRight className="h-5 w-5 opacity-70" />
            </Link>
            <Link to="/reseller/users" className="flex items-center justify-center p-4 rounded-2xl bg-black/20 hover:bg-black/30 text-white font-medium transition-all backdrop-blur-md">
              <span>Manage Existing Users</span>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
