import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Loader2, Gift, Plus, Trash2, Copy, Check,
  RefreshCw, ShieldCheck, Hash, Package, Users, X,
  Download, Layers, Ban, Clock, AlertTriangle, CheckCircle, RotateCcw,
} from 'lucide-react';
import { format } from 'date-fns';
import { getApiBaseUrl } from '../../lib/apiBase';
import { getAccessTokenForApi } from '../../lib/getAccessTokenForApi';
import { REDEEM_RESTORE_WINDOW_MS } from '../../lib/redeemManualPaymentPolicy';

interface Product {
  id: string;
  title: string;
  price: number;
  is_active?: boolean;
}

const productSelectClassName =
  'w-full min-h-[42px] px-3 py-2.5 bg-gray-50 dark:bg-[#111113] border border-gray-200 dark:border-[#26262d] rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:[color-scheme:dark]';

function sortProductsForAdmin(list: Product[]): Product[] {
  return [...list].sort((a, b) => {
    const ac = a.is_active !== false ? 1 : 0;
    const bc = b.is_active !== false ? 1 : 0;
    if (ac !== bc) return bc - ac;
    return (a.title || '').localeCompare(b.title || '');
  });
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

interface PendingOrder {
  id: string;
  user_id: string;
  product_id: string;
  total_amount: number;
  payment_due_date: string;
  created_at: string;
  status?: string;
  payment_status?: string;
  redeem_code_used?: string | null;
  provisioned_emails?: string[];
  users: { id: string; email: string; name: string; phone?: string | null };
  products: { id: string; title: string; price: number };
}

interface RevokedOrder extends PendingOrder {
  redeem_seized_at: string;
  redeem_seized_by?: string | null;
  seized_by_admin?: { name: string; email: string } | null;
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
  const [activeTab, setActiveTab] = useState<'codes' | 'pending' | 'revoked'>('codes');
  const [codes, setCodes] = useState<RedeemCode[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [revokedOrders, setRevokedOrders] = useState<RevokedOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showBulkPanel, setShowBulkPanel] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
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
  const [bulkQuantity, setBulkQuantity] = useState(10);
  const [productsLoadError, setProductsLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    setProductsLoadError(null);
    try {
      const token = await getAccessTokenForApi();
      const base = getApiBaseUrl();
      const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) authHeaders.Authorization = `Bearer ${token}`;

      const [codesRes, catalogRes, pendingJson, revokedJson] = await Promise.all([
        supabase
          .from('redeem_codes')
          .select('*, products:product_id(title, price)')
          .order('created_at', { ascending: false })
          .limit(10000),
        token && base
          ? fetch(`${base}/api/admin/ops/catalog-products`, { headers: authHeaders }).then(async (r) => ({
              ok: r.ok,
              status: r.status,
              json: (await r.json().catch(() => ({}))) as {
                success?: boolean;
                products?: Product[];
                error?: string;
              },
            }))
          : Promise.resolve({ ok: false, status: 0, json: {} as { success?: boolean; products?: Product[]; error?: string } }),
        token && base
          ? fetch(`${base}/api/admin/redeem/pending`, { headers: authHeaders }).then((r) => r.json())
          : Promise.resolve({ success: false as const, orders: [] }),
        token && base
          ? fetch(`${base}/api/admin/redeem/revoked`, { headers: authHeaders }).then((r) => r.json())
          : Promise.resolve({ success: false as const, orders: [] }),
      ]);

      if (codesRes.error) {
        console.error('AdminRedeemCodes redeem_codes:', codesRes.error);
      }

      setCodes(codesRes.data || []);

      let rawProducts: Product[] = [];
      let catalogErr: string | null = null;
      if (catalogRes.ok && catalogRes.json?.success && Array.isArray(catalogRes.json.products)) {
        rawProducts = catalogRes.json.products;
      } else if (token && base) {
        catalogErr =
          catalogRes.json?.error ||
          (catalogRes.ok ? 'Invalid catalog response' : `Catalog API failed (${catalogRes.status || 'network'})`);
      }

      if (rawProducts.length === 0) {
        const { data: fallbackRows, error: fallbackErr } = await supabase
          .from('products')
          .select('id, title, price, is_active');
        if (fallbackErr) {
          console.error('AdminRedeemCodes products fallback:', fallbackErr);
          setProductsLoadError(catalogErr || fallbackErr.message || 'Could not load products');
        } else {
          rawProducts = (fallbackRows || []) as Product[];
          setProductsLoadError(rawProducts.length > 0 ? null : catalogErr);
        }
      } else {
        setProductsLoadError(null);
      }

      const productsData = sortProductsForAdmin(rawProducts);
      setProducts(productsData);
      setPendingOrders(pendingJson?.success ? pendingJson.orders || [] : []);
      setRevokedOrders(revokedJson?.success ? revokedJson.orders || [] : []);

      setForm((f) => {
        if (productsData.length === 0) {
          return f.product_id ? { ...f, product_id: '' } : f;
        }
        const stillValid = productsData.some((p) => p.id === f.product_id);
        if (stillValid) return f;
        const preferred = productsData.find((p) => p.is_active !== false) ?? productsData[0];
        return { ...f, product_id: preferred?.id ?? '' };
      });
    } catch (err) {
      console.error('Error fetching data:', err);
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

  const BULK_MAX = 500;

  const handleBulkCreate = async () => {
    if (!form.product_id) {
      alert('Select a product first.');
      return;
    }
    const n = Math.min(BULK_MAX, Math.max(1, Math.floor(Number(bulkQuantity)) || 1));
    const batchLabel = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const baseNote = form.note?.trim()
      ? `${form.note.trim()} · bulk ${batchLabel}`
      : `Bulk ${batchLabel}`;

    setBulkSaving(true);
    try {
      const seen = new Set<string>();
      const rows: {
        code: string;
        product_id: string;
        max_uses: number;
        note: string;
        is_active: boolean;
        used_count: number;
        is_used: boolean;
      }[] = [];

      for (let i = 0; i < n; i++) {
        let code = '';
        for (let attempt = 0; attempt < 80; attempt++) {
          const c = generateCode();
          if (!seen.has(c)) {
            seen.add(c);
            code = c;
            break;
          }
        }
        if (!code) {
          alert('Could not generate enough unique codes. Try a smaller batch.');
          return;
        }
        rows.push({
          code,
          product_id: form.product_id,
          max_uses: Math.max(1, Number(form.max_uses) || 1),
          note: baseNote,
          is_active: form.is_active,
          used_count: 0,
          is_used: false,
        });
      }

      const chunk = 100;
      for (let i = 0; i < rows.length; i += chunk) {
        const { error } = await supabase.from('redeem_codes').insert(rows.slice(i, i + chunk));
        if (error) throw error;
      }

      setShowBulkPanel(false);
      await fetchAll();
      alert(`Created ${n} redeem codes.`);
    } catch (err: any) {
      alert('Bulk create failed: ' + (err.message || 'Unknown error. Some codes may already exist — try again with a new batch.'));
    } finally {
      setBulkSaving(false);
    }
  };

  const escapeCsvCell = (v: string | number | boolean | undefined | null) => {
    const s = v === null || v === undefined ? '' : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const downloadCsv = () => {
    if (filteredCodes.length === 0) {
      alert('No codes to export. Adjust your search/filter.');
      return;
    }
    const headers = [
      'code',
      'product',
      'price',
      'max_uses',
      'used_count',
      'is_active',
      'is_used',
      'status',
      'created_at',
      'note',
    ];
    const lines = [headers.join(',')];
    for (const c of filteredCodes) {
      const badge = getStatusBadge(c).label;
      lines.push(
        [
          escapeCsvCell(c.code),
          escapeCsvCell(c.products?.title ?? ''),
          escapeCsvCell(c.products?.price ?? ''),
          escapeCsvCell(c.max_uses),
          escapeCsvCell(c.used_count),
          escapeCsvCell(c.is_active),
          escapeCsvCell(c.is_used),
          escapeCsvCell(badge),
          escapeCsvCell(c.created_at),
          escapeCsvCell(c.note ?? ''),
        ].join(','),
      );
    }
    const bom = '\uFEFF';
    const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `redeem-codes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkDeleteFiltered = async () => {
    if (filteredCodes.length === 0) return;
    if (
      !window.confirm(
        `Delete ${filteredCodes.length} code(s) permanently? This cannot be undone. Codes that already have usage history may fail to delete.`,
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const ids = filteredCodes.map((c) => c.id);
      const chunk = 200;
      for (let i = 0; i < ids.length; i += chunk) {
        const { error } = await supabase.from('redeem_codes').delete().in('id', ids.slice(i, i + chunk));
        if (error) throw error;
      }
      setCodes((prev) => prev.filter((c) => !ids.includes(c.id)));
      await fetchAll();
    } catch (err: any) {
      alert('Bulk delete failed: ' + (err.message || 'Some rows may be protected if already used.'));
      await fetchAll();
    } finally {
      setSaving(false);
    }
  };

  const handleBulkDeactivateFiltered = async () => {
    const activeIds = filteredCodes.filter((c) => c.is_active).map((c) => c.id);
    if (activeIds.length === 0) {
      alert('No active codes in the current list.');
      return;
    }
    if (!window.confirm(`Deactivate ${activeIds.length} active code(s) in the current list?`)) return;
    setSaving(true);
    try {
      const chunk = 200;
      for (let i = 0; i < activeIds.length; i += chunk) {
        const { error } = await supabase
          .from('redeem_codes')
          .update({ is_active: false })
          .in('id', activeIds.slice(i, i + chunk));
        if (error) throw error;
      }
      setCodes((prev) =>
        prev.map((c) => (activeIds.includes(c.id) ? { ...c, is_active: false } : c)),
      );
    } catch (err: any) {
      alert('Bulk deactivate failed: ' + (err.message || 'Unknown error'));
      await fetchAll();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this redeem code permanently?')) return;
    await supabase.from('redeem_codes').delete().eq('id', id);
    setCodes(prev => prev.filter(c => c.id !== id));
  };

  const cancelOrder = async (orderId: string) => {
    if (
      !window.confirm(
        'Seize this redeem? The user will be banned, shared emails deactivated, and the ৳ amount will be reversed in payment records (not counted as revenue).',
      )
    ) {
      return;
    }
    try {
      const token = await getAccessTokenForApi();
      if (!token) {
        alert('Session expired. Please sign in again.');
        return;
      }
      const base = getApiBaseUrl();
      const response = await fetch(`${base}/api/admin/redeem/cancel/${orderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Failed to seize order');
      setPendingOrders((prev) => prev.filter((o) => o.id !== orderId));
      await fetchAll();
      alert('Redeem seized: access revoked, user banned, amount reversed.');
    } catch (err: any) {
      alert('Error: ' + (err.message || 'Could not seize order'));
    }
  };

  const restoreOrder = async (orderId: string) => {
    if (
      !window.confirm(
        'Restore this user? They will be unbanned, Adobe emails reactivated, and a fresh 24-hour manual payment window will start. (Only possible within 48 hours after seize — the server will reject if the window has passed.)',
      )
    ) {
      return;
    }
    try {
      const token = await getAccessTokenForApi();
      if (!token) {
        alert('Session expired. Please sign in again.');
        return;
      }
      const base = getApiBaseUrl();
      const response = await fetch(`${base}/api/admin/redeem/restore/${orderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Failed to restore order');
      await fetchAll();
      alert(body.message || 'Access restored.');
    } catch (err: any) {
      alert('Error: ' + (err.message || 'Could not restore order'));
    }
  };

  const markPaid = async (orderId: string) => {
    if (!window.confirm('Mark manual payment as received? This keeps the user active and records the amount as paid.')) return;
    try {
      const token = await getAccessTokenForApi();
      if (!token) {
        alert('Session expired. Please sign in again.');
        return;
      }
      const base = getApiBaseUrl();
      const response = await fetch(`${base}/api/admin/redeem/mark-paid/${orderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Failed to mark as paid');
      setPendingOrders((prev) => prev.filter((o) => o.id !== orderId));
      await fetchAll();
      alert('Marked as paid. Amount is now recorded as settled revenue.');
    } catch (err: any) {
      alert('Error: ' + (err.message || 'Could not mark as paid'));
    }
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
                Generate gift codes, track usage, and collect manual payments after redeem. Users get access first; you have 24h to mark paid
                or seize access — seized rows stay visible with full details for your records.
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
            <button
              onClick={() => setShowBulkPanel((v) => !v)}
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-500/15 transition-colors"
            >
              <Layers className="w-4 h-4" />
              Bulk generate
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 p-1 bg-gray-100 dark:bg-[#111113] rounded-xl border border-gray-200 dark:border-[#26262d]">
        <button
          type="button"
          onClick={() => setActiveTab('codes')}
          className={`flex-1 min-w-[120px] px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            activeTab === 'codes'
              ? 'bg-white dark:bg-[#151518] text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          Redeem Codes
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`flex-1 min-w-[120px] px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            activeTab === 'pending'
              ? 'bg-white dark:bg-[#151518] text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          Pending payment ({pendingOrders.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('revoked')}
          className={`flex-1 min-w-[120px] px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            activeTab === 'revoked'
              ? 'bg-white dark:bg-[#151518] text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          Seized / revoked ({revokedOrders.length})
        </button>
      </div>

      {/* Bulk generate */}
      {showBulkPanel && (
        <div className="bg-white dark:bg-[#151518] rounded-2xl border border-emerald-200/50 dark:border-emerald-500/20 shadow-soft overflow-hidden">
          <div className="p-5 border-b border-gray-100 dark:border-[#26262d] flex justify-between items-center">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" /> Bulk generate codes
            </h3>
            <button type="button" onClick={() => setShowBulkPanel(false)} className="text-gray-400 hover:text-gray-600 text-sm">
              Close
            </button>
          </div>
          {productsLoadError ? (
            <div className="px-5 pt-4">
              <p className="text-sm rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/90 dark:bg-amber-500/10 text-amber-900 dark:text-amber-100 px-4 py-3">
                Products could not load: {productsLoadError}. Redeem codes need a product — check Supabase RLS and that you are signed in as admin.
              </p>
            </div>
          ) : null}
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                  How many codes (max {BULK_MAX})
                </label>
                <input
                  type="number"
                  min={1}
                  max={BULK_MAX}
                  value={bulkQuantity}
                  onChange={(e) => setBulkQuantity(Number(e.target.value))}
                  className="w-full min-h-[42px] px-3 py-2.5 bg-gray-50 dark:bg-[#111113] border border-gray-200 dark:border-[#26262d] rounded-xl text-sm font-semibold text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                  Max uses each
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.max_uses}
                  onChange={(e) => setForm((f) => ({ ...f, max_uses: Number(e.target.value) }))}
                  className="w-full min-h-[42px] px-3 py-2.5 bg-gray-50 dark:bg-[#111113] border border-gray-200 dark:border-[#26262d] rounded-xl text-sm text-gray-900 dark:text-gray-100"
                />
              </div>
              <div className="flex items-end gap-3 pb-0.5">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${
                    form.is_active ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                      form.is_active ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                Product
              </label>
              <select
                value={products.some((p) => p.id === form.product_id) ? form.product_id : ''}
                onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
                disabled={products.length === 0}
                className={productSelectClassName}
              >
                <option value="" disabled>
                  {products.length === 0 ? 'No products found — add products or check admin session' : 'Select a product…'}
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} — ৳{p.price}
                    {p.is_active === false ? ' (inactive)' : ''}
                  </option>
                ))}
              </select>
              {products.length === 0 && !loading && !productsLoadError ? (
                <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                  No products in the database, or none visible to your account. Store needs at least one product row.
                </p>
              ) : null}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                Note (optional, added to each code)
              </label>
              <input
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="e.g. January campaign"
                className="w-full min-h-[42px] px-3 py-2.5 bg-gray-50 dark:bg-[#111113] border border-gray-200 dark:border-[#26262d] rounded-xl text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
          <div className="px-5 pb-5 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              disabled={bulkSaving || !form.product_id || products.length === 0}
              onClick={() => void handleBulkCreate()}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm"
            >
              {bulkSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
              Create {Math.min(BULK_MAX, Math.max(1, Math.floor(Number(bulkQuantity)) || 1))} codes
            </button>
          </div>
        </div>
      )}

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
                value={products.some((p) => p.id === form.product_id) ? form.product_id : ''}
                onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
                disabled={products.length === 0}
                className={productSelectClassName}
              >
                <option value="" disabled>
                  {products.length === 0 ? 'No products available' : 'Select a product…'}
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} — ৳{p.price}
                    {p.is_active === false ? ' (inactive)' : ''}
                  </option>
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
      {activeTab === 'codes' && (
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

                <button
                  type="button"
                  onClick={downloadCsv}
                  disabled={filteredCodes.length === 0}
                  className="inline-flex items-center gap-2 px-3 py-2.5 text-sm rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/80 dark:bg-indigo-500/10 text-indigo-800 dark:text-indigo-200 hover:bg-indigo-100/80 dark:hover:bg-indigo-500/15 disabled:opacity-40 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download CSV
                </button>

                <button
                  type="button"
                  onClick={() => void handleBulkDeactivateFiltered()}
                  disabled={saving || filteredCodes.filter((c) => c.is_active).length === 0}
                  className="inline-flex items-center gap-2 px-3 py-2.5 text-sm rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/80 dark:bg-amber-500/10 text-amber-900 dark:text-amber-100 hover:bg-amber-100/80 disabled:opacity-40 transition-colors"
                >
                  <Ban className="w-4 h-4" />
                  Deactivate all (list)
                </button>

                <button
                  type="button"
                  onClick={() => void handleBulkDeleteFiltered()}
                  disabled={saving || filteredCodes.length === 0}
                  className="inline-flex items-center gap-2 px-3 py-2.5 text-sm rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50/80 dark:bg-red-500/10 text-red-800 dark:text-red-200 hover:bg-red-100/80 disabled:opacity-40 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete all (list)
                </button>
              </div>
            </div>

            <p className="text-[11px] text-gray-500 dark:text-gray-500">
              CSV, deactivate, and delete apply to the <span className="font-semibold">codes currently shown</span> (search + status
              filter). Use Reset to include everything loaded from the server.
            </p>

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
      )}

      {/* Pending Payments Tab */}
      {activeTab === 'pending' && (
        <div className="bg-white dark:bg-[#151518] rounded-2xl border border-gray-100 dark:border-[#26262d] shadow-soft overflow-hidden">
          <div className="p-5 border-b border-gray-100 dark:border-[#26262d]">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-500" />
              Pending Redeem Payments
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Access is already granted (email slots). You have until the due time (default 24h) to collect payment. Mark paid to keep revenue;
              seize to ban the user, revoke access, and reverse the amount in payment history.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50/80 dark:bg-white/[0.02]">
                <tr>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Redeem code
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Provisioned emails
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Due
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-[#26262d]">
                {pendingOrders.map((order) => {
                  const dueDate = order.payment_due_date ? new Date(order.payment_due_date) : new Date(order.created_at);
                  const isOverdue = new Date() > dueDate;
                  const emails = order.provisioned_emails || [];
                  return (
                    <tr key={order.id} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
                      <td className="px-5 py-3.5">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{order.users?.name || 'Unknown'}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{order.users?.email}</p>
                          {order.users?.phone ? (
                            <p className="text-[10px] text-gray-400 dark:text-gray-500">{order.users.phone}</p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-xs font-semibold text-gray-800 dark:text-gray-200">
                          {order.redeem_code_used || '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 max-w-[220px]">
                        {emails.length === 0 ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : (
                          <div className="text-xs text-gray-600 dark:text-gray-300 space-y-0.5">
                            {emails.slice(0, 2).map((e) => (
                              <div key={e} className="truncate" title={e}>
                                {e}
                              </div>
                            ))}
                            {emails.length > 2 ? (
                              <span className="text-[10px] text-gray-400">+{emails.length - 2} more</span>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-indigo-500 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{order.products?.title || 'Unknown'}</p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500">Redeemed {format(new Date(order.created_at), 'MMM d, yyyy')}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">৳{order.total_amount}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          {isOverdue ? (
                            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                          ) : (
                            <Clock className="w-4 h-4 text-orange-500 shrink-0" />
                          )}
                          <span className={`text-sm font-medium ${isOverdue ? 'text-red-600' : 'text-orange-600'}`}>
                            {format(dueDate, 'MMM d, HH:mm')}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => markPaid(order.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-500/20 transition-colors"
                            type="button"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            Mark paid
                          </button>
                          <button
                            onClick={() => cancelOrder(order.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 transition-colors"
                            type="button"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            Seize
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {pendingOrders.length === 0 && (
              <div className="py-14 text-center text-gray-500 dark:text-gray-400 text-sm">
                No pending manual payments for redeem orders.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'revoked' && (
        <div className="bg-white dark:bg-[#151518] rounded-2xl border border-gray-100 dark:border-[#26262d] shadow-soft overflow-hidden">
          <div className="p-5 border-b border-gray-100 dark:border-[#26262d]">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-500" />
              Seized redeem orders
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              These accounts were banned and access removed. Order rows are kept with user, code, emails, and amount for your audit trail.
              Payment events include a matching reversal so totals stay honest.{' '}
              <strong>Restore</strong> is only allowed within <strong>48 hours</strong> after seize; after that the row stays for audit only.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50/80 dark:bg-white/[0.02]">
                <tr>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Code
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Emails (snapshot)
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Seized at
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    By
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-[#26262d]">
                {revokedOrders.map((order) => {
                  const emails = order.provisioned_emails || [];
                  const seizedAt = order.redeem_seized_at ? new Date(order.redeem_seized_at) : null;
                  const restoreDeadline =
                    seizedAt != null ? new Date(seizedAt.getTime() + REDEEM_RESTORE_WINDOW_MS) : null;
                  const restoreAllowed =
                    restoreDeadline != null && Date.now() <= restoreDeadline.getTime();
                  return (
                    <tr key={order.id} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{order.users?.name || 'Unknown'}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{order.users?.email}</p>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs font-semibold text-gray-800 dark:text-gray-200">
                        {order.redeem_code_used || '—'}
                      </td>
                      <td className="px-5 py-3.5 max-w-[220px] text-xs text-gray-600 dark:text-gray-300">
                        {emails.length === 0 ? '—' : emails.join(', ')}
                      </td>
                      <td className="px-5 py-3.5 text-xs font-semibold text-gray-800 dark:text-gray-200">
                        {order.products?.title || '—'}
                      </td>
                      <td className="px-5 py-3.5 text-sm font-bold text-gray-900 dark:text-gray-100">৳{order.total_amount}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300">
                        {seizedAt ? format(seizedAt, 'MMM d, yyyy HH:mm') : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-600 dark:text-gray-300">
                        {order.seized_by_admin?.name || order.seized_by_admin?.email || order.redeem_seized_by || '—'}
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        {restoreAllowed ? (
                          <>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1.5 max-w-[140px] leading-snug">
                              Restore by {restoreDeadline ? format(restoreDeadline, 'MMM d, yyyy HH:mm') : '—'}
                            </p>
                            <button
                              type="button"
                              onClick={() => restoreOrder(order.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25 transition-colors"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Restore access
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-gray-500 dark:text-gray-400 max-w-[160px] inline-block leading-snug">
                            Restore closed (48h after seize)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {revokedOrders.length === 0 && (
              <div className="py-14 text-center text-gray-500 dark:text-gray-400 text-sm">
                No seized redeem orders yet.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
