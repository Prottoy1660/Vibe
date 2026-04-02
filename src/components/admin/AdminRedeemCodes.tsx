import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Loader2, Gift, Plus, Trash2, Copy, Check,
  RefreshCw, ShieldCheck, Hash, Package, Users, X
} from 'lucide-react';
import { format } from 'date-fns';

interface Product {
  id: string;
  title: string;
  price: number;
}

interface RedeemCode {
  id: string;
  code: string;
  product_id: string;
  is_active: boolean;
  is_used: boolean;
  max_uses: number;
  used_count: number;
  created_at: string;
  note?: string;
  products?: { title: string; price: number };
}

function generateCode(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let result = '';
  for (let i = 0; i < length; i++) {
    if (i > 0 && i % 4 === 0) result += '-';
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export const AdminRedeemCodes = () => {
  const [codes, setCodes] = useState<RedeemCode[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'exhausted' | 'disabled'>('all');

  const [form, setForm] = useState({
    code: generateCode(),
    product_id: '',
    max_uses: 1,
    note: '',
    is_active: true,
  });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [{ data: codesData }, { data: productsData }] = await Promise.all([
        supabase
          .from('redeem_codes')
          .select('*, products:product_id(title, price)')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase.from('products').select('id, title, price').eq('is_active', true),
      ]);
      setCodes(codesData || []);
      setProducts(productsData || []);
      if (productsData && productsData.length > 0 && !form.product_id) {
        setForm(f => ({ ...f, product_id: productsData[0].id }));
      }
    } catch (err) {
      console.error('Error fetching redeem codes:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.product_id || !form.code.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('redeem_codes').insert({
        code: form.code.toUpperCase().trim(),
        product_id: form.product_id,
        max_uses: form.max_uses,
        note: form.note || null,
        is_active: form.is_active,
        used_count: 0,
        is_used: false,
      });
      if (error) throw error;
      setShowForm(false);
      setForm({ code: generateCode(), product_id: form.product_id, max_uses: 1, note: '', is_active: true });
      await fetchAll();
    } catch (err: any) {
      alert('Error: ' + (err.message || 'Could not create code. It may already exist.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this redeem code permanently?')) return;
    await supabase.from('redeem_codes').delete().eq('id', id);
    setCodes(prev => prev.filter(c => c.id !== id));
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from('redeem_codes').update({ is_active: !current }).eq('id', id);
    setCodes(prev => prev.map(c => c.id === id ? { ...c, is_active: !current } : c));
  };

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadge = (code: RedeemCode) => {
    if (!code.is_active) return { label: 'Disabled', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' };
    if (code.is_used || code.used_count >= code.max_uses) return { label: 'Exhausted', cls: 'bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400' };
    return { label: 'Active', cls: 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400' };
  };

  const filteredCodes = codes.filter((c) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      c.code.toLowerCase().includes(q) ||
      c.products?.title?.toLowerCase().includes(q) ||
      (c.note || '').toLowerCase().includes(q);

    const badge = getStatusBadge(c).label.toLowerCase();
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && badge === 'active') ||
      (statusFilter === 'exhausted' && badge === 'exhausted') ||
      (statusFilter === 'disabled' && badge === 'disabled');

    return matchesSearch && matchesStatus;
  });

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-200/40 dark:border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
        <div className="absolute -right-24 -top-24 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
              <Gift className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Redeem code manager</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
                Generate gift codes, track usage, and enable/disable codes without opening complicated menus.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={fetchAll}
              type="button"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={() => {
                setShowForm(true);
                setForm((f) => ({ ...f, code: generateCode() }));
              }}
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-500/20 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Generate code
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total', value: codes.length },
            { label: 'Active', value: codes.filter((c) => c.is_active && !c.is_used && c.used_count < c.max_uses).length, accent: 'bg-emerald-600' },
            { label: 'Exhausted', value: codes.filter((c) => c.is_used || c.used_count >= c.max_uses).length, accent: 'bg-red-600' },
            { label: 'Disabled', value: codes.filter((c) => !c.is_active).length, accent: 'bg-gray-700' },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-gray-100/60 dark:border-[#26262d] bg-white/70 dark:bg-white/[0.02] p-4 backdrop-blur"
            >
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{s.value}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">{s.label} codes</div>
            </div>
          ))}
        </div>
      </div>

      {/* Create Code Form */}
      {showForm && (
        <div className="bg-white dark:bg-[#151518] rounded-2xl border border-gray-100 dark:border-[#26262d] shadow-soft overflow-hidden">
          <div className="p-5 border-b border-gray-100 dark:border-[#26262d] flex justify-between items-center">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" /> New Redeem Code
            </h3>
            <button onClick={() => setShowForm(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-sm">Cancel</button>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Code */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Redeem Code</label>
              <div className="flex gap-2">
                <input
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  className="flex-1 px-3 py-2.5 bg-gray-50 dark:bg-[#111113] border border-gray-200 dark:border-[#26262d] rounded-xl text-sm font-mono font-bold tracking-widest text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, code: generateCode() }))}
                  title="Generate new code"
                  className="px-3 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Product */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Product (Grant Access To)</label>
              <select
                value={form.product_id}
                onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-[#111113] border border-gray-200 dark:border-[#26262d] rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.title} — ৳{p.price}</option>
                ))}
              </select>
            </div>

            {/* Max uses */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Max Uses (How Many Users)</label>
              <input
                type="number"
                min={1}
                value={form.max_uses}
                onChange={e => setForm(f => ({ ...f, max_uses: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-[#111113] border border-gray-200 dark:border-[#26262d] rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Note */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Internal Note (optional)</label>
              <input
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                placeholder="e.g. Given to influencer XYZ for promotion"
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-[#111113] border border-gray-200 dark:border-[#26262d] rounded-xl text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Active toggle */}
            <div className="flex items-center gap-3 pt-5">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${form.is_active ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-700'}`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${form.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">Active immediately</span>
            </div>
          </div>
          <div className="px-5 pb-5 flex justify-end">
            <button
              onClick={handleCreate}
              disabled={saving || !form.product_id || !form.code}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-sm transition-colors shadow-sm"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Create Code
            </button>
          </div>
        </div>
      )}

      {/* Codes Table */}
      <div className="bg-white dark:bg-[#151518] rounded-2xl border border-gray-100 dark:border-[#26262d] overflow-hidden">
        {codes.length === 0 ? (
          <div className="py-20 text-center">
            <Gift className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">No redeem codes yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Click "Generate Code" to create your first gift code.</p>
          </div>
        ) : (
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Codes</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Showing <span className="font-semibold text-gray-900 dark:text-gray-100">{filteredCodes.length}</span> of{' '}
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{codes.length}</span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full sm:w-72">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <Hash className="w-4 h-4 text-gray-400" />
                  </div>
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search code or product…"
                    className="w-full pl-10 pr-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="exhausted">Exhausted</option>
                  <option value="disabled">Disabled</option>
                </select>

                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                >
                  <X className="w-4 h-4" />
                  Reset
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 dark:bg-white/5">
                <tr>
                  <th className="px-5 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Code</th>
                  <th className="px-5 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Product</th>
                  <th className="px-5 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Usage</th>
                  <th className="px-5 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {filteredCodes.map(code => {
                  const badge = getStatusBadge(code);
                  const max = Math.max(1, code.max_uses || 1);
                  const pct = Math.min(100, Math.round((code.used_count / max) * 100));
                  return (
                    <tr key={code.id} className="hover:bg-gray-50/80 dark:hover:bg-white/5 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm tracking-widest text-gray-900 dark:text-gray-100">{code.code}</span>
                          <button
                            onClick={() => copyCode(code.code, code.id)}
                            className="p-1 text-gray-400 dark:text-gray-500 hover:text-primary transition-colors"
                            title="Copy code"
                          >
                            {copiedId === code.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-indigo-500 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{code.products?.title || 'Unknown'}</p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500">৳{code.products?.price}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{code.used_count}</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">/ {code.max_uses}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-20 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full transition-all ${badge.cls}`}>
                          <Hash className="w-2.5 h-2.5" />
                          {badge.label}
                        </span>
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => toggleActive(code.id, code.is_active)}
                            className={`inline-flex items-center justify-center px-3 py-2 rounded-xl text-[11px] font-semibold transition-colors ${
                              code.is_active
                                ? 'bg-red-50/60 text-red-600 hover:bg-red-50 dark:bg-red-500/10 dark:text-red-400'
                                : 'bg-emerald-50/60 text-emerald-600 hover:bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400'
                            }`}
                            type="button"
                          >
                            {code.is_active ? 'Disable' : 'Enable'}
                          </button>

                          <button
                            onClick={() => handleDelete(code.id)}
                            className="p-2 rounded-xl text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50/60 dark:hover:bg-red-500/10 transition-colors"
                            title="Delete code"
                            type="button"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredCodes.length === 0 && (
              <div className="py-14 text-center text-gray-500 dark:text-gray-400 text-sm">
                No codes match your search/filter.
              </div>
            )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
