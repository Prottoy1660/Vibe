import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Loader2, Gift, Plus, Trash2, Copy, Check,
  RefreshCw, ShieldCheck, Hash, Package, Users, X,
  Download, Layers, Ban, Clock, AlertTriangle, CheckCircle, RotateCcw, Search, Minus,
} from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import { getApiBaseUrl } from '../../lib/apiBase';
import { getAccessTokenForApi } from '../../lib/getAccessTokenForApi';
import { REDEEM_RESTORE_WINDOW_MS } from '../../lib/redeemManualPaymentPolicy';
import { toast } from '../../lib/toast';
import { useConfirmDialog } from '../../contexts/ConfirmDialogContext';

interface Product {
  id: string;
  title: string;
  price: number;
  is_active?: boolean;
  is_personal?: boolean;
}

const productSelectClassName =
  'w-full min-h-[42px] px-3 py-2.5 bg-gray-50 dark:bg-[#111113] border border-gray-200 dark:border-[#26262d] rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:[color-scheme:dark]';

const BD_TZ = 'Asia/Dhaka';

function formatBdDateShort(d: Date): string {
  return formatInTimeZone(d, BD_TZ, 'MMM d, yy');
}

function formatBdDateTime12(d: Date): string {
  return formatInTimeZone(d, BD_TZ, 'MMM d, h:mm a');
}

type RedeemSelectVisualState = 'checked' | 'unchecked' | 'indeterminate';

function RedeemSelectToggle({
  state,
  onToggle,
  ariaLabel,
  disabled,
}: {
  state: RedeemSelectVisualState;
  onToggle: () => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const on = state !== 'unchecked';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === 'indeterminate' ? 'mixed' : state === 'checked'}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onToggle();
      }}
      className={`flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-[3px] border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-40 dark:focus-visible:ring-offset-[#151518] ${
        on
          ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm dark:border-indigo-500 dark:bg-indigo-500'
          : 'border-zinc-400/80 bg-white dark:border-zinc-500 dark:bg-zinc-950'
      }`}
    >
      {state === 'checked' ? (
        <Check className="h-2.5 w-2.5" strokeWidth={3.5} aria-hidden />
      ) : state === 'indeterminate' ? (
        <Minus className="h-2 w-2" strokeWidth={3} aria-hidden />
      ) : null}
    </button>
  );
}

const redeemStickyActionsThClass =
  'sticky right-0 z-20 bg-gray-50/95 px-2 py-3 text-left align-bottom shadow-[-10px_0_20px_-8px_rgba(15,23,42,0.12)] backdrop-blur-[2px] dark:bg-[#1a1a1f]/95 dark:shadow-[-10px_0_24px_-8px_rgba(0,0,0,0.45)]';

const redeemStickyActionsTdClass =
  'sticky right-0 z-10 bg-white px-2 py-2.5 align-top shadow-[-10px_0_20px_-8px_rgba(15,23,42,0.1)] dark:bg-[#151518] dark:shadow-[-10px_0_24px_-8px_rgba(0,0,0,0.4)] group-hover:bg-gray-50/80 dark:group-hover:bg-[#1c1c21]';

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

async function redeemMarkPaidRequest(
  orderId: string,
  token: string,
  base: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch(`${base}/api/admin/redeem/mark-paid/${orderId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: String((body as { error?: string }).error || (body as { message?: string }).message || `HTTP ${response.status}`) };
  }
  return { ok: true };
}

async function redeemSeizeRequest(
  orderId: string,
  token: string,
  base: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch(`${base}/api/admin/redeem/cancel/${orderId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: String((body as { error?: string }).error || `HTTP ${response.status}`) };
  }
  return { ok: true };
}

async function redeemRestoreRequest(
  orderId: string,
  token: string,
  base: string,
): Promise<{ ok: true; message?: string } | { ok: false; error: string }> {
  const response = await fetch(`${base}/api/admin/redeem/restore/${orderId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: String((body as { error?: string }).error || `HTTP ${response.status}`) };
  }
  const message = (body as { message?: string }).message;
  return { ok: true, message: typeof message === 'string' ? message : undefined };
}

function redeemOrderRestoreAllowed(order: RevokedOrder): boolean {
  const seizedAt = order.redeem_seized_at ? new Date(order.redeem_seized_at) : null;
  if (!seizedAt || Number.isNaN(seizedAt.getTime())) return false;
  return Date.now() <= seizedAt.getTime() + REDEEM_RESTORE_WINDOW_MS;
}

function redeemOrderSearchHaystack(order: PendingOrder | RevokedOrder): string {
  const u = order.users;
  const chunks: (string | null | undefined)[] = [
    u?.name,
    u?.email,
    u?.phone != null && u.phone !== '' ? String(u.phone) : null,
    order.redeem_code_used,
    order.products?.title,
    order.id,
    ...(order.provisioned_emails || []),
  ];
  const r = order as RevokedOrder;
  if (r.redeem_seized_by) chunks.push(r.redeem_seized_by);
  if (r.seized_by_admin?.name) chunks.push(r.seized_by_admin.name);
  if (r.seized_by_admin?.email) chunks.push(r.seized_by_admin.email);
  return chunks
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .join(' ')
    .toLowerCase();
}

function redeemOrderMatchesSearchQuery(order: PendingOrder | RevokedOrder, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = redeemOrderSearchHaystack(order);
  return tokens.every((t) => haystack.includes(t));
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
  const { confirm } = useConfirmDialog();
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
  /** Set when /redeem/pending or /redeem/revoked API fails or is skipped (no token / no API base). */
  const [redeemListsError, setRedeemListsError] = useState<string | null>(null);
  const [pendingSelected, setPendingSelected] = useState<Set<string>>(() => new Set());
  const [pendingBulkLoading, setPendingBulkLoading] = useState(false);
  const [pendingSearchQuery, setPendingSearchQuery] = useState('');
  const [revokedSearchQuery, setRevokedSearchQuery] = useState('');
  const [revokedSelected, setRevokedSelected] = useState<Set<string>>(() => new Set());
  const [revokedBulkLoading, setRevokedBulkLoading] = useState(false);

  const pendingOrdersFiltered = useMemo(
    () => pendingOrders.filter((o) => redeemOrderMatchesSearchQuery(o, pendingSearchQuery)),
    [pendingOrders, pendingSearchQuery],
  );

  const revokedOrdersFiltered = useMemo(
    () => revokedOrders.filter((o) => redeemOrderMatchesSearchQuery(o, revokedSearchQuery)),
    [revokedOrders, revokedSearchQuery],
  );

  const revokedSelectedRestoreableCount = useMemo(() => {
    let n = 0;
    revokedSelected.forEach((id) => {
      const o = revokedOrders.find((x) => x.id === id);
      if (o && redeemOrderRestoreAllowed(o)) n += 1;
    });
    return n;
  }, [revokedSelected, revokedOrders]);

  const pendingHeaderSelectState = useMemo((): RedeemSelectVisualState => {
    const n = pendingOrdersFiltered.length;
    const s = pendingOrdersFiltered.filter((o) => pendingSelected.has(o.id)).length;
    if (n === 0) return 'unchecked';
    if (s === n) return 'checked';
    if (s > 0) return 'indeterminate';
    return 'unchecked';
  }, [pendingOrdersFiltered, pendingSelected]);

  const revokedHeaderSelectState = useMemo((): RedeemSelectVisualState => {
    const n = revokedOrdersFiltered.length;
    const s = revokedOrdersFiltered.filter((o) => revokedSelected.has(o.id)).length;
    if (n === 0) return 'unchecked';
    if (s === n) return 'checked';
    if (s > 0) return 'indeterminate';
    return 'unchecked';
  }, [revokedOrdersFiltered, revokedSelected]);

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (activeTab !== 'pending') setPendingSelected(new Set());
    if (activeTab !== 'revoked') setRevokedSelected(new Set());
  }, [activeTab]);

  useEffect(() => {
    const visible = new Set(pendingOrdersFiltered.map((o) => o.id));
    setPendingSelected((prev) => {
      const next = new Set([...prev].filter((id) => visible.has(id)));
      if (next.size === prev.size) {
        let same = true;
        prev.forEach((id) => {
          if (!next.has(id)) same = false;
        });
        if (same) return prev;
      }
      return next;
    });
  }, [pendingOrdersFiltered]);

  useEffect(() => {
    const visible = new Set(revokedOrdersFiltered.map((o) => o.id));
    setRevokedSelected((prev) => {
      const next = new Set([...prev].filter((id) => visible.has(id)));
      if (next.size === prev.size) {
        let same = true;
        prev.forEach((id) => {
          if (!next.has(id)) same = false;
        });
        if (same) return prev;
      }
      return next;
    });
  }, [revokedOrdersFiltered]);

  const fetchAll = async () => {
    setLoading(true);
    setProductsLoadError(null);
    setRedeemListsError(null);
    try {
      const token = await getAccessTokenForApi();
      const base = getApiBaseUrl();
      const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) authHeaders.Authorization = `Bearer ${token}`;

      const fetchRedeemJson = async (path: string) => {
        const url = `${base}${path}`;
        const res = await fetch(url, { headers: authHeaders });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          orders?: unknown[];
          error?: string;
        };
        return { ok: res.ok, status: res.status, body };
      };

      const [codesRes, catalogRes, pendingRes, revokedRes] = await Promise.all([
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
          ? fetchRedeemJson('/api/admin/redeem/pending')
          : Promise.resolve({
              ok: false,
              status: 0,
              body: { success: false as const, orders: [], error: 'Not loaded (sign in and set API URL)' },
            }),
        token && base
          ? fetchRedeemJson('/api/admin/redeem/revoked')
          : Promise.resolve({
              ok: false,
              status: 0,
              body: { success: false as const, orders: [], error: 'Not loaded (sign in and set API URL)' },
            }),
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
          .select('id, title, price, is_active, is_personal');
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

      // Personal subscriptions should not be redeemable via redeem codes.
      const redeemableProducts = rawProducts.filter((p) => p?.is_personal !== true);
      const productsData = sortProductsForAdmin(redeemableProducts);
      setProducts(productsData);

      const pendingJson = pendingRes.body;
      const revokedJson = revokedRes.body;
      const pendingErr =
        token && base
          ? pendingRes.ok && pendingJson?.success
            ? null
            : pendingJson?.error || `Pending list failed (${pendingRes.status || 'error'})`
          : pendingJson?.error || null;
      const revokedErr =
        token && base
          ? revokedRes.ok && revokedJson?.success
            ? null
            : revokedJson?.error || `Revoked list failed (${revokedRes.status || 'error'})`
          : revokedJson?.error || null;
      setRedeemListsError(
        [pendingErr, revokedErr].filter(Boolean).join(' · ') || null,
      );
      setPendingOrders(pendingRes.ok && pendingJson?.success ? (pendingJson.orders as PendingOrder[]) || [] : []);
      setRevokedOrders(revokedRes.ok && revokedJson?.success ? (revokedJson.orders as RevokedOrder[]) || [] : []);

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

  // Realtime: keep redeem tables updated without manual refresh.
  const redeemRtTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const schedule = () => {
      if (redeemRtTimerRef.current) window.clearTimeout(redeemRtTimerRef.current);
      redeemRtTimerRef.current = window.setTimeout(() => {
        void fetchAll();
      }, 1000);
    };

    const channel = supabase
      .channel(`admin_redeem_rt:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'redeem_codes' },
        () => schedule(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: 'payment_method=eq.redeem_code' },
        () => schedule(),
      )
      .subscribe();

    return () => {
      if (redeemRtTimerRef.current) window.clearTimeout(redeemRtTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, []);

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
      toast.error('Error: ' + (err.message || 'Could not create code. It may already exist.'));
    } finally {
      setSaving(false);
    }
  };

  const BULK_MAX = 500;

  const handleBulkCreate = async () => {
    if (!form.product_id) {
      toast.warning('Select a product first.');
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
          toast.error('Could not generate enough unique codes. Try a smaller batch.');
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
      toast.success(`Created ${n} redeem codes.`);
    } catch (err: any) {
      toast.error('Bulk create failed: ' + (err.message || 'Unknown error. Some codes may already exist — try again with a new batch.'));
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
      toast.warning('No codes to export. Adjust your search/filter.');
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
    const ok = await confirm({
      title: `Delete ${filteredCodes.length} code(s) permanently?`,
      description: 'This cannot be undone. Codes that already have usage history may fail to delete.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
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
      toast.error('Bulk delete failed: ' + (err.message || 'Some rows may be protected if already used.'));
      await fetchAll();
    } finally {
      setSaving(false);
    }
  };

  const handleBulkDeactivateFiltered = async () => {
    const activeIds = filteredCodes.filter((c) => c.is_active).map((c) => c.id);
    if (activeIds.length === 0) {
      toast.warning('No active codes in the current list.');
      return;
    }
    const okDeact = await confirm({
      title: `Deactivate ${activeIds.length} active code(s)?`,
      description: 'Only codes in the current filtered list are affected.',
      confirmLabel: 'Deactivate',
    });
    if (!okDeact) return;
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
      toast.error('Bulk deactivate failed: ' + (err.message || 'Unknown error'));
      await fetchAll();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Delete this redeem code permanently?',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    await supabase.from('redeem_codes').delete().eq('id', id);
    setCodes(prev => prev.filter(c => c.id !== id));
  };

  const cancelOrder = async (orderId: string) => {
    const ok = await confirm({
      title: 'Seize this redeem?',
      description:
        'Shared Adobe access will be turned off for this order, the order will be cancelled, and the ৳ amount will be reversed in payment records (not counted as revenue). The user account stays able to sign in — use Admin → Users only if you need a full ban.',
      confirmLabel: 'Seize',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const token = await getAccessTokenForApi();
      if (!token) {
        toast.error('Session expired. Please sign in again.');
        return;
      }
      const base = getApiBaseUrl();
      const r = await redeemSeizeRequest(orderId, token, base);
      if (r.ok === false) throw new Error(r.error);
      setPendingOrders((prev) => prev.filter((o) => o.id !== orderId));
      setPendingSelected((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
      await fetchAll();
      toast.success('Redeem seized: access revoked for this order, amount reversed. User account was not banned.');
    } catch (err: any) {
      toast.error('Error: ' + (err.message || 'Could not seize order'));
    }
  };

  const bulkMarkPaid = async () => {
    const ids = [...pendingSelected];
    if (ids.length === 0) return;
    const okPaid = await confirm({
      title: `Mark ${ids.length} order(s) as paid?`,
      description: 'Each will record manual payment and settled revenue.',
      confirmLabel: 'Mark paid',
    });
    if (!okPaid) return;
    setPendingBulkLoading(true);
    try {
      const token = await getAccessTokenForApi();
      if (!token) {
        toast.error('Session expired. Please sign in again.');
        return;
      }
      const base = getApiBaseUrl();
      if (!base) {
        toast.error('API URL is not configured.');
        return;
      }
      const succeeded: string[] = [];
      const failures: string[] = [];
      for (const id of ids) {
        const r = await redeemMarkPaidRequest(id, token, base);
        if (r.ok === true) succeeded.push(id);
        else failures.push(`${(pendingOrders.find((o) => o.id === id)?.users?.name || id).slice(0, 24)}: ${r.error}`);
      }
      if (succeeded.length) {
        setPendingOrders((prev) => prev.filter((o) => !succeeded.includes(o.id)));
        setPendingSelected(new Set());
      }
      await fetchAll();
      const msg = `Marked paid: ${succeeded.length}. Failed: ${failures.length}.`;
      if (failures.length) {
        toast.warning(msg, { description: failures.slice(0, 8).join('\n'), duration: 12000 });
      } else {
        toast.success(msg);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Bulk mark paid failed');
    } finally {
      setPendingBulkLoading(false);
    }
  };

  const bulkSeize = async () => {
    const ids = [...pendingSelected];
    if (ids.length === 0) return;
    const okSeize = await confirm({
      title: `Seize ${ids.length} redeem order(s)?`,
      description:
        'Access will be revoked for each, orders cancelled, amounts reversed. User accounts are not banned.',
      confirmLabel: 'Seize all',
      variant: 'danger',
    });
    if (!okSeize) return;
    setPendingBulkLoading(true);
    try {
      const token = await getAccessTokenForApi();
      if (!token) {
        toast.error('Session expired. Please sign in again.');
        return;
      }
      const base = getApiBaseUrl();
      if (!base) {
        toast.error('API URL is not configured.');
        return;
      }
      const succeeded: string[] = [];
      const failures: string[] = [];
      for (const id of ids) {
        const r = await redeemSeizeRequest(id, token, base);
        if (r.ok === true) succeeded.push(id);
        else failures.push(`${(pendingOrders.find((o) => o.id === id)?.users?.name || id).slice(0, 24)}: ${r.error}`);
      }
      if (succeeded.length) {
        setPendingOrders((prev) => prev.filter((o) => !succeeded.includes(o.id)));
        setPendingSelected(new Set());
      }
      await fetchAll();
      const msg = `Seized: ${succeeded.length}. Failed: ${failures.length}.`;
      if (failures.length) {
        toast.warning(msg, { description: failures.slice(0, 8).join('\n'), duration: 12000 });
      } else {
        toast.success(msg);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Bulk seize failed');
    } finally {
      setPendingBulkLoading(false);
    }
  };

  const restoreOrder = async (orderId: string) => {
    const okRestore = await confirm({
      title: 'Restore this order?',
      description:
        'Adobe emails for it will be reactivated and a fresh 24-hour manual payment window will start. Any legacy account ban from an old seize will be cleared. Only within 48 hours after seize — the server will reject if the window has passed.',
      confirmLabel: 'Restore',
    });
    if (!okRestore) return;
    try {
      const token = await getAccessTokenForApi();
      if (!token) {
        toast.error('Session expired. Please sign in again.');
        return;
      }
      const base = getApiBaseUrl();
      if (!base) {
        toast.error('API URL is not configured.');
        return;
      }
      const r = await redeemRestoreRequest(orderId, token, base);
      if (r.ok === false) throw new Error(r.error);
      setRevokedSelected((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
      await fetchAll();
      toast.success(r.message || 'Access restored.');
    } catch (err: any) {
      toast.error('Error: ' + (err.message || 'Could not restore order'));
    }
  };

  const bulkRevokedRestore = async () => {
    const selected = [...revokedSelected];
    const restoreableIds = selected.filter((id) => {
      const o = revokedOrders.find((x) => x.id === id);
      return o != null && redeemOrderRestoreAllowed(o);
    });
    if (restoreableIds.length === 0) {
      toast.warning('No selected orders are still within the 48-hour restore window.');
      return;
    }
    const skipped = selected.length - restoreableIds.length;
    const skipNote =
      skipped > 0 ? ` ${skipped} selected row(s) are past the window and will be skipped.` : '';
    const okBulkRestore = await confirm({
      title: `Restore ${restoreableIds.length} order(s)?`,
      description: `${skipNote.trim()} Adobe emails will be reactivated and a fresh manual payment window will start for each.`.trim(),
      confirmLabel: 'Restore',
    });
    if (!okBulkRestore) return;
    setRevokedBulkLoading(true);
    try {
      const token = await getAccessTokenForApi();
      if (!token) {
        toast.error('Session expired. Please sign in again.');
        return;
      }
      const base = getApiBaseUrl();
      if (!base) {
        toast.error('API URL is not configured.');
        return;
      }
      const succeeded: string[] = [];
      const failures: string[] = [];
      for (const id of restoreableIds) {
        const r = await redeemRestoreRequest(id, token, base);
        if (r.ok === true) succeeded.push(id);
        else
          failures.push(
            `${(revokedOrders.find((o) => o.id === id)?.users?.name || id).slice(0, 24)}: ${r.error}`,
          );
      }
      if (succeeded.length) {
        setRevokedSelected((prev) => {
          const next = new Set(prev);
          succeeded.forEach((id) => next.delete(id));
          return next;
        });
      }
      await fetchAll();
      const msg = `Restored: ${succeeded.length}. Failed: ${failures.length}.`;
      if (failures.length) {
        toast.warning(msg, { description: failures.slice(0, 8).join('\n'), duration: 12000 });
      } else {
        toast.success(msg);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Bulk restore failed');
    } finally {
      setRevokedBulkLoading(false);
    }
  };

  const markPaid = async (orderId: string) => {
    const ok = await confirm({
      title: 'Mark manual payment as received?',
      description: 'This keeps the user active and records the amount as paid.',
      confirmLabel: 'Mark paid',
    });
    if (!ok) return;
    try {
      const token = await getAccessTokenForApi();
      if (!token) {
        toast.error('Session expired. Please sign in again.');
        return;
      }
      const base = getApiBaseUrl();
      const r = await redeemMarkPaidRequest(orderId, token, base);
      if (r.ok === false) throw new Error(r.error);
      setPendingOrders((prev) => prev.filter((o) => o.id !== orderId));
      setPendingSelected((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
      await fetchAll();
      toast.success('Marked as paid. Amount is now recorded as settled revenue.');
    } catch (err: any) {
      toast.error('Error: ' + (err.message || 'Could not mark as paid'));
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
        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between min-w-0">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
              <Gift className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Redeem code manager</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl leading-snug">
                Gift codes, usage, and manual payment after redeem. Access first; you have 24h to mark paid or seize — seized rows stay in{' '}
                <span className="font-medium text-gray-700 dark:text-gray-300">Seized / revoked</span>.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
            <button
              onClick={fetchAll}
              type="button"
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
            >
              <RefreshCw className="w-4 h-4 shrink-0" />
              Refresh
            </button>
            <button
              onClick={() => {
                setShowForm(true);
                setForm((f) => ({ ...f, code: generateCode() }));
              }}
              type="button"
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-500/20 transition-colors"
            >
              <Plus className="w-4 h-4 shrink-0" />
              Generate code
            </button>
            <button
              onClick={() => setShowBulkPanel((v) => !v)}
              type="button"
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold border border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-500/15 transition-colors"
            >
              <Layers className="w-4 h-4 shrink-0" />
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

      {redeemListsError ? (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/90 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          <strong className="font-semibold">Pending / seized lists could not load:</strong> {redeemListsError} Refresh the page after fixing API URL (
          <code className="text-xs">VITE_API_URL</code>) and server deploy, or check browser Network for{' '}
          <code className="text-xs">/api/admin/redeem/pending</code>.
        </div>
      ) : null}

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
            <div className="flex flex-col gap-3 min-w-0 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
              <div className="shrink-0 lg:pr-2">
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Codes</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Showing <span className="font-semibold text-gray-900 dark:text-gray-100">{filteredCodes.length}</span> of{' '}
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{codes.length}</span>
                </p>
              </div>

              <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
                <div className="relative w-44 shrink-0 sm:w-52 md:w-60">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <Hash className="w-4 h-4 text-gray-400" />
                  </div>
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search code or product…"
                    className="w-full pl-10 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="shrink-0 rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-sm dark:border-[#26262d] dark:bg-[#111113] dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
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
                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-[#26262d] dark:bg-[#111113] dark:text-gray-200 dark:hover:bg-white/5"
                >
                  <X className="h-4 w-4 shrink-0" />
                  Reset
                </button>

                <button
                  type="button"
                  onClick={downloadCsv}
                  disabled={filteredCodes.length === 0}
                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-indigo-200 bg-indigo-50/80 px-2.5 py-2 text-sm font-medium text-indigo-800 transition-colors hover:bg-indigo-100/80 disabled:opacity-40 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/15"
                >
                  <Download className="h-4 w-4 shrink-0" />
                  Download CSV
                </button>

                <button
                  type="button"
                  onClick={() => void handleBulkDeactivateFiltered()}
                  disabled={saving || filteredCodes.filter((c) => c.is_active).length === 0}
                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-amber-200 bg-amber-50/80 px-2.5 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100/80 disabled:opacity-40 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 dark:hover:bg-amber-500/20"
                >
                  <Ban className="h-4 w-4 shrink-0" />
                  Deactivate all
                </button>

                <button
                  type="button"
                  onClick={() => void handleBulkDeleteFiltered()}
                  disabled={saving || filteredCodes.length === 0}
                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-red-200 bg-red-50/80 px-2.5 py-2 text-sm font-medium text-red-800 transition-colors hover:bg-red-100/80 disabled:opacity-40 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/20"
                >
                  <Trash2 className="h-4 w-4 shrink-0" />
                  Delete all
                </button>
              </div>
            </div>

            <p className="text-[11px] text-gray-500 dark:text-gray-500">
              CSV / Deactivate all / Delete all apply to the <span className="font-semibold">filtered list</span> only. Reset clears filters.
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
          <div className="border-b border-gray-100 dark:border-[#26262d] px-4 py-3 sm:px-5 sm:py-4">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-500" />
              Pending Redeem Payments
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-snug">
              <span className="font-medium text-gray-700 dark:text-gray-300">Bangladesh time · 12-hour</span> — Collect before due. Mark paid or seize; search, then use row toggles or bulk.
            </p>
            <details className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              <summary className="cursor-pointer select-none text-indigo-600 hover:underline dark:text-indigo-400 [&::-webkit-details-marker]:hidden">
                More about pending payment &amp; seize
              </summary>
              <p className="mt-2 max-w-3xl border-l-2 border-gray-200 pl-3 leading-relaxed dark:border-gray-700">
                Access (email slots) is already live. Default payment window is 24h from redeem. Mark paid to record revenue. Seize cancels the order, revokes Adobe access for it, reverses the amount in payment history, and does not ban the user account (ban from Users if needed). The header toggle selects all rows that match your current search.
              </p>
            </details>
          </div>

          {pendingOrders.length > 0 && (
            <div className="border-b border-gray-100 dark:border-[#26262d] bg-gray-50/70 dark:bg-white/[0.03] px-4 sm:px-5 py-3 space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-start gap-3 lg:gap-4">
                <div className="min-w-0 w-full flex-1">
                  <label className="sr-only" htmlFor="pending-redeem-search">
                    Search pending orders
                  </label>
                  <div className="relative w-full">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                      aria-hidden
                    />
                    <input
                      id="pending-redeem-search"
                      type="search"
                      value={pendingSearchQuery}
                      onChange={(e) => setPendingSearchQuery(e.target.value)}
                      placeholder="Search user, code, email, phone…"
                      title="Matches name, email, phone, redeem code, product, Adobe emails, order id. Multiple words narrow the list."
                      className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/35 dark:border-[#26262d] dark:bg-[#111113] dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:ring-indigo-400/25"
                      autoComplete="off"
                    />
                    {pendingSearchQuery ? (
                      <button
                        type="button"
                        onClick={() => setPendingSearchQuery('')}
                        className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200"
                        aria-label="Clear search"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  {pendingSearchQuery.trim() ? (
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Showing <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-300">{pendingOrdersFiltered.length}</span> of{' '}
                      <span className="tabular-nums">{pendingOrders.length}</span>
                      {pendingOrdersFiltered.length === 0 ? ' — try another word or clear the search.' : ''}
                    </p>
                  ) : null}
                </div>
                {pendingOrdersFiltered.length > 0 ? (
                  <div className="flex flex-col gap-2 lg:min-w-[16rem] lg:items-end lg:pt-0.5">
                    <p className="text-sm text-gray-600 dark:text-gray-400 lg:text-right">
                      {pendingSelected.size > 0 ? (
                        <>
                          <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{pendingSelected.size}</span> selected — bulk actions:
                        </>
                      ) : (
                        <>Top toggle = select all (current search).</>
                      )}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void bulkMarkPaid()}
                        disabled={pendingBulkLoading || pendingSelected.size === 0}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:pointer-events-none disabled:opacity-40"
                      >
                        {pendingBulkLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                        Bulk mark paid ({pendingSelected.size})
                      </button>
                      <button
                        type="button"
                        onClick={() => void bulkSeize()}
                        disabled={pendingBulkLoading || pendingSelected.size === 0}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600/90 px-3 py-2 text-xs font-semibold text-white hover:bg-red-600 disabled:pointer-events-none disabled:opacity-40 dark:bg-red-500/80 dark:hover:bg-red-500"
                      >
                        {pendingBulkLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                        Bulk seize ({pendingSelected.size})
                      </button>
                      {pendingSelected.size > 0 ? (
                        <button
                          type="button"
                          onClick={() => setPendingSelected(new Set())}
                          disabled={pendingBulkLoading}
                          className="px-2 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 disabled:opacity-40 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                          Clear selection
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-b-2xl overscroll-x-contain [-webkit-overflow-scrolling:touch]">
            {pendingOrders.length > 0 && pendingOrdersFiltered.length > 0 ? (
            <table className="w-full min-w-0 table-auto border-collapse text-[13px] leading-snug">
              <thead className="bg-gray-50/80 dark:bg-white/[0.02]">
                <tr>
                  <th className="w-9 px-1.5 py-3 align-bottom" scope="col">
                    <RedeemSelectToggle
                      state={pendingHeaderSelectState}
                      disabled={pendingOrdersFiltered.length === 0}
                      ariaLabel={
                        pendingHeaderSelectState === 'checked'
                          ? 'Deselect all rows in this list'
                          : 'Select all rows matching the current search'
                      }
                      onToggle={() => {
                        const ids = pendingOrdersFiltered.map((o) => o.id);
                        const allSelected =
                          pendingOrdersFiltered.length > 0 &&
                          pendingOrdersFiltered.every((o) => pendingSelected.has(o.id));
                        if (allSelected) {
                          setPendingSelected((prev) => {
                            const next = new Set(prev);
                            ids.forEach((id) => next.delete(id));
                            return next;
                          });
                        } else {
                          setPendingSelected((prev) => new Set([...prev, ...ids]));
                        }
                      }}
                    />
                  </th>
                  <th className="max-w-[11rem] px-2 py-3 text-left align-bottom text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    User
                  </th>
                  <th className="whitespace-nowrap px-2 py-3 text-left align-bottom text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Code
                  </th>
                  <th className="max-w-[10rem] px-2 py-3 text-left align-bottom text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Emails
                  </th>
                  <th className="max-w-[9rem] px-2 py-3 text-left align-bottom text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Product
                  </th>
                  <th className="whitespace-nowrap px-2 py-3 text-left align-bottom text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Amt
                  </th>
                  <th className="whitespace-nowrap px-2 py-3 text-left align-bottom text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Due
                  </th>
                  <th
                    className={`${redeemStickyActionsThClass} text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400`}
                    scope="col"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-[#26262d]">
                {pendingOrdersFiltered.map((order) => {
                  const dueDate = order.payment_due_date ? new Date(order.payment_due_date) : new Date(order.created_at);
                  const isOverdue = new Date() > dueDate;
                  const emails = order.provisioned_emails || [];
                  return (
                    <tr
                      key={order.id}
                      className="group align-top transition-colors hover:bg-gray-50/50 dark:hover:bg-white/[0.02]"
                    >
                      <td className="px-1.5 py-2.5 align-top">
                        <RedeemSelectToggle
                          state={pendingSelected.has(order.id) ? 'checked' : 'unchecked'}
                          ariaLabel={`Select ${order.users?.name || 'order'}`}
                          onToggle={() => {
                            setPendingSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(order.id)) next.delete(order.id);
                              else next.add(order.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className="max-w-[11rem] px-2 py-2.5 align-top">
                        <div className="space-y-0.5">
                          <p className="text-[13px] font-semibold leading-tight text-gray-900 dark:text-gray-100">
                            {order.users?.name || 'Unknown'}
                          </p>
                          <p className="break-words text-xs text-gray-600 dark:text-gray-400">{order.users?.email}</p>
                          {order.users?.phone ? (
                            <p className="text-xs tabular-nums text-gray-500 dark:text-gray-500">{order.users.phone}</p>
                          ) : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 align-top">
                        <span className="font-mono text-[11px] font-semibold tracking-wide text-gray-800 dark:text-gray-200">
                          {order.redeem_code_used || '—'}
                        </span>
                      </td>
                      <td className="max-w-[10rem] px-2 py-2.5 align-top">
                        {emails.length === 0 ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : (
                          <p
                            className="truncate font-mono text-xs text-gray-600 dark:text-gray-300"
                            title={emails.join(', ')}
                          >
                            {emails[0]}
                            {emails.length > 1 ? (
                              <span className="text-gray-400"> +{emails.length - 1}</span>
                            ) : null}
                          </p>
                        )}
                      </td>
                      <td className="max-w-[9rem] px-2 py-2.5 align-top">
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-[12px] font-semibold leading-snug text-gray-800 dark:text-gray-200">
                            {order.products?.title || 'Unknown'}
                          </p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-500">
                            {formatBdDateShort(new Date(order.created_at))}
                          </p>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 align-top tabular-nums">
                        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">৳{order.total_amount}</span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 align-top">
                        <div className="inline-flex items-center gap-1.5">
                          {isOverdue ? (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                          ) : (
                            <Clock className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                          )}
                          <span
                            className={`text-[12px] font-medium tabular-nums ${isOverdue ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'}`}
                          >
                            {formatBdDateTime12(dueDate)}
                          </span>
                        </div>
                      </td>
                      <td className={redeemStickyActionsTdClass}>
                        <div className="flex min-w-[6.5rem] flex-col gap-1.5">
                          <button
                            onClick={() => markPaid(order.id)}
                            title="Mark manual payment as received"
                            className="inline-flex w-full items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-emerald-600/15 px-2 py-1.5 text-[11px] font-semibold text-emerald-800 transition-colors hover:bg-emerald-600/25 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25"
                            type="button"
                          >
                            <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                            Mark paid
                          </button>
                          <button
                            onClick={() => cancelOrder(order.id)}
                            title="Seize: revoke access and cancel order"
                            className="inline-flex w-full items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-red-600/12 px-2 py-1.5 text-[11px] font-semibold text-red-800 transition-colors hover:bg-red-600/20 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/25"
                            type="button"
                          >
                            <Ban className="h-3.5 w-3.5 shrink-0" />
                            Seize
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            ) : null}
            {pendingOrders.length === 0 && (
              <div className="py-14 text-center text-gray-500 dark:text-gray-400 text-sm px-4">
                {redeemListsError
                  ? 'Could not load this list — see the yellow notice above (API error or configuration).'
                  : 'No pending manual payments for redeem orders. Rows appear when someone redeems with payment still pending (cash/bKash not marked paid yet).'}
              </div>
            )}
            {pendingOrders.length > 0 && pendingOrdersFiltered.length === 0 && (
              <div className="py-12 text-center text-gray-500 dark:text-gray-400 text-sm px-4">
                No pending rows match your search. Clear the search box or try name, email, phone, or redeem code.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'revoked' && (
        <div className="bg-white dark:bg-[#151518] rounded-2xl border border-gray-100 dark:border-[#26262d] shadow-soft overflow-hidden">
          <div className="border-b border-gray-100 dark:border-[#26262d] px-4 py-3 sm:px-5 sm:py-4">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-500" />
              Seized redeem orders
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-snug">
              <span className="font-medium text-gray-700 dark:text-gray-300">Bangladesh time · 12-hour</span> — Rows kept for audit. Restore only within 48h; search, toggles, bulk restore.
            </p>
            <details className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              <summary className="cursor-pointer select-none text-indigo-600 hover:underline dark:text-indigo-400 [&::-webkit-details-marker]:hidden">
                More about seized orders
              </summary>
              <p className="mt-2 max-w-3xl border-l-2 border-gray-200 pl-3 leading-relaxed dark:border-gray-700">
                Seize removed Adobe access and cancelled the order. Payment history includes a reversal so totals stay correct. After 48 hours, restore is closed but the row remains for your records.
              </p>
            </details>
          </div>
          {revokedOrders.length > 0 && (
            <div className="border-b border-gray-100 dark:border-[#26262d] bg-gray-50/70 dark:bg-white/[0.03] px-4 sm:px-5 py-3 space-y-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
                <div className="min-w-0 w-full flex-1">
                  <label className="sr-only" htmlFor="revoked-redeem-search">
                    Search seized orders
                  </label>
                  <div className="relative w-full">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                      aria-hidden
                    />
                    <input
                      id="revoked-redeem-search"
                      type="search"
                      value={revokedSearchQuery}
                      onChange={(e) => setRevokedSearchQuery(e.target.value)}
                      placeholder="Search user, code, email…"
                      title="Matches name, email, phone, code, product, Adobe emails, admin who seized, order id."
                      className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/35 dark:border-[#26262d] dark:bg-[#111113] dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:ring-indigo-400/25"
                      autoComplete="off"
                    />
                    {revokedSearchQuery ? (
                      <button
                        type="button"
                        onClick={() => setRevokedSearchQuery('')}
                        className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200"
                        aria-label="Clear search"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  {revokedSearchQuery.trim() ? (
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Showing <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-300">{revokedOrdersFiltered.length}</span> of{' '}
                      <span className="tabular-nums">{revokedOrders.length}</span>
                      {revokedOrdersFiltered.length === 0 ? ' — try another word or clear the search.' : ''}
                    </p>
                  ) : null}
                </div>
                {revokedOrdersFiltered.length > 0 ? (
                  <div className="flex flex-col gap-2 lg:min-w-[14rem] lg:items-end lg:pt-0.5">
                    <p className="text-sm text-gray-600 dark:text-gray-400 lg:text-right">
                      {revokedSelected.size > 0 ? (
                        <>
                          <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{revokedSelected.size}</span> selected —{' '}
                          <span className="tabular-nums text-gray-500 dark:text-gray-400">
                            {revokedSelectedRestoreableCount} can restore
                          </span>
                        </>
                      ) : (
                        <>Top toggle = select all (current search).</>
                      )}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void bulkRevokedRestore()}
                        disabled={revokedBulkLoading || revokedSelectedRestoreableCount === 0}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:pointer-events-none disabled:opacity-40"
                      >
                        {revokedBulkLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                        Bulk restore ({revokedSelectedRestoreableCount})
                      </button>
                      {revokedSelected.size > 0 ? (
                        <button
                          type="button"
                          onClick={() => setRevokedSelected(new Set())}
                          disabled={revokedBulkLoading}
                          className="px-2 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 disabled:opacity-40 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                          Clear selection
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
          <div className="overflow-x-auto rounded-b-2xl overscroll-x-contain [-webkit-overflow-scrolling:touch]">
            {revokedOrders.length > 0 && revokedOrdersFiltered.length > 0 ? (
            <table className="w-full min-w-0 table-auto border-collapse text-[13px] leading-snug">
              <thead className="bg-gray-50/80 dark:bg-white/[0.02]">
                <tr>
                  <th className="w-9 px-1.5 py-3 align-bottom" scope="col">
                    <RedeemSelectToggle
                      state={revokedHeaderSelectState}
                      disabled={revokedOrdersFiltered.length === 0}
                      ariaLabel={
                        revokedHeaderSelectState === 'checked'
                          ? 'Deselect all rows in this list'
                          : 'Select all rows matching the current search'
                      }
                      onToggle={() => {
                        const ids = revokedOrdersFiltered.map((o) => o.id);
                        const allSelected =
                          revokedOrdersFiltered.length > 0 &&
                          revokedOrdersFiltered.every((o) => revokedSelected.has(o.id));
                        if (allSelected) {
                          setRevokedSelected((prev) => {
                            const next = new Set(prev);
                            ids.forEach((id) => next.delete(id));
                            return next;
                          });
                        } else {
                          setRevokedSelected((prev) => new Set([...prev, ...ids]));
                        }
                      }}
                    />
                  </th>
                  <th className="max-w-[11rem] px-2 py-3 text-left align-bottom text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    User
                  </th>
                  <th className="whitespace-nowrap px-2 py-3 text-left align-bottom text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Code
                  </th>
                  <th className="max-w-[10rem] px-2 py-3 text-left align-bottom text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Emails
                  </th>
                  <th className="max-w-[9rem] px-2 py-3 text-left align-bottom text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Product
                  </th>
                  <th className="whitespace-nowrap px-2 py-3 text-left align-bottom text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Amt
                  </th>
                  <th className="whitespace-nowrap px-2 py-3 text-left align-bottom text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Seized
                  </th>
                  <th className="max-w-[7rem] px-2 py-3 text-left align-bottom text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    By
                  </th>
                  <th
                    className={`${redeemStickyActionsThClass} text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400`}
                    scope="col"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-[#26262d]">
                {revokedOrdersFiltered.map((order) => {
                  const emails = order.provisioned_emails || [];
                  const seizedAt = order.redeem_seized_at ? new Date(order.redeem_seized_at) : null;
                  const restoreDeadline =
                    seizedAt != null ? new Date(seizedAt.getTime() + REDEEM_RESTORE_WINDOW_MS) : null;
                  const restoreAllowed = redeemOrderRestoreAllowed(order);
                  return (
                    <tr
                      key={order.id}
                      className="group align-top transition-colors hover:bg-gray-50/50 dark:hover:bg-white/[0.02]"
                    >
                      <td className="px-1.5 py-2.5 align-top">
                        <RedeemSelectToggle
                          state={revokedSelected.has(order.id) ? 'checked' : 'unchecked'}
                          ariaLabel={`Select ${order.users?.name || 'order'}`}
                          onToggle={() => {
                            setRevokedSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(order.id)) next.delete(order.id);
                              else next.add(order.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className="max-w-[11rem] px-2 py-2.5 align-top">
                        <div className="space-y-0.5">
                          <p className="text-[13px] font-semibold leading-tight text-gray-900 dark:text-gray-100">
                            {order.users?.name || 'Unknown'}
                          </p>
                          <p className="break-words text-xs text-gray-600 dark:text-gray-400">{order.users?.email}</p>
                          {order.users?.phone ? (
                            <p className="text-xs tabular-nums text-gray-500 dark:text-gray-500">{order.users.phone}</p>
                          ) : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 align-top">
                        <span className="font-mono text-[11px] font-semibold tracking-wide text-gray-800 dark:text-gray-200">
                          {order.redeem_code_used || '—'}
                        </span>
                      </td>
                      <td className="max-w-[10rem] px-2 py-2.5 align-top">
                        {emails.length === 0 ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : (
                          <p
                            className="truncate font-mono text-xs text-gray-600 dark:text-gray-300"
                            title={emails.join(', ')}
                          >
                            {emails[0]}
                            {emails.length > 1 ? (
                              <span className="text-gray-400"> +{emails.length - 1}</span>
                            ) : null}
                          </p>
                        )}
                      </td>
                      <td className="max-w-[9rem] px-2 py-2.5 align-top">
                        <p className="text-[12px] font-semibold leading-snug text-gray-800 dark:text-gray-200">
                          {order.products?.title || '—'}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 align-top tabular-nums">
                        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">৳{order.total_amount}</span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 align-top tabular-nums text-[12px] text-gray-600 dark:text-gray-300">
                        {seizedAt ? formatBdDateTime12(seizedAt) : '—'}
                      </td>
                      <td className="max-w-[7rem] px-2 py-2.5 align-top text-[12px] leading-snug text-gray-700 dark:text-gray-300">
                        <span className="break-words">
                          {order.seized_by_admin?.name || order.seized_by_admin?.email || order.redeem_seized_by || '—'}
                        </span>
                      </td>
                      <td className={redeemStickyActionsTdClass}>
                        {restoreAllowed ? (
                          <div className="flex min-w-[6.5rem] flex-col gap-1.5">
                            <p className="text-[10px] leading-snug text-gray-500 dark:text-gray-400">
                              By{' '}
                              <span className="font-medium tabular-nums text-gray-700 dark:text-gray-300">
                                {restoreDeadline ? formatBdDateTime12(restoreDeadline) : '—'}
                              </span>
                            </p>
                            <button
                              type="button"
                              onClick={() => restoreOrder(order.id)}
                              className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-emerald-600/15 px-2 py-1.5 text-[11px] font-semibold text-emerald-800 transition-colors hover:bg-emerald-600/25 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25"
                            >
                              <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                              Restore
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] leading-snug text-gray-500 dark:text-gray-400">Closed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            ) : null}
            {revokedOrders.length === 0 && (
              <div className="py-14 text-center text-gray-500 dark:text-gray-400 text-sm px-4">
                {redeemListsError
                  ? 'Could not load this list — see the yellow notice above.'
                  : 'No seized redeem orders yet. After you use Seize on a pending row, it will show here.'}
              </div>
            )}
            {revokedOrders.length > 0 && revokedOrdersFiltered.length === 0 && (
              <div className="py-12 text-center text-gray-500 dark:text-gray-400 text-sm px-4">
                No seized rows match your search. Clear the search box or try another keyword.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
