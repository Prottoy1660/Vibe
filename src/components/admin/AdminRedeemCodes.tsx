import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Loader2, Gift, Plus, Trash2, Copy, Check,
  RefreshCw, ShieldCheck, Hash, Package, Users
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

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
        <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Gift className="w-6 h-6" /> Redeem Code Manager
            </h2>
            <p className="text-emerald-100 text-sm mt-1">Generate single-use or multi-use product gift codes for your users.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchAll} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-semibold transition-all">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button
              onClick={() => { setShowForm(true); setForm(f => ({ ...f, code: generateCode() })); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-white text-emerald-700 rounded-lg text-sm font-bold hover:bg-emerald-50 transition-all shadow"
            >
              <Plus className="w-4 h-4" /> Generate Code
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="relative z-10 flex flex-wrap gap-4 mt-5">
          {[
            { label: 'Total Codes', value: codes.length },
            { label: 'Active', value: codes.filter(c => c.is_active && !c.is_used && c.used_count < c.max_uses).length },
            { label: 'Exhausted', value: codes.filter(c => c.is_used || c.used_count >= c.max_uses).length },
            { label: 'Disabled', value: codes.filter(c => !c.is_active).length },
          ].map((s, i) => (
            <div key={i} className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-2 text-center min-w-[80px]">
              <div className="text-xl font-bold">{s.value}</div>
              <div className="text-[10px] font-medium text-emerald-100">{s.label}</div>
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
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 dark:bg-white/5">
                <tr>
                  <th className="px-5 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Code</th>
                  <th className="px-5 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Product</th>
                  <th className="px-5 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Usage</th>
                  <th className="px-5 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Note</th>
                  <th className="px-5 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {codes.map(code => {
                  const badge = getStatusBadge(code);
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
                            style={{ width: `${Math.min(100, (code.used_count / code.max_uses) * 100)}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => toggleActive(code.id, code.is_active)}
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full transition-all ${badge.cls}`}
                        >
                          <Hash className="w-2.5 h-2.5" />
                          {badge.label}
                        </button>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-[160px] truncate">{code.note || '—'}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-xs text-gray-500 dark:text-gray-400">{format(new Date(code.created_at), 'MMM d, yyyy')}</p>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => handleDelete(code.id)}
                          className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                          title="Delete code"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
