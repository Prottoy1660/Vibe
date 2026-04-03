import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ShoppingBag, 
  ShoppingBasket, 
  Mail,
  Menu,
  X,
  Bell,
  LogOut,
  ShieldAlert,
  Users,
  Package,
  Ticket,
  Info,
  TrendingUp,
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
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { detectBrowserLanguage, setStoredLanguage } from '../lib/language';
import { PlatformBanner } from './PlatformBanner';
import { NotificationBell } from './NotificationBell';
import { LobbyMusicPlayer } from './LobbyMusicPlayer';

// Utility for merging tailwind classes
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const Layout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const location = useLocation();
  /** User-facing alerts only; admin workspace stays clean */
  const showGlobalBanners = !location.pathname.startsWith('/admin');
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const showCustomerInboxBell = Boolean(user && !location.pathname.startsWith('/admin'));

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }

    let cancelled = false;

    const checkAdmin = async () => {
      const { data } = await supabase
        .from('users')
        .select('role, is_banned, preferred_language')
        .eq('id', user.id)
        .single();

      if (cancelled) return;

      if (data?.is_banned) {
        alert('Your account has been suspended.');
        void signOut();
        return;
      }

      setIsAdmin(data?.role === 'admin');

      // Auto language personalization: first-time users inherit browser language.
      if (!data?.preferred_language) {
        const detected = detectBrowserLanguage();
        setStoredLanguage(detected);
        await supabase.from('users').update({ preferred_language: detected }).eq('id', user.id);
      } else if (data.preferred_language === 'bn' || data.preferred_language === 'en') {
        setStoredLanguage(data.preferred_language);
      }
    };

    void checkAdmin();
    return () => {
      cancelled = true;
    };
  }, [user, signOut]);

  const navigation = isAdmin ? [
    {
      name: 'Overview',
      items: [
        { name: 'Admin Dashboard', href: '/admin?tab=overview', icon: LayoutDashboard },
        { name: 'Financial Analytics', href: '/admin?tab=analytics', icon: TrendingUp },
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
        { name: 'Email Inventory', href: '/admin?tab=emails', icon: Mail },
        { name: 'User Intelligence', href: '/admin?tab=intelligence', icon: Fingerprint },
        { name: 'Redeem Codes', href: '/admin?tab=redeem', icon: Gift },
        { name: 'Tutorial & Help Page', href: '/admin?tab=tutorial_help', icon: CircleHelp },
        { name: 'Support tickets', href: '/admin?tab=support', icon: LifeBuoy },
        { name: 'Platform status', href: '/admin?tab=platform_settings', icon: Settings },
        { name: 'Lobby music', href: '/admin?tab=lobby_music', icon: Music2 },
        { name: 'Waitlist', href: '/admin?tab=waitlist', icon: Bell },
        { name: 'Ops Center', href: '/admin?tab=ops', icon: ShieldAlert },
        { name: 'Growth Ops', href: '/admin?tab=growth_ops', icon: TrendingUp },
      ]
    },
    {
      name: 'Personal',
      items: [
        { name: 'My Profile', href: '/profile', icon: UserIcon },
      ]
    }
  ] : [
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
        { name: 'Tutorial & Help', href: '/tutorial-help', icon: CircleHelp },
        { name: 'Support', href: '/support', icon: LifeBuoy },
      ],
    },
    {
      name: 'Personal',
      items: [
        { name: 'My Profile', href: '/profile', icon: UserIcon },
      ]
    }
  ];

  return (
      <div className="min-h-screen bg-background dark:bg-[#0a0a0b] flex flex-col md:flex-row transition-colors duration-300">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between bg-white dark:bg-[#111113] p-4 border-b border-gray-200 dark:border-[#26262d] transition-colors duration-300">
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
        "fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-[#111113] border-r border-gray-200 dark:border-[#26262d] transform transition-all duration-300 ease-in-out md:relative md:translate-x-0 flex flex-col",
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
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary dark:bg-slate-700 dark:text-white flex items-center justify-center font-medium text-sm transition-colors duration-300">
                {user?.user_metadata?.full_name?.substring(0, 2).toUpperCase() || user?.email?.substring(0, 2).toUpperCase() || 'U'}
              </div>
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

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          <div className="max-w-6xl mx-auto">
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
    </div>
  );
};
