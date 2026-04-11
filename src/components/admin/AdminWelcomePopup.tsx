import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Loader2,
  PanelTop,
  Plus,
  Edit2,
  Trash2,
  Save,
  AlertCircle,
  Search,
  RefreshCw,
  Upload,
  ImageIcon,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '../../lib/toast';
import { useConfirmDialog } from '../../contexts/ConfirmDialogContext';

interface WelcomePopupRow {
  id: string;
  title: string;
  content: string;
  type: string;
  is_active: boolean;
  created_at: string;
  hero_image_url?: string | null;
  snooze_hours?: number | null;
}

export const AdminWelcomePopup = () => {
  const { confirm } = useConfirmDialog();
  const [rows, setRows] = useState<WelcomePopupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'info' | 'warning' | 'error'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const pendingDeleteRef = useRef<WelcomePopupRow | null>(null);
  const pendingDeleteTimerRef = useRef<number | null>(null);

  const [formData, setFormData] = useState({
    is_active: true,
    hero_image_url: '',
    snooze_hours: 6,
  });

  useEffect(() => {
    void fetchRows();
  }, []);

  useEffect(() => {
    return () => {
      if (pendingDeleteTimerRef.current) {
        window.clearTimeout(pendingDeleteTimerRef.current);
      }
    };
  }, []);

  const rtTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const schedule = () => {
      if (rtTimerRef.current) window.clearTimeout(rtTimerRef.current);
      rtTimerRef.current = window.setTimeout(() => {
        void fetchRows();
      }, 650);
    };

    const channel = supabase
      .channel(`admin_welcome_popup_rt:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'welcome_popups' }, () => schedule())
      .subscribe();

    return () => {
      if (rtTimerRef.current) window.clearTimeout(rtTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchRows = async () => {
    try {
      const { data, error } = await supabase
        .from('welcome_popups')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setRows(data || []);
    } catch (error) {
      console.error('Error fetching welcome popups:', error);
    } finally {
      setLoading(false);
    }
  };

  const buildPayload = () => {
    const row = editingId ? rows.find((r) => r.id === editingId) : null;
    const snooze = Math.min(168, Math.max(1, Math.floor(Number(formData.snooze_hours) || 6)));
    const title = row && row.title?.trim() ? row.title : 'Welcome';
    const content = row && row.content?.trim() ? row.content : ' ';
    return {
      title,
      content,
      type: row?.type ?? 'info',
      is_active: formData.is_active ?? true,
      hero_image_url: formData.hero_image_url?.trim() || null,
      cta_label: null,
      cta_url: null,
      snooze_hours: snooze,
    };
  };

  const handleSave = async () => {
    try {
      if (!formData.hero_image_url?.trim()) {
        toast.warning('Hero image is required (upload or paste an image URL)');
        return;
      }

      const payload = buildPayload();

      if (editingId) {
        const { error } = await supabase.from('welcome_popups').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('welcome_popups').insert(payload);
        if (error) throw error;
      }

      setIsAdding(false);
      setEditingId(null);
      setFormData({
        is_active: true,
        hero_image_url: '',
        snooze_hours: 6,
      });
      void fetchRows();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error saving';
      console.error('Error saving welcome popup:', error);
      toast.error(msg);
    }
  };

  const toggleStatus = async (id: string) => {
    try {
      const row = rows.find((r) => r.id === id);
      if (!row) return;
      const { error } = await supabase
        .from('welcome_popups')
        .update({ is_active: !row.is_active })
        .eq('id', id);
      if (error) throw error;
      void fetchRows();
    } catch (error) {
      console.error('Error updating welcome popup:', error);
    }
  };

  const startEdit = (row: WelcomePopupRow) => {
    setFormData({
      is_active: row.is_active,
      hero_image_url: row.hero_image_url ?? '',
      snooze_hours: row.snooze_hours ?? 6,
    });
    setEditingId(row.id);
    setIsAdding(false);
  };

  const startAdd = () => {
    setFormData({
      is_active: true,
      hero_image_url: '',
      snooze_hours: 6,
    });
    setIsAdding(true);
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Delete this welcome popup?',
      description: 'This permanently removes the popup configuration.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    const target = rows.find((r) => r.id === id) || null;
    if (!target) return;

    pendingDeleteRef.current = target;
    setRows((prev) => prev.filter((r) => r.id !== id));

    if (pendingDeleteTimerRef.current) {
      window.clearTimeout(pendingDeleteTimerRef.current);
      pendingDeleteTimerRef.current = null;
    }

    const undoDelete = () => {
      if (!pendingDeleteRef.current) return;
      const toRestore = pendingDeleteRef.current;
      pendingDeleteRef.current = null;
      if (pendingDeleteTimerRef.current) {
        window.clearTimeout(pendingDeleteTimerRef.current);
        pendingDeleteTimerRef.current = null;
      }
      setRows((prev) => {
        const next = [toRestore, ...prev];
        return next.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
      });
      toast.success('Delete cancelled.');
    };

    toast('Welcome popup deleted', {
      description: 'You can undo within 5 seconds.',
      duration: 5000,
      action: { label: 'Undo', onClick: undoDelete },
    });

    pendingDeleteTimerRef.current = window.setTimeout(async () => {
      const row = pendingDeleteRef.current;
      pendingDeleteRef.current = null;
      pendingDeleteTimerRef.current = null;
      if (!row) return;
      try {
        const { error } = await supabase.from('welcome_popups').delete().eq('id', row.id);
        if (error) throw error;
      } catch (error) {
        console.error('Error deleting welcome popup:', error);
        toast.error('Could not delete. Restored.');
        setRows((prev) => {
          const next = [row, ...prev];
          return next.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
        });
      }
    }, 5200);
  };

  const stats = {
    total: rows.length,
    active: rows.filter((r) => r.is_active).length,
    inactive: rows.filter((r) => !r.is_active).length,
  };

  const filtered = rows.filter((r) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = !q || r.title.toLowerCase().includes(q) || r.content.toLowerCase().includes(q);
    const matchesType = typeFilter === 'all' || r.type === typeFilter;
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? r.is_active : !r.is_active);
    return matchesSearch && matchesType && matchesStatus;
  });

  const resetFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setStatusFilter('all');
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="animate-spin w-8 h-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] overflow-hidden transition-colors duration-300">
      <div className="p-6 border-b border-gray-100 dark:border-[#26262d] flex justify-between items-start gap-4">
        <div className="min-w-0 flex-1 pr-2">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <PanelTop className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            Welcome popup
          </h3>
          <div className="mt-2 flex max-w-2xl items-start gap-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary/80" aria-hidden />
            <p className="min-w-0">
              Separate from <strong className="font-semibold text-gray-700 dark:text-gray-200">Important Notices</strong>{' '}
              (dashboard list). Each popup needs a <strong className="font-semibold text-gray-700 dark:text-gray-200">hero image</strong>
              . Only <strong className="font-semibold text-gray-700 dark:text-gray-200">Active</strong> rows show as the
              customer welcome modal; if several are active, the newest wins until the user snoozes it.
            </p>
          </div>
        </div>
        <button
          onClick={startAdd}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center whitespace-nowrap shadow-sm shadow-primary/20"
          type="button"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add popup
        </button>
      </div>

      <div className="p-6">
        <div className="mb-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Showing{' '}
            <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{filtered.length}</span> of{' '}
            <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{rows.length}</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-3 w-full lg:w-auto">
            <div className="relative w-full md:w-80">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search title/content…"
                className="w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-[#303038] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white dark:bg-[#111113] text-gray-900 dark:text-gray-100"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | 'info' | 'warning' | 'error')}
              className="px-3 py-2 border border-gray-200 dark:border-[#303038] rounded-lg text-sm bg-white dark:bg-[#111113] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">All types</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
              className="px-3 py-2 border border-gray-200 dark:border-[#303038] rounded-lg text-sm bg-white dark:bg-[#111113] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">All statuses</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>

            <button
              type="button"
              onClick={resetFilters}
              className="px-3 py-2 border border-gray-200 dark:border-[#303038] rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#1c1c21] transition-colors inline-flex items-center gap-2 whitespace-nowrap"
            >
              <RefreshCw className="w-4 h-4" />
              Reset
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          <span className="text-xs inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gray-100 dark:border-[#26262d] bg-white/60 dark:bg-white/[0.02] text-gray-700 dark:text-gray-200">
            Total: <span className="font-semibold tabular-nums">{stats.total}</span>
          </span>
          <span className="text-xs inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gray-100 dark:border-[#26262d] bg-white/60 dark:bg-white/[0.02] text-emerald-700 dark:text-emerald-300">
            Active: <span className="font-semibold tabular-nums">{stats.active}</span>
          </span>
          <span className="text-xs inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gray-100 dark:border-[#26262d] bg-white/60 dark:bg-white/[0.02] text-red-700 dark:text-red-300">
            Inactive: <span className="font-semibold tabular-nums">{stats.inactive}</span>
          </span>
        </div>

        {(isAdding || editingId) && (
          <div className="mb-8 p-6 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-[#26262d] transition-colors duration-300">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {editingId ? 'Edit welcome popup' : 'New welcome popup'}
            </h4>
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-[#303038] dark:bg-[#111113]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <NoticeHeroImageField
                      imageUrl={formData.hero_image_url}
                      onChange={(url) => setFormData({ ...formData, hero_image_url: url })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Snooze after close (hours)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={168}
                      value={formData.snooze_hours}
                      onChange={(e) =>
                        setFormData({ ...formData, snooze_hours: Number(e.target.value) || 6 })
                      }
                      className="w-full max-w-xs p-2 border border-gray-300 dark:border-[#303038] rounded-lg bg-white text-gray-900 dark:bg-[#111113] dark:text-gray-100 transition-colors duration-300"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      1–168. Per device (browser storage).
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded border-gray-300 dark:border-[#303038] text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Active (can show to customers)</span>
                </label>
              </div>

              <div className="flex items-end justify-end space-x-2 pt-2 border-t border-gray-200 dark:border-[#26262d]">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setEditingId(null);
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-[#303038] text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-[#1c1c21] dark:bg-white/5 transition-colors duration-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={!formData.hero_image_url?.trim()}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center justify-center disabled:opacity-50 shadow-sm shadow-primary/20"
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
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Popup</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Date</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Status</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-gray-100 dark:border-[#26262d] hover:bg-gray-50/50 dark:hover:bg-[#1c1c21]/50 transition-colors duration-300"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {row.hero_image_url?.trim() ? (
                        <img
                          src={row.hero_image_url.trim()}
                          alt=""
                          className="h-12 w-20 shrink-0 rounded-md object-cover border border-gray-200 dark:border-[#303038]"
                        />
                      ) : (
                        <div className="h-12 w-20 shrink-0 rounded-md border border-dashed border-gray-300 dark:border-[#303038] bg-gray-50 dark:bg-white/5" />
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-gray-900 dark:text-gray-100 truncate">{row.title}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1 max-w-md">
                          {row.content?.trim() || 'Image only'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">
                    {format(new Date(row.created_at), 'MMM dd, yyyy')}
                  </td>
                  <td className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => void toggleStatus(row.id)}
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                        row.is_active
                          ? 'bg-green-100 dark:bg-emerald-500/10 text-green-700 dark:text-emerald-300 hover:bg-green-200 dark:hover:bg-emerald-500/20'
                          : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-white/20'
                      }`}
                    >
                      {row.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => startEdit(row)}
                        className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded transition-colors duration-300"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(row.id)}
                        className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-colors duration-300"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-gray-500 dark:text-gray-400">
                    No welcome popups match your filters.
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

const NOTICE_HERO_BUCKET = 'notice-hero';
const NOTICE_HERO_MAX_BYTES = 5 * 1024 * 1024;

function storagePathFromNoticeHeroUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  const base = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const prefix = `${base}/storage/v1/object/public/${NOTICE_HERO_BUCKET}/`;
  if (!url.startsWith(prefix)) return null;
  try {
    return decodeURIComponent(url.slice(prefix.length));
  } catch {
    return null;
  }
}

function NoticeHeroImageField({
  imageUrl,
  onChange,
}: {
  imageUrl: string;
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
    if (file.size > NOTICE_HERO_MAX_BYTES) {
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
    const path = `heroes/${crypto.randomUUID()}.${ext}`;
    const previousPath = storagePathFromNoticeHeroUrl(imageUrl);

    setUploading(true);
    try {
      const { error: upErr } = await supabase.storage.from(NOTICE_HERO_BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });
      if (upErr) throw upErr;

      const { data } = supabase.storage.from(NOTICE_HERO_BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);

      if (previousPath && previousPath !== path) {
        await supabase.storage.from(NOTICE_HERO_BUCKET).remove([previousPath]);
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
    const p = storagePathFromNoticeHeroUrl(imageUrl);
    onChange('');
    if (p) {
      await supabase.storage.from(NOTICE_HERO_BUCKET).remove([p]);
    }
  };

  const showPreview = /^https?:\/\//i.test(imageUrl.trim());

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Hero image</label>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        Upload a banner or paste an HTTPS image URL. Leave empty for the built-in gradient.
      </p>

      <div className="rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#0f0f12] overflow-hidden">
        <div className="relative flex min-h-[140px] items-center justify-center bg-gray-50 dark:bg-[#141418] p-3">
          {showPreview ? (
            <img
              src={imageUrl.trim()}
              alt="Hero preview"
              className="max-h-44 w-auto max-w-full rounded-lg object-contain shadow-sm"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500 py-5">
              <ImageIcon className="w-9 h-9 opacity-50" aria-hidden />
              <span className="text-sm">No hero image yet</span>
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-[#0a0a0c]/75 backdrop-blur-[2px]">
              <Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden />
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
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/25 bg-primary text-white text-sm font-semibold shadow-sm shadow-primary/15 hover:bg-primary/90 hover:border-primary/35 disabled:opacity-50 dark:shadow-primary/10"
          >
            <Upload className="w-4 h-4 shrink-0" aria-hidden />
            {imageUrl.trim() ? 'Replace image' : 'Upload image'}
          </button>
          {imageUrl.trim() ? (
            <button
              type="button"
              onClick={() => void clearImage()}
              disabled={uploading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-[#303038] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-50 text-sm font-semibold"
            >
              <X className="w-4 h-4 shrink-0" aria-hidden />
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mt-3 mb-1">
        Image URL <span className="text-gray-400 font-normal">(optional)</span>
      </label>
      <input
        type="url"
        value={imageUrl}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg bg-white text-gray-900 placeholder:text-gray-400 dark:bg-[#111113] dark:text-gray-100 dark:placeholder:text-gray-500 transition-colors duration-300"
        placeholder="https://…/your-banner.png"
      />

      {localError ? <p className="text-xs text-red-600 dark:text-red-400 mt-2">{localError}</p> : null}
    </div>
  );
}
