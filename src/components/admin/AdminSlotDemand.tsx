import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  Mail,
  RefreshCw,
  Sparkles,
  Users2,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';

interface ForecastOrderRow {
  id: string;
  created_at: string;
  user_id: string;
  status: string;
  payment_status: string;
  users?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
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
  estGap: number;
  byProduct: Array<{ title: string; claims: number; estMailboxes: number }>;
}

interface UserEmailRow {
  id: string;
  order_id: string;
  created_at: string;
  emails_pool?: {
    email?: string | null;
  } | null;
}

interface DemandDetailRow {
  dateKey: string;
  orderId: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  productTitle: string;
  slotIndex: number;
  slotLimit: number;
  unlockAtIso: string;
  previousAssignedEmail: string;
  currentAssignedEmail: string;
  currentAssignedAt: string;
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const AdminSlotDemand = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SlotDemandDay[]>([]);
  const [detailRows, setDetailRows] = useState<DemandDetailRow[]>([]);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [availableInventoryMailboxes, setAvailableInventoryMailboxes] = useState(0);
  const [todayClaims, setTodayClaims] = useState(0);
  const [next7Claims, setNext7Claims] = useState(0);
  const [next30Claims, setNext30Claims] = useState(0);
  const [todayMailboxes, setTodayMailboxes] = useState(0);
  const [next7Mailboxes, setNext7Mailboxes] = useState(0);
  const [next30Mailboxes, setNext30Mailboxes] = useState(0);

  const fetchForecast = async () => {
    setLoading(true);
    try {
      const [{ data: ordersData, error: ordersError }, { data: inventoryData, error: inventoryError }] = await Promise.all([
        supabase
          .from('orders')
          .select(
            `
            id,
            created_at,
            user_id,
            status,
            payment_status,
            users:user_id (name, email, phone),
            products:product_id (title, is_personal, email_slots, email_slot_interval_days, max_users_per_email)
          `,
          )
          .in('status', ['paid', 'completed'])
          .eq('payment_status', 'paid')
          .order('created_at', { ascending: false })
          .limit(5000),
        supabase.from('emails_pool').select('id').eq('status', 'available'),
      ]);

      if (ordersError) throw ordersError;
      if (inventoryError) throw inventoryError;

      const availableMailboxes = (inventoryData || []).length;
      setAvailableInventoryMailboxes(availableMailboxes);

      const orderRows = ((ordersData || []) as ForecastOrderRow[]).filter((row) => !row.products?.is_personal);
      const orderIds = orderRows.map((o) => o.id);
      const generatedMap: Record<string, number> = {};
      const userEmailsByOrder: Record<string, UserEmailRow[]> = {};

      if (orderIds.length > 0) {
        const { data: userEmails, error: ueError } = await supabase
          .from('user_emails')
          .select(
            `
            id,
            order_id,
            created_at,
            emails_pool:email_id (email)
          `,
          )
          .in('order_id', orderIds)
          .order('created_at', { ascending: true });
        if (ueError) throw ueError;
        for (const ue of (userEmails || []) as UserEmailRow[]) {
          if (!ue.order_id) continue;
          generatedMap[ue.order_id] = (generatedMap[ue.order_id] || 0) + 1;
          if (!userEmailsByOrder[ue.order_id]) userEmailsByOrder[ue.order_id] = [];
          userEmailsByOrder[ue.order_id].push(ue);
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
          estMailboxesRaw: number;
          byProduct: Record<string, { claims: number; estMailboxesRaw: number }>;
        }
      > = {};
      const demandDetails: DemandDetailRow[] = [];

      const addClaim = (
        when: Date,
        productTitle: string,
        maxUsersPerEmail: number,
        detail: Omit<DemandDetailRow, 'dateKey'>,
      ) => {
        const bucketDate = when < today ? today : when;
        if (bucketDate > horizonEnd) return;
        const bucket = new Date(bucketDate.getFullYear(), bucketDate.getMonth(), bucketDate.getDate());
        const dateKey = toDateKey(bucket);
        if (!bucketMap[dateKey]) {
          bucketMap[dateKey] = { totalClaims: 0, estMailboxesRaw: 0, byProduct: {} };
        }
        const day = bucketMap[dateKey];
        day.totalClaims += 1;
        day.estMailboxesRaw += 1 / Math.max(1, maxUsersPerEmail);
        if (!day.byProduct[productTitle]) {
          day.byProduct[productTitle] = { claims: 0, estMailboxesRaw: 0 };
        }
        day.byProduct[productTitle].claims += 1;
        day.byProduct[productTitle].estMailboxesRaw += 1 / Math.max(1, maxUsersPerEmail);
        demandDetails.push({
          ...detail,
          dateKey,
        });
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
        const assignedHistory = userEmailsByOrder[order.id] || [];
        const lastAssigned = assignedHistory.length > 0 ? assignedHistory[assignedHistory.length - 1] : null;
        const previousAssigned = assignedHistory.length > 1 ? assignedHistory[assignedHistory.length - 2] : null;

        for (let slotIndex = generated + 1; slotIndex <= slotLimit; slotIndex += 1) {
          const unlockAt = new Date(createdAt.getTime() + Math.max(0, slotIndex - 1) * intervalDays * dayMs);
          addClaim(unlockAt, productTitle, maxUsersPerEmail, {
            orderId: order.id,
            userId: order.user_id,
            userName: String(order.users?.name || 'Unknown user'),
            userEmail: String(order.users?.email || ''),
            userPhone: String(order.users?.phone || ''),
            productTitle,
            slotIndex,
            slotLimit,
            unlockAtIso: unlockAt.toISOString(),
            previousAssignedEmail: String(previousAssigned?.emails_pool?.email || '—'),
            currentAssignedEmail: String(lastAssigned?.emails_pool?.email || 'Not assigned yet'),
            currentAssignedAt: String(lastAssigned?.created_at || ''),
          });
        }
      }

      const dateKeys = Object.keys(bucketMap).sort();
      const builtRows: SlotDemandDay[] = dateKeys.map((dateKey) => {
        const date = new Date(`${dateKey}T00:00:00`);
        const estMailboxes = Math.ceil(bucketMap[dateKey].estMailboxesRaw);
        const topProducts = Object.entries(bucketMap[dateKey].byProduct)
          .map(([title, val]) => ({
            title,
            claims: val.claims,
            estMailboxes: Math.ceil(val.estMailboxesRaw),
          }))
          .sort((a, b) => b.claims - a.claims)
          .slice(0, 3);
        return {
          dateKey,
          label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          totalClaims: bucketMap[dateKey].totalClaims,
          estMailboxes,
          estGap: Math.max(0, estMailboxes - availableMailboxes),
          byProduct: topProducts,
        };
      });

      const todayKey = toDateKey(today);
      const next7End = toDateKey(new Date(today.getTime() + 6 * dayMs));
      const next30End = toDateKey(new Date(today.getTime() + 29 * dayMs));
      const inRangeRows = (start: string, end: string) => builtRows.filter((r) => r.dateKey >= start && r.dateKey <= end);
      const sumClaims = (arr: SlotDemandDay[]) => arr.reduce((sum, r) => sum + r.totalClaims, 0);
      const sumMailboxes = (arr: SlotDemandDay[]) => arr.reduce((sum, r) => sum + r.estMailboxes, 0);

      const todayRows = inRangeRows(todayKey, todayKey);
      const weekRows = inRangeRows(todayKey, next7End);
      const monthRows = inRangeRows(todayKey, next30End);

      setRows(builtRows);
      setDetailRows(demandDetails);
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
  const selectedDay = useMemo(() => rows.find((r) => r.dateKey === selectedDateKey) || null, [rows, selectedDateKey]);
  const selectedDetails = useMemo(
    () =>
      detailRows
        .filter((r) => r.dateKey === selectedDateKey)
        .sort((a, b) => a.unlockAtIso.localeCompare(b.unlockAtIso)),
    [detailRows, selectedDateKey],
  );

  const todayGap = Math.max(0, todayMailboxes - availableInventoryMailboxes);
  const next7Gap = Math.max(0, next7Mailboxes - availableInventoryMailboxes);
  const next30Gap = Math.max(0, next30Mailboxes - availableInventoryMailboxes);

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
                Visual forecast with inventory-aware gap and day-wise due user details.
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

      <div className="rounded-2xl border border-emerald-200/60 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10 p-4">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            Available inventory mailboxes: <span className="tabular-nums">{availableInventoryMailboxes}</span>
          </p>
        </div>
        <p className="text-xs text-emerald-800/90 dark:text-emerald-200/90 mt-1">
          Gap is calculated after adjusting against currently available inventory.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-amber-200/70 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/10 p-4">
          <p className="text-[11px] uppercase tracking-wide text-amber-700 dark:text-amber-300 font-semibold">Today</p>
          <p className="mt-1 text-2xl font-bold text-amber-900 dark:text-amber-100 tabular-nums">{todayClaims}</p>
          <p className="text-xs text-amber-800/90 dark:text-amber-200/90 mt-1">
            Recommended mailboxes: <span className="font-semibold tabular-nums">{todayMailboxes}</span>
          </p>
          <p className="text-xs mt-1">
            {todayGap > 0 ? (
              <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-300">
                <AlertTriangle className="w-3.5 h-3.5" />
                Need {todayGap} more mailbox{todayGap === 1 ? '' : 'es'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Inventory covered
              </span>
            )}
          </p>
        </div>

        <div className="rounded-2xl border border-indigo-200/70 dark:border-indigo-500/30 bg-indigo-50/60 dark:bg-indigo-500/10 p-4">
          <p className="text-[11px] uppercase tracking-wide text-indigo-700 dark:text-indigo-300 font-semibold">Next 7 Days</p>
          <p className="mt-1 text-2xl font-bold text-indigo-900 dark:text-indigo-100 tabular-nums">{next7Claims}</p>
          <p className="text-xs text-indigo-800/90 dark:text-indigo-200/90 mt-1">
            Recommended mailboxes: <span className="font-semibold tabular-nums">{next7Mailboxes}</span>
          </p>
          <p className="text-xs mt-1">
            {next7Gap > 0 ? (
              <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-300">
                <AlertTriangle className="w-3.5 h-3.5" />
                Need {next7Gap} more mailbox{next7Gap === 1 ? '' : 'es'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Inventory covered
              </span>
            )}
          </p>
        </div>

        <div className="rounded-2xl border border-violet-200/70 dark:border-violet-500/30 bg-violet-50/60 dark:bg-violet-500/10 p-4">
          <p className="text-[11px] uppercase tracking-wide text-violet-700 dark:text-violet-300 font-semibold">Next 30 Days</p>
          <p className="mt-1 text-2xl font-bold text-violet-900 dark:text-violet-100 tabular-nums">{next30Claims}</p>
          <p className="text-xs text-violet-800/90 dark:text-violet-200/90 mt-1">
            Recommended mailboxes: <span className="font-semibold tabular-nums">{next30Mailboxes}</span>
          </p>
          <p className="text-xs mt-1">
            {next30Gap > 0 ? (
              <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-300">
                <AlertTriangle className="w-3.5 h-3.5" />
                Need {next30Gap} more mailbox{next30Gap === 1 ? '' : 'es'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Inventory covered
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-4 md:p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Daily Demand Timeline</h3>
          {loading ? <Loader2 className="w-4 h-4 animate-spin text-indigo-500" /> : null}
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-[#26262d]">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/[0.03]">
                <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-center">Slot Claims</th>
                <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-center">Recommended</th>
                <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-center">Inventory Gap</th>
                <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Top Products</th>
                <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Details</th>
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
                  <td className="py-2.5 px-3 text-center">
                    {row.estGap > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-red-100 dark:bg-red-500/20 text-red-800 dark:text-red-200 px-2 py-0.5 text-xs font-bold tabular-nums">
                        <AlertTriangle className="w-3 h-3" />
                        {row.estGap}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 text-xs font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        Covered
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-xs text-gray-600 dark:text-gray-300">
                    {row.byProduct.length > 0
                      ? row.byProduct.map((p) => `${p.title} (${p.claims} claims / ${p.estMailboxes} mailboxes)`).join(' · ')
                      : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedDateKey(row.dateKey)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-[#34343b] text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5"
                    >
                      <Users2 className="w-3.5 h-3.5" />
                      View users
                    </button>
                  </td>
                </tr>
              ))}
              {upcomingRows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={6} className="py-8 px-3 text-center text-sm text-gray-500 dark:text-gray-400">
                    No upcoming slot unlock demand found in the next 30 days.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {selectedDateKey ? (
        <div className="fixed inset-0 z-[120] bg-black/45 backdrop-blur-[1px] flex items-start justify-center p-4 md:p-8">
          <div className="w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-2xl border border-gray-200 dark:border-[#2f2f37] bg-white dark:bg-[#121216] shadow-2xl">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-[#26262d]">
              <div>
                <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                  Due Users {selectedDay ? `- ${selectedDay.label}` : ''}
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Users expected to generate a new email on this date, including previous assigned email info.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDateKey(null)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 dark:border-[#34343b] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 overflow-auto max-h-[calc(90vh-72px)]">
              <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-[#26262d]">
                <table className="w-full min-w-[1000px] text-left">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/[0.03]">
                      <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">User</th>
                      <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Product</th>
                      <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-center">Slot</th>
                      <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Unlock time</th>
                      <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Previous email</th>
                      <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Current active email</th>
                      <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Current assigned at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDetails.map((row) => (
                      <tr key={`${row.orderId}-${row.slotIndex}`} className="border-b border-gray-100 dark:border-[#26262d] last:border-b-0">
                        <td className="py-3 px-3">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{row.userName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{row.userEmail || row.userId}</p>
                          {row.userPhone ? <p className="text-xs text-gray-500 dark:text-gray-400">{row.userPhone}</p> : null}
                        </td>
                        <td className="py-3 px-3 text-sm text-gray-700 dark:text-gray-200">
                          {row.productTitle}
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Order: {row.orderId.slice(0, 8)}</p>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="inline-flex items-center rounded-md bg-indigo-100 dark:bg-indigo-500/20 px-2 py-0.5 text-xs font-semibold text-indigo-800 dark:text-indigo-200 tabular-nums">
                            {row.slotIndex}/{row.slotLimit}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-xs text-gray-700 dark:text-gray-200">
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                            {new Date(row.unlockAtIso).toLocaleString()}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-xs text-gray-700 dark:text-gray-200">
                          <span className="font-mono">{row.previousAssignedEmail}</span>
                        </td>
                        <td className="py-3 px-3 text-xs text-gray-700 dark:text-gray-200">
                          <span className="font-mono">{row.currentAssignedEmail}</span>
                        </td>
                        <td className="py-3 px-3 text-xs text-gray-700 dark:text-gray-200">
                          {row.currentAssignedAt ? new Date(row.currentAssignedAt).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                    {selectedDetails.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 px-3 text-center text-sm text-gray-500 dark:text-gray-400">
                          No due users found for this date.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
