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
  Building2,
  Plus,
} from 'lucide-react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

interface EmailTeam {
  id: string;
  name: string;
  note?: string | null;
  created_at?: string;
}

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
  team_id?: string | null;
  slot_intent?: 'exclusive' | 'shared' | null;
  products?: {
    title: string;
    max_users_per_email: number;
  } | null;
  email_teams?: { name: string } | null;
}

interface TeamDetailUserEmail {
  id: string;
  assigned_at: string;
  is_active: boolean;
  order_id: string | null;
  users: { id: string; name: string; email: string } | null;
  orders: { status: string } | null;
}

interface TeamDetailPoolRow {
  id: string;
  email: string;
  password: string;
  status: string;
  assigned_at: string | null;
  created_at: string;
  slot_intent: string | null;
  current_users?: number | null;
  is_burned?: boolean | null;
  products: { title: string } | null;
  user_emails: TeamDetailUserEmail[] | null;
}

interface FlatTeamAssignmentRow {
  poolId: string;
  poolEmail: string;
  password: string;
  poolStatus: string;
  productTitle: string;
  slotIntent: string;
  poolCreatedAt: string;
  poolAssignedAt: string;
  userName: string;
  userEmail: string;
  assignmentAt: string;
  assignmentActive: boolean;
  orderStatus: string;
  userEmailRowId: string;
}

function flattenTeamAssignments(rows: TeamDetailPoolRow[]): FlatTeamAssignmentRow[] {
  const out: FlatTeamAssignmentRow[] = [];
  for (const r of rows) {
    const ues = r.user_emails?.length ? r.user_emails : [];
    const productTitle = r.products?.title || '';
    const base = {
      poolId: r.id,
      poolEmail: r.email,
      password: r.password,
      poolStatus: r.status,
      productTitle,
      slotIntent: r.slot_intent || '',
      poolCreatedAt: r.created_at,
      poolAssignedAt: r.assigned_at || '',
    };
    if (ues.length === 0) {
      out.push({
        ...base,
        userName: '',
        userEmail: '',
        assignmentAt: '',
        assignmentActive: false,
        orderStatus: '',
        userEmailRowId: `unassigned-${r.id}`,
      });
    } else {
      for (const ue of ues) {
        out.push({
          ...base,
          userName: ue.users?.name || '',
          userEmail: ue.users?.email || '',
          assignmentAt: ue.assigned_at || '',
          assignmentActive: ue.is_active,
          orderStatus: ue.orders?.status || '',
          userEmailRowId: ue.id,
        });
      }
    }
  }
  return out;
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

type TabId = 'overview' | 'teams' | 'generate' | 'inventory';

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
  const [teams, setTeams] = useState<EmailTeam[]>([]);
  const [genSlotIntent, setGenSlotIntent] = useState<'exclusive' | 'shared'>('exclusive');
  const [genTeamId, setGenTeamId] = useState<string>('');
  const [teamsTabName, setTeamsTabName] = useState('');
  const [savingTeam, setSavingTeam] = useState(false);
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);
  const [inventoryTeamFilter, setInventoryTeamFilter] = useState<string>('');
  const [detailTeamId, setDetailTeamId] = useState<string | null>(null);
  const [teamDetailRaw, setTeamDetailRaw] = useState<TeamDetailPoolRow[]>([]);
  const [teamDetailLoading, setTeamDetailLoading] = useState(false);
  const [teamDetailError, setTeamDetailError] = useState<string | null>(null);

  useEffect(() => {
    fetchEmails();
    fetchUnfulfilledCount();
    fetchTeams();
  }, []);

  useEffect(() => {
    if (!detailTeamId) {
      setTeamDetailRaw([]);
      setTeamDetailError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setTeamDetailLoading(true);
      setTeamDetailError(null);
      try {
        const { data, error } = await supabase
          .from('emails_pool')
          .select(
            `
            id,
            email,
            password,
            status,
            assigned_at,
            created_at,
            slot_intent,
            current_users,
            is_burned,
            products:product_id (title),
            user_emails (
              id,
              assigned_at,
              is_active,
              order_id,
              users:user_id (id, name, email),
              orders:order_id (status)
            )
          `,
          )
          .eq('team_id', detailTeamId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        if (!cancelled) {
          const raw = (data || []) as Record<string, unknown>[];
          const normalized: TeamDetailPoolRow[] = raw.map((row) => {
            const r = row as Record<string, unknown>;
            const products = r.products;
            const prod =
              Array.isArray(products) && products[0] && typeof products[0] === 'object'
                ? (products[0] as { title?: string })
                : products && typeof products === 'object'
                  ? (products as { title?: string })
                  : null;
            const uesRaw = r.user_emails;
            const ues = Array.isArray(uesRaw) ? uesRaw : [];
            const user_emails: TeamDetailUserEmail[] = ues.map((ue: Record<string, unknown>) => {
              const u = ue.users;
              const users =
                Array.isArray(u) && u[0] && typeof u[0] === 'object'
                  ? (u[0] as { id: string; name: string; email: string })
                  : u && typeof u === 'object'
                    ? (u as { id: string; name: string; email: string })
                    : null;
              const o = ue.orders;
              const orders =
                Array.isArray(o) && o[0] && typeof o[0] === 'object'
                  ? (o[0] as { status: string })
                  : o && typeof o === 'object'
                    ? (o as { status: string })
                    : null;
              return {
                id: String(ue.id),
                assigned_at: String(ue.assigned_at || ''),
                is_active: Boolean(ue.is_active),
                order_id: (ue.order_id as string | null) ?? null,
                users,
                orders,
              };
            });
            return {
              id: String(r.id),
              email: String(r.email),
              password: String(r.password),
              status: String(r.status),
              assigned_at: (r.assigned_at as string | null) ?? null,
              created_at: String(r.created_at),
              slot_intent: (r.slot_intent as string | null) ?? null,
              current_users: (r.current_users as number | null) ?? null,
              is_burned: (r.is_burned as boolean | null) ?? null,
              products: prod && prod.title != null ? { title: String(prod.title) } : null,
              user_emails: user_emails.length ? user_emails : null,
            };
          });
          setTeamDetailRaw(normalized);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load team emails';
        if (!cancelled) {
          setTeamDetailError(msg);
          setTeamDetailRaw([]);
        }
      } finally {
        if (!cancelled) setTeamDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detailTeamId]);

  const fetchTeams = async () => {
    try {
      const { data, error } = await supabase.from('email_teams').select('id, name, note, created_at').order('name');
      if (error) throw error;
      setTeams(data || []);
    } catch (e) {
      console.error('email_teams:', e);
    }
  };

  const handleAddTeam = async () => {
    const name = teamsTabName.trim();
    if (!name) return;
    setSavingTeam(true);
    try {
      const { data, error } = await supabase
        .from('email_teams')
        .insert({ name })
        .select('id, name, created_at')
        .single();
      if (error) throw error;
      setTeams((prev) => [...prev, data as EmailTeam].sort((a, b) => a.name.localeCompare(b.name)));
      setTeamsTabName('');
    } catch (err: any) {
      alert(err?.message || 'Could not add team (duplicate name?)');
    } finally {
      setSavingTeam(false);
    }
  };

  const handleDeleteTeam = async (id: string) => {
    if (
      !window.confirm(
        'Delete this team? Generated emails that used this label will keep the mailbox; only the team tag is removed from those rows.',
      )
    ) {
      return;
    }
    setDeletingTeamId(id);
    try {
      const { error } = await supabase.from('email_teams').delete().eq('id', id);
      if (error) throw error;
      setTeams((prev) => prev.filter((t) => t.id !== id));
      if (genTeamId === id) setGenTeamId('');
      if (inventoryTeamFilter === id) setInventoryTeamFilter('');
      if (detailTeamId === id) setDetailTeamId(null);
    } catch (err: any) {
      alert(err?.message || 'Could not delete team');
    } finally {
      setDeletingTeamId(null);
    }
  };

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
        .select('*, products(title, max_users_per_email), email_teams:team_id(name)')
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
        e.slot_intent || '',
        e.email_teams?.name || '',
        format(parseISO(e.created_at), 'yyyy-MM-dd HH:mm'),
        e.assigned_at ? format(parseISO(e.assigned_at), 'yyyy-MM-dd HH:mm') : '',
      ].join(',')
    );
    const csv = ['Email,Password,Status,Slot intent,Team,Created At,Assigned At', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `email_inventory_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const teamDetailFlat = flattenTeamAssignments(teamDetailRaw);
  const detailTeamName = teams.find((t) => t.id === detailTeamId)?.name || 'team';

  const handleExportTeamDetailCsv = () => {
    if (!detailTeamId || teamDetailFlat.length === 0) return;
    const header =
      'Team,Pool email,Password,Pool status,Product,Slot intent,Pool created,Pool assigned,User name,User email,Assignment at,Assignment active,Order status';
    const rows = teamDetailFlat.map((r) =>
      [
        detailTeamName,
        r.poolEmail,
        r.password,
        r.poolStatus,
        r.productTitle,
        r.slotIntent,
        r.poolCreatedAt ? format(parseISO(r.poolCreatedAt), 'yyyy-MM-dd HH:mm') : '',
        r.poolAssignedAt ? format(parseISO(r.poolAssignedAt), 'yyyy-MM-dd HH:mm') : '',
        r.userName,
        r.userEmail,
        r.assignmentAt ? format(parseISO(r.assignmentAt), 'yyyy-MM-dd HH:mm') : '',
        r.assignmentActive ? 'yes' : 'no',
        r.orderStatus,
      ]
        .map((c) => escapeCsvField(String(c)))
        .join(','),
    );
    const csv = [header, ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safe = detailTeamName.replace(/[^\w\-]+/g, '_').slice(0, 80);
    a.download = `team_${safe}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleTeamDetail = (teamId: string) => {
    setDetailTeamId((prev) => (prev === teamId ? null : teamId));
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
    const teamLabel = teams.find((t) => t.id === genTeamId)?.name || '(no team)';
    const slotLabel = genSlotIntent === 'exclusive' ? 'Exclusive (1 user)' : 'Shared (2 users)';
    if (
      !window.confirm(
        `Generate ${genCount} addresses?\nFormat: ${genPrefix}.xxxx@${genDomain}\nSlot: ${slotLabel}\nTeam: ${teamLabel}`,
      )
    ) {
      return;
    }

    setGenerating(true);
    try {
      const newAccounts = Array.from({ length: genCount }, () => ({
        email: `${genPrefix}.${Math.random().toString(36).substring(2, 6)}@${genDomain}`,
        password: generateRandomPassword(),
        status: 'available',
        cloud_access_type: genCloudAccess,
        slot_intent: genSlotIntent,
        team_id: genTeamId || null,
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

      const apiResults: Array<{
        email: string;
        success: boolean;
        error?: string;
        adobeError?: string;
        adobeSuccess?: boolean;
      }> = Array.isArray(data.results) ? data.results : [];

      const rowsToInsert = newAccounts
        .map((acc, i) => {
          const r = apiResults[i];
          if (!r?.success) return null;
          let cloud: 'none' | 'api' = genCloudAccess;
          if (genCloudAccess === 'api' && r.adobeError) cloud = 'none';
          return { ...acc, cloud_access_type: cloud };
        })
        .filter(Boolean) as typeof newAccounts;

      if (rowsToInsert.length === 0) {
        const failed = apiResults.filter((r) => !r.success);
        const detail =
          failed.length > 0
            ? failed.map((r) => `${r.email}: ${r.error || 'cPanel failed'}`).join('\n')
            : 'No mailboxes were created.';
        throw new Error(`Nothing to save.\n${detail}`);
      }

      const { error } = await supabase.from('emails_pool').insert(rowsToInsert);
      if (error) throw error;

      const cpanelFailed = apiResults.filter((r) => !r.success);
      const adobeFailed = apiResults.filter((r) => r.success && r.adobeError);
      const adobeOk = apiResults.filter((r) => r.success && r.adobeSuccess);
      const summaryLines = [
        `cPanel: ${rowsToInsert.length} mailbox(es) created and saved to pool.`,
        cpanelFailed.length ? `cPanel failed (${cpanelFailed.length}): ${cpanelFailed.map((r) => r.email).join(', ')}` : '',
        genCloudAccess === 'api'
          ? `Adobe API: ${adobeOk.length} OK, ${adobeFailed.length} failed${
              data.adobeProvisioning ? ` (attempted ${data.adobeProvisioning.attempted})` : ''
            }.`
          : '',
        adobeFailed.length
          ? `Adobe errors:\n${adobeFailed.map((r) => `${r.email}: ${r.adobeError}`).join('\n')}`
          : '',
      ].filter(Boolean);

      alert(summaryLines.join('\n\n'));
      fetchEmails();
      fetchTeams();
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
  const filteredForInventory = activeEmails.filter((e) => {
    if (!inventoryTeamFilter) return true;
    if (inventoryTeamFilter === '__none__') return !e.team_id;
    return e.team_id === inventoryTeamFilter;
  });
  const availableCount = activeEmails.filter((e) => e.status === 'available').length;
  const assignedCount = activeEmails.filter((e) => e.status === 'assigned' || e.status === 'shared').length;
  const todayCount = activeEmails.filter((e) => isToday(parseISO(e.created_at))).length;
  const grouped = groupByDate(filteredForInventory);

  const statusStyles: Record<string, string> = {
    available: 'bg-green-100 dark:bg-emerald-500/10 text-green-700 dark:text-emerald-300',
    assigned: 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300',
    shared: 'bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300',
    used: 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300',
  };

  const tabs: { id: TabId | 'burned'; label: string; sub: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', sub: 'Stats & exports', icon: LayoutDashboard },
    { id: 'teams', label: 'Teams', sub: 'Names only', icon: Building2 },
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
                Add team names under <span className="font-medium">Teams</span>, generate mailboxes under{' '}
                <span className="font-medium">Add emails</span>, then browse <span className="font-medium">Inventory</span>.
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

      {/* Teams — names only; used when generating & filtering inventory */}
      {activeTab === 'teams' && (
        <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 md:p-6 shadow-sm">
          <div className="flex items-start gap-3 mb-6">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700 text-sm font-bold dark:bg-violet-500/20 dark:text-violet-300">
              <Building2 className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Teams &amp; organizations</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
                Only names are stored here (internal labels). When you generate emails, pick a team from the list — no
                need to type names on the generator screen. Click a team row to see which pool emails belong to it and
                which users they are assigned to; export that view as CSV below.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 max-w-2xl">
            <input
              type="text"
              value={teamsTabName}
              onChange={(e) => setTeamsTabName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleAddTeam();
                }
              }}
              placeholder="e.g. Team Alpha, Client Org"
              className="flex-1 min-w-0 p-3 border border-gray-200 dark:border-[#303038] rounded-xl text-sm bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100"
            />
            <button
              type="button"
              onClick={() => void handleAddTeam()}
              disabled={savingTeam || !teamsTabName.trim()}
              className="px-6 py-3 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 inline-flex items-center justify-center gap-2 shrink-0"
            >
              {savingTeam ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add team
            </button>
          </div>

          <div className="mt-8 overflow-x-auto rounded-xl border border-gray-100 dark:border-[#26262d]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/5">
                  <th className="py-3 px-2 w-10" aria-hidden />
                  <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider w-40">
                    Added
                  </th>
                  <th className="py-3 px-4 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {teams.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 px-4 text-center text-gray-500 dark:text-gray-400">
                      No teams yet. Enter a name above and click Add team.
                    </td>
                  </tr>
                ) : (
                  teams.map((t) => {
                    const open = detailTeamId === t.id;
                    return (
                      <tr
                        key={t.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleTeamDetail(t.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleTeamDetail(t.id);
                          }
                        }}
                        className={`border-b border-gray-50 dark:border-white/[0.03] cursor-pointer transition-colors ${
                          open
                            ? 'bg-indigo-50/80 dark:bg-indigo-500/10'
                            : 'hover:bg-gray-50/50 dark:hover:bg-white/[0.02]'
                        }`}
                      >
                        <td className="py-3 px-2 text-gray-400 align-middle">
                          <ChevronRight
                            className={`w-4 h-4 transition-transform shrink-0 ${open ? 'rotate-90 text-indigo-600 dark:text-indigo-400' : ''}`}
                            aria-hidden
                          />
                        </td>
                        <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">{t.name}</td>
                        <td className="py-3 px-4 text-xs text-gray-500">
                          {t.created_at ? format(parseISO(t.created_at), 'MMM d, yyyy HH:mm') : '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteTeam(t.id);
                            }}
                            disabled={deletingTeamId === t.id}
                            className="text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400 disabled:opacity-50"
                          >
                            {deletingTeamId === t.id ? '…' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {detailTeamId && (
            <div className="mt-6 rounded-xl border border-indigo-200/60 dark:border-indigo-500/25 bg-indigo-50/30 dark:bg-indigo-950/20 p-4 md:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                  <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    Emails in &ldquo;{detailTeamName}&rdquo;
                  </h4>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    Pool mailboxes linked to this team, and user assignments (one row per seat when shared).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleExportTeamDetailCsv()}
                  disabled={teamDetailLoading || teamDetailFlat.length === 0}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 shrink-0"
                >
                  {teamDetailLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Download CSV
                </button>
              </div>

              {teamDetailError && (
                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 mb-3">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {teamDetailError}
                </div>
              )}

              {teamDetailLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 py-8 justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                  Loading team emails…
                </div>
              )}

              {!teamDetailLoading && !teamDetailError && teamDetailFlat.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
                  No pool emails are tagged with this team yet.
                </p>
              )}

              {!teamDetailLoading && !teamDetailError && teamDetailFlat.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-gray-200/80 dark:border-[#303038] bg-white dark:bg-[#151518]">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/5">
                        <th className="py-2.5 px-3 font-bold text-gray-500 uppercase tracking-wider">Pool email</th>
                        <th className="py-2.5 px-3 font-bold text-gray-500 uppercase tracking-wider">Password</th>
                        <th className="py-2.5 px-3 font-bold text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="py-2.5 px-3 font-bold text-gray-500 uppercase tracking-wider">Product</th>
                        <th className="py-2.5 px-3 font-bold text-gray-500 uppercase tracking-wider">Slot</th>
                        <th className="py-2.5 px-3 font-bold text-gray-500 uppercase tracking-wider">User</th>
                        <th className="py-2.5 px-3 font-bold text-gray-500 uppercase tracking-wider">User email</th>
                        <th className="py-2.5 px-3 font-bold text-gray-500 uppercase tracking-wider">Assigned</th>
                        <th className="py-2.5 px-3 font-bold text-gray-500 uppercase tracking-wider">Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamDetailFlat.map((row) => (
                        <tr
                          key={`${row.poolId}-${row.userEmailRowId}`}
                          className="border-b border-gray-50 dark:border-white/[0.03] hover:bg-gray-50/40 dark:hover:bg-white/[0.02]"
                        >
                          <td className="py-2 px-3 font-mono text-[11px] font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                            {row.poolEmail}
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[10px] text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded max-w-[7rem] truncate">
                                {showPasswords[row.poolId] ? row.password : '••••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() => togglePasswordVisibility(row.poolId)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5"
                                title={showPasswords[row.poolId] ? 'Hide password' : 'Show password'}
                              >
                                {showPasswords[row.poolId] ? (
                                  <EyeOff className="w-3.5 h-3.5" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${statusStyles[row.poolStatus] || statusStyles.used}`}
                            >
                              {row.poolStatus}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-gray-700 dark:text-gray-300 max-w-[140px] truncate" title={row.productTitle}>
                            {row.productTitle || '—'}
                          </td>
                          <td className="py-2 px-3">
                            {row.slotIntent === 'shared' ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300">
                                Shared
                              </span>
                            ) : row.slotIntent === 'exclusive' ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
                                Exclusive
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-gray-800 dark:text-gray-200 max-w-[120px] truncate" title={row.userName}>
                            {row.userName || '—'}
                          </td>
                          <td className="py-2 px-3 font-mono text-[10px] text-gray-600 dark:text-gray-400 max-w-[160px] truncate">
                            {row.userEmail || '—'}
                          </td>
                          <td className="py-2 px-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                            {row.assignmentAt ? format(parseISO(row.assignmentAt), 'MMM d, HH:mm') : '—'}
                          </td>
                          <td className="py-2 px-3">
                            {row.userEmailRowId.startsWith('unassigned') ? (
                              <span className="text-gray-400">—</span>
                            ) : row.assignmentActive ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Yes</span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400 font-semibold">No</span>
                            )}
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
      )}

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-indigo-200/60 dark:border-indigo-500/25 pt-5">
              <Field
                label="Slot type (this batch)"
                hint="Exclusive = reserve for products with 1 user per email. Shared = for 2-user shared slots."
              >
                <select
                  value={genSlotIntent}
                  onChange={(e) => setGenSlotIntent(e.target.value as 'exclusive' | 'shared')}
                  className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl text-sm bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100"
                >
                  <option value="exclusive">Exclusive (1 user — solid)</option>
                  <option value="shared">Shared (2 users)</option>
                </select>
              </Field>
              <Field
                label="Team / organization (internal)"
                hint="Choose a team you created under the Teams tab. Add new names there — not here."
              >
                <select
                  value={genTeamId}
                  onChange={(e) => setGenTeamId(e.target.value)}
                  className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl text-sm bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100"
                >
                  <option value="">No team</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
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
          {!loading && activeEmails.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#151518] px-4 py-3">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Team filter
              </label>
              <select
                value={inventoryTeamFilter}
                onChange={(e) => setInventoryTeamFilter(e.target.value)}
                className="min-w-[180px] px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-[#303038] bg-gray-50 dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100"
              >
                <option value="">All teams</option>
                <option value="__none__">No team assigned</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <span className="text-xs text-gray-500">
                Showing {filteredForInventory.length} of {activeEmails.length} (non-burned)
              </span>
            </div>
          )}
          {loading && emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-gray-200 dark:border-[#303038]">
              <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-3" />
              <p className="text-sm text-gray-500">Loading inventory…</p>
            </div>
          ) : filteredForInventory.length === 0 && activeEmails.length > 0 ? (
            <div className="bg-white dark:bg-[#151518] rounded-2xl border border-amber-200/60 dark:border-amber-500/20 p-8 text-center">
              <p className="text-gray-800 dark:text-gray-200 font-medium">No emails match this team filter.</p>
              <p className="text-xs text-gray-500 mt-2">Change the team filter above or clear it to see all inventory.</p>
              <button
                type="button"
                onClick={() => setInventoryTeamFilter('')}
                className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-white/10 text-gray-800 dark:text-gray-200"
              >
                Show all teams
              </button>
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
                              Team
                            </th>
                            <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                              Intent
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
                              <td className="py-2.5 px-4 text-xs text-gray-700 dark:text-gray-300 max-w-[140px]">
                                {email.email_teams?.name ? (
                                  <span className="inline-flex items-center gap-1 font-medium truncate" title={email.email_teams.name}>
                                    <Building2 className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
                                    {email.email_teams.name}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                              <td className="py-2.5 px-4">
                                {email.slot_intent === 'shared' ? (
                                  <span className="inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300">
                                    Shared
                                  </span>
                                ) : email.slot_intent === 'exclusive' ? (
                                  <span className="inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
                                    Exclusive
                                  </span>
                                ) : (
                                  <span className="text-gray-400 text-xs">—</span>
                                )}
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
