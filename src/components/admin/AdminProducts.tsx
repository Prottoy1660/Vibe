import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Plus,
  Edit2,
  Trash2,
  Loader2,
  Package,
  Save,
  Mail,
  AlertTriangle,
  Check,
  Users,
  Lock,
  Sparkles,
  Info,
  RefreshCw,
  Box,
  UserCircle,
} from 'lucide-react';

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

function slotLabel(n: number) {
  return `${n} ${n === 1 ? 'slot' : 'slots'}`;
}

export const AdminProducts = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<'regular' | 'personal'>('regular');

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
    setLoading(true);
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

  const filteredProducts = products.filter((p) => (activeTab === 'personal' ? p.is_personal : !p.is_personal));

  const handleSave = async () => {
    try {
      if (editingId) {
        const updatePayload = { ...formData };
        delete updatePayload.id;
        delete (updatePayload as any).created_at;

        const { error } = await supabase
          .from('products')
          .update({
            ...updatePayload,
            icons: Array.isArray(formData.icons)
              ? formData.icons
              : String(formData.icons || '')
                  .split(',')
                  .map((i: string) => i.trim())
                  .filter(Boolean),
          })
          .eq('id', editingId);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('products').insert({
          ...formData,
          icons: Array.isArray(formData.icons)
            ? formData.icons
            : String(formData.icons || '')
                .split(',')
                .map((i: string) => i.trim())
                .filter(Boolean),
        });

        if (error) throw error;
      }

      setEditingId(null);
      setIsAdding(false);
      fetchProducts();
    } catch (error: any) {
      console.error('Error saving product:', error);
      alert(
        `Error saving product: ${error.message || 'Unknown database error'}. Check if the image_url column exists in Supabase.`
      );
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Permanently delete this product?')) return;

    try {
      const { error } = await supabase.from('products').delete().eq('id', id);

      if (error) throw error;
      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Failed to delete product');
    }
  };

  /** Deletes only products in the current tab (regular vs personal), not the entire catalog. */
  const handleDeleteAllInTab = async () => {
    const count = filteredProducts.length;
    if (count === 0) return;
    const label = activeTab === 'personal' ? 'personal subscription' : 'regular';
    if (
      !window.confirm(
        `Delete all ${count} ${label} product(s)? This cannot be undone and may break links to existing orders.`
      )
    )
      return;

    try {
      setLoading(true);
      const isPersonal = activeTab === 'personal';
      const { error } = await supabase.from('products').delete().eq('is_personal', isPersonal);
      if (error) throw error;
      await fetchProducts();
    } catch (error) {
      console.error('Error deleting products:', error);
      alert('Failed to delete products');
      setLoading(false);
    }
  };

  const startEdit = (product: Product) => {
    setFormData({
      ...product,
      icons: product.icons || [],
    });
    setEditingId(product.id);
    setIsAdding(false);
  };

  const openAddRegular = () => {
    setFormData({
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
    setIsAdding(true);
    setEditingId(null);
  };

  const openAddPersonal = () => {
    setFormData({
      title: '',
      title_bn: '',
      price: 0,
      duration: '1 month',
      icons: [],
      description: '',
      image_url: '',
      is_active: true,
      email_slots: 1,
      max_users_per_email: 1,
      single_device_warning: false,
      with_cloud_access: false,
      is_personal: true,
    });
    setIsAdding(true);
    setEditingId(null);
  };

  const switchTab = (tab: 'regular' | 'personal') => {
    setActiveTab(tab);
    setIsAdding(false);
    setEditingId(null);
  };

  const tabs: { id: 'regular' | 'personal'; label: string; sub: string; icon: React.ElementType }[] = [
    { id: 'regular', label: 'Regular products', sub: 'Shared pool emails', icon: Box },
    { id: 'personal', label: 'Personal subscriptions', sub: 'User’s own email', icon: UserCircle },
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
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Product catalog</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
                Manage what appears in the store: <strong className="font-medium text-gray-800 dark:text-gray-200">regular</strong>{' '}
                products use the email pool; <strong className="font-medium text-gray-800 dark:text-gray-200">personal</strong> plans
                tie to the buyer&apos;s email. Pick a tab, then add or edit rows below.
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
                onClick={() => switchTab(t.id)}
                className={`flex-1 min-w-[180px] flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
                  isActive
                    ? activeTab === 'personal'
                      ? 'bg-violet-600 text-white shadow-md shadow-violet-500/25'
                      : 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="text-left">
                  <span className="block">{t.label}</span>
                  <span
                    className={`block text-[11px] font-normal ${
                      isActive ? 'text-white/80' : 'text-gray-500'
                    }`}
                  >
                    {t.sub}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-4 md:p-5">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Package className="w-5 h-5 text-indigo-500 shrink-0" />
          <span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{filteredProducts.length}</span> in this
            list
            {loading && <Loader2 className="inline w-4 h-4 ml-2 animate-spin text-indigo-500 align-middle" />}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fetchProducts()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-[#303038] text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {filteredProducts.length > 0 && (
            <button
              type="button"
              onClick={handleDeleteAllInTab}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 text-sm font-semibold border border-red-100 dark:border-red-500/30 hover:bg-red-100/80 dark:hover:bg-red-500/20 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Delete all in tab
            </button>
          )}
          {activeTab === 'regular' ? (
            <button
              type="button"
              onClick={openAddRegular}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              Add product
            </button>
          ) : (
            <button
              type="button"
              onClick={openAddPersonal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              Add personal product
            </button>
          )}
        </div>
      </div>

      {(isAdding || editingId) && (
        <div className="rounded-2xl border border-indigo-100 dark:border-indigo-500/20 bg-indigo-50/30 dark:bg-[#111113] p-5 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {editingId ? 'Edit product' : 'New product'}
              </h3>
              {formData.is_personal && (
                <span className="inline-block mt-2 px-2.5 py-1 bg-violet-200/80 dark:bg-violet-500/20 text-violet-800 dark:text-violet-200 text-[10px] rounded-lg uppercase font-bold tracking-wide">
                  Personal subscription
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Title (English)">
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100 text-sm"
              />
            </Field>
            <Field label="Title (Bangla)" hint="Shown alongside English where the store uses BN.">
              <input
                type="text"
                value={formData.title_bn}
                onChange={(e) => setFormData({ ...formData, title_bn: e.target.value })}
                className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100 text-sm"
              />
            </Field>
            <Field label="Price (BDT)" hint="Whole store uses the same currency.">
              <input
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100 text-sm"
              />
            </Field>
            <Field label="Duration" hint='e.g. "1 month" or "1 year".'>
              <input
                type="text"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100 text-sm"
              />
            </Field>
            <Field label="Icons" hint="Comma-separated keys for the store UI (e.g. ps, ai, pr).">
              <input
                type="text"
                value={Array.isArray(formData.icons) ? formData.icons.join(',') : String(formData.icons || '')}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    icons: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  })
                }
                className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100 text-sm"
              />
            </Field>
            <Field label="Status">
              <select
                value={formData.is_active ? 'true' : 'false'}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'true' })}
                className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100 text-sm"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Description">
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100 text-sm h-24"
                />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Image URL (optional)" hint="Overrides default banner when set.">
                <input
                  type="text"
                  value={formData.image_url || ''}
                  onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                  className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100 text-sm"
                  placeholder="https://…"
                />
              </Field>
            </div>

            {!formData.is_personal && (
              <div className="md:col-span-2 rounded-xl border border-indigo-200 dark:border-indigo-500/25 bg-white/80 dark:bg-[#151518] p-4">
                <h5 className="text-sm font-bold text-indigo-800 dark:text-indigo-300 mb-3 flex items-center gap-2">
                  <Mail className="w-4 h-4" /> Email pool behavior
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field
                    label="Email slots"
                    hint="How many generated emails the customer can request for this product."
                  >
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={formData.email_slots ?? 3}
                      onChange={(e) => setFormData({ ...formData, email_slots: Number(e.target.value) })}
                      className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-sm"
                    />
                  </Field>
                  <Field label="Sharing">
                    <select
                      value={formData.max_users_per_email ?? 1}
                      onChange={(e) =>
                        setFormData({ ...formData, max_users_per_email: Number(e.target.value) })
                      }
                      className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-sm"
                    >
                      <option value={1}>Exclusive — one customer per mailbox</option>
                      <option value={2}>Shared — two customers share one mailbox</option>
                    </select>
                    <p className="text-[11px] text-gray-500 mt-1.5 flex items-start gap-1">
                      {(formData.max_users_per_email ?? 1) === 1 ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" /> Private slot; best for
                          premium SKUs.
                        </>
                      ) : (
                        <>
                          <Users className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" /> Same credentials for up to{' '}
                          {formData.max_users_per_email} users.
                        </>
                      )}
                    </p>
                  </Field>
                </div>
              </div>
            )}

            {!formData.is_personal && (
              <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ToggleCard
                  title="Single-device warning"
                  description="Show a notice that the account should only be used on one device."
                  enabled={!!formData.single_device_warning}
                  onToggle={() =>
                    setFormData({ ...formData, single_device_warning: !formData.single_device_warning })
                  }
                  color="amber"
                />
                <ToggleCard
                  title="Require Creative Cloud access"
                  description="Only assign pool emails that are flagged for Adobe / API access."
                  enabled={!!formData.with_cloud_access}
                  onToggle={() => setFormData({ ...formData, with_cloud_access: !formData.with_cloud_access })}
                  color="blue"
                />
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setEditingId(null);
              }}
              className="px-4 py-2.5 border border-gray-300 dark:border-[#303038] text-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl flex items-center gap-2 text-sm font-semibold"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] overflow-hidden shadow-sm dark:shadow-none">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/5 flex items-center gap-2">
          <Info className="w-4 h-4 text-indigo-500 shrink-0" />
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Prices are shown in <strong className="font-medium">BDT</strong>. Edit sets pricing for checkout and coupons.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-[#26262d] bg-gray-50/50 dark:bg-white/[0.03]">
                <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Product</th>
                <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Price</th>
                <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Duration</th>
                {activeTab === 'regular' && (
                  <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Email</th>
                )}
                <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-gray-100 dark:border-[#26262d] hover:bg-gray-50/60 dark:hover:bg-white/[0.02]"
                >
                  <td className="py-3 px-4">
                    <div className="font-semibold text-gray-900 dark:text-gray-100">{product.title}</div>
                    {product.title_bn ? (
                      <div className="text-xs text-gray-500 dark:text-gray-400">{product.title_bn}</div>
                    ) : null}
                  </td>
                  <td className="py-3 px-4 font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    BDT {Number(product.price).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">{product.duration}</td>
                  {activeTab === 'regular' && (
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                          <Mail className="w-3.5 h-3.5 shrink-0" /> {slotLabel(product.email_slots ?? 3)}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                          {(product.max_users_per_email ?? 1) === 1 ? (
                            <>
                              <Lock className="w-3 h-3 text-amber-500 shrink-0" /> Exclusive
                            </>
                          ) : (
                            <>
                              <Users className="w-3 h-3 text-indigo-500 shrink-0" /> {product.max_users_per_email}{' '}
                              shared
                            </>
                          )}
                          {product.with_cloud_access ? (
                            <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 rounded-md text-[9px] font-bold">
                              Cloud
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </td>
                  )}
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        product.is_active
                          ? 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {product.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(product)}
                        className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(product.id)}
                        className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={activeTab === 'regular' ? 6 : 5}
                    className="py-14 text-center text-gray-500 dark:text-gray-400"
                  >
                    <Package className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                    <p className="font-medium text-gray-700 dark:text-gray-300">
                      No {activeTab === 'personal' ? 'personal' : 'regular'} products yet
                    </p>
                    <p className="text-sm mt-1">
                      Use <strong className="text-gray-800 dark:text-gray-200">Add product</strong> above to create one.
                    </p>
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">{label}</label>
      {children}
      {hint ? <p className="text-[11px] text-gray-500 mt-1">{hint}</p> : null}
    </div>
  );
}

function ToggleCard({
  title,
  description,
  enabled,
  onToggle,
  color,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  color: 'amber' | 'blue';
}) {
  const wrap =
    color === 'amber'
      ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30'
      : 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30';
  const titleC =
    color === 'amber' ? 'text-amber-800 dark:text-amber-200' : 'text-blue-800 dark:text-blue-200';
  const desc = color === 'amber' ? 'text-amber-700 dark:text-amber-400' : 'text-blue-700 dark:text-blue-400';
  const knob = color === 'amber' ? (enabled ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600') : enabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600';

  return (
    <div className={`flex items-center justify-between rounded-xl border px-4 py-3 gap-4 ${wrap}`}>
      <div className="min-w-0">
        <p className={`text-sm font-bold flex items-center gap-1.5 ${titleC}`}>
          {color === 'amber' ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <Package className="w-4 h-4 shrink-0" />}
          {title}
        </p>
        <p className={`text-xs mt-0.5 ${desc}`}>{description}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${knob}`}
        aria-pressed={enabled}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}
