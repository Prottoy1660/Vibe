import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getApiBaseUrl } from '../../lib/apiBase';
import { getAccessTokenForApi } from '../../lib/getAccessTokenForApi';
import {
  Loader2,
  Mail,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Server,
  Download,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Calendar,
  Users,
  Lock,
  CircleDashed,
  Sparkles,
  Info,
  LayoutDashboard,
  Wand2,
  Table2,
} from 'lucide-react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';

interface EmailPool {
  id: string;
  email: string;
  password: string;
  status: 'available' | 'assigned' | 'shared' | 'used';
  is_burned?: boolean | null;
  created_at: string;
  assigned_at: string | null;
  current_users?: number;
  product_id?: string | null;
  cloud_access_type?: 'none' | 'api' | 'manual';
  products?: {
    title: string;
    max_users_per_email: number;
  } | null;
}

function groupByDate(emails: EmailPool[]): Record<string, EmailPool[]> {
  const groups: Record<string, EmailPool[]> = {};
  for (const email of emails) {
    const d = parseISO(email.created_at);
    let label: string;
    if (isToday(d)) label = `Today — ${format(d, 'MMMM d, yyyy')}`;
    else if (isYesterday(d)) label = `Yesterday — ${format(d, 'MMMM d, yyyy')}`;
    else label = `${format(d, 'EEEE, MMMM d, yyyy')}`;
    if (!groups[label]) groups[label] = [];
    groups[label].push(email);
  }
  return groups;
}

type TabId = 'overview' | 'generate' | 'inventory';

export const AdminEmails = () => {
  const [emails, setEmails] = useState<EmailPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId | 'burned'>('overview');
  const [unfulfilledCount, setUnfulfilledCount] = useState(0);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});
  const [assigningBulk, setAssigningBulk] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [genCount, setGenCount] = useState(5);
  const [genDomain, setGenDomain] = useState('vibeaccess.space');
  const [genPrefix, setGenPrefix] = useState('adobe');
  const [genCloudAccess, setGenCloudAccess] = useState<'none' | 'api'>('none');
  const [genDuration, setGenDuration] = useState(1);

  useEffect(() => {
    fetchEmails();
    fetchUnfulfilledCount();
  }, []);

  const fetchUnfulfilledCount = async () => {
    try {
      const { data } = await supabase
        .from('orders')
        .select('id, products!inner(is_personal), user_emails(id)')
        .in('status', ['paid', 'completed'])
        .eq('payment_status', 'paid')
        .eq('products.is_personal', false);
      
      if (data) {
        const missing = data.filter((o: any) => !o.user_emails || o.user_emails.length === 0);
        setUnfulfilledCount(missing.length);
      }
    } catch {}
  };

  const fetchEmails = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('emails_pool')
        .select('*, products(title, max_users_per_email)')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      setEmails(data || []);
    } catch (error) {
      console.error('Error fetching emails:', error);
    } finally {
      setLoading(false);
    }
  };

  const togglePasswordVisibility = (id: string) =>
    setShowPasswords((prev) => ({ ...prev, [id]: !prev[id] }));

  const toggleDateCollapse = (label: string) =>
    setCollapsedDates((prev) => ({ ...prev, [label]: !prev[label] }));

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleDelete = async (id: string, status: string) => {
    if (status !== 'available') {
      if (!window.confirm(`This email is '${status}'. Deleting might affect user access. Continue?`)) return;
    } else {
      if (!window.confirm('Delete this email from the pool?')) return;
    }
    try {
      const { error } = await supabase.from('emails_pool').delete().eq('id', id);
      if (error) throw error;
      setEmails((prev) => prev.filter((e) => e.id !== id));
    } catch {
      alert('Failed to delete email');
    }
  };

  const handleDeleteAll = async () => {
    if (
      !window.confirm(
        `Delete ALL ${emails.length} emails from the pool? This cannot be undone and may break active subscriptions.`
      )
    )
      return;
    setDeletingAll(true);
    try {
      await supabase.from('emails_pool').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      setEmails([]);
    } catch {
      alert('Failed to delete all emails');
    } finally {
      setDeletingAll(false);
    }
  };

  const handleExportCSV = () => {
    if (!emails.length) return;
    const rows = emails.map((e) =>
      [
        e.email,
        e.password,
        e.status,
        format(parseISO(e.created_at), 'yyyy-MM-dd HH:mm'),
        e.assigned_at ? format(parseISO(e.assigned_at), 'yyyy-MM-dd HH:mm') : '',
      ].join(',')
    );
    const csv = ['Email,Password,Status,Created At,Assigned At', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `email_inventory_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyDateGroup = (group: EmailPool[]) => {
    const text = group.map((e) => `${e.email} | ${e.password} | ${e.status}`).join('\n');
    navigator.clipboard.writeText(text);
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let pass = '';
    for (let i = 0; i < 12; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
    return pass;
  };

  const handleBulkAssign = async () => {
    if (!window.confirm('Attempt to assign matching emails to ALL unfulfilled paid orders?')) return;
    setAssigningBulk(true);
    try {
      const token = await getAccessTokenForApi();
      if (!token) {
        alert('Session expired. Please sign in again.');
        return;
      }
      const API_URL = getApiBaseUrl();
      const res = await fetch(`${API_URL}/api/payment/bulk-assign-emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchEmails();
        fetchUnfulfilledCount();
      } else {
        alert(data.message || 'Failed to bulk assign emails.');
      }
    } catch (err) {
      console.error(err);
      alert('Server error during bulk assign.');
    } finally {
      setAssigningBulk(false);
    }
  };

  const handleAutoGenerate = async () => {
    if (!genPrefix || !genDomain) {
      alert('Prefix and domain are required.');
      return;
    }
    if (genCount < 1 || genCount > 50) {
      alert('Generate between 1 and 50 emails.');
      return;
    }
    if (!window.confirm(`Generate ${genCount} addresses?\nFormat: ${genPrefix}.xxxx@${genDomain}`)) return;

    setGenerating(true);
    try {
      const newAccounts = Array.from({ length: genCount }, () => ({
        email: `${genPrefix}.${Math.random().toString(36).substring(2, 6)}@${genDomain}`,
        password: generateRandomPassword(),
        status: 'available',
        cloud_access_type: genCloudAccess,
      }));

      const API_URL = getApiBaseUrl();
      const token = await getAccessTokenForApi();
      if (!token) {
        alert('Session expired. Please sign in again.');
        return;
      }
      const response = await fetch(`${API_URL}/api/cpanel/create-emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ accounts: newAccounts, cloudAccess: genCloudAccess, durationMonths: genDuration }),
      });

      const text = await response.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(text || 'cPanel creation failed with a non-JSON response');
      }

      if (!response.ok) throw new Error(data.error || 'cPanel creation failed');

      const { error } = await supabase.from('emails_pool').insert(newAccounts);
      if (error) throw error;

      alert(`${genCount} emails created and saved.`);
      fetchEmails();
      setActiveTab('inventory');
    } catch (error: any) {
      alert(`Failed: ${error.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleUpdateCloudAccess = async (id: string, currentStatus: string) => {
    const normalizedCurrentStatus = currentStatus === 'manual' ? 'api' : currentStatus || 'none';
    const newStatus = prompt('Update cloud access (none or api):', normalizedCurrentStatus);
    if (!newStatus || !['none', 'api'].includes(newStatus)) {
      if (newStatus) alert('Invalid status. Use none or api.');
      return;
    }

    try {
      const { error } = await supabase.from('emails_pool').update({ cloud_access_type: newStatus }).eq('id', id);
      if (error) throw error;
      setEmails((prev) =>
        prev.map((e) => (e.id === id ? { ...e, cloud_access_type: newStatus as any } : e))
      );
    } catch (err: any) {
      alert(`Failed to update: ${err.message}`);
    }
  };

  const burnedEmails = emails.filter((e) => e.is_burned);
  const activeEmails = emails.filter((e) => !e.is_burned);
  const availableCount = activeEmails.filter((e) => e.status === 'available').length;
  const assignedCount = activeEmails.filter((e) => e.status === 'assigned' || e.status === 'shared').length;
  const todayCount = activeEmails.filter((e) => isToday(parseISO(e.created_at))).length;
  const grouped = groupByDate(activeEmails);

  const statusStyles: Record<string, string> = {
    available: 'bg-green-100 dark:bg-emerald-500/10 text-green-700 dark:text-emerald-300',
    assigned: 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300',
    shared: 'bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300',
    used: 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300',
  };

  const tabs: { id: TabId | 'burned'; label: string; sub: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', sub: 'Stats & exports', icon: LayoutDashboard },
    { id: 'generate', label: 'Add emails', sub: 'cPanel generator', icon: Wand2 },
    { id: 'inventory', label: 'Inventory', sub: 'Browse & manage', icon: Table2 },
    { id: 'burned', label: 'Burned', sub: 'Expired / banned', icon: Trash2 },
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
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Email inventory</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
                Check pool health on Overview, create accounts with the cPanel generator, then review rows under
                Inventory. Each tab focuses on one task so the screen stays scannable.
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

      {/* Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total in pool"
              value={loading ? null : emails.length}
              icon={Mail}
              loading={loading}
            />
            <StatCard
              label="Available"
              value={loading ? null : availableCount}
              icon={CheckCircle2}
              accent="emerald"
              loading={loading}
            />
            <StatCard
              label="In use"
              value={loading ? null : assignedCount}
              icon={AlertCircle}
              accent="blue"
              loading={loading}
            />
            <StatCard
              label="Added today"
              value={loading ? null : todayCount}
              icon={Calendar}
              accent="violet"
              loading={loading}
            />
          </div>

          <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 md:p-6">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide mb-4">
              Quick actions
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <ActionExplain
                title="Refresh data"
                description="Reload the latest 500 rows from the pool. Use this after changes elsewhere."
                button={
                  <button
                    type="button"
                    onClick={fetchEmails}
                    disabled={loading}
                    className="w-full py-2.5 rounded-xl border border-gray-200 dark:border-[#303038] text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 inline-flex items-center justify-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                }
              />
              <ActionExplain
                title="Export CSV"
                description="Download all loaded rows with passwords for backup or spreadsheets."
                button={
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    disabled={!emails.length || loading}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Export CSV
                  </button>
                }
              />
              <ActionExplain
                title="Delete entire pool"
                description="Removes every email row. Dangerous if customers rely on assigned addresses."
                button={
                  <button
                    type="button"
                    onClick={handleDeleteAll}
                    disabled={deletingAll || !emails.length || loading}
                    className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2"
                  >
                    {deletingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Delete all
                  </button>
                }
              />
              <ActionExplain
                title="Fulfill Orders"
                description="Assign emails to paid orders that missed out because inventory was empty."
                button={
                  <button
                    type="button"
                    onClick={handleBulkAssign}
                    disabled={assigningBulk || loading || unfulfilledCount === 0}
                    className={`w-full py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2 ${
                      unfulfilledCount > 0
                        ? 'bg-orange-500 hover:bg-orange-600 shadow-[0_0_15px_-3px_rgba(249,115,22,0.4)] animate-pulse'
                        : 'bg-indigo-600 hover:bg-indigo-700'
                    }`}
                  >
                    {assigningBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Fulfill Missing
                    {unfulfilledCount > 0 && (
                      <span className="bg-white/20 text-white px-2 py-0.5 rounded-full text-xs font-bold tabular-nums">
                        {unfulfilledCount}
                      </span>
                    )}
                  </button>
                }
              />
            </div>
            <p className="flex items-start gap-2 text-xs text-gray-500 mt-4">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />
              To add addresses, open the &quot;Add emails&quot; tab. To copy or delete individual rows, use
              &quot;Inventory&quot;.
            </p>
          </div>
        </div>
      )}

      {/* Generator */}
      {activeTab === 'generate' && (
        <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 md:p-6 shadow-sm">
          <div className="flex items-start gap-3 mb-6">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 text-sm font-bold dark:bg-indigo-500/20 dark:text-indigo-300">
              1
            </span>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Server className="w-5 h-5 text-indigo-500" />
                cPanel auto generator
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
                Creates mailbox-style addresses via your API, then inserts them into the pool as{' '}
                <span className="font-medium">available</span>. Confirm the prefix and domain match your cPanel setup.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-indigo-100 dark:border-indigo-500/20 bg-indigo-50/40 dark:bg-[#111113] p-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="Prefix" hint="Local part before the random segment">
                <input
                  type="text"
                  value={genPrefix}
                  onChange={(e) => setGenPrefix(e.target.value)}
                  className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl text-sm bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100"
                  placeholder="adobe"
                />
              </Field>
              <Field label="Domain" hint="Full domain for new mailboxes">
                <input
                  type="text"
                  value={genDomain}
                  onChange={(e) => setGenDomain(e.target.value)}
                  className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl text-sm bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100"
                  placeholder="example.com"
                />
              </Field>
              <Field label="Count" hint="Between 1 and 50">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={genCount}
                  onChange={(e) => setGenCount(parseInt(e.target.value, 10) || 1)}
                  className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl text-sm bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100"
                />
              </Field>
              <Field label="Cloud access" hint="Provisioning behavior for Adobe / API">
                <select
                  value={genCloudAccess}
                  onChange={(e) => setGenCloudAccess(e.target.value as 'none' | 'api')}
                  className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl text-sm bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100"
                >
                  <option value="none">No access</option>
                  <option value="api">Auto API access</option>
                </select>
              </Field>
              <Field label="Duration (months)" hint="Only used when cloud access is API">
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={genDuration}
                  onChange={(e) => setGenDuration(parseInt(e.target.value, 10) || 1)}
                  disabled={genCloudAccess !== 'api'}
                  className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl text-sm bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100 disabled:opacity-50"
                />
              </Field>
            </div>

            <button
              type="button"
              onClick={handleAutoGenerate}
              disabled={generating}
              className="w-full sm:w-auto px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Generate &amp; save to pool
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Inventory */}
      {activeTab === 'inventory' && (
        <div className="space-y-4">
          {loading && emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-gray-200 dark:border-[#303038]">
              <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-3" />
              <p className="text-sm text-gray-500">Loading inventory…</p>
            </div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="bg-white dark:bg-[#151518] rounded-2xl border border-gray-100 dark:border-[#26262d] py-16 text-center">
              <Mail className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
              <p className="text-gray-600 dark:text-gray-400 font-medium">No emails in the pool yet</p>
              <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                Use <span className="font-semibold">Add emails</span> to create accounts, then return here to browse them.
              </p>
            </div>
          ) : (
            Object.entries(grouped).map(([dateLabel, group]) => {
              const isCollapsed = collapsedDates[dateLabel];
              const isGroupToday = dateLabel.startsWith('Today');
              return (
                <div
                  key={dateLabel}
                  className="bg-white dark:bg-[#151518] rounded-2xl border border-gray-100 dark:border-[#26262d] overflow-hidden shadow-sm dark:shadow-none"
                >
                  <div
                    className={`flex items-center justify-between px-5 py-3.5 cursor-pointer select-none ${
                      isGroupToday
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 border-b border-emerald-100 dark:border-emerald-500/20'
                        : 'bg-gray-50 dark:bg-white/5 border-b border-gray-100 dark:border-[#26262d]'
                    }`}
                    onClick={() => toggleDateCollapse(dateLabel)}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <Calendar
                        className={`w-4 h-4 ${isGroupToday ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}
                      />
                      <span
                        className={`text-sm font-bold ${isGroupToday ? 'text-emerald-800 dark:text-emerald-200' : 'text-gray-700 dark:text-gray-300'}`}
                      >
                        {dateLabel}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                          isGroupToday
                            ? 'bg-emerald-200 dark:bg-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                            : 'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {group.length} emails
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyDateGroup(group);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg"
                      >
                        <Copy className="w-3 h-3" /> Copy all
                      </button>
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {!isCollapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/5">
                            <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">#</th>
                            <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                              Email
                            </th>
                            <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                              Password
                            </th>
                            <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                              Status
                            </th>
                            <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                              Cloud
                            </th>
                            <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                              Capacity
                            </th>
                            <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                              Time
                            </th>
                            <th className="py-3 px-4 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.map((email, idx) => (
                            <tr
                              key={email.id}
                              className="border-b border-gray-50 dark:border-white/[0.03] hover:bg-gray-50/60 dark:hover:bg-white/[0.02]"
                            >
                              <td className="py-2.5 px-4 text-xs text-gray-400">{idx + 1}</td>
                              <td className="py-2.5 px-4">
                                <div className="flex items-center gap-2 min-w-[12rem]">
                                  <span className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">
                                    {email.email}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => copyText(email.email, `e-${email.id}`)}
                                    className="text-gray-400 hover:text-indigo-500"
                                    title="Copy email"
                                  >
                                    {copiedId === `e-${email.id}` ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                              </td>
                              <td className="py-2.5 px-4">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/10 px-2 py-0.5 rounded">
                                    {showPasswords[email.id] ? email.password : '••••••••'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => togglePasswordVisibility(email.id)}
                                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                  >
                                    {showPasswords[email.id] ? (
                                      <EyeOff className="w-3.5 h-3.5" />
                                    ) : (
                                      <Eye className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                  {showPasswords[email.id] && (
                                    <button
                                      type="button"
                                      onClick={() => copyText(email.password, `p-${email.id}`)}
                                      className="text-gray-400 hover:text-indigo-500"
                                    >
                                      {copiedId === `p-${email.id}` ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-4">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${statusStyles[email.status] || statusStyles.used}`}
                                >
                                  {email.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-4">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateCloudAccess(email.id, email.cloud_access_type || 'none')}
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                                    email.cloud_access_type === 'api' || email.cloud_access_type === 'manual'
                                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300 border border-blue-200 dark:border-blue-500/20'
                                      : 'bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400 border border-gray-200 dark:border-[#303038]'
                                  }`}
                                >
                                  {(email.cloud_access_type === 'manual' ? 'api' : email.cloud_access_type) || 'none'}
                                </button>
                              </td>
                              <td className="py-2.5 px-4">
                                {email.status === 'available' && !email.product_id ? (
                                  <div className="flex items-center gap-1.5 text-gray-400 text-xs font-medium">
                                    <CircleDashed className="w-3.5 h-3.5" /> Empty
                                  </div>
                                ) : email.products?.max_users_per_email === 1 ? (
                                  <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-500 text-xs font-semibold bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-100 dark:border-amber-500/20 max-w-max">
                                    <Lock className="w-3 h-3" /> Private (1/1)
                                  </div>
                                ) : email.products?.max_users_per_email && email.products.max_users_per_email > 1 ? (
                                  <div
                                    className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full border max-w-max ${
                                      (email.current_users || 0) >= email.products.max_users_per_email
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300'
                                        : 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300'
                                    }`}
                                  >
                                    <Users className="w-3 h-3" />
                                    {email.current_users || 0} / {email.products.max_users_per_email}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 text-gray-400 text-xs font-medium">
                                    <CircleDashed className="w-3.5 h-3.5" /> Unknown
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-4 text-xs text-gray-400">
                                {format(parseISO(email.created_at), 'HH:mm')}
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleDelete(email.id, email.status)}
                                  className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Burned / discarded inventory */}
      {activeTab === 'burned' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-red-100 dark:border-red-900/40 bg-red-50/60 dark:bg-red-950/20 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-900 dark:text-red-100">
                  Burned / discarded Adobe emails
                </p>
                <p className="text-xs text-red-800/80 dark:text-red-200/90 mt-0.5 max-w-2xl">
                  These inboxes are no longer assigned to customers. Export them for Adobe removal, or delete mailbox +
                  row once fully revoked from cloud.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!burnedEmails.length) return;
                const rows = burnedEmails.map((e) => [e.email, e.password, e.status].join(','));
                const csv = ['Email,Password,Status', ...rows].join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `burned_emails_${format(new Date(), 'yyyy-MM-dd')}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              disabled={!burnedEmails.length}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-40"
            >
              <Download className="w-4 h-4" />
              Export burned CSV
            </button>
          </div>

          {burnedEmails.length === 0 ? (
            <div className="bg-white dark:bg-[#151518] rounded-2xl border border-dashed border-gray-200 dark:border-[#303038] py-14 text-center">
              <Trash2 className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
              <p className="text-gray-700 dark:text-gray-300 font-medium">No burned emails yet</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto">
                Once subscriptions fully expire, burned inboxes will show up here for removal from Adobe and cPanel.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto bg-white dark:bg-[#151518] rounded-2xl border border-gray-100 dark:border-[#26262d]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/5">
                    <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      Password
                    </th>
                    <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="py-3 px-4 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {burnedEmails.map((email) => (
                    <tr
                      key={email.id}
                      className="border-b border-gray-50 dark:border-white/[0.03] hover:bg-red-50/40 dark:hover:bg-red-500/5"
                    >
                      <td className="py-2.5 px-4">
                        <span className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {email.email}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="font-mono text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/10 px-2 py-0.5 rounded">
                          {email.password}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold capitalize bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-300">
                          burned
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-xs text-gray-400">
                        {format(parseISO(email.created_at), 'yyyy-MM-dd HH:mm')}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={async () => {
                            if (
                              !window.confirm(
                                `Permanently remove ${email.email} from the system and cPanel? This cannot be undone.`
                              )
                            )
                              return;
                            try {
                              const token = await getAccessTokenForApi();
                              if (!token) {
                                alert('Session expired. Please sign in again.');
                                return;
                              }
                              const API_URL = getApiBaseUrl();
                              const res = await fetch(`${API_URL}/api/cpanel/delete-email`, {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                  Authorization: `Bearer ${token}`,
                                },
                                body: JSON.stringify({ email: email.email }),
                              });
                              const out = await res.json();
                              if (!res.ok || !out.success) {
                                throw new Error(out.error || 'Failed to delete email');
                              }
                              setEmails((prev) => prev.filter((e) => e.id !== email.id));
                              alert('Mailbox and database row deleted.');
                            } catch (err: any) {
                              alert(err.message || 'Failed to delete burned email');
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete from system &amp; cPanel
                        </button>
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

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  loading,
}: {
  label: string;
  value: number | null;
  icon: React.ElementType;
  accent?: 'emerald' | 'blue' | 'violet';
  loading: boolean;
}) {
  const ring =
    accent === 'emerald'
      ? 'border-emerald-200/80 dark:border-emerald-500/20'
      : accent === 'blue'
        ? 'border-blue-200/80 dark:border-blue-500/20'
        : accent === 'violet'
          ? 'border-violet-200/80 dark:border-violet-500/20'
          : 'border-gray-100 dark:border-[#26262d]';
  return (
    <div className={`rounded-xl border ${ring} bg-white dark:bg-[#151518] p-4`}>
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
        <Icon className="w-4 h-4" />
        {label}
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">
        {loading || value === null ? <Loader2 className="w-6 h-6 animate-spin text-indigo-500" /> : value}
      </p>
    </div>
  );
}

function ActionExplain({
  title,
  description,
  button,
}: {
  title: string;
  description: string;
  button: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-100 dark:border-[#26262d] bg-gray-50/40 dark:bg-white/5 p-4 flex flex-col">
      <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{title}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-4 flex-1 leading-relaxed">{description}</p>
      {button}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{label}</label>
      {children}
      <p className="text-[10px] text-gray-500 mt-1">{hint}</p>
    </div>
  );
}
