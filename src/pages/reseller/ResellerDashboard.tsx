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
    { name: 'Available Balance', value: `$${data.balance.toFixed(2)}`, icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    { name: 'Total Spent', value: `$${data.totalSpent.toFixed(2)}`, icon: CreditCard, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { name: 'Active Users', value: data.activeUsers, icon: Users, color: 'text-indigo-400', bg: 'bg-indigo-400/10' },
    { name: 'Expiring in 7 Days', value: data.expiringIn7Days, icon: Activity, color: 'text-amber-400', bg: 'bg-amber-400/10' },
    { name: 'Expired Accounts', value: data.expired, icon: RefreshCw, color: 'text-red-400', bg: 'bg-red-400/10' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Overview</h1>
        <p className="text-gray-400 mt-2">Welcome back. Here's what's happening with your account.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-32 bg-white/5 animate-pulse rounded-2xl border border-white/5" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-[#111111]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-6 relative overflow-hidden group hover:border-white/10 transition-colors"
            >
              <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500">
                <stat.icon className={`h-24 w-24 ${stat.color} blur-xl`} />
              </div>
              <div className="relative z-10 flex items-center justify-between mb-4">
                <div className={`p-3 rounded-xl ${stat.bg}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
              <div className="relative z-10">
                <h3 className="text-3xl font-bold text-white mb-1">{stat.value}</h3>
                <p className="text-sm font-medium text-gray-400">{stat.name}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-2 bg-[#111111]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Recent Transactions</h2>
            <Link to="/reseller/add-funds" className="text-sm text-indigo-400 hover:text-indigo-300 font-medium">Add Funds &rarr;</Link>
          </div>
          
          <div className="space-y-4">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-white/5 animate-pulse rounded-xl" />)}
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No recent transactions</div>
            ) : (
              transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${tx.amount > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {tx.amount > 0 ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
                    </div>
                    <div>
                      <p className="font-medium text-gray-200">{tx.description}</p>
                      <p className="text-xs text-gray-500">{new Date(tx.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className={`font-bold ${tx.amount > 0 ? 'text-emerald-400' : 'text-gray-200'}`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)} USD
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-gradient-to-br from-indigo-900/40 to-[#111111]/80 backdrop-blur-xl border border-indigo-500/20 rounded-2xl p-6 flex flex-col"
        >
          <h2 className="text-xl font-bold text-white mb-2">Quick Actions</h2>
          <p className="text-sm text-indigo-200/60 mb-8">Seamlessly manage your reseller business.</p>
          
          <div className="space-y-3 mt-auto">
            <Link to="/reseller/activate" className="flex items-center justify-between p-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-medium transition-colors shadow-lg shadow-indigo-500/20">
              <span className="flex items-center gap-3"><Users className="h-5 w-5" /> Activate New User</span>
              <ArrowUpRight className="h-5 w-5 opacity-70" />
            </Link>
            <Link to="/reseller/users" className="flex items-center justify-between p-4 rounded-xl bg-white/5 hover:bg-white/10 text-gray-200 font-medium transition-colors border border-white/5">
              <span>Manage Existing Users</span>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
