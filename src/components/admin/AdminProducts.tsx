import React, { useState, useEffect, useRef } from 'react';
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
  ImageIcon,
  Upload,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  parseHiddenProductIds,
  PRODUCT_STORE_VISIBILITY_SETTINGS_KEY,
  productSavePercent,
} from '../../lib/productStoreDisplay';
import { toast } from '../../lib/toast';
import { useConfirmDialog } from '../../contexts/ConfirmDialogContext';
import { getAccessTokenForApi } from '../../lib/getAccessTokenForApi';
import { getApiBaseUrl } from '../../lib/apiBase';
import { enableWebPush, getPushPermission, isWebPushSupported } from '../../lib/webPushClient';

const PRODUCT_IMAGES_BUCKET = 'product-images';
const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

function storagePathFromProductImageUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  const base = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const prefix = `${base}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/`;
  if (!url.startsWith(prefix)) return null;
  try {
    return decodeURIComponent(url.slice(prefix.length));
  } catch {
    return null;
  }
}

interface Product {
  id: string;
  title: string;
  title_bn: string;
  price: number;
  /** Optional “was” price — store shows strikethrough + Save % when above `price`. */
  list_price?: number | null;
  duration: string;
  icons: string[];
  description: string;
  image_url?: string;
  is_active: boolean;
  email_slots: number;
  /** Days after purchase before 2nd, 3rd… slot unlocks. 0 = no wait between slots. */
  email_slot_interval_days: number;
  max_users_per_email: number;
  single_device_warning: boolean;
  with_cloud_access: boolean;
  is_personal: boolean;
}

type PersonalFlowSettings = {
  enabled: boolean;
  manual_fulfillment_enabled: boolean;
  delivery_eta_minutes: number;
  delivery_eta_label: string;
};

type PersonalOrderAlertSettings = {
  enabled: boolean;
  telegram_enabled: boolean;
  telegram_bot_token: string;
  telegram_chat_ids: string[];
  email_enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass: string;
  email_from: string;
  email_to: string[];
  browser_push_enabled: boolean;
  browser_push_all_admins: boolean;
  browser_push_admin_user_ids: string[];
};

type AdminRecipient = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
};

const DEFAULT_PERSONAL_FLOW_SETTINGS: PersonalFlowSettings = {
  enabled: true,
  manual_fulfillment_enabled: false,
  delivery_eta_minutes: 30,
  delivery_eta_label: 'Manual setup usually completes within',
};

const DEFAULT_PERSONAL_ALERT_SETTINGS: PersonalOrderAlertSettings = {
  enabled: false,
  telegram_enabled: false,
  telegram_bot_token: '',
  telegram_chat_ids: [],
  email_enabled: false,
  smtp_host: '',
  smtp_port: 587,
  smtp_secure: false,
  smtp_user: '',
  smtp_pass: '',
  email_from: '',
  email_to: [],
  browser_push_enabled: false,
  browser_push_all_admins: true,
  browser_push_admin_user_ids: [],
};

function normalizePersonalFlowSettings(value: any): PersonalFlowSettings {
  return {
    enabled: value?.enabled !== false,
    manual_fulfillment_enabled: value?.manual_fulfillment_enabled === true,
    delivery_eta_minutes: Math.max(15, Math.min(10080, Number(value?.delivery_eta_minutes) || 30)),
    delivery_eta_label:
      typeof value?.delivery_eta_label === 'string' && value.delivery_eta_label.trim()
        ? value.delivery_eta_label.trim()
        : DEFAULT_PERSONAL_FLOW_SETTINGS.delivery_eta_label,
  };
}

function normalizePersonalAlertSettings(value: any): PersonalOrderAlertSettings {
  return {
    enabled: value?.enabled === true,
    telegram_enabled: value?.telegram_enabled === true,
    telegram_bot_token: typeof value?.telegram_bot_token === 'string' ? value.telegram_bot_token : '',
    telegram_chat_ids: Array.isArray(value?.telegram_chat_ids) ? value.telegram_chat_ids.filter(Boolean) : [],
    email_enabled: value?.email_enabled === true,
    smtp_host: typeof value?.smtp_host === 'string' ? value.smtp_host : '',
    smtp_port: Math.max(1, Number(value?.smtp_port) || 587),
    smtp_secure: value?.smtp_secure === true,
    smtp_user: typeof value?.smtp_user === 'string' ? value.smtp_user : '',
    smtp_pass: typeof value?.smtp_pass === 'string' ? value.smtp_pass : '',
    email_from: typeof value?.email_from === 'string' ? value.email_from : '',
    email_to: Array.isArray(value?.email_to) ? value.email_to.filter(Boolean) : [],
    browser_push_enabled: value?.browser_push_enabled === true,
    browser_push_all_admins: value?.browser_push_all_admins !== false,
    browser_push_admin_user_ids: Array.isArray(value?.browser_push_admin_user_ids)
      ? value.browser_push_admin_user_ids.filter(Boolean)
      : [],
  };
}

function slotLabel(n: number) {
  return `${n} ${n === 1 ? 'slot' : 'slots'}`;
}

export const AdminProducts = () => {
  const { confirm } = useConfirmDialog();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<'regular' | 'personal'>('regular');
  const [personalFlowSettings, setPersonalFlowSettings] = useState<PersonalFlowSettings>(DEFAULT_PERSONAL_FLOW_SETTINGS);
  const [personalFlowSaving, setPersonalFlowSaving] = useState(false);
  const [personalFlowMessage, setPersonalFlowMessage] = useState<string | null>(null);
  const [alertSettings, setAlertSettings] = useState<PersonalOrderAlertSettings>(DEFAULT_PERSONAL_ALERT_SETTINGS);
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [hiddenProductIds, setHiddenProductIds] = useState<string[]>([]);
  const [visibilitySavingId, setVisibilitySavingId] = useState<string | null>(null);
  const [adminRecipients, setAdminRecipients] = useState<AdminRecipient[]>([]);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default');
  const [pushEnabling, setPushEnabling] = useState(false);
  const [formStoreVisible, setFormStoreVisible] = useState(true);

  const [formData, setFormData] = useState<Partial<Product>>({
    title: '',
    title_bn: '',
    price: 0,
    list_price: null,
    duration: '1 month',
    icons: [],
    description: '',
    image_url: '',
    is_active: true,
    email_slots: 3,
    email_slot_interval_days: 0,
    max_users_per_email: 1,
    single_device_warning: false,
    with_cloud_access: false,
    is_personal: false,
  });

  useEffect(() => {
    fetchProducts();
    void loadStoreVisibilitySettings();
    void loadPersonalOpsSettings();
    if (isWebPushSupported()) {
      void getPushPermission().then(setPushPermission).catch(() => setPushPermission('default'));
    }
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

  const loadPersonalOpsSettings = async () => {
    setSettingsLoading(true);
    try {
      const [personalRow, token] = await Promise.all([
        supabase.from('system_settings').select('value').eq('key', 'personal_subscriptions').maybeSingle(),
        getAccessTokenForApi(),
      ]);
      if (personalRow.error) throw personalRow.error;
      setPersonalFlowSettings(normalizePersonalFlowSettings(personalRow.data?.value || {}));

      if (!token) throw new Error('Session expired. Please sign in again.');
      const res = await fetch(`${getApiBaseUrl()}/api/admin/ops/personal-order-alerts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load personal alert settings.');
      setAlertSettings(normalizePersonalAlertSettings(data.settings || {}));
      setAdminRecipients(Array.isArray(data.admins) ? data.admins : []);
    } catch (error: any) {
      console.error('loadPersonalOpsSettings:', error);
      toast.error(error?.message || 'Failed to load personal order settings');
    } finally {
      setSettingsLoading(false);
    }
  };

  const loadStoreVisibilitySettings = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', PRODUCT_STORE_VISIBILITY_SETTINGS_KEY)
        .maybeSingle();
      if (error) throw error;
      setHiddenProductIds(parseHiddenProductIds(data?.value));
    } catch (error) {
      console.error('Error loading product visibility settings:', error);
      setHiddenProductIds([]);
    }
  };

  const saveHiddenProductIds = async (ids: string[]) => {
    const { error } = await supabase.from('system_settings').upsert(
      {
        key: PRODUCT_STORE_VISIBILITY_SETTINGS_KEY,
        value: { hidden_product_ids: ids },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    );
    if (error) throw error;
  };

  const savePersonalFlowSettings = async () => {
    setPersonalFlowSaving(true);
    setPersonalFlowMessage(null);
    try {
      const value = {
        enabled: personalFlowSettings.enabled,
        manual_fulfillment_enabled: personalFlowSettings.manual_fulfillment_enabled,
        delivery_eta_minutes: Math.max(15, Math.min(10080, Math.floor(Number(personalFlowSettings.delivery_eta_minutes) || 30))),
        delivery_eta_label: personalFlowSettings.delivery_eta_label.trim() || DEFAULT_PERSONAL_FLOW_SETTINGS.delivery_eta_label,
      };
      const { error } = await supabase
        .from('system_settings')
        .update({ value, updated_at: new Date().toISOString() })
        .eq('key', 'personal_subscriptions');
      if (error) throw error;
      setPersonalFlowSettings(normalizePersonalFlowSettings(value));
      setPersonalFlowMessage('Personal flow saved.');
    } catch (error: any) {
      setPersonalFlowMessage(error?.message || 'Failed to save personal flow.');
    } finally {
      setPersonalFlowSaving(false);
    }
  };

  const saveAlertSettings = async () => {
    setAlertSaving(true);
    setAlertMessage(null);
    try {
      const token = await getAccessTokenForApi();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const payload = {
        ...alertSettings,
        telegram_bot_token: alertSettings.telegram_bot_token.trim(),
        telegram_chat_ids: alertSettings.telegram_chat_ids.map((x) => x.trim()).filter(Boolean),
        smtp_host: alertSettings.smtp_host.trim(),
        smtp_user: alertSettings.smtp_user.trim(),
        smtp_pass: alertSettings.smtp_pass,
        email_from: alertSettings.email_from.trim(),
        email_to: alertSettings.email_to.map((x) => x.trim()).filter(Boolean),
        browser_push_admin_user_ids: alertSettings.browser_push_admin_user_ids.filter(Boolean),
      };
      const res = await fetch(`${getApiBaseUrl()}/api/admin/ops/personal-order-alerts`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save alert settings.');
      setAlertSettings(normalizePersonalAlertSettings(data.settings || payload));
      setAlertMessage('Admin alert channels saved.');
    } catch (error: any) {
      setAlertMessage(error?.message || 'Failed to save alert settings.');
    } finally {
      setAlertSaving(false);
    }
  };

  const togglePushRecipient = (userId: string) => {
    setAlertSettings((current) => ({
      ...current,
      browser_push_admin_user_ids: current.browser_push_admin_user_ids.includes(userId)
        ? current.browser_push_admin_user_ids.filter((id) => id !== userId)
        : [...current.browser_push_admin_user_ids, userId],
    }));
  };

  const handleEnableThisBrowser = async () => {
    setPushEnabling(true);
    try {
      const result = await enableWebPush();
      if (!result.ok) throw new Error(result.reason || 'Push subscribe failed');
      setPushPermission('granted');
      toast.success('This admin browser is ready for push alerts.');
    } catch (error: any) {
      toast.error(error?.message || 'Could not enable browser push.');
    } finally {
      setPushEnabling(false);
    }
  };

  const filteredProducts = products.filter((p) => (activeTab === 'personal' ? p.is_personal : !p.is_personal));

  const handleSave = async () => {
    try {
      const iconsNorm = Array.isArray(formData.icons)
        ? formData.icons
        : String(formData.icons || '')
            .split(',')
            .map((i: string) => i.trim())
            .filter(Boolean);

      const salePrice = Number(formData.price);
      if (!Number.isFinite(salePrice) || salePrice < 0) {
        toast.warning('Enter a valid sale price (BDT) — this is what checkout charges.');
        return;
      }

      let listPriceNorm: number | null = null;
      const lp = formData.list_price;
      if (lp !== null && lp !== undefined && String(lp).trim() !== '') {
        const n = Number(lp);
        if (!Number.isFinite(n) || n < 0) {
          toast.warning('Invalid original list price.');
          return;
        }
        listPriceNorm = n;
      }

      if (listPriceNorm != null && listPriceNorm < salePrice) {
        toast.warning('Original list price must be greater than or equal to the sale price.');
        return;
      }

      const title = (formData.title || '').trim();
      if (!title) {
        toast.warning('Title (English) is required.');
        return;
      }

      const payload = {
        title,
        title_bn: (formData.title_bn || '').trim(),
        price: salePrice,
        list_price: listPriceNorm,
        duration: (formData.duration || '1 month').trim(),
        icons: iconsNorm,
        description: formData.description ?? '',
        image_url: formData.image_url || '',
        is_active: formData.is_active ?? true,
        email_slots: formData.email_slots ?? 3,
        email_slot_interval_days: formData.email_slot_interval_days ?? 0,
        max_users_per_email: formData.max_users_per_email ?? 1,
        single_device_warning: formData.single_device_warning ?? false,
        with_cloud_access: formData.with_cloud_access ?? false,
        is_personal: formData.is_personal ?? false,
      };

      let targetProductId = editingId;

      if (editingId) {
        const { error } = await supabase.from('products').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('products').insert(payload).select('id').single();
        if (error) throw error;
        targetProductId = data.id;
      }

      if (targetProductId) {
        const nextHiddenProductIds = formStoreVisible
          ? hiddenProductIds.filter((id) => id !== targetProductId)
          : Array.from(new Set([...hiddenProductIds, targetProductId]));
        await saveHiddenProductIds(nextHiddenProductIds);
        setHiddenProductIds(nextHiddenProductIds);
      }

      setEditingId(null);
      setIsAdding(false);
      setFormStoreVisible(true);
      fetchProducts();
    } catch (error: any) {
      console.error('Error saving product:', error);
      toast.error(
        `Error saving product: ${error.message || 'Unknown database error'}. If you added list pricing, run migration 063 on Supabase.`
      );
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Permanently delete this product?',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const { error } = await supabase.from('products').delete().eq('id', id);

      if (error) throw error;
      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error('Failed to delete product');
    }
  };

  const handleToggleVisibility = async (product: Product) => {
    try {
      setVisibilitySavingId(product.id);
      const isHiddenNow = hiddenProductIds.includes(product.id);
      const nextHiddenProductIds = isHiddenNow
        ? hiddenProductIds.filter((id) => id !== product.id)
        : [...hiddenProductIds, product.id];
      await saveHiddenProductIds(nextHiddenProductIds);
      setHiddenProductIds(nextHiddenProductIds);
      toast.success(
        isHiddenNow ? 'Product is now visible in Product section.' : 'Product is now hidden from Product section.',
      );
    } catch (error) {
      console.error('Error updating product visibility:', error);
      toast.error('Failed to update product visibility');
    } finally {
      setVisibilitySavingId(null);
    }
  };

  /** Deletes only products in the current tab (regular vs personal), not the entire catalog. */
  const handleDeleteAllInTab = async () => {
    const count = filteredProducts.length;
    if (count === 0) return;
    const label = activeTab === 'personal' ? 'personal subscription' : 'regular';
    const okAll = await confirm({
      title: `Delete all ${count} ${label} product(s)?`,
      description: 'This cannot be undone and may break links to existing orders.',
      confirmLabel: 'Delete all',
      variant: 'danger',
    });
    if (!okAll) return;

    try {
      setLoading(true);
      const isPersonal = activeTab === 'personal';
      const { error } = await supabase.from('products').delete().eq('is_personal', isPersonal);
      if (error) throw error;
      await fetchProducts();
    } catch (error) {
      console.error('Error deleting products:', error);
      toast.error('Failed to delete products');
      setLoading(false);
    }
  };

  const startEdit = (product: Product) => {
    setFormData({
      ...product,
      icons: product.icons || [],
      list_price: product.list_price ?? null,
    });
    setEditingId(product.id);
    setIsAdding(false);
    setFormStoreVisible(!hiddenProductIds.includes(product.id));
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
      email_slot_interval_days: 0,
      max_users_per_email: 1,
      single_device_warning: false,
      with_cloud_access: false,
      is_personal: false,
      list_price: null,
    });
    setIsAdding(true);
    setEditingId(null);
    setFormStoreVisible(true);
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
      email_slot_interval_days: 0,
      max_users_per_email: 1,
      single_device_warning: false,
      with_cloud_access: false,
      is_personal: true,
      list_price: null,
    });
    setIsAdding(true);
    setEditingId(null);
    setFormStoreVisible(true);
  };

  const switchTab = (tab: 'regular' | 'personal') => {
    setActiveTab(tab);
    setIsAdding(false);
    setEditingId(null);
    setFormStoreVisible(true);
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

      {activeTab === 'personal' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="rounded-2xl border border-violet-100 dark:border-violet-500/20 bg-white dark:bg-[#151518] p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Personal delivery flow</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Control whether personal orders auto-run via API or stay pending for manual delivery.
                </p>
              </div>
              {settingsLoading && <Loader2 className="w-4 h-4 animate-spin text-violet-500 shrink-0" />}
            </div>

            <div className="space-y-4">
              <ToggleCard
                title="Personal plan sales"
                description="Turn new personal plan purchases on or off for customers."
                enabled={personalFlowSettings.enabled}
                onToggle={() =>
                  setPersonalFlowSettings((current) => ({ ...current, enabled: !current.enabled }))
                }
                color="violet"
              />
              <ToggleCard
                title="Manual fulfillment (API off)"
                description="Keep paid personal orders pending, alert admins, and let customers see a countdown instead of instant Adobe API setup."
                enabled={personalFlowSettings.manual_fulfillment_enabled}
                onToggle={() =>
                  setPersonalFlowSettings((current) => ({
                    ...current,
                    manual_fulfillment_enabled: !current.manual_fulfillment_enabled,
                  }))
                }
                color="violet"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Delivery ETA (minutes)" hint="Used for the customer countdown card after payment.">
                  <input
                    type="number"
                    min={15}
                    max={10080}
                    value={personalFlowSettings.delivery_eta_minutes}
                    onChange={(e) =>
                      setPersonalFlowSettings((current) => ({
                        ...current,
                        delivery_eta_minutes: Number(e.target.value),
                      }))
                    }
                    className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-sm"
                  />
                </Field>
                <Field label="Countdown label" hint="Shown above the animated ETA block on the customer side.">
                  <input
                    type="text"
                    value={personalFlowSettings.delivery_eta_label}
                    onChange={(e) =>
                      setPersonalFlowSettings((current) => ({
                        ...current,
                        delivery_eta_label: e.target.value,
                      }))
                    }
                    className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-sm"
                  />
                </Field>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Pending manual personal orders stay visible in admin orders until you approve them.
              </p>
              <button
                type="button"
                onClick={savePersonalFlowSettings}
                disabled={personalFlowSaving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold"
              >
                {personalFlowSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save flow
              </button>
            </div>
            {personalFlowMessage ? (
              <p className="mt-3 text-xs text-gray-600 dark:text-gray-300">{personalFlowMessage}</p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-indigo-100 dark:border-indigo-500/20 bg-white dark:bg-[#151518] p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Admin alert channels</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  These alerts fire automatically when a manual personal order is paid.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <ToggleCard
                title="Send admin alerts"
                description="Master switch for Telegram, email, and browser push notifications."
                enabled={alertSettings.enabled}
                onToggle={() => setAlertSettings((current) => ({ ...current, enabled: !current.enabled }))}
                color="indigo"
              />
              <ToggleCard
                title="Telegram alerts"
                description="Uses your bot token and one or more chat IDs."
                enabled={alertSettings.telegram_enabled}
                onToggle={() =>
                  setAlertSettings((current) => ({ ...current, telegram_enabled: !current.telegram_enabled }))
                }
                color="indigo"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Telegram bot token">
                  <input
                    type="password"
                    value={alertSettings.telegram_bot_token}
                    onChange={(e) =>
                      setAlertSettings((current) => ({ ...current, telegram_bot_token: e.target.value }))
                    }
                    className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-sm"
                  />
                </Field>
                <Field label="Telegram chat IDs" hint="Comma or line separated.">
                  <textarea
                    value={alertSettings.telegram_chat_ids.join('\n')}
                    onChange={(e) =>
                      setAlertSettings((current) => ({
                        ...current,
                        telegram_chat_ids: e.target.value.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean),
                      }))
                    }
                    className="w-full min-h-[88px] p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-sm"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">You can place 2 or more Telegram chat IDs here.</p>
                </Field>
              </div>

              <ToggleCard
                title="Email alerts"
                description="SMTP settings are stored in admin settings and used only for personal manual-order alerts."
                enabled={alertSettings.email_enabled}
                onToggle={() => setAlertSettings((current) => ({ ...current, email_enabled: !current.email_enabled }))}
                color="indigo"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="SMTP host">
                  <input
                    type="text"
                    value={alertSettings.smtp_host}
                    onChange={(e) => setAlertSettings((current) => ({ ...current, smtp_host: e.target.value }))}
                    className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-sm"
                  />
                </Field>
                <Field label="SMTP port">
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={alertSettings.smtp_port}
                    onChange={(e) =>
                      setAlertSettings((current) => ({ ...current, smtp_port: Number(e.target.value) }))
                    }
                    className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-sm"
                  />
                </Field>
                <Field label="SMTP username">
                  <input
                    type="text"
                    value={alertSettings.smtp_user}
                    onChange={(e) => setAlertSettings((current) => ({ ...current, smtp_user: e.target.value }))}
                    className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-sm"
                  />
                </Field>
                <Field label="SMTP password">
                  <input
                    type="password"
                    value={alertSettings.smtp_pass}
                    onChange={(e) => setAlertSettings((current) => ({ ...current, smtp_pass: e.target.value }))}
                    className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-sm"
                  />
                </Field>
                <Field label="From email">
                  <input
                    type="email"
                    value={alertSettings.email_from}
                    onChange={(e) => setAlertSettings((current) => ({ ...current, email_from: e.target.value }))}
                    className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-sm"
                  />
                </Field>
                <Field label="Recipient emails" hint="Comma or line separated.">
                  <textarea
                    value={alertSettings.email_to.join('\n')}
                    onChange={(e) =>
                      setAlertSettings((current) => ({
                        ...current,
                        email_to: e.target.value.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean),
                      }))
                    }
                    className="w-full min-h-[88px] p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-sm"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">You can place 2 or more alert emails here.</p>
                </Field>
              </div>

              <ToggleCard
                title="Browser push alerts"
                description="Sends a Web Push notification to selected admin accounts that enabled notifications in their browser."
                enabled={alertSettings.browser_push_enabled}
                onToggle={() =>
                  setAlertSettings((current) => ({
                    ...current,
                    browser_push_enabled: !current.browser_push_enabled,
                  }))
                }
                color="indigo"
              />
              <div className="rounded-xl border border-gray-200 dark:border-[#303038] bg-gray-50/60 dark:bg-[#111113] p-4 space-y-3">
                <label className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alertSettings.browser_push_all_admins}
                    onChange={() =>
                      setAlertSettings((current) => ({
                        ...current,
                        browser_push_all_admins: !current.browser_push_all_admins,
                      }))
                    }
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">Send to all admins</span>
                    <span className="block text-[11px] text-gray-500 dark:text-gray-400">
                      Every current and future admin with push enabled will receive the alert.
                    </span>
                  </span>
                </label>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">This browser</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Permission: <span className="font-semibold">{pushPermission}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleEnableThisBrowser}
                    disabled={!isWebPushSupported() || pushEnabling}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-[#303038] text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-50"
                  >
                    {pushEnabling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    Enable push on this browser
                  </button>
                </div>
                {!alertSettings.browser_push_all_admins && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {adminRecipients.map((admin) => (
                      <label
                        key={admin.id}
                        className="flex items-start gap-2 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] p-3 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={alertSettings.browser_push_admin_user_ids.includes(admin.id)}
                          onChange={() => togglePushRecipient(admin.id)}
                          className="mt-1"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {admin.name || admin.email || admin.id}
                          </span>
                          <span className="block text-[11px] text-gray-500 dark:text-gray-400">
                            {admin.email || admin.phone || admin.role || 'Admin'}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Save after updating any destination, chat ID, SMTP, or browser recipient.
              </p>
              <button
                type="button"
                onClick={saveAlertSettings}
                disabled={alertSaving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold"
              >
                {alertSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save alerts
              </button>
            </div>
            {alertMessage ? <p className="mt-3 text-xs text-gray-600 dark:text-gray-300">{alertMessage}</p> : null}
          </div>
        </div>
      )}

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
            <Field
              label="Sale price (BDT)"
              hint="Amount charged at checkout. Store shows this as the main green price."
            >
              <input
                type="number"
                min={0}
                step="0.01"
                value={formData.price ?? 0}
                onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100 text-sm"
              />
            </Field>
            <Field
              label="Original list price (BDT, optional)"
              hint="Higher reference price for marketing only. Leave empty for no strikethrough."
            >
              <input
                type="number"
                min={0}
                step="0.01"
                value={
                  formData.list_price === null || formData.list_price === undefined ? '' : formData.list_price
                }
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    list_price: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100 text-sm"
              />
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">
                {(() => {
                  const pct = productSavePercent(
                    formData.list_price != null && formData.list_price !== undefined
                      ? Number(formData.list_price)
                      : null,
                    Number(formData.price),
                  );
                  return pct != null
                    ? `Store preview: strikethrough list + Save ${pct}% (rounded).`
                    : 'Must be strictly greater than sale price to show a discount badge.';
                })()}
              </p>
            </Field>
            <Field label="Duration" hint='e.g. "1 month" or "1 year".'>
              <input
                type="text"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100 text-sm"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  { label: '1 month', value: '1 month' },
                  { label: '2 months', value: '2 months' },
                  { label: '3 months', value: '3 months' },
                  { label: '4 months', value: '4 months' },
                  { label: '6 months', value: '6 months' },
                  { label: '1 year', value: '1 year' },
                  { label: '2 years', value: '2 years' },
                ].map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, duration: p.value })}
                    className="inline-flex items-center justify-center rounded-full border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] px-3 py-1.5 text-[11px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
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
            <Field
              label="Product section visibility"
              hint="Show = visible in product/store section. Hide = customer side থেকে লুকানো থাকবে."
            >
              <select
                value={formStoreVisible ? 'true' : 'false'}
                onChange={(e) => setFormStoreVisible(e.target.value === 'true')}
                className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100 text-sm"
              >
                <option value="true">Show</option>
                <option value="false">Hide</option>
              </select>
            </Field>
            <div className="md:col-span-2">
              <Field
                label="Description"
                hint="One bullet per line. Optional leading - or • is stripped. Store shows each line with a green checkmark."
              >
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full p-2.5 border border-gray-200 dark:border-[#303038] rounded-xl bg-white dark:bg-[#1c1c21] text-gray-900 dark:text-gray-100 text-sm min-h-[120px]"
                />
              </Field>
            </div>
            <div className="md:col-span-2">
              <ProductImageUploadField
                imageUrl={formData.image_url}
                onChange={(url) => setFormData({ ...formData, image_url: url })}
              />
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
                  <Field
                    label="Days between slot unlocks"
                    hint="First slot is immediate. 2nd slot unlocks N days after purchase, 3rd after 2×N days, etc. 0 = no spacing (old behavior)."
                  >
                    <input
                      type="number"
                      min={0}
                      max={365}
                      value={formData.email_slot_interval_days ?? 0}
                      onChange={(e) =>
                        setFormData({ ...formData, email_slot_interval_days: Number(e.target.value) })
                      }
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
            <strong className="font-medium">Sale price</strong> is charged at checkout. Optional{' '}
            <strong className="font-medium">list price</strong> is display-only (strikethrough + Save %).
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
                <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Store</th>
                <th className="py-3 px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const isHiddenFromStore = hiddenProductIds.includes(product.id);
                return (
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
                    <td className="py-3 px-4 tabular-nums">
                      <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                        BDT {Number(product.price).toLocaleString()}
                      </div>
                      {product.list_price != null && Number(product.list_price) > Number(product.price) ? (
                        <div className="text-[11px] text-gray-500 line-through">
                          was BDT {Number(product.list_price).toLocaleString()}
                        </div>
                      ) : null}
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
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          isHiddenFromStore
                            ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            : 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        }`}
                      >
                        {isHiddenFromStore ? 'Hidden' : 'Shown'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleToggleVisibility(product)}
                          disabled={visibilitySavingId === product.id}
                          className={`p-2 rounded-lg ${
                            isHiddenFromStore
                              ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                              : 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10'
                          } disabled:opacity-50`}
                          title={isHiddenFromStore ? 'Unhide from Product section' : 'Hide from Product section'}
                        >
                          {visibilitySavingId === product.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : isHiddenFromStore ? (
                            <Eye className="w-4 h-4" />
                          ) : (
                            <EyeOff className="w-4 h-4" />
                          )}
                        </button>
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
                );
              })}
              {filteredProducts.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={activeTab === 'regular' ? 7 : 6}
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

function ProductImageUploadField({
  imageUrl,
  onChange,
}: {
  imageUrl?: string;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const pickFile = () => inputRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setLocalError(null);
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      setLocalError('Please choose a JPEG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
      setLocalError('Image must be 5 MB or smaller.');
      return;
    }

    const ext =
      file.type === 'image/jpeg'
        ? 'jpg'
        : file.type === 'image/png'
          ? 'png'
          : file.type === 'image/webp'
            ? 'webp'
            : 'gif';
    const path = `products/${crypto.randomUUID()}.${ext}`;
    const previousPath = storagePathFromProductImageUrl(imageUrl);

    setUploading(true);
    try {
      const { error: upErr } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });
      if (upErr) throw upErr;

      const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
      const publicUrl = data.publicUrl;
      onChange(publicUrl);

      if (previousPath && previousPath !== path) {
        await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([previousPath]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setLocalError(msg);
    } finally {
      setUploading(false);
    }
  };

  const clearImage = async () => {
    setLocalError(null);
    const p = storagePathFromProductImageUrl(imageUrl);
    onChange('');
    if (p) {
      await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([p]);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
        Product image <span className="text-gray-400 font-normal">(optional)</span>
      </label>
      <p className="text-[11px] text-gray-500 mb-3">
        Upload a banner for the store card. If empty, the default store artwork is used.
      </p>

      <div className="rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] overflow-hidden">
        <div className="relative flex min-h-[160px] items-center justify-center bg-gray-50 dark:bg-black/30 p-4">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Product preview"
              className="max-h-48 w-auto max-w-full rounded-lg object-contain shadow-sm"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500 py-6">
              <ImageIcon className="w-10 h-10 opacity-50" aria-hidden />
              <span className="text-sm">No image yet</span>
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-black/60 backdrop-blur-[2px]">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" aria-hidden />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 dark:border-[#303038] p-3">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={onFile}
          />
          <button
            type="button"
            onClick={pickFile}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold"
          >
            <Upload className="w-4 h-4" aria-hidden />
            {imageUrl ? 'Replace image' : 'Upload image'}
          </button>
          {imageUrl ? (
            <button
              type="button"
              onClick={() => void clearImage()}
              disabled={uploading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-[#303038] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-50 text-sm font-semibold"
            >
              <X className="w-4 h-4" aria-hidden />
              Remove
            </button>
          ) : null}
        </div>
      </div>
      {localError ? <p className="text-[11px] text-red-600 dark:text-red-400 mt-2">{localError}</p> : null}
    </div>
  );
}

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
  color: 'amber' | 'blue' | 'violet' | 'indigo';
}) {
  const wrap =
    color === 'amber'
      ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30'
      : color === 'blue'
        ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30'
        : color === 'violet'
          ? 'bg-violet-50 dark:bg-violet-500/10 border-violet-200 dark:border-violet-500/30'
          : 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30';
  const titleC =
    color === 'amber'
      ? 'text-amber-800 dark:text-amber-200'
      : color === 'blue'
        ? 'text-blue-800 dark:text-blue-200'
        : color === 'violet'
          ? 'text-violet-800 dark:text-violet-200'
          : 'text-indigo-800 dark:text-indigo-200';
  const desc =
    color === 'amber'
      ? 'text-amber-700 dark:text-amber-400'
      : color === 'blue'
        ? 'text-blue-700 dark:text-blue-400'
        : color === 'violet'
          ? 'text-violet-700 dark:text-violet-400'
          : 'text-indigo-700 dark:text-indigo-400';
  const knob =
    color === 'amber'
      ? enabled
        ? 'bg-amber-500'
        : 'bg-gray-300 dark:bg-gray-600'
      : color === 'blue'
        ? enabled
          ? 'bg-blue-500'
          : 'bg-gray-300 dark:bg-gray-600'
        : color === 'violet'
          ? enabled
            ? 'bg-violet-500'
            : 'bg-gray-300 dark:bg-gray-600'
          : enabled
            ? 'bg-indigo-500'
            : 'bg-gray-300 dark:bg-gray-600';

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
