import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, AlertCircle, CheckCircle2, ListMinus, Loader2 } from 'lucide-react';
import { ResellerApi } from '../../services/reseller/resellerApi';
import { useNavigate } from 'react-router-dom';

export const BulkRemove = () => {
  const navigate = useNavigate();
  const [emailsText, setEmailsText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState<{
    processedCount: number;
    refundedCount: number;
    expiredCount: number;
    totalRefund: number;
  } | null>(null);

  // Parse emails
  const parsedEmails = emailsText
    .split(/[\n,]+/)
    .map(e => e.trim())
    .filter(e => e.length > 0 && e.includes('@')); // basic validation

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedEmails.length === 0) {
      setError('Please enter at least one valid email address.');
      return;
    }

    if (!window.confirm(`Are you sure you want to remove ${parsedEmails.length} users? Accounts removed within 24h will be refunded.`)) {
      return;
    }

    setLoading(true);
    setError('');
    setSuccessData(null);
    
    try {
      const result = await ResellerApi.bulkDeleteUsers(parsedEmails);
      setSuccessData(result);
      setEmailsText(''); // clear input
      
      // Optional: Auto redirect after 3 seconds
      // setTimeout(() => navigate('/reseller/users'), 3000);
    } catch (err: any) {
      setError(err.message || 'An error occurred during bulk remove');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto mt-8 pb-10">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="bg-[#111111] border border-white/5 rounded-3xl overflow-hidden shadow-2xl"
      >
        <div className="bg-gradient-to-r from-rose-600/20 to-orange-600/20 p-10 border-b border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4"></div>
          <div className="relative z-10">
            <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mb-6 backdrop-blur-md shadow-lg border border-white/5">
              <ListMinus className="h-7 w-7 text-rose-400" />
            </div>
            <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Bulk Remove Users</h1>
            <p className="text-rose-200/80 text-lg">Deactivate multiple accounts at once. Paste emails separated by commas or new lines.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-10 space-y-8">
          <AnimatePresence>
            {successData && (
              <motion.div 
                initial={{ opacity: 0, height: 0, marginBottom: 0 }} 
                animate={{ opacity: 1, height: 'auto', marginBottom: 24 }} 
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="p-6 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 space-y-4 shadow-lg shadow-emerald-500/5 overflow-hidden"
              >
                <div className="flex items-center gap-3 text-emerald-400">
                  <CheckCircle2 className="h-6 w-6 shrink-0" />
                  <p className="font-bold text-lg">Successfully processed {successData.processedCount} users!</p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-[#111111]/50 rounded-2xl p-4 text-center border border-white/5 shadow-inner">
                    <div className="text-2xl font-black text-amber-500">{successData.refundedCount}</div>
                    <div className="text-xs font-medium text-gray-500 mt-1 uppercase tracking-wider">Refunded (&le;24h)</div>
                  </div>
                  <div className="bg-[#111111]/50 rounded-2xl p-4 text-center border border-white/5 shadow-inner">
                    <div className="text-2xl font-black text-gray-400">{successData.expiredCount}</div>
                    <div className="text-xs font-medium text-gray-500 mt-1 uppercase tracking-wider">Expired (&gt;24h)</div>
                  </div>
                  <div className="bg-[#111111]/50 rounded-2xl p-4 text-center border border-emerald-500/10 shadow-inner">
                    <div className="text-2xl font-black text-emerald-500">+${successData.totalRefund.toFixed(2)}</div>
                    <div className="text-xs font-medium text-emerald-500/70 mt-1 uppercase tracking-wider">Total Refund</div>
                  </div>
                </div>
              </motion.div>
            )}

            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0, marginBottom: 0 }} 
                animate={{ opacity: 1, height: 'auto', marginBottom: 24 }} 
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-4 text-rose-400 shadow-lg shadow-rose-500/5 overflow-hidden"
              >
                <AlertCircle className="h-6 w-6 shrink-0" />
                <p className="font-medium text-sm">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-3">
            <label className="text-sm font-semibold text-gray-300 ml-1">Customer Emails to Remove</label>
            <div className="relative group">
              <textarea
                required
                rows={8}
                value={emailsText}
                onChange={(e) => setEmailsText(e.target.value)}
                className="block w-full p-5 bg-[#0a0a0a] border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-rose-500 focus:border-rose-500 transition-all placeholder:text-gray-600 font-mono text-sm shadow-inner resize-none"
                placeholder="user1@example.com&#10;user2@example.com&#10;user3@example.com"
              />
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-3 px-1 gap-2">
              <p className="text-sm text-gray-500">
                Valid emails detected: <span className="text-rose-400 font-bold px-2 py-0.5 bg-rose-500/10 rounded-md ml-1">{parsedEmails.length}</span>
              </p>
              <p className="text-xs font-medium text-gray-500 bg-white/5 px-3 py-1.5 rounded-lg">
                Only active accounts will be processed.
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || parsedEmails.length === 0}
            className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all duration-300 ${
              parsedEmails.length === 0
                ? 'bg-white/5 text-gray-500 cursor-not-allowed'
                : 'bg-rose-500 hover:bg-rose-600 text-white shadow-xl shadow-rose-500/20 active:scale-95'
            }`}
          >
            {loading ? (
              <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Trash2 className="h-5 w-5" />
                Remove {parsedEmails.length} Users
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
};
