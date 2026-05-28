import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mail, Clock, Zap, CheckCircle2, AlertCircle, ListPlus } from 'lucide-react';
import { ResellerApi, ResellerPackage } from '../../services/reseller/resellerApi';
import { useNavigate } from 'react-router-dom';

export const BulkActivate = () => {
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
      await ResellerApi.bulkActivateUsers(parsedEmails, duration, costPerUser);
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
    <div className="max-w-3xl mx-auto mt-8">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#111111]/80 backdrop-blur-xl border border-white/5 rounded-3xl overflow-hidden shadow-2xl shadow-black/50"
      >
        <div className="bg-gradient-to-r from-blue-600/20 to-indigo-600/20 p-8 border-b border-white/5">
          <div className="flex items-center gap-3 mb-2">
            <ListPlus className="h-8 w-8 text-blue-400" />
            <h1 className="text-3xl font-bold text-white">Bulk Activate Users</h1>
          </div>
          <p className="text-blue-200/80">Activate multiple accounts at once. Paste emails separated by commas or new lines.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          {success && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 text-emerald-400">
              <CheckCircle2 className="h-6 w-6 shrink-0" />
              <p className="font-medium">Successfully activated {parsedEmails.length} users! Redirecting...</p>
            </motion.div>
          )}

          {error && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-400">
              <AlertCircle className="h-6 w-6 shrink-0" />
              <p className="font-medium">{error}</p>
            </motion.div>
          )}

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300 ml-1">Customer Emails</label>
              <div className="relative">
                <textarea
                  required
                  rows={6}
                  value={emailsText}
                  onChange={(e) => setEmailsText(e.target.value)}
                  className="block w-full p-4 bg-[#0a0a0a] border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-gray-600 font-mono text-sm"
                  placeholder="user1@example.com&#10;user2@example.com&#10;user3@example.com"
                />
              </div>
              <p className="text-xs text-gray-500 ml-1">
                Valid emails detected: <span className="text-blue-400 font-bold">{parsedEmails.length}</span>
              </p>
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
                  className="block w-full pl-11 pr-4 py-3 bg-[#0a0a0a] border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none disabled:opacity-50"
                >
                  {fetchingPkgs ? (
                    <option>Loading packages...</option>
                  ) : packages.length === 0 ? (
                    <option>No packages available</option>
                  ) : (
                    packages.map(d => (
                      <option key={d.id} value={d.value}>{d.label} - ${d.cost.toFixed(2)} per user</option>
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
              <span className="text-gray-400">Total Users</span>
              <span className="text-gray-200 font-medium">{parsedEmails.length}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">Cost per User</span>
              <span className="text-gray-200 font-medium">${costPerUser.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">Total Cost</span>
              <span className="text-red-400 font-medium">-${totalCost.toFixed(2)}</span>
            </div>
            <div className="h-px w-full bg-white/10" />
            <div className="flex justify-between items-center">
              <span className="text-gray-300 font-medium">Remaining Balance</span>
              <span className={`font-bold ${hasEnoughBalance ? 'text-emerald-400' : 'text-red-400'}`}>
                ${(balance - totalCost).toFixed(2)}
              </span>
            </div>
            
            {!hasEnoughBalance && parsedEmails.length > 0 && (
              <p className="text-xs text-red-400 mt-2">Insufficient balance. Please add funds or reduce the number of emails.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={!hasEnoughBalance || loading || parsedEmails.length === 0}
            className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all duration-300 ${
              !hasEnoughBalance || parsedEmails.length === 0
                ? 'bg-white/5 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/25'
            }`}
          >
            {loading ? (
              <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Zap className="h-5 w-5" />
                Activate {parsedEmails.length} Users
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
};
