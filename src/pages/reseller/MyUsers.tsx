import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Trash2, Clock, CheckCircle2, Loader2, Users, RefreshCw, Building2, CalendarClock, X } from 'lucide-react';
import { ResellerApi, ResellerPackage, ResellerUser } from '../../services/reseller/resellerApi';

export const MyUsers = () => {
  const [users, setUsers] = useState<ResellerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [orgFilter, setOrgFilter] = useState('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [extendingId, setExtendingId] = useState<string | null>(null);
  const [extendTarget, setExtendTarget] = useState<ResellerUser | null>(null);
  const [packages, setPackages] = useState<ResellerPackage[]>([]);
  const [extendDuration, setExtendDuration] = useState('');
  const [extendLoading, setExtendLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    fetchUsers();
    ResellerApi.getPackages().then((pkgs) => {
      setPackages(pkgs);
      if (pkgs.length > 0) setExtendDuration(pkgs[0].value);
    });
  }, []);

  const fetchUsers = async (opts?: { forceSync?: boolean }) => {
    try {
      if (opts?.forceSync) setSyncing(true);
      setLoadError('');
      const data = await ResellerApi.getUsers({ forceSync: !!opts?.forceSync });
      setUsers(data);
    } catch (error: any) {
      console.error(error);
      setLoadError(error?.message || 'Failed to load users. Try Refresh.');
      setUsers([]);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  const handleExtend = async () => {
    if (!extendTarget || !extendDuration) return;

    const selected = packages.find((p) => p.value === extendDuration);
    if (!selected) return;

    setExtendLoading(true);
    setExtendingId(extendTarget.id);
    try {
      await ResellerApi.extendUser(extendTarget.email, extendDuration, selected.cost);
      setExtendTarget(null);
      await fetchUsers();
      alert(`Extended ${extendTarget.email} successfully.`);
    } catch (error: any) {
      console.error(error);
      alert(error.message || 'Failed to extend user');
    } finally {
      setExtendLoading(false);
      setExtendingId(null);
    }
  };

  const selectedExtendPackage = packages.find((p) => p.value === extendDuration);
  const extendCost = selectedExtendPackage?.cost ?? 0;

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this user? If within 24h, you will be refunded.')) return;
    
    setDeletingId(id);
    try {
      await ResellerApi.deleteUser(id);
      await fetchUsers();
      alert('User removed successfully.');
    } catch (error: any) {
      console.error(error);
      alert(error.message || 'Failed to delete user');
    } finally {
      setDeletingId(null);
    }
  };

  const organizations = Array.from(
    new Set(users.map((u) => u.organizationName).filter(Boolean) as string[]),
  ).sort();

  const filteredUsers = users.filter((u) => {
    const matchesSearch = u.email.toLowerCase().includes(search.toLowerCase());
    const matchesOrg =
      orgFilter === 'all' ||
      (orgFilter === 'unknown' ? !u.organizationName : u.organizationName === orgFilter);
    return matchesSearch && matchesOrg;
  });

  const getStatusBadge = (status: string, activatedAt: string) => {
    if (status === 'expired') return <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">Expired</span>;
    if (status === 'refunded') return <span className="px-3 py-1 rounded-full text-xs font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20">Refunded</span>;
    
    const isWithin24h = (new Date().getTime() - new Date(activatedAt).getTime()) / (1000 * 60 * 60) <= 24;
    return (
      <div className="flex items-center gap-2">
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Active
        </span>
        {isWithin24h && (
          <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20" title="Refundable within 24h">
            Refundable
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            My Users {users.length > 0 && <span className="text-gray-500 font-semibold">({users.length})</span>}
          </h1>
          <p className="text-gray-400 mt-2">
            Organization names sync from Adobe credits-pool automatically.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <button
            type="button"
            onClick={() => fetchUsers({ forceSync: true })}
            disabled={loading || syncing}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white text-sm font-semibold hover:bg-white/10 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Refresh'}
          </button>

          <select
            value={orgFilter}
            onChange={(e) => setOrgFilter(e.target.value)}
            className="px-4 py-2.5 bg-[#111111]/80 border border-white/10 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Organizations</option>
            {organizations.map((org) => (
              <option key={org} value={org}>
                {org}
              </option>
            ))}
            {users.some((u) => !u.organizationName) && (
              <option value="unknown">Unknown organization</option>
            )}
          </select>

          <div className="relative w-full sm:w-72">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-500" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full pl-10 pr-3 py-2.5 bg-[#111111]/80 backdrop-blur-xl border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder:text-gray-600 text-sm"
              placeholder="Search by email..."
            />
          </div>
        </div>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {loadError}
        </div>
      )}

      <div className="bg-[#0a0a0a] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[960px]">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/5 text-xs uppercase tracking-widest text-gray-500">
                <th className="p-4 lg:p-6 font-bold">Customer Email</th>
                <th className="p-4 lg:p-6 font-bold">Organization</th>
                <th className="p-4 lg:p-6 font-bold">Products</th>
                <th className="p-4 lg:p-6 font-bold">Duration</th>
                <th className="p-4 lg:p-6 font-bold">Status</th>
                <th className="p-4 lg:p-6 font-bold">Expires</th>
                <th className="p-4 lg:p-6 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              <AnimatePresence>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center">
                      <Loader2 className="h-8 w-8 animate-spin text-white mx-auto" />
                      <p className="text-gray-500 mt-4 font-medium">Loading users...</p>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-10 lg:p-16 text-center text-gray-500">
                      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Users className="h-6 w-6 text-gray-500" />
                      </div>
                      <p className="font-medium text-lg text-gray-400">No users found</p>
                      <p className="text-sm mt-1">Try adjusting your search or add a new user.</p>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <motion.tr
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.2 }}
                      key={user.id}
                      className="hover:bg-white/[0.02] transition-colors group"
                    >
                      <td className="p-4 lg:p-6">
                        <div className="font-semibold text-gray-200 group-hover:text-white transition-colors">{user.email}</div>
                      </td>
                      <td className="p-4 lg:p-6">
                        {user.organizationName ? (
                          <div className="flex items-center gap-2 text-indigo-300 font-medium">
                            <Building2 className="h-4 w-4 shrink-0 opacity-70" />
                            <span className="max-w-[220px] truncate" title={user.organizationName}>
                              {user.organizationName}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-600 text-xs italic">Not synced yet</span>
                        )}
                      </td>
                      <td className="p-4 lg:p-6 text-gray-400 font-medium">
                        {user.products.join(', ')}
                      </td>
                      <td className="p-4 lg:p-6 text-gray-400 font-medium">
                        {user.durationMonths} {user.durationMonths.endsWith('d') ? '' : 'Month(s)'}
                      </td>
                      <td className="p-4 lg:p-6">
                        {getStatusBadge(user.status, user.activatedAt)}
                      </td>
                      <td className="p-4 lg:p-6 text-gray-400 font-medium">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-gray-300">
                            <Clock className="h-4 w-4 opacity-50" />
                            {new Date(user.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 lg:p-6 text-right">
                        {(user.status === 'active' || user.status === 'expired') && (
                          <div className="inline-flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setExtendTarget(user)}
                              disabled={extendingId === user.id || deletingId === user.id}
                              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-amber-300 font-semibold hover:text-black hover:bg-amber-400 transition-all disabled:opacity-50 active:scale-95 text-xs lg:text-sm bg-amber-500/10 border border-amber-500/20"
                            >
                              {extendingId === user.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CalendarClock className="h-4 w-4" />
                              )}
                              <span>Extend</span>
                            </button>
                            {user.status === 'active' && (
                              <button
                                type="button"
                                onClick={() => handleDelete(user.id)}
                                disabled={deletingId === user.id || extendingId === user.id}
                                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-rose-400 font-semibold hover:text-white hover:bg-rose-500 transition-all disabled:opacity-50 active:scale-95 text-xs lg:text-sm bg-rose-500/10 hover:shadow-lg hover:shadow-rose-500/20"
                              >
                                {deletingId === user.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                                <span>Remove</span>
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {extendTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => !extendLoading && setExtendTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-start justify-between gap-4 p-6 border-b border-white/5">
                <div>
                  <h2 className="text-xl font-bold text-white">Extend User</h2>
                  <p className="text-sm text-gray-400 mt-1 break-all">{extendTarget.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => !extendLoading && setExtendTarget(null)}
                  className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-300">Extension duration</label>
                  <select
                    value={extendDuration}
                    onChange={(e) => setExtendDuration(e.target.value)}
                    disabled={extendLoading || packages.length === 0}
                    className="block w-full px-4 py-3 bg-[#111111] border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-amber-500/40 appearance-none"
                  >
                    {packages.map((pkg) => (
                      <option key={pkg.id} value={pkg.value} className="bg-[#1a1a1a]">
                        {pkg.label} — ${pkg.cost.toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-2xl bg-[#111111] border border-white/5 p-4 text-sm space-y-2">
                  <div className="flex justify-between text-gray-400">
                    <span>Cost</span>
                    <span className="text-white font-bold">${extendCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Current expiry</span>
                    <span className="text-gray-200">
                      {new Date(extendTarget.expiresAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 pt-1">
                    Extension time is added to remaining time (or starts from today if expired).
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleExtend}
                  disabled={extendLoading || packages.length === 0}
                  className="w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 bg-amber-400 hover:bg-amber-300 text-black transition-all disabled:opacity-50"
                >
                  {extendLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <CalendarClock className="h-5 w-5" />
                      Confirm Extend
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
