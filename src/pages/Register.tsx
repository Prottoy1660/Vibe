import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  Mail,
  Lock,
  User,
  AlertCircle,
  Loader2,
  Phone,
  ArrowRight,
  Sparkles,
  Sun,
  Moon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../contexts/ThemeContext';
import { AuthCalmSidePanel } from '../components/auth/AuthCalmSidePanel';
import { isAllowedSignupEmail, SIGNUP_EMAIL_DOMAIN_BLOCKED } from '../lib/allowedSignupEmailDomains';
import { requestSignupIntent } from '../lib/signupIntent';

export const Register = () => {
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
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from('system_settings').select('value').eq('key', 'auth_settings').single();
      if (data && data.value) {
        const v = data.value as { enable_google_login?: boolean; enable_facebook_login?: boolean; enable_microsoft_login?: boolean };
        setGoogleLoginEnabled(v.enable_google_login !== false);
        setFacebookLoginEnabled(v.enable_facebook_login !== false);
        setMicrosoftLoginEnabled(v.enable_microsoft_login !== false);
      }
    };
    fetchSettings();
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!phone || phone.length < 11) {
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
      const { error } = await supabase.auth.signUp({
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
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'An error occurred during registration');
    } finally {
      setLoading(false);
    }
  };

  const oauthRedirect = `${window.location.origin}/`;

  const handleGoogleLogin = async () => {
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
    <div className={`min-h-screen flex overflow-hidden relative selection:bg-indigo-500/30 transition-colors duration-300 ${isDark ? 'bg-[#0A0A0A] text-white' : 'bg-slate-50 text-slate-950'}`}>
      <div className="absolute inset-0 z-0">
        <div className={`absolute top-0 right-1/4 w-96 h-96 rounded-full filter blur-[128px] animate-blob ${isDark ? 'bg-purple-600/20 mix-blend-screen' : 'bg-purple-500/15 mix-blend-multiply'}`} />
        <div className={`absolute bottom-1/4 left-1/4 w-96 h-96 rounded-full filter blur-[128px] animate-blob animation-delay-2000 ${isDark ? 'bg-indigo-600/20 mix-blend-screen' : 'bg-indigo-500/15 mix-blend-multiply'}`} />
        <div className={`absolute top-1/2 right-1/2 w-96 h-96 rounded-full filter blur-[128px] animate-blob animation-delay-4000 ${isDark ? 'bg-fuchsia-600/20 mix-blend-screen' : 'bg-fuchsia-500/15 mix-blend-multiply'}`} />
        <div className={`absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] ${isDark ? 'opacity-20 mix-blend-overlay' : 'opacity-10 mix-blend-multiply'}`}></div>
      </div>

      <div className={`hidden lg:flex lg:w-1/2 relative items-center justify-center transition-colors duration-300 ${isDark ? 'border-r border-white/5 bg-[#050505]' : 'border-r border-slate-200 bg-white/70'}`}>
        <div className={`absolute inset-0 bg-[url('https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center ${isDark ? 'opacity-20 mix-blend-luminosity' : 'opacity-10 mix-blend-multiply'}`}></div>
        <div className={`absolute inset-0 ${isDark ? 'bg-gradient-to-b from-[#050505] via-transparent to-[#050505]' : 'bg-gradient-to-b from-white via-white/60 to-slate-100'}`}></div>
        <div className={`absolute inset-0 ${isDark ? 'bg-gradient-to-l from-[#0A0A0A] to-transparent' : 'bg-gradient-to-l from-slate-50 via-slate-50/85 to-transparent'}`}></div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 w-full max-w-md px-8 py-10 sm:px-12 lg:py-12"
        >
          <AuthCalmSidePanel variant="register" isDark={isDark} />
        </motion.div>
      </div>

      <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 sm:px-16 lg:px-24 xl:px-32 z-10 relative">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-md w-full mx-auto"
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
              <div className="w-10 h-10 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 transform group-hover:scale-105 transition-transform">
                <Sparkles className="w-5 h-5 text-white" />
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
                className={`relative rounded-2xl border transition-all duration-300 ${
                  focusedInput === 'name' 
                    ? 'border-indigo-500 bg-indigo-500/5 shadow-[0_0_20px_rgba(99,102,241,0.1)]' 
                    : isDark
                      ? 'border-white/10 bg-white/5 hover:bg-white/[0.07]'
                      : 'border-slate-200 bg-white/80 hover:bg-white shadow-sm'
                }`}
                animate={{ scale: focusedInput === 'name' ? 1.02 : 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className={`h-5 w-5 transition-colors duration-300 ${focusedInput === 'name' ? 'text-indigo-400' : isDark ? 'text-gray-500' : 'text-slate-400'}`} />
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
                className={`relative rounded-2xl border transition-all duration-300 ${
                  focusedInput === 'email' 
                    ? 'border-purple-500 bg-purple-500/5 shadow-[0_0_20px_rgba(168,85,247,0.1)]' 
                    : isDark
                      ? 'border-white/10 bg-white/5 hover:bg-white/[0.07]'
                      : 'border-slate-200 bg-white/80 hover:bg-white shadow-sm'
                }`}
                animate={{ scale: focusedInput === 'email' ? 1.02 : 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className={`h-5 w-5 transition-colors duration-300 ${focusedInput === 'email' ? 'text-purple-400' : isDark ? 'text-gray-500' : 'text-slate-400'}`} />
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
              <p className={`text-xs leading-relaxed -mt-2 mb-1 px-1 ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>
                Use a well-known email (Gmail, Outlook, Yahoo, Hotmail, iCloud, etc.). Custom or company domains are not accepted.
              </p>

              <motion.div 
                className={`relative rounded-2xl border transition-all duration-300 ${
                  focusedInput === 'phone' 
                    ? 'border-fuchsia-500 bg-fuchsia-500/5 shadow-[0_0_20px_rgba(217,70,239,0.1)]' 
                    : isDark
                      ? 'border-white/10 bg-white/5 hover:bg-white/[0.07]'
                      : 'border-slate-200 bg-white/80 hover:bg-white shadow-sm'
                }`}
                animate={{ scale: focusedInput === 'phone' ? 1.02 : 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Phone className={`h-5 w-5 transition-colors duration-300 ${focusedInput === 'phone' ? 'text-fuchsia-400' : isDark ? 'text-gray-500' : 'text-slate-400'}`} />
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
                className={`relative rounded-2xl border transition-all duration-300 ${
                  focusedInput === 'password' 
                    ? 'border-indigo-500 bg-indigo-500/5 shadow-[0_0_20px_rgba(99,102,241,0.1)]' 
                    : isDark
                      ? 'border-white/10 bg-white/5 hover:bg-white/[0.07]'
                      : 'border-slate-200 bg-white/80 hover:bg-white shadow-sm'
                }`}
                animate={{ scale: focusedInput === 'password' ? 1.02 : 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className={`h-5 w-5 transition-colors duration-300 ${focusedInput === 'password' ? 'text-indigo-400' : isDark ? 'text-gray-500' : 'text-slate-400'}`} />
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
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className={`w-full flex items-center justify-center gap-2 py-4 px-4 rounded-2xl text-sm font-bold text-white transition-all disabled:opacity-50 group overflow-hidden relative mt-6 ${isDark ? 'bg-white/10 hover:bg-white/20 border border-white/10' : 'bg-slate-900 hover:bg-slate-800 border border-slate-900 shadow-lg shadow-slate-900/10'}`}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <span className="relative z-10 flex items-center gap-2">
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Create Account
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </span>
            </motion.button>
          </form>

          {(googleLoginEnabled || facebookLoginEnabled || microsoftLoginEnabled) && (
            <div className="mt-6">
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className={`w-full border-t ${isDark ? 'border-white/10' : 'border-slate-200'}`} />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className={`px-4 ${isDark ? 'bg-[#0A0A0A] text-gray-500' : 'bg-slate-50 text-slate-500'}`}>Or continue with</span>
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
              <Link to="/login" className={`font-bold transition-colors underline underline-offset-4 ${isDark ? 'text-white hover:text-purple-400 decoration-white/30 hover:decoration-purple-400' : 'text-slate-900 hover:text-purple-600 decoration-slate-300 hover:decoration-purple-400'}`}>
                Sign in instead
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
