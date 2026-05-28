import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Trash2, Clock, CheckCircle2, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { ResellerApi, ResellerUser } from '../../services/reseller/resellerApi';

export const MyUsers = () => {
  const [users, setUsers] = useState<ResellerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const data = await ResellerApi.getUsers();
      setUsers(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this user? If within 24h, you will be refunded.')) return;
    
    setDeletingId(id);
    try {
      await ResellerApi.deleteUser(id);
      await fetchUsers();
    } catch (error) {
      console.error(error);
      alert('Failed to delete user');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredUsers = users.filter(u => u.email.toLowerCase().includes(search.toLowerCase()));

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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">My Users</h1>
          <p className="text-gray-400 mt-2">Manage your active and past subscriptions.</p>
        </div>
        
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

      <div className="bg-[#111111]/80 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/5 text-xs uppercase tracking-wider text-gray-400">
                <th className="p-4 font-medium">Customer Email</th>
                <th className="p-4 font-medium">Products</th>
                <th className="p-4 font-medium">Duration</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Expires</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              <AnimatePresence>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center">
                      <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mx-auto" />
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <motion.tr
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      key={user.id}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="p-4">
                        <div className="font-medium text-gray-200">{user.email}</div>
                      </td>
                      <td className="p-4 text-gray-400">
                        {user.products.join(', ')}
                      </td>
                      <td className="p-4 text-gray-400">
                        {user.durationMonths} {user.durationMonths.endsWith('d') ? '' : 'Month(s)'}
                      </td>
                      <td className="p-4">
                        {getStatusBadge(user.status, user.activatedAt)}
                      </td>
                      <td className="p-4 text-gray-400">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {new Date(user.expiresAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        {user.status === 'active' && (
                          <button
                            onClick={() => handleDelete(user.id)}
                            disabled={deletingId === user.id}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                          >
                            {deletingId === user.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                            <span>Remove</span>
                          </button>
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
    </div>
  );
};
