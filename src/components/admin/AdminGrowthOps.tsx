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
} from 'lucide-react';

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
    if (ids.length === 0) return alert('প্রথমে Order ID গুলো লিখুন / Add order IDs first');
    setRunning(true);
    try {
      const res = await adminRequest('/api/admin/ops/bulk/orders/status', 'POST', {
        order_ids: ids,
        new_status: newStatus,
      });
      alert(`আপডেট সম্পন্ন: ${res.updated} টি অর্ডার / Updated ${res.updated} orders`);
    } catch (e: any) {
      alert(e?.message || 'Bulk order update failed');
    } finally {
      setRunning(false);
    }
  };

  const runBulkNotices = async () => {
    const ids = parseLines(userIds);
    if (ids.length === 0) return alert('User ID গুলো লিখুন / Add user IDs first');
    if (!noticeTitle || !noticeBody) return alert('শিরোনাম ও বার্তা দিন / Title and message required');
    setRunning(true);
    try {
      const res = await adminRequest('/api/admin/ops/bulk/notices', 'POST', {
        user_ids: ids,
        title: noticeTitle,
        content: noticeBody,
        type: 'info',
      });
      alert(`নোটিশ কিউতে যোগ হয়েছে: ${res.queued} জন / Queued ${res.queued} notices`);
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
      alert(`রিনিউ অফার কিউতে: ${res.queued} টি / Queued ${res.queued} renewal offers`);
    } catch (e: any) {
      alert(e?.message || 'Bulk renew offers failed');
    } finally {
      setRunning(false);
    }
  };

  const createCampaign = async () => {
    if (!campaignName.trim()) return alert('ক্যাম্পেইনের নাম দিন / Campaign name required');
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
      alert('ক্যাম্পেইন তৈরি হয়েছে / Campaign created');
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
    if (!window.confirm('নিষ্ক্রিয় ইউজারদের চার্ন প্রিভেনশন মেসেজ কিউ করবেন?')) return;
    setRunning(true);
    try {
      const data = await adminRequest('/api/admin/ops/churn/run-campaign', 'POST', { days: 7, inactive_days: 14 });
      alert(`চার্ন ক্যাম্পেইন কিউ: ${data.queued} টি / Queued ${data.queued}`);
    } catch (e: any) {
      alert(e?.message || 'Churn campaign failed');
    } finally {
      setRunning(false);
    }
  };

  const processReferralByOrder = async () => {
    if (!referralOrderId.trim()) return alert('Order ID দিন / Order ID required');
    setRunning(true);
    try {
      const data = await adminRequest(`/api/admin/ops/referral/process-order/${encodeURIComponent(referralOrderId.trim())}`, 'POST', {});
      if (data.reward_amount) alert(`রেফারেল বোনাস: ৳${data.reward_amount} (উভয় পক্ষ) / Rewards granted`);
      else alert(`ফলাফল: ${data.skipped || 'done'}`);
    } catch (e: any) {
      alert(e?.message || 'Referral process failed');
    } finally {
      setRunning(false);
    }
  };

  const tabs: { id: TabId; label: string; labelBn: string; icon: React.ElementType }[] = [
    { id: 'bulk', label: 'Bulk actions', labelBn: 'একসাথে অ্যাকশন', icon: Layers3 },
    { id: 'campaigns', label: 'Campaigns', labelBn: 'ক্যাম্পেইন', icon: Megaphone },
    { id: 'insights', label: 'Insights', labelBn: 'রিপোর্ট ও অ্যানালিটিক্স', icon: LineChart },
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
      {/* Hero */}
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
                <span className="font-medium text-gray-800 dark:text-gray-200">বাংলা:</span> বড় অপারেশন, ক্যাম্পেইন ও রিপোর্ট—এক জায়গায়। নিচের ট্যাবে ভাগ করে ধাপে ধাপে ব্যবহার করুন।
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                English: Bulk tools, campaigns, and analytics—in tabs so it stays simple.
              </p>
            </div>
          </div>
        </div>

        {/* Tab bar */}
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
                  <span className="block">{t.labelBn}</span>
                  <span className={`block text-[11px] font-normal ${isActive ? 'text-indigo-100' : 'text-gray-500'}`}>
                    {t.label}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB: Bulk */}
      {activeTab === 'bulk' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <SectionCard
            step={1}
            title="অর্ডার স্ট্যাটাস বদলান"
            titleEn="Change order status"
            hint="প্রতি লাইনে একটি Order ID। তারপর নতুন স্ট্যাটাস বেছে নিন।"
          >
            <textarea
              value={orderIds}
              onChange={(e) => setOrderIds(e.target.value)}
              placeholder="উদাহরণ:&#10;abc123...&#10;def456..."
              className="h-36 w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-[#26262d] bg-gray-50/80 dark:bg-[#111113] text-sm focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50 outline-none"
            />
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">নতুন স্ট্যাটাস / New status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] text-sm"
                >
                  <option value="pending">Pending — অপেক্ষমান</option>
                  <option value="paid">Paid — পরিশোধিত</option>
                  <option value="completed">Completed — সম্পন্ন</option>
                  <option value="cancelled">Cancelled — বাতিল</option>
                </select>
              </div>
              <button
                type="button"
                onClick={runBulkOrderStatus}
                disabled={running}
                className="shrink-0 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {running ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
                আপডেট করুন
              </button>
            </div>
          </SectionCard>

          <SectionCard
            step={2}
            title="ইউজারদের নোটিশ ও রিনিউ অফার"
            titleEn="Notices & renewal offers"
            hint="উপরের বক্সে User ID (প্রতি লাইনে একটি)। নোটিশের জন্য শিরোনাম+বার্তা দিন। রিনিউ অফারে User ID খালি রাখলে সিস্টেম স্বয়ংক্রিয়ভাবে উপযুক্ত ইউজার বেছে নেবে।"
          >
            <textarea
              value={userIds}
              onChange={(e) => setUserIds(e.target.value)}
              placeholder="User IDs (এক লাইনে একটি)..."
              className="h-28 w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-[#26262d] bg-gray-50/80 dark:bg-[#111113] text-sm focus:ring-2 focus:ring-indigo-500/40 outline-none"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">নোটিশ শিরোনাম</label>
                <input
                  value={noticeTitle}
                  onChange={(e) => setNoticeTitle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] text-sm"
                  placeholder="যেমন: সিস্টেম আপডেট"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">রিনিউ উইন্ডো (দিন)</label>
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
              <label className="block text-xs font-semibold text-gray-500 mb-1">নোটিশ বার্তা</label>
              <textarea
                value={noticeBody}
                onChange={(e) => setNoticeBody(e.target.value)}
                className="w-full h-24 px-4 py-3 rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] text-sm"
                placeholder="গ্রাহকদের যা দেখাতে চান..."
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={runBulkNotices}
                disabled={running}
                className="flex-1 px-4 py-2.5 rounded-xl border-2 border-indigo-500/40 text-indigo-700 dark:text-indigo-300 bg-indigo-50/80 dark:bg-indigo-500/10 font-semibold text-sm hover:bg-indigo-100/80 dark:hover:bg-indigo-500/20 disabled:opacity-50"
              >
                নোটিশ পাঠান
              </button>
              <button
                type="button"
                onClick={runRenewOffers}
                disabled={running}
                className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm disabled:opacity-50"
              >
                রিনিউ অফার কিউ
              </button>
            </div>
            <p className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-500">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />
              রিনিউ অফার: নির্বাচিত দিনের মধ্যে মেয়াদ শেষ হওয়ার কাছাকাছি অর্ডার টার্গেট করে।
            </p>
          </SectionCard>
        </div>
      )}

      {/* TAB: Campaigns */}
      {activeTab === 'campaigns' && (
        <div className="space-y-6">
          <SectionCard step={1} title="নতুন ক্যাম্পেইন" titleEn="Create campaign" hint="বাজেট শুধু ট্র্যাকিং/ROI হিসাবের জন্য—০ রাখতে পারেন।">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 mb-1">ক্যাম্পেইনের নাম</label>
                <input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="যেমন: মার্চ রিনিউ"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">ধরন / Type</label>
                <select
                  value={campaignType}
                  onChange={(e) => setCampaignType(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] text-sm"
                >
                  <option value="renewal">Renewal — নবায়ন</option>
                  <option value="referral">Referral — রেফারেল</option>
                  <option value="redeem">Redeem — রিডিম</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">বাজেট (৳)</label>
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
              ক্যাম্পেইন তৈরি করুন
            </button>
          </SectionCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5">
              <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-1">আপনার ক্যাম্পেইন তালিকা</h4>
              <p className="text-xs text-gray-500 mb-4">একটিতে ক্লিক করে ROI দেখুন।</p>
              {loadingCampaigns ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                </div>
              ) : (
                <ul className="space-y-2 max-h-64 overflow-y-auto">
                  {campaigns.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setRoiCampaignId(c.id)}
                        className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
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
                    </li>
                  ))}
                  {campaigns.length === 0 && <p className="text-sm text-gray-500 text-center py-8">এখনো কোনো ক্যাম্পেইন নেই।</p>}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-500" />
                  <div>
                    <h4 className="font-bold text-gray-900 dark:text-gray-100">ROI রিপোর্ট</h4>
                    <p className="text-xs text-gray-500">ইভেন্ট ট্র্যাক হলে সংখ্যা ভরবে।</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={loadRoi}
                  disabled={running || !roiCampaignId}
                  className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50"
                >
                  লোড করুন
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
                <p className="text-sm text-gray-500 py-8 text-center">বাম থেকে একটি ক্যাম্পেইন বেছে নিয়ে ROI লোড করুন।</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: Insights */}
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
              সব ডেটা লোড করুন
            </button>
            <button
              type="button"
              onClick={runChurnCampaign}
              disabled={running}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-rose-400/50 text-rose-700 dark:text-rose-300 bg-rose-50/50 dark:bg-rose-500/10 font-semibold text-sm hover:bg-rose-100/50 disabled:opacity-50"
            >
              চার্ন প্রিভেনশন রান
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5">
              <h4 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-1">
                <Users className="w-5 h-5 text-violet-500" />
                ফানেল (৩০ দিন)
              </h4>
              <p className="text-xs text-gray-500 mb-4">স্টোর ভিউ → চেকআউট → পেমেন্ট → পেইড</p>
              {funnel?.stages ? (
                <div className="space-y-3">
                  {[
                    { key: 'store_view', label: 'স্টোর ভিউ', v: funnel.stages.store_view },
                    { key: 'checkout_start', label: 'চেকআউট শুরু', v: funnel.stages.checkout_start },
                    { key: 'payment_init', label: 'পেমেন্ট শুরু', v: funnel.stages.payment_init },
                    { key: 'paid', label: 'পরিশোধ সম্পন্ন', v: funnel.stages.paid },
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
                    মোট কনভার্সন: {Number(funnel.conversion?.overall || 0).toFixed(2)}%
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-500">উপরে &quot;সব ডেটা লোড&quot; চাপুন।</p>
              )}
            </div>

            <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5">
              <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-1">রেফারেল প্রসেস</h4>
              <p className="text-xs text-gray-500 mb-3">সম্পন্ন অর্ডারের ID দিন—রেফারার ও রেফারি উভয়ের ওয়ালেটে বোনাস (লিমিট সহ)।</p>
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
                রেফারেল প্রসেস করুন
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InsightList title="টপ LTV" subtitle="সর্বোচ্চ খরচকারী ইউজার" rows={ltvRows} empty="ডেটা লোড করুন" render={(r) => `${r.user_id.slice(0, 8)}… · ৳${Number(r.ltv).toFixed(0)}`} />
            <InsightList
              title="কোহর্ট রিটেনশন"
              subtitle="৩০ দিনে ফিরে আসা"
              rows={cohortRows}
              empty="ডেটা লোড করুন"
              render={(r) => `${r.cohort}: ${Number(r.retention_30d_percent).toFixed(1)}%`}
            />
            <InsightList
              title="রিনিউ প্যাক (৭ দিন)"
              subtitle="শীঘ্র মেয়াদ শেষ"
              rows={renewalRows}
              empty="ডেটা লোড করুন"
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
  titleEn,
  hint,
  children,
}: {
  step: number;
  title: string;
  titleEn: string;
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
          <p className="text-xs text-gray-500">{titleEn}</p>
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
