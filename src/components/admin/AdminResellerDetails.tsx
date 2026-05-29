import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  Building2,
  Clock,
  DollarSign,
  Download,
  Loader2,
  LogIn,
  Plus,
  RefreshCw,
  Shield,
  TrendingUp,
  UserCheck,
  Users,
  UserX,
  Wallet,
} from 'lucide-react';
import {
  AdminResellerApi,
  AdminResellerCustomer,
  AdminResellerProfile,
  AdminResellerTransaction,
  ResellerDateRange,
  RESELLER_DATE_RANGE_LABELS,
} from '../../services/admin/adminResellerApi';
import { formatAuthProviderLabel } from '../../lib/authProviderLabels';
import { paginateItems, TablePagination } from '../TablePagination';
import { ResellerDateRangeFilter } from './ResellerDateRangeFilter';
import { ResellerDepositSpendChart } from './ResellerDepositSpendChart';
import { supabase } from '../../lib/supabase';
import { getApiBaseUrl } from '../../lib/apiBase';
import { getAccessTokenForApi } from '../../lib/getAccessTokenForApi';
import { toast } from '../../lib/toast';
import { useConfirmDialog } from '../../contexts/ConfirmDialogContext';
import { downloadCsv } from '../../lib/downloadCsv';

const money = (n: number) => `$${n.toFixed(2)}`;

function txTypeBadge(type: AdminResellerTransaction['type']) {
  const map = {
    deposit: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
    deduct: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
    refund: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300',
    system: 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300',
  };
  return map[type] || map.system;
}

function customerStatusBadge(status: AdminResellerCustomer['status']) {
  if (status === 'active') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300';
  if (status === 'refunded') return 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300';
  return 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300';
}

type Props = {
  resellerId: string;
  initialDateRange?: ResellerDateRange;
  onBack: () => void;
  onChanged?: () => void;
};

export const AdminResellerDetails: React.FC<Props> = ({
  resellerId,
  initialDateRange = 'all',
  onBack,
  onChanged,
}) => {
  const { confirm } = useConfirmDialog();
  const [profile, setProfile] = useState<AdminResellerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState<ResellerDateRange>(initialDateRange);
  const [tab, setTab] = useState<'transactions' | 'customers'>('transactions');
  const [txPage, setTxPage] = useState(1);
  const [custPage, setCustPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [fundsAmount, setFundsAmount] = useState('');
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [addingFunds, setAddingFunds] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await AdminResellerApi.getProfile(resellerId, dateRange);
      setProfile(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load reseller profile');
    } finally {
      setLoading(false);
    }
  }, [resellerId, dateRange]);

  useEffect(() => {
    load();
  }, [load]);

  const r = profile?.reseller;
  const paginatedTx = useMemo(
    () => paginateItems(profile?.transactions || [], txPage, pageSize),
    [profile?.transactions, txPage, pageSize],
  );
  const paginatedCustomers = useMemo(
    () => paginateItems(profile?.customers || [], custPage, pageSize),
    [profile?.customers, custPage, pageSize],
  );

  const toggleBan = async () => {
    if (!r) return;
    const action = r.isBanned ? 'unban' : 'ban';
    const ok = await confirm({
      title: `${action === 'ban' ? 'Ban' : 'Unban'} this reseller?`,
      confirmLabel: action === 'ban' ? 'Ban reseller' : 'Unban',
      variant: action === 'ban' ? 'danger' : 'default',
    });
    if (!ok) return;

    setActionLoading(true);
    try {
      const { error: updateErr } = await supabase
        .from('users')
        .update({ is_banned: !r.isBanned })
        .eq('id', resellerId);
      if (updateErr) throw updateErr;
      toast.success(`Reseller ${action === 'ban' ? 'banned' : 'unbanned'}`);
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || `Failed to ${action} reseller`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddFunds = async () => {
    if (!r) return;
    const amount = parseFloat(fundsAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid amount greater than 0');
      return;
    }

    setAddingFunds(true);
    try {
      const newBalance = r.walletBalance + amount;
      const { error: updateErr } = await supabase
        .from('users')
        .update({ wallet_balance: newBalance })
        .eq('id', resellerId);
      if (updateErr) throw updateErr;

      const { error: txErr } = await supabase.from('reseller_transactions').insert({
        reseller_id: resellerId,
        amount,
        type: 'deposit',
        status: 'completed',
        description: 'Funds manually added by Admin',
        balance_after: newBalance,
      });
      if (txErr) throw txErr;

      toast.success(`Added ${money(amount)} to wallet`);
      setFundsAmount('');
      setShowAddFunds(false);
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add funds');
    } finally {
      setAddingFunds(false);
    }
  };

  const loginAsReseller = async () => {
    if (!r) return;
    if (r.isBanned) {
      toast.error('Cannot login as a banned reseller');
      return;
    }

    setActionLoading(true);
    try {
      const token = await getAccessTokenForApi();
      if (!token) throw new Error('Not authenticated');

      const res = await fetch(`${getApiBaseUrl()}/api/admin/users/${resellerId}/impersonate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to start impersonation');
      const actionLink = String(result.action_link || '');
      if (!actionLink) throw new Error('Missing action link');
      window.location.assign(actionLink);
    } catch (e: any) {
      toast.error(e?.message || 'Could not login as reseller');
      setActionLoading(false);
    }
  };

  const exportTransactionsCsv = () => {
    if (!profile?.transactions.length || !r) return;
    downloadCsv(
      `reseller_${r.email}_transactions_${format(new Date(), 'yyyy-MM-dd')}.csv`,
      ['Date', 'Type', 'Amount', 'Status', 'Description', 'Tx ID', 'Balance after'],
      profile.transactions.map((tx) => [
        format(new Date(tx.createdAt), 'yyyy-MM-dd HH:mm'),
        tx.type,
        tx.amount.toFixed(2),
        tx.status,
        tx.description,
        tx.txId || '',
        tx.balanceAfter != null ? tx.balanceAfter.toFixed(2) : '',
      ]),
    );
  };

  const exportCustomersCsv = () => {
    if (!profile?.customers.length || !r) return;
    downloadCsv(
      `reseller_${r.email}_customers_${format(new Date(), 'yyyy-MM-dd')}.csv`,
      ['Email', 'Organization', 'Duration', 'Status', 'Products', 'Activated', 'Expires'],
      profile.customers.map((c) => [
        c.email,
        c.organizationName || '',
        c.durationMonths,
        c.status,
        c.products.join('; '),
        format(new Date(c.activatedAt), 'yyyy-MM-dd'),
        format(new Date(c.expiresAt), 'yyyy-MM-dd'),
      ]),
    );
  };

  if (loading && !profile) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error || !r || !profile) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to resellers
        </button>
        <div className="rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {error || 'Reseller not found'}
        </div>
      </div>
    );
  }

  const rangeLabel = RESELLER_DATE_RANGE_LABELS[dateRange];
  const depositSpendSuffix = dateRange === 'all' ? '' : ` (${rangeLabel})`;

  const statCards = [
    { label: 'Wallet balance', value: money(r.walletBalance), icon: Wallet, tone: 'text-emerald-600 dark:text-emerald-400' },
    { label: `Deposited${depositSpendSuffix}`, value: money(r.totalDeposits), icon: DollarSign, tone: 'text-indigo-600 dark:text-indigo-400' },
    { label: `Spent${depositSpendSuffix}`, value: money(r.totalSpent), icon: TrendingUp, tone: 'text-blue-600 dark:text-blue-400' },
    { label: 'Total customers', value: String(r.totalCustomers), icon: Users, tone: 'text-violet-600 dark:text-violet-400' },
    { label: 'Active customers', value: String(r.activeCustomers), icon: UserCheck, tone: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Expiring ≤ 7 days', value: String(r.expiringIn7Days), icon: Clock, tone: 'text-amber-600 dark:text-amber-400' },
    { label: 'Expired', value: String(r.expiredCustomers), icon: RefreshCw, tone: 'text-rose-600 dark:text-rose-400' },
    { label: 'Refunded', value: String(r.refundedCustomers), icon: Shield, tone: 'text-orange-600 dark:text-orange-400' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline mb-3"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to resellers
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{r.name}</h2>
            {r.isBanned ? (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                Banned
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                Active reseller
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 break-all">{r.email}</p>
          {r.phone && <p className="text-sm text-gray-500 dark:text-gray-400">{r.phone}</p>}
          <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
            <span>Joined {format(new Date(r.createdAt), 'MMM d, yyyy')}</span>
            {r.signupAuthProvider && <span>Signup: {formatAuthProviderLabel(r.signupAuthProvider)}</span>}
            {r.lastActivityAt && (
              <span>Last activity {formatDistanceToNow(new Date(r.lastActivityAt), { addSuffix: true })}</span>
            )}
            {r.pendingDeposits > 0 && (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                Pending deposits: {money(r.pendingDeposits)}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 w-full lg:w-auto">
          <ResellerDateRangeFilter value={dateRange} onChange={setDateRange} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowAddFunds((v) => !v)}
              disabled={actionLoading || addingFunds}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add funds
            </button>
            <button
              type="button"
              onClick={loginAsReseller}
              disabled={actionLoading || r.isBanned}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 text-sm font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-500/10 disabled:opacity-50"
            >
              <LogIn className="h-4 w-4" />
              Login as
            </button>
            <button
              type="button"
              onClick={toggleBan}
              disabled={actionLoading}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 ${
                r.isBanned
                  ? 'border border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  : 'border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400'
              }`}
            >
              {r.isBanned ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
              {r.isBanned ? 'Unban' : 'Ban'}
            </button>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-[#303038] text-sm font-semibold hover:bg-gray-50 dark:hover:bg-white/5"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {showAddFunds && (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/5 p-4 flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Amount (USD)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={fundsAmount}
              onChange={(e) => setFundsAmount(e.target.value)}
              placeholder="e.g. 50.00"
              className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#111113] text-sm"
            />
          </div>
          <button
            type="button"
            onClick={handleAddFunds}
            disabled={addingFunds}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50"
          >
            {addingFunds ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Confirm
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-4 shadow-sm"
          >
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <card.icon className={`h-4 w-4 ${card.tone}`} />
              {card.label}
            </div>
            <p className={`mt-2 text-xl font-bold ${card.tone}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <ResellerDepositSpendChart data={profile.monthlyTrend} title="This reseller — monthly deposits vs spend" />

      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] overflow-hidden shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-[#26262d]">
          <div className="flex border-b sm:border-b-0 border-gray-100 dark:border-[#26262d] -mb-px sm:mb-0">
            {(['transactions', 'customers'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`px-5 py-3 text-sm font-semibold transition-colors ${
                  tab === key
                    ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500 -mb-px'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                {key === 'transactions' ? `Transactions (${profile.transactions.length})` : `Customers (${profile.customers.length})`}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={tab === 'transactions' ? exportTransactionsCsv : exportCustomersCsv}
            disabled={tab === 'transactions' ? !profile.transactions.length : !profile.customers.length}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-[#303038] text-sm font-semibold hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-50 mr-4 sm:mr-0"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>

        {tab === 'transactions' ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/[0.02]">
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">When</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Type</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Amount</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-[#26262d]">
                  {paginatedTx.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                        No transactions yet.
                      </td>
                    </tr>
                  ) : (
                    paginatedTx.map((tx) => (
                      <tr key={tx.id} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                          {format(new Date(tx.createdAt), 'MMM d, yyyy HH:mm')}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${txTypeBadge(tx.type)}`}>
                            {tx.type}
                          </span>
                        </td>
                        <td className={`px-4 py-3 font-bold ${tx.amount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {tx.amount >= 0 ? '+' : ''}
                          {money(Math.abs(tx.amount))}
                        </td>
                        <td className="px-4 py-3 capitalize text-gray-600 dark:text-gray-300">{tx.status}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-md">
                          <div>{tx.description}</div>
                          {tx.txId && <div className="text-xs font-mono mt-0.5 opacity-70">Tx: {tx.txId}</div>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {profile.transactions.length > 0 && (
              <TablePagination
                totalItems={profile.transactions.length}
                page={txPage}
                pageSize={pageSize}
                onPageChange={setTxPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setTxPage(1);
                  setCustPage(1);
                }}
                itemLabel="transactions"
                variant="admin"
              />
            )}
          </>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/[0.02]">
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Customer</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Organization</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Duration</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Expires</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-[#26262d]">
                  {paginatedCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                        No customers yet.
                      </td>
                    </tr>
                  ) : (
                    paginatedCustomers.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 dark:text-gray-100">{c.email}</div>
                          <div className="text-xs text-gray-500">{c.products.join(', ') || 'Creative Cloud'}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                          {c.organizationName ? (
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="h-3.5 w-3.5" />
                              {c.organizationName}
                            </span>
                          ) : (
                            <span className="text-gray-400 italic">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.durationMonths}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${customerStatusBadge(c.status)}`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                          {format(new Date(c.expiresAt), 'MMM d, yyyy')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {profile.customers.length > 0 && (
              <TablePagination
                totalItems={profile.customers.length}
                page={custPage}
                pageSize={pageSize}
                onPageChange={setCustPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setTxPage(1);
                  setCustPage(1);
                }}
                itemLabel="customers"
                variant="admin"
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};
