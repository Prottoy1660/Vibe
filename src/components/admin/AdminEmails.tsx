import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Loader2, Mail, Trash2, Eye, EyeOff, CheckCircle2,
  AlertCircle, RefreshCw, Server, Download, Copy, Check,
  ChevronDown, ChevronRight, Calendar, Users, Lock, CircleDashed
} from 'lucide-react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';

interface EmailPool {
  id: string;
  email: string;
  password: string;
  status: 'available' | 'assigned' | 'shared' | 'used';
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

// Group emails by date label
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

export const AdminEmails = () => {
  const [emails, setEmails] = useState<EmailPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});

  // Generator state
  const [generating, setGenerating] = useState(false);
  const [genCount, setGenCount] = useState(5);
  const [genDomain, setGenDomain] = useState('vibeaccess.space');
  const [genPrefix, setGenPrefix] = useState('adobe');
  const [genCloudAccess, setGenCloudAccess] = useState<'none' | 'api'>('none');
  const [genDuration, setGenDuration] = useState(1);

  useEffect(() => { fetchEmails(); }, []);

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
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));

  const toggleDateCollapse = (label: string) =>
    setCollapsedDates(prev => ({ ...prev, [label]: !prev[label] }));

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
      setEmails(prev => prev.filter(e => e.id !== id));
    } catch (error) {
      alert('Failed to delete email');
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm(`⚠️ Delete ALL ${emails.length} emails from the pool? This cannot be undone and may break active subscriptions!`)) return;
    setDeletingAll(true);
    try {
      await supabase.from('emails_pool').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      setEmails([]);
    } catch (err) {
      alert('Failed to delete all emails');
    } finally {
      setDeletingAll(false);
    }
  };

  const handleExportCSV = () => {
    if (!emails.length) return;
    const rows = emails.map(e => [
      e.email,
      e.password,
      e.status,
      format(parseISO(e.created_at), 'yyyy-MM-dd HH:mm'),
      e.assigned_at ? format(parseISO(e.assigned_at), 'yyyy-MM-dd HH:mm') : ''
    ].join(','));
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
    const text = group.map(e => `${e.email} | ${e.password} | ${e.status}`).join('\n');
    navigator.clipboard.writeText(text);
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let pass = '';
    for (let i = 0; i < 12; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
    return pass;
  };

  const handleAutoGenerate = async () => {
    if (!genPrefix || !genDomain) { alert('Prefix and domain are required'); return; }
    if (genCount < 1 || genCount > 50) { alert('Generate between 1 and 50 emails'); return; }
    if (!window.confirm(`Generate ${genCount} emails?\nFormat: ${genPrefix}.xyz@${genDomain}`)) return;

    setGenerating(true);
    try {
      const newAccounts = Array.from({ length: genCount }, () => ({
        email: `${genPrefix}.${Math.random().toString(36).substring(2, 6)}@${genDomain}`,
        password: generateRandomPassword(),
        status: 'available',
        cloud_access_type: genCloudAccess
      }));

      const API_URL = import.meta.env.VITE_API_URL || '';
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${API_URL}/api/cpanel/create-emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ accounts: newAccounts, cloudAccess: genCloudAccess, durationMonths: genDuration })
      });
      
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (err) {
        throw new Error(text || 'cPanel creation failed with a non-JSON response');
      }

      if (!response.ok) throw new Error(data.error || 'cPanel creation failed');

      const { error } = await supabase.from('emails_pool').insert(newAccounts);
      if (error) throw error;

      alert(`✅ ${genCount} emails created and saved!`);
      fetchEmails();
    } catch (error: any) {
      alert(`Failed: ${error.message}`);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;

  const availableCount = emails.filter(e => e.status === 'available').length;
  const assignedCount = emails.filter(e => e.status === 'assigned' || e.status === 'shared').length;

  // Today's count for quick stats
  const todayCount = emails.filter(e => isToday(parseISO(e.created_at))).length;

  const grouped = groupByDate(emails);

  const handleUpdateCloudAccess = async (id: string, currentStatus: string) => {
    const normalizedCurrentStatus = currentStatus === 'manual' ? 'api' : currentStatus || 'none';
    const newStatus = prompt('Update Cloud Access Status (none, api):', normalizedCurrentStatus);
    if (!newStatus || !['none', 'api'].includes(newStatus)) {
      if (newStatus) alert('Invalid status. Use none or api.');
      return;
    }
    
    try {
      const { error } = await supabase.from('emails_pool').update({ cloud_access_type: newStatus }).eq('id', id);
      if (error) throw error;
      setEmails(prev => prev.map(e => e.id === id ? { ...e, cloud_access_type: newStatus as any } : e));
    } catch (err: any) {
      alert(`Failed to update: ${err.message}`);
    }
  };

  const statusStyles: Record<string, string> = {
    available: 'bg-green-100 dark:bg-emerald-500/10 text-green-700 dark:text-emerald-300',
    assigned: 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300',
    shared: 'bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300',
    used: 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300',
  };

  return (
    <div className="space-y-4">

      {/* Header Card */}
      <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-[#26262d] flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-gray-50/50 dark:bg-white/5">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" /> Email Inventory
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {emails.length} total &bull; <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{todayCount} added today</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status chips */}
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 dark:bg-emerald-500/10 text-green-700 dark:text-emerald-300 rounded-lg text-xs font-semibold border border-green-100 dark:border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" /> {availableCount} Available
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-semibold border border-blue-100 dark:border-blue-500/20">
                <AlertCircle className="w-3.5 h-3.5" /> {assignedCount} In Use
              </span>
            </div>

            {/* Action buttons */}
            <button
              onClick={fetchEmails}
              className="p-2 text-gray-500 dark:text-gray-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={handleExportCSV}
              disabled={!emails.length}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            <button
              onClick={handleDeleteAll}
              disabled={deletingAll || !emails.length}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-colors"
            >
              {deletingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Delete All
            </button>
          </div>
        </div>

        {/* cPanel Auto Generator */}
        <div className="p-6 border-b border-gray-100 dark:border-[#26262d]">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2 text-sm">
            <Server className="w-4 h-4 text-indigo-500" /> cPanel Auto Generator
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end bg-indigo-50/60 dark:bg-[#111113] p-4 rounded-xl border border-indigo-100 dark:border-[#303038]">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Prefix</label>
              <input type="text" value={genPrefix} onChange={e => setGenPrefix(e.target.value)}
                className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg text-sm bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100" placeholder="e.g. team" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Domain</label>
              <input type="text" value={genDomain} onChange={e => setGenDomain(e.target.value)}
                className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg text-sm bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100" placeholder="example.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Count (1–50)</label>
              <input type="number" min="1" max="50" value={genCount} onChange={e => setGenCount(parseInt(e.target.value) || 1)}
                className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg text-sm bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Cloud Access</label>
              <select value={genCloudAccess} onChange={e => setGenCloudAccess(e.target.value as 'none' | 'api')}
                className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg text-sm bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100">
                <option value="none">No Access</option>
                <option value="api">Auto API Access</option>
              </select>
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1 ${genCloudAccess === 'api' ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>Duration (Mos)</label>
              <input type="number" min="1" max="12" value={genDuration} onChange={e => setGenDuration(parseInt(e.target.value) || 1)} disabled={genCloudAccess !== 'api'}
                className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg text-sm bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100 disabled:opacity-50" />
            </div>
            <button onClick={handleAutoGenerate} disabled={generating}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
              {generating ? <><Loader2 className="w-4 h-4 animate-spin" />Gen...</> : <><RefreshCw className="w-4 h-4" />Generate</>}
            </button>
          </div>
        </div>
      </div>

      {/* Date-wise grouped email list */}
      {Object.keys(grouped).length === 0 ? (
        <div className="bg-white dark:bg-[#151518] rounded-xl border border-gray-100 dark:border-[#26262d] py-16 text-center">
          <Mail className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">No emails in the pool yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Use the Auto Generator above to add emails.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([dateLabel, group]) => {
          const isCollapsed = collapsedDates[dateLabel];
          const isGroupToday = dateLabel.startsWith('Today');
          return (
            <div key={dateLabel} className="bg-white dark:bg-[#151518] rounded-xl border border-gray-100 dark:border-[#26262d] overflow-hidden shadow-soft dark:shadow-none">
              {/* Date section header */}
              <div
                className={`flex items-center justify-between px-5 py-3 cursor-pointer select-none ${
                  isGroupToday
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border-b border-emerald-100 dark:border-emerald-500/20'
                    : 'bg-gray-50 dark:bg-white/5 border-b border-gray-100 dark:border-[#26262d]'
                }`}
                onClick={() => toggleDateCollapse(dateLabel)}
              >
                <div className="flex items-center gap-2">
                  <Calendar className={`w-4 h-4 ${isGroupToday ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`} />
                  <span className={`text-sm font-bold ${isGroupToday ? 'text-emerald-800 dark:text-emerald-200' : 'text-gray-700 dark:text-gray-300'}`}>
                    {dateLabel}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    isGroupToday ? 'bg-emerald-200 dark:bg-emerald-500/30 text-emerald-800 dark:text-emerald-200' : 'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-400'
                  }`}>
                    {group.length} emails
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCopyDateGroup(group); }}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                    title="Copy all emails in this group"
                  >
                    <Copy className="w-3 h-3" /> Copy All
                  </button>
                  {isCollapsed ? <ChevronRight className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </div>

              {/* Email rows */}
              {!isCollapsed && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-[#26262d]">
                        <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">#</th>
                        <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Email Address</th>
                        <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Password</th>
                        <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                        <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cloud Access</th>
                        <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Capacity</th>
                        <th className="py-2.5 px-4 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</th>
                        <th className="py-2.5 px-4 text-right text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.map((email, idx) => (
                        <tr key={email.id} className="border-b border-gray-50 dark:border-white/[0.03] hover:bg-gray-50/60 dark:hover:bg-white/[0.02] transition-colors">
                          <td className="py-2.5 px-4 text-xs text-gray-400 dark:text-gray-600">{idx + 1}</td>
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">{email.email}</span>
                              <button onClick={() => copyText(email.email, `e-${email.id}`)} className="text-gray-300 dark:text-gray-600 hover:text-primary transition-colors" title="Copy email">
                                {copiedId === `e-${email.id}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/10 px-2 py-0.5 rounded">
                                {showPasswords[email.id] ? email.password : '••••••••'}
                              </span>
                              <button onClick={() => togglePasswordVisibility(email.id)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                                {showPasswords[email.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                              {showPasswords[email.id] && (
                                <button onClick={() => copyText(email.password, `p-${email.id}`)} className="text-gray-300 dark:text-gray-600 hover:text-primary transition-colors">
                                  {copiedId === `p-${email.id}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${statusStyles[email.status] || statusStyles.used}`}>
                              {email.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-4">
                            <button
                              onClick={() => handleUpdateCloudAccess(email.id, email.cloud_access_type || 'none')}
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold capitalize cursor-pointer hover:opacity-80 transition-opacity ${
                                (email.cloud_access_type === 'api' || email.cloud_access_type === 'manual') ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300 border border-blue-200 dark:border-blue-500/20' :
                                'bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400 border border-gray-200 dark:border-[#303038]'
                              }`}
                              title="Click to update cloud access"
                            >
                              {(email.cloud_access_type === 'manual' ? 'api' : email.cloud_access_type) || 'none'}
                            </button>
                          </td>
                          <td className="py-2.5 px-4">
                            {email.status === 'available' && !email.product_id ? (
                              <div className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500 text-xs font-medium">
                                <CircleDashed className="w-3.5 h-3.5" /> Empty
                              </div>
                            ) : email.products?.max_users_per_email === 1 ? (
                              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-500 text-xs font-semibold bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-100 dark:border-amber-500/20 max-w-max">
                                <Lock className="w-3 h-3" /> Private (1/1)
                              </div>
                            ) : email.products?.max_users_per_email && email.products.max_users_per_email > 1 ? (
                              <div className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full border max-w-max ${
                                (email.current_users || 0) >= email.products.max_users_per_email
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30'
                                  : 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30'
                              }`}>
                                <Users className="w-3 h-3" />
                                {(email.current_users || 0)} / {email.products.max_users_per_email}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500 text-xs font-medium">
                                <CircleDashed className="w-3.5 h-3.5" /> Unknown
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-xs text-gray-400 dark:text-gray-500">
                            {format(parseISO(email.created_at), 'HH:mm')}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button onClick={() => handleDelete(email.id, email.status)}
                              className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors" title="Delete">
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
  );
};
