import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, Search, AlertTriangle, Shield, Wallet, Activity } from 'lucide-react';

async function adminGet(path: string) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(path, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || json?.message || 'Request failed');
  return json;
}

export const AdminOpsCenter = () => {
  const [userId, setUserId] = useState('');
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [risk, setRisk] = useState<any>(null);
  const [riskHours, setRiskHours] = useState(24);
  const [loadingRisk, setLoadingRisk] = useState(false);
  const [runningPolicies, setRunningPolicies] = useState(false);

  const loadSupportSummary = async () => {
    if (!userId.trim()) return;
    setLoadingSummary(true);
    try {
      const data = await adminGet(`/api/admin/ops/support-summary/${encodeURIComponent(userId.trim())}`);
      setSummary(data);
    } catch (e: any) {
      alert(e?.message || 'Failed to load support summary');
    } finally {
      setLoadingSummary(false);
    }
  };

  const loadRisk = async () => {
    setLoadingRisk(true);
    try {
      const data = await adminGet(`/api/admin/ops/risk-overview?hours=${riskHours}`);
      setRisk(data);
    } catch (e: any) {
      alert(e?.message || 'Failed to load risk overview');
    } finally {
      setLoadingRisk(false);
    }
  };

  const runPolicies = async () => {
    setRunningPolicies(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch('/api/admin/ops/run-policies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to run policies');
      alert(`Policies executed\nQueued reminders: ${json.reminders_queued}\nThrottle flags: ${json.throttle_flags_created}`);
      await loadRisk();
    } catch (e: any) {
      alert(e?.message || 'Failed to run policies');
    } finally {
      setRunningPolicies(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#151518] rounded-xl border border-gray-100 dark:border-[#26262d] p-5">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Support Copilot Panel</h3>
        <div className="flex gap-3 flex-col sm:flex-row">
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Enter user ID"
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-sm"
          />
          <button
            onClick={loadSupportSummary}
            disabled={loadingSummary || !userId.trim()}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-60 inline-flex items-center"
          >
            {loadingSummary ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
            Load Summary
          </button>
        </div>

        {summary && (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-gray-100 dark:border-[#26262d] p-3">
                <p className="text-xs text-gray-500">Orders</p>
                <p className="text-xl font-semibold">{summary.order_count || 0}</p>
              </div>
              <div className="rounded-lg border border-gray-100 dark:border-[#26262d] p-3">
                <p className="text-xs text-gray-500">Failed Payments</p>
                <p className="text-xl font-semibold text-red-600">{summary.failed_payments_last || 0}</p>
              </div>
              <div className="rounded-lg border border-gray-100 dark:border-[#26262d] p-3">
                <p className="text-xs text-gray-500">Wallet Balance</p>
                <p className="text-xl font-semibold">৳{Number(summary.wallet_balance || 0).toFixed(2)}</p>
              </div>
            </div>

            <div className="rounded-lg border border-gray-100 dark:border-[#26262d] p-3">
              <p className="text-sm font-semibold mb-2">Recent Timeline Events</p>
              <div className="space-y-2 max-h-56 overflow-auto">
                {(summary.timeline_events || []).slice(0, 12).map((e: any) => (
                  <div key={e.id} className="text-xs text-gray-600 dark:text-gray-300 border-b border-gray-100 dark:border-[#26262d] pb-2">
                    <span className="font-semibold">{e.event_type}</span> - {e.message || 'No message'}
                  </div>
                ))}
                {(!summary.timeline_events || summary.timeline_events.length === 0) && (
                  <p className="text-xs text-gray-500">No timeline events yet.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-[#151518] rounded-xl border border-gray-100 dark:border-[#26262d] p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Risk Dashboard</h3>
          <div className="flex items-center gap-2">
            <select
              value={riskHours}
              onChange={(e) => setRiskHours(Number(e.target.value))}
              className="px-2 py-1.5 text-sm rounded-md border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113]"
            >
              <option value={24}>24h</option>
              <option value={72}>72h</option>
              <option value={168}>7d</option>
            </select>
            <button onClick={loadRisk} disabled={loadingRisk} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm">
              {loadingRisk ? 'Loading...' : 'Refresh'}
            </button>
            <button
              onClick={runPolicies}
              disabled={runningPolicies}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-60"
            >
              {runningPolicies ? 'Running...' : 'Run Policies'}
            </button>
          </div>
        </div>

        {risk?.metrics ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <Metric icon={AlertTriangle} label="Payment Failures" value={risk.metrics.payment_failures} />
              <Metric icon={Activity} label="Retries" value={risk.metrics.retries} />
              <Metric icon={Shield} label="Redeem Abuse" value={risk.metrics.redeem_abuse_events} />
              <Metric icon={Wallet} label="Wallet Alerts" value={risk.metrics.suspicious_wallet_events} />
              <Metric icon={AlertTriangle} label="Pending Orders" value={risk.metrics.pending_orders} />
            </div>
            <div className="rounded-lg border border-gray-100 dark:border-[#26262d] p-3">
              <p className="text-sm font-semibold mb-2">Recent Risk Events</p>
              <div className="space-y-2 max-h-56 overflow-auto">
                {(risk.recent_risk_events || []).slice(0, 20).map((e: any, i: number) => (
                  <div key={`${e.id}-${i}`} className="text-xs border-b border-gray-100 dark:border-[#26262d] pb-2">
                    <span className="font-semibold">{e.risk_type}</span> ({e.severity}) - {e.message || 'No message'}
                  </div>
                ))}
                {(!risk.recent_risk_events || risk.recent_risk_events.length === 0) && (
                  <p className="text-xs text-gray-500">No risk events in selected window.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Click refresh to load risk metrics.</p>
        )}
      </div>
    </div>
  );
};

const Metric = ({ icon: Icon, label, value }: { icon: any; label: string; value: number }) => (
  <div className="rounded-lg border border-gray-100 dark:border-[#26262d] p-3">
    <div className="flex items-center gap-2 text-gray-500 text-xs">
      <Icon className="w-4 h-4" />
      {label}
    </div>
    <p className="text-xl font-semibold mt-1">{value || 0}</p>
  </div>
);

