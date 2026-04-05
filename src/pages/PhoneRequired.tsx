import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Phone, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { hasMinimumPhone } from '../lib/phoneRequired';

/**
 * Shown after OAuth (or any login) when `public.users.phone` is missing/invalid.
 * Blocks the main app until a valid number is saved.
 */
export const PhoneRequired = () => {
  const { user, role, needsMandatoryPhone, refreshUserProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (role === null) return;
    if (!needsMandatoryPhone) {
      navigate('/', { replace: true });
    }
  }, [user, role, needsMandatoryPhone, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = phone.trim();
    if (!hasMinimumPhone(trimmed)) {
      setError('সঠিক মোবাইল নম্বর দিন (কমপক্ষে ১১ ডিজিট) / Enter a valid mobile number (at least 11 digits).');
      return;
    }
    if (!user) return;

    setSaving(true);
    try {
      const { error: uErr } = await supabase.from('users').update({ phone: trimmed }).eq('id', user.id);
      if (uErr) throw uErr;
      const { error: aErr } = await supabase.auth.updateUser({ data: { phone: trimmed } });
      if (aErr) throw aErr;
      const fresh = await refreshUserProfile();
      if (fresh && hasMinimumPhone(fresh.phone)) {
        navigate('/', { replace: true });
      } else {
        setError('নম্বর সেভ হয়নি — আবার চেষ্টা করুন। / Number not saved — try again.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'সেভ করা যায়নি / Could not save.');
    } finally {
      setSaving(false);
    }
  };

  if (!user || role === null) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50 dark:bg-[#09090b]">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500" aria-hidden />
      </div>
    );
  }

  if (!needsMandatoryPhone) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50 dark:bg-[#09090b]">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500" aria-hidden />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-10 bg-gradient-to-b from-indigo-50/90 via-white to-violet-50/40 dark:from-[#0c0c0f] dark:via-[#09090b] dark:to-[#121018]">
      <div className="w-full max-w-md rounded-2xl border border-gray-200/80 dark:border-[#2a2a32] bg-white dark:bg-[#121214] shadow-lg dark:shadow-none p-6 sm:p-8">
        <div className="flex justify-center mb-4">
          <div className="rounded-2xl bg-indigo-500/15 p-4 text-indigo-600 dark:text-indigo-400">
            <Phone className="w-10 h-10" aria-hidden />
          </div>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-center text-gray-900 dark:text-gray-100">
          মোবাইল নম্বর প্রয়োজন
        </h1>
        <p className="mt-2 text-sm text-center text-gray-600 dark:text-gray-400 leading-relaxed">
          Google, Facebook বা Microsoft দিয়ে লগইন করলে নম্বর আমাদের কাছে থাকে না। সেবা ও যোগাযোগের জন্য আপনার WhatsApp-যোগ্য
          মোবাইল নম্বরটি এখনই দিন।
        </p>
        <p className="mt-1 text-xs text-center text-gray-500 dark:text-gray-500">
          Mobile number is required to continue — orders, redeem, and reminders use this number.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="mandatory-phone" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
              মোবাইল নম্বর <span className="text-red-500">*</span>
            </label>
            <input
              id="mandatory-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="01XXXXXXXXX বা 8801XXXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1a1a1e] px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none"
              disabled={saving}
              required
            />
          </div>
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold py-3 text-sm flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            সংরক্ষণ করে চালিয়ে যান / Save & continue
          </button>
        </form>

        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-4 w-full flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 py-2"
        >
          <LogOut className="w-4 h-4" />
          লগ আউট / Sign out
        </button>
      </div>
    </div>
  );
};
