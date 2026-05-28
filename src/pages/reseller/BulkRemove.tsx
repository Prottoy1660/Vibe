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
    <div className="w-full pb-10 flex flex-col lg:flex-row gap-6 lg:gap-8">
      
      {/* Left Side - Pure Text/Info */}
      <div className="lg:w-1/3 flex flex-col">
        <div className="sticky top-28">
          <h1 className="text-3xl lg:text-4xl font-bold text-white mb-3 tracking-tight">Bulk Remove</h1>
          <p className="text-gray-400 text-sm lg:text-base leading-relaxed mb-6">
            Deactivate multiple customer accounts simultaneously.
          </p>
          
          <div className="space-y-4 hidden sm:block">
            <div className="flex items-start gap-3 text-gray-300">
              <CheckCircle2 className="h-5 w-5 text-white shrink-0 mt-0.5" />
              <span className="text-sm font-medium">Automatic 24h refund calculation</span>
            </div>
            <div className="flex items-start gap-3 text-gray-300">
              <CheckCircle2 className="h-5 w-5 text-white shrink-0 mt-0.5" />
              <span className="text-sm font-medium">Instant API synchronization</span>
            </div>
            <div className="flex items-start gap-3 text-gray-300">
              <CheckCircle2 className="h-5 w-5 text-white shrink-0 mt-0.5" />
              <span className="text-sm font-medium">Ignores already expired accounts</span>
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
              {successData && (
                <motion.div 
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }} 
                  animate={{ opacity: 1, height: 'auto', marginBottom: 20 }} 
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  className="p-4 sm:p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-3 shadow-lg shadow-emerald-500/5 overflow-hidden"
                >
                  <div className="flex items-center gap-3 text-emerald-400">
                    <CheckCircle2 className="h-5 w-5 lg:h-6 lg:w-6 shrink-0" />
                    <p className="font-bold text-sm lg:text-base">Successfully processed {successData.processedCount} users!</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-[#111111]/50 rounded-xl p-3 text-center border border-white/5 shadow-inner">
                      <div className="text-lg lg:text-xl font-black text-amber-500">{successData.refundedCount}</div>
                      <div className="text-[10px] lg:text-xs font-medium text-gray-500 mt-1 uppercase tracking-wider">Refunded</div>
                    </div>
                    <div className="bg-[#111111]/50 rounded-xl p-3 text-center border border-white/5 shadow-inner">
                      <div className="text-lg lg:text-xl font-black text-gray-400">{successData.expiredCount}</div>
                      <div className="text-[10px] lg:text-xs font-medium text-gray-500 mt-1 uppercase tracking-wider">Expired</div>
                    </div>
                    <div className="bg-[#111111]/50 rounded-xl p-3 text-center border border-emerald-500/10 shadow-inner">
                      <div className="text-lg lg:text-xl font-black text-emerald-500">+${successData.totalRefund.toFixed(2)}</div>
                      <div className="text-[10px] lg:text-xs font-medium text-emerald-500/70 mt-1 uppercase tracking-wider">Refund</div>
                    </div>
                  </div>
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

            <div className="space-y-2">
              <label className="text-xs lg:text-sm font-semibold text-gray-300 ml-1">Customer Emails to Remove</label>
              <div className="relative group">
                <textarea
                  required
                  rows={8}
                  value={emailsText}
                  onChange={(e) => setEmailsText(e.target.value)}
                  className="block w-full p-4 bg-[#111111] border border-white/10 rounded-xl lg:rounded-2xl text-white focus:ring-2 focus:ring-white/20 focus:border-white/20 transition-all placeholder:text-gray-600 font-mono text-xs lg:text-sm shadow-inner resize-none"
                  placeholder="user1@example.com&#10;user2@example.com&#10;user3@example.com"
                />
              </div>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-2 px-1 gap-2">
                <p className="text-xs lg:text-sm text-gray-500">
                  Valid emails detected: <span className="text-white font-bold px-2 py-0.5 bg-white/10 rounded-md ml-1">{parsedEmails.length}</span>
                </p>
                <p className="text-[10px] lg:text-xs font-medium text-gray-500 bg-white/5 px-2.5 py-1 rounded-md">
                  Only active accounts will be processed.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || parsedEmails.length === 0}
              className={`w-full py-3.5 lg:py-4 rounded-xl lg:rounded-2xl font-bold flex items-center justify-center gap-2 transition-all duration-300 text-sm lg:text-base ${
                parsedEmails.length === 0
                  ? 'bg-white/5 text-gray-500 cursor-not-allowed'
                  : 'bg-rose-500 hover:bg-rose-600 text-white shadow-xl shadow-rose-500/25 active:scale-[0.98]'
              }`}
            >
              {loading ? (
                <div className="h-5 w-5 lg:h-5 lg:w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Trash2 className="h-4 w-4 lg:h-5 lg:w-5" />
                  Remove {parsedEmails.length} Users
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
};
