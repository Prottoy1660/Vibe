import React, { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  Check,
  X,
  Search,
  Clock,
  User,
  Wallet,
  CreditCard,
  Hash,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import {
  ResellerApi,
  Transaction,
  AdminDepositsQuery,
} from '../../services/reseller/resellerApi';
import { TablePagination } from '../TablePagination';

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function statusBadge(status: Transaction['status']) {
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400">
        PENDING
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-400">
        REJECTED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400">
      {status === 'approved' ? 'APPROVED' : 'COMPLETED'}
    </span>
  );
}

function channelLabel(channel?: Transaction['paymentChannel']) {
  if (channel === 'pay') return 'Binance Pay';
  if (channel === 'crypto') return 'Crypto deposit';
  return 'Not verified yet';
}

export const AdminResellerDeposits = () => {
  const [deposits, setDeposits] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AdminDepositsQuery['status']>('all');

  const fetchDeposits = useCallback(async () => {
    setLoading(true);
    try {
      const result = await ResellerApi.adminGetDeposits({
        page,
        pageSize,
        search,
        status: statusFilter,
      });

      const idsNeedingSync = result.deposits
        .filter((d) => d.txId && !d.payerBinanceId && !d.paymentChannel && !d.binanceTransactionId)
        .map((d) => d.id);

      if (idsNeedingSync.length > 0) {
        try {
          await ResellerApi.adminSyncDepositsFromBinance(idsNeedingSync);
          const refreshed = await ResellerApi.adminGetDeposits({
            page,
            pageSize,
            search,
            status: statusFilter,
          });
          setDeposits(refreshed.deposits);
          setTotal(refreshed.total);
          setPendingCount(refreshed.pendingCount);
          return;
        } catch (syncErr) {
          console.warn('Binance deposit sync skipped:', syncErr);
        }
      }

      setDeposits(result.deposits);
      setTotal(result.total);
      setPendingCount(result.pendingCount);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter]);

  useEffect(() => {
    fetchDeposits();
  }, [fetchDeposits]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, pageSize]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
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
    <div className="space-y-6 max-w-7xl mx-auto py-8">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">Reseller Deposits</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 max-w-2xl">
              See which reseller submitted each deposit, who paid on Binance, and approve pending requests.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchDeposits}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <div className="rounded-xl border border-gray-100 dark:border-[#26262d] bg-white/70 dark:bg-[#151518]/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Total deposits</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1 tabular-nums">{total}</p>
          </div>
          <div className="rounded-xl border border-amber-200/60 dark:border-amber-500/20 bg-amber-50/70 dark:bg-amber-500/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Pending review</p>
            <p className="text-2xl font-bold text-amber-800 dark:text-amber-200 mt-1 tabular-nums">{pendingCount}</p>
          </div>
          <div className="rounded-xl border border-gray-100 dark:border-[#26262d] bg-white/70 dark:bg-[#151518]/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Showing</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1 tabular-nums">
              {deposits.length} <span className="text-sm font-medium text-gray-500">on this page</span>
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search reseller name/email, Tx ID, Binance ID, payer name..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-500/30"
          />
        </form>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AdminDepositsQuery['status'])}
          className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-500/30"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="bg-white dark:bg-[#151518] rounded-2xl border border-gray-200 dark:border-[#26262d] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-[#26262d] bg-gray-50 dark:bg-white/[0.02] text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <th className="px-5 py-4 font-semibold">Date</th>
                <th className="px-5 py-4 font-semibold">Reseller account</th>
                <th className="px-5 py-4 font-semibold">Binance payer</th>
                <th className="px-5 py-4 font-semibold">Amount</th>
                <th className="px-5 py-4 font-semibold">Status</th>
                <th className="px-5 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#26262d]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <Loader2 className="h-7 w-7 animate-spin text-indigo-500 mx-auto" />
                    <p className="text-gray-500 mt-3 text-sm">Loading deposits...</p>
                  </td>
                </tr>
              ) : deposits.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <AlertCircle className="h-8 w-8 mx-auto mb-3 text-gray-400" />
                    No deposits match your filters.
                  </td>
                </tr>
              ) : (
                deposits.map((tx) => {
                  const isExpanded = expandedId === tx.id;
                  return (
                    <React.Fragment key={tx.id}>
                      <tr className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors align-top">
                        <td className="px-5 py-4 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 shrink-0" />
                            <span className="font-medium">{formatDateTime(tx.createdAt)}</span>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
                              <User className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                                {tx.resellerName || 'Unknown reseller'}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                {tx.resellerEmail || 'No email'}
                              </p>
                              <p className="text-[11px] font-mono text-gray-400 mt-1 truncate">
                                ID: {tx.reseller_id?.slice(0, 8) || '—'}…
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <div className="space-y-1.5">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                              {channelLabel(tx.paymentChannel)}
                            </p>
                            <p className="font-mono text-sm text-gray-900 dark:text-gray-100">
                              {tx.payerBinanceId || <span className="text-gray-400 font-sans">Not captured</span>}
                            </p>
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              {tx.payerName || <span className="text-gray-400">No payer name</span>}
                            </p>
                            {tx.txId && (
                              <p className="text-[11px] font-mono text-gray-500 break-all bg-gray-50 dark:bg-white/[0.03] px-2 py-1 rounded-md">
                                Submitted: {tx.txId}
                              </p>
                            )}
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <p className="font-bold text-lg text-gray-900 dark:text-gray-100 tabular-nums">
                            ${tx.amount.toFixed(2)}
                          </p>
                          {tx.paymentCurrency && (
                            <p className="text-xs text-gray-500 mt-0.5">{tx.paymentCurrency}</p>
                          )}
                          {tx.balanceAfter != null && (
                            <p className="text-xs text-gray-500 mt-1">
                              Balance → ${tx.balanceAfter.toFixed(2)}
                            </p>
                          )}
                        </td>

                        <td className="px-5 py-4">{statusBadge(tx.status)}</td>

                        <td className="px-5 py-4 text-right">
                          <div className="flex flex-col items-end gap-2">
                            <button
                              type="button"
                              onClick={() => setExpandedId(isExpanded ? null : tx.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-[#26262d] text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                            >
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              Details
                            </button>
                            {tx.status === 'pending' && (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleUpdateStatus(tx.id, 'approved')}
                                  disabled={processingId === tx.id}
                                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20 rounded-lg transition-colors font-medium disabled:opacity-50 text-xs"
                                >
                                  {processingId === tx.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Check className="h-3.5 w-3.5" />
                                  )}
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleUpdateStatus(tx.id, 'rejected')}
                                  disabled={processingId === tx.id}
                                  className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 rounded-lg transition-colors font-medium disabled:opacity-50 text-xs"
                                >
                                  <X className="h-3.5 w-3.5" />
                                  Reject
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-gray-50/80 dark:bg-white/[0.02]">
                          <td colSpan={6} className="px-5 py-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                              <DetailCard icon={User} label="Reseller name" value={tx.resellerName} />
                              <DetailCard icon={User} label="Reseller email" value={tx.resellerEmail} />
                              <DetailCard icon={Hash} label="Submitted Tx / Order ID" value={tx.txId} mono />
                              <DetailCard icon={Hash} label="Binance order ID" value={tx.binanceOrderId} mono />
                              <DetailCard icon={Hash} label="Binance transaction ID" value={tx.binanceTransactionId} mono />
                              <DetailCard icon={CreditCard} label="Payer Binance ID" value={tx.payerBinanceId} mono />
                              <DetailCard icon={User} label="Payer name" value={tx.payerName} />
                              <DetailCard icon={User} label="Payer account type" value={tx.payerType} />
                              <DetailCard icon={CreditCard} label="Payment method" value={channelLabel(tx.paymentChannel)} />
                              <DetailCard icon={Wallet} label="Currency" value={tx.paymentCurrency} />
                              <DetailCard
                                icon={Clock}
                                label="Binance payment time"
                                value={tx.binanceTransactionTime ? formatDateTime(tx.binanceTransactionTime) : undefined}
                              />
                              <DetailCard icon={Wallet} label="Description" value={tx.description} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && total > 0 && (
          <TablePagination
            totalItems={total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[10, 25, 50, 100]}
            itemLabel="deposits"
            variant="admin"
          />
        )}
      </div>
    </div>
  );
};

function DetailCard({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] p-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={`text-sm text-gray-900 dark:text-gray-100 break-all ${mono ? 'font-mono' : 'font-medium'}`}>
        {value || '—'}
      </p>
    </div>
  );
}
