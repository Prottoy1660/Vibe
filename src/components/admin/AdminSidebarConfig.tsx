import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { EyeOff, Eye, Loader2, Save, ShieldAlert } from 'lucide-react';
import { cn } from '../../lib/cn';

const AVAILABLE_TABS = [
  { id: 'overview', label: 'Admin Dashboard' },
  { id: 'finance', label: 'Profit' },
  { id: 'analytics', label: 'Financial Analytics' },
  { id: 'activity', label: 'Activity log' },
  { id: 'products', label: 'Product Management' },
  { id: 'orders', label: 'Manage Orders' },
  { id: 'users', label: 'User Management' },
  { id: 'coupons', label: 'Coupon Management' },
  { id: 'user_emails', label: 'User Subscriptions' },
  { id: 'notices', label: 'Important Notices' },
  { id: 'user_notifications', label: 'User notifications' },
  { id: 'emails', label: 'Email Inventory' },
  { id: 'intelligence', label: 'User Intelligence' },
  { id: 'redeem', label: 'Redeem Codes' },
  { id: 'tutorial_help', label: 'Tutorial & Help Page' },
  { id: 'support', label: 'Support tickets' },
  { id: 'support_chat_ai', label: 'Help chat (AI)' },
  { id: 'platform_settings', label: 'Platform status' },
  { id: 'app_downloads', label: 'App downloads' },
  { id: 'subscription_reminders', label: 'Subscription reminders' },
  { id: 'lobby_music', label: 'Lobby music' },
  { id: 'waitlist', label: 'Waitlist' },
  { id: 'ops', label: 'Ops Center' },
  { id: 'growth_ops', label: 'Growth Ops' },
];

import { getApiBaseUrl } from '../../lib/apiBase';

export const AdminSidebarConfig = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hiddenTabs, setHiddenTabs] = useState<string[]>([]);
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'admin_sidebar_config')
          .maybeSingle();

        if (error) throw error;
        if (!cancelled && data?.value) {
          const config = data.value as { hidden_tabs?: string[] };
          setHiddenTabs(config.hidden_tabs || []);
        }
      } catch (err) {
        console.error('Failed to load sidebar config:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchConfig();
    return () => { cancelled = true; };
  }, []);

  const handleToggle = (tabId: string) => {
    setSaveMsg(null);
    setHiddenTabs(prev => 
      prev.includes(tabId) ? prev.filter(t => t !== tabId) : [...prev, tabId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const base = getApiBaseUrl().replace(/\/$/, '');
      const res = await fetch(`${base}/api/admin/ops/sidebar-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ hidden_tabs: hiddenTabs }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || json?.message || 'Request failed');

      setSaveMsg({ type: 'ok', text: 'Settings saved! General admins will no longer see hidden tabs. (Refresh may be required)' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setSaveMsg({ type: 'err', text: msg });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Super Admin Controls</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Select which sidebar tabs should be hidden from regular Admin accounts. You (Super Admin) will always see all tabs.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#151518] rounded-2xl p-6 border border-gray-100 dark:border-[#26262d] shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {AVAILABLE_TABS.map(tab => {
            const isHidden = hiddenTabs.includes(tab.id);
            return (
              <div 
                key={tab.id}
                onClick={() => handleToggle(tab.id)}
                className={cn(
                  "cursor-pointer border rounded-xl p-4 flex items-center justify-between transition-colors",
                  isHidden 
                    ? "border-red-200 bg-red-50/50 dark:border-red-900/30 dark:bg-red-900/10" 
                    : "border-gray-200 hover:border-indigo-300 dark:border-[#26262d] dark:hover:border-indigo-500/50"
                )}
              >
                <div className="font-medium text-sm text-gray-800 dark:text-gray-200">
                  {tab.label}
                </div>
                <div className={cn(
                  "flex items-center gap-2 text-xs font-semibold px-2.5 py-1 rounded-md",
                  isHidden ? "text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30" : "text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30"
                )}>
                  {isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {isHidden ? 'Hidden' : 'Visible'}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Save Configuration
          </button>
          
          {saveMsg && (
            <div className={cn(
              "text-sm font-medium",
              saveMsg.type === 'ok' ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
            )}>
              {saveMsg.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
