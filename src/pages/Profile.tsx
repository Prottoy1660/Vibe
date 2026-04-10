import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Loader2,
  Camera,
  Mail,
  Phone,
  User,
  Lock,
  Save,
  AlertCircle,
  CheckCircle2,
  Languages,
  Sparkles,
  CalendarDays,
  ShieldCheck,
  BellRing,
} from 'lucide-react';
import { setStoredLanguage, type AppLanguage } from '../lib/language';
import { hasMinimumPhone } from '../lib/phoneRequired';
import { disableWebPush, enableWebPush, getPushPermission } from '../lib/webPushClient';
import { getDefaultAvatarUrl } from '../lib/defaultAvatar';

export const Profile = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pushPerm, setPushPerm] = useState<NotificationPermission>('default');
  
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

  useEffect(() => {
    void (async () => {
      const p = await getPushPermission();
      setPushPerm(p);
    })();
  }, []);

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

      if (!hasMinimumPhone(formData.phone)) {
        setMessage({
          type: 'error',
          text: 'Phone number is required (at least 11 digits).',
        });
        setLoading(false);
        return;
      }

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

  const memberSinceLabel = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;
  const emailVerified = Boolean(user?.email_confirmed_at);
  const phoneOk = hasMinimumPhone(formData.phone);
  const languageLabel = preferredLanguage === 'bn' ? 'Bangla (বাংলা)' : 'English';
  const avatarFallbackUrl = getDefaultAvatarUrl(formData.email || user?.id, formData.name);

  const inputClass =
    'pl-10 w-full rounded-lg border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 dark:focus:border-indigo-400 outline-none transition-shadow';

  return (
    <div className="w-full pb-3 pt-0 max-lg:pb-4 md:pb-5">
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12 lg:items-stretch lg:gap-6">
        {/* Summary + avatar — lg: same row height as Account details */}
        <aside className="order-2 flex min-h-0 lg:col-span-4 lg:h-full lg:min-h-0">
          <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-[#26262d] dark:bg-[#151518] dark:shadow-none">
            <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-br from-indigo-50/90 via-white to-violet-50/40 px-4 pt-4 sm:px-5 dark:from-indigo-950/30 dark:via-[#151518] dark:to-violet-950/15">
              <div className="flex shrink-0 flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-4 sm:text-left">
                <div className="relative group shrink-0">
                  <div className="h-[4.75rem] w-[4.75rem] sm:h-20 sm:w-20 rounded-xl border-2 border-white dark:border-[#2a2a32] bg-gray-50 dark:bg-[#1a1a1f] overflow-hidden shadow-md ring-1 ring-gray-100/80 dark:ring-white/5 flex items-center justify-center">
                    {formData.avatar_url ? (
                      <img src={formData.avatar_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    ) : (
                      <img
                        src={avatarFallbackUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }}
                    className="absolute inset-0 rounded-xl flex items-center justify-center bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Change photo"
                  >
                    <Camera className="h-6 w-6 text-white" />
                  </button>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                </div>

                <div className="min-w-0 flex-1 text-center sm:text-left space-y-0.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-400 inline-flex items-center justify-center sm:justify-start gap-1">
                    <Sparkles className="h-3 w-3 shrink-0" />
                    My profile
                  </p>
                  <h1 className="text-lg font-bold leading-tight text-gray-900 dark:text-gray-100 sm:text-xl">
                    Personal information
                  </h1>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug pt-0.5">
                    {formData.name?.trim() ? formData.name : 'Add your name in the form →'}
                  </p>
                  {formData.email ? (
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400" title={formData.email}>
                      {formData.email}
                    </p>
                  ) : null}
                </div>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 w-full shrink-0 rounded-lg border border-indigo-200/90 bg-white/90 py-2 text-sm font-medium text-indigo-700 transition hover:bg-white dark:border-indigo-500/35 dark:bg-white/[0.06] dark:text-indigo-300 dark:hover:bg-white/10"
              >
                Change profile photo
              </button>

              <div className="mt-4 flex min-h-0 flex-col lg:mt-5 lg:min-h-0 lg:flex-1">
                <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-indigo-100/90 bg-white/75 p-3.5 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04] dark:shadow-none sm:p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                    At a glance
                  </p>
                  <ul className="mt-3 space-y-2.5 text-sm text-gray-800 dark:text-gray-200">
                    <li className="flex gap-2.5">
                      <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-400" aria-hidden />
                      <span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">Member since</span>
                        <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                          {memberSinceLabel ?? '—'}
                        </span>
                      </span>
                    </li>
                    <li className="flex gap-2.5">
                      <Languages className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-400" aria-hidden />
                      <span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">Language</span>
                        <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">{languageLabel}</span>
                      </span>
                    </li>
                    <li className="flex gap-2.5">
                      <Phone className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-400" aria-hidden />
                      <span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">Phone</span>
                        <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                          {phoneOk ? 'Looks good — saved with Save changes' : 'Add at least 11 digits in Account details'}
                        </span>
                      </span>
                    </li>
                    <li className="flex gap-2.5">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-400" aria-hidden />
                      <span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">Sign-in email</span>
                        <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                          {emailVerified ? 'Verified' : 'Confirm from your inbox if you recently changed it'}
                        </span>
                      </span>
                    </li>
                  </ul>

                  <div className="mt-4 flex min-h-0 flex-1 flex-col justify-end border-t border-gray-200/80 pt-3 dark:border-white/10">
                    <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-400">Quick tips</p>
                    <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-snug text-gray-500 dark:text-gray-400">
                      <li>Name, phone, email, language, and password need Save changes.</li>
                      <li>Photos save as soon as you pick a file — no extra save step.</li>
                    </ul>
                  </div>
                </div>
              </div>

              <p className="mt-3 shrink-0 border-t border-gray-200/80 pt-3 pb-4 text-[11px] leading-snug text-gray-500 dark:border-white/10 dark:text-gray-400 sm:pb-5">
                Photo saves on file pick. Everything else uses <span className="font-medium text-gray-700 dark:text-gray-300">Save changes</span>.
              </p>
            </div>
          </div>
        </aside>

        <div className="order-1 flex min-h-0 min-w-0 lg:col-span-8 lg:h-full lg:min-h-0">
          <div className="flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-[#26262d] dark:bg-[#151518] dark:shadow-none">
            <div className="hidden border-b border-gray-100 px-5 py-4 dark:border-white/5 sm:block sm:px-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Account details</h2>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                Contact, sign-in email, language, and password.
              </p>
            </div>

            <div className="px-5 py-5 sm:px-6 sm:py-6">
              <div className="mb-5 border-b border-gray-100 pb-4 dark:border-white/5 sm:hidden">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Account details</h2>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Contact, email, language, and password.</p>
              </div>
              {message && (
                <div
                  className={`mb-5 flex items-start gap-3 rounded-lg p-3.5 ${
                    message.type === 'success'
                      ? 'bg-green-50 text-green-800 border border-green-200/80 dark:bg-green-950/35 dark:text-green-200 dark:border-green-800/50'
                      : 'bg-red-50 text-red-800 border border-red-200/80 dark:bg-red-950/35 dark:text-red-200 dark:border-red-800/50'
                  }`}
                >
                  {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
                  <span className="text-sm font-medium leading-snug">{message.text}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-7">
                {/* Browser notifications */}
                <section className="space-y-3">
                  <div className="border-b border-gray-100 pb-1.5 dark:border-white/5">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Browser notifications</h3>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      Get reminders on your device even when this tab is closed. Requires permission.
                    </p>
                  </div>

                  <div className="rounded-xl border border-gray-200 dark:border-[#303038] bg-gray-50/60 dark:bg-white/[0.03] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <BellRing className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Push notifications</span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${
                          pushPerm === 'granted'
                            ? 'border-emerald-200/80 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200'
                            : pushPerm === 'denied'
                              ? 'border-red-200/80 bg-red-50 text-red-900 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200'
                              : 'border-gray-200 bg-white text-gray-700 dark:border-[#2a2a32] dark:bg-white/[0.04] dark:text-gray-200'
                        }`}>
                          {pushPerm === 'granted' ? 'Enabled' : pushPerm === 'denied' ? 'Blocked' : 'Not enabled'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        If it says <strong>Blocked</strong>, enable notifications from your browser site settings.
                      </p>
                      {pushMsg ? (
                        <p className={`mt-2 text-xs font-medium ${pushMsg.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {pushMsg.text}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={pushBusy || pushPerm === 'denied'}
                        onClick={() => {
                          void (async () => {
                            setPushBusy(true);
                            setPushMsg(null);
                            try {
                              const out = await enableWebPush();
                              const p = await getPushPermission();
                              setPushPerm(p);
                              if (!out.ok) throw new Error(out.reason || 'Enable failed');
                              setPushMsg({ type: 'success', text: 'Notifications enabled on this device.' });
                            } catch (e: any) {
                              setPushMsg({ type: 'error', text: e?.message || 'Enable failed' });
                            } finally {
                              setPushBusy(false);
                            }
                          })();
                        }}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
                      >
                        {pushBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Enable
                      </button>
                      <button
                        type="button"
                        disabled={pushBusy}
                        onClick={() => {
                          void (async () => {
                            setPushBusy(true);
                            setPushMsg(null);
                            try {
                              const out = await disableWebPush();
                              const p = await getPushPermission();
                              setPushPerm(p);
                              if (!out.ok) throw new Error(out.reason || 'Disable failed');
                              setPushMsg({ type: 'success', text: 'Notifications disabled on this device.' });
                            } catch (e: any) {
                              setPushMsg({ type: 'error', text: e?.message || 'Disable failed' });
                            } finally {
                              setPushBusy(false);
                            }
                          })();
                        }}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100/60 dark:border-[#303038] dark:text-gray-200 dark:hover:bg-white/[0.06]"
                      >
                        Disable
                      </button>
                    </div>
                  </div>
                </section>

                {/* Contact */}
                <section className="space-y-3">
              <div className="border-b border-gray-100 pb-1.5 dark:border-white/5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Contact</h3>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Name and phone shown on your account.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    Phone number <span className="text-red-500">*</span>
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
                <section className="space-y-3">
              <div className="border-b border-gray-100 pb-1.5 dark:border-white/5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Account & language</h3>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Sign-in email and how the app is shown to you.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
                <div className="xl:col-span-2">
                  <label htmlFor="profile-email" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Email address
                  </label>
                  <div className="relative w-full">
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
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                    If you change email, we will send a confirmation link. You must verify before it fully updates.
                  </p>
                </div>
                <div className="xl:col-span-1">
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

                {/* Security */}
                <section className="space-y-3">
              <div className="border-b border-gray-100 pb-1.5 dark:border-white/5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Security</h3>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Optional — only if you want a new password.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
                <div>
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
                      placeholder="Leave blank to keep current"
                      autoComplete="new-password"
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/[0.03] p-4 flex items-center">
                  <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                    Use a strong password you do not reuse elsewhere. Leave the field empty if you are only updating name, phone, or email.
                  </p>
                </div>
              </div>
                </section>

                <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 dark:border-[#26262d] sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <p className="max-w-md text-center text-xs text-gray-500 dark:text-gray-400 sm:text-left">
                    Change only what you need — other fields stay the same.
                  </p>
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400 sm:w-auto"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    Save changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};