import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, Users, Shield, ShieldAlert, UserX, UserCheck, Trash2, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { AdminUserDetails } from './AdminUserDetails';

interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: string;
  is_banned: boolean;
  created_at: string;
}

export const AdminUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

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

  const toggleUserRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    if (!window.confirm(`Are you sure you want to change this user's role to ${newRole}?`)) return;

    try {
      const { error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;
      fetchUsers();
    } catch (error) {
      console.error('Error updating user role:', error);
      alert('Failed to update user role');
    }
  };

  const toggleBanStatus = async (userId: string, currentBanStatus: boolean) => {
    const action = currentBanStatus ? 'unban' : 'ban';
    if (!window.confirm(`Are you sure you want to ${action} this user?`)) return;

    try {
      const { error } = await supabase
        .from('users')
        .update({ is_banned: !currentBanStatus })
        .eq('id', userId);

      if (error) throw error;
      fetchUsers();
    } catch (error) {
      console.error(`Error trying to ${action} user:`, error);
      alert(`Failed to ${action} user`);
    }
  };

  const deleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to PERMANENTLY delete this user? This action cannot be undone and will delete all their data.')) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const API_URL = import.meta.env.VITE_API_URL || '';
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
      alert(`Failed to delete user: ${error.message}`);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;
  }

  if (selectedUserId) {
    return <AdminUserDetails userId={selectedUserId} onBack={() => setSelectedUserId(null)} />;
  }

  return (
    <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] overflow-hidden transition-colors duration-300">
      <div className="p-6 border-b border-gray-100 dark:border-[#26262d] flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
          <Users className="w-5 h-5 mr-2 text-purple-600" />
          User Management
        </h3>
      </div>

      <div className="p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-[#26262d]">
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">User</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Contact</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Role</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Status</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Joined</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className={`border-b border-gray-100 dark:border-[#26262d] hover:bg-gray-50/50 dark:hover:bg-[#1c1c21]/50 transition-colors duration-300 ${u.is_banned ? 'bg-red-50/30 dark:bg-red-500/[0.04]' : ''}`}>
                  <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">{u.name}</td>
                  <td className="py-3 px-4">
                    <div className="text-gray-600 dark:text-gray-300 text-sm">{u.email}</div>
                    {u.phone && <div className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{u.phone}</div>}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      u.role === 'admin' ? 'bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300' : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {u.is_banned ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-300">
                        Banned
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-emerald-500/10 text-green-700 dark:text-emerald-300">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                    {format(new Date(u.created_at), 'MMM dd, yyyy')}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button 
                        onClick={() => setSelectedUserId(u.id)}
                        className="p-1.5 rounded flex items-center text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors duration-300"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4 mr-1" /> View
                      </button>
                      <button 
                        onClick={() => toggleBanStatus(u.id, u.is_banned)}
                        className={`p-1.5 rounded flex items-center text-xs font-medium ${
                          u.is_banned 
                            ? 'text-green-600 dark:text-emerald-400 hover:bg-green-50 dark:hover:bg-emerald-500/10' 
                            : 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10'
                        }`}
                        title={u.is_banned ? 'Unban User' : 'Ban User'}
                      >
                        {u.is_banned ? (
                          <><UserCheck className="w-4 h-4 mr-1" /> Unban</>
                        ) : (
                          <><UserX className="w-4 h-4 mr-1" /> Ban</>
                        )}
                      </button>
                      <button 
                        onClick={() => toggleUserRole(u.id, u.role)}
                        className={`p-1.5 rounded flex items-center text-xs font-medium ${
                          u.role === 'admin' 
                            ? 'text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10' 
                            : 'text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10'
                        }`}
                        title={u.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                      >
                        {u.role === 'admin' ? (
                          <><ShieldAlert className="w-4 h-4 mr-1" /> Demote</>
                        ) : (
                          <><Shield className="w-4 h-4 mr-1" /> Promote</>
                        )}
                      </button>
                      <button 
                        onClick={() => deleteUser(u.id)}
                        className="p-1.5 rounded flex items-center text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors duration-300"
                        title="Delete User"
                      >
                        <Trash2 className="w-4 h-4 mr-1" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500 dark:text-gray-400">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
