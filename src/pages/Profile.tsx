import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Loader2, Camera, Mail, Phone, User, Lock, Save, AlertCircle, CheckCircle2, Languages, Sparkles } from 'lucide-react';
import { setStoredLanguage, type AppLanguage } from '../lib/language';

export const Profile = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    avatar_url: ''
  });
  const [preferredLanguage, setPreferredLanguage] = useState<AppLanguage>('en');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();

        if (error) throw error;
        
        if (data) {
          const lang = data.preferred_language === 'bn' ? 'bn' : 'en';
          setPreferredLanguage(lang);
          setStoredLanguage(lang);
          setFormData({
            name: data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            password: '', // We don't fetch password
            avatar_url: data.avatar_url || ''
          });
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setFetching(false);
      }
    };

    fetchProfile();
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setLoading(true);
      setMessage(null);
      
      if (!e.target.files || e.target.files.length === 0) {
        return;
      }
      
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${user?.id}-${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;
      
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      
      setFormData({ ...formData, avatar_url: data.publicUrl });
      
      // Update public users table immediately for avatar
      await supabase.from('users').update({ avatar_url: data.publicUrl }).eq('id', user?.id);
      
      setMessage({ type: 'success', text: 'Profile picture updated successfully!' });
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      setMessage({ type: 'error', text: error.message || 'Error uploading image.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (!user) throw new Error('Not authenticated');

      // 1. Update Auth if email or password changed
      const authUpdates: any = {};
      if (formData.email !== user.email) authUpdates.email = formData.email;
      if (formData.password) authUpdates.password = formData.password;
      
      // Update user_metadata for name and phone
      authUpdates.data = {
        full_name: formData.name,
        phone: formData.phone
      };

      if (Object.keys(authUpdates).length > 0) {
        const { error: authError } = await supabase.auth.updateUser(authUpdates);
        if (authError) throw authError;
      }

      // 2. Update Public Users Table
      const { error: publicError } = await supabase
        .from('users')
        .update({
          name: formData.name,
          phone: formData.phone,
          email: formData.email, // Sync email to public table as well
          preferred_language: preferredLanguage,
        })
        .eq('id', user.id);

      if (publicError) throw publicError;

      // 3. Log the activity
      const changes: string[] = [];
      if (formData.name) changes.push('Name');
      if (formData.email !== user.email) changes.push('Email');
      if (formData.phone) changes.push('Phone Number');
      if (formData.password) changes.push('Password');

      if (changes.length > 0) {
        await supabase.from('user_activity_logs').insert({
          user_id: user.id,
          action_type: 'profile_update',
          changed_by: user.id,
          details: { message: `Updated ${changes.join(', ')}` }
        });
      }

      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      if (formData.email !== user.email) {
        setMessage({ type: 'success', text: 'Profile updated! Check your email for a confirmation link to verify your new email address.' });
      }
      
      setFormData(prev => ({ ...prev, password: '' })); // Clear password field
      
    } catch (error: any) {
      console.error('Error updating profile:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to update profile.' });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const inputClass =
    'pl-10 w-full rounded-xl border border-gray-200 dark:border-[#2e2e36] bg-white dark:bg-[#16161a] px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none transition-shadow';

  return (
    <div className="max-w-2xl mx-auto px-4 pb-16 pt-2">
      <div className="rounded-2xl border border-gray-200/90 dark:border-[#2a2a32] bg-white dark:bg-[#121214] shadow-sm dark:shadow-none overflow-hidden">
        {/* Calm header — no heavy gradient band */}
        <div className="relative px-6 sm:px-8 pt-8 pb-6 border-b border-gray-100 dark:border-white/5 bg-gradient-to-br from-indigo-50/90 via-white to-violet-50/50 dark:from-indigo-950/25 dark:via-[#121214] dark:to-violet-950/20">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="relative group shrink-0 mx-auto sm:mx-0">
              <div className="w-[5.25rem] h-[5.25rem] sm:w-24 sm:h-24 rounded-2xl border-2 border-white dark:border-[#2a2a32] bg-gray-50 dark:bg-[#1a1a1e] overflow-hidden shadow-md ring-2 ring-gray-100/80 dark:ring-white/5 flex items-center justify-center">
                {formData.avatar_url ? (
                  <img src={formData.avatar_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-900/40 dark:to-violet-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-300 text-2xl sm:text-3xl font-semibold">
                    {formData.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }}
                className="absolute inset-0 rounded-2xl flex items-center justify-center bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="Change photo"
              >
                <Camera className="w-6 h-6 text-white" />
              </button>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarUpload} />
            </div>

            <div className="text-center sm:text-left min-w-0 flex-1">
              <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 flex items-center justify-center sm:justify-start gap-1.5 mb-1">
                <Sparkles className="w-3.5 h-3.5" />
                Your profile
              </p>
              <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
                Personal information
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1.5 max-w-md mx-auto sm:mx-0">
                Update your photo, contact details, language, or password. Changes apply when you save.
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline sm:hidden"
              >
                Change profile photo
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 sm:px-8 py-8">
          {message && (
            <div
              className={`p-4 rounded-xl mb-6 flex items-start gap-3 ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-800 border border-green-200/80 dark:bg-green-950/35 dark:text-green-200 dark:border-green-800/50'
                  : 'bg-red-50 text-red-800 border border-red-200/80 dark:bg-red-950/35 dark:text-red-200 dark:border-red-800/50'
              }`}
            >
              {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
              <span className="text-sm font-medium leading-snug">{message.text}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-10">
            {/* Contact */}
            <section className="space-y-4">
              <div className="pb-1 border-b border-gray-100 dark:border-white/5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Contact</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Name and phone shown on your account.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="profile-name" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Full name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500 pointer-events-none" />
                    <input
                      id="profile-name"
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      autoComplete="name"
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="profile-phone" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Phone number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500 pointer-events-none" />
                    <input
                      id="profile-phone"
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      autoComplete="tel"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Account & language */}
            <section className="space-y-4">
              <div className="pb-1 border-b border-gray-100 dark:border-white/5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Account & language</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Sign-in email and how the app is shown to you.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="sm:col-span-2">
                  <label htmlFor="profile-email" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Email address
                  </label>
                  <div className="relative max-w-xl">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500 pointer-events-none" />
                    <input
                      id="profile-email"
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      autoComplete="email"
                      className={inputClass}
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed max-w-xl">
                    If you change email, we will send a confirmation link. You must verify before it fully updates.
                  </p>
                </div>
                <div>
                  <label htmlFor="profile-lang" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Preferred language
                  </label>
                  <div className="relative">
                    <Languages className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500 pointer-events-none z-10" />
                    <select
                      id="profile-lang"
                      value={preferredLanguage}
                      onChange={(e) => {
                        const lang = e.target.value === 'bn' ? 'bn' : 'en';
                        setPreferredLanguage(lang);
                        setStoredLanguage(lang);
                      }}
                      className={`${inputClass} appearance-none cursor-pointer pr-10`}
                    >
                      <option value="en">English</option>
                      <option value="bn">Bangla (বাংলা)</option>
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Security — full width so it does not look orphaned in the grid */}
            <section className="space-y-4">
              <div className="pb-1 border-b border-gray-100 dark:border-white/5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Security</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Optional — only fill this in if you want a new password.</p>
              </div>
              <div className="max-w-xl">
                <label htmlFor="profile-password" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  New password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500 pointer-events-none" />
                  <input
                    id="profile-password"
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Leave blank to keep your current password"
                    autoComplete="new-password"
                    className={inputClass}
                  />
                </div>
              </div>
            </section>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-4 pt-6 border-t border-gray-100 dark:border-[#2a2a32]">
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center sm:text-left">
                You can update just one field — leave the rest as they are.
              </p>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 shadow-sm transition-colors disabled:opacity-60 w-full sm:w-auto"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Save changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};