import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Loader2,
  Search,
  AlertTriangle,
  Shield,
  Wallet,
  Activity,
  Sparkles,
  Headphones,
  Gauge,
  HeartPulse,
  RefreshCw,
  Play,
  Bell,
  Inbox,
  Info,
} from 'lucide-react';

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

type TabId = 'support' | 'risk' | 'health';

export const AdminOpsCenter = () => {
  const [activeTab, setActiveTab] = useState<TabId>('support');

  const [userId, setUserId] = useState('');
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [risk, setRisk] = useState<any>(null);
  const [riskHours, setRiskHours] = useState(24);
  const [loadingRisk, setLoadingRisk] = useState(false);
  const [runningPolicies, setRunningPolicies] = useState(false);
  const [runningReminders, setRunningReminders] = useState(false);
  const [processingQueue, setProcessingQueue] = useState(false);
  const [healthRows, setHealthRows] = useState<any[]>([]);
  const [loadingHealth, setLoadingHealth] = useState(false);

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
      alert(`Policies executed.\nQueued reminders: ${json.reminders_queued}\nThrottle flags: ${json.throttle_flags_created}`);
      await loadRisk();
    } catch (e: any) {
      alert(e?.message || 'Failed to run policies');
    } finally {
      setRunningPolicies(false);
    }
  };

  const runReminders = async () => {
    setRunningReminders(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch('/api/admin/ops/run-reminders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to run reminders');
      alert(`Reminder queue updated. New queued: ${json.queued}`);
    } catch (e: any) {
      alert(e?.message || 'Failed to run reminders');
    } finally {
      setRunningReminders(false);
    }
  };

  const loadHealth = async () => {
    setLoadingHealth(true);
    try {
      const data = await adminGet('/api/admin/ops/subscription-health?limit=150');
      setHealthRows(data.rows || []);
    } catch (e: any) {
      alert(e?.message || 'Failed to load subscription health');
    } finally {
      setLoadingHealth(false);
    }
  };

  const processQueue = async () => {
    setProcessingQueue(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch('/api/admin/ops/process-notification-queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ limit: 200 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to process queue');
      alert(`Queue processed.\nScanned: ${json.scanned}\nProcessed: ${json.processed}`);
    } catch (e: any) {
      alert(e?.message || 'Failed to process notification queue');
    } finally {
      setProcessingQueue(false);
    }
  };

  const tabs: { id: TabId; label: string; sub: string; icon: React.ElementType }[] = [
    { id: 'support', label: 'Support', sub: 'User lookup', icon: Headphones },
    { id: 'risk', label: 'Risk & automation', sub: 'Metrics & jobs', icon: Gauge },
    { id: 'health', label: 'Subscription health', sub: 'Scores & labels', icon: HeartPulse },
  ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Ops Center</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
                Support lookup, risk signals, and subscription health—organized in tabs so you can focus on one workflow at a time.
              </p>
            </div>
          </div>
        </div>

        <div className="relative mt-6 flex flex-wrap gap-2 p-1 rounded-xl bg-white/60 dark:bg-black/20 border border-gray-200/80 dark:border-[#303038]">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`flex-1 min-w-[160px] flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="text-left">
                  <span className="block">{t.label}</span>
                  <span className={`block text-[11px] font-normal ${isActive ? 'text-indigo-100' : 'text-gray-500'}`}>
                    {t.sub}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Support */}
      {activeTab === 'support' && (
        <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 md:p-6 shadow-sm dark:shadow-none">
          <div className="flex items-start gap-3 mb-5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 text-sm font-bold dark:bg-indigo-500/20 dark:text-indigo-300">
              1
            </span>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Support Copilot</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 max-w-xl">
                Paste a user UUID to see orders, failed payments, wallet balance, and recent timeline events for faster triage.
              </p>
            </div>
          </div>

          <div className="flex gap-3 flex-col sm:flex-row">
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="User ID (UUID)"
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-sm font-mono focus:ring-2 focus:ring-indigo-500/40 outline-none"
            />
            <button
              type="button"
              onClick={loadSupportSummary}
              disabled={loadingSummary || !userId.trim()}
              className="shrink-0 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-60 inline-flex items-center justify-center"
            >
              {loadingSummary ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
              Load summary
            </button>
          </div>

          {!summary && (
            <div className="mt-8 rounded-xl border border-dashed border-gray-200 dark:border-[#303038] bg-gray-50/50 dark:bg-white/5 p-8 text-center">
              <Headphones className="w-10 h-10 mx-auto text-gray-400 mb-3" />
              <p className="text-sm text-gray-600 dark:text-gray-400">Enter a user ID above and load summary to see account context.</p>
            </div>
          )}

          {summary && (
            <div className="mt-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-gray-100 dark:border-[#26262d] bg-gray-50/50 dark:bg-white/5 p-4">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Orders</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{summary.order_count || 0}</p>
                </div>
                <div className="rounded-xl border border-gray-100 dark:border-[#26262d] bg-gray-50/50 dark:bg-white/5 p-4">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Failed payments</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{summary.failed_payments_last || 0}</p>
                </div>
                <div className="rounded-xl border border-gray-100 dark:border-[#26262d] bg-gray-50/50 dark:bg-white/5 p-4">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Wallet balance</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">৳{Number(summary.wallet_balance || 0).toFixed(2)}</p>
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 dark:border-[#26262d] p-4">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Recent timeline</p>
                <div className="space-y-2 max-h-56 overflow-auto">
                  {(summary.timeline_events || []).slice(0, 12).map((e: any) => (
                    <div
                      key={e.id}
                      className="text-xs text-gray-600 dark:text-gray-300 border-b border-gray-100 dark:border-[#26262d] pb-2 last:border-0"
                    >
                      <span className="font-semibold text-gray-800 dark:text-gray-200">{e.event_type}</span>
                      <span className="text-gray-500"> — {e.message || 'No message'}</span>
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
      )}

      {/* Risk */}
      {activeTab === 'risk' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 md:p-6 shadow-sm dark:shadow-none">
            <div className="flex items-start gap-3 mb-5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 text-sm font-bold dark:bg-indigo-500/20 dark:text-indigo-300">
                1
              </span>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Risk overview</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  Choose a time window and refresh to load counts and recent risk events. Use this before running automation below.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <label className="text-xs font-semibold text-gray-500">Window</label>
                  <select
                    value={riskHours}
                    onChange={(e) => setRiskHours(Number(e.target.value))}
                    className="px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113]"
                  >
                    <option value={24}>Last 24 hours</option>
                    <option value={72}>Last 72 hours</option>
                    <option value={168}>Last 7 days</option>
                  </select>
                  <button
                    type="button"
                    onClick={loadRisk}
                    disabled={loadingRisk}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-60"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingRisk ? 'animate-spin' : ''}`} />
                    {loadingRisk ? 'Loading…' : 'Load metrics'}
                  </button>
                </div>
              </div>
            </div>

            {!risk?.metrics ? (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-[#303038] bg-gray-50/50 dark:bg-white/5 p-8 text-center">
                <Gauge className="w-10 h-10 mx-auto text-gray-400 mb-3" />
                <p className="text-sm text-gray-600 dark:text-gray-400">Click &quot;Load metrics&quot; to see payment failures, retries, and alerts for the selected window.</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <Metric icon={AlertTriangle} label="Payment failures" value={risk.metrics.payment_failures} />
                  <Metric icon={Activity} label="Retries" value={risk.metrics.retries} />
                  <Metric icon={Shield} label="Redeem abuse" value={risk.metrics.redeem_abuse_events} />
                  <Metric icon={Wallet} label="Wallet alerts" value={risk.metrics.suspicious_wallet_events} />
                  <Metric icon={AlertTriangle} label="Pending orders" value={risk.metrics.pending_orders} />
                </div>
                <div className="rounded-xl border border-gray-100 dark:border-[#26262d] p-4">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Recent risk events</p>
                  <div className="space-y-2 max-h-56 overflow-auto">
                    {(risk.recent_risk_events || []).slice(0, 20).map((e: any, i: number) => (
                      <div key={`${e.id}-${i}`} className="text-xs border-b border-gray-100 dark:border-[#26262d] pb-2 last:border-0">
                        <span className="font-semibold text-gray-800 dark:text-gray-200">{e.risk_type}</span>
                        <span className="text-gray-500"> ({e.severity}) — {e.message || 'No message'}</span>
                      </div>
                    ))}
                    {(!risk.recent_risk_events || risk.recent_risk_events.length === 0) && (
                      <p className="text-xs text-gray-500">No risk events in this window.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 md:p-6 shadow-sm dark:shadow-none">
            <div className="flex items-start gap-3 mb-5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700 text-sm font-bold dark:bg-violet-500/20 dark:text-violet-300">
                2
              </span>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Automation actions</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
                  These run server jobs. Use them when you know what each does—results are shown in an alert.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ActionCard
                icon={Play}
                title="Run policies"
                description="Evaluates rules and may queue reminders or create throttle flags."
                onClick={runPolicies}
                disabled={runningPolicies}
                loading={runningPolicies}
                variant="emerald"
              />
              <ActionCard
                icon={Bell}
                title="Run reminders"
                description="Refreshes the reminder queue for lifecycle nudges."
                onClick={runReminders}
                disabled={runningReminders}
                loading={runningReminders}
                variant="sky"
              />
              <ActionCard
                icon={Inbox}
                title="Process queue"
                description="Sends pending notifications from the outbox (batch limit applies)."
                onClick={processQueue}
                disabled={processingQueue}
                loading={processingQueue}
                variant="violet"
              />
            </div>
            <p className="flex items-start gap-2 text-xs text-gray-500 mt-4">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />
              After running policies, refresh metrics above to see updated counts when relevant.
            </p>
          </div>
        </div>
      )}

      {/* Health */}
      {activeTab === 'health' && (
        <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 md:p-6 shadow-sm dark:shadow-none">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 text-sm font-bold dark:bg-indigo-500/20 dark:text-indigo-300">
                1
              </span>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Subscription health scores</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
                  Per-order scores for renewals and churn risk. Load the table to review users who may need outreach.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={loadHealth}
              disabled={loadingHealth}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-60 shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${loadingHealth ? 'animate-spin' : ''}`} />
              {loadingHealth ? 'Loading…' : 'Load table'}
            </button>
          </div>

          {healthRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 dark:border-[#303038] bg-gray-50/50 dark:bg-white/5 p-8 text-center">
              <HeartPulse className="w-10 h-10 mx-auto text-gray-400 mb-3" />
              <p className="text-sm text-gray-600 dark:text-gray-400">Click &quot;Load table&quot; to fetch subscription health rows (up to 150).</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-[#26262d]">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/5">
                    <th className="py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">User</th>
                    <th className="py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Product</th>
                    <th className="py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Days left</th>
                    <th className="py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Score</th>
                    <th className="py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Label</th>
                  </tr>
                </thead>
                <tbody>
                  {healthRows.slice(0, 60).map((r) => (
                    <tr key={r.order_id} className="border-b border-gray-100 dark:border-[#26262d] hover:bg-gray-50/50 dark:hover:bg-white/5">
                      <td className="py-2.5 px-4">{r.user_name || r.user_email}</td>
                      <td className="py-2.5 px-4">{r.product_title}</td>
                      <td className="py-2.5 px-4">{r.days_left}</td>
                      <td className="py-2.5 px-4 font-semibold">{r.score}</td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                            r.label === 'healthy'
                              ? 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400'
                              : r.label === 'risk'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                                : 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400'
                          }`}
                        >
                          {r.label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Metric = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) => (
  <div className="rounded-xl border border-gray-100 dark:border-[#26262d] bg-gray-50/50 dark:bg-white/5 p-4">
    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium">
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </div>
    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{value || 0}</p>
  </div>
);

function ActionCard({
  icon: Icon,
  title,
  description,
  onClick,
  disabled,
  loading,
  variant,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
  variant: 'emerald' | 'sky' | 'violet';
}) {
  const styles = {
    emerald: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    sky: 'bg-sky-600 hover:bg-sky-700 text-white',
    violet: 'bg-violet-600 hover:bg-violet-700 text-white',
  };
  return (
    <div className="rounded-xl border border-gray-100 dark:border-[#26262d] p-4 flex flex-col h-full bg-gray-50/30 dark:bg-white/5">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{title}</span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 flex-1 mb-4 leading-relaxed">{description}</p>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-2 ${styles[variant]}`}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        {loading ? 'Running…' : 'Run'}
      </button>
    </div>
  );
}
