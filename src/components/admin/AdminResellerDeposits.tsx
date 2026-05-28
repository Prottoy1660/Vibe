import React, { useState, useEffect } from 'react';
import { Loader2, Check, X, Search, Clock } from 'lucide-react';
import { ResellerApi, Transaction } from '../../services/reseller/resellerApi';

export const AdminResellerDeposits = () => {
  const [deposits, setDeposits] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchDeposits();
  }, []);

  const fetchDeposits = async () => {
    try {
      const data = await ResellerApi.adminGetDeposits();
      setDeposits(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: 'approved' | 'rejected') => {
    if (!window.confirm(`Are you sure you want to mark this deposit as ${status}?`)) return;
    
    setProcessingId(id);
    try {
      await ResellerApi.adminUpdateDepositStatus(id, status);
      await fetchDeposits();
    } catch (err) {
      console.error(err);
      alert('Failed to update status');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Reseller Deposits</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Review and approve Binance Pay deposit requests from resellers.</p>
      </div>

      <div className="bg-white dark:bg-[#151518] rounded-2xl border border-gray-200 dark:border-[#26262d] overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-[#26262d] bg-gray-50 dark:bg-white/[0.02]">
              <th className="px-6 py-4 font-medium text-gray-600 dark:text-gray-400">Date</th>
              <th className="px-6 py-4 font-medium text-gray-600 dark:text-gray-400">Transaction ID</th>
              <th className="px-6 py-4 font-medium text-gray-600 dark:text-gray-400">Amount</th>
              <th className="px-6 py-4 font-medium text-gray-600 dark:text-gray-400">Status</th>
              <th className="px-6 py-4 font-medium text-gray-600 dark:text-gray-400 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-[#26262d]">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-500 mx-auto" />
                </td>
              </tr>
            ) : deposits.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No deposit requests found.
                </td>
              </tr>
            ) : (
              deposits.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {new Date(tx.createdAt).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono text-gray-900 dark:text-gray-100">{tx.txId || 'N/A'}</td>
                  <td className="px-6 py-4 font-bold text-gray-900 dark:text-gray-100">${tx.amount.toFixed(2)}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      tx.status === 'pending' ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400' :
                      tx.status === 'approved' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400' :
                      'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-400'
                    }`}>
                      {tx.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {tx.status === 'pending' && (
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleUpdateStatus(tx.id, 'approved')}
                          disabled={processingId === tx.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20 rounded-lg transition-colors font-medium disabled:opacity-50"
                        >
                          {processingId === tx.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          Approve
                        </button>
                        <button 
                          onClick={() => handleUpdateStatus(tx.id, 'rejected')}
                          disabled={processingId === tx.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 rounded-lg transition-colors font-medium disabled:opacity-50"
                        >
                          <X className="h-4 w-4" />
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
