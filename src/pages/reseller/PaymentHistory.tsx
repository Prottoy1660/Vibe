import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw,
  Loader2,
  Wallet,
  User,
  Hash,
  CreditCard,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ResellerApi, Transaction } from '../../services/reseller/resellerApi';
import { paginateItems, TablePagination } from '../../components/reseller/TablePagination';

function formatDateTime(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getStatusBadge(status: Transaction['status']) {
  if (status === 'pending') {
    return (
      <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
        PENDING
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="px-3 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
        REJECTED
      </span>
    );
  }
  return (
    <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
      {status === 'approved' ? 'APPROVED' : 'COMPLETED'}
    </span>
  );
}

function getChannelLabel(channel?: Transaction['paymentChannel']) {
  if (channel === 'crypto') return 'Crypto deposit';
  if (channel === 'pay') return 'Binance Pay';
  return '—';
}

export const PaymentHistory = () => {
  const [payments, setPayments] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const paginatedPayments = paginateItems(payments, page, pageSize);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      try {
        await ResellerApi.syncPaymentDetailsFromBinance();
      } catch (syncErr) {
        console.warn('Binance payment sync skipped:', syncErr);
      }
      const data = await ResellerApi.getPaymentHistory();
      setPayments(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  return (
    <div className="space-y-6 lg:space-y-8 pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl lg:text-4xl font-extrabold text-white tracking-tight">Payment History</h1>
          <p className="text-gray-400 mt-1 lg:mt-2 text-base lg:text-lg">
            Binance payments you submitted — amount, transaction ID, and payer details from Binance.
          </p>
        </div>
        <button
          onClick={fetchPayments}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all border border-white/10 disabled:opacity-50 active:scale-95 w-full sm:w-auto"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="bg-[#111111] border border-white/5 rounded-2xl lg:rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[960px]">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/5 text-xs uppercase tracking-widest text-gray-500">
                <th className="p-4 lg:p-5 font-bold">Date</th>
                <th className="p-4 lg:p-5 font-bold">Amount</th>
                <th className="p-4 lg:p-5 font-bold">Status</th>
                <th className="p-4 lg:p-5 font-bold">Submitted Tx ID</th>
                <th className="p-4 lg:p-5 font-bold">Payer Binance ID</th>
                <th className="p-4 lg:p-5 font-bold">Payer Name</th>
                <th className="p-4 lg:p-5 font-bold text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              <AnimatePresence>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center">
                      <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mx-auto" />
                      <p className="text-gray-500 mt-4 font-medium">Loading payment history...</p>
                    </td>
                  </tr>
                ) : payments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-16 text-center text-gray-500">
                      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Wallet className="h-6 w-6 text-gray-500" />
                      </div>
                      <p className="font-medium text-lg text-gray-400">No payments yet</p>
                      <p className="text-sm mt-1">Add funds via Binance Pay and your payment details will appear here.</p>
                    </td>
                  </tr>
                ) : (
                  paginatedPayments.map((payment) => {
                    const isExpanded = expandedId === payment.id;
                    const hasDetails =
                      payment.binanceOrderId ||
                      payment.binanceTransactionId ||
                      payment.paymentChannel ||
                      payment.paymentCurrency ||
                      payment.binanceTransactionTime;

                    return (
                      <React.Fragment key={payment.id}>
                        <motion.tr
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          transition={{ duration: 0.2 }}
                          className="hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="p-4 lg:p-5 text-gray-400 whitespace-nowrap font-medium">
                            {formatDateTime(payment.createdAt)}
                          </td>
                          <td className="p-4 lg:p-5">
                            <div className="font-bold text-lg text-emerald-500">+${payment.amount.toFixed(2)}</div>
                            {payment.paymentCurrency && (
                              <span className="text-xs text-gray-500">{payment.paymentCurrency}</span>
                            )}
                          </td>
                          <td className="p-4 lg:p-5">{getStatusBadge(payment.status)}</td>
                          <td className="p-4 lg:p-5">
                            {payment.txId ? (
                              <span className="font-mono text-xs text-gray-300 bg-white/5 px-2 py-1 rounded-md break-all">
                                {payment.txId}
                              </span>
                            ) : (
                              <span className="text-gray-500">—</span>
                            )}
                          </td>
                          <td className="p-4 lg:p-5 font-mono text-gray-300">
                            {payment.payerBinanceId || <span className="text-gray-500">—</span>}
                          </td>
                          <td className="p-4 lg:p-5 text-gray-300">
                            {payment.payerName || <span className="text-gray-500">—</span>}
                          </td>
                          <td className="p-4 lg:p-5 text-right">
                            <button
                              type="button"
                              onClick={() => setExpandedId(isExpanded ? null : payment.id)}
                              disabled={!hasDetails && payment.status === 'pending'}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              {isExpanded ? 'Hide' : 'View'}
                            </button>
                          </td>
                        </motion.tr>

                        {isExpanded && (
                          <tr className="bg-white/[0.015]">
                            <td colSpan={7} className="p-4 lg:p-6">
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <DetailItem
                                  icon={CreditCard}
                                  label="Payment method"
                                  value={getChannelLabel(payment.paymentChannel)}
                                />
                                <DetailItem
                                  icon={Hash}
                                  label="Binance order ID"
                                  value={payment.binanceOrderId}
                                />
                                <DetailItem
                                  icon={Hash}
                                  label="Binance transaction ID"
                                  value={payment.binanceTransactionId}
                                />
                                <DetailItem
                                  icon={User}
                                  label="Payer Binance ID"
                                  value={payment.payerBinanceId}
                                />
                                <DetailItem icon={User} label="Payer name" value={payment.payerName} />
                                <DetailItem
                                  icon={User}
                                  label="Payer account type"
                                  value={payment.payerType}
                                />
                                <DetailItem
                                  icon={Clock}
                                  label="Binance payment time"
                                  value={
                                    payment.binanceTransactionTime
                                      ? formatDateTime(payment.binanceTransactionTime)
                                      : undefined
                                  }
                                />
                                <DetailItem
                                  icon={Wallet}
                                  label="Balance after credit"
                                  value={
                                    payment.balanceAfter != null
                                      ? `$${payment.balanceAfter.toFixed(2)}`
                                      : undefined
                                  }
                                />
                              </div>
                              {payment.status === 'pending' && !payment.payerBinanceId && (
                                <p className="mt-4 text-xs text-amber-400/90">
                                  Payer details appear after Binance auto-verifies this payment or admin approves it.
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {!loading && payments.length > 0 && (
          <TablePagination
            totalItems={payments.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            itemLabel="payments"
            variant="reseller"
          />
        )}
      </div>
    </div>
  );
};

function DetailItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#0a0a0a] p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500 mb-2">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="text-sm font-medium text-gray-200 break-all">{value || '—'}</p>
    </div>
  );
}
