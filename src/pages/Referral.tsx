import React, { useEffect, useState, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Gift, Copy, Check, Loader2, ArrowRight } from 'lucide-react';

const REF_STORAGE = 'referral_pending_code';

export const Referral = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState<string | null>(null);
  const [referredBy, setReferredBy] = useState<string | null>(null);
  const [promo, setPromo] = useState(0);
  const [withdrawable, setWithdrawable] = useState(0);
  const [grantedCount, setGrantedCount] = useState(0);
  const [recent, setRecent] = useState<any[]>([]);
  const [programOn, setProgramOn] = useState(true);
  const [copied, setCopied] = useState(false);
  const [claimCode, setClaimCode] = useState('');
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [{ data: settings }, { data: rc }, { data: profile }, refRewards, asReferee] = await Promise.all([
        supabase.from('system_settings').select('value').eq('key', 'referral_program').maybeSingle(),
        supabase.from('referral_codes').select('code,is_active').eq('owner_user_id', user.id).maybeSingle(),
        supabase
          .from('users')
          .select('referred_by_code,wallet_promotional_balance,wallet_balance')
          .eq('id', user.id)
          .single(),
        supabase
          .from('referral_rewards')
          .select('id,status,reward_amount,risk_score,created_at,referee_user_id')
          .eq('referrer_user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(15),
        supabase
          .from('referral_rewards')
          .select('id,status,reward_amount,risk_score,created_at,referrer_user_id')
          .eq('referee_user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      const v = (settings?.value || {}) as { enabled?: boolean };
      setProgramOn(v.enabled !== false);
      setCode((rc as any)?.code || null);
      setReferredBy((profile as any)?.referred_by_code || null);
      setPromo(Number((profile as any)?.wallet_promotional_balance || 0));
      setWithdrawable(Number((profile as any)?.wallet_balance || 0));

      const g = (refRewards.data || []).filter((r: any) => r.status === 'granted').length;
      setGrantedCount(g);

      const merged = [
        ...(refRewards.data || []).map((r: any) => ({ ...r, role: 'referrer' as const })),
        ...(asReferee.data || []).map((r: any) => ({ ...r, role: 'referee' as const })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setRecent(merged.slice(0, 20));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const shareUrl = code ? `${window.location.origin}/register?ref=${encodeURIComponent(code)}` : '';

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const submitClaim = async () => {
    setClaimMsg(null);
    const raw = claimCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (raw.length < 4) {
      setClaimMsg('Enter a valid code.');
      return;
    }
    setClaiming(true);
    try {
      const { postJsonWithFallback } = await import('../lib/apiClient');
      const data = await postJsonWithFallback<{ success?: boolean; message?: string }>('/api/referral/claim', {
        code: raw,
      });
      if (data.success) {
        setClaimMsg('Referral code applied.');
        setClaimCode('');
        sessionStorage.removeItem(REF_STORAGE);
        await load();
      } else {
        setClaimMsg((data as any).message || 'Could not apply code.');
      }
    } catch (e: any) {
      setClaimMsg(e?.message || 'Could not apply code.');
    } finally {
      setClaiming(false);
    }
  };

  if (!user) return null;

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!programOn) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-16">
      <div>
        <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
          <Gift className="w-3.5 h-3.5" />
          Referrals
        </p>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">Invite friends, earn subscription credit</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">
          Share your code. When a friend registers with it and completes a qualifying subscription order, both of you receive bonus
          balance. Bonus credits are for subscriptions on Vibe Access only — they cannot be withdrawn or transferred to cash.
        </p>
        <p className="text-sm text-amber-800 dark:text-amber-200/90 mt-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 leading-relaxed">
          <span className="font-semibold">Not a checkout coupon:</span> your referral code is applied on this page (or at signup with the
          invite link). It cannot be pasted into the discount field on the checkout screen — that field is only for promotional
          coupons from the admin.
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          A qualifying order must meet the minimum amount set in the referral program (default ৳100) after discounts, and the friend’s
          account must have your code saved before they pay. Suspicious patterns may be held for admin review before credits appear.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] p-6 shadow-sm dark:shadow-none">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Your code</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-4">One code per account · tracked for fraud protection</p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <code className="text-xl font-mono font-bold tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-4 py-2 rounded-xl">
                {code || '—'}
              </code>
              <button
                type="button"
                onClick={copyLink}
                disabled={!shareUrl}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy invite link'}
              </button>
            </div>
            {shareUrl && <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 break-all">{shareUrl}</p>}
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Balances</h2>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-sky-200 dark:border-sky-900/40 bg-sky-50/80 dark:bg-sky-950/20 p-4">
                <p className="text-xs font-medium text-sky-800 dark:text-sky-200">Subscription credits (referral &amp; promos)</p>
                <p className="text-2xl font-bold text-sky-900 dark:text-sky-100 mt-1">৳{promo.toFixed(2)}</p>
                <p className="text-[11px] text-sky-700/80 dark:text-sky-300/80 mt-1">Used first at checkout · not withdrawable</p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-[#303038] bg-gray-50 dark:bg-white/5 p-4">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Withdrawable wallet (recharge)</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">৳{withdrawable.toFixed(2)}</p>
                <Link to="/" className="text-xs text-indigo-600 dark:text-indigo-400 mt-2 inline-flex items-center gap-1 font-medium">
                  Recharge from dashboard <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
              Successful referrals (credited): <span className="font-semibold text-gray-800 dark:text-gray-200">{grantedCount}</span>
            </p>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Apply a friend&apos;s code</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-4">One time only, before your first qualifying reward.</p>
            {referredBy ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">You joined with code: {referredBy}</p>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2 max-w-lg">
                <input
                  value={claimCode}
                  onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
                  placeholder="FRIEND CODE"
                  className="flex-1 rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-4 py-2.5 text-sm font-mono"
                />
                <button
                  type="button"
                  onClick={() => void submitClaim()}
                  disabled={claiming}
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  {claiming ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Apply'}
                </button>
              </div>
            )}
            {claimMsg && <p className="text-sm mt-2 text-gray-700 dark:text-gray-300">{claimMsg}</p>}
      </div>

      {recent.length > 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Recent activity</h2>
          <ul className="space-y-2 text-sm">
            {recent.map((r) => (
              <li
                key={`${r.id}-${r.role}`}
                className="flex justify-between gap-3 border-b border-gray-100 dark:border-[#26262d] pb-2 last:border-0"
              >
                <span className="text-gray-600 dark:text-gray-400">
                  {r.role === 'referrer' ? 'You referred someone' : 'You were referred'} ·{' '}
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {r.status === 'granted'
                      ? 'Credited'
                      : r.status === 'pending_review'
                        ? 'Under review (credits after approval)'
                        : r.status === 'blocked'
                          ? 'Blocked (fraud check)'
                          : r.status === 'rejected'
                            ? 'Rejected'
                            : r.status}
                  </span>
                  {typeof r.risk_score === 'number' && r.risk_score > 0 ? ` · risk ${r.risk_score}` : ''}
                </span>
                <span className="tabular-nums font-medium text-gray-900 dark:text-gray-100">৳{Number(r.reward_amount || 0).toFixed(0)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
