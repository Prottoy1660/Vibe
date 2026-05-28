import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
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
    <div className="max-w-3xl mx-auto mt-8">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#111111]/80 backdrop-blur-xl border border-white/5 rounded-3xl overflow-hidden shadow-2xl shadow-black/50"
      >
        <div className="bg-gradient-to-r from-red-600/20 to-orange-600/20 p-8 border-b border-white/5">
          <div className="flex items-center gap-3 mb-2">
            <ListMinus className="h-8 w-8 text-red-400" />
            <h1 className="text-3xl font-bold text-white">Bulk Remove Users</h1>
          </div>
          <p className="text-red-200/80">Deactivate multiple accounts at once. Paste emails separated by commas or new lines.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          {successData && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-3">
              <div className="flex items-center gap-3 text-emerald-400">
                <CheckCircle2 className="h-6 w-6 shrink-0" />
                <p className="font-bold text-lg">Successfully processed {successData.processedCount} users!</p>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="bg-white/5 rounded-xl p-3 text-center border border-white/5">
                  <div className="text-xl font-bold text-orange-400">{successData.refundedCount}</div>
                  <div className="text-xs text-gray-400 mt-1">Refunded (&le;24h)</div>
                </div>
                <div className="bg-white/5 rounded-xl p-3 text-center border border-white/5">
                  <div className="text-xl font-bold text-gray-300">{successData.expiredCount}</div>
                  <div className="text-xs text-gray-400 mt-1">Expired (&gt;24h)</div>
                </div>
                <div className="bg-white/5 rounded-xl p-3 text-center border border-white/5">
                  <div className="text-xl font-bold text-emerald-400">+${successData.totalRefund.toFixed(2)}</div>
                  <div className="text-xs text-gray-400 mt-1">Total Refund</div>
                </div>
              </div>
            </motion.div>
          )}

          {error && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-400">
              <AlertCircle className="h-6 w-6 shrink-0" />
              <p className="font-medium">{error}</p>
            </motion.div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300 ml-1">Customer Emails to Remove</label>
            <div className="relative">
              <textarea
                required
                rows={8}
                value={emailsText}
                onChange={(e) => setEmailsText(e.target.value)}
                className="block w-full p-4 bg-[#0a0a0a] border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all placeholder:text-gray-600 font-mono text-sm"
                placeholder="user1@example.com&#10;user2@example.com&#10;user3@example.com"
              />
            </div>
            <div className="flex justify-between items-center mt-2 px-1">
              <p className="text-xs text-gray-500">
                Valid emails detected: <span className="text-red-400 font-bold">{parsedEmails.length}</span>
              </p>
              <p className="text-xs text-gray-500">
                Only active accounts matching these emails will be processed.
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || parsedEmails.length === 0}
            className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all duration-300 ${
              parsedEmails.length === 0
                ? 'bg-white/5 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white shadow-lg shadow-red-500/25'
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
