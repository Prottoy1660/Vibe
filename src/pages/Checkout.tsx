import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getLastApiDebug, postJsonWithFallback } from '../lib/apiClient';
import { getApiBaseUrl } from '../lib/apiBase';
import {
  CreditCard,
  ShieldCheck,
  Lock,
  Zap,
  Loader2,
  Ticket,
  CheckCircle2,
  ShoppingBag,
  Phone,
  Sparkles,
  Wallet,
} from 'lucide-react';

interface Product {
  id: string;
  title: string;
  title_bn: string;
  price: number;
  duration: string;
  is_personal?: boolean;
}

export const Checkout = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const personalEmail = searchParams.get('personal_email');

  const { user } = useAuth();
  const navigate = useNavigate();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [appliedCouponId, setAppliedCouponId] = useState<string | null>(null);
  const [couponError, setCouponError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [phone, setPhone] = useState('');
  const [requirePhone, setRequirePhone] = useState(false);
  /**
   * Default off. Personal Adobe request may open checkout with ?auto_renew=true (lazy init reads once).
   * No URL↔state sync effect — otherwise toggling off while the param stays "true" would flip back on.
   */
  const [isAutoRenew, setIsAutoRenew] = useState(() => {
    const v = searchParams.get('auto_renew');
    return v != null && v.toLowerCase() === 'true';
  });
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletPromotional, setWalletPromotional] = useState(0);
  const [useWallet, setUseWallet] = useState(false);
  const [walletAmount, setWalletAmount] = useState('');

  useEffect(() => {
    const fetchProductAndUser = async () => {
      if (!id) return;

      try {
        const { data, error } = await supabase.from('products').select('*').eq('id', id).single();

        if (error) throw error;
        if (data) setProduct(data);

        if (user) {
          const { data: userData } = await supabase
            .from('users')
            .select('phone, wallet_balance, wallet_promotional_balance, signup_auth_provider')
            .eq('id', user.id)
            .single();

          if (userData?.phone) {
            setPhone(userData.phone);
            setRequirePhone(false);
          } else {
            // Always require phone — including Google / Facebook OAuth users
            setRequirePhone(true);
          }
          setWalletBalance(Number(userData?.wallet_balance) || 0);
          setWalletPromotional(Number((userData as any)?.wallet_promotional_balance) || 0);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        navigate('/store');
      } finally {
        setLoading(false);
      }
    };

    fetchProductAndUser();
  }, [id, navigate, user]);

  useEffect(() => {
    if (!product?.is_personal || loading) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'personal_subscriptions')
        .maybeSingle();
      if (cancelled) return;
      const enabled = ((data?.value || {}) as { enabled?: boolean }).enabled !== false;
      if (!enabled) {
        navigate('/adobe-email', { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [product?.is_personal, product?.id, loading, navigate]);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;

    setCouponError('');
    try {
      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', couponCode.toUpperCase())
        .eq('is_active', true)
        .single();

      if (error || !data) {
        const cleaned = couponCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        let hint = 'Invalid or expired coupon';
        if (cleaned.length >= 4) {
          try {
            const base = getApiBaseUrl();
            const r = await fetch(`${base}/api/referral/check-code?code=${encodeURIComponent(cleaned)}`);
            const j = (await r.json()) as { is_referral_code?: boolean };
            if (j.is_referral_code) {
              hint =
                'That is a referral code, not a discount coupon. Go to Refer & earn, apply the code to your account, then complete a qualifying order.';
            }
          } catch {
            /* ignore */
          }
        }
        setCouponError(hint);
        setDiscount(0);
        setAppliedCouponId(null);
        return;
      }

      if (data.usage_limit > 0 && data.used_count >= data.usage_limit) {
        setCouponError('Coupon usage limit reached');
        setDiscount(0);
        setAppliedCouponId(null);
        return;
      }

      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setCouponError('Coupon has expired');
        setDiscount(0);
        setAppliedCouponId(null);
        return;
      }

      setDiscount(Number(data.discount_percentage) || 0);
      setAppliedCouponId(data.id);
      setCouponError('');
    } catch (error) {
      console.error('Error applying coupon:', error);
      setCouponError('Failed to apply coupon');
      setDiscount(0);
      setAppliedCouponId(null);
    }
  };

  const handlePayment = async () => {
    const priceNum = Number(product!.price) || 0;
    const totalAmount = Math.round(priceNum * (1 - discount / 100) * 100) / 100;
    const spendableWallet = walletBalance + walletPromotional;
    const requestedWallet = useWallet ? Number(walletAmount || 0) : 0;
    const safeWalletDeduction = Math.max(0, Math.min(requestedWallet, spendableWallet, totalAmount));
    const gatewayAmount = Math.max(0, totalAmount - safeWalletDeduction);

    if (discount > 0 && !appliedCouponId) {
      setPaymentError('Please apply your coupon again before paying.');
      return;
    }

    if (gatewayAmount > 0 && !paymentMethod) {
      setPaymentError('The payment method field is required.');
      return;
    }

    if (useWallet && safeWalletDeduction <= 0) {
      setPaymentError('Enter a valid wallet amount to use.');
      return;
    }

    if (product.is_personal && !(personalEmail && personalEmail.trim())) {
      setPaymentError(
        'Personal Adobe plans need the email you confirmed on the Adobe Email page. Go back, request access with your Adobe ID email, then checkout from that link.',
      );
      return;
    }

    if (requirePhone && (!phone || phone.length < 11)) {
      setPaymentError('A valid phone number is required to complete this order.');
      return;
    }

    setPaymentError('');
    setProcessing(true);

    let createdOrderId: string | null = null;

    try {
      if (!user || !product) throw new Error('Missing user or product information');

      if (requirePhone && phone) {
        await supabase.from('users').update({ phone }).eq('id', user.id);
        await supabase.auth.updateUser({ data: { phone } });
      }

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: user.id,
          product_id: product.id,
          coupon_id: discount > 0 && appliedCouponId ? appliedCouponId : null,
          payment_method: 'pending',
          total_amount: totalAmount,
          status: 'pending',
          payment_status: 'pending',
          auto_renew: isAutoRenew,
          personal_email: product.is_personal && personalEmail ? personalEmail.trim() : null,
        })
        .select()
        .single();

      if (orderError) throw orderError;
      createdOrderId = order.id;

      const data = await postJsonWithFallback('/api/payment/create', {
        order_id: order.id,
        amount: gatewayAmount,
        full_name: user.user_metadata?.full_name || 'Customer',
        email: user.email,
        frontend_url: window.location.origin,
        user_id: user.id,
        wallet_deduction: safeWalletDeduction,
      });

      if (data.success && data.payment_url) {
        window.location.href = data.payment_url;
      } else {
        throw new Error(data.message || data.error || 'Failed to initialize payment');
      }
    } catch (error: unknown) {
      console.error('Payment processing error:', error);
      const err = error as { message?: string };
      const debug = getLastApiDebug();
      const lastAttempt = debug?.attempts?.[0];
      const extra = lastAttempt
        ? `\n\nDebug:\n- base: ${lastAttempt.base}\n- status: ${lastAttempt.status ?? 'n/a'}\n- request_id: ${lastAttempt.request_id ?? 'n/a'}\n- message: ${lastAttempt.message ?? 'n/a'}`
        : '';
      setPaymentError((err.message || 'Failed to process payment. Please try again.') + extra);

      if (createdOrderId) {
        try {
          await supabase.from('orders').delete().eq('id', createdOrderId);
        } catch (cleanupError) {
          console.error('Failed to cleanup abandoned order:', cleanupError);
        }
      }
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!product) return null;

  const originalPrice = Number(product.price) || 0;
  const finalPrice = Math.round(originalPrice * (1 - discount / 100) * 100) / 100;
  const spendableWallet = walletBalance + walletPromotional;
  const requestedWallet = useWallet ? Number(walletAmount || 0) : 0;
  const walletDeduction = Math.max(0, Math.min(requestedWallet, spendableWallet, finalPrice));
  const dueNow = Math.max(0, finalPrice - walletDeduction);

  const detailsDone = !requirePhone || (phone && phone.length >= 11);
  const paymentReady = dueNow <= 0 || paymentMethod === 'uddoktapay';

  const btnPrimary =
    'inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed';
  const btnOutline =
    'inline-flex items-center justify-center rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900/50 px-6 py-3 text-sm font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors';

  return (
    <div className="space-y-6 pb-16 max-w-6xl mx-auto">
      <div>
        <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          Checkout
        </p>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight mt-1">Complete purchase</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 max-w-xl">
          Review the plan, apply a coupon if you have one, then pay the amount due. Personal Adobe orders use the email you entered earlier.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
        <div className="lg:col-span-3 space-y-5">
          <div className="rounded-2xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-[#121214] shadow-sm dark:shadow-none p-5 sm:p-6">
            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {product.title_bn || product.title}
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1 leading-relaxed">
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">৳{product.price}</span>
                  <span className="text-zinc-500 dark:text-zinc-500"> · </span>
                  {product.duration}
                  <span className="text-zinc-500 dark:text-zinc-500"> · </span>
                  Adobe Creative Cloud access via Vibe Access
                </p>
                {personalEmail && (
                  <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1.5 inline-block">
                    Personal order email: <span className="font-mono">{personalEmail}</span>
                  </p>
                )}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3 pt-5 border-t border-zinc-100 dark:border-zinc-800">
              {[
                { icon: ShieldCheck, label: 'Secure checkout', tone: 'text-emerald-600 dark:text-emerald-400' },
                { icon: Zap, label: 'Fast delivery', tone: 'text-sky-600 dark:text-sky-400' },
                { icon: Lock, label: 'Encrypted payment', tone: 'text-amber-700 dark:text-amber-400' },
              ].map(({ icon: Icon, label, tone }) => (
                <div
                  key={label}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400"
                >
                  <Icon className={`w-4 h-4 ${tone}`} />
                  {label}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-[#121214] shadow-sm dark:shadow-none overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-indigo-500 shrink-0" />
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Payment steps</h3>
            </div>

            <div className="grid grid-cols-2 divide-x divide-zinc-100 dark:divide-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/30">
              <div
                className={`px-4 py-3 flex items-center gap-2 ${
                  detailsDone ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {detailsDone ? (
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                ) : (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-zinc-400 text-[10px] font-bold">
                    1
                  </span>
                )}
                <span className="text-xs sm:text-sm font-medium leading-tight">
                  {requirePhone ? 'Phone for delivery' : 'Account OK'}
                </span>
              </div>
              <div
                className={`px-4 py-3 flex items-center gap-2 ${
                  paymentReady && detailsDone ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-600 dark:text-zinc-300'
                }`}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-current text-[10px] font-bold">
                  2
                </span>
                <span className="text-xs sm:text-sm font-medium leading-tight">Pay balance</span>
              </div>
            </div>

            <div className="p-5 sm:p-6 space-y-6">
              {requirePhone && (
                <div>
                  <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-2">
                    Mobile number <span className="text-red-500">*</span>
                  </label>
                  <div className="relative max-w-md">
                    <Phone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="block w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 py-2.5 pl-10 pr-3 text-sm text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none"
                      placeholder="01XXXXXXXXX"
                    />
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5">
                    Required for support and delivery communication.
                  </p>
                </div>
              )}

              {!requirePhone && user?.email && (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Signed in as <span className="font-medium text-zinc-800 dark:text-zinc-200">{user.email}</span>
                </p>
              )}

              {dueNow > 0 ? (
                <div>
                  <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-2">
                    Gateway <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod('uddoktapay');
                      setPaymentError('');
                    }}
                    className={`w-full max-w-md rounded-xl border px-4 py-4 text-left transition-all ${
                      paymentMethod === 'uddoktapay'
                        ? 'border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/30'
                        : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 bg-zinc-50/50 dark:bg-zinc-900/40'
                    }`}
                  >
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">Bkash, Nagad, Rocket</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                      Mobile wallets, card & bank (UddoktaPay gateway)
                    </p>
                  </button>
                  {paymentError && <p className="text-red-600 dark:text-red-400 text-sm mt-2 whitespace-pre-wrap">{paymentError}</p>}
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/35 px-4 py-3">
                  <p className="text-sm text-emerald-900 dark:text-emerald-100 font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    No card payment needed — wallet or coupon covers the total.
                  </p>
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button type="button" onClick={() => navigate('/store')} className={btnOutline}>
                  Back to store
                </button>
                <button
                  type="button"
                  onClick={handlePayment}
                  disabled={processing || !detailsDone || (dueNow > 0 && !paymentMethod)}
                  className={btnPrimary}
                >
                  {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                  {finalPrice === 0 ? 'Claim free' : dueNow === 0 ? 'Complete order' : `Pay ৳${dueNow.toFixed(2)}`}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-[#121214] shadow-sm dark:shadow-none overflow-hidden lg:sticky lg:top-6">
            <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Order summary</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Prices in ৳ (BDT)</p>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">Plan price</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100 tabular-nums">৳{originalPrice.toFixed(2)}</span>
              </div>

              <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-900/40 p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  <Ticket className="w-4 h-4 text-indigo-500" />
                  Coupon
                </label>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-2 leading-snug">
                  Admin discount codes only. Referral codes belong on <span className="font-medium text-zinc-600 dark:text-zinc-300">Refer &amp; earn</span>, not here.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCouponCode(v);
                      if (!v.trim()) {
                        setDiscount(0);
                        setAppliedCouponId(null);
                        setCouponError('');
                      }
                    }}
                    placeholder="Code"
                    className="flex-1 min-w-0 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500/25 outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Apply
                  </button>
                </div>
                {couponError && <p className="text-red-600 dark:text-red-400 text-xs mt-1.5">{couponError}</p>}
                {discount > 0 && !couponError && (
                  <p className="text-emerald-700 dark:text-emerald-400 text-xs mt-1.5 font-medium">Coupon applied (−{discount}%)</p>
                )}
              </div>

              {discount > 0 && (
                <div className="flex justify-between text-sm text-emerald-700 dark:text-emerald-400">
                  <span>Discount</span>
                  <span className="tabular-nums">−৳{(originalPrice * (discount / 100)).toFixed(2)}</span>
                </div>
              )}

              {spendableWallet > 0 && finalPrice > 0 && (
                <div className="rounded-xl border border-sky-200 dark:border-sky-900/50 bg-sky-50/80 dark:bg-sky-950/25 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <Wallet className="w-4 h-4 text-sky-600" />
                      Wallet · ৳{spendableWallet.toFixed(2)}
                      {walletPromotional > 0 && (
                        <span className="text-[10px] font-normal text-sky-700 dark:text-sky-300">
                          (incl. ৳{walletPromotional.toFixed(2)} subscription credits)
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const nextUse = !useWallet;
                        setUseWallet(nextUse);
                        if (nextUse) {
                          setWalletAmount(Math.min(spendableWallet, finalPrice).toFixed(2));
                        } else {
                          setWalletAmount('');
                        }
                      }}
                      className={`text-xs font-semibold rounded-lg px-2.5 py-1 ${
                        useWallet ? 'bg-sky-600 text-white' : 'border border-sky-300 dark:border-sky-700 text-sky-800 dark:text-sky-200'
                      }`}
                    >
                      {useWallet ? 'On' : 'Use'}
                    </button>
                  </div>
                  {useWallet && (
                    <div className="space-y-1.5">
                      <input
                        type="number"
                        min="0"
                        max={Math.min(spendableWallet, finalPrice)}
                        step="0.01"
                        value={walletAmount}
                        onChange={(e) => setWalletAmount(e.target.value)}
                        className="w-full rounded-lg border border-sky-200 dark:border-sky-800 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setWalletAmount(Math.min(spendableWallet, finalPrice).toFixed(2))}
                        className="text-xs font-medium text-sky-700 dark:text-sky-300"
                      >
                        Use max
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="h-px bg-zinc-200 dark:bg-zinc-800" />

              <div className="flex justify-between items-baseline">
                <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Order total</span>
                <span className="text-xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">৳{finalPrice.toFixed(2)}</span>
              </div>
              {walletDeduction > 0 && (
                <div className="flex justify-between text-sm text-sky-800 dark:text-sky-200">
                  <span>From wallet (credits used first)</span>
                  <span className="tabular-nums">−৳{walletDeduction.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline rounded-xl bg-indigo-500/10 dark:bg-indigo-950/40 px-3 py-2.5 border border-indigo-200/60 dark:border-indigo-900/50">
                <span className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">Due now</span>
                <span className="text-lg font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">৳{dueNow.toFixed(2)}</span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Taxes included where applicable.</p>

              {finalPrice > 0 && (
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/30 px-3 py-3 space-y-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-amber-500 shrink-0" aria-hidden />
                      Auto-renew from wallet
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 leading-snug">
                      When the term ends, we can try to renew using your wallet if the balance covers the price.
                    </p>
                  </div>
                  <div
                    className="flex rounded-xl border border-zinc-300 dark:border-zinc-600 overflow-hidden bg-white/60 dark:bg-zinc-950/40 p-0.5 gap-0.5"
                    role="group"
                    aria-label="Auto-renew"
                  >
                    <button
                      type="button"
                      aria-pressed={!isAutoRenew}
                      onClick={() => setIsAutoRenew(false)}
                      className={`flex-1 min-h-[2.75rem] rounded-lg text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900 ${
                        !isAutoRenew
                          ? 'bg-zinc-200 text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50'
                          : 'text-zinc-500 hover:bg-zinc-100/80 dark:text-zinc-400 dark:hover:bg-zinc-800/60'
                      }`}
                    >
                      Off
                    </button>
                    <button
                      type="button"
                      aria-pressed={isAutoRenew}
                      onClick={() => setIsAutoRenew(true)}
                      className={`flex-1 min-h-[2.75rem] rounded-lg text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900 ${
                        isAutoRenew
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-zinc-500 hover:bg-zinc-100/80 dark:text-zinc-400 dark:hover:bg-zinc-800/60'
                      }`}
                    >
                      On
                    </button>
                  </div>
                  <p
                    className={`text-[11px] leading-snug ${isAutoRenew ? 'text-indigo-700 dark:text-indigo-300' : 'text-zinc-500 dark:text-zinc-400'}`}
                  >
                    {isAutoRenew
                      ? 'Auto-renew is on — we will attempt renewal at the end of the term (if your wallet can cover it).'
                      : 'Auto-renew is off — you renew manually; nothing will be charged automatically at term end.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
