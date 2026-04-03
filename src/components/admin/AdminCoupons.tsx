import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, Ticket, Plus, Save, Search, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';

interface Coupon {
  id: string;
  code: string;
  discount_percentage: number;
  usage_limit: number;
  used_count: number;
  is_active: boolean;
  created_at: string;
}

export const AdminCoupons = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Coupon usage modal state
  const [usesOpen, setUsesOpen] = useState(false);
  const [usesLoading, setUsesLoading] = useState(false);
  const [activeCoupon, setActiveCoupon] = useState<Coupon | null>(null);
  const [usesByUser, setUsesByUser] = useState<
    Array<{
      user_id: string;
      name: string;
      email: string;
      phone?: string | null;
      order_count: number;
      last_used_at: string;
    }>
  >([]);

  // Form state
  const [formData, setFormData] = useState<Partial<Coupon>>({
    code: '',
    discount_percentage: 10,
    usage_limit: 100,
    is_active: true
  });

  useEffect(() => {
    fetchCoupons();
  }, []);

  const fetchCoupons = async () => {
    try {
      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setCoupons(data || []);
    } catch (error) {
      console.error('Error fetching coupons:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const { error } = await supabase
        .from('coupons')
        .insert({
          ...formData,
          code: formData.code?.toUpperCase()
        });

      if (error) throw error;
      
      setIsAdding(false);
      setFormData({
        code: '',
        discount_percentage: 10,
        usage_limit: 100,
        is_active: true
      });
      fetchCoupons();
    } catch (error: any) {
      console.error('Error saving coupon:', error);
      alert(error.message || 'Error saving coupon');
    }
  };

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('coupons')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;
      fetchCoupons();
    } catch (error) {
      console.error('Error updating coupon:', error);
    }
  };

  const stats = {
    total: coupons.length,
    active: coupons.filter((c) => c.is_active).length,
    inactive: coupons.filter((c) => !c.is_active).length,
  };

  const filteredCoupons = coupons.filter((c) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return c.code.toLowerCase().includes(q);
  });

  const openCouponUses = async (coupon: Coupon) => {
    setActiveCoupon(coupon);
    setUsesOpen(true);
    setUsesLoading(true);
    setUsesByUser([]);

    try {
      const { data: orders, error: ordersErr } = await supabase
        .from('orders')
        .select('id, user_id, created_at, status')
        .eq('coupon_id', coupon.id)
        .order('created_at', { ascending: false })
        .limit(500);

      if (ordersErr) throw ordersErr;

      const userIds = Array.from(new Set((orders || []).map((o: any) => o.user_id).filter(Boolean)));

      const { data: usersRows, error: usersErr } =
        userIds.length > 0
          ? await supabase
              .from('users')
              .select('id, name, email, phone')
              .in('id', userIds)
          : ({ data: [], error: null } as any);

      if (usersErr) throw usersErr;

      const userById: Record<string, any> = {};
      for (const u of usersRows || []) userById[u.id] = u;

      const byUser = new Map<
        string,
        {
          user_id: string;
          name: string;
          email: string;
          phone?: string | null;
          order_count: number;
          last_used_at: string;
        }
      >();

      for (const o of orders || []) {
        const uid = o.user_id;
        if (!uid) continue;
        const existing = byUser.get(uid);
        const user = userById[uid] || {};

        if (!existing) {
          byUser.set(uid, {
            user_id: uid,
            name: user.name || 'Unknown',
            email: user.email || 'Unknown',
            phone: user.phone ?? null,
            order_count: 1,
            last_used_at: o.created_at,
          });
        } else {
          existing.order_count += 1;
        }
      }

      const list = Array.from(byUser.values()).sort((a, b) => Number(b.order_count) - Number(a.order_count));
      setUsesByUser(list);
    } catch (e: any) {
      console.error('fetch coupon usage error:', e);
      alert(e?.message || 'Failed to fetch coupon usage');
      setUsesByUser([]);
    } finally {
      setUsesLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      {usesOpen && activeCoupon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setUsesOpen(false)} />
          <div className="relative bg-white dark:bg-[#151518] border border-gray-100 dark:border-[#26262d] rounded-2xl w-full max-w-2xl overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-[#26262d] flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  Coupon uses: <span className="font-mono">{activeCoupon.code}</span>
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Shows which customers used this coupon (grouped by user).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUsesOpen(false)}
                className="px-3 py-2 rounded-xl border border-gray-200 dark:border-[#26262d] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              >
                Close
              </button>
            </div>

            <div className="p-4 sm:p-6">
              {usesLoading ? (
                <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Loading usage...
                </div>
              ) : usesByUser.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400 font-medium">No orders found for this coupon yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {usesByUser.map((u) => (
                    <div
                      key={u.user_id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border border-gray-100 dark:border-white/5 bg-gray-50/40 dark:bg-white/5 rounded-xl p-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {u.name}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{u.email}</p>
                        {u.phone ? <p className="text-[11px] text-gray-500 dark:text-gray-500 truncate">{u.phone}</p> : null}
                      </div>
                      <div className="flex items-start sm:items-center justify-between sm:justify-end gap-4">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 whitespace-nowrap">
                          Used {u.order_count} time{u.order_count !== 1 ? 's' : ''}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          Last: {u.last_used_at ? format(new Date(u.last_used_at), 'MMM d, HH:mm') : '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
        <div className="relative flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shrink-0">
              <Ticket className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Coupon management</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
                Create new coupons, track usage, and activate/deactivate instantly. Codes are auto-uppercased.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                {stats.active} active
              </span>
              <span className="opacity-40">•</span>
              <span className="inline-flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500" />
                {stats.inactive} inactive
              </span>
            </div>

            <button
              onClick={() => setIsAdding(true)}
              className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-500/25 transition-colors"
              type="button"
            >
              <Plus className="w-4 h-4" />
              Create coupon
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total coupons</p>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2 tabular-nums">{stats.total}</div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">In this admin view</p>
        </div>

        <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Active</p>
          <div className="text-2xl font-bold text-emerald-500 dark:text-emerald-400 mt-2 tabular-nums">{stats.active}</div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Currently usable</p>
        </div>

        <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Inactive</p>
          <div className="text-2xl font-bold text-red-500 dark:text-red-400 mt-2 tabular-nums">{stats.inactive}</div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Temporarily disabled</p>
        </div>
      </div>

      <div className="bg-white dark:bg-[#151518] rounded-2xl border border-gray-100 dark:border-[#26262d] overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-[#26262d] flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Coupons</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {filteredCoupons.length} shown
            </span>
          </div>

          <div className="relative w-full sm:w-80">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <Search className="w-4 h-4 text-gray-400" />
            </div>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by code (e.g. SUMMER20)"
              className="w-full pl-10 pr-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              type="text"
            />
          </div>
        </div>

        <div className="p-6">
        {isAdding && (
          <div className="mb-6 p-5 sm:p-6 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-200 dark:border-[#26262d]">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-gray-100">Create coupon</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Discount % (1-100) and usage limit are required.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-3 py-2 text-sm font-semibold rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Code</label>
                <input
                  type="text"
                  value={formData.code || ''}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  placeholder="e.g. SUMMER20"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Discount %</label>
                <input
                  type="number"
                  value={formData.discount_percentage ?? 0}
                  onChange={(e) => setFormData({ ...formData, discount_percentage: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  min={1}
                  max={100}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Usage limit</label>
                <input
                  type="number"
                  value={formData.usage_limit ?? 0}
                  onChange={(e) => setFormData({ ...formData, usage_limit: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  min={1}
                />
              </div>
              <div className="flex items-end gap-3">
                <button
                  onClick={() => setIsAdding(false)}
                  type="button"
                  className="px-4 py-2.5 border border-gray-200 dark:border-[#26262d] text-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 w-full text-sm font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!formData.code}
                  type="button"
                  className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 flex items-center justify-center w-full text-sm font-semibold disabled:opacity-50 transition-colors"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-[#26262d] bg-gray-50 dark:bg-white/5">
                <th className="py-3 px-4 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Code</th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Discount</th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Usage</th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Status</th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCoupons.map(coupon => (
                <tr key={coupon.id} className="border-b border-gray-100 dark:border-[#26262d] hover:bg-gray-50/50 dark:hover:bg-[#1c1c21]/50 transition-colors duration-300">
                  <td className="py-3 px-4 font-bold text-gray-900 dark:text-gray-100 font-mono tracking-wider">
                    <button
                      type="button"
                      onClick={() => openCouponUses(coupon)}
                      className="hover:underline underline-offset-2"
                      title="View who used this coupon"
                    >
                      {coupon.code}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-emerald-500 dark:text-emerald-400 font-semibold">{coupon.discount_percentage}%</td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">
                    {coupon.used_count} / {coupon.usage_limit}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      coupon.is_active ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200'
                    }`}>
                      {coupon.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button 
                      onClick={() => toggleStatus(coupon.id, coupon.is_active)}
                      className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold ml-auto transition-colors ${
                        coupon.is_active
                          ? 'text-red-600 dark:text-red-400 bg-red-50/60 dark:bg-red-900/20 hover:bg-red-50 dark:hover:bg-red-900/30'
                          : 'text-emerald-600 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-900/20 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
                      }`}
                      type="button"
                    >
                      {coupon.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
              {filteredCoupons.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500 dark:text-gray-400">
                    No coupons found. Create one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
      </div>
    </div>
  );
};
