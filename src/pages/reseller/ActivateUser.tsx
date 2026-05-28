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
    <div className="w-full pb-10 flex flex-col lg:flex-row gap-6 lg:gap-8">
      
      {/* Left Side - Pure Text/Info */}
      <div className="lg:w-1/3 flex flex-col">
        <div className="sticky top-28">
          <h1 className="text-3xl lg:text-4xl font-bold text-white mb-3 tracking-tight">Activate User</h1>
          <p className="text-gray-400 text-sm lg:text-base leading-relaxed mb-6">
            Provide Adobe Creative Cloud access instantly to your customers.
          </p>
          
          <div className="space-y-4 hidden sm:block">
            <div className="flex items-start gap-3 text-gray-300">
              <CheckCircle2 className="h-5 w-5 text-white shrink-0 mt-0.5" />
              <span className="text-sm font-medium">Automated backend delivery</span>
            </div>
            <div className="flex items-start gap-3 text-gray-300">
              <CheckCircle2 className="h-5 w-5 text-white shrink-0 mt-0.5" />
              <span className="text-sm font-medium">Instant confirmation</span>
            </div>
            <div className="flex items-start gap-3 text-gray-300">
              <CheckCircle2 className="h-5 w-5 text-white shrink-0 mt-0.5" />
              <span className="text-sm font-medium">Secure processing</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="lg:w-2/3 flex flex-col">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="bg-[#0a0a0a] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
        >
          <form onSubmit={handleSubmit} className="p-5 sm:p-8 space-y-6">
            <AnimatePresence>
              {success && (
                <motion.div 
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }} 
                  animate={{ opacity: 1, height: 'auto', marginBottom: 20 }} 
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 text-emerald-400 shadow-lg shadow-emerald-500/5 overflow-hidden"
                >
                  <CheckCircle2 className="h-5 w-5 lg:h-6 lg:w-6 flex-shrink-0" />
                  <p className="font-medium text-xs lg:text-sm">User successfully activated! Redirecting to dashboard...</p>
                </motion.div>
              )}

              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }} 
                  animate={{ opacity: 1, height: 'auto', marginBottom: 20 }} 
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-3 text-rose-400 shadow-lg shadow-rose-500/5 overflow-hidden"
                >
                  <AlertCircle className="h-5 w-5 lg:h-6 lg:w-6 flex-shrink-0" />
                  <p className="font-medium text-xs lg:text-sm">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs lg:text-sm font-semibold text-gray-300 ml-1">Customer Email</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 lg:pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-white text-gray-500">
                    <Mail className="h-4 w-4 lg:h-5 lg:w-5" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-10 lg:pl-12 pr-4 py-3 bg-[#111111] border border-white/10 rounded-xl lg:rounded-2xl text-white focus:ring-2 focus:ring-white/20 focus:border-white/20 transition-all placeholder:text-gray-600 shadow-inner text-sm lg:text-base"
                    placeholder="customer@example.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs lg:text-sm font-semibold text-gray-300 ml-1">Subscription Duration</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 lg:pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-white text-gray-500">
                    <Clock className="h-4 w-4 lg:h-5 lg:w-5" />
                  </div>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    disabled={fetchingPkgs}
                    className="block w-full pl-10 lg:pl-12 pr-10 py-3 bg-[#111111] border border-white/10 rounded-xl lg:rounded-2xl text-white focus:ring-2 focus:ring-white/20 focus:border-white/20 transition-all appearance-none disabled:opacity-50 shadow-inner font-medium cursor-pointer text-sm lg:text-base"
                  >
                    {fetchingPkgs ? (
                      <option>Loading packages...</option>
                    ) : packages.length === 0 ? (
                      <option>No packages available</option>
                    ) : (
                      packages.map(d => (
                        <option key={d.id} value={d.value} className="bg-[#1a1a1a]">{d.label} - ${d.cost.toFixed(2)}</option>
                      ))
                    )}
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                    <div className="h-1.5 w-1.5 lg:h-2 lg:w-2 border-r-2 border-b-2 border-gray-400 rotate-45 transform -translate-y-1 group-focus-within:border-white transition-colors" />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-5 rounded-xl lg:rounded-2xl bg-[#111111] border border-white/5 space-y-3 shadow-inner mt-6">
              <div className="flex justify-between items-center text-xs lg:text-sm">
                <span className="text-gray-400 font-medium">Current Balance</span>
                <span className="text-gray-200 font-bold">${balance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-xs lg:text-sm">
                <span className="text-gray-400 font-medium">Cost</span>
                <span className="text-rose-400 font-bold">-${cost.toFixed(2)}</span>
              </div>
              <div className="h-px w-full bg-white/5" />
              <div className="flex justify-between items-center">
                <span className="text-gray-300 font-bold text-sm lg:text-base">Remaining Balance</span>
                <span className={`font-black text-base lg:text-lg ${hasEnoughBalance ? 'text-emerald-500' : 'text-rose-500'}`}>
                  ${(balance - cost).toFixed(2)}
                </span>
              </div>
              
              {!hasEnoughBalance && (
                <motion.p 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-[10px] lg:text-xs text-rose-400 mt-2 font-medium bg-rose-500/10 p-2 rounded-lg text-center border border-rose-500/20"
                >
                  Insufficient balance. Please add funds to continue.
                </motion.p>
              )}
            </div>

            <button
              type="submit"
              disabled={!hasEnoughBalance || loading || !email}
              className={`w-full py-3.5 lg:py-4 rounded-xl lg:rounded-2xl font-bold flex items-center justify-center gap-2 transition-all duration-300 text-sm lg:text-base ${
                !hasEnoughBalance || !email
                  ? 'bg-white/5 text-gray-500 cursor-not-allowed'
                  : 'bg-white hover:bg-gray-200 text-black shadow-xl shadow-white/10 active:scale-[0.98]'
              }`}
            >
              {loading ? (
                <div className="h-5 w-5 lg:h-5 lg:w-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <>
                  <Zap className="h-4 w-4 lg:h-5 lg:w-5" />
                  Activate Access
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
};
