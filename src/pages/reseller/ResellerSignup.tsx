import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, ArrowLeft, Loader2, Hexagon, User, Phone } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { getResellerAuthRedirectUrl } from '../../lib/resellerAuth';

export const ResellerSignup = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const emailRedirectTo = getResellerAuthRedirectUrl('/reseller/login');

      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo,
          data: {
            full_name: formData.name,
            phone: formData.phone,
            role: 'reseller',
          },
        },
      });

      if (error) throw error;

      if (data.session) {
        toast.success('Account created! Welcome to Super Reseller.');
        navigate('/reseller/dashboard');
      } else {
        toast.success(
          'Check your inbox — we sent a verification link from Super Reseller (superreseller.shop).',
          { duration: 8000 },
        );
        navigate('/reseller/login?verify=sent');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to sign up');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setGoogleLoading(true);
    try {
      // Create a specific callback URL for reseller google signup
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getResellerAuthRedirectUrl('/reseller/oauth/callback'),
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) throw error;
    } catch (error: any) {
      toast.error(error.message || 'Failed to initialize Google signup');
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans selection:bg-indigo-500/30 relative overflow-hidden">
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/10 blur-[150px]" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/10 blur-[150px]" />
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
          Apply for Access
        </motion.h2>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mt-2 text-center text-sm text-gray-400"
        >
          Join our reseller network and start managing licenses
        </motion.p>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10"
      >
        <div className="bg-[#0a0a0a]/80 backdrop-blur-3xl py-8 px-4 shadow-2xl sm:rounded-3xl sm:px-10 border border-white/10">
          <form className="space-y-5" onSubmit={handleSignup}>
            <div>
              <label className="block text-sm font-semibold text-gray-300 ml-1">Full Name</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-500" />
                </div>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="block w-full pl-11 pr-4 py-3 bg-[#111111] border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-white/20 focus:border-white/20 transition-all placeholder:text-gray-600"
                  placeholder="John Doe"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-300 ml-1">Email address</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-500" />
                </div>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="block w-full pl-11 pr-4 py-3 bg-[#111111] border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-white/20 focus:border-white/20 transition-all placeholder:text-gray-600"
                  placeholder="partner@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-300 ml-1">Phone Number</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Phone className="h-5 w-5 text-gray-500" />
                </div>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="block w-full pl-11 pr-4 py-3 bg-[#111111] border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-white/20 focus:border-white/20 transition-all placeholder:text-gray-600"
                  placeholder="+880 1..."
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-300 ml-1">Password</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-500" />
                </div>
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="block w-full pl-11 pr-4 py-3 bg-[#111111] border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-white/20 focus:border-white/20 transition-all placeholder:text-gray-600"
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={loading || !formData.email || !formData.password || !formData.name}
                className="w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-xl shadow-white/5 text-sm font-bold text-black bg-white hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 active:scale-[0.98]"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Submit Application'}
              </button>
            </div>
          </form>

          <div className="mt-8">
            <Link
              to="/reseller/login"
              className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-gray-400 hover:text-white transition-all duration-300"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Login
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
