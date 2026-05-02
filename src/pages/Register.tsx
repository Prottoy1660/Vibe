import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  Mail,
  Lock,
  User,
  AlertCircle,
  Loader2,
  Phone,
  ArrowRight,
  Sun,
  Moon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../contexts/ThemeContext';
import { AuthCalmSidePanel } from '../components/auth/AuthCalmSidePanel';
import { isAllowedSignupEmail, SIGNUP_EMAIL_DOMAIN_BLOCKED } from '../lib/allowedSignupEmailDomains';
import { requestSignupIntent } from '../lib/signupIntent';
import { postJsonWithFallback } from '../lib/apiClient';
import { hasMinimumPhone } from '../lib/phoneRequired';
import { toast } from '../lib/toast';

export const Register = () => {
  const [searchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [googleLoginEnabled, setGoogleLoginEnabled] = useState(true);
  const [facebookLoginEnabled, setFacebookLoginEnabled] = useState(true);
  const [microsoftLoginEnabled, setMicrosoftLoginEnabled] = useState(true);
  const [googleLoginUnderMaintenance, setGoogleLoginUnderMaintenance] = useState(false);
  const [facebookLoginUnderMaintenance, setFacebookLoginUnderMaintenance] = useState(false);
  const [microsoftLoginUnderMaintenance, setMicrosoftLoginUnderMaintenance] = useState(false);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const normalizedEmail = email.trim().toLowerCase();
  const showEmailDomainHint = normalizedEmail.length > 0 && normalizedEmail.includes('@') && !isAllowedSignupEmail(normalizedEmail);

  useEffect(() => {
    const r = searchParams.get('ref') || searchParams.get('referral');
    if (r) {
      const cleaned = r.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (cleaned.length >= 4) {
        sessionStorage.setItem('referral_pending_code', cleaned);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    const fetchSettings = async () => {
      const { data } = await supabase.from('system_settings').select('value').eq('key', 'auth_settings').maybeSingle();
      if (cancelled) return;
      if (data && data.value) {
        const v = data.value as {
          enable_google_login?: boolean;
          enable_facebook_login?: boolean;
          enable_microsoft_login?: boolean;
          google_login_under_maintenance?: boolean;
          facebook_login_under_maintenance?: boolean;
          microsoft_login_under_maintenance?: boolean;
        };
        setGoogleLoginEnabled(v.enable_google_login !== false);
        setFacebookLoginEnabled(v.enable_facebook_login !== false);
        setMicrosoftLoginEnabled(v.enable_microsoft_login !== false);
        setGoogleLoginUnderMaintenance(v.google_login_under_maintenance === true);
        setFacebookLoginUnderMaintenance(v.facebook_login_under_maintenance === true);
        setMicrosoftLoginUnderMaintenance(v.microsoft_login_under_maintenance === true);
      } else {
        setGoogleLoginEnabled(true);
        setFacebookLoginEnabled(true);
        setMicrosoftLoginEnabled(true);
        setGoogleLoginUnderMaintenance(false);
        setFacebookLoginUnderMaintenance(false);
        setMicrosoftLoginUnderMaintenance(false);
      }
    };
    void fetchSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  // Realtime: auth provider buttons should reflect settings changes immediately.
  const authSettingsRtTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const schedule = () => {
      if (authSettingsRtTimerRef.current) window.clearTimeout(authSettingsRtTimerRef.current);
      authSettingsRtTimerRef.current = window.setTimeout(async () => {
        const { data } = await supabase.from('system_settings').select('value').eq('key', 'auth_settings').maybeSingle();
        if (data && data.value) {
          const v = data.value as {
            enable_google_login?: boolean;
            enable_facebook_login?: boolean;
            enable_microsoft_login?: boolean;
            google_login_under_maintenance?: boolean;
            facebook_login_under_maintenance?: boolean;
            microsoft_login_under_maintenance?: boolean;
          };
          setGoogleLoginEnabled(v.enable_google_login !== false);
          setFacebookLoginEnabled(v.enable_facebook_login !== false);
          setMicrosoftLoginEnabled(v.enable_microsoft_login !== false);
          setGoogleLoginUnderMaintenance(v.google_login_under_maintenance === true);
          setFacebookLoginUnderMaintenance(v.facebook_login_under_maintenance === true);
          setMicrosoftLoginUnderMaintenance(v.microsoft_login_under_maintenance === true);
        }
      }, 500);
    };

    const channel = supabase
      .channel('register_auth_settings_rt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings', filter: 'key=eq.auth_settings' },
        () => schedule(),
      )
      .subscribe();

    return () => {
      if (authSettingsRtTimerRef.current) window.clearTimeout(authSettingsRtTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!hasMinimumPhone(phone)) {
      setError('Please enter a valid phone number');
      return;
    }

    if (!isAllowedSignupEmail(email)) {
      setError(SIGNUP_EMAIL_DOMAIN_BLOCKED);
      return;
    }

    const intent = await requestSignupIntent();
    if (!intent.ok) {
      setError('error' in intent ? intent.error : 'Sign-up is not available right now.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: signUpData, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            phone: phone
          },
        },
      });

      if (error) throw error;

      const refToApply = (sessionStorage.getItem('referral_pending_code') || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      const validRef = refToApply.length >= 4 ? refToApply : '';

      if (validRef && signUpData.session) {
        try {
          await postJsonWithFallback('/api/referral/claim', { code: validRef }, { skipErrorPageRedirect: true });
          sessionStorage.removeItem('referral_pending_code');
        } catch {
          sessionStorage.setItem('referral_pending_code', validRef);
        }
      } else if (validRef) {
        sessionStorage.setItem('referral_pending_code', validRef);
      }

      navigate('/app');
    } catch (err: any) {
      setError(err.message || 'An error occurred during registration');
    } finally {
      setLoading(false);
    }
  };

  const oauthRedirect = `${window.location.origin}/`;

  const handleGoogleLogin = async () => {
    if (googleLoginUnderMaintenance) {
      toast.warning('Google sign-up is under maintenance', {
        description: 'Please try again later.',
      });
      return;
    }
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: oauthRedirect },
      });
      if (error) throw error;
    } catch (error: any) {
      setError(error.message);
    }
  };

  const handleFacebookLogin = async () => {
    if (facebookLoginUnderMaintenance) {
      toast.warning('Facebook sign-up is under maintenance', {
        description: 'Please try again later.',
      });
      return;
    }
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: { redirectTo: oauthRedirect },
      });
      if (error) throw error;
    } catch (error: any) {
      setError(error.message);
    }
  };

  const handleMicrosoftLogin = async () => {
    if (microsoftLoginUnderMaintenance) {
      toast.warning('Microsoft sign-up is under maintenance', {
        description: 'Please try again later.',
      });
      return;
    }
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          redirectTo: oauthRedirect,
          scopes: 'email profile openid',
        },
      });
      if (error) throw error;
    } catch (error: any) {
      setError(error.message);
    }
  };

  return (
    <div className={`min-h-[100dvh] lg:h-screen flex overflow-hidden relative selection:bg-primary/25 transition-colors duration-300 ${isDark ? 'bg-[#0A0A0A] text-white' : 'bg-slate-50 text-slate-950'}`}>
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className={`absolute top-0 left-1/4 w-96 h-96 rounded-full filter blur-[128px] animate-blob ${isDark ? 'bg-violet-600/18 mix-blend-screen' : 'bg-violet-500/12 mix-blend-multiply'}`} />
        <div className={`absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full filter blur-[128px] animate-blob animation-delay-2000 ${isDark ? 'bg-violet-500/14 mix-blend-screen' : 'bg-violet-400/10 mix-blend-multiply'}`} />
        <div className={`absolute top-1/2 left-1/2 w-96 h-96 rounded-full filter blur-[128px] animate-blob animation-delay-4000 ${isDark ? 'bg-violet-800/16 mix-blend-screen' : 'bg-violet-600/11 mix-blend-multiply'}`} />
        <div className={`absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] ${isDark ? 'opacity-20 mix-blend-overlay' : 'opacity-10 mix-blend-multiply'}`}></div>
      </div>

      <div className={`hidden lg:flex lg:w-1/2 h-full overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden relative items-center justify-center transition-colors duration-300 ${isDark ? 'border-r border-white/5 bg-[#050505]' : 'border-r border-slate-200 bg-white/70'}`}>
        <div className={`absolute inset-0 bg-[url('https://supabase.vibeaccessbd.com/storage/v1/object/public/product-images/products/bg.webp')] bg-cover bg-center ${isDark ? 'opacity-20 mix-blend-luminosity' : 'opacity-10 mix-blend-multiply'}`}></div>
        <div className={`absolute inset-0 ${isDark ? 'bg-gradient-to-b from-[#050505] via-transparent to-[#050505]' : 'bg-gradient-to-b from-white via-white/60 to-slate-100'}`}></div>
        <div className={`absolute inset-0 ${isDark ? 'bg-gradient-to-r from-[#0A0A0A] to-transparent' : 'bg-gradient-to-r from-slate-50 via-slate-50/85 to-transparent'}`}></div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 w-full max-w-[500px] px-6 lg:px-8 py-10 lg:py-12"
        >
          <AuthCalmSidePanel variant="register" isDark={isDark} />
        </motion.div>
      </div>

      <div className="w-full lg:w-1/2 h-[100dvh] lg:h-full overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden flex flex-col px-6 sm:px-16 lg:px-24 xl:px-32 z-10 relative">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-md w-full mx-auto my-auto py-12 lg:py-16"
        >
          <div className="mb-8 flex justify-end">
            <button
              type="button"
              onClick={toggleTheme}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${isDark ? 'border-white/10 bg-white/5 text-gray-200 hover:bg-white/10' : 'border-slate-200 bg-white/80 text-slate-700 hover:bg-white shadow-sm'}`}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {isDark ? 'Light mode' : 'Dark mode'}
            </button>
          </div>
          <div className="mb-10">
            <Link to="/" className="inline-flex items-center gap-2 group mb-10">
              <div className="relative w-10 h-10 transform transition-transform group-hover:scale-105">
                <div
                  className={`absolute -inset-2 rounded-full blur-xl opacity-70 transition-opacity group-hover:opacity-95 ${
                    isDark ? 'bg-white/6 mix-blend-overlay' : 'bg-black/5'
                  }`}
                />
                <div
                  className={`relative w-10 h-10 rounded-full shadow-lg transition-colors ${
                    isDark ? 'bg-transparent ring-0 shadow-black/50' : 'bg-black ring-1 ring-black/10 shadow-black/20 p-[1px]'
                  }`}
                >
                  <div className="w-full h-full rounded-full overflow-hidden bg-black">
                    <img
                      src="https://supabase.vibeaccessbd.com/storage/v1/object/public/product-images/products/favicon.png"
                      alt="Vibe Access logo"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>
              <span className={`text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r ${isDark ? 'from-white to-white/60' : 'from-slate-900 to-slate-500'}`}>
                Vibe<span className="font-light">Access</span>
              </span>
            </Link>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-3">
              Create Account.
            </h1>
            <p className={`text-lg font-light ${isDark ? 'text-gray-400' : 'text-slate-600'}`}>
              Start your journey today.
            </p>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0, y: -10 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -10 }}
                  className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl flex items-start text-sm"
                >
                  <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-4">
              <motion.div 
                className={`relative rounded-2xl overflow-hidden border transition-all duration-300 ${
                  focusedInput === 'name' 
                    ? 'border-primary bg-primary/5 shadow-[0_0_0_1px_rgba(139,92,246,0.15),0_0_24px_-4px_rgba(139,92,246,0.2)]' 
                    : isDark
                      ? 'border-white/10 bg-white/5 hover:bg-white/[0.07]'
                      : 'border-slate-200 bg-white/80 hover:bg-white shadow-sm'
                }`}
                animate={{ scale: focusedInput === 'name' ? 1.02 : 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className={`h-5 w-5 transition-colors duration-300 ${focusedInput === 'name' ? 'text-primary-light' : isDark ? 'text-gray-500' : 'text-slate-400'}`} />
                </div>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onFocus={() => setFocusedInput('name')}
                  onBlur={() => setFocusedInput(null)}
                  className={`block w-full pl-12 pr-4 py-4 bg-transparent focus:outline-none font-medium ${isDark ? 'text-white placeholder-gray-500' : 'text-slate-900 placeholder-slate-400'}`}
                  placeholder="Full Name"
                />
              </motion.div>

              <motion.div 
                className={`relative rounded-2xl overflow-hidden border transition-all duration-300 ${
                  focusedInput === 'email' 
                    ? 'border-primary bg-primary/5 shadow-[0_0_0_1px_rgba(139,92,246,0.15),0_0_24px_-4px_rgba(139,92,246,0.2)]' 
                    : isDark
                      ? 'border-white/10 bg-white/5 hover:bg-white/[0.07]'
                      : 'border-slate-200 bg-white/80 hover:bg-white shadow-sm'
                }`}
                animate={{ scale: focusedInput === 'email' ? 1.02 : 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className={`h-5 w-5 transition-colors duration-300 ${focusedInput === 'email' ? 'text-primary-light' : isDark ? 'text-gray-500' : 'text-slate-400'}`} />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedInput('email')}
                  onBlur={() => setFocusedInput(null)}
                  autoComplete="email"
                  className={`block w-full pl-12 pr-4 py-4 bg-transparent focus:outline-none font-medium ${isDark ? 'text-white placeholder-gray-500' : 'text-slate-900 placeholder-slate-400'}`}
                  placeholder="Email Address"
                />
              </motion.div>
              {showEmailDomainHint && (
                <p className={`text-xs leading-relaxed -mt-2 mb-1 px-1 ${isDark ? 'text-amber-300/80' : 'text-amber-700'}`}>
                  Use a well-known email (Gmail, Outlook, Yahoo, Hotmail, iCloud, etc.). Custom or company domains are not accepted.
                </p>
              )}

              <motion.div 
                className={`relative rounded-2xl overflow-hidden border transition-all duration-300 ${
                  focusedInput === 'phone' 
                    ? 'border-primary bg-primary/5 shadow-[0_0_0_1px_rgba(139,92,246,0.15),0_0_24px_-4px_rgba(139,92,246,0.2)]' 
                    : isDark
                      ? 'border-white/10 bg-white/5 hover:bg-white/[0.07]'
                      : 'border-slate-200 bg-white/80 hover:bg-white shadow-sm'
                }`}
                animate={{ scale: focusedInput === 'phone' ? 1.02 : 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Phone className={`h-5 w-5 transition-colors duration-300 ${focusedInput === 'phone' ? 'text-primary-light' : isDark ? 'text-gray-500' : 'text-slate-400'}`} />
                </div>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onFocus={() => setFocusedInput('phone')}
                  onBlur={() => setFocusedInput(null)}
                  className={`block w-full pl-12 pr-4 py-4 bg-transparent focus:outline-none font-medium ${isDark ? 'text-white placeholder-gray-500' : 'text-slate-900 placeholder-slate-400'}`}
                  placeholder="Phone Number (017...)"
                />
              </motion.div>

              <motion.div 
                className={`relative rounded-2xl overflow-hidden border transition-all duration-300 ${
                  focusedInput === 'password' 
                    ? 'border-primary bg-primary/5 shadow-[0_0_0_1px_rgba(139,92,246,0.15),0_0_24px_-4px_rgba(139,92,246,0.2)]' 
                    : isDark
                      ? 'border-white/10 bg-white/5 hover:bg-white/[0.07]'
                      : 'border-slate-200 bg-white/80 hover:bg-white shadow-sm'
                }`}
                animate={{ scale: focusedInput === 'password' ? 1.02 : 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className={`h-5 w-5 transition-colors duration-300 ${focusedInput === 'password' ? 'text-primary-light' : isDark ? 'text-gray-500' : 'text-slate-400'}`} />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedInput('password')}
                  onBlur={() => setFocusedInput(null)}
                  className={`block w-full pl-12 pr-4 py-4 bg-transparent focus:outline-none font-medium ${isDark ? 'text-white placeholder-gray-500' : 'text-slate-900 placeholder-slate-400'}`}
                  placeholder="Create Password"
                />
              </motion.div>
            </div>

            <motion.button
              whileHover={{ scale: 1.005 }}
              whileTap={{ scale: 0.995 }}
              type="submit"
              disabled={loading}
              className="mt-6 w-full flex items-center justify-center gap-2 py-4 px-4 rounded-2xl text-sm font-semibold text-white transition-[box-shadow,filter,transform] duration-200 disabled:opacity-50 disabled:pointer-events-none group bg-gradient-primary shadow-[0_1px_2px_rgba(0,0,0,0.08),0_8px_28px_-6px_rgba(124,58,237,0.38)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.35),0_10px_36px_-8px_rgba(139,92,246,0.32)] ring-1 ring-inset ring-white/15 hover:brightness-[1.04] hover:shadow-[0_1px_2px_rgba(0,0,0,0.1),0_12px_40px_-8px_rgba(124,58,237,0.45)] dark:hover:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_14px_44px_-10px_rgba(139,92,246,0.38)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0A0A0A] focus-visible:ring-offset-slate-50"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Create Account
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </motion.button>
          </form>

          {(googleLoginEnabled || facebookLoginEnabled || microsoftLoginEnabled) && (
            <div className="mt-6">
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className={`w-full border-t ${isDark ? 'border-white/10' : 'border-slate-200'}`} />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span
                    className={`px-4 py-1 rounded-full backdrop-blur-md ${
                      isDark ? 'bg-[#0A0A0A]/60 text-gray-400 ring-1 ring-white/10' : 'bg-slate-50/80 text-slate-500 ring-1 ring-slate-200'
                    }`}
                  >
                    Or continue with
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                {googleLoginEnabled && (
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleGoogleLogin}
                    className={`w-full flex items-center justify-center gap-3 py-4 px-4 rounded-2xl text-sm font-bold transition-all group ${isDark ? 'text-white bg-white/5 hover:bg-white/10 border border-white/10' : 'text-slate-800 bg-white/80 hover:bg-white border border-slate-200 shadow-sm'}`}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
                      <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        fill="#4285F4"
                      />
                      <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                      />
                      <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#EA4335"
                      />
                    </svg>
                    Sign up with Google
                  </motion.button>
                )}
                {facebookLoginEnabled && (
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleFacebookLogin}
                    className={`w-full flex items-center justify-center gap-3 py-4 px-4 rounded-2xl text-sm font-bold transition-all group ${isDark ? 'text-white bg-[#1877F2]/15 hover:bg-[#1877F2]/25 border border-[#1877F2]/30' : 'text-slate-900 bg-white/80 hover:bg-white border border-slate-200 shadow-sm'}`}
                  >
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
                      <path
                        fill="#1877F2"
                        d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
                      />
                    </svg>
                    Sign up with Facebook
                  </motion.button>
                )}
                {microsoftLoginEnabled && (
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleMicrosoftLogin}
                    className={`w-full flex items-center justify-center gap-3 py-4 px-4 rounded-2xl text-sm font-bold transition-all group ${isDark ? 'text-white bg-[#00A4EF]/10 hover:bg-[#00A4EF]/20 border border-[#00A4EF]/25' : 'text-slate-800 bg-white/80 hover:bg-white border border-slate-200 shadow-sm'}`}
                  >
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 21 21" aria-hidden>
                      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                    </svg>
                    Sign up with Microsoft
                  </motion.button>
                )}
              </div>
            </div>
          )}

          <div className="mt-8 text-center">
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
              Already have an account?{' '}
              <Link to="/login" className={`font-bold transition-colors underline underline-offset-4 ${isDark ? 'text-white hover:text-primary-light decoration-white/30 hover:decoration-primary-light/60' : 'text-slate-900 hover:text-primary decoration-slate-300 hover:decoration-primary/50'}`}>
                Sign in instead
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
