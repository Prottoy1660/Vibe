import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarClock, CheckCircle2, AlertCircle, ListPlus, Clock } from 'lucide-react';
import { ResellerApi, ResellerPackage } from '../../services/reseller/resellerApi';
import { useNavigate } from 'react-router-dom';

export const BulkExtend = () => {
  const navigate = useNavigate();
  const [emailsText, setEmailsText] = useState('');
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

  // Parse emails
  const parsedEmails = emailsText
    .split(/[\n,]+/)
    .map(e => e.trim())
    .filter(e => e.length > 0 && e.includes('@')); // basic validation

  const selectedDuration = packages.find(d => d.value === duration);
  const costPerUser = selectedDuration?.cost || 0;
  const totalCost = costPerUser * parsedEmails.length;
  const hasEnoughBalance = balance >= totalCost;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedEmails.length === 0) {
      setError('Please enter at least one valid email address.');
      return;
    }
    if (!hasEnoughBalance) return;

    setLoading(true);
    setError('');
    
    try {
      await ResellerApi.bulkExtendUsers(parsedEmails, duration, costPerUser);
      setSuccess(true);
      setBalance(b => b - totalCost);
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
          <h1 className="text-3xl lg:text-4xl font-bold text-white mb-3 tracking-tight">Bulk Extend Users</h1>
          <p className="text-gray-400 text-sm lg:text-base leading-relaxed mb-6">
            Add months to multiple users' expiration dates. Extension time is added to remaining time.
          </p>
          
          <div className="space-y-4 hidden sm:block">
            <div className="flex items-start gap-3 text-gray-300">
              <CheckCircle2 className="h-5 w-5 text-white shrink-0 mt-0.5" />
              <span className="text-sm font-medium">Extend multiple users instantly</span>
            </div>
            <div className="flex items-start gap-3 text-gray-300">
              <CheckCircle2 className="h-5 w-5 text-white shrink-0 mt-0.5" />
              <span className="text-sm font-medium">Auto-deduction from wallet</span>
            </div>
            <div className="flex items-start gap-3 text-gray-300">
              <CheckCircle2 className="h-5 w-5 text-white shrink-0 mt-0.5" />
              <span className="text-sm font-medium">Easy renewal management</span>
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
                  <CheckCircle2 className="h-5 w-5 lg:h-6 lg:w-6 shrink-0" />
                  <p className="font-medium text-xs lg:text-sm">Successfully extended {parsedEmails.length} users! Redirecting to dashboard...</p>
                </motion.div>
              )}

              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }} 
                  animate={{ opacity: 1, height: 'auto', marginBottom: 20 }} 
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-3 text-rose-400 shadow-lg shadow-rose-500/5 overflow-hidden"
                >
                  <AlertCircle className="h-5 w-5 lg:h-6 lg:w-6 shrink-0" />
                  <p className="font-medium text-xs lg:text-sm">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs lg:text-sm font-semibold text-gray-300 ml-1">Customer Emails</label>
                <div className="relative group">
                  <textarea
                    required
                    rows={6}
                    value={emailsText}
                    onChange={(e) => setEmailsText(e.target.value)}
                    className="block w-full p-4 bg-[#111111] border border-white/10 rounded-xl lg:rounded-2xl text-white focus:ring-2 focus:ring-white/20 focus:border-white/20 transition-all placeholder:text-gray-600 font-mono text-xs lg:text-sm shadow-inner resize-none"
                    placeholder="user1@example.com&#10;user2@example.com&#10;user3@example.com"
                  />
                </div>
                <p className="text-xs lg:text-sm text-gray-500 ml-1 mt-2">
                  Valid emails detected: <span className="text-white font-bold px-2 py-0.5 bg-white/10 rounded-md ml-1">{parsedEmails.length}</span>
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs lg:text-sm font-semibold text-gray-300 ml-1">Extension Duration</label>
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
                        <option key={d.id} value={d.value} className="bg-[#1a1a1a]">{d.label} - ${d.cost.toFixed(2)} per user</option>
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
                <span className="text-gray-400 font-medium">Total Users</span>
                <span className="text-gray-200 font-bold">{parsedEmails.length}</span>
              </div>
              <div className="flex justify-between items-center text-xs lg:text-sm">
                <span className="text-gray-400 font-medium">Cost per User</span>
                <span className="text-gray-200 font-bold">${costPerUser.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-xs lg:text-sm">
                <span className="text-gray-400 font-medium">Total Cost</span>
                <span className="text-rose-400 font-bold">-${totalCost.toFixed(2)}</span>
              </div>
              <div className="h-px w-full bg-white/5" />
              <div className="flex justify-between items-center">
                <span className="text-gray-300 font-bold text-sm lg:text-base">Remaining Balance</span>
                <span className={`font-black text-base lg:text-lg ${hasEnoughBalance ? 'text-emerald-500' : 'text-rose-500'}`}>
                  ${(balance - totalCost).toFixed(2)}
                </span>
              </div>
              
              {!hasEnoughBalance && parsedEmails.length > 0 && (
                <motion.p 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-[10px] lg:text-xs text-rose-400 mt-2 font-medium bg-rose-500/10 p-2 rounded-lg text-center border border-rose-500/20"
                >
                  Insufficient balance. Please add funds or reduce the number of emails.
                </motion.p>
              )}
            </div>

            <button
              type="submit"
              disabled={!hasEnoughBalance || loading || parsedEmails.length === 0}
              className={`w-full py-3.5 lg:py-4 rounded-xl lg:rounded-2xl font-bold flex items-center justify-center gap-2 transition-all duration-300 text-sm lg:text-base ${
                !hasEnoughBalance || parsedEmails.length === 0
                  ? 'bg-white/5 text-gray-500 cursor-not-allowed'
                  : 'bg-white hover:bg-gray-200 text-black shadow-xl shadow-white/10 active:scale-[0.98]'
              }`}
            >
              {loading ? (
                <div className="h-5 w-5 lg:h-5 lg:w-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <>
                  <CalendarClock className="h-4 w-4 lg:h-5 lg:w-5" />
                  Extend {parsedEmails.length} Users
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
};
