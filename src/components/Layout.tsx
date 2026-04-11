import React, { useState, useEffect, useMemo } from 'react';
import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ShoppingBag, 
  ShoppingBasket, 
  Mail,
  Menu,
  X,
  Bell,
  BellRing,
  LogOut,
  ShieldAlert,
  Users,
  Package,
  Ticket,
  Info,
  TrendingUp,
  Wallet,
  Receipt,
  ScrollText,
  User as UserIcon,
  Sun,
  Moon,
  Fingerprint,
  Gift,
  CircleHelp,
  LifeBuoy,
  Settings,
  Megaphone,
  Music2,
  MessageCircle,
  Download,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useMaintenanceMode } from '../contexts/MaintenanceModeContext';
import { PublicMaintenancePage } from '../pages/PublicMaintenancePage';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { detectBrowserLanguage, setStoredLanguage } from '../lib/language';
import { PlatformBanner } from './PlatformBanner';
import { NotificationBell } from './NotificationBell';
import { LobbyMusicPlayer } from './LobbyMusicPlayer';
import { SupportChatWidget } from './support/SupportChatWidget';
import { PushEnablePrompt } from './PushEnablePrompt';
import { getDefaultAvatarUrl, parseAvatarDefaultGender, type AvatarDefaultGender } from '../lib/defaultAvatar';

// Utility for merging tailwind classes
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const Layout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  /** User-facing alerts only; admin workspace stays clean */
  const showGlobalBanners = !location.pathname.startsWith('/admin');
  const isProfilePage = location.pathname === '/profile';
  const { user, signOut, isAdmin, isSuperAdmin, loading: authLoading, role, needsMandatoryPhone } = useAuth();
  /** Help chat: customers only — not on /admin and not for admin/super_admin accounts. */
  const showSupportChat = showGlobalBanners && !isAdmin;
  const { platform: maintPlatform, ready: maintReady } = useMaintenanceMode();
  const roleResolved = !user || role !== null;
  const { theme, toggleTheme } = useTheme();
  const showCustomerInboxBell = Boolean(user && !location.pathname.startsWith('/admin'));
  /** `public.users.avatar_url` for topbar — matches Dashboard / Profile default image when empty */
  const [headerAvatarUrl, setHeaderAvatarUrl] = useState<string | null>(null);
  const [headerAvatarGender, setHeaderAvatarGender] = useState<AvatarDefaultGender>('auto');

  // Ban check + language personalization (only runs once per login, lightweight)
  useEffect(() => {
    if (!user) {
      setHeaderAvatarUrl(null);
      setHeaderAvatarGender('auto');
      return;
    }

    let cancelled = false;

    const checkUserStatus = async () => {
      const { data } = await supabase
        .from('users')
        .select('is_banned, preferred_language, avatar_url, avatar_default_gender')
        .eq('id', user.id)
        .single();

      if (cancelled) return;

      setHeaderAvatarUrl(typeof data?.avatar_url === 'string' && data.avatar_url.trim() ? data.avatar_url.trim() : null);
      setHeaderAvatarGender(parseAvatarDefaultGender(data?.avatar_default_gender));

      if (data?.is_banned) {
        toast.error('Your account has been suspended.');
        void signOut();
        return;
      }

      // Auto language personalization: first-time users inherit browser language.
      if (!data?.preferred_language) {
        const detected = detectBrowserLanguage();
        setStoredLanguage(detected);
        await supabase.from('users').update({ preferred_language: detected }).eq('id', user.id);
      } else if (data.preferred_language === 'bn' || data.preferred_language === 'en') {
        setStoredLanguage(data.preferred_language);
      }
    };

    void checkUserStatus();
    const onHeaderAvatarRefresh = () => {
      void checkUserStatus();
    };
    window.addEventListener('vibe:header-avatar-refresh', onHeaderAvatarRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener('vibe:header-avatar-refresh', onHeaderAvatarRefresh);
    };
  }, [user, signOut]);

  const [referralNavVisible, setReferralNavVisible] = useState<boolean | null>(null);
  const [downloadsNavVisible, setDownloadsNavVisible] = useState<boolean | null>(null);

  useEffect(() => {
    if (isAdmin) {
      setReferralNavVisible(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'referral_program')
        .maybeSingle();
      if (cancelled) return;
      const v = (data?.value || {}) as { enabled?: boolean };
      setReferralNavVisible(v.enabled !== false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      setDownloadsNavVisible(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'customer_app_downloads')
        .maybeSingle();
      if (cancelled) return;
      const v = (data?.value || {}) as { enabled?: boolean };
      setDownloadsNavVisible(v.enabled !== false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const [hiddenAdminTabs, setHiddenAdminTabs] = useState<string[]>([]);
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    supabase.from('system_settings').select('value').eq('key', 'admin_sidebar_config').maybeSingle().then(({ data }) => {
      if (cancelled) return;
      const val = (data?.value || {}) as { hidden_tabs?: string[] };
      setHiddenAdminTabs(val.hidden_tabs || []);
    });
    return () => { cancelled = true; };
  }, [isAdmin]);

  const topbarAvatarSrc = useMemo(() => {
    if (!user) return null;
    const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
    return headerAvatarUrl || getDefaultAvatarUrl(user.email || user.id, name, headerAvatarGender);
  }, [user, headerAvatarUrl, headerAvatarGender]);

  const navigation = useMemo(
    () =>
      isAdmin
        ? [
    {
      name: 'Overview',
      items: [
        { name: 'Admin Dashboard', href: '/admin?tab=overview', icon: LayoutDashboard },
        { name: 'Profit', href: '/admin?tab=finance', icon: Wallet },
        { name: 'Expenses', href: '/admin?tab=expenses', icon: Receipt },
        { name: 'Financial Analytics', href: '/admin?tab=analytics', icon: TrendingUp },
        { name: 'Activity log', href: '/admin?tab=activity', icon: ScrollText },
      ]
    },
    {
      name: 'Store & Users',
      items: [
        { name: 'Product Management', href: '/admin?tab=products', icon: Package },
        { name: 'Manage Orders', href: '/admin?tab=orders', icon: ShoppingBasket },
        { name: 'User Management', href: '/admin?tab=users', icon: Users },
        { name: 'Coupon Management', href: '/admin?tab=coupons', icon: Ticket },
      ]
    },
    {
      name: 'Services & System',
      items: [
        { name: 'User Subscriptions', href: '/admin?tab=user_emails', icon: ShieldAlert },
        { name: 'Important Notices', href: '/admin?tab=notices', icon: Info },
        { name: 'User notifications', href: '/admin?tab=user_notifications', icon: Megaphone },
        { name: 'Notification history', href: '/admin?tab=user_inbox_history', icon: Megaphone },
        { name: 'Push notifications', href: '/admin?tab=push_notifications', icon: BellRing },
        { name: 'Email Inventory', href: '/admin?tab=emails', icon: Mail },
        { name: 'User Intelligence', href: '/admin?tab=intelligence', icon: Fingerprint },
        { name: 'Redeem Codes', href: '/admin?tab=redeem', icon: Gift },
        { name: 'Tutorial & Help Page', href: '/admin?tab=tutorial_help', icon: CircleHelp },
        { name: 'Support tickets', href: '/admin?tab=support', icon: LifeBuoy },
        { name: 'Help chat (AI)', href: '/admin?tab=support_chat_ai', icon: MessageCircle },
        { name: 'Platform status', href: '/admin?tab=platform_settings', icon: Settings },
        { name: 'App downloads', href: '/admin?tab=app_downloads', icon: Download },
        { name: 'Subscription reminders', href: '/admin?tab=subscription_reminders', icon: BellRing },
        { name: 'Lobby music', href: '/admin?tab=lobby_music', icon: Music2 },
        { name: 'Waitlist', href: '/admin?tab=waitlist', icon: Bell },
        { name: 'Ops Center', href: '/admin?tab=ops', icon: ShieldAlert },
        { name: 'Growth Ops', href: '/admin?tab=growth_ops', icon: TrendingUp },
      ]
    },
    ...(isSuperAdmin ? [{
      name: 'Super Admin Tools',
      items: [
        { name: 'Sidebar Visibility', href: '/admin?tab=sidebar_config', icon: ShieldAlert },
      ]
    }] : []),
    {
      name: 'Personal',
      items: [
        { name: 'My Profile', href: '/profile', icon: UserIcon },
      ]
    }
  ].map((section) => ({
     ...section,
     items: section.items?.filter(item => {
       if (isSuperAdmin) return true;
       const match = item.href.match(/tab=([^&]+)/);
       if (match && hiddenAdminTabs.includes(match[1])) {
         return false;
       }
       return true;
     })
  })).filter(section => section.items && section.items.length > 0)
        : [
            { name: 'Dashboard', href: '/', icon: LayoutDashboard },
            {
              name: 'Purchases',
              items: [
                { name: 'Store', href: '/store', icon: ShoppingBag },
                { name: 'Orders', href: '/orders', icon: ShoppingBasket },
              ],
            },
            {
              name: 'Services',
              items: [
                { name: 'Adobe Email', href: '/adobe-email', icon: Mail, highlight: true },
                ...(downloadsNavVisible === true ? [{ name: 'Apps download', href: '/downloads', icon: Download }] : []),
                ...(referralNavVisible === true ? [{ name: 'Refer & earn', href: '/refer', icon: Gift }] : []),
                { name: 'Tutorial & Help', href: '/tutorial-help', icon: CircleHelp },
                { name: 'Support', href: '/support', icon: LifeBuoy },
              ],
            },
            {
              name: 'Personal',
              items: [{ name: 'My Profile', href: '/profile', icon: UserIcon }],
            },
          ],
    [isAdmin, isSuperAdmin, referralNavVisible, downloadsNavVisible, hiddenAdminTabs]
  );

  if (!maintReady || authLoading || (user && !roleResolved)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050508]">
        <Loader2 className="h-10 w-10 animate-spin text-violet-500" aria-hidden />
      </div>
    );
  }

  if (maintPlatform.lock_public_site && !isAdmin) {
    return <PublicMaintenancePage message={maintPlatform.message} />;
  }

  if (user && needsMandatoryPhone) {
    return <Navigate to="/phone-required" replace />;
  }

  return (
      <div className="min-h-screen bg-background dark:bg-[#0a0a0b] flex flex-col md:flex-row transition-colors duration-300">
      {/* Mobile Header */}
      <div
        className="md:hidden flex items-center justify-between bg-white dark:bg-[#111113] p-4 border-b border-gray-200 dark:border-[#26262d] transition-colors duration-300"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
      >
        <Link to="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
            Vibe
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">Access</span>
        </Link>
        <div className="flex items-center gap-2">
          <button 
            onClick={toggleTheme}
            className="p-2 text-gray-400 dark:text-gray-500"
          >
            {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>
          {user?.id ? <NotificationBell userId={user.id} enabled={showCustomerInboxBell} /> : null}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-gray-600 dark:text-gray-300">
            {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-[#111113] border-r border-gray-200 dark:border-[#26262d] transform transition-all duration-300 ease-in-out md:relative md:translate-x-0 flex flex-col pt-[env(safe-area-inset-top)] md:pt-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="hidden md:flex h-16 items-center px-6 border-b border-gray-200 dark:border-[#26262d] transition-colors duration-300">
          <Link to="/" className="flex flex-col hover:opacity-80 transition-opacity">
            <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
              Vibe
            </span>
            <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium tracking-widest uppercase -mt-1">
              Access
            </span>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <nav className="p-4 space-y-8">
            {navigation.map((section, idx) => (
              <div key={idx}>
                {section.items ? (
                  <>
                    <h3 className="px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                      {section.name}
                    </h3>
                    <div className="space-y-1">
                      {section.items.map((item) => {
                        // Custom active logic to handle query parameters for admin routes
                        const isActive = isAdmin 
                          ? (location.pathname + location.search) === item.href || (location.pathname === '/admin' && !location.search && item.href === '/admin?tab=overview')
                          : location.pathname === item.href;
                          
                        return (
                          <Link
                            key={item.name}
                            to={item.href}
                            onClick={() => setSidebarOpen(false)}
                            className={cn(
                              "flex items-center px-3 py-2 text-sm font-medium rounded-xl transition-colors",
                              isActive 
                                ? "bg-primary/10 dark:bg-primary/20 text-primary dark:text-indigo-400" 
                                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white"
                            )}
                          >
                            <item.icon className={cn(
                              "mr-3 h-5 w-5",
                              isActive ? "text-primary dark:text-indigo-400" : "text-gray-400 dark:text-gray-500",
                              item.highlight && !isActive && "text-red-500 dark:text-red-400"
                            )} />
                            {item.name}
                          </Link>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <Link
                    to={section.href!}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center px-3 py-2 text-sm font-medium rounded-xl transition-colors",
                      location.pathname === section.href
                        ? "bg-primary/10 dark:bg-primary/20 text-primary dark:text-indigo-400"
                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white"
                    )}
                  >
                    {section.icon && (
                      <section.icon className={cn(
                        "mr-3 h-5 w-5",
                        location.pathname === section.href ? "text-primary dark:text-indigo-400" : "text-gray-400 dark:text-gray-500"
                      )} />
                    )}
                    {section.name}
                  </Link>
                )}
              </div>
            ))}
          </nav>
        </div>

        {/* Sidebar bottom — Logout */}
        <div className="p-4 border-t border-gray-200 dark:border-[#26262d]">
          <button
            onClick={() => { setSidebarOpen(false); signOut(); }}
            className="flex items-center w-full px-3 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="mr-3 h-5 w-5" />
            Sign out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 bg-white dark:bg-[#111113] border-b border-gray-200 dark:border-[#26262d] hidden md:flex items-center justify-end px-8 transition-colors duration-300">
          <div className="flex items-center space-x-4">
            <button 
              onClick={toggleTheme}
              className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </button>
            {user?.id ? <NotificationBell userId={user.id} enabled={showCustomerInboxBell} /> : null}
            <div className="flex items-center space-x-3 border-l border-gray-200 dark:border-[#26262d] pl-4">
              {user && topbarAvatarSrc ? (
                <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-gray-200 bg-gray-50 shadow-sm dark:border-[#2a2a32] dark:bg-[#1a1a1f] dark:ring-1 dark:ring-white/[0.06]">
                  <img
                    src={topbarAvatarSrc}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover object-center"
                  />
                </div>
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary dark:bg-slate-700 dark:text-white">
                  U
                </div>
              )}
              <button 
                onClick={signOut}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center transition-colors"
              >
                <LogOut className="h-4 w-4 mr-1" />
                Logout
              </button>
            </div>
          </div>
        </header>

        {showGlobalBanners ? <PlatformBanner /> : null}

        {/* Page Content — profile uses flex column so short pages don’t leave a huge empty band below */}
        <main
          className={cn(
            'flex-1 min-h-0 overflow-y-auto',
            isProfilePage && 'flex flex-col',
            isProfilePage ? 'px-3 py-2 pb-4 md:px-6 md:py-4 md:pb-6' : 'p-4 md:p-8',
          )}
        >
          <div
            className={cn(
              'mx-auto w-full',
              isProfilePage
                ? 'max-w-7xl flex flex-1 flex-col max-lg:min-h-[calc(100dvh-9.5rem)] max-lg:justify-center max-lg:py-2 lg:block lg:min-h-0 lg:flex-none lg:py-0'
                : 'max-w-6xl',
            )}
          >
            {showGlobalBanners && user?.id && !isAdmin ? <PushEnablePrompt userId={user.id} /> : null}
            <Outlet />
          </div>
        </main>
        
        {/* Footer */}
        <footer className="py-4 text-center text-sm text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-[#26262d] bg-white/80 dark:bg-[#111113] transition-colors duration-300">
          <p>
            © 2026 – VibeAccess
            <span className="mx-2 opacity-40">·</span>
            <Link to="/status" className="underline hover:text-indigo-600 dark:hover:text-indigo-400 font-medium">
              Status
            </Link>
          </p>
        </footer>
      </div>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <LobbyMusicPlayer userId={user?.id ?? null} adminRoute={location.pathname.startsWith('/admin')} />

      {showSupportChat ? <SupportChatWidget /> : null}
    </div>
  );
};
