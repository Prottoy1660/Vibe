import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  Loader2,
  CalendarRange,
  ShoppingCart,
  DollarSign,
  TrendingDown,
  Scale,
  Plus,
  Trash2,
  ChevronRight,
  Users,
  RefreshCw,
} from 'lucide-react';
import {
  format,
  parseISO,
  startOfDay,
  endOfDay,
  subDays,
  startOfMonth,
  endOfMonth,
  subMonths,
  eachDayOfInterval,
  isAfter,
} from 'date-fns';
import { getApiBaseUrl } from '../../lib/apiBase';
import { getAccessTokenForApi } from '../../lib/getAccessTokenForApi';
import { ADMIN_ORDERS_QUERY_LIMIT } from '../../lib/adminDataLimits';
import { toast } from '../../lib/toast';
import { useConfirmDialog } from '../../contexts/ConfirmDialogContext';

interface PaidOrderRow {
  id: string;
  total_amount: number | string;
  created_at: string;
  product_id?: string | null;
  products?: { title?: string | null } | null;
}

interface OperationalExpense {
  id: string;
  category: string;
  amount: number | string;
  currency?: string | null;
  amount_original?: number | string | null;
  fx_rate_to_bdt?: number | string | null;
  vendor_name?: string | null;
  payment_method?: string | null;
  tags?: string[] | null;
  attachment_urls?: string[] | null;
  is_recurring_template?: boolean | null;
  recurrence_interval?: string | null;
  next_due_date?: string | null;
  template_active?: boolean | null;
  template_id?: string | null;
  expense_date: string;
  note: string | null;
  created_at: string;
}

type ExpenseCategoriesSetting = { categories?: unknown };
type PaymentMethodsSetting = { methods?: unknown };
type CategoryBudgetsSetting = { budgets?: unknown };

function money(n: number): string {
  return `৳${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function currencyLabel(c?: string | null): 'BDT' | 'USD' {
  return c === 'USD' ? 'USD' : 'BDT';
}

function fmtOriginalAmount(ex: OperationalExpense): string {
  const c = currencyLabel(ex.currency);
  const original = ex.amount_original != null ? Number(ex.amount_original) : Number(ex.amount || 0);
  if (!Number.isFinite(original)) return c === 'USD' ? 'USD —' : '—';
  return c === 'USD' ? `$${original.toFixed(2)}` : money(original);
}

function fmtBdtAmount(ex: OperationalExpense): string {
  const bdt = Number(ex.amount || 0);
  if (!Number.isFinite(bdt)) return '—';
  return money(bdt);
}

export const AdminFinance = ({
  embedded = false,
  mode = 'finance',
}: {
  embedded?: boolean;
  mode?: 'finance' | 'expenses';
}) => {
  const navigate = useNavigate();
  const { confirm } = useConfirmDialog();
  const isLocalRuntime =
    typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const [rangeStart, setRangeStart] = useState(() => format(startOfDay(new Date()), 'yyyy-MM-dd'));
  const [rangeEnd, setRangeEnd] = useState(() => format(endOfDay(new Date()), 'yyyy-MM-dd'));

  const [orders, setOrders] = useState<PaidOrderRow[]>([]);
  const [expenses, setExpenses] = useState<OperationalExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingExpense, setSavingExpense] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [expCategory, setExpCategory] = useState('');
  const [expPaymentMethod, setExpPaymentMethod] = useState('');
  const [expVendor, setExpVendor] = useState('');
  const [expCurrency, setExpCurrency] = useState<'BDT' | 'USD'>('BDT');
  const [expFxRate, setExpFxRate] = useState('1');
  const [expTags, setExpTags] = useState('');
  const [expAttachments, setExpAttachments] = useState<string[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const attachmentInputRef = React.useRef<HTMLInputElement>(null);
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [expNote, setExpNote] = useState('');

  const [recurrenceInterval, setRecurrenceInterval] = useState<'none' | 'weekly' | 'monthly'>('none');
  const [nextDueDate, setNextDueDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [runningRecurring, setRunningRecurring] = useState(false);
  const [expenseQuery, setExpenseQuery] = useState('');
  const [expensesPane, setExpensesPane] = useState<'overview' | 'add' | 'entries' | 'breakdown' | 'budgets' | 'trends' | 'recurring'>(
    'overview',
  );

  const [categories, setCategories] = useState<string[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [savingCategories, setSavingCategories] = useState(false);

  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(true);
  const [paymentMethodsOpen, setPaymentMethodsOpen] = useState(false);
  const [newPaymentMethod, setNewPaymentMethod] = useState('');
  const [savingPaymentMethods, setSavingPaymentMethods] = useState(false);

  const [budgets, setBudgets] = useState<Record<string, number>>({});
  const [budgetsLoading, setBudgetsLoading] = useState(true);
  const [savingBudgets, setSavingBudgets] = useState(false);

  const [partnerPercent, setPartnerPercent] = useState(0);
  const [savingPartner, setSavingPartner] = useState(false);

  const normalizeCategory = (raw: string) => raw.trim().replace(/\s+/g, ' ');

  useEffect(() => {
    if (mode !== 'expenses') return;
    let cancelled = false;
    const loadCategories = async () => {
      setCategoriesLoading(true);
      try {
        const res = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'operational_expense_categories')
          .maybeSingle();
        if (cancelled) return;
        if (res.error) throw res.error;

        const v = (res.data?.value || {}) as ExpenseCategoriesSetting;
        const raw = (v as any)?.categories;
        const list = Array.isArray(raw) ? raw : [];
        const cleaned = list
          .map((x) => (typeof x === 'string' ? normalizeCategory(x) : ''))
          .filter((x) => x.length > 0);
        const unique = Array.from(new Set(cleaned)).sort((a, b) => a.localeCompare(b));
        setCategories(unique);
      } catch (e) {
        console.warn('operational_expense_categories load failed:', e);
        if (!cancelled) setCategories([]);
      } finally {
        if (!cancelled) setCategoriesLoading(false);
      }
    };
    void loadCategories();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== 'expenses') return;
    let cancelled = false;
    const loadBudgets = async () => {
      setBudgetsLoading(true);
      try {
        const res = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'operational_category_budgets')
          .maybeSingle();
        if (cancelled) return;
        if (res.error) throw res.error;
        const v = (res.data?.value || {}) as CategoryBudgetsSetting;
        const raw = (v as any)?.budgets;
        const obj = raw && typeof raw === 'object' ? raw : {};
        const parsed: Record<string, number> = {};
        for (const [k, val] of Object.entries(obj)) {
          const key = normalizeCategory(String(k));
          const n = Number(val);
          if (!key || !Number.isFinite(n) || n < 0) continue;
          parsed[key] = n;
        }
        setBudgets(parsed);
      } catch (e) {
        console.warn('operational_category_budgets load failed:', e);
        if (!cancelled) setBudgets({});
      } finally {
        if (!cancelled) setBudgetsLoading(false);
      }
    };
    void loadBudgets();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== 'expenses') return;
    let cancelled = false;
    const loadPaymentMethods = async () => {
      setPaymentMethodsLoading(true);
      try {
        const res = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'operational_payment_methods')
          .maybeSingle();
        if (cancelled) return;
        if (res.error) throw res.error;
        const v = (res.data?.value || {}) as PaymentMethodsSetting;
        const raw = (v as any)?.methods;
        const list = Array.isArray(raw) ? raw : [];
        const cleaned = list
          .map((x) => (typeof x === 'string' ? normalizeCategory(x) : ''))
          .filter((x) => x.length > 0);
        const unique = Array.from(new Set(cleaned)).sort((a, b) => a.localeCompare(b));
        setPaymentMethods(unique);
      } catch (e) {
        console.warn('operational_payment_methods load failed:', e);
        if (!cancelled) setPaymentMethods([]);
      } finally {
        if (!cancelled) setPaymentMethodsLoading(false);
      }
    };
    void loadPaymentMethods();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let start = startOfDay(parseISO(rangeStart));
      let end = endOfDay(parseISO(rangeEnd));
      if (isAfter(start, end)) {
        const t = start;
        start = startOfDay(end);
        end = endOfDay(t);
      }

      const token = await getAccessTokenForApi();
      const base = getApiBaseUrl();
      const fromIso = encodeURIComponent(start.toISOString());
      const toIso = encodeURIComponent(end.toISOString());
      const expFrom = format(start, 'yyyy-MM-dd');
      const expTo = format(end, 'yyyy-MM-dd');

      let paidOrders: PaidOrderRow[] = [];
      let expenseRows: OperationalExpense[] = [];

      if (token && base) {
        const [oRes, eRes] = await Promise.all([
          fetch(
            `${base}/api/admin/orders/query?payment_status=paid&from=${fromIso}&to=${toIso}&limit=${ADMIN_ORDERS_QUERY_LIMIT}`,
            { headers: { Authorization: `Bearer ${token}` } },
          ).then(async (r) => {
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j.error || `Orders ${r.status}`);
            const rows = (j.orders || []) as Array<any>;
            return rows.map((o) => ({
              id: o.id,
              total_amount: o.total_amount,
              created_at: o.created_at,
              product_id: o.product_id ?? null,
              products: o.products ?? null,
            })) as PaidOrderRow[];
          }),
          fetch(
            `${base}/api/admin/finance/operational-expenses?from=${encodeURIComponent(expFrom)}&to=${encodeURIComponent(expTo)}`,
            { headers: { Authorization: `Bearer ${token}` } },
          ).then(async (r) => {
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j.error || `Expenses ${r.status}`);
            return (j.expenses || []) as OperationalExpense[];
          }),
        ]);
        paidOrders = oRes;
        expenseRows = eRes;
      } else if (isLocalRuntime) {
        const [oRes, eRes] = await Promise.all([
          supabase
            .from('orders')
            .select('id, total_amount, created_at, product_id, products (title)')
            .eq('payment_status', 'paid')
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString())
            .order('created_at', { ascending: false })
            .limit(ADMIN_ORDERS_QUERY_LIMIT),
          supabase
            .from('operational_expenses')
            .select('*')
            .gte('expense_date', expFrom)
            .lte('expense_date', expTo)
            .order('expense_date', { ascending: false }),
        ]);
        if (oRes.error) throw oRes.error;
        if (eRes.error) throw eRes.error;
        paidOrders = (oRes.data as PaidOrderRow[]) || [];
        expenseRows = (eRes.data as OperationalExpense[]) || [];
      } else {
        // In production, always use admin API (service-role) to avoid RLS making saved rows "disappear" after reload.
        throw new Error('Admin API unavailable. Please refresh/login again or ensure API base URL is configured.');
      }

      const sRes = await supabase.from('system_settings').select('value').eq('key', 'partner_profit_share').maybeSingle();

      setOrders(paidOrders);
      setExpenses(expenseRows);

      let pct = 0;
      if (sRes.error) {
        console.warn('partner_profit_share:', sRes.error);
      }
      const raw = sRes.data?.value;
      if (raw && typeof raw === 'object' && raw !== null && 'percent' in raw) {
        const n = Number((raw as { percent: unknown }).percent);
        if (Number.isFinite(n)) pct = n;
      }
      setPartnerPercent(Math.min(100, Math.max(0, pct)));
    } catch (e) {
      console.error('AdminFinance load:', e);
      toast.error(e instanceof Error ? e.message : 'Failed to load finance data');
    } finally {
      setLoading(false);
    }
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const gross = useMemo(
    () => orders.reduce((s, o) => s + Number(o.total_amount || 0), 0),
    [orders],
  );
  const totalExpenses = useMemo(
    () => expenses.reduce((s, e) => s + Number(e.amount || 0), 0),
    [expenses],
  );
  const net = gross - totalExpenses;
  const orderCount = orders.length;

  const productRevenue = useMemo(() => {
    const map: Record<string, { title: string; revenue: number; count: number }> = {};
    for (const o of orders) {
      const title = String(o.products?.title || 'Unknown product');
      if (!map[title]) map[title] = { title, revenue: 0, count: 0 };
      map[title].revenue += Number(o.total_amount || 0);
      map[title].count += 1;
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [orders]);

  const productProfitEstimate = useMemo(() => {
    // Simple allocation: distribute operational expenses proportional to revenue share.
    // This is an estimate but is useful for deciding which products are most profitable overall.
    if (gross <= 0) {
      return productRevenue.map((p) => ({ ...p, allocatedExpenses: 0, estProfit: p.revenue }));
    }
    return productRevenue.map((p) => {
      const share = p.revenue / gross;
      const allocatedExpenses = totalExpenses * share;
      const estProfit = p.revenue - allocatedExpenses;
      return { ...p, allocatedExpenses, estProfit };
    });
  }, [gross, productRevenue, totalExpenses]);

  const partnerPctClamped = Math.min(100, Math.max(0, partnerPercent));
  const partnerShareAmount = net > 0 ? net * (partnerPctClamped / 100) : 0;
  const yourShareAfterPartner = net - partnerShareAmount;

  const handleSavePartnerPercent = async () => {
    const p = Math.min(100, Math.max(0, partnerPercent));
    setSavingPartner(true);
    try {
      const { error } = await supabase
        .from('system_settings')
        .update({
          value: { percent: p },
          updated_at: new Date().toISOString(),
        })
        .eq('key', 'partner_profit_share');
      if (error) throw error;
      setPartnerPercent(p);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save partner share');
    } finally {
      setSavingPartner(false);
    }
  };

  const dailyRows = useMemo(() => {
    let start = startOfDay(parseISO(rangeStart));
    let end = endOfDay(parseISO(rangeEnd));
    if (isAfter(start, end)) {
      const t = start;
      start = startOfDay(end);
      end = endOfDay(t);
    }
    const days = eachDayOfInterval({ start, end });
    const map: Record<string, { count: number; revenue: number }> = {};
    for (const d of days) {
      map[format(d, 'yyyy-MM-dd')] = { count: 0, revenue: 0 };
    }
    for (const o of orders) {
      const key = format(parseISO(o.created_at), 'yyyy-MM-dd');
      if (!map[key]) map[key] = { count: 0, revenue: 0 };
      map[key].count += 1;
      map[key].revenue += Number(o.total_amount || 0);
    }
    return days.map((d) => {
      const key = format(d, 'yyyy-MM-dd');
      const row = map[key] || { count: 0, revenue: 0 };
      return { date: d, key, ...row };
    });
  }, [orders, rangeStart, rangeEnd]);

  const applyPreset = (preset: 'today' | 'yesterday' | 'last7' | 'thisMonth') => {
    const now = new Date();
    if (preset === 'today') {
      setRangeStart(format(startOfDay(now), 'yyyy-MM-dd'));
      setRangeEnd(format(endOfDay(now), 'yyyy-MM-dd'));
    } else if (preset === 'yesterday') {
      const y = subDays(now, 1);
      setRangeStart(format(startOfDay(y), 'yyyy-MM-dd'));
      setRangeEnd(format(endOfDay(y), 'yyyy-MM-dd'));
    } else if (preset === 'last7') {
      setRangeStart(format(startOfDay(subDays(now, 6)), 'yyyy-MM-dd'));
      setRangeEnd(format(endOfDay(now), 'yyyy-MM-dd'));
    } else {
      setRangeStart(format(startOfMonth(now), 'yyyy-MM-dd'));
      setRangeEnd(format(endOfMonth(now), 'yyyy-MM-dd'));
    }
  };

  const handleAddExpense = async (mode: 'one_off' | 'recurring_template') => {
    const cat = normalizeCategory(expCategory);
    const originalAmt = parseFloat(expAmount);
    const fxRate = expCurrency === 'USD' ? parseFloat(expFxRate) : 1;
    if (!cat) {
      toast.warning('Select a category.');
      return;
    }
    if (categories.length > 0 && !categories.includes(cat)) {
      toast.warning('This category is not in your list. Add it from “Manage”.');
      return;
    }
    if (!Number.isFinite(originalAmt) || originalAmt < 0) {
      toast.warning('Enter a valid amount.');
      return;
    }
    if (expCurrency === 'USD' && (!Number.isFinite(fxRate) || fxRate <= 0)) {
      toast.warning('Enter a valid FX rate (USD → BDT).');
      return;
    }

    const amountBdt = expCurrency === 'USD' ? originalAmt * fxRate : originalAmt;
    setSavingExpense(true);
    try {
      const tags = expTags
        .split(',')
        .map((t) => normalizeCategory(t))
        .filter(Boolean);
      const token = await getAccessTokenForApi();
      const base = getApiBaseUrl().replace(/\/$/, '');
      let row: OperationalExpense | null = null;

      if (token && base) {
        const res = await fetch(`${base}/api/admin/finance/operational-expenses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            category: cat,
            amount: amountBdt,
            currency: expCurrency,
            amount_original: originalAmt,
            fx_rate_to_bdt: fxRate,
            vendor_name: expVendor.trim() || null,
            expense_date: expDate,
            payment_method: expPaymentMethod.trim() || null,
            tags,
            attachment_urls: expAttachments,
            is_recurring_template: mode === 'recurring_template',
            recurrence_interval: mode === 'recurring_template' ? recurrenceInterval : null,
            next_due_date: mode === 'recurring_template' ? nextDueDate : null,
            template_active: mode === 'recurring_template',
            note: expNote.trim() || null,
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
        row = (j.expense || null) as OperationalExpense | null;
      } else if (isLocalRuntime) {
        // Local/dev fallback when admin API isn't available
        const { data, error } = await supabase
          .from('operational_expenses')
          .insert({
            category: cat,
            amount: amountBdt,
            currency: expCurrency,
            amount_original: originalAmt,
            fx_rate_to_bdt: fxRate,
            vendor_name: expVendor.trim() || null,
            expense_date: expDate,
            payment_method: expPaymentMethod.trim() || null,
            tags,
            attachment_urls: expAttachments,
            is_recurring_template: mode === 'recurring_template',
            recurrence_interval: mode === 'recurring_template' ? recurrenceInterval : null,
            next_due_date: mode === 'recurring_template' ? nextDueDate : null,
            template_active: mode === 'recurring_template' ? true : null,
            note: expNote.trim() || null,
          })
          .select('*')
          .single();
        if (error) throw error;
        row = data as OperationalExpense;
      } else {
        throw new Error('Admin API unavailable. Please refresh/login again or ensure API base URL is configured.');
      }

      if (!row) throw new Error('Expense was not returned by server');
      if (row.expense_date >= rangeStart && row.expense_date <= rangeEnd) {
        setExpenses((prev) => [row, ...prev]);
      }
      setExpCategory('');
      setExpPaymentMethod('');
      setExpVendor('');
      setExpCurrency('BDT');
      setExpFxRate('1');
      setExpTags('');
      setExpAttachments([]);
      setExpAmount('');
      setExpNote('');
      setExpDate(format(new Date(), 'yyyy-MM-dd'));
      setRecurrenceInterval('none');
      setNextDueDate(format(new Date(), 'yyyy-MM-dd'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save expense');
    } finally {
      setSavingExpense(false);
    }
  };

  const uploadExpenseAttachment = async (file: File) => {
    setUploadingAttachment(true);
    try {
      const token = await getAccessTokenForApi();
      const base = getApiBaseUrl().replace(/\/$/, '');
      if (!token || !base) {
        throw new Error('API is not available. Sign in as admin and ensure API base URL is set.');
      }

      const signRes = await fetch(`${base}/api/admin/finance/expense-attachments/upload-sign-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          file_name: file.name,
          content_type: file.type,
        }),
      });
      const signJson = await signRes.json().catch(() => ({}));
      if (!signRes.ok) throw new Error(signJson?.error || signJson?.message || 'Failed to get upload URL');

      const bucket = String(signJson.bucket || '');
      const path = String(signJson.path || '');
      const tokenForUpload = String(signJson.token || '');
      const publicUrl = String(signJson.public_url || '');
      if (!bucket || !path || !tokenForUpload || !publicUrl) {
        throw new Error('Upload metadata missing from server');
      }

      const { error: uploadErr } = await supabase.storage.from(bucket).uploadToSignedUrl(path, tokenForUpload, file);
      if (uploadErr) throw uploadErr;

      setExpAttachments((prev) => [...prev, publicUrl]);
      toast.success('Attachment uploaded');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      toast.error(msg);
    } finally {
      setUploadingAttachment(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = '';
    }
  };

  const inferredCategories = useMemo(() => {
    const set = new Set<string>();
    for (const ex of expenses) {
      const c = normalizeCategory(String(ex.category || ''));
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [expenses]);

  const effectiveCategories = categories.length > 0 ? categories : inferredCategories;

  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const ex of expenses) {
      const c = normalizeCategory(String(ex.category || ''));
      if (!c) continue;
      totals[c] = (totals[c] || 0) + Number(ex.amount || 0);
    }
    return Object.entries(totals)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  const [prevMonthExpenses, setPrevMonthExpenses] = useState<OperationalExpense[]>([]);
  const [prevMonthLoading, setPrevMonthLoading] = useState(false);

  useEffect(() => {
    if (mode !== 'expenses') return;
    let cancelled = false;
    const loadPrevMonth = async () => {
      setPrevMonthLoading(true);
      try {
        // Compare the month containing rangeStart vs its previous month.
        const monthStart = startOfMonth(parseISO(rangeStart));
        const monthEnd = endOfMonth(parseISO(rangeStart));
        const prevStart = format(startOfMonth(subMonths(monthStart, 1)), 'yyyy-MM-dd');
        const prevEnd = format(endOfMonth(subMonths(monthStart, 1)), 'yyyy-MM-dd');

        const token = await getAccessTokenForApi();
        const base = getApiBaseUrl().replace(/\/$/, '');
        let rows: OperationalExpense[] = [];
        if (token && base) {
          const res = await fetch(
            `${base}/api/admin/finance/operational-expenses?from=${encodeURIComponent(prevStart)}&to=${encodeURIComponent(prevEnd)}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const j = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(j.error || `Prev month expenses ${res.status}`);
          rows = (j.expenses || []) as OperationalExpense[];
        } else {
          const { data, error } = await supabase
            .from('operational_expenses')
            .select('*')
            .gte('expense_date', prevStart)
            .lte('expense_date', prevEnd);
          if (error) throw error;
          rows = (data as OperationalExpense[]) || [];
        }
        if (cancelled) return;
        setPrevMonthExpenses(rows);
      } catch (e) {
        console.warn('Prev month expenses load failed:', e);
        if (!cancelled) setPrevMonthExpenses([]);
      } finally {
        if (!cancelled) setPrevMonthLoading(false);
      }
    };
    void loadPrevMonth();
    return () => {
      cancelled = true;
    };
  }, [mode, rangeStart]);

  const prevMonthCategoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const ex of prevMonthExpenses) {
      const c = normalizeCategory(String(ex.category || ''));
      if (!c) continue;
      totals[c] = (totals[c] || 0) + Number(ex.amount || 0);
    }
    return totals;
  }, [prevMonthExpenses]);

  const momRows = useMemo(() => {
    const current = categoryTotals.reduce<Record<string, number>>((acc, r) => {
      acc[r.category] = r.amount;
      return acc;
    }, {});
    const cats = new Set<string>([...Object.keys(current), ...Object.keys(prevMonthCategoryTotals)]);
    const rows = Array.from(cats).map((category) => {
      const cur = Number(current[category] || 0);
      const prev = Number(prevMonthCategoryTotals[category] || 0);
      const delta = cur - prev;
      const pct = prev > 0 ? (delta / prev) * 100 : cur > 0 ? 100 : 0;
      return { category, current: cur, previous: prev, delta, pct };
    });
    return rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [categoryTotals, prevMonthCategoryTotals]);

  const saveCategories = async (next: string[]) => {
    setSavingCategories(true);
    try {
      const cleaned = next
        .map((c) => normalizeCategory(c))
        .filter((c) => c.length > 0);
      const unique = Array.from(new Set(cleaned)).sort((a, b) => a.localeCompare(b));
      const token = await getAccessTokenForApi();
      const base = getApiBaseUrl().replace(/\/$/, '');
      if (!token || !base) throw new Error('API is not available');
      const res = await fetch(`${base}/api/admin/finance/presets`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: 'operational_expense_categories', value: { categories: unique } }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setCategories(unique);
      toast.success('Expense categories saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save categories');
    } finally {
      setSavingCategories(false);
    }
  };

  const inferredPaymentMethods = useMemo(() => {
    const set = new Set<string>();
    for (const ex of expenses) {
      const pm = normalizeCategory(String((ex as any)?.payment_method || ''));
      if (pm) set.add(pm);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [expenses]);

  const effectivePaymentMethods = paymentMethods.length > 0 ? paymentMethods : inferredPaymentMethods;

  const expensesFiltered = useMemo(() => {
    const q = expenseQuery.trim().toLowerCase();
    if (!q) return expenses;
    const tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return expenses;
    return expenses.filter((ex) => {
      const haystack = [
        ex.category,
        ex.note,
        ex.vendor_name,
        ex.payment_method,
        ex.currency,
        ...(ex.tags || []),
        ...(ex.attachment_urls || []),
      ]
        .filter((s): s is string => typeof s === 'string' && s.length > 0)
        .join(' ')
        .toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }, [expenseQuery, expenses]);

  const savePaymentMethods = async (next: string[]) => {
    setSavingPaymentMethods(true);
    try {
      const cleaned = next
        .map((m) => normalizeCategory(m))
        .filter((m) => m.length > 0);
      const unique = Array.from(new Set(cleaned)).sort((a, b) => a.localeCompare(b));
      const token = await getAccessTokenForApi();
      const base = getApiBaseUrl().replace(/\/$/, '');
      if (!token || !base) throw new Error('API is not available');
      const res = await fetch(`${base}/api/admin/finance/presets`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: 'operational_payment_methods', value: { methods: unique } }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setPaymentMethods(unique);
      toast.success('Payment methods saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save payment methods');
    } finally {
      setSavingPaymentMethods(false);
    }
  };

  const saveBudgets = async (next: Record<string, number>) => {
    setSavingBudgets(true);
    try {
      const cleaned: Record<string, number> = {};
      for (const [k, v] of Object.entries(next || {})) {
        const key = normalizeCategory(String(k));
        const n = Number(v);
        if (!key || !Number.isFinite(n) || n < 0) continue;
        cleaned[key] = n;
      }
      const token = await getAccessTokenForApi();
      const base = getApiBaseUrl().replace(/\/$/, '');
      if (!token || !base) throw new Error('API is not available');
      const res = await fetch(`${base}/api/admin/finance/presets`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: 'operational_category_budgets', value: { budgets: cleaned } }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setBudgets(cleaned);
      toast.success('Budgets saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save budgets');
    } finally {
      setSavingBudgets(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    const ok = await confirm({
      title: 'Delete this expense?',
      description: 'This row will be removed from operational expenses.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    setDeletingId(id);
    try {
      const token = await getAccessTokenForApi();
      const base = getApiBaseUrl().replace(/\/$/, '');
      if (token && base) {
        const res = await fetch(`${base}/api/admin/finance/operational-expenses/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      } else {
        const { error } = await supabase.from('operational_expenses').delete().eq('id', id);
        if (error) throw error;
      }
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const rangeToolbar = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['today', 'Today'],
            ['yesterday', 'Yesterday'],
            ['last7', 'Last 7 days'],
            ['thisMonth', 'This month'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => applyPreset(k)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-gray-700 dark:text-gray-200 hover:border-indigo-300 dark:hover:border-indigo-500/40 transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
          From
          <input
            type="date"
            value={rangeStart}
            onChange={(e) => setRangeStart(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm text-gray-900 dark:text-gray-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
          To
          <input
            type="date"
            value={rangeEnd}
            onChange={(e) => setRangeEnd(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm text-gray-900 dark:text-gray-100"
          />
        </label>
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarRange className="w-4 h-4" />}
          Refresh
        </button>
      </div>
    </div>
  );

  const kpiCards = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 shadow-sm relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-blue-500/10 blur-2xl" />
          <div className="relative flex justify-between items-start gap-2">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Paid orders</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1 tabular-nums">{orderCount}</p>
              <p className="text-[11px] text-gray-500 mt-1">In selected date range</p>
            </div>
            <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
              <ShoppingCart className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 shadow-sm relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-emerald-500/10 blur-2xl" />
          <div className="relative flex justify-between items-start gap-2">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Gross revenue</p>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1 tabular-nums">
                {money(gross)}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">Paid &amp; completed orders</p>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 shadow-sm relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-orange-500/10 blur-2xl" />
          <div className="relative flex justify-between items-start gap-2">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Operational expenses</p>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1 tabular-nums">
                {money(totalExpenses)}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">Manual entries below</p>
            </div>
            <div className="p-2.5 rounded-xl bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-indigo-200/60 dark:border-indigo-500/30 bg-gradient-to-br from-indigo-50/90 to-violet-50/50 dark:from-indigo-950/40 dark:to-violet-950/20 p-5 shadow-sm relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-indigo-500/15 blur-2xl" />
          <div className="relative flex justify-between items-start gap-2">
            <div>
              <p className="text-xs font-bold text-indigo-800/80 dark:text-indigo-200 uppercase tracking-wide">Net profit</p>
              <p
                className={`text-2xl sm:text-3xl font-bold mt-1 tabular-nums ${
                  net >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {money(net)}
              </p>
              <p className="text-[11px] text-indigo-900/70 dark:text-indigo-200/80 mt-1">Gross − expenses</p>
            </div>
            <div className="p-2.5 rounded-xl bg-indigo-200/50 dark:bg-indigo-500/30 text-indigo-800 dark:text-indigo-200">
              <Scale className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-fuchsia-200/60 dark:border-fuchsia-500/25 bg-gradient-to-br from-fuchsia-50/80 to-pink-50/40 dark:from-fuchsia-950/30 dark:to-pink-950/15 p-5 shadow-sm relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-fuchsia-500/10 blur-2xl" />
          <div className="relative flex justify-between items-start gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold text-fuchsia-900/80 dark:text-fuchsia-200 uppercase tracking-wide">
                Partner share
              </p>
              <p className="text-2xl sm:text-3xl font-bold text-fuchsia-900 dark:text-fuchsia-100 mt-1 tabular-nums">
                {money(partnerShareAmount)}
              </p>
              <p className="text-[11px] text-fuchsia-900/70 dark:text-fuchsia-200/80 mt-1">
                {partnerPctClamped}% of net profit
                {net <= 0 ? ' (share applies only when net profit is positive)' : ''}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-fuchsia-200/60 dark:bg-fuchsia-500/25 text-fuchsia-800 dark:text-fuchsia-200 shrink-0">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-teal-200/60 dark:border-teal-500/25 bg-gradient-to-br from-teal-50/90 to-cyan-50/50 dark:from-teal-950/35 dark:to-cyan-950/20 p-5 shadow-sm relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-teal-500/10 blur-2xl" />
          <div className="relative flex justify-between items-start gap-2">
            <div>
              <p className="text-xs font-bold text-teal-900/80 dark:text-teal-200 uppercase tracking-wide">Your share</p>
              <p
                className={`text-2xl sm:text-3xl font-bold mt-1 tabular-nums ${
                  yourShareAfterPartner >= 0 ? 'text-teal-800 dark:text-teal-200' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {money(yourShareAfterPartner)}
              </p>
              <p className="text-[11px] text-teal-900/70 dark:text-teal-200/80 mt-1">Net profit − partner share</p>
            </div>
            <div className="p-2.5 rounded-xl bg-teal-200/50 dark:bg-teal-500/30 text-teal-900 dark:text-teal-200">
              <Scale className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const partnerShareSettings = (
    <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-4 md:p-5 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-end gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Partner share</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Set what fraction of <span className="font-medium text-gray-700 dark:text-gray-300">net profit</span> (after
            operational expenses) goes to the partner for this date range view. Saved for all future ranges.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
            Percent
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={Number.isFinite(partnerPercent) ? partnerPercent : 0}
              onChange={(e) => setPartnerPercent(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
              className="w-28 px-3 py-2 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm font-semibold tabular-nums"
            />
          </label>
          <span className="pb-2 text-sm text-gray-500 dark:text-gray-400">% of net profit</span>
          <button
            type="button"
            onClick={() => void handleSavePartnerPercent()}
            disabled={savingPartner}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-fuchsia-600 text-white hover:bg-fuchsia-500 disabled:opacity-50"
          >
            {savingPartner ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save
          </button>
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 md:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Profit snapshot
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-xl">
              Pick a range, see sales and net profit after your operational costs. Full expense editor lives on the
              dedicated page.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin?tab=finance')}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500"
          >
            Open profit &amp; expenses
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {rangeToolbar}
        {loading && orders.length === 0 && expenses.length === 0 ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        ) : (
          kpiCards
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shrink-0">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
                {mode === 'expenses' ? 'Expenses' : 'Profit & expenses'}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
                {mode === 'expenses'
                  ? 'Record and manage operational costs: categories, payment methods, attachments, budgets, recurring templates, and trends.'
                  : 'Sales and revenue are taken automatically from paid orders. Net profit is gross revenue minus operational expenses. Partner share is a percentage of that net profit.'}
              </p>
            </div>
          </div>
        </div>
        <div className="relative mt-6">{rangeToolbar}</div>
      </div>

      {mode === 'finance' ? partnerShareSettings : null}

      {loading && orders.length === 0 && expenses.length === 0 ? (
        <div className="flex justify-center py-20 rounded-2xl border border-dashed border-gray-200 dark:border-[#303038]">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
        </div>
      ) : (
        <>
          {mode === 'finance' ? kpiCards : null}

          {mode === 'finance' ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 md:p-6 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">Profit by product (estimate)</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Revenue by product with operational expenses allocated proportionally to revenue share.
              </p>
              {productProfitEstimate.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center border border-dashed border-gray-200 dark:border-[#303038] rounded-xl">
                  No paid orders in this range.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-[#26262d] max-h-[min(60vh,420px)] overflow-y-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-gray-50/95 dark:bg-white/5 backdrop-blur border-b border-gray-100 dark:border-[#26262d]">
                      <tr>
                        <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase">Product</th>
                        <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase text-right">Orders</th>
                        <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase text-right">Revenue</th>
                        <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase text-right">Allocated exp.</th>
                        <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase text-right">Est. profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productProfitEstimate.slice(0, 12).map((p) => (
                        <tr
                          key={`prod-${p.title}`}
                          className="border-b border-gray-50 dark:border-white/[0.03] hover:bg-gray-50/50 dark:hover:bg-white/[0.02]"
                        >
                          <td className="py-2 px-3 text-gray-800 dark:text-gray-200 max-w-[280px] truncate" title={p.title}>
                            {p.title}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">
                            {p.count}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-gray-800 dark:text-gray-200">
                            {money(p.revenue)}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                            {money(p.allocatedExpenses)}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                            {money(p.estProfit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              </div>

              <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 md:p-6 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">Sales by day</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Order count and revenue per calendar day in your range.
              </p>
              <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-[#26262d] max-h-[min(60vh,420px)] overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-gray-50/95 dark:bg-white/5 backdrop-blur border-b border-gray-100 dark:border-[#26262d]">
                    <tr>
                      <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase">Date</th>
                      <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase text-right">Orders</th>
                      <th className="py-2.5 px-3 text-[10px] font-bold text-gray-500 uppercase text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyRows.map((r) => (
                      <tr
                        key={r.key}
                        className="border-b border-gray-50 dark:border-white/[0.03] hover:bg-gray-50/50 dark:hover:bg-white/[0.02]"
                      >
                        <td className="py-2 px-3 text-gray-800 dark:text-gray-200 whitespace-nowrap">
                          {format(r.date, 'EEE, MMM d, yyyy')}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">
                          {r.count}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-gray-800 dark:text-gray-200">
                          {money(r.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 md:p-6 shadow-sm">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/[0.03] p-4">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Expenses (BDT)</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1 tabular-nums">{money(totalExpenses)}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-1">Total for selected range</p>
                </div>
                <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/[0.03] p-4">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Entries</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1 tabular-nums">{expenses.length}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-1">Expense rows in range</p>
                </div>
                <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/[0.03] p-4">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Top category</p>
                  <p className="text-base font-bold text-gray-900 dark:text-gray-100 mt-1 truncate">
                    {categoryTotals[0]?.category || '—'}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-1 tabular-nums">
                    {categoryTotals[0] ? money(categoryTotals[0].amount) : '—'}
                  </p>
                </div>
              </div>

              <div className="mb-6 flex flex-wrap items-center gap-2">
                {(
                  [
                    { id: 'overview', label: 'Overview' },
                    { id: 'add', label: 'Add expense' },
                    { id: 'entries', label: 'Entries' },
                    { id: 'breakdown', label: 'Breakdown' },
                    { id: 'budgets', label: 'Budgets' },
                    { id: 'trends', label: 'Trends' },
                    { id: 'recurring', label: 'Recurring' },
                  ] as const
                ).map((t) => {
                  const active = expensesPane === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setExpensesPane(t.id)}
                      className={
                        active
                          ? 'inline-flex items-center justify-center rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-extrabold text-white'
                          : 'inline-flex items-center justify-center rounded-full border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.04]'
                      }
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {expensesPane === 'overview' ? (
                <div className="space-y-5">
                  {(() => {
                    const now = new Date();
                    const start = startOfDay(parseISO(rangeStart));
                    const end = endOfDay(parseISO(rangeEnd));
                    const daysInRange = Math.max(1, eachDayOfInterval({ start, end }).length);

                    const totalUsdOriginal = expenses.reduce((acc, ex) => {
                      const c = currencyLabel(ex.currency);
                      if (c !== 'USD') return acc;
                      const orig = Number(ex.amount_original ?? ex.amount ?? 0);
                      return acc + (Number.isFinite(orig) ? orig : 0);
                    }, 0);

                    const avgPerDay = totalExpenses / daysInRange;

                    const biggest = expenses.reduce<{ id: string; category: string; amount: number } | null>((best, ex) => {
                      const a = Number(ex.amount ?? 0);
                      if (!Number.isFinite(a)) return best;
                      if (!best || a > best.amount) return { id: ex.id, category: ex.category, amount: a };
                      return best;
                    }, null);

                    const uniqueVendors = new Set(
                      expenses
                        .map((e) => (e.vendor_name || '').trim())
                        .filter((v) => v.length > 0)
                        .map((v) => v.toLowerCase()),
                    ).size;

                    const attachmentsCount = expenses.reduce((acc, e) => acc + (e.attachment_urls?.length || 0), 0);

                    const overBudgetCount = categoryTotals.reduce((acc, row) => {
                      const budget = budgets[row.category];
                      const hasBudget = Number.isFinite(Number(budget)) && Number(budget) > 0;
                      const over = hasBudget ? row.amount > Number(budget) : false;
                      return acc + (over ? 1 : 0);
                    }, 0);

                    const dueTemplates = expenses.filter((e) => {
                      if (e.is_recurring_template !== true) return false;
                      if (e.template_active === false) return false;
                      if (!e.next_due_date) return false;
                      try {
                        const due = startOfDay(parseISO(e.next_due_date + 'T12:00:00'));
                        return !isAfter(due, startOfDay(now));
                      } catch {
                        return false;
                      }
                    }).length;

                    return (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                          <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/[0.03] p-4">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Spent (BDT eq.)</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1 tabular-nums">{money(totalExpenses)}</p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-1">Total for selected range</p>
                          </div>
                          <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/[0.03] p-4">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Entries</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1 tabular-nums">{expenses.length}</p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-1">
                              Avg/day {money(avgPerDay)} · {daysInRange} day(s)
                            </p>
                          </div>
                          <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/[0.03] p-4">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Top category</p>
                            <p className="text-base font-bold text-gray-900 dark:text-gray-100 mt-1 truncate">{categoryTotals[0]?.category || '—'}</p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-1 tabular-nums">
                              {categoryTotals[0] ? money(categoryTotals[0].amount) : '—'}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/[0.03] p-4">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Quality</p>
                            <p className="text-base font-bold text-gray-900 dark:text-gray-100 mt-1">
                              {overBudgetCount > 0 ? `${overBudgetCount} over budget` : 'On track'}
                            </p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-1">
                              {uniqueVendors} vendor(s) · {attachmentsCount} attachment(s)
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                          <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-4">
                            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Quick highlights</p>
                            <div className="mt-3 grid gap-2">
                              <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 dark:border-[#26262d] bg-gray-50/70 dark:bg-white/[0.04] px-3 py-2">
                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">USD spend (original)</span>
                                <span className="text-xs font-extrabold tabular-nums text-gray-900 dark:text-gray-100">
                                  {totalUsdOriginal > 0 ? `$${totalUsdOriginal.toFixed(2)}` : '—'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 dark:border-[#26262d] bg-gray-50/70 dark:bg-white/[0.04] px-3 py-2">
                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Biggest expense</span>
                                <span className="text-xs font-extrabold tabular-nums text-gray-900 dark:text-gray-100">
                                  {biggest ? money(biggest.amount) : '—'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 dark:border-[#26262d] bg-gray-50/70 dark:bg-white/[0.04] px-3 py-2">
                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Due recurring templates</span>
                                <span className="text-xs font-extrabold tabular-nums text-gray-900 dark:text-gray-100">{dueTemplates}</span>
                              </div>
                            </div>
                            <p className="mt-3 text-[11px] text-gray-500 dark:text-gray-400">
                              Use the tabs above to open a dedicated view (Entries / Breakdown / Budgets / Trends / Recurring).
                            </p>
                          </div>

                          <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-4 xl:col-span-2">
                            <div className="flex items-end justify-between gap-3">
                              <div>
                                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Top categories</p>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Top spend for selected range</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setExpensesPane('breakdown')}
                                className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:underline"
                              >
                                Open breakdown
                              </button>
                            </div>

                            {categoryTotals.length === 0 ? (
                              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 py-6 text-center border border-dashed border-gray-200 dark:border-[#303038] rounded-xl">
                                No category data yet.
                              </p>
                            ) : (
                              <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100 dark:border-[#26262d]">
                                <table className="w-full text-left text-sm">
                                  <thead className="bg-gray-50/95 dark:bg-white/5 border-b border-gray-100 dark:border-[#26262d]">
                                    <tr>
                                      <th className="py-2 px-3 text-[10px] font-bold text-gray-500 uppercase">Category</th>
                                      <th className="py-2 px-3 text-[10px] font-bold text-gray-500 uppercase text-right">Spent</th>
                                      <th className="py-2 px-3 text-[10px] font-bold text-gray-500 uppercase text-right">Share</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {categoryTotals.slice(0, 6).map((row) => {
                                      const pct = totalExpenses > 0 ? (row.amount / totalExpenses) * 100 : 0;
                                      return (
                                        <tr key={`ov-ct-${row.category}`} className="border-b border-gray-50 dark:border-white/[0.03]">
                                          <td className="py-2 px-3 font-medium text-gray-900 dark:text-gray-100">{row.category}</td>
                                          <td className="py-2 px-3 text-right tabular-nums text-gray-900 dark:text-gray-100">{money(row.amount)}</td>
                                          <td className="py-2 px-3 text-right tabular-nums text-gray-700 dark:text-gray-300">{pct.toFixed(1)}%</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : null}

              {expensesPane === 'add' ? (
                <>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">Add operational expense</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                    Pick a saved category and record your cost. Expenses subtract from gross revenue to calculate net profit.
                  </p>
                  <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                  <select
                    value={expCategory}
                    onChange={(e) => setExpCategory(e.target.value)}
                    disabled={categoriesLoading}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm disabled:opacity-60"
                  >
                    <option value="">{categoriesLoading ? 'Loading categories…' : 'Select category'}</option>
                    {effectiveCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setCategoriesOpen((v) => !v)}
                    className="inline-flex items-center justify-center rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] px-4 py-2.5 text-sm font-semibold text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-[#23232a]"
                  >
                    Manage
                  </button>
                </div>

                {categoriesOpen ? (
                  <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-gray-50/70 dark:bg-white/[0.04] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Expense categories</p>
                        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                          Add categories once, then select from dropdown when recording expenses.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCategoriesOpen(false)}
                        className="text-xs font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                      >
                        Close
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                      <input
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        placeholder='e.g. "API", "Hosting", "Ads"'
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm"
                      />
                      <button
                        type="button"
                        disabled={savingCategories}
                        onClick={() => {
                          const c = normalizeCategory(newCategory);
                          if (!c) return;
                          setNewCategory('');
                          void saveCategories([...(categories.length ? categories : effectiveCategories), c]);
                        }}
                        className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                      >
                        Add
                      </button>
                    </div>

                    {effectiveCategories.length === 0 ? (
                      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">No categories yet. Add your first one.</p>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {effectiveCategories.map((c) => (
                          <button
                            key={`cat-${c}`}
                            type="button"
                            disabled={savingCategories}
                            onClick={async () => {
                              const ok = await confirm({
                                title: 'Remove this category?',
                                description: `Remove “${c}” from the dropdown list. Existing expenses will keep their saved category text.`,
                                confirmLabel: 'Remove',
                                variant: 'danger',
                              });
                              if (!ok) return;
                              void saveCategories((categories.length ? categories : effectiveCategories).filter((x) => x !== c));
                              if (expCategory === c) setExpCategory('');
                            }}
                            className="inline-flex items-center gap-2 rounded-full border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] px-3 py-1.5 text-xs font-semibold text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-[#23232a] disabled:opacity-60"
                            title="Click to remove"
                          >
                            {c}
                            <Trash2 className="h-3.5 w-3.5 text-gray-400" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                  <select
                    value={expPaymentMethod}
                    onChange={(e) => setExpPaymentMethod(e.target.value)}
                    disabled={paymentMethodsLoading}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm disabled:opacity-60"
                  >
                    <option value="">{paymentMethodsLoading ? 'Loading payment methods…' : 'Select payment method'}</option>
                    {effectivePaymentMethods.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setPaymentMethodsOpen((v) => !v)}
                    className="inline-flex items-center justify-center rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] px-4 py-2.5 text-sm font-semibold text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-[#23232a]"
                  >
                    Manage
                  </button>
                </div>

                {paymentMethodsOpen ? (
                  <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-gray-50/70 dark:bg-white/[0.04] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Payment methods</p>
                        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                          Save once, then select from dropdown when recording expenses.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPaymentMethodsOpen(false)}
                        className="text-xs font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                      >
                        Close
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                      <input
                        value={newPaymentMethod}
                        onChange={(e) => setNewPaymentMethod(e.target.value)}
                        placeholder='e.g. "Card", "Bank", "Wise", "USDT"'
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm"
                      />
                      <button
                        type="button"
                        disabled={savingPaymentMethods}
                        onClick={() => {
                          const m = normalizeCategory(newPaymentMethod);
                          if (!m) return;
                          setNewPaymentMethod('');
                          void savePaymentMethods([...(paymentMethods.length ? paymentMethods : effectivePaymentMethods), m]);
                        }}
                        className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                      >
                        Add
                      </button>
                    </div>

                    {effectivePaymentMethods.length === 0 ? (
                      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">No payment methods yet. Add your first one.</p>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {effectivePaymentMethods.map((m) => (
                          <button
                            key={`pm-${m}`}
                            type="button"
                            disabled={savingPaymentMethods}
                            onClick={async () => {
                              const ok = await confirm({
                                title: 'Remove this payment method?',
                                description: `Remove “${m}” from the dropdown list. Existing expenses will keep their saved text.`,
                                confirmLabel: 'Remove',
                                variant: 'danger',
                              });
                              if (!ok) return;
                              void savePaymentMethods((paymentMethods.length ? paymentMethods : effectivePaymentMethods).filter((x) => x !== m));
                              if (expPaymentMethod === m) setExpPaymentMethod('');
                            }}
                            className="inline-flex items-center gap-2 rounded-full border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] px-3 py-1.5 text-xs font-semibold text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-[#23232a] disabled:opacity-60"
                            title="Click to remove"
                          >
                            {m}
                            <Trash2 className="h-3.5 w-3.5 text-gray-400" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={expVendor}
                    onChange={(e) => setExpVendor(e.target.value)}
                    placeholder="Vendor / payee (optional)"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm"
                  />
                  <select
                    value={expCurrency}
                    onChange={(e) => setExpCurrency(e.target.value as 'BDT' | 'USD')}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm"
                  >
                    <option value="BDT">Currency: BDT</option>
                    <option value="USD">Currency: USD</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    placeholder={expCurrency === 'USD' ? 'Amount (USD)' : 'Amount (BDT)'}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm"
                  />
                  {expCurrency === 'USD' ? (
                    <input
                      type="number"
                      min={0}
                      step="0.000001"
                      value={expFxRate}
                      onChange={(e) => setExpFxRate(e.target.value)}
                      placeholder="FX rate (1 USD = ? BDT)"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm"
                    />
                  ) : (
                    <input
                      type="text"
                      value="FX: 1"
                      readOnly
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200/60 dark:border-[#303038] bg-gray-50 dark:bg-[#16161c] text-sm text-gray-500 dark:text-gray-400"
                    />
                  )}
                  <input
                    type="date"
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm"
                  />
                </div>
                <input
                  type="text"
                  value={expNote}
                  onChange={(e) => setExpNote(e.target.value)}
                  placeholder="Note (optional)"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm"
                />
                <input
                  type="text"
                  value={expTags}
                  onChange={(e) => setExpTags(e.target.value)}
                  placeholder="Tags (comma separated) e.g. api, adobe, hosting"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm"
                />

                <details className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-gray-50/70 dark:bg-white/[0.04] p-4">
                  <summary className="cursor-pointer list-none select-none font-bold text-sm text-gray-900 dark:text-gray-100 [&::-webkit-details-marker]:hidden flex items-center justify-between">
                    <span>Attachments</span>
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                      {expAttachments.length > 0 ? `${expAttachments.length} file(s)` : 'Optional'}
                    </span>
                  </summary>
                  <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">Upload invoice/screenshot (png, jpg, webp, pdf).</p>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <input
                      ref={attachmentInputRef}
                      type="file"
                      className="hidden"
                      accept=".png,.jpg,.jpeg,.webp,.pdf"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        void uploadExpenseAttachment(f);
                      }}
                    />
                    <button
                      type="button"
                      disabled={uploadingAttachment}
                      onClick={() => attachmentInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                    >
                      {uploadingAttachment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Upload
                    </button>
                  </div>

                  {expAttachments.length === 0 ? (
                    <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">No attachments yet.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {expAttachments.map((url) => (
                        <div
                          key={url}
                          className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] px-3 py-2"
                        >
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="min-w-0 truncate text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:underline"
                            title={url}
                          >
                            {url}
                          </a>
                          <button
                            type="button"
                            onClick={() => setExpAttachments((prev) => prev.filter((u) => u !== url))}
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                            title="Remove"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </details>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleAddExpense('one_off')}
                    disabled={savingExpense}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50"
                  >
                    {savingExpense ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Add expense
                  </button>
                </div>

                <details className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-gray-50/70 dark:bg-white/[0.04] p-4">
                  <summary className="cursor-pointer list-none select-none font-bold text-sm text-gray-900 dark:text-gray-100 [&::-webkit-details-marker]:hidden flex items-center justify-between">
                    <span>Recurring expense template</span>
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Optional</span>
                  </summary>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                    Create a template that can generate due expense rows automatically.
                  </p>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select
                      value={recurrenceInterval}
                      onChange={(e) => setRecurrenceInterval(e.target.value as any)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm"
                    >
                      <option value="none">Not recurring</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                    <input
                      type="date"
                      value={nextDueDate}
                      onChange={(e) => setNextDueDate(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={savingExpense || recurrenceInterval === 'none'}
                    onClick={() => void handleAddExpense('recurring_template')}
                    className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {savingExpense ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Save recurring template
                  </button>
                </details>
                  </div>
                </>
              ) : null}

              {expensesPane === 'breakdown' ? (
                <div className="mt-8 rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Category breakdown</h3>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">High-level view for the selected range.</p>
                    </div>
                  </div>

                  {categoryTotals.length === 0 ? (
                    <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 py-6 text-center border border-dashed border-gray-200 dark:border-[#303038] rounded-xl">
                      No category data yet.
                    </p>
                  ) : (
                    <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100 dark:border-[#26262d]">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50/95 dark:bg-white/5 border-b border-gray-100 dark:border-[#26262d]">
                          <tr>
                            <th className="py-2 px-3 text-[10px] font-bold text-gray-500 uppercase">Category</th>
                            <th className="py-2 px-3 text-[10px] font-bold text-gray-500 uppercase text-right">Spent</th>
                            <th className="py-2 px-3 text-[10px] font-bold text-gray-500 uppercase text-right">Budget</th>
                            <th className="py-2 px-3 text-[10px] font-bold text-gray-500 uppercase text-right">Share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categoryTotals.slice(0, 24).map((row) => {
                            const pct = totalExpenses > 0 ? (row.amount / totalExpenses) * 100 : 0;
                            const budget = budgets[row.category];
                            const hasBudget = Number.isFinite(Number(budget)) && Number(budget) > 0;
                            const over = hasBudget ? row.amount > Number(budget) : false;
                            return (
                              <tr
                                key={`ct-${row.category}`}
                                className={`border-b border-gray-50 dark:border-white/[0.03] ${over ? 'bg-amber-50/70 dark:bg-amber-500/10' : ''}`}
                                title={over ? 'Over budget' : undefined}
                              >
                                <td className="py-2 px-3 font-medium text-gray-900 dark:text-gray-100">{row.category}</td>
                                <td className="py-2 px-3 text-right tabular-nums text-gray-900 dark:text-gray-100">{money(row.amount)}</td>
                                <td className="py-2 px-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                                  {hasBudget ? money(Number(budget)) : budgetsLoading ? '…' : '—'}
                                </td>
                                <td className="py-2 px-3 text-right tabular-nums text-gray-700 dark:text-gray-300">{pct.toFixed(1)}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : null}

              {expensesPane === 'budgets' ? (
                <div className="mt-8 rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Monthly budgets (BDT)</h3>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Set per-category monthly budgets to highlight overspend.</p>
                    </div>
                    <button
                      type="button"
                      disabled={savingBudgets}
                      onClick={() => void saveBudgets(budgets)}
                      className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                    >
                      Save budgets
                    </button>
                  </div>

                  <div className="mt-4 grid gap-2">
                    {(effectiveCategories.length > 0 ? effectiveCategories : categoryTotals.map((r) => r.category)).slice(0, 24).map((cat) => (
                      <div
                        key={`budget-${cat}`}
                        className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3 items-center rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] px-3 py-2"
                      >
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{cat}</div>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={budgets[cat] ?? ''}
                          onChange={(e) =>
                            setBudgets((prev) => ({
                              ...prev,
                              [cat]: e.target.value === '' ? 0 : Number(e.target.value),
                            }))
                          }
                          placeholder="Budget (৳)"
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#151518] text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {expensesPane === 'recurring' ? (
                <div className="mt-8 rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Recurring runner</h3>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Generate due expenses (next due date ≤ today).</p>
                    </div>
                    <button
                      type="button"
                      disabled={runningRecurring}
                      onClick={async () => {
                        setRunningRecurring(true);
                        try {
                          const token = await getAccessTokenForApi();
                          const base = getApiBaseUrl().replace(/\/$/, '');
                          if (!token || !base) throw new Error('API is not available');
                          const res = await fetch(`${base}/api/admin/finance/recurring/run`, {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${token}` },
                          });
                          const j = await res.json().catch(() => ({}));
                          if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
                          toast.success(`Generated ${Number(j.generated || 0)} expense(s)`);
                          await loadData();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : 'Failed to run recurring');
                        } finally {
                          setRunningRecurring(false);
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                    >
                      {runningRecurring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Run now
                    </button>
                  </div>
                </div>
              ) : null}

              {expensesPane === 'trends' ? (
                <div className="mt-8 rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Month-over-month (by category)</h3>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Compare this month vs last month.</p>
                    </div>
                  </div>

                  {prevMonthLoading ? (
                    <div className="mt-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading last month…
                    </div>
                  ) : momRows.length === 0 ? (
                    <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 py-6 text-center border border-dashed border-gray-200 dark:border-[#303038] rounded-xl">
                      No month-over-month data yet.
                    </p>
                  ) : (
                    <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100 dark:border-[#26262d]">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50/95 dark:bg-white/5 border-b border-gray-100 dark:border-[#26262d]">
                          <tr>
                            <th className="py-2 px-3 text-[10px] font-bold text-gray-500 uppercase">Category</th>
                            <th className="py-2 px-3 text-[10px] font-bold text-gray-500 uppercase text-right">This month</th>
                            <th className="py-2 px-3 text-[10px] font-bold text-gray-500 uppercase text-right">Last month</th>
                            <th className="py-2 px-3 text-[10px] font-bold text-gray-500 uppercase text-right">Δ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {momRows.slice(0, 24).map((r) => {
                            const up = r.delta > 0;
                            const down = r.delta < 0;
                            const deltaClass = up
                              ? 'text-red-700 dark:text-red-300'
                              : down
                                ? 'text-emerald-700 dark:text-emerald-300'
                                : 'text-gray-600 dark:text-gray-400';
                            return (
                              <tr key={`mom-${r.category}`} className="border-b border-gray-50 dark:border-white/[0.03]">
                                <td className="py-2 px-3 font-medium text-gray-900 dark:text-gray-100">{r.category}</td>
                                <td className="py-2 px-3 text-right tabular-nums text-gray-900 dark:text-gray-100">{money(r.current)}</td>
                                <td className="py-2 px-3 text-right tabular-nums text-gray-700 dark:text-gray-300">{money(r.previous)}</td>
                                <td className={`py-2 px-3 text-right tabular-nums font-semibold ${deltaClass}`}>
                                  {r.delta === 0 ? '—' : `${r.delta > 0 ? '+' : ''}${money(r.delta)}`} {r.previous > 0 ? `(${r.pct.toFixed(1)}%)` : ''}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : null}

              {expensesPane === 'entries' ? (
              <div className="mt-8 rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-4 sm:p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Expenses in range</h4>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Search by vendor, category, tags, note…</p>
                  </div>
                  <input
                    value={expenseQuery}
                    onChange={(e) => setExpenseQuery(e.target.value)}
                    placeholder="Search expenses…"
                    className="w-full sm:w-72 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] text-sm"
                  />
                </div>

                <div className="mt-4">
                  {expensesFiltered.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center border border-dashed border-gray-200 dark:border-[#303038] rounded-xl">
                      No expenses found for this range.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-[#26262d] max-h-[min(40vh,320px)] overflow-y-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="sticky top-0 bg-gray-50/95 dark:bg-white/5 border-b border-gray-100 dark:border-[#26262d]">
                          <tr>
                            <th className="py-2 px-3 text-[10px] font-bold text-gray-500 uppercase">Date</th>
                            <th className="py-2 px-3 text-[10px] font-bold text-gray-500 uppercase">Details</th>
                            <th className="py-2 px-3 text-[10px] font-bold text-gray-500 uppercase text-right">Original</th>
                            <th className="py-2 px-3 text-[10px] font-bold text-gray-500 uppercase text-right">BDT eq.</th>
                            <th className="py-2 px-3 w-10" />
                          </tr>
                        </thead>
                        <tbody>
                          {expensesFiltered.map((ex) => (
                            <tr key={ex.id} className="border-b border-gray-50 dark:border-white/[0.03]">
                              <td className="py-2 px-3 whitespace-nowrap text-gray-700 dark:text-gray-300">
                                {format(parseISO(ex.expense_date + 'T12:00:00'), 'MMM d, yyyy')}
                              </td>
                              <td className="py-2 px-3">
                                <details className="group">
                                  <summary className="cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-semibold text-gray-900 dark:text-gray-100">{ex.category}</span>
                                      {ex.vendor_name ? (
                                        <span className="text-[11px] rounded-full border border-gray-200 dark:border-[#303038] px-2 py-0.5 text-gray-600 dark:text-gray-300">
                                          {ex.vendor_name}
                                        </span>
                                      ) : null}
                                      {ex.payment_method ? (
                                        <span className="text-[11px] rounded-full border border-gray-200 dark:border-[#303038] px-2 py-0.5 text-gray-600 dark:text-gray-300">
                                          {ex.payment_method}
                                        </span>
                                      ) : null}
                                      {ex.tags?.length ? (
                                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                          {ex.tags.slice(0, 2).join(', ')}
                                          {ex.tags.length > 2 ? ` +${ex.tags.length - 2}` : ''}
                                        </span>
                                      ) : null}
                                    </div>
                                    {ex.note ? (
                                      <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 truncate max-w-[360px]" title={ex.note}>
                                        {ex.note}
                                      </div>
                                    ) : null}
                                  </summary>
                                  <div className="mt-2 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] p-3 text-xs text-gray-700 dark:text-gray-300 space-y-1">
                                    <div>
                                      <span className="font-semibold">Vendor</span>: {ex.vendor_name || '—'}
                                    </div>
                                    <div>
                                      <span className="font-semibold">Payment</span>: {ex.payment_method || '—'}
                                    </div>
                                    <div>
                                      <span className="font-semibold">Currency</span>: {currencyLabel(ex.currency)}
                                    </div>
                                    <div>
                                      <span className="font-semibold">FX</span>: {ex.fx_rate_to_bdt ? Number(ex.fx_rate_to_bdt).toString() : '—'}
                                    </div>
                                    <div>
                                      <span className="font-semibold">Tags</span>: {ex.tags?.length ? ex.tags.join(', ') : '—'}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-semibold">Attachments</span>:
                                      {ex.attachment_urls?.length ? (
                                        ex.attachment_urls.slice(0, 3).map((u) => (
                                          <a key={u} href={u} target="_blank" rel="noreferrer" className="text-indigo-700 dark:text-indigo-300 hover:underline">
                                            Open
                                          </a>
                                        ))
                                      ) : (
                                        <span>—</span>
                                      )}
                                    </div>
                                  </div>
                                </details>
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums text-gray-900 dark:text-gray-100">{fmtOriginalAmount(ex)}</td>
                              <td className="py-2 px-3 text-right tabular-nums text-gray-900 dark:text-gray-100">{fmtBdtAmount(ex)}</td>
                              <td className="py-2 px-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteExpense(ex.id)}
                                  disabled={deletingId === ex.id}
                                  className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50"
                                  title="Delete"
                                >
                                  {deletingId === ex.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
};
