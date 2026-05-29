import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Crown,
  DollarSign,
  Download,
  Eye,
  Loader2,
  RefreshCw,
  Search,
  Store,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import {
  AdminResellerApi,
  AdminResellerLeader,
  AdminResellerOverview,
  AdminResellerSummary,
  ResellerDateRange,
  RESELLER_DATE_RANGE_LABELS,
} from '../../services/admin/adminResellerApi';
import { AdminResellerDetails } from './AdminResellerDetails';
import { ResellerDateRangeFilter } from './ResellerDateRangeFilter';
import { ResellerDepositSpendChart } from './ResellerDepositSpendChart';
import { paginateItems, TablePagination } from '../TablePagination';
import { downloadCsv } from '../../lib/downloadCsv';

const money = (n: number) => `$${n.toFixed(2)}`;

type SortKey = 'customers' | 'deposits' | 'spent' | 'balance' | 'joined';

function LeaderCard({
  title,
  icon: Icon,
  items,
  formatValue,
  onSelect,
}: {
  title: string;
  icon: React.ElementType;
  items: AdminResellerLeader[];
  formatValue: (v: number) => string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-5 w-5 text-indigo-500" />
        <h3 className="font-bold text-gray-900 dark:text-gray-100">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No data yet.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className="w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors text-left group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    idx === 0
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'
                  }`}
                >
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                    {item.name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{item.email}</p>
                </div>
              </div>
              <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                {formatValue(item.value)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const AdminResellers = () => {
  const [overview, setOverview] = useState<AdminResellerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('customers');
  const [dateRange, setDateRange] = useState<ResellerDateRange>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const data = await AdminResellerApi.getOverview(dateRange);
      setOverview(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load reseller overview');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const rows = overview?.resellers || [];
    const q = search.trim().toLowerCase();
    const matched = q
      ? rows.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.email.toLowerCase().includes(q) ||
            (r.phone || '').toLowerCase().includes(q),
        )
      : rows;

    return [...matched].sort((a, b) => {
      switch (sortKey) {
        case 'deposits':
          return b.totalDeposits - a.totalDeposits;
        case 'spent':
          return b.totalSpent - a.totalSpent;
        case 'balance':
          return b.walletBalance - a.walletBalance;
        case 'joined':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        default:
          return b.totalCustomers - a.totalCustomers;
      }
    });
  }, [overview?.resellers, search, sortKey]);

  useEffect(() => {
    setPage(1);
  }, [search, sortKey, pageSize, dateRange]);

  const paginated = useMemo(() => paginateItems(filtered, page, pageSize), [filtered, page, pageSize]);

  const exportResellersCsv = () => {
    if (!filtered.length) return;
    downloadCsv(
      `resellers_${dateRange}_${format(new Date(), 'yyyy-MM-dd')}.csv`,
      [
        'Name',
        'Email',
        'Phone',
        'Customers',
        'Active customers',
        'Deposited',
        'Spent',
        'Wallet balance',
        'Pending deposits',
        'Banned',
        'Joined',
        'Last activity',
      ],
      filtered.map((r) => [
        r.name,
        r.email,
        r.phone || '',
        r.totalCustomers,
        r.activeCustomers,
        r.totalDeposits.toFixed(2),
        r.totalSpent.toFixed(2),
        r.walletBalance.toFixed(2),
        r.pendingDeposits.toFixed(2),
        r.isBanned ? 'yes' : 'no',
        format(new Date(r.createdAt), 'yyyy-MM-dd'),
        r.lastActivityAt ? format(new Date(r.lastActivityAt), 'yyyy-MM-dd HH:mm') : '',
      ]),
    );
  };

  if (selectedId) {
    return (
      <AdminResellerDetails
        resellerId={selectedId}
        initialDateRange={dateRange}
        onBack={() => setSelectedId(null)}
        onChanged={() => load(true)}
      />
    );
  }

  const platform = overview?.platform;
  const rangeLabel = RESELLER_DATE_RANGE_LABELS[dateRange];
  const depositSpendSuffix = dateRange === 'all' ? '' : ` (${rangeLabel})`;

  const statCards = platform
    ? [
        { label: 'Total resellers', value: String(platform.totalResellers), icon: Store, tone: 'text-indigo-600 dark:text-indigo-400' },
        { label: 'Active resellers', value: String(platform.activeResellers), icon: UserCheck, tone: 'text-emerald-600 dark:text-emerald-400' },
        { label: 'Total customers', value: String(platform.totalCustomers), icon: Users, tone: 'text-violet-600 dark:text-violet-400' },
        { label: 'Active customers', value: String(platform.activeCustomers), icon: Crown, tone: 'text-blue-600 dark:text-blue-400' },
        { label: `Deposited${depositSpendSuffix}`, value: money(platform.totalDepositsUsd), icon: DollarSign, tone: 'text-emerald-600 dark:text-emerald-400' },
        { label: `Spent${depositSpendSuffix}`, value: money(platform.totalSpentUsd), icon: TrendingUp, tone: 'text-rose-600 dark:text-rose-400' },
        { label: 'Wallet balances', value: money(platform.totalWalletBalanceUsd), icon: Wallet, tone: 'text-amber-600 dark:text-amber-400' },
        { label: 'Pending deposits', value: money(platform.pendingDepositsUsd), icon: RefreshCw, tone: 'text-orange-600 dark:text-orange-400' },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Store className="h-7 w-7 text-indigo-500" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Reseller overview</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
            Platform-wide reseller metrics, leaderboards, and per-reseller profiles with deposits, spend, and customer data.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ResellerDateRangeFilter value={dateRange} onChange={setDateRange} />
          <button
            type="button"
            onClick={exportResellersCsv}
            disabled={!filtered.length}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#151518] text-sm font-semibold hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#151518] text-sm font-semibold hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : overview ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {statCards.map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-4 shadow-sm"
              >
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <card.icon className={`h-4 w-4 ${card.tone}`} />
                  {card.label}
                </div>
                <p className={`mt-2 text-xl lg:text-2xl font-bold ${card.tone}`}>{card.value}</p>
              </div>
            ))}
          </div>

          <ResellerDepositSpendChart data={overview.monthlyTrend} />

          <div className="grid lg:grid-cols-3 gap-4">
            <LeaderCard
              title="Most customers"
              icon={Users}
              items={overview.leaders.topByCustomers}
              formatValue={(v) => String(v)}
              onSelect={setSelectedId}
            />
            <LeaderCard
              title={`Top deposits${depositSpendSuffix}`}
              icon={DollarSign}
              items={overview.leaders.topByDeposits}
              formatValue={money}
              onSelect={setSelectedId}
            />
            <LeaderCard
              title={`Top spend${depositSpendSuffix}`}
              icon={TrendingUp}
              items={overview.leaders.topBySpent}
              formatValue={money}
              onSelect={setSelectedId}
            />
          </div>

          <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] overflow-hidden shadow-sm">
            <div className="p-4 border-b border-gray-100 dark:border-[#26262d] flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between bg-gray-50/50 dark:bg-white/[0.02]">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {filtered.length} reseller{filtered.length === 1 ? '' : 's'}
                {dateRange !== 'all' && (
                  <span className="ml-1 text-indigo-600 dark:text-indigo-400">· {rangeLabel} deposit/spend</span>
                )}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="px-3 py-2 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#111113] text-sm"
                >
                  <option value="customers">Sort: most customers</option>
                  <option value="deposits">Sort: highest deposits</option>
                  <option value="spent">Sort: highest spend</option>
                  <option value="balance">Sort: wallet balance</option>
                  <option value="joined">Sort: newest</option>
                </select>
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, email, phone..."
                    className="w-full pl-10 pr-3 py-2 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#111113] text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[980px]">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/[0.02]">
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Reseller</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Customers</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Deposited</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Spent</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Balance</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Last activity</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-[#26262d]">
                  {paginated.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                        No resellers match your search.
                      </td>
                    </tr>
                  ) : (
                    paginated.map((r: AdminResellerSummary) => (
                      <tr
                        key={r.id}
                        className="hover:bg-gray-50/60 dark:hover:bg-white/[0.02] cursor-pointer"
                        onClick={() => setSelectedId(r.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900 dark:text-gray-100">{r.name}</div>
                          <div className="text-xs text-gray-500 break-all">{r.email}</div>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {r.isBanned && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                                Banned
                              </span>
                            )}
                            {r.pendingDeposits > 0 && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                                Pending {money(r.pendingDeposits)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-gray-900 dark:text-gray-100">{r.totalCustomers}</div>
                          <div className="text-xs text-gray-500">
                            {r.activeCustomers} active · {r.expiringIn7Days} expiring
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400">{money(r.totalDeposits)}</td>
                        <td className="px-4 py-3 font-semibold text-blue-600 dark:text-blue-400">{money(r.totalSpent)}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">{money(r.walletBalance)}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {r.lastActivityAt
                            ? formatDistanceToNow(new Date(r.lastActivityAt), { addSuffix: true })
                            : '—'}
                          <div className="text-[11px] opacity-70">
                            Joined {format(new Date(r.createdAt), 'MMM d, yyyy')}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(r.id);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-xs font-semibold"
                          >
                            <Eye className="h-4 w-4" />
                            Profile
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {filtered.length > 0 && (
              <TablePagination
                totalItems={filtered.length}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                itemLabel="resellers"
                variant="admin"
              />
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};
