import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, ArrowUpRight, ArrowDownRight, Info, Loader2 } from 'lucide-react';
import { ResellerApi, Transaction } from '../../services/reseller/resellerApi';

export const TransactionHistory = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const data = await ResellerApi.getTransactions();
      setTransactions(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const getTypeBadge = (type: string, status: string) => {
    if (type === 'deposit') {
      if (status === 'pending') return <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">DEPOSIT PENDING</span>;
      return <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">DEPOSIT</span>;
    }
    if (type === 'deduct') return <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">DEDUCT</span>;
    if (type === 'refund') return <span className="px-3 py-1 rounded-full text-xs font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20">REFUND</span>;
    return <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-500/10 text-gray-400 border border-gray-500/20">SYSTEM</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Transaction History</h1>
          <p className="text-gray-400 mt-2">View all your deposits, deductions, and refunds.</p>
        </div>
        <button
          onClick={fetchTransactions}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors border border-white/10 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="bg-[#111111]/80 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/5 text-xs uppercase tracking-wider text-gray-400">
                <th className="p-4 font-medium">Date</th>
                <th className="p-4 font-medium">Type</th>
                <th className="p-4 font-medium">Amount (USD)</th>
                <th className="p-4 font-medium">Reason</th>
                <th className="p-4 font-medium text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              <AnimatePresence>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center">
                      <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mx-auto" />
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">
                      No transactions found.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => {
                    const balanceBefore = tx.balanceAfter !== undefined 
                      ? (tx.type === 'deposit' && tx.status === 'approved' ? tx.balanceAfter - tx.amount : 
                         tx.type === 'deduct' ? tx.balanceAfter - tx.amount /* amount is negative */ :
                         tx.type === 'refund' ? tx.balanceAfter - tx.amount : tx.balanceAfter)
                      : null;

                    return (
                      <motion.tr
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        key={tx.id}
                        className="hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="p-4 text-gray-400 whitespace-nowrap">
                          {new Date(tx.createdAt).toLocaleString()}
                        </td>
                        <td className="p-4">
                          {getTypeBadge(tx.type, tx.status)}
                        </td>
                        <td className="p-4">
                          {tx.amount !== 0 ? (
                            <div className={`flex items-center gap-1.5 font-medium ${tx.amount > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {tx.amount > 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                              {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)}
                            </div>
                          ) : (
                            <span className="text-gray-500">0.00</span>
                          )}
                        </td>
                        <td className="p-4 text-gray-300">
                          {tx.description}
                          {tx.txId && <span className="block text-xs text-gray-500 mt-0.5">TX ID: {tx.txId}</span>}
                        </td>
                        <td className="p-4 text-right font-mono text-gray-400">
                          {balanceBefore !== null && tx.balanceAfter !== undefined ? (
                            <>
                              <span className="opacity-50">{balanceBefore.toFixed(2)}</span>
                              <span className="mx-1 text-gray-600">&rarr;</span>
                              <span className="text-gray-200">{tx.balanceAfter.toFixed(2)}</span>
                            </>
                          ) : (
                            tx.balanceAfter !== undefined ? tx.balanceAfter.toFixed(2) : '---'
                          )}
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
