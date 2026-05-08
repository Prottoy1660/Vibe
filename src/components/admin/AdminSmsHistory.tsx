import React, { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, RefreshCw, Save, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getJsonWithFallback, postJsonWithFallback } from '../../lib/apiClient';

type SmsLogRow = {
  id: string;
  batch_id: string;
  recipient_phone: string;
  message: string;
  sender_id: string | null;
  schedule_at: string | null;
  provider_request_id: string | null;
  provider_error_code: number | null;
  provider_message: string | null;
  recipient_mode: 'selected_users' | 'all_users' | 'custom_numbers' | 'unknown';
  created_at: string;
  admins?: { name: string | null; email: string | null }[] | null;
};

export const AdminSmsHistory: React.FC = () => {
  const [rows, setRows] = useState<SmsLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [costPerSms, setCostPerSms] = useState('0.40');
  const [currency, setCurrency] = useState('BDT');
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingMsg, setPricingMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = async (showLoader: boolean) => {
    if (showLoader) setLoading(true);
    else setRefreshing(true);
    try {
      const { data, error } = await supabase
        .from('sms_send_logs')
        .select(
          'id, batch_id, recipient_phone, message, sender_id, schedule_at, provider_request_id, provider_error_code, provider_message, recipient_mode, created_at, admins:admin_id(name, email)',
        )
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      setRows((data || []) as SmsLogRow[]);
    } catch (e) {
      console.error('sms history load failed', e);
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load(true);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const out = await getJsonWithFallback<{ settings?: { cost_per_sms?: number; currency?: string } }>(
          '/api/admin/ops/sms-pricing',
          { skipErrorPageRedirect: true },
        );
        const cost = Number(out?.settings?.cost_per_sms ?? 0.4);
        setCostPerSms(String(cost));
        setCurrency((out?.settings?.currency || 'BDT').toUpperCase());
      } catch (e) {
        console.error('sms pricing load failed', e);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const admin = Array.isArray(r.admins) ? r.admins[0] : null;
      const adminName = (admin?.name || '').toLowerCase();
      const adminEmail = (admin?.email || '').toLowerCase();
      return (
        r.recipient_phone.toLowerCase().includes(q) ||
        r.message.toLowerCase().includes(q) ||
        (r.provider_request_id || '').toLowerCase().includes(q) ||
        (r.provider_message || '').toLowerCase().includes(q) ||
        adminName.includes(q) ||
        adminEmail.includes(q)
      );
    });
  }, [rows, search]);

  const numericCost = useMemo(() => {
    const n = Number(costPerSms);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  }, [costPerSms]);

  const successCount = useMemo(() => filtered.filter((r) => (r.provider_error_code ?? 0) === 0).length, [filtered]);
  const failedCount = useMemo(() => filtered.filter((r) => (r.provider_error_code ?? 0) !== 0).length, [filtered]);
  const totalCost = useMemo(() => Number((successCount * numericCost).toFixed(2)), [successCount, numericCost]);

  const savePricing = async () => {
    setPricingMsg(null);
    const n = Number(costPerSms);
    if (!Number.isFinite(n) || n < 0) {
      setPricingMsg({ type: 'err', text: 'Enter a valid cost per SMS.' });
      return;
    }
    setSavingPricing(true);
    try {
      const out = await postJsonWithFallback<{ settings?: { cost_per_sms?: number; currency?: string } }>(
        '/api/admin/ops/sms-pricing',
        { cost_per_sms: n, currency: (currency || 'BDT').toUpperCase() },
        { skipErrorPageRedirect: true },
      );
      const cost = Number(out?.settings?.cost_per_sms ?? n);
      setCostPerSms(String(cost));
      setCurrency((out?.settings?.currency || currency || 'BDT').toUpperCase());
      setPricingMsg({ type: 'ok', text: 'Pricing saved.' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save pricing';
      setPricingMsg({ type: 'err', text: msg });
    } finally {
      setSavingPricing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
        <div className="relative flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">SMS history</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Check who received SMS, when it was sent, and what message was submitted.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load(false)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-[#151518] rounded-2xl border border-gray-100 dark:border-[#26262d] overflow-hidden shadow-sm dark:shadow-none">
        <div className="p-4 border-b border-gray-100 dark:border-[#26262d] bg-gray-50/50 dark:bg-white/[0.02]">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] p-3">
              <p className="text-[11px] uppercase font-bold text-gray-500">Total SMS</p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{filtered.length}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/30 bg-emerald-50/60 dark:bg-emerald-950/20 p-3">
              <p className="text-[11px] uppercase font-bold text-emerald-700 dark:text-emerald-300">Success</p>
              <p className="text-xl font-bold text-emerald-800 dark:text-emerald-200">{successCount}</p>
            </div>
            <div className="rounded-xl border border-red-200 dark:border-red-900/30 bg-red-50/60 dark:bg-red-950/20 p-3">
              <p className="text-[11px] uppercase font-bold text-red-700 dark:text-red-300">Failed</p>
              <p className="text-xl font-bold text-red-800 dark:text-red-200">{failedCount}</p>
            </div>
            <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/30 bg-indigo-50/60 dark:bg-indigo-950/20 p-3">
              <p className="text-[11px] uppercase font-bold text-indigo-700 dark:text-indigo-300">Total Cost</p>
              <p className="text-xl font-bold text-indigo-800 dark:text-indigo-200">
                {currency} {totalCost.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col md:flex-row md:items-end gap-3">
            <div>
              <label className="block text-[11px] uppercase font-bold text-gray-500 dark:text-gray-400">Cost per SMS</label>
              <input
                value={costPerSms}
                onChange={(e) => setCostPerSms(e.target.value)}
                className="mt-1 rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2 text-sm w-36"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase font-bold text-gray-500 dark:text-gray-400">Currency</label>
              <input
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                className="mt-1 rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2 text-sm w-28"
              />
            </div>
            <button
              type="button"
              onClick={() => void savePricing()}
              disabled={savingPricing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 h-fit"
            >
              {savingPricing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save pricing
            </button>
            {pricingMsg ? (
              <span className={pricingMsg.type === 'ok' ? 'text-xs text-emerald-600' : 'text-xs text-red-600'}>{pricingMsg.text}</span>
            ) : null}
          </div>
        </div>

        <div className="p-4 border-b border-gray-100 dark:border-[#26262d] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gray-50/50 dark:bg-white/[0.02]">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Showing {filtered.length} of {rows.length}
          </span>
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search phone, message, request id, admin…"
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center px-4">
            <p className="text-gray-600 dark:text-gray-300 font-medium">No SMS history found</p>
            <p className="text-xs text-gray-500 mt-1">Send SMS from SMS broadcast tab to start tracking history.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1180px] w-full">
              <thead className="bg-gray-50/80 dark:bg-white/[0.03]">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">When</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Phone</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Message</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Mode</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Provider</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Cost</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {filtered.map((r) => {
                  const admin = Array.isArray(r.admins) ? r.admins[0] : null;
                  return (
                  <tr key={r.id} className="hover:bg-gray-50/80 dark:hover:bg-white/[0.03]">
                    <td className="px-4 py-3 align-top text-xs text-gray-600 dark:text-gray-300">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 font-mono">{r.recipient_phone}</p>
                      {r.sender_id ? (
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">Sender: {r.sender_id}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="text-xs text-gray-700 dark:text-gray-200 max-w-[520px] line-clamp-3">{r.message}</p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-bold bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200">
                        {r.recipient_mode}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {(r.provider_error_code ?? 0) === 0 ? (
                        <span className="inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">
                          Sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200">
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-[11px] text-gray-600 dark:text-gray-300">
                      <p>Req: {r.provider_request_id || '-'}</p>
                      <p>Code: {r.provider_error_code ?? 0}</p>
                      <p className="max-w-[220px] truncate">{r.provider_message || '-'}</p>
                    </td>
                    <td className="px-4 py-3 align-top text-[11px] text-gray-700 dark:text-gray-200">
                      {currency} {((r.provider_error_code ?? 0) === 0 ? numericCost : 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 align-top text-[11px] text-gray-600 dark:text-gray-300">
                      <p className="font-semibold text-gray-800 dark:text-gray-100">{admin?.name || 'Admin'}</p>
                      <p>{admin?.email || '-'}</p>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
