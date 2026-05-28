import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Loader2, Save, X } from 'lucide-react';
import { ResellerApi, ResellerPackage } from '../../services/reseller/resellerApi';
import { toast } from '../../lib/toast';

export const AdminResellerPackages = () => {
  const [packages, setPackages] = useState<ResellerPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({ label: '', value: '', cost: 0 });

  useEffect(() => {
    fetchPackages();
  }, []);

  const fetchPackages = async () => {
    try {
      const data = await ResellerApi.adminGetPackages();
      setPackages(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setFormData({ label: '', value: '', cost: 0 });
    setIsAdding(true);
    setEditingId(null);
  };

  const handleEdit = (pkg: ResellerPackage) => {
    setFormData({ label: pkg.label, value: pkg.value, cost: pkg.cost });
    setEditingId(pkg.id);
    setIsAdding(false);
  };

  const handleSave = async () => {
    console.log('handleSave called with:', { formData, isAdding, editingId });
    if (!formData.label || !formData.value || isNaN(formData.cost) || formData.cost <= 0) {
      toast.error('Please fill all fields correctly');
      return;
    }

    try {
      setLoading(true);
      if (isAdding) {
        await ResellerApi.adminCreatePackage(formData);
        toast.success('Package added successfully');
      } else if (editingId) {
        const result = await ResellerApi.adminUpdatePackage(editingId, formData);
        toast.success('Package updated successfully');
      }
      setIsAdding(false);
      setEditingId(null);
      await fetchPackages();
    } catch (err: any) {
      console.error('Save error:', err);
      toast.error(err.message || 'Failed to save package');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this package?')) return;
    try {
      setLoading(true);
      await ResellerApi.adminDeletePackage(id);
      toast.success('Package deleted successfully');
      await fetchPackages();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to delete package');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto py-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Reseller Packages</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Manage the subscription durations and pricing available to resellers.</p>
        </div>
        <button
          onClick={handleAdd}
          disabled={isAdding || loading}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Add Package
        </button>
      </div>

      <div className="bg-white dark:bg-[#151518] rounded-2xl border border-gray-200 dark:border-[#26262d] overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-[#26262d] bg-gray-50 dark:bg-white/[0.02]">
              <th className="px-6 py-4 font-medium text-gray-600 dark:text-gray-400">Label (e.g. 1 Month)</th>
              <th className="px-6 py-4 font-medium text-gray-600 dark:text-gray-400">Duration Value (e.g. 1, 14d)</th>
              <th className="px-6 py-4 font-medium text-gray-600 dark:text-gray-400">Cost (USD)</th>
              <th className="px-6 py-4 font-medium text-gray-600 dark:text-gray-400 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-[#26262d]">
            {loading && packages.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-500 mx-auto" />
                </td>
              </tr>
            ) : packages.length === 0 && !isAdding ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                  No packages defined.
                </td>
              </tr>
            ) : null}

            {isAdding && (
              <tr className="bg-indigo-50 dark:bg-indigo-500/5">
                <td className="px-6 py-4">
                  <input
                    type="text"
                    placeholder="e.g. 1 Month"
                    value={formData.label}
                    onChange={e => setFormData({ ...formData, label: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-[#0a0a0b] border border-gray-300 dark:border-[#26262d] rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </td>
                <td className="px-6 py-4">
                  <input
                    type="text"
                    placeholder="e.g. 1"
                    value={formData.value}
                    onChange={e => setFormData({ ...formData, value: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-[#0a0a0b] border border-gray-300 dark:border-[#26262d] rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </td>
                <td className="px-6 py-4">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={isNaN(formData.cost) ? '' : formData.cost}
                    onChange={e => {
                      const val = e.target.value;
                      setFormData({ ...formData, cost: val === '' ? NaN : parseFloat(val) });
                    }}
                    className="w-full px-3 py-2 bg-white dark:bg-[#0a0a0b] border border-gray-300 dark:border-[#26262d] rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={handleSave} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg">
                      <Save className="h-5 w-5" />
                    </button>
                    <button onClick={() => setIsAdding(false)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {packages.map((pkg) => (
              editingId === pkg.id ? (
                <tr key={pkg.id} className="bg-indigo-50 dark:bg-indigo-500/5">
                  <td className="px-6 py-4">
                    <input
                      type="text"
                      value={formData.label}
                      onChange={e => setFormData({ ...formData, label: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-[#0a0a0b] border border-gray-300 dark:border-[#26262d] rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <input
                      type="text"
                      value={formData.value}
                      onChange={e => setFormData({ ...formData, value: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-[#0a0a0b] border border-gray-300 dark:border-[#26262d] rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={isNaN(formData.cost) ? '' : formData.cost}
                      onChange={e => {
                        const val = e.target.value;
                        setFormData({ ...formData, cost: val === '' ? NaN : parseFloat(val) });
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-[#0a0a0b] border border-gray-300 dark:border-[#26262d] rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={handleSave} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg">
                        <Save className="h-5 w-5" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={pkg.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">{pkg.label}</td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{pkg.value}</td>
                  <td className="px-6 py-4 font-bold text-gray-900 dark:text-gray-100">${pkg.cost.toFixed(2)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => handleEdit(pkg)}
                        className="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(pkg.id)}
                        className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
