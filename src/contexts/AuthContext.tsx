import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useFingerprint } from '../hooks/useFingerprint';
import { postJsonWithFallback } from '../lib/apiClient';
import { hasMinimumPhone } from '../lib/phoneRequired';

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
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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