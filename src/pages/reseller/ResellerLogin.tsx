import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, ArrowRight, Loader2, Search } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { getResellerAuthRedirectUrl } from '../../lib/resellerAuth';
import { getApiBaseUrl } from '../../lib/apiBase';
import { isResellerEmailVerificationRequired, isResellerPasswordResetEnabled, parseAuthSettings } from '../../lib/authSettings';
import { syncResellerProfileViaApi } from '../../lib/ensureResellerRole';

export const ResellerLogin = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const verifyEmailSent = searchParams.get('verify') === 'sent';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(verifyEmailSent);
  const [requireEmailVerification, setRequireEmailVerification] = useState(true);
  const [passwordResetEnabled, setPasswordResetEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'auth_settings')
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const settings = parseAuthSettings(data?.value);
        setRequireEmailVerification(isResellerEmailVerificationRequired(settings));
        setPasswordResetEnabled(isResellerPasswordResetEnabled(settings));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const fromQuery = searchParams.get('email');
    if (fromQuery) setEmail(fromQuery);
    if (searchParams.get('verify') === 'sent') setNeedsVerification(true);
  }, [searchParams]);

  // After email verification (magic link), tokens land here — send straight to dashboard.
  useEffect(() => {
    let cancelled = false;

    const finishResellerSession = async (accessToken: string, userId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session?.user || session.user.id !== userId) return;

      const synced = await syncResellerProfileViaApi(accessToken);
      if (cancelled) return;
      if (!synced.ok) {
        await supabase.auth.signOut();
        toast.error(synced.error || 'This account does not have reseller privileges.');
        return;
      }
      toast.success('Email verified — welcome to Super Reseller!');
      navigate('/reseller/dashboard', { replace: true });
    };

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && session.access_token) {
        void finishResellerSession(session.access_token, session.user.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user && session.access_token) {
        void finishResellerSession(session.access_token, session.user.id);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleResendVerification = async () => {
    if (!email) {
      toast.error('Enter your email address first.');
      return;
    }
    setResendLoading(true);
    try {
      const apiRes = await fetch(`${getApiBaseUrl()}/api/auth/reseller-resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = await apiRes.json().catch(() => ({}));
      if (!apiRes.ok || !payload.success) {
        if (payload.alreadyVerified) {
          throw new Error('This email is already verified. Sign in with your password below.');
        }
        throw new Error(payload.error || 'Could not resend verification email');
      }
      toast.success(
        payload.message ||
          'Check your inbox and spam for an email from Super Reseller (verification or activation link).',
        { duration: 10000 },
      );
      setNeedsVerification(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to resend verification email');
    } finally {
      setResendLoading(false);
    }
  };

  const tryActivateWhenVerificationOff = async (): Promise<boolean> => {
    if (requireEmailVerification || !email) return false;
    const apiRes = await fetch(`${getApiBaseUrl()}/api/auth/reseller-resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const payload = await apiRes.json().catch(() => ({}));
    return Boolean(apiRes.ok && payload.success && payload.verificationDisabled);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      let { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error && /email not confirmed/i.test(error.message)) {
        if (!requireEmailVerification) {
          const activated = await tryActivateWhenVerificationOff();
          if (activated) {
            const retry = await supabase.auth.signInWithPassword({ email, password });
            data = retry.data;
            error = retry.error;
          }
        }
        if (error && /email not confirmed/i.test(error.message)) {
          setNeedsVerification(true);
          throw new Error(
            requireEmailVerification
              ? 'Your email is not verified yet. Tap “Resend verification email” below — we will send a new Super Reseller link (or an activation link to set your password).'
              : 'Could not activate your account. Please contact support.',
          );
        }
      }

      if (error) throw error;
      if (!data?.user || !data.session?.access_token) throw new Error('Sign in failed.');

      setNeedsVerification(false);

      const synced = await syncResellerProfileViaApi(data.session.access_token);
      if (!synced.ok) {
        await supabase.auth.signOut();
        throw new Error(synced.error || 'Unauthorized. This account does not have reseller privileges.');
      }

      toast.success('Welcome back to Super Reseller!');
      navigate('/reseller/dashboard');
    } catch (error: any) {
      toast.error(error.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      // Create a specific callback URL for reseller google login
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getResellerAuthRedirectUrl('/reseller/oauth/callback'),
        },
      });

      if (error) throw error;
    } catch (error: any) {
      toast.error(error.message || 'Failed to initialize Google login');
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans selection:bg-indigo-500/30 relative overflow-hidden">
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/10 blur-[150px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/10 blur-[150px]" />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center"
        >
          <div className="h-20 w-20 flex items-center justify-center">
            <img src="/super.png" alt="Super Reseller" className="h-full w-full object-contain drop-shadow-2xl" />
          </div>
        </motion.div>
        <motion.h2 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="mt-6 text-center text-3xl font-bold text-white tracking-tight"
        >
          Super Reseller
        </motion.h2>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mt-2 text-center text-sm text-gray-400"
        >
          Sign in to manage your licenses and clients
        </motion.p>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10"
      >
        <div className="bg-[#0a0a0a]/80 backdrop-blur-3xl py-8 px-4 shadow-2xl sm:rounded-3xl sm:px-10 border border-white/10">
          {requireEmailVerification && (verifyEmailSent || needsVerification) && (
            <div className="mb-6 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 space-y-3">
              <p>
                {verifyEmailSent
                  ? 'We sent a verification link from Super Reseller. Open it in your inbox (check spam), then sign in.'
                  : 'Your account exists but email is not verified yet. Request a new link below.'}
              </p>
              <button
                type="button"
                onClick={() => void handleResendVerification()}
                disabled={resendLoading || !email}
                className="w-full py-2.5 rounded-lg text-sm font-bold bg-white text-black hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                {resendLoading ? 'Sending…' : 'Resend verification email'}
              </button>
            </div>
          )}
          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label className="block text-sm font-semibold text-gray-300 ml-1">Email address</label>
              <div className="mt-2 relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-500" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3.5 bg-[#111111] border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-white/20 focus:border-white/20 transition-all placeholder:text-gray-600"
                  placeholder="partner@example.com"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between ml-1">
                <label className="block text-sm font-semibold text-gray-300">Password</label>
                {passwordResetEnabled ? (
                  <Link to="/reseller/forgot-password" className="text-xs font-medium text-gray-400 hover:text-white transition-colors">
                    Forgot password?
                  </Link>
                ) : null}
              </div>
              <div className="mt-2 relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-500" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3.5 bg-[#111111] border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-white/20 focus:border-white/20 transition-all placeholder:text-gray-600"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-xl shadow-white/5 text-sm font-bold text-black bg-white hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 active:scale-[0.98]"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign in securely'}
              </button>
            </div>
          </form>

          {requireEmailVerification && !verifyEmailSent && !needsVerification && (
            <p className="mt-4 text-center text-xs text-gray-500">
              Didn&apos;t receive the verification email?{' '}
              <button
                type="button"
                onClick={() => void handleResendVerification()}
                disabled={resendLoading || !email}
                className="text-indigo-300 hover:text-white font-semibold underline-offset-2 hover:underline disabled:opacity-50"
              >
                Resend link
              </button>
            </p>
          )}

          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-[#0a0a0a] text-gray-500">Don&apos;t have a reseller account?</span>
              </div>
            </div>

            <div className="mt-6">
              <Link
                to="/reseller/signup"
                className="w-full flex justify-center items-center gap-2 py-3.5 px-4 border border-white/10 rounded-xl shadow-sm text-sm font-bold text-white bg-white/5 hover:bg-white/10 transition-all duration-300"
              >
                Apply for Reseller Access
                <ArrowRight className="w-4 h-4 ml-1 opacity-50" />
              </Link>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45 }}
        className="mt-4 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0 text-center"
      >
        <Link
          to="/reseller/search"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-white transition-colors"
        >
          <Search className="h-4 w-4" />
          Status check
        </Link>
      </motion.div>
    </div>
  );
};
