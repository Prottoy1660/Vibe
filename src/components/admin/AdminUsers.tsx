import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, Users, Shield, ShieldAlert, UserX, UserCheck, Trash2, Eye, Search, RotateCcw, KeyRound, LogIn } from 'lucide-react';
import { format } from 'date-fns';
import { AdminUserDetails } from './AdminUserDetails';
import { formatAuthProviderLabel } from '../../lib/authProviderLabels';
import { getApiBaseUrl } from '../../lib/apiBase';
import { getAccessTokenForApi } from '../../lib/getAccessTokenForApi';
import { toast } from '../../lib/toast';
import { useConfirmDialog } from '../../contexts/ConfirmDialogContext';

interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: string;
  is_banned: boolean;
  created_at: string;
  signup_auth_provider?: string | null;
  last_sign_in_provider?: string | null;
}

export const AdminUsers = () => {
  const { confirm } = useConfirmDialog();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'banned'>('all');
  const [signupFilter, setSignupFilter] = useState<'all' | 'email' | 'google' | 'facebook' | 'azure'>('all');

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Realtime: keep users list updated without manual refresh.
  const usersRtTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (selectedUserId) return;

    const schedule = () => {
      if (usersRtTimerRef.current) window.clearTimeout(usersRtTimerRef.current);
      usersRtTimerRef.current = window.setTimeout(() => {
        void fetchUsers();
      }, 850);
    };

    const channel = supabase
      .channel('admin_users_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => schedule())
      .subscribe();

    return () => {
      if (usersRtTimerRef.current) window.clearTimeout(usersRtTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [selectedUserId]);

  const toggleUserRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    const ok = await confirm({
      title: `Change role to ${newRole}?`,
      description: 'This updates the user’s access level immediately.',
      confirmLabel: 'Change role',
    });
    if (!ok) return;

    try {
      const { error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;
      fetchUsers();
    } catch (error) {
      console.error('Error updating user role:', error);
      toast.error('Failed to update user role');
    }
  };

  const toggleBanStatus = async (userId: string, currentBanStatus: boolean) => {
    const action = currentBanStatus ? 'unban' : 'ban';
    const ok = await confirm({
      title: `${action === 'ban' ? 'Ban' : 'Unban'} this user?`,
      confirmLabel: action === 'ban' ? 'Ban user' : 'Unban',
      variant: action === 'ban' ? 'danger' : 'default',
    });
    if (!ok) return;

    try {
      const { error } = await supabase
        .from('users')
        .update({ is_banned: !currentBanStatus })
        .eq('id', userId);

      if (error) throw error;
      fetchUsers();
    } catch (error) {
      console.error(`Error trying to ${action} user:`, error);
      toast.error(`Failed to ${action} user`);
    }
  };

  const deleteUser = async (userId: string) => {
    // Admins are protected from deletion.
    const target = users.find((u) => u.id === userId);
    if (target?.role === 'admin') {
      toast.error('Admins cannot be deleted.');
      return;
    }

    const okDel = await confirm({
      title: 'Permanently delete this user?',
      description: 'This cannot be undone and will delete all their data.',
      confirmLabel: 'Delete user',
      variant: 'danger',
    });
    if (!okDel) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const API_URL = getApiBaseUrl();
      const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete user');
      }

      fetchUsers();
    } catch (error: any) {
      console.error(`Error trying to delete user:`, error);
      toast.error(`Failed to delete user: ${error.message}`);
    }
  };

  const deleteUserInternal = async (userId: string) => {
    // Caller controls confirmation already.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');

    const API_URL = getApiBaseUrl();
    const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to delete user');
  };

  const loginAsUser = async (target: User) => {
    try {
      const token = await getAccessTokenForApi();
      if (!token) throw new Error('Not authenticated');

      const API_URL = getApiBaseUrl();
      const response = await fetch(`${API_URL}/api/admin/users/${target.id}/impersonate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to start impersonation');
      const actionLink = String(result.action_link || '');
      if (!actionLink) throw new Error('Missing action link from server');
      window.location.assign(actionLink);
    } catch (error: any) {
      console.error('impersonation failed:', error);
      toast.error(error?.message || 'Could not login as user');
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;
  }

  if (selectedUserId) {
    return <AdminUserDetails userId={selectedUserId} onBack={() => setSelectedUserId(null)} />;
  }

  const stats = {
    total: users.length,
    active: users.filter((u) => !u.is_banned).length,
    banned: users.filter((u) => u.is_banned).length,
  };

  const signupBreakdown = {
    email: users.filter((u) => (u.signup_auth_provider || 'email') === 'email').length,
    google: users.filter((u) => u.signup_auth_provider === 'google').length,
    facebook: users.filter((u) => u.signup_auth_provider === 'facebook').length,
    azure: users.filter((u) => u.signup_auth_provider === 'azure').length,
  };

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.phone || '').toLowerCase().includes(q);

    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const matchesStatus =
      statusFilter === 'all' || (statusFilter === 'banned' ? u.is_banned : !u.is_banned);
    const sp = (u.signup_auth_provider || 'email').toLowerCase();
    const matchesSignup =
      signupFilter === 'all' ||
      (signupFilter === 'email' ? sp === 'email' : sp === signupFilter);

    return matchesSearch && matchesRole && matchesStatus && matchesSignup;
  });

  const handleAllDelete = async () => {
    const idsToDelete = filteredUsers.filter((u) => u.role !== 'admin').map((u) => u.id);
    const protectedAdmins = filteredUsers.filter((u) => u.role === 'admin');

    if (idsToDelete.length === 0) {
      toast.error(protectedAdmins.length ? 'No deletable users found. Admins are protected.' : 'No users to delete.');
      return;
    }

    const okAll = await confirm({
      title: `Delete ${idsToDelete.length} user(s)?`,
      description: `Admins protected: ${protectedAdmins.length}. This cannot be undone.`,
      confirmLabel: 'Delete all',
      variant: 'danger',
    });
    if (!okAll) return;

    try {
      // Sequential to avoid rate-limit spikes.
      for (const id of idsToDelete) {
        // eslint-disable-next-line no-await-in-loop
        await deleteUserInternal(id);
      }
      await fetchUsers();
      setSelectedUserId(null);
    } catch (error: any) {
      console.error('All delete failed:', error);
      toast.error(`All delete failed: ${error.message || 'Unknown error'}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
        <div className="relative flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">User management</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
                Search users quickly, filter by role/status, and manage access with clear actions.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Showing <span className="font-semibold text-gray-900 dark:text-gray-100">{filteredUsers.length}</span> /{' '}
              {stats.total}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#151518] rounded-2xl p-5 border border-gray-100 dark:border-[#26262d]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Total users</p>
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-white/5 text-indigo-600 dark:text-indigo-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2 tabular-nums">{stats.total}</div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">In this admin view</p>
        </div>

        <div className="bg-white dark:bg-[#151518] rounded-2xl p-5 border border-gray-100 dark:border-[#26262d]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Active</p>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-white/5 text-emerald-600 dark:text-emerald-400">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2 tabular-nums">{stats.active}</div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Not banned</p>
        </div>

        <div className="bg-white dark:bg-[#151518] rounded-2xl p-5 border border-gray-100 dark:border-[#26262d]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Banned</p>
            <div className="p-2 rounded-xl bg-red-50 dark:bg-white/5 text-red-600 dark:text-red-400">
              <UserX className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2 tabular-nums">{stats.banned}</div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Currently blocked</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#151518] rounded-2xl p-5 border border-gray-100 dark:border-[#26262d]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Signup: email</p>
            <div className="p-2 rounded-xl bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-gray-300">
              <KeyRound className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2 tabular-nums">{signupBreakdown.email}</div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Manual registration</p>
        </div>
        <div className="bg-white dark:bg-[#151518] rounded-2xl p-5 border border-gray-100 dark:border-[#26262d]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Signup: Google</p>
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-white/5 text-blue-600 dark:text-blue-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2 tabular-nums">{signupBreakdown.google}</div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">OAuth at account creation</p>
        </div>
        <div className="bg-white dark:bg-[#151518] rounded-2xl p-5 border border-gray-100 dark:border-[#26262d]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Signup: Facebook</p>
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-white/5 text-indigo-600 dark:text-indigo-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2 tabular-nums">{signupBreakdown.facebook}</div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">OAuth at account creation</p>
        </div>
        <div className="bg-white dark:bg-[#151518] rounded-2xl p-5 border border-gray-100 dark:border-[#26262d]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Signup: Microsoft</p>
            <div className="p-2 rounded-xl bg-cyan-50 dark:bg-white/5 text-cyan-600 dark:text-cyan-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2 tabular-nums">{signupBreakdown.azure}</div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">OAuth at account creation</p>
        </div>
      </div>

      <div className="bg-white dark:bg-[#151518] rounded-2xl border border-gray-100 dark:border-[#26262d] p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="relative w-full lg:w-80">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <Search className="w-4 h-4 text-gray-400" />
            </div>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, phone…"
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            >
              <option value="all">All roles</option>
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="banned">Banned</option>
            </select>

            <select
              value={signupFilter}
              onChange={(e) => setSignupFilter(e.target.value as typeof signupFilter)}
              className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              title="Filter by how the user first signed up"
            >
              <option value="all">All signup methods</option>
              <option value="email">Email / password</option>
              <option value="google">Google</option>
              <option value="facebook">Facebook</option>
              <option value="azure">Microsoft</option>
            </select>

            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setRoleFilter('all');
                setStatusFilter('all');
                setSignupFilter('all');
              }}
              className="inline-flex items-center gap-2 px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              title="Reset filters"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>

            <button
              type="button"
              onClick={handleAllDelete}
              className="inline-flex items-center gap-2 px-3 py-2.5 text-sm rounded-xl border border-red-200 dark:border-red-900/30 bg-red-50/40 dark:bg-red-900/10 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Permanently delete all matching users (admins protected)"
              disabled={filteredUsers.filter((u) => u.role !== 'admin').length === 0}
            >
              <Trash2 className="w-4 h-4" />
              All delete
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto bg-white dark:bg-[#151518] rounded-2xl border border-gray-100 dark:border-[#26262d]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-200 dark:border-[#26262d] bg-gray-50 dark:bg-white/5">
              <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Customer
              </th>
              <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Role
              </th>
              <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Signup
              </th>
              <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Last sign-in
              </th>
              <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Joined
              </th>
              <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/5">
            {filteredUsers.map((u) => (
              <tr
                key={u.id}
                className={`hover:bg-gray-50/50 dark:hover:bg-[#1c1c21]/50 transition-colors duration-300 ${
                  u.is_banned ? 'bg-red-50/30 dark:bg-red-500/[0.04]' : ''
                }`}
              >
                <td className="py-3 px-4">
                  <div className="font-semibold text-gray-900 dark:text-gray-100">{u.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{u.email}</div>
                  {u.phone ? <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{u.phone}</div> : null}
                </td>

                <td className="py-3 px-4">
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                      u.role === 'admin'
                        ? 'bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300'
                        : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    {u.role}
                  </span>
                </td>

                <td className="py-3 px-4">
                  {u.is_banned ? (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-300">
                      Banned
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-green-100 dark:bg-emerald-500/10 text-green-700 dark:text-emerald-300">
                      Active
                    </span>
                  )}
                </td>

                <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">
                  {formatAuthProviderLabel(u.signup_auth_provider)}
                </td>

                <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">
                  {formatAuthProviderLabel(u.last_sign_in_provider)}
                </td>

                <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                  {format(new Date(u.created_at), 'MMM dd, yyyy')}
                </td>

                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-2 flex-wrap">
                    <button
                      onClick={() => setSelectedUserId(u.id)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                      title="View details"
                      type="button"
                    >
                      <Eye className="w-4 h-4" />
                      View
                    </button>

                    <button
                      onClick={() => toggleBanStatus(u.id, u.is_banned)}
                      className={`inline-flex items-center justify-center w-9 h-9 rounded-xl text-xs font-semibold transition-colors ${
                        u.is_banned
                          ? 'text-green-600 dark:text-emerald-400 hover:bg-green-50 dark:hover:bg-emerald-500/10'
                          : 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10'
                      }`}
                      title={u.is_banned ? 'Unban user' : 'Ban user'}
                      type="button"
                    >
                      {u.is_banned ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                    </button>

                    <button
                      onClick={() => toggleUserRole(u.id, u.role)}
                      className={`inline-flex items-center justify-center w-9 h-9 rounded-xl text-xs font-semibold transition-colors ${
                        u.role === 'admin'
                          ? 'text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10'
                          : 'text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10'
                      }`}
                      title={u.role === 'admin' ? 'Demote admin' : 'Promote to admin'}
                      type="button"
                    >
                      {u.role === 'admin' ? <ShieldAlert className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                    </button>

                    <button
                      onClick={() => loginAsUser(u)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                      title="Login as this user"
                      type="button"
                    >
                      <LogIn className="w-4 h-4" />
                      Login as
                    </button>

                    <button
                      onClick={() => deleteUser(u.id)}
                      disabled={u.role === 'admin'}
                      className={`inline-flex items-center justify-center w-9 h-9 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors ${
                        u.role === 'admin' ? 'opacity-40 cursor-not-allowed' : ''
                      }`}
                      title={u.role === 'admin' ? 'Admins cannot be deleted' : 'Delete user'}
                      type="button"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={7} className="py-14 text-center text-gray-500 dark:text-gray-400">
                  No users match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
