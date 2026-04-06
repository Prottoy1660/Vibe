import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useFingerprint } from '../hooks/useFingerprint';
import { postJsonWithFallback } from '../lib/apiClient';
import { hasMinimumPhone } from '../lib/phoneRequired';
import { toast } from '../lib/toast';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: string | null;
  /** `public.users.phone` after profile row load; null until fetched */
  profilePhone: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  /** Customers (non-admin) must add a valid phone before using the app (OAuth / referral login). */
  needsMandatoryPhone: boolean;
  signOut: () => Promise<void>;
  refreshUserProfile: () => Promise<{ phone: string | null; role: string | null } | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  role: null,
  profilePhone: null,
  isAdmin: false,
  isSuperAdmin: false,
  needsMandatoryPhone: false,
  signOut: async () => {},
  refreshUserProfile: async () => null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [profilePhone, setProfilePhone] = useState<string | null>(null);
  const lastUserIdRef = useRef<string | null>(null);
  const expiryWarnTimerRef = useRef<number | null>(null);

  // Silently collect device + browser intelligence on login
  useFingerprint(user);

  const refreshUserProfile = useCallback(async () => {
    if (!user?.id) {
      setRole(null);
      setProfilePhone(null);
      return null;
    }
    const { data } = await supabase.from('users').select('role, phone').eq('id', user.id).single();
    const r = data?.role ?? 'customer';
    const p = data?.phone ?? null;
    setRole(r);
    setProfilePhone(p);
    return { role: r, phone: p };
  }, [user?.id]);

  // Fetch role + phone once when user changes — single query for Layout gate + admin checks
  useEffect(() => {
    if (!user) {
      setRole(null);
      setProfilePhone(null);
      return;
    }
    // Prevent transient state (old role/phone) from briefly triggering Layout redirects
    // during auth refresh / sign-in / sign-out transitions.
    setRole(null);
    setProfilePhone(null);
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from('users').select('role, phone').eq('id', user.id).single();
      if (cancelled) return;
      setRole(data?.role ?? 'customer');
      setProfilePhone(data?.phone ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    const applyAuthTokensFromDeepLinkUrl = async (url: string) => {
      try {
        const parsed = new URL(url);
        const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : '';
        const hashParams = new URLSearchParams(hash);
        const queryParams = parsed.searchParams;
        const accessToken = hashParams.get('access_token') || queryParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token');
        if (!accessToken || !refreshToken) return;
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      } catch (error) {
        console.error('Failed to apply auth tokens from deep link', error);
      }
    };

    const applyAuthTokensFromUrl = async () => {
      if (typeof window === 'undefined') return;
      try {
        const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
        const hashParams = new URLSearchParams(hash);
        const queryParams = new URLSearchParams(window.location.search);
        const accessToken = hashParams.get('access_token') || queryParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token');
        if (!accessToken || !refreshToken) return;

        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        // Clean URL so tokens are not left in browser history.
        const clean = `${window.location.origin}${window.location.pathname}`;
        window.history.replaceState({}, document.title, clean);
      } catch (error) {
        console.error('Failed to apply auth tokens from URL callback', error);
      }
    };

    const initDeepLinkAuth = async () => {
      const isTauriRuntime =
        typeof window !== 'undefined' &&
        ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
      if (!isTauriRuntime) return;
      try {
        const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
        const current = await getCurrent();
        for (const url of current || []) {
          await applyAuthTokensFromDeepLinkUrl(url);
        }
        await onOpenUrl(async (urls) => {
          for (const url of urls || []) {
            await applyAuthTokensFromDeepLinkUrl(url);
          }
        });
      } catch (error) {
        console.error('Deep-link auth bridge is unavailable', error);
      }
    };

    void applyAuthTokensFromUrl();
    void initDeepLinkAuth();

    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      const nextUserId = session?.user?.id ?? null;
      if (lastUserIdRef.current !== nextUserId) {
        setRole(null);
        setProfilePhone(null);
      }
      lastUserIdRef.current = nextUserId;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? null;
      if (lastUserIdRef.current !== nextUserId) {
        setRole(null);
        setProfilePhone(null);
      }
      lastUserIdRef.current = nextUserId;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Apply referral code stored during register/login flow (e.g. email confirmation delayed session).
  useEffect(() => {
    if (!user || loading) return;
    const pending = sessionStorage.getItem('referral_pending_code');
    if (!pending || pending.length < 4) return;
    sessionStorage.removeItem('referral_pending_code');
    void postJsonWithFallback('/api/referral/claim', { code: pending }, { skipErrorPageRedirect: true }).catch(() => {
      sessionStorage.setItem('referral_pending_code', pending);
    });
  }, [user, loading]);

  // Warn shortly before access token expiration so users can avoid surprise failures.
  useEffect(() => {
    if (expiryWarnTimerRef.current) {
      window.clearTimeout(expiryWarnTimerRef.current);
      expiryWarnTimerRef.current = null;
    }
    if (!session?.access_token) return;
    const parts = session.access_token.split('.');
    if (parts.length < 2) return;
    try {
      const payload = JSON.parse(atob(parts[1])) as { exp?: number };
      if (!payload?.exp) return;
      const warnAtMs = payload.exp * 1000 - 2 * 60 * 1000;
      const delayMs = warnAtMs - Date.now();
      if (delayMs <= 0) return;
      expiryWarnTimerRef.current = window.setTimeout(() => {
        toast.warning('Session expiring soon', {
          description: 'Please save your work. You may need to sign in again.',
        });
      }, delayMs);
    } catch {
      // Ignore malformed token payload.
    }
    return () => {
      if (expiryWarnTimerRef.current) {
        window.clearTimeout(expiryWarnTimerRef.current);
        expiryWarnTimerRef.current = null;
      }
    };
  }, [session?.access_token]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const isAdminUser = role === 'admin' || role === 'super_admin';
  const needsMandatoryPhone = Boolean(
    user && role !== null && !isAdminUser && !hasMinimumPhone(profilePhone),
  );

  const value = {
    user,
    session,
    loading,
    role,
    profilePhone,
    isAdmin: isAdminUser,
    isSuperAdmin: role === 'super_admin',
    needsMandatoryPhone,
    signOut,
    refreshUserProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};