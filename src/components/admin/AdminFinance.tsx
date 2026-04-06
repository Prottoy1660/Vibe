import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  Loader2,
  CalendarRange,
  ShoppingCart,
  DollarSign,
  TrendingDown,
  Scale,
  Plus,
  Trash2,
  ChevronRight,
  Users,
} from 'lucide-react';
import {
  format,
  parseISO,
  startOfDay,
  endOfDay,
  subDays,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isAfter,
} from 'date-fns';
import { getApiBaseUrl } from '../../lib/apiBase';
import { getAccessTokenForApi } from '../../lib/getAccessTokenForApi';
import { ADMIN_ORDERS_QUERY_LIMIT } from '../../lib/adminDataLimits';
import { toast } from '../../lib/toast';
import { useConfirmDialog } from '../../contexts/ConfirmDialogContext';

interface PaidOrderRow {
  id: string;
  total_amount: number | string;
  created_at: string;
}

interface OperationalExpense {
  id: string;
  category: string;
  amount: number | string;
  expense_date: string;
  note: string | null;
  created_at: string;
}

function money(n: number): string {
  return `৳${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const AdminFinance = ({ embedded = false }: { embedded?: boolean }) => {
  const navigate = useNavigate();
  const { confirm } = useConfirmDialog();
  const [rangeStart, setRangeStart] = useState(() => format(startOfDay(new Date()), 'yyyy-MM-dd'));
  const [rangeEnd, setRangeEnd] = useState(() => format(endOfDay(new Date()), 'yyyy-MM-dd'));

  const [orders, setOrders] = useState<PaidOrderRow[]>([]);
  const [expenses, setExpenses] = useState<OperationalExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingExpense, setSavingExpense] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [expCategory, setExpCategory] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [expNote, setExpNote] = useState('');

  const [partnerPercent, setPartnerPercent] = useState(0);
  const [savingPartner, setSavingPartner] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let start = startOfDay(parseISO(rangeStart));
      let end = endOfDay(parseISO(rangeEnd));
      if (isAfter(start, end)) {
        const t = start;
        start = startOfDay(end);
        end = endOfDay(t);
      }

      const token = await getAccessTokenForApi();
      const base = getApiBaseUrl();
      const fromIso = encodeURIComponent(start.toISOString());
      const toIso = encodeURIComponent(end.toISOString());
      const expFrom = format(start, 'yyyy-MM-dd');
      const expTo = format(end, 'yyyy-MM-dd');

      let paidOrders: PaidOrderRow[] = [];
      let expenseRows: OperationalExpense[] = [];

      if (token && base) {
        const [oRes, eRes] = await Promise.all([
          fetch(
            `${base}/api/admin/orders/query?payment_status=paid&from=${fromIso}&to=${toIso}&limit=${ADMIN_ORDERS_QUERY_LIMIT}`,
            { headers: { Authorization: `Bearer ${token}` } },
          ).then(async (r) => {
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j.error || `Orders ${r.status}`);
            const rows = (j.orders || []) as Array<{ id: string; total_amount: number; created_at: string }>;
            return rows.map((o) => ({ id: o.id, total_amount: o.total_amount, created_at: o.created_at }));
          }),
          fetch(
            `${base}/api/admin/finance/operational-expenses?from=${encodeURIComponent(expFrom)}&to=${encodeURIComponent(expTo)}`,
            { headers: { Authorization: `Bearer ${token}` } },
          ).then(async (r) => {
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j.error || `Expenses ${r.status}`);
            return (j.expenses || []) as OperationalExpense[];
          }),
        ]);
        paidOrders = oRes;
        expenseRows = eRes;
      } else {
        const [oRes, eRes] = await Promise.all([
          supabase
            .from('orders')
            .select('id, total_amount, created_at')
            .eq('payment_status', 'paid')
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString())
            .order('created_at', { ascending: false })
            .limit(ADMIN_ORDERS_QUERY_LIMIT),
          supabase
            .from('operational_expenses')
            .select('*')
            .gte('expense_date', expFrom)
            .lte('expense_date', expTo)
            .order('expense_date', { ascending: false }),
        ]);
        if (oRes.error) throw oRes.error;
        if (eRes.error) throw eRes.error;
        paidOrders = (oRes.data as PaidOrderRow[]) || [];
        expenseRows = (eRes.data as OperationalExpense[]) || [];
      }

      const sRes = await supabase.from('system_settings').select('value').eq('key', 'partner_profit_share').maybeSingle();

      setOrders(paidOrders);
      setExpenses(expenseRows);

      let pct = 0;
      if (sRes.error) {
        console.warn('partner_profit_share:', sRes.error);
      }
      const raw = sRes.data?.value;
      if (raw && typeof raw === 'object' && raw !== null && 'percent' in raw) {
        const n = Number((raw as { percent: unknown }).percent);
        if (Number.isFinite(n)) pct = n;
      }
      setPartnerPercent(Math.min(100, Math.max(0, pct)));
    } catch (e) {
      console.error('AdminFinance load:', e);
      toast.error(e instanceof Error ? e.message : 'Failed to load finance data');
    } finally {
      setLoading(false);
    }
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const gross = useMemo(
    () => orders.reduce((s, o) => s + Number(o.total_amount || 0), 0),
    [orders],
  );
  const totalExpenses = useMemo(
    () => expenses.reduce((s, e) => s + Number(e.amount || 0), 0),
    [expenses],
  );
  const net = gross - totalExpenses;
  const orderCount = orders.length;

  const partnerPctClamped = Math.min(100, Math.max(0, partnerPercent));
  const partnerShareAmount = net > 0 ? net * (partnerPctClamped / 100) : 0;
  const yourShareAfterPartner = net - partnerShareAmount;

  const handleSavePartnerPercent = async () => {
    const p = Math.min(100, Math.max(0, partnerPercent));
    setSavingPartner(true);
    try {
      const { error } = await supabase
        .from('system_settings')
        .update({
          value: { percent: p },
          updated_at: new Date().toISOString(),
        })
        .eq('key', 'partner_profit_share');
      if (error) throw error;
      setPartnerPercent(p);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save partner share');
    } finally {
      setSavingPartner(false);
    }
  };

  const dailyRows = useMemo(() => {
    let start = startOfDay(parseISO(rangeStart));
    let end = endOfDay(parseISO(rangeEnd));
    if (isAfter(start, end)) {
      const t = start;
      start = startOfDay(end);
      end = endOfDay(t);
    }
    const days = eachDayOfInterval({ start, end });
    const map: Record<string, { count: number; revenue: number }> = {};
    for (const d of days) {
      map[format(d, 'yyyy-MM-dd')] = { count: 0, revenue: 0 };
    }
    for (const o of orders) {
      const key = format(parseISO(o.created_at), 'yyyy-MM-dd');
      if (!map[key]) map[key] = { count: 0, revenue: 0 };
      map[key].count += 1;
      map[key].revenue += Number(o.total_amount || 0);
    }
    return days.map((d) => {
      const key = format(d, 'yyyy-MM-dd');
      const row = map[key] || { count: 0, revenue: 0 };
      return { date: d, key, ...row };
    });
  }, [orders, rangeStart, rangeEnd]);

  const applyPreset = (preset: 'today' | 'yesterday' | 'last7' | 'thisMonth') => {
    const now = new Date();
    if (preset === 'today') {
      setRangeStart(format(startOfDay(now), 'yyyy-MM-dd'));
      setRangeEnd(format(endOfDay(now), 'yyyy-MM-dd'));
    } else if (preset === 'yesterday') {
      const y = subDays(now, 1);
      setRangeStart(format(startOfDay(y), 'yyyy-MM-dd'));
      setRangeEnd(format(endOfDay(y), 'yyyy-MM-dd'));
    } else if (preset === 'last7') {
      setRangeStart(format(startOfDay(subDays(now, 6)), 'yyyy-MM-dd'));
      setRangeEnd(format(endOfDay(now), 'yyyy-MM-dd'));
    } else {
      setRangeStart(format(startOfMonth(now), 'yyyy-MM-dd'));
      setRangeEnd(format(endOfMonth(now), 'yyyy-MM-dd'));
    }
  };

  const handleAddExpense = async () => {
    const cat = expCategory.trim();
    const amt = parseFloat(expAmount);
    if (!cat) {
      toast.warning('Enter a category (e.g. server, ads, tools).');
      return;
    }
    if (!Number.isFinite(amt) || amt < 0) {
      toast.warning('Enter a valid amount.');
      return;
    }
    setSavingExpense(true);
    try {
      const { data, error } = await supabase
        .from('operational_expenses')
        .insert({
          category: cat,
          amount: amt,
          expense_date: expDate,
          note: expNote.trim() || null,
        })
        .select('*')
        .single();
      if (error) throw error;
      const row = data as OperationalExpense;
      if (row.expense_date >= rangeStart && row.expense_date <= rangeEnd) {
        setExpenses((prev) => [row, ...prev]);
      }
      setExpCategory('');
      setExpAmount('');
      setExpNote('');
      setExpDate(format(new Date(), 'yyyy-MM-dd'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save expense');
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    const ok = await confirm({
      title: 'Delete this expense?',
      description: 'This row will be removed from operational expenses.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    setDeletingId(id);
    try {
      const { error } = await supabase.from('operational_expenses').delete().eq('id', id);
      if (error) throw error;
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const rangeToolbar = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['today', 'Today'],
            ['yesterday', 'Yesterday'],
            ['last7', 'Last 7 days'],
            ['thisMonth', 'This month'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => applyPreset(k)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-gray-700 dark:text-gray-200 hover:border-indigo-300 dark:hover:border-indigo-500/40 transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
          From
          <input
            type="date"
            value={rangeStart}
            onChange={(e) => setRangeStart(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm text-gray-900 dark:text-gray-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
          To
          <input
            type="date"
            value={rangeEnd}
            onChange={(e) => setRangeEnd(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm text-gray-900 dark:text-gray-100"
          />
        </label>
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarRange className="w-4 h-4" />}
          Refresh
        </button>
      </div>
    </div>
  );

  const kpiCards = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 shadow-sm relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-blue-500/10 blur-2xl" />
          <div className="relative flex justify-between items-start gap-2">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Paid orders</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1 tabular-nums">{orderCount}</p>
              <p className="text-[11px] text-gray-500 mt-1">In selected date range</p>
            </div>
            <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
              <ShoppingCart className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 shadow-sm relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-emerald-500/10 blur-2xl" />
          <div className="relative flex justify-between items-start gap-2">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Gross revenue</p>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1 tabular-nums">
                {money(gross)}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">Paid &amp; completed orders</p>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 shadow-sm relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-orange-500/10 blur-2xl" />
          <div className="relative flex justify-between items-start gap-2">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Operational expenses</p>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1 tabular-nums">
                {money(totalExpenses)}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">Manual entries below</p>
            </div>
            <div className="p-2.5 rounded-xl bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-indigo-200/60 dark:border-indigo-500/30 bg-gradient-to-br from-indigo-50/90 to-violet-50/50 dark:from-indigo-950/40 dark:to-violet-950/20 p-5 shadow-sm relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-indigo-500/15 blur-2xl" />
          <div className="relative flex justify-between items-start gap-2">
            <div>
              <p className="text-xs font-bold text-indigo-800/80 dark:text-indigo-200 uppercase tracking-wide">Net profit</p>
              <p
                className={`text-2xl sm:text-3xl font-bold mt-1 tabular-nums ${
                  net >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {money(net)}
              </p>
              <p className="text-[11px] text-indigo-900/70 dark:text-indigo-200/80 mt-1">Gross − expenses</p>
            </div>
            <div className="p-2.5 rounded-xl bg-indigo-200/50 dark:bg-indigo-500/30 text-indigo-800 dark:text-indigo-200">
              <Scale className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-fuchsia-200/60 dark:border-fuchsia-500/25 bg-gradient-to-br from-fuchsia-50/80 to-pink-50/40 dark:from-fuchsia-950/30 dark:to-pink-950/15 p-5 shadow-sm relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-fuchsia-500/10 blur-2xl" />
          <div className="relative flex justify-between items-start gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold text-fuchsia-900/80 dark:text-fuchsia-200 uppercase tracking-wide">
                Partner share
              </p>
              <p className="text-2xl sm:text-3xl font-bold text-fuchsia-900 dark:text-fuchsia-100 mt-1 tabular-nums">
                {money(partnerShareAmount)}
              </p>
              <p className="text-[11px] text-fuchsia-900/70 dark:text-fuchsia-200/80 mt-1">
                {partnerPctClamped}% of net profit
                {net <= 0 ? ' (share applies only when net profit is positive)' : ''}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-fuchsia-200/60 dark:bg-fuchsia-500/25 text-fuchsia-800 dark:text-fuchsia-200 shrink-0">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-teal-200/60 dark:border-teal-500/25 bg-gradient-to-br from-teal-50/90 to-cyan-50/50 dark:from-teal-950/35 dark:to-cyan-950/20 p-5 shadow-sm relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-teal-500/10 blur-2xl" />
          <div className="relative flex justify-between items-start gap-2">
            <div>
              <p className="text-xs font-bold text-teal-900/80 dark:text-teal-200 uppercase tracking-wide">Your share</p>
              <p
                className={`text-2xl sm:text-3xl font-bold mt-1 tabular-nums ${
                  yourShareAfterPartner >= 0 ? 'text-teal-800 dark:text-teal-200' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {money(yourShareAfterPartner)}
              </p>
              <p className="text-[11px] text-teal-900/70 dark:text-teal-200/80 mt-1">Net profit − partner share</p>
            </div>
            <div className="p-2.5 rounded-xl bg-teal-200/50 dark:bg-teal-500/30 text-teal-900 dark:text-teal-200">
              <Scale className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const partnerShareSettings = (
    <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-4 md:p-5 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-end gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Partner share</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Set what fraction of <span className="font-medium text-gray-700 dark:text-gray-300">net profit</span> (after
            operational expenses) goes to the partner for this date range view. Saved for all future ranges.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
            Percent
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={Number.isFinite(partnerPercent) ? partnerPercent : 0}
              onChange={(e) => setPartnerPercent(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
              className="w-28 px-3 py-2 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm font-semibold tabular-nums"
            />
          </label>
          <span className="pb-2 text-sm text-gray-500 dark:text-gray-400">% of net profit</span>
          <button
            type="button"
            onClick={() => void handleSavePartnerPercent()}
            disabled={savingPartner}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-fuchsia-600 text-white hover:bg-fuchsia-500 disabled:opacity-50"
          >
            {savingPartner ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save
          </button>
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 md:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Profit snapshot
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-xl">
              Pick a range, see sales and net profit after your operational costs. Full expense editor lives on the
              dedicated page.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin?tab=finance')}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500"
          >
            Open profit &amp; expenses
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {rangeToolbar}
        {loading && orders.length === 0 && expenses.length === 0 ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        ) : (
          kpiCards
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shrink-0">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Profit &amp; expenses</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
                Sales and revenue are taken automatically from paid orders. Add operational costs (hosting, ads, tools,
                etc.) — net profit is gross revenue minus those expenses. Partner share is a percentage of that net
                profit.
              </p>
            </div>
          </div>
        </div>
        <div className="relative mt-6">{rangeToolbar}</div>
      </div>

      {partnerShareSettings}

      {loading && orders.length === 0 && expenses.length === 0 ? (
        <div className="flex justify-center py-20 rounded-2xl border border-dashed border-gray-200 dark:border-[#303038]">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
        </div>
      ) : (
        <>
          {kpiCards}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 md:p-6 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">Sales by day</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Order count and revenue per calendar day in your range.
              </p>
              <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-[#26262d] max-h-[min(60vh,420px)] overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-gray-50/95 dark:bg-white/5 backdrop-blur border-b border-gray-100 dark:border-[#26262d]">
                    <tr>
                      <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase">Date</th>
                      <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase text-right">Orders</th>
                      <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyRows.map((r) => (
                      <tr
                        key={r.key}
                        className="border-b border-gray-50 dark:border-white/[0.03] hover:bg-gray-50/50 dark:hover:bg-white/[0.02]"
                      >
                        <td className="py-2 px-3 text-gray-800 dark:text-gray-200 whitespace-nowrap">
                          {format(r.date, 'EEE, MMM d, yyyy')}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">
                          {r.count}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-gray-800 dark:text-gray-200">
                          {money(r.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 md:p-6 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">Add operational expense</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Describe the cost type yourself (e.g. &quot;VPS&quot;, &quot;Meta ads&quot;, &quot;Domain&quot;). Amounts subtract from gross
                revenue for net profit in this range.
              </p>
              <div className="space-y-3">
                <input
                  type="text"
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value)}
                  placeholder="Category / type"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    placeholder="Amount (৳)"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm"
                  />
                  <input
                    type="date"
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm"
                  />
                </div>
                <input
                  type="text"
                  value={expNote}
                  onChange={(e) => setExpNote(e.target.value)}
                  placeholder="Note (optional)"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm"
                />
                <button
                  type="button"
                  onClick={() => void handleAddExpense()}
                  disabled={savingExpense}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  {savingExpense ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add expense
                </button>
              </div>

              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mt-8 mb-3">Expenses in range</h4>
              {expenses.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center border border-dashed border-gray-200 dark:border-[#303038] rounded-xl">
                  No expenses recorded for this range.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-[#26262d] max-h-[min(40vh,320px)] overflow-y-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-gray-50/95 dark:bg-white/5 border-b border-gray-100 dark:border-[#26262d]">
                      <tr>
                        <th className="py-2 px-3 text-[10px] font-bold text-gray-500 uppercase">Date</th>
                        <th className="py-2 px-3 text-[10px] font-bold text-gray-500 uppercase">Category</th>
                        <th className="py-2 px-3 text-[10px] font-bold text-gray-500 uppercase text-right">Amount</th>
                        <th className="py-2 px-3 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map((ex) => (
                        <tr key={ex.id} className="border-b border-gray-50 dark:border-white/[0.03]">
                          <td className="py-2 px-3 whitespace-nowrap text-gray-700 dark:text-gray-300">
                            {format(parseISO(ex.expense_date + 'T12:00:00'), 'MMM d, yyyy')}
                          </td>
                          <td className="py-2 px-3">
                            <span className="font-medium text-gray-900 dark:text-gray-100">{ex.category}</span>
                            {ex.note ? (
                              <span className="block text-[11px] text-gray-500 truncate max-w-[180px]" title={ex.note}>
                                {ex.note}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-gray-900 dark:text-gray-100">
                            {money(Number(ex.amount))}
                          </td>
                          <td className="py-2 px-2 text-right">
                            <button
                              type="button"
                              onClick={() => void handleDeleteExpense(ex.id)}
                              disabled={deletingId === ex.id}
                              className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50"
                              title="Delete"
                            >
                              {deletingId === ex.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
