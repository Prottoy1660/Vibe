import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Edit2, Trash2, Loader2, Package, Save, Mail, AlertTriangle, Check, Users, Lock } from 'lucide-react';

interface Product {
  id: string;
  title: string;
  title_bn: string;
  price: number;
  duration: string;
  icons: string[];
  description: string;
  image_url?: string;
  is_active: boolean;
  email_slots: number;
  max_users_per_email: number;
  single_device_warning: boolean;
  with_cloud_access: boolean;
  is_personal: boolean;
}

export const AdminProducts = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<'regular' | 'personal'>('regular');

  // Form state
  const [formData, setFormData] = useState<Partial<Product>>({
    title: '',
    title_bn: '',
    price: 0,
    duration: '1 month',
    icons: [],
    description: '',
    image_url: '',
    is_active: true,
    email_slots: 3,
    max_users_per_email: 1,
    single_device_warning: false,
    with_cloud_access: false,
    is_personal: false,
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      if (editingId) {
        // Sanitize payload
        const updatePayload = { ...formData };
        delete updatePayload.id;
        delete (updatePayload as any).created_at;

        const { error } = await supabase
          .from('products')
          .update({
            ...updatePayload,
            // Ensure icons is properly formatted as a JSON array or string array based on schema
            icons: Array.isArray(formData.icons) ? formData.icons : (formData.icons as string).split(',').map((i: string) => i.trim())
          })
          .eq('id', editingId);

        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase
          .from('products')
          .insert({
            ...formData,
            icons: Array.isArray(formData.icons) ? formData.icons : (formData.icons as string).split(',').map((i: string) => i.trim())
          });

        if (error) throw error;
      }

      setEditingId(null);
      setIsAdding(false);
      fetchProducts();
    } catch (error: any) {
      console.error('Error saving product:', error);
      alert(`Error saving product: ${error.message || 'Unknown database error'}. Check if the image_url column exists in Supabase!`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this product?')) return;
    
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Failed to delete product');
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm('WARNING: Are you absolutely sure you want to delete ALL products? This action cannot be undone!')) return;
    
    try {
      setLoading(true);
      // Delete all records where id is not null (which is all of them)
      const { error } = await supabase
        .from('products')
        .delete()
        .not('id', 'is', null);

      if (error) throw error;
      fetchProducts();
    } catch (error) {
      console.error('Error deleting all products:', error);
      alert('Failed to delete all products');
      setLoading(false);
    }
  };

  const startEdit = (product: Product) => {
    setFormData({
      ...product,
      icons: product.icons || []
    });
    setEditingId(product.id);
    setIsAdding(false);
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;
  }

  return (
    <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] overflow-hidden">
      <div className="p-6 border-b border-gray-100 dark:border-[#26262d] flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
          <Package className="w-5 h-5 mr-2 text-primary" />
          Product Management
        </h3>
        <div className="flex space-x-2">
          {products.filter(p => activeTab === 'personal' ? p.is_personal : !p.is_personal).length > 0 && (
            <button 
              onClick={handleDeleteAll}
              className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors flex items-center"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete All {activeTab === 'personal' ? 'Personal' : 'Regular'}
            </button>
          )}
          {activeTab === 'regular' ? (
            <button 
              onClick={() => {
                setFormData({
                  title: '', title_bn: '', price: 0, duration: '1 month', icons: [],
                  description: '', image_url: '', is_active: true, email_slots: 3,
                  max_users_per_email: 1, single_device_warning: false, with_cloud_access: false,
                  is_personal: false,
                });
                setIsAdding(true);
                setEditingId(null);
              }}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Product
            </button>
          ) : (
            <button 
              onClick={() => {
                setFormData({
                  title: '', title_bn: '', price: 0, duration: '1 month', icons: [],
                  description: '', image_url: '', is_active: true, email_slots: 1,
                  max_users_per_email: 1, single_device_warning: false, with_cloud_access: false,
                  is_personal: true,
                });
                setIsAdding(true);
                setEditingId(null);
              }}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors flex items-center"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Personal Product
            </button>
          )}
        </div>
      </div>
      
      {/* ── Sub Navigation Tabs ── */}
      <div className="border-b border-gray-100 dark:border-[#26262d] px-6 flex gap-6">
        <button
          onClick={() => {
            setActiveTab('regular');
            setIsAdding(false);
            setEditingId(null);
          }}
          className={`py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'regular' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Regular Products
        </button>
        <button
          onClick={() => {
            setActiveTab('personal');
            setIsAdding(false);
            setEditingId(null);
          }}
          className={`py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'personal' 
              ? 'border-purple-600 text-purple-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Personal Subscriptions
        </button>
      </div>

      <div className="p-6">
        {(isAdding || editingId) && (
          <div className="mb-8 p-6 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-[#26262d]">
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                {editingId ? 'Edit Product' : 'New Product'}
                {formData.is_personal && (
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 text-[10px] rounded uppercase font-bold tracking-wider">
                    Personal Subscription
                  </span>
                )}
              </h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Title (English)</label>
                <input 
                  type="text" 
                  value={formData.title} 
                  onChange={e => setFormData({...formData, title: e.target.value})}
                  className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Title (Bangla)</label>
                <input 
                  type="text" 
                  value={formData.title_bn} 
                  onChange={e => setFormData({...formData, title_bn: e.target.value})}
                  className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Price (৳)</label>
                <input 
                  type="number" 
                  value={formData.price} 
                  onChange={e => setFormData({...formData, price: Number(e.target.value)})}
                  className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Duration (e.g., "1 month")</label>
                <input 
                  type="text" 
                  value={formData.duration} 
                  onChange={e => setFormData({...formData, duration: e.target.value})}
                  className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Icons (comma separated, e.g. ai,ps,pr)</label>
                <input 
                  type="text" 
                  value={Array.isArray(formData.icons) ? formData.icons.join(',') : formData.icons} 
                  onChange={e => setFormData({...formData, icons: e.target.value.split(',').map(s => s.trim())})}
                  className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Status</label>
                <select 
                  value={formData.is_active ? 'true' : 'false'} 
                  onChange={e => setFormData({...formData, is_active: e.target.value === 'true'})}
                  className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg"
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Description</label>
                <textarea 
                  value={formData.description} 
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg h-24"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Image URL (Optional)</label>
                <input 
                  type="text" 
                  value={formData.image_url || ''} 
                  onChange={e => setFormData({...formData, image_url: e.target.value})}
                  className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg"
                  placeholder="https://example.com/image.jpg"
                />
                <p className="text-xs text-gray-500 mt-1">If provided, this image will be displayed instead of the default gradient banner and icons.</p>
              </div>

              {/* ── Email Slot Configuration (Hidden for Personal) ── */}
              {!formData.is_personal && (
                <div className="md:col-span-2">
                  <div className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-xl p-4">
                    <h5 className="text-sm font-bold text-indigo-800 dark:text-indigo-300 mb-3 flex items-center gap-2">
                      <Mail className="w-4 h-4" /> Email Slot Configuration
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                          Email Slots
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={formData.email_slots ?? 3}
                          onChange={e => setFormData({...formData, email_slots: Number(e.target.value)})}
                          className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg"
                        />
                        <p className="text-xs text-gray-400 mt-1">How many emails the user can generate for this subscription (e.g. 3)</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                          Max Users Per Email
                        </label>
                        <select
                          value={formData.max_users_per_email ?? 1}
                          onChange={e => setFormData({...formData, max_users_per_email: Number(e.target.value)})}
                          className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg"
                        >
                          <option value={1}>1 — Exclusive (private, one user only)</option>
                          <option value={2}>2 — Shared (2 users share one email)</option>
                        </select>
                        <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                          {(formData.max_users_per_email ?? 1) === 1
                            ? <><Check className="w-3 h-3 text-emerald-500" /> Exclusive — each email is assigned to one user only</>
                            : <><Users className="w-3 h-3 text-indigo-400" /> Shared — {formData.max_users_per_email} users will receive the same email &amp; password</>}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Single Device Warning & Cloud Access Warning (Hidden for Personal) ── */}
              {!formData.is_personal && (
                <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl px-4 py-3 h-full">
                    <div>
                      <p className="text-sm font-bold text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" /> Single Device Warning
                      </p>
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">When enabled, users will see a warning that this account can only be used on one device at a time.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData({...formData, single_device_warning: !formData.single_device_warning})}
                      className={`relative inline-flex h-7 w-12 shrink-0 ml-4 items-center rounded-full transition-colors ${
                        formData.single_device_warning ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                        formData.single_device_warning ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl px-4 py-3 h-full">
                    <div>
                      <p className="text-sm font-bold text-blue-800 dark:text-blue-200 flex items-center gap-1.5">
                        <Package className="w-4 h-4" /> With Cloud Access
                      </p>
                      <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">When enabled, only emails with Adobe Creative Cloud Access (Auto API or Manual) will be assigned.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData({...formData, with_cloud_access: !formData.with_cloud_access})}
                      className={`relative inline-flex h-7 w-12 shrink-0 ml-4 items-center rounded-full transition-colors ${
                        formData.with_cloud_access ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                        formData.with_cloud_access ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end space-x-3">
              <button 
                onClick={() => { setIsAdding(false); setEditingId(null); }}
                className="px-4 py-2 border border-gray-300 dark:border-[#303038] text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-[#1c1c21] dark:bg-white/5"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Product
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-[#26262d]">
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Product</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Price</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Duration</th>
                {activeTab === 'regular' && (
                  <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Email Config</th>
                )}
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Status</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.filter(p => activeTab === 'personal' ? p.is_personal : !p.is_personal).map(product => (
                <tr key={product.id} className="border-b border-gray-100 dark:border-[#26262d] hover:bg-gray-50/50 dark:hover:bg-[#1c1c21]/50 transition-colors duration-300">
                  <td className="py-3 px-4">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{product.title}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{product.title_bn}</div>
                  </td>
                  <td className="py-3 px-4 font-semibold text-emerald-500">৳{product.price}</td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">{product.duration}</td>
                  {activeTab === 'regular' && (
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                          <Mail className="w-3.5 h-3.5" /> {product.email_slots ?? 3} slots
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                          {(product.max_users_per_email ?? 1) === 1 ? (
                            <><Lock className="w-3 h-3 text-amber-500" /> Exclusive</>
                          ) : (
                            <><Users className="w-3 h-3 text-indigo-500" /> {product.max_users_per_email} shared</>
                          )}
                          {product.with_cloud_access && <span className="ml-1 px-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded">+ Cloud</span>}
                        </span>
                      </div>
                    </td>
                  )}
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      product.is_active ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200'
                    }`}>
                      {product.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button 
                        onClick={() => startEdit(product)}
                        className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(product.id)}
                        className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {products.filter(p => activeTab === 'personal' ? p.is_personal : !p.is_personal).length === 0 && (
                <tr>
                  <td colSpan={activeTab === 'regular' ? 6 : 5} className="py-8 text-center text-gray-500 dark:text-gray-400">
                    No {activeTab === 'personal' ? 'personal' : 'regular'} products found. Add one to get started.
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
