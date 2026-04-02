import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, Megaphone, Layers3, BarChart3, RefreshCw, Users } from 'lucide-react';

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

export const AdminGrowthOps = () => {
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
  const [campaignBudget, setCampaignBudget] = useState(0);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [roiCampaignId, setRoiCampaignId] = useState<string>('');
  const [roi, setRoi] = useState<any>(null);
  const [cohortRows, setCohortRows] = useState<any[]>([]);
  const [funnel, setFunnel] = useState<any>(null);
  const [ltvRows, setLtvRows] = useState<any[]>([]);
  const [renewalRows, setRenewalRows] = useState<any[]>([]);
  const [referralOrderId, setReferralOrderId] = useState('');

  const parseLines = (text: string) => text.split('\n').map((s) => s.trim()).filter(Boolean);

  const loadCampaigns = async () => {
    setLoadingCampaigns(true);
    try {
      const data = await adminRequest('/api/admin/ops/campaigns');
      setCampaigns(data.campaigns || []);
      if (!roiCampaignId && data.campaigns?.[0]?.id) setRoiCampaignId(data.campaigns[0].id);
    } catch (e: any) {
      alert(e?.message || 'Failed to load campaigns');
    } finally {
      setLoadingCampaigns(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  const runBulkOrderStatus = async () => {
    const ids = parseLines(orderIds);
    if (ids.length === 0) return alert('Add order IDs first');
    setRunning(true);
    try {
      const res = await adminRequest('/api/admin/ops/bulk/orders/status', 'POST', {
        order_ids: ids,
        new_status: newStatus,
      });
      alert(`Updated ${res.updated} orders`);
    } catch (e: any) {
      alert(e?.message || 'Bulk order update failed');
    } finally {
      setRunning(false);
    }
  };

  const runBulkNotices = async () => {
    const ids = parseLines(userIds);
    if (ids.length === 0) return alert('Add user IDs first');
    if (!noticeTitle || !noticeBody) return alert('Notice title and message required');
    setRunning(true);
    try {
      const res = await adminRequest('/api/admin/ops/bulk/notices', 'POST', {
        user_ids: ids,
        title: noticeTitle,
        content: noticeBody,
        type: 'info',
      });
      alert(`Queued ${res.queued} notices`);
    } catch (e: any) {
      alert(e?.message || 'Bulk notice failed');
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
      alert(`Queued ${res.queued} renewal offers`);
    } catch (e: any) {
      alert(e?.message || 'Bulk renew offers failed');
    } finally {
      setRunning(false);
    }
  };

  const createCampaign = async () => {
    if (!campaignName.trim()) return alert('Campaign name required');
    setRunning(true);
    try {
      await adminRequest('/api/admin/ops/campaigns', 'POST', {
        name: campaignName.trim(),
        campaign_type: campaignType,
        budget: campaignBudget,
        channel: 'in_app',
      });
      setCampaignName('');
      setCampaignBudget(0);
      await loadCampaigns();
      alert('Campaign created');
    } catch (e: any) {
      alert(e?.message || 'Campaign create failed');
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
      alert(e?.message || 'ROI load failed');
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
      alert(e?.message || 'Analytics load failed');
    } finally {
      setRunning(false);
    }
  };

  const runChurnCampaign = async () => {
    setRunning(true);
    try {
      const data = await adminRequest('/api/admin/ops/churn/run-campaign', 'POST', { days: 7, inactive_days: 14 });
      alert(`Churn prevention queued: ${data.queued}`);
    } catch (e: any) {
      alert(e?.message || 'Churn campaign failed');
    } finally {
      setRunning(false);
    }
  };

  const processReferralByOrder = async () => {
    if (!referralOrderId.trim()) return alert('Order ID required');
    setRunning(true);
    try {
      const data = await adminRequest(`/api/admin/ops/referral/process-order/${encodeURIComponent(referralOrderId.trim())}`, 'POST', {});
      if (data.reward_amount) alert(`Referral rewards granted: ৳${data.reward_amount} to each side`);
      else alert(`Processed: ${data.skipped || 'done'}`);
    } catch (e: any) {
      alert(e?.message || 'Referral process failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#151518] rounded-xl border border-gray-100 dark:border-[#26262d] p-5">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Layers3 className="w-5 h-5" /> Bulk Operations</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <textarea value={orderIds} onChange={(e) => setOrderIds(e.target.value)} placeholder="Order IDs (one per line)" className="h-32 px-3 py-2 rounded-lg border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-sm" />
          <div className="space-y-2">
            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-sm">
              <option value="pending">pending</option>
              <option value="completed">completed</option>
              <option value="cancelled">cancelled</option>
              <option value="paid">paid</option>
            </select>
            <button onClick={runBulkOrderStatus} disabled={running} className="w-full px-3 py-2 rounded-lg bg-primary text-white text-sm disabled:opacity-60">
              {running ? 'Running...' : 'Bulk Status Update'}
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <textarea value={userIds} onChange={(e) => setUserIds(e.target.value)} placeholder="User IDs (one per line)" className="h-32 px-3 py-2 rounded-lg border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-sm" />
          <div className="space-y-2">
            <input value={noticeTitle} onChange={(e) => setNoticeTitle(e.target.value)} placeholder="Notice title" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-sm" />
            <textarea value={noticeBody} onChange={(e) => setNoticeBody(e.target.value)} placeholder="Notice message" className="w-full h-20 px-3 py-2 rounded-lg border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={runBulkNotices} disabled={running} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-60">Bulk Notices</button>
              <button onClick={runRenewOffers} disabled={running} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-60">Bulk Renew Offers</button>
            </div>
            <input type="number" min={1} max={30} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-sm" />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#151518] rounded-xl border border-gray-100 dark:border-[#26262d] p-5">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Megaphone className="w-5 h-5" /> Campaign Console</h3>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Campaign name" className="px-3 py-2 rounded-lg border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-sm" />
          <select value={campaignType} onChange={(e) => setCampaignType(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-sm">
            <option value="renewal">renewal</option>
            <option value="referral">referral</option>
            <option value="redeem">redeem</option>
          </select>
          <input type="number" value={campaignBudget} onChange={(e) => setCampaignBudget(Number(e.target.value))} placeholder="Budget" className="px-3 py-2 rounded-lg border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-sm" />
          <button onClick={createCampaign} disabled={running} className="px-3 py-2 rounded-lg bg-primary text-white text-sm disabled:opacity-60">Create Campaign</button>
        </div>

        <div className="mt-5">
          {loadingCampaigns ? (
            <div className="py-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-2">
              {campaigns.map((c) => (
                <div key={c.id} className="rounded-lg border border-gray-100 dark:border-[#26262d] p-3 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">{c.name}</p>
                    <p className="text-xs text-gray-500">{c.campaign_type} • {c.status} • budget ৳{Number(c.budget || 0).toFixed(2)}</p>
                  </div>
                  <button onClick={() => setRoiCampaignId(c.id)} className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-[#303038]">Select</button>
                </div>
              ))}
              {campaigns.length === 0 && <p className="text-sm text-gray-500">No campaigns yet.</p>}
            </div>
          )}
        </div>

        <div className="mt-5 rounded-lg border border-gray-100 dark:border-[#26262d] p-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4" /> ROI Report</p>
            <button onClick={loadRoi} disabled={running || !roiCampaignId} className="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white disabled:opacity-60">Load ROI</button>
          </div>
          {roi ? (
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 mt-3 text-xs">
              <Stat label="Impressions" value={roi.impressions} />
              <Stat label="Clicks" value={roi.clicks} />
              <Stat label="Conversions" value={roi.conversions} />
              <Stat label="Revenue" value={`৳${Number(roi.revenue || 0).toFixed(2)}`} />
              <Stat label="Cost" value={`৳${Number(roi.cost || 0).toFixed(2)}`} />
              <Stat label="ROI %" value={`${Number(roi.roi_percent || 0).toFixed(2)}%`} />
            </div>
          ) : (
            <p className="text-xs text-gray-500 mt-2">Select a campaign and load ROI.</p>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-[#151518] rounded-xl border border-gray-100 dark:border-[#26262d] p-5">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Users className="w-5 h-5" /> Sprint D Intelligence</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={loadAnalytics} disabled={running} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-60 inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Load Cohort/Funnel/LTV/Renewal Packs
          </button>
          <button onClick={runChurnCampaign} disabled={running} className="px-3 py-2 rounded-lg bg-rose-600 text-white text-sm disabled:opacity-60">
            Run Churn Campaign
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-gray-100 dark:border-[#26262d] p-3">
            <p className="text-sm font-semibold mb-2">Funnel (30d)</p>
            {funnel?.stages ? (
              <div className="text-xs space-y-1">
                <p>Store View: {funnel.stages.store_view}</p>
                <p>Checkout Start: {funnel.stages.checkout_start}</p>
                <p>Payment Init: {funnel.stages.payment_init}</p>
                <p>Paid: {funnel.stages.paid}</p>
                <p className="pt-1 font-semibold">Overall Conversion: {Number(funnel.conversion?.overall || 0).toFixed(2)}%</p>
              </div>
            ) : <p className="text-xs text-gray-500">Load analytics to view.</p>}
          </div>

          <div className="rounded-lg border border-gray-100 dark:border-[#26262d] p-3">
            <p className="text-sm font-semibold mb-2">Referral Wallet Loop</p>
            <input value={referralOrderId} onChange={(e) => setReferralOrderId(e.target.value)} placeholder="Completed order ID" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-sm mb-2" />
            <button onClick={processReferralByOrder} disabled={running} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-60">Process Referral For Order</button>
            <p className="text-[11px] text-gray-500 mt-2">Anti-fraud cap: per-order reward cap + daily referrer cap.</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-lg border border-gray-100 dark:border-[#26262d] p-3">
            <p className="text-sm font-semibold mb-2">Top LTV Users</p>
            <div className="space-y-1 max-h-44 overflow-auto text-xs">
              {ltvRows.slice(0, 10).map((r) => <p key={r.user_id}>{r.user_id.slice(0, 8)}... - ৳{Number(r.ltv).toFixed(2)}</p>)}
              {ltvRows.length === 0 && <p className="text-gray-500">No data loaded.</p>}
            </div>
          </div>
          <div className="rounded-lg border border-gray-100 dark:border-[#26262d] p-3">
            <p className="text-sm font-semibold mb-2">Cohort Retention</p>
            <div className="space-y-1 max-h-44 overflow-auto text-xs">
              {cohortRows.slice(0, 10).map((r) => <p key={r.cohort}>{r.cohort}: {Number(r.retention_30d_percent).toFixed(2)}% ({r.retained_30d}/{r.users})</p>)}
              {cohortRows.length === 0 && <p className="text-gray-500">No data loaded.</p>}
            </div>
          </div>
          <div className="rounded-lg border border-gray-100 dark:border-[#26262d] p-3">
            <p className="text-sm font-semibold mb-2">One-click Renewal Packs (7d)</p>
            <div className="space-y-1 max-h-44 overflow-auto text-xs">
              {renewalRows.slice(0, 10).map((r) => (
                <p key={r.order_id}>
                  {r.user_email || r.user_id.slice(0, 8)} - {r.product_title} ({r.days_left}d) - ৳{Number(r.suggested_price).toFixed(0)}
                </p>
              ))}
              {renewalRows.length === 0 && <p className="text-gray-500">No packs loaded.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: any }) => (
  <div className="rounded-md border border-gray-100 dark:border-[#26262d] p-2">
    <p className="text-[10px] text-gray-500">{label}</p>
    <p className="text-sm font-semibold">{value}</p>
  </div>
);

