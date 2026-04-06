import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Loader2,
  Megaphone,
  Layers3,
  BarChart3,
  RefreshCw,
  Users,
  Sparkles,
  Info,
  LineChart,
  Gift,
  Trash2,
} from 'lucide-react';
import { toast } from '../../lib/toast';
import { useConfirmDialog } from '../../contexts/ConfirmDialogContext';

async function adminRequest(path: string, method: string = 'GET', body?: any) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || json?.message || 'Request failed');
  return json;
}

type TabId = 'bulk' | 'campaigns' | 'insights';

export const AdminGrowthOps = () => {
  const { confirm } = useConfirmDialog();
  const [activeTab, setActiveTab] = useState<TabId>('bulk');

  const [orderIds, setOrderIds] = useState('');
  const [userIds, setUserIds] = useState('');
  const [newStatus, setNewStatus] = useState('pending');
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeBody, setNoticeBody] = useState('');
  const [days, setDays] = useState(7);
  const [running, setRunning] = useState(false);

  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campaignName, setCampaignName] = useState('');
  const [campaignType, setCampaignType] = useState('renewal');
  const [campaignBudgetInput, setCampaignBudgetInput] = useState('');
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [roiCampaignId, setRoiCampaignId] = useState<string>('');
  const [roi, setRoi] = useState<any>(null);
  const [cohortRows, setCohortRows] = useState<any[]>([]);
  const [funnel, setFunnel] = useState<any>(null);
  const [ltvRows, setLtvRows] = useState<any[]>([]);
  const [renewalRows, setRenewalRows] = useState<any[]>([]);
  const [referralOrderId, setReferralOrderId] = useState('');
  const [refSettings, setRefSettings] = useState<Record<string, any> | null>(null);
  const [refRewards, setRefRewards] = useState<any[]>([]);
  const [referralAdminLoading, setReferralAdminLoading] = useState(false);

  const parseLines = (text: string) => text.split('\n').map((s) => s.trim()).filter(Boolean);

  const loadCampaigns = async () => {
    setLoadingCampaigns(true);
    try {
      const data = await adminRequest('/api/admin/ops/campaigns');
      const list = data.campaigns || [];
      setCampaigns(list);
      setRoiCampaignId((prev) => {
        if (prev && list.some((c: any) => c.id === prev)) return prev;
        return list[0]?.id || '';
      });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load campaigns');
    } finally {
      setLoadingCampaigns(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadReferralAdmin = async () => {
    setReferralAdminLoading(true);
    try {
      const [s, r] = await Promise.all([
        adminRequest('/api/admin/ops/referral/settings'),
        adminRequest('/api/admin/ops/referral/rewards?limit=250'),
      ]);
      setRefSettings(s.settings || {});
      setRefRewards(r.rows || []);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load referral admin data');
    } finally {
      setReferralAdminLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'insights') void loadReferralAdmin();
    // loadReferralAdmin is re-created each render; we only need tab changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const runBulkOrderStatus = async () => {
    const ids = parseLines(orderIds);
    if (ids.length === 0) {
      toast.warning('Add order IDs first (one per line).');
      return;
    }
    setRunning(true);
    try {
      const res = await adminRequest('/api/admin/ops/bulk/orders/status', 'POST', {
        order_ids: ids,
        new_status: newStatus,
      });
      toast.success(`Updated ${res.updated} orders.`);
    } catch (e: any) {
      toast.error(e?.message || 'Bulk order update failed');
    } finally {
      setRunning(false);
    }
  };

  const runBulkNotices = async () => {
    const ids = parseLines(userIds);
    if (ids.length === 0) {
      toast.warning('Add user IDs first (one per line).');
      return;
    }
    if (!noticeTitle || !noticeBody) {
      toast.warning('Title and message are required.');
      return;
    }
    setRunning(true);
    try {
      const res = await adminRequest('/api/admin/ops/bulk/notices', 'POST', {
        user_ids: ids,
        title: noticeTitle,
        content: noticeBody,
        type: 'info',
      });
      toast.success(`Queued ${res.queued} notices.`);
    } catch (e: any) {
      toast.error(e?.message || 'Bulk notice failed');
    } finally {
      setRunning(false);
    }
  };

  const runRenewOffers = async () => {
    const ids = parseLines(userIds);
    setRunning(true);
    try {
      const res = await adminRequest('/api/admin/ops/bulk/renew-offers', 'POST', {
        user_ids: ids.length ? ids : undefined,
        days,
      });
      toast.success(`Queued ${res.queued} renewal offers.`);
    } catch (e: any) {
      toast.error(e?.message || 'Bulk renew offers failed');
    } finally {
      setRunning(false);
    }
  };

  const createCampaign = async () => {
    if (!campaignName.trim()) {
      toast.warning('Campaign name is required.');
      return;
    }
    const budgetNum = Math.max(0, Number(campaignBudgetInput) || 0);
    setRunning(true);
    try {
      await adminRequest('/api/admin/ops/campaigns', 'POST', {
        name: campaignName.trim(),
        campaign_type: campaignType,
        budget: budgetNum,
        channel: 'in_app',
      });
      setCampaignName('');
      setCampaignBudgetInput('');
      await loadCampaigns();
      toast.success('Campaign created.');
    } catch (e: any) {
      toast.error(e?.message || 'Campaign create failed');
    } finally {
      setRunning(false);
    }
  };

  const loadRoi = async () => {
    if (!roiCampaignId) return;
    setRunning(true);
    try {
      const data = await adminRequest(`/api/admin/ops/campaigns/${roiCampaignId}/roi`);
      setRoi(data.metrics);
    } catch (e: any) {
      toast.error(e?.message || 'ROI load failed');
    } finally {
      setRunning(false);
    }
  };

  const deleteCampaign = async (id: string) => {
    const ok = await confirm({
      title: 'Delete this campaign?',
      description: 'Tracked ROI events for it will be removed. This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    setRunning(true);
    try {
      await adminRequest(`/api/admin/ops/campaigns/${encodeURIComponent(id)}`, 'DELETE');
      if (roiCampaignId === id) setRoi(null);
      await loadCampaigns();
    } catch (e: any) {
      toast.error(e?.message || 'Delete failed');
    } finally {
      setRunning(false);
    }
  };

  const loadAnalytics = async () => {
    setRunning(true);
    try {
      const [cohort, funnelData, ltv, renewalPacks] = await Promise.all([
        adminRequest('/api/admin/ops/analytics/cohort-retention?months=6'),
        adminRequest('/api/admin/ops/analytics/funnel?days=30'),
        adminRequest('/api/admin/ops/analytics/ltv?limit=20'),
        adminRequest('/api/admin/ops/renewal-packs?days=7'),
      ]);
      setCohortRows(cohort.rows || []);
      setFunnel(funnelData);
      setLtvRows(ltv.rows || []);
      setRenewalRows(renewalPacks.rows || []);
    } catch (e: any) {
      toast.error(e?.message || 'Analytics load failed');
    } finally {
      setRunning(false);
    }
  };

  const runChurnCampaign = async () => {
    const ok = await confirm({
      title: 'Queue churn prevention messages?',
      description: 'Inactive users may receive churn prevention outreach.',
      confirmLabel: 'Queue messages',
    });
    if (!ok) return;
    setRunning(true);
    try {
      const data = await adminRequest('/api/admin/ops/churn/run-campaign', 'POST', { days: 7, inactive_days: 14 });
      toast.success(`Queued ${data.queued} churn campaign messages.`);
    } catch (e: any) {
      toast.error(e?.message || 'Churn campaign failed');
    } finally {
      setRunning(false);
    }
  };

  const processReferralByOrder = async () => {
    if (!referralOrderId.trim()) {
      toast.warning('Order ID is required.');
      return;
    }
    setRunning(true);
    try {
      const data = await adminRequest(`/api/admin/ops/referral/process-order/${encodeURIComponent(referralOrderId.trim())}`, 'POST', {});
      if (data.reward_amount) {
        toast.success(`Referral processed: ৳${data.reward_amount} (status: ${data.status || 'granted'})`);
      } else {
        toast.info(`Result: ${data.skipped || data.status || 'done'}`);
      }
      await loadReferralAdmin();
    } catch (e: any) {
      toast.error(e?.message || 'Referral process failed');
    } finally {
      setRunning(false);
    }
  };

  const saveReferralSettings = async () => {
    if (!refSettings) return;
    setRunning(true);
    try {
      const data = await adminRequest('/api/admin/ops/referral/settings', 'PATCH', refSettings);
      setRefSettings(data.settings || refSettings);
      toast.success('Referral settings saved.');
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setRunning(false);
    }
  };

  const approveReferralReward = async (id: string) => {
    const ok = await confirm({
      title: 'Grant promotional credits?',
      description: 'Credits will be applied for this referral reward row.',
      confirmLabel: 'Grant',
    });
    if (!ok) return;
    setRunning(true);
    try {
      await adminRequest(`/api/admin/ops/referral/rewards/${encodeURIComponent(id)}/approve`, 'POST', {});
      await loadReferralAdmin();
    } catch (e: any) {
      toast.error(e?.message || 'Approve failed');
    } finally {
      setRunning(false);
    }
  };

  const rejectReferralReward = async (id: string) => {
    const ok = await confirm({
      title: 'Reject this referral reward?',
      confirmLabel: 'Reject',
      variant: 'danger',
    });
    if (!ok) return;
    setRunning(true);
    try {
      await adminRequest(`/api/admin/ops/referral/rewards/${encodeURIComponent(id)}/reject`, 'POST', {});
      await loadReferralAdmin();
    } catch (e: any) {
      toast.error(e?.message || 'Reject failed');
    } finally {
      setRunning(false);
    }
  };

  const tabs: { id: TabId; label: string; sub: string; icon: React.ElementType }[] = [
    { id: 'bulk', label: 'Bulk actions', sub: 'Orders & notices', icon: Layers3 },
    { id: 'campaigns', label: 'Campaigns', sub: 'Create & ROI', icon: Megaphone },
    { id: 'insights', label: 'Insights', sub: 'Analytics & referral', icon: LineChart },
  ];

  const funnelMax = funnel?.stages
    ? Math.max(
        1,
        funnel.stages.store_view || 0,
        funnel.stages.checkout_start || 0,
        funnel.stages.payment_init || 0,
        funnel.stages.paid || 0
      )
    : 1;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Growth Ops</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-xl">
                Bulk operations, campaigns, and analytics in one place. Use the tabs below to work step by step.
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
                className={`flex-1 min-w-[140px] flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
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

      {activeTab === 'bulk' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <SectionCard
            step={1}
            title="Change order status"
            hint="Enter one order ID per line, then choose the new status."
          >
            <textarea
              value={orderIds}
              onChange={(e) => setOrderIds(e.target.value)}
              placeholder={'Example:\nabc123...\ndef456...'}
              className="h-36 w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-[#26262d] bg-gray-50/80 dark:bg-[#111113] text-sm focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50 outline-none"
            />
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">New status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] text-sm"
                >
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <button
                type="button"
                onClick={runBulkOrderStatus}
                disabled={running}
                className="shrink-0 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {running ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
                Update orders
              </button>
            </div>
          </SectionCard>

          <SectionCard
            step={2}
            title="Notices & renewal offers"
            hint="User IDs: one per line. For notices, provide title and message. For renewal offers, leave user IDs empty to let the system target eligible users."
          >
            <textarea
              value={userIds}
              onChange={(e) => setUserIds(e.target.value)}
              placeholder="User IDs (one per line)..."
              className="h-28 w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-[#26262d] bg-gray-50/80 dark:bg-[#111113] text-sm focus:ring-2 focus:ring-indigo-500/40 outline-none"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Notice title</label>
                <input
                  value={noticeTitle}
                  onChange={(e) => setNoticeTitle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] text-sm"
                  placeholder="e.g. System update"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Renewal window (days)</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={days}
                  onChange={(e) => setDays(Math.min(30, Math.max(1, Number(e.target.value) || 7)))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Notice message</label>
              <textarea
                value={noticeBody}
                onChange={(e) => setNoticeBody(e.target.value)}
                className="w-full h-24 px-4 py-3 rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] text-sm"
                placeholder="Message shown to users..."
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={runBulkNotices}
                disabled={running}
                className="flex-1 px-4 py-2.5 rounded-xl border-2 border-indigo-500/40 text-indigo-700 dark:text-indigo-300 bg-indigo-50/80 dark:bg-indigo-500/10 font-semibold text-sm hover:bg-indigo-100/80 dark:hover:bg-indigo-500/20 disabled:opacity-50"
              >
                Send notices
              </button>
              <button
                type="button"
                onClick={runRenewOffers}
                disabled={running}
                className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm disabled:opacity-50"
              >
                Queue renewal offers
              </button>
            </div>
            <p className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-500">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />
              Renewal offers target orders expiring within the selected number of days.
            </p>
          </SectionCard>
        </div>
      )}

      {activeTab === 'campaigns' && (
        <div className="space-y-6">
          <SectionCard
            step={1}
            title="Create campaign"
            hint="Budget is for tracking and ROI only. You can leave it at 0."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 mb-1">Campaign name</label>
                <input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g. March renewal push"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Type</label>
                <select
                  value={campaignType}
                  onChange={(e) => setCampaignType(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] text-sm"
                >
                  <option value="renewal">Renewal</option>
                  <option value="referral">Referral</option>
                  <option value="redeem">Redeem</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Budget (৳)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={campaignBudgetInput}
                  onChange={(e) => setCampaignBudgetInput(e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] text-sm"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={createCampaign}
              disabled={running}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm disabled:opacity-50"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
              Create campaign
            </button>
          </SectionCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5">
              <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-1">Your campaigns</h4>
              <p className="text-xs text-gray-500 mb-4">Click a campaign to select it for ROI.</p>
              {loadingCampaigns ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                </div>
              ) : (
                <ul className="space-y-2 max-h-64 overflow-y-auto">
                  {campaigns.map((c) => (
                    <li key={c.id} className="flex gap-2 items-stretch">
                      <button
                        type="button"
                        onClick={() => setRoiCampaignId(c.id)}
                        className={`min-w-0 flex-1 text-left rounded-xl border px-4 py-3 transition-colors ${
                          roiCampaignId === c.id
                            ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-500/15 dark:border-indigo-500/50'
                            : 'border-gray-200 dark:border-[#26262d] hover:border-indigo-300 dark:hover:border-indigo-500/30'
                        }`}
                      >
                        <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{c.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {c.campaign_type} · {c.status} · ৳{Number(c.budget || 0).toFixed(0)}
                        </p>
                      </button>
                      <button
                        type="button"
                        title="Delete campaign"
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteCampaign(c.id);
                        }}
                        disabled={running}
                        className="shrink-0 rounded-xl border border-red-200 dark:border-red-900/40 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                  {campaigns.length === 0 && <p className="text-sm text-gray-500 text-center py-8">No campaigns yet.</p>}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-500" />
                  <div>
                    <h4 className="font-bold text-gray-900 dark:text-gray-100">ROI report</h4>
                    <p className="text-xs text-gray-500">Numbers fill in as events are tracked.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={loadRoi}
                  disabled={running || !roiCampaignId}
                  className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50"
                >
                  Load ROI
                </button>
              </div>
              {roi ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <Stat label="Impressions" value={roi.impressions} />
                  <Stat label="Clicks" value={roi.clicks} />
                  <Stat label="Conversions" value={roi.conversions} />
                  <Stat label="Revenue" value={`৳${Number(roi.revenue || 0).toFixed(2)}`} />
                  <Stat label="Cost" value={`৳${Number(roi.cost || 0).toFixed(2)}`} />
                  <Stat label="ROI %" value={`${Number(roi.roi_percent || 0).toFixed(1)}%`} />
                </div>
              ) : (
                <p className="text-sm text-gray-500 py-8 text-center">Select a campaign on the left, then load ROI.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'insights' && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={loadAnalytics}
              disabled={running}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
              Load all analytics
            </button>
            <button
              type="button"
              onClick={runChurnCampaign}
              disabled={running}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-rose-400/50 text-rose-700 dark:text-rose-300 bg-rose-50/50 dark:bg-rose-500/10 font-semibold text-sm hover:bg-rose-100/50 disabled:opacity-50"
            >
              Run churn prevention
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5">
              <h4 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-1">
                <Users className="w-5 h-5 text-violet-500" />
                Funnel (30 days)
              </h4>
              <p className="text-xs text-gray-500 mb-4">Store view → checkout → payment → paid</p>
              {funnel?.stages ? (
                <div className="space-y-3">
                  {[
                    { key: 'store_view', label: 'Store view', v: funnel.stages.store_view },
                    { key: 'checkout_start', label: 'Checkout start', v: funnel.stages.checkout_start },
                    { key: 'payment_init', label: 'Payment init', v: funnel.stages.payment_init },
                    { key: 'paid', label: 'Paid', v: funnel.stages.paid },
                  ].map((row) => (
                    <div key={row.key}>
                      <div className="flex justify-between text-xs mb-1">
                        <span>{row.label}</span>
                        <span className="font-semibold">{row.v}</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                          style={{ width: `${Math.min(100, ((row.v || 0) / funnelMax) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 pt-2">
                    Overall conversion: {Number(funnel.conversion?.overall || 0).toFixed(2)}%
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Click &quot;Load all analytics&quot; above.</p>
              )}
            </div>

            <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5">
              <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-1">Referral processing</h4>
              <p className="text-xs text-gray-500 mb-3">
                Force-run the referral engine on a completed order (ignores auto_process off). Credits go to promotional balance
                (subscription-only), with fraud scoring and daily caps.
              </p>
              <input
                value={referralOrderId}
                onChange={(e) => setReferralOrderId(e.target.value)}
                placeholder="Order UUID"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-sm font-mono mb-3"
              />
              <button
                type="button"
                onClick={processReferralByOrder}
                disabled={running}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm disabled:opacity-50"
              >
                Process referral
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-200/50 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 to-transparent dark:from-indigo-950/30 p-5 md:p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Gift className="w-6 h-6 text-indigo-500" />
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-gray-100">Referral program controls</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 max-w-2xl">
                    Toggle the program, auto-settlement on completed orders, reward bands, and risk thresholds. High-risk referrals create
                    risk_events and stay pending until you approve. Session fingerprints and IPs are matched between referrer and referee.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void loadReferralAdmin()}
                disabled={referralAdminLoading}
                className="text-sm px-4 py-2 rounded-xl border border-gray-200 dark:border-[#26262d] font-semibold disabled:opacity-50"
              >
                {referralAdminLoading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Refresh'}
              </button>
            </div>

            {refSettings && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <label className="flex flex-col gap-1 text-sm text-gray-800 dark:text-gray-200 sm:flex-row sm:items-center sm:gap-2">
                  <span className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={refSettings.enabled !== false}
                      onChange={(e) => setRefSettings({ ...refSettings, enabled: e.target.checked })}
                    />
                    Referral program on
                  </span>
                  <span className="text-xs font-normal text-gray-500 dark:text-gray-400 sm:ml-1">
                    Off = no new invite links accepted, no automatic rewards (admin can still force-process an order if needed).
                  </span>
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={refSettings.auto_process_on_order_complete !== false}
                    onChange={(e) => setRefSettings({ ...refSettings, auto_process_on_order_complete: e.target.checked })}
                  />
                  Auto-process on order complete
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={refSettings.referee_bonus_matches_referrer !== false}
                    onChange={(e) => setRefSettings({ ...refSettings, referee_bonus_matches_referrer: e.target.checked })}
                  />
                  Referee bonus matches referrer
                </label>
                {[
                  ['referrer_reward_min', 'Referrer min ৳'],
                  ['referrer_reward_max', 'Referrer max ৳'],
                  ['referee_bonus_fixed', 'Referee fixed ৳ (if not matching)'],
                  ['min_order_total_bdt', 'Min order total ৳'],
                  ['risk_review_from', 'Risk review from (score)'],
                  ['risk_block_from', 'Auto-block from (score)'],
                  ['daily_cap_per_referrer_bdt', 'Daily cap / referrer ৳'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-sm"
                      value={Number(refSettings[key] ?? 0)}
                      onChange={(e) => setRefSettings({ ...refSettings, [key]: Number(e.target.value) })}
                    />
                  </div>
                ))}
              </div>
            )}

            {refSettings && (
              <button
                type="button"
                onClick={() => void saveReferralSettings()}
                disabled={running}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm disabled:opacity-50"
              >
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save referral settings
              </button>
            )}

            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-[#26262d]">
              <table className="min-w-full text-xs sm:text-sm">
                <thead className="bg-gray-50 dark:bg-white/5 text-left text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-3 py-2 font-semibold">When</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Risk</th>
                    <th className="px-3 py-2 font-semibold">৳</th>
                    <th className="px-3 py-2 font-semibold">Referrer</th>
                    <th className="px-3 py-2 font-semibold">Referee</th>
                    <th className="px-3 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-[#26262d]">
                  {refRewards.map((rw) => (
                    <tr key={rw.id} className="text-gray-800 dark:text-gray-200">
                      <td className="px-3 py-2 whitespace-nowrap">{new Date(rw.created_at).toLocaleString()}</td>
                      <td className="px-3 py-2 font-medium">{rw.status}</td>
                      <td className="px-3 py-2">{rw.risk_score ?? 0}</td>
                      <td className="px-3 py-2 tabular-nums">{Number(rw.reward_amount || 0).toFixed(0)}</td>
                      <td className="px-3 py-2 max-w-[140px] truncate" title={rw.referrer?.email}>
                        {rw.referrer?.email || rw.referrer_user_id?.slice(0, 8)}
                      </td>
                      <td className="px-3 py-2 max-w-[140px] truncate" title={rw.referee?.email}>
                        {rw.referee?.email || rw.referee_user_id?.slice(0, 8)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap space-x-1">
                        {rw.status === 'pending_review' || rw.status === 'blocked' ? (
                          <>
                            <button
                              type="button"
                              className="text-emerald-600 font-semibold hover:underline disabled:opacity-40"
                              disabled={running}
                              onClick={() => void approveReferralReward(rw.id)}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="text-rose-600 font-semibold hover:underline disabled:opacity-40"
                              disabled={running}
                              onClick={() => void rejectReferralReward(rw.id)}
                            >
                              Reject
                            </button>
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {refRewards.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                        No referral rows yet. Complete a referred order or use manual process above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InsightList
              title="Top LTV"
              subtitle="Highest-spending users"
              rows={ltvRows}
              empty="Load analytics above"
              render={(r) => `${r.user_id.slice(0, 8)}… · ৳${Number(r.ltv).toFixed(0)}`}
            />
            <InsightList
              title="Cohort retention"
              subtitle="30-day return rate"
              rows={cohortRows}
              empty="Load analytics above"
              render={(r) => `${r.cohort}: ${Number(r.retention_30d_percent).toFixed(1)}%`}
            />
            <InsightList
              title="Renewal packs (7d)"
              subtitle="Expiring soon"
              rows={renewalRows}
              empty="Load analytics above"
              render={(r) => `${r.user_email || r.user_id.slice(0, 6)}… · ${r.days_left}d`}
            />
          </div>
        </div>
      )}
    </div>
  );
};

function SectionCard({
  step,
  title,
  hint,
  children,
}: {
  step: number;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 md:p-6 shadow-sm dark:shadow-none">
      <div className="flex items-start gap-3 mb-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 text-sm font-bold dark:bg-indigo-500/20 dark:text-indigo-300">
          {step}
        </span>
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">{hint}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border border-gray-100 dark:border-[#26262d] bg-gray-50/50 dark:bg-white/5 p-3">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-0.5">{value}</p>
    </div>
  );
}

function InsightList({
  title,
  subtitle,
  rows,
  empty,
  render,
}: {
  title: string;
  subtitle: string;
  rows: any[];
  empty: string;
  render: (r: any) => string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-4">
      <p className="font-bold text-gray-900 dark:text-gray-100">{title}</p>
      <p className="text-xs text-gray-500 mb-3">{subtitle}</p>
      <div className="space-y-2 max-h-48 overflow-y-auto text-sm">
        {rows.length === 0 ? (
          <p className="text-gray-500 text-sm py-4 text-center">{empty}</p>
        ) : (
          rows.slice(0, 12).map((r, i) => (
            <div key={i} className="rounded-lg px-3 py-2 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-gray-200">
              {render(r)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
