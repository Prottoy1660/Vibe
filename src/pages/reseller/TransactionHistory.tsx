import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, ArrowUpRight, ArrowDownRight, Loader2, History } from 'lucide-react';
import { ResellerApi, Transaction } from '../../services/reseller/resellerApi';
import { paginateItems, TablePagination } from '../../components/reseller/TablePagination';

export const TransactionHistory = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const paginatedTransactions = paginateItems(transactions, page, pageSize);

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
    <div className="space-y-6 lg:space-y-8 pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl lg:text-4xl font-extrabold text-white tracking-tight">Transaction History</h1>
          <p className="text-gray-400 mt-1 lg:mt-2 text-base lg:text-lg">View all your deposits, deductions, and refunds.</p>
        </div>
        <button
          onClick={fetchTransactions}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all border border-white/10 disabled:opacity-50 active:scale-95 w-full sm:w-auto"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="bg-[#111111] border border-white/5 rounded-2xl lg:rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/5 text-xs uppercase tracking-widest text-gray-500">
                <th className="p-4 lg:p-5 font-bold">Date</th>
                <th className="p-4 lg:p-5 font-bold">Type</th>
                <th className="p-4 lg:p-5 font-bold">Amount (USD)</th>
                <th className="p-4 lg:p-5 font-bold">Reason</th>
                <th className="p-4 lg:p-5 font-bold text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              <AnimatePresence>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center">
                      <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mx-auto" />
                      <p className="text-gray-500 mt-4 font-medium">Loading transactions...</p>
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-16 text-center text-gray-500">
                      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                        <History className="h-6 w-6 text-gray-500" />
                      </div>
                      <p className="font-medium text-lg text-gray-400">No transactions found</p>
                      <p className="text-sm mt-1">Your payment and usage history will appear here.</p>
                    </td>
                  </tr>
                ) : (
                  paginatedTransactions.map((tx) => {
                    const balanceBefore = tx.balanceAfter !== undefined 
                      ? (tx.type === 'deposit' && tx.status === 'approved' ? tx.balanceAfter - tx.amount : 
                         tx.type === 'deduct' ? tx.balanceAfter - tx.amount /* amount is negative */ :
                         tx.type === 'refund' ? tx.balanceAfter - tx.amount : tx.balanceAfter)
                      : null;

                    return (
                      <motion.tr
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.2 }}
                        key={tx.id}
                        className="hover:bg-white/[0.02] transition-colors group"
                      >
                        <td className="p-4 lg:p-5 text-gray-400 whitespace-nowrap font-medium">
                          {new Date(tx.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </td>
                        <td className="p-4 lg:p-5">
                          {getTypeBadge(tx.type, tx.status)}
                        </td>
                        <td className="p-4 lg:p-5">
                          {tx.amount !== 0 ? (
                            <div className={`flex items-center gap-1.5 font-bold text-lg ${tx.amount > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {tx.amount > 0 ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
                              {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)}
                            </div>
                          ) : (
                            <span className="text-gray-500 font-bold text-lg">0.00</span>
                          )}
                        </td>
                        <td className="p-4 lg:p-5 text-gray-300 font-medium">
                          <span className="group-hover:text-white transition-colors">{tx.description}</span>
                          {tx.txId && <span className="block text-xs font-mono text-gray-500 mt-1 bg-white/5 inline-block px-2 py-0.5 rounded-md">ID: {tx.txId}</span>}
                        </td>
                        <td className="p-4 lg:p-5 text-right font-mono text-gray-400">
                          {balanceBefore !== null && tx.balanceAfter !== undefined ? (
                            <div className="flex items-center justify-end gap-2 text-sm">
                              <span className="opacity-50">${balanceBefore.toFixed(2)}</span>
                              <span className="text-gray-600">&rarr;</span>
                              <span className="text-white font-bold bg-white/10 px-2 py-1 rounded-lg">${tx.balanceAfter.toFixed(2)}</span>
                            </div>
                          ) : (
                            <span className="text-white font-bold bg-white/10 px-2 py-1 rounded-lg">
                              ${tx.balanceAfter !== undefined ? tx.balanceAfter.toFixed(2) : '---'}
                            </span>
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
        {!loading && transactions.length > 0 && (
          <TablePagination
            totalItems={transactions.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            itemLabel="transactions"
            variant="reseller"
          />
        )}
      </div>
    </div>
  );
};
