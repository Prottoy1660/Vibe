import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
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
    <div className="max-w-2xl mx-auto mt-8">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#111111]/80 backdrop-blur-xl border border-white/5 rounded-3xl overflow-hidden shadow-2xl shadow-black/50"
      >
        <div className="bg-gradient-to-r from-indigo-600/20 to-blue-600/20 p-8 border-b border-white/5">
          <h1 className="text-3xl font-bold text-white mb-2">Activate New User</h1>
          <p className="text-indigo-200/80">Provide Adobe Creative Cloud access instantly.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          {success && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
              <p className="font-medium">User successfully activated! Redirecting...</p>
            </motion.div>
          )}

          {error && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-400">
              <AlertCircle className="h-6 w-6" />
              <p className="font-medium">{error}</p>
            </motion.div>
          )}

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300 ml-1">Customer Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-500" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3 bg-[#0a0a0a] border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder:text-gray-600"
                  placeholder="customer@example.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300 ml-1">Subscription Duration</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Clock className="h-5 w-5 text-gray-500" />
                </div>
                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  disabled={fetchingPkgs}
                  className="block w-full pl-11 pr-4 py-3 bg-[#0a0a0a] border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all appearance-none disabled:opacity-50"
                >
                  {fetchingPkgs ? (
                    <option>Loading packages...</option>
                  ) : packages.length === 0 ? (
                    <option>No packages available</option>
                  ) : (
                    packages.map(d => (
                      <option key={d.id} value={d.value}>{d.label} - ${d.cost.toFixed(2)}</option>
                    ))
                  )}
                </select>
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                  <div className="h-2 w-2 border-r-2 border-b-2 border-gray-500 rotate-45 transform -translate-y-1" />
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[#0a0a0a] border border-white/5 space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">Current Balance</span>
              <span className="text-gray-200 font-medium">${balance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">Cost</span>
              <span className="text-red-400 font-medium">-${cost.toFixed(2)}</span>
            </div>
            <div className="h-px w-full bg-white/10" />
            <div className="flex justify-between items-center">
              <span className="text-gray-300 font-medium">Remaining Balance</span>
              <span className={`font-bold ${hasEnoughBalance ? 'text-emerald-400' : 'text-red-400'}`}>
                ${(balance - cost).toFixed(2)}
              </span>
            </div>
            
            {!hasEnoughBalance && (
              <p className="text-xs text-red-400 mt-2">Insufficient balance. Please add funds to continue.</p>
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
