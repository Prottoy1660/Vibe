import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, CalendarDays, Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';

interface ForecastOrderRow {
  id: string;
  created_at: string;
  status: string;
  payment_status: string;
  products?: {
    title?: string;
    is_personal?: boolean;
    email_slots?: number;
    email_slot_interval_days?: number;
    max_users_per_email?: number;
  } | null;
}

interface SlotDemandDay {
  dateKey: string;
  label: string;
  totalClaims: number;
  estMailboxes: number;
  byProduct: Array<{ title: string; claims: number; estMailboxes: number }>;
}

export const AdminSlotDemand = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SlotDemandDay[]>([]);
  const [todayClaims, setTodayClaims] = useState(0);
  const [next7Claims, setNext7Claims] = useState(0);
  const [next30Claims, setNext30Claims] = useState(0);
  const [todayMailboxes, setTodayMailboxes] = useState(0);
  const [next7Mailboxes, setNext7Mailboxes] = useState(0);
  const [next30Mailboxes, setNext30Mailboxes] = useState(0);

  const fetchForecast = async () => {
    setLoading(true);
    try {
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(
          `
          id,
          created_at,
          status,
          payment_status,
          products:product_id (title, is_personal, email_slots, email_slot_interval_days, max_users_per_email)
        `,
        )
        .in('status', ['paid', 'completed'])
        .eq('payment_status', 'paid')
        .order('created_at', { ascending: false })
        .limit(5000);
      if (ordersError) throw ordersError;

      const orderRows = ((ordersData || []) as ForecastOrderRow[]).filter((row) => !row.products?.is_personal);
      const orderIds = orderRows.map((o) => o.id);
      const generatedMap: Record<string, number> = {};
      if (orderIds.length > 0) {
        const { data: userEmails, error: ueError } = await supabase
          .from('user_emails')
          .select('order_id')
          .in('order_id', orderIds);
        if (ueError) throw ueError;
        for (const ue of (userEmails || []) as Array<{ order_id: string }>) {
          if (!ue.order_id) continue;
          generatedMap[ue.order_id] = (generatedMap[ue.order_id] || 0) + 1;
        }
      }

      const dayMs = 24 * 60 * 60 * 1000;
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const horizonEnd = new Date(today.getTime() + 30 * dayMs);

      const bucketMap: Record<
        string,
        {
          totalClaims: number;
          estMailboxes: number;
          byProduct: Record<string, { claims: number; estMailboxes: number }>;
        }
      > = {};

      const addClaim = (when: Date, productTitle: string, maxUsersPerEmail: number) => {
        const bucketDate = when < today ? today : when;
        if (bucketDate > horizonEnd) return;
        const bucket = new Date(bucketDate.getFullYear(), bucketDate.getMonth(), bucketDate.getDate());
        const dateKey = bucket.toISOString().slice(0, 10);
        if (!bucketMap[dateKey]) {
          bucketMap[dateKey] = { totalClaims: 0, estMailboxes: 0, byProduct: {} };
        }
        const day = bucketMap[dateKey];
        day.totalClaims += 1;
        day.estMailboxes += 1 / Math.max(1, maxUsersPerEmail);
        if (!day.byProduct[productTitle]) {
          day.byProduct[productTitle] = { claims: 0, estMailboxes: 0 };
        }
        day.byProduct[productTitle].claims += 1;
        day.byProduct[productTitle].estMailboxes += 1 / Math.max(1, maxUsersPerEmail);
      };

      for (const order of orderRows) {
        const slotLimit = Math.max(1, Number(order.products?.email_slots ?? 3));
        const intervalDays = Math.max(0, Number(order.products?.email_slot_interval_days ?? 0));
        const maxUsersPerEmail = Math.max(1, Number(order.products?.max_users_per_email ?? 1));
        const generated = Math.max(0, Number(generatedMap[order.id] || 0));
        if (generated >= slotLimit) continue;

        const createdAt = new Date(order.created_at);
        if (Number.isNaN(createdAt.getTime())) continue;
        const productTitle = String(order.products?.title || 'Unknown product');

        for (let slotIndex = generated + 1; slotIndex <= slotLimit; slotIndex += 1) {
          const unlockAt = new Date(createdAt.getTime() + Math.max(0, slotIndex - 1) * intervalDays * dayMs);
          addClaim(unlockAt, productTitle, maxUsersPerEmail);
        }
      }

      const dateKeys = Object.keys(bucketMap).sort();
      const builtRows: SlotDemandDay[] = dateKeys.map((dateKey) => {
        const date = new Date(`${dateKey}T00:00:00`);
        const topProducts = Object.entries(bucketMap[dateKey].byProduct)
          .map(([title, val]) => ({
            title,
            claims: val.claims,
            estMailboxes: Math.ceil(val.estMailboxes),
          }))
          .sort((a, b) => b.claims - a.claims)
          .slice(0, 3);
        return {
          dateKey,
          label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          totalClaims: bucketMap[dateKey].totalClaims,
          estMailboxes: Math.ceil(bucketMap[dateKey].estMailboxes),
          byProduct: topProducts,
        };
      });

      const todayKey = today.toISOString().slice(0, 10);
      const next7End = new Date(today.getTime() + 6 * dayMs).toISOString().slice(0, 10);
      const next30End = new Date(today.getTime() + 29 * dayMs).toISOString().slice(0, 10);
      const inRangeRows = (start: string, end: string) =>
        builtRows.filter((r) => r.dateKey >= start && r.dateKey <= end);
      const sumClaims = (arr: SlotDemandDay[]) => arr.reduce((sum, r) => sum + r.totalClaims, 0);
      const sumMailboxes = (arr: SlotDemandDay[]) => arr.reduce((sum, r) => sum + r.estMailboxes, 0);

      const todayRows = inRangeRows(todayKey, todayKey);
      const weekRows = inRangeRows(todayKey, next7End);
      const monthRows = inRangeRows(todayKey, next30End);

      setRows(builtRows);
      setTodayClaims(sumClaims(todayRows));
      setNext7Claims(sumClaims(weekRows));
      setNext30Claims(sumClaims(monthRows));
      setTodayMailboxes(sumMailboxes(todayRows));
      setNext7Mailboxes(sumMailboxes(weekRows));
      setNext30Mailboxes(sumMailboxes(monthRows));
    } catch (error) {
      console.error('Failed to load slot demand forecast', error);
      toast.error('Failed to load slot demand forecast');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchForecast();
  }, []);

  const upcomingRows = useMemo(() => rows.slice(0, 21), [rows]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shrink-0">
              <CalendarDays className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Slot Demand Planner</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Predicts future slot unlock demand from active paid orders, so you can preload email inventory before users click generate.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void fetchForecast()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-[#303038] text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-amber-200/70 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/10 p-4">
          <p className="text-[11px] uppercase tracking-wide text-amber-700 dark:text-amber-300 font-semibold">Today</p>
          <p className="mt-1 text-2xl font-bold text-amber-900 dark:text-amber-100 tabular-nums">{todayClaims}</p>
          <p className="text-xs text-amber-800/90 dark:text-amber-200/90 mt-1">
            Recommended new mailboxes: <span className="font-semibold tabular-nums">{todayMailboxes}</span>
          </p>
        </div>
        <div className="rounded-2xl border border-indigo-200/70 dark:border-indigo-500/30 bg-indigo-50/60 dark:bg-indigo-500/10 p-4">
          <p className="text-[11px] uppercase tracking-wide text-indigo-700 dark:text-indigo-300 font-semibold">Next 7 Days</p>
          <p className="mt-1 text-2xl font-bold text-indigo-900 dark:text-indigo-100 tabular-nums">{next7Claims}</p>
          <p className="text-xs text-indigo-800/90 dark:text-indigo-200/90 mt-1">
            Recommended new mailboxes: <span className="font-semibold tabular-nums">{next7Mailboxes}</span>
          </p>
        </div>
        <div className="rounded-2xl border border-violet-200/70 dark:border-violet-500/30 bg-violet-50/60 dark:bg-violet-500/10 p-4">
          <p className="text-[11px] uppercase tracking-wide text-violet-700 dark:text-violet-300 font-semibold">Next 30 Days</p>
          <p className="mt-1 text-2xl font-bold text-violet-900 dark:text-violet-100 tabular-nums">{next30Claims}</p>
          <p className="text-xs text-violet-800/90 dark:text-violet-200/90 mt-1">
            Recommended new mailboxes: <span className="font-semibold tabular-nums">{next30Mailboxes}</span>
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-4 md:p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Daily Demand Timeline</h3>
          {loading ? <Loader2 className="w-4 h-4 animate-spin text-indigo-500" /> : null}
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-[#26262d]">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/[0.03]">
                <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-center">Slot Claims</th>
                <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-center">Recommended Mailboxes</th>
                <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Top Products</th>
              </tr>
            </thead>
            <tbody>
              {upcomingRows.map((row) => (
                <tr key={row.dateKey} className="border-b border-gray-100 dark:border-[#26262d] last:border-b-0">
                  <td className="py-2.5 px-3 text-sm text-gray-800 dark:text-gray-200">{row.label}</td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="inline-flex items-center justify-center rounded-md bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-200 px-2 py-0.5 text-xs font-bold tabular-nums">
                      {row.totalClaims}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 text-xs font-bold tabular-nums">
                      <Mail className="w-3 h-3" />
                      {row.estMailboxes}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-xs text-gray-600 dark:text-gray-300">
                    {row.byProduct.length > 0
                      ? row.byProduct.map((p) => `${p.title} (${p.claims} claims / ${p.estMailboxes} mailboxes)`).join(' · ')
                      : '—'}
                  </td>
                </tr>
              ))}
              {upcomingRows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={4} className="py-8 px-3 text-center text-sm text-gray-500 dark:text-gray-400">
                    No upcoming slot unlock demand found in the next 30 days.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

