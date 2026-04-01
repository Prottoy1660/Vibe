import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, Ticket, Plus, Edit2, Trash2, Save, X } from 'lucide-react';
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
        .order('created_at', { ascending: false });

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

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;
  }

  return (
    <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] overflow-hidden">
      <div className="p-6 border-b border-gray-100 dark:border-[#26262d] flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
          <Ticket className="w-5 h-5 mr-2 text-green-600" />
          Coupon Management
        </h3>
        <button 
          onClick={() => setIsAdding(true)}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center"
        >
          <Plus className="w-4 h-4 mr-1" />
          Create Coupon
        </button>
      </div>

      <div className="p-6">
        {isAdding && (
          <div className="mb-8 p-6 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-[#26262d]">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">New Coupon</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Code</label>
                <input 
                  type="text" 
                  value={formData.code} 
                  onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})}
                  className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg uppercase"
                  placeholder="e.g. SUMMER20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Discount %</label>
                <input 
                  type="number" 
                  value={formData.discount_percentage} 
                  onChange={e => setFormData({...formData, discount_percentage: Number(e.target.value)})}
                  className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg"
                  min="1" max="100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Usage Limit</label>
                <input 
                  type="number" 
                  value={formData.usage_limit} 
                  onChange={e => setFormData({...formData, usage_limit: Number(e.target.value)})}
                  className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg"
                  min="1"
                />
              </div>
              <div className="flex items-end space-x-2">
                <button 
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-[#303038] text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-[#1c1c21] dark:bg-white/5 w-full"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave}
                  disabled={!formData.code}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center justify-center w-full disabled:opacity-50"
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
              <tr className="border-b border-gray-200 dark:border-[#26262d]">
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Code</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Discount</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Usage</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Status</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map(coupon => (
                <tr key={coupon.id} className="border-b border-gray-100 dark:border-[#26262d] hover:bg-gray-50/50 dark:hover:bg-[#1c1c21]/50 transition-colors duration-300">
                  <td className="py-3 px-4 font-bold text-gray-900 dark:text-gray-100 font-mono tracking-wider">{coupon.code}</td>
                  <td className="py-3 px-4 text-emerald-500 font-semibold">{coupon.discount_percentage}%</td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">
                    {coupon.used_count} / {coupon.usage_limit}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      coupon.is_active ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200'
                    }`}>
                      {coupon.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button 
                      onClick={() => toggleStatus(coupon.id, coupon.is_active)}
                      className={`p-1.5 rounded flex items-center text-xs font-medium ml-auto ${
                        coupon.is_active ? 'text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30' : 'text-green-500 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30'
                      }`}
                    >
                      {coupon.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
              {coupons.length === 0 && (
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
  );
};
