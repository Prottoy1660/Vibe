import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Clock, Zap, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { ResellerApi, ResellerPackage } from '../../services/reseller/resellerApi';
import { useNavigate } from 'react-router-dom';

export const ActivateUser = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [duration, setDuration] = useState('');
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [packages, setPackages] = useState<ResellerPackage[]>([]);
  const [fetchingPkgs, setFetchingPkgs] = useState(true);

  useEffect(() => {
    ResellerApi.getDashboardData().then(d => setBalance(d.balance));
    ResellerApi.getPackages().then(pkgs => {
      setPackages(pkgs);
      if (pkgs.length > 0) setDuration(pkgs[0].value);
      setFetchingPkgs(false);
    });
  }, []);

  const selectedDuration = packages.find(d => d.value === duration);
  const cost = selectedDuration?.cost || 0;
  const hasEnoughBalance = balance >= cost;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !hasEnoughBalance) return;

    setLoading(true);
    setError('');
    
    try {
      await ResellerApi.activateUser(email, duration, cost);
      setSuccess(true);
      setBalance(b => b - cost);
      setTimeout(() => {
        navigate('/reseller/users');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-8 pb-10">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="bg-[#111111] border border-white/5 rounded-3xl overflow-hidden shadow-2xl"
      >
        <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/20 p-10 border-b border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4"></div>
          <div className="relative z-10">
            <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mb-6 backdrop-blur-md shadow-lg border border-white/5">
              <Zap className="h-7 w-7 text-indigo-400" />
            </div>
            <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Activate New User</h1>
            <p className="text-indigo-200/80 text-lg">Provide Adobe Creative Cloud access instantly.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-10 space-y-8">
          <AnimatePresence>
            {success && (
              <motion.div 
                initial={{ opacity: 0, height: 0, marginBottom: 0 }} 
                animate={{ opacity: 1, height: 'auto', marginBottom: 24 }} 
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-4 text-emerald-400 shadow-lg shadow-emerald-500/5 overflow-hidden"
              >
                <CheckCircle2 className="h-6 w-6 flex-shrink-0" />
                <p className="font-medium text-sm">User successfully activated! Redirecting to dashboard...</p>
              </motion.div>
            )}

            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0, marginBottom: 0 }} 
                animate={{ opacity: 1, height: 'auto', marginBottom: 24 }} 
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-4 text-rose-400 shadow-lg shadow-rose-500/5 overflow-hidden"
              >
                <AlertCircle className="h-6 w-6 flex-shrink-0" />
                <p className="font-medium text-sm">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-6">
            <div className="space-y-3">
              <label className="text-sm font-semibold text-gray-300 ml-1">Customer Email</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-indigo-400 text-gray-500">
                  <Mail className="h-5 w-5" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-12 pr-4 py-4 bg-[#0a0a0a] border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder:text-gray-600 shadow-inner"
                  placeholder="customer@example.com"
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-semibold text-gray-300 ml-1">Subscription Duration</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-indigo-400 text-gray-500">
                  <Clock className="h-5 w-5" />
                </div>
                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  disabled={fetchingPkgs}
                  className="block w-full pl-12 pr-10 py-4 bg-[#0a0a0a] border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all appearance-none disabled:opacity-50 shadow-inner font-medium cursor-pointer"
                >
                  {fetchingPkgs ? (
                    <option>Loading packages...</option>
                  ) : packages.length === 0 ? (
                    <option>No packages available</option>
                  ) : (
                    packages.map(d => (
                      <option key={d.id} value={d.value} className="bg-[#111111]">{d.label} - ${d.cost.toFixed(2)}</option>
                    ))
                  )}
                </select>
                <div className="absolute inset-y-0 right-0 pr-5 flex items-center pointer-events-none">
                  <div className="h-2 w-2 border-r-2 border-b-2 border-gray-400 rotate-45 transform -translate-y-1 group-focus-within:border-indigo-400 transition-colors" />
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-gradient-to-br from-[#0a0a0a] to-[#111111] border border-white/5 space-y-4 shadow-inner">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400 font-medium">Current Balance</span>
              <span className="text-gray-200 font-bold">${balance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400 font-medium">Cost</span>
              <span className="text-rose-400 font-bold">-${cost.toFixed(2)}</span>
            </div>
            <div className="h-px w-full bg-white/5" />
            <div className="flex justify-between items-center">
              <span className="text-gray-300 font-bold text-lg">Remaining Balance</span>
              <span className={`font-black text-xl ${hasEnoughBalance ? 'text-emerald-500' : 'text-rose-500'}`}>
                ${(balance - cost).toFixed(2)}
              </span>
            </div>
            
            {!hasEnoughBalance && (
              <motion.p 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="text-xs text-rose-400 mt-3 font-medium bg-rose-500/10 p-2 rounded-lg text-center"
              >
                Insufficient balance. Please add funds to continue.
              </motion.p>
            )}
          </div>

          <button
            type="submit"
            disabled={!hasEnoughBalance || loading || !email}
            className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all duration-300 ${
              !hasEnoughBalance || !email
                ? 'bg-white/5 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 text-white shadow-lg shadow-indigo-500/25'
            }`}
          >
            {loading ? (
              <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Zap className="h-5 w-5" />
                Activate Access
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
};
