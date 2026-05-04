import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Search, ShoppingBag, Loader2, Gift, CheckCircle2, AlertCircle, Sparkles, Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { getStoredLanguage, pickLocalized } from '../lib/language';
import { getApiBaseUrl } from '../lib/apiBase';
import { getAccessTokenForApi } from '../lib/getAccessTokenForApi';
import { parseProductDescriptionBullets, productSavePercent } from '../lib/productStoreDisplay';
import { toast } from '../lib/toast';

interface Product {
  id: string;
  title: string;
  title_bn: string;
  price: number;
  /** Optional higher “was” price for store strikethrough + Save %. Checkout charges `price`. */
  list_price?: number | null;
  duration: string;
  icons: string[];
  description: string;
  image_url?: string;
  is_personal?: boolean;
}

function formatBdt(n: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0';
  return Number.isInteger(x) ? x.toLocaleString() : x.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function shouldLogClientEvent(key: string, ttlMs: number): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const now = Date.now();
    const raw = window.localStorage.getItem(key);
    const previous = raw ? Number(raw) : 0;
    if (Number.isFinite(previous) && previous > 0 && now - previous < ttlMs) return false;
    window.localStorage.setItem(key, String(now));
    return true;
  } catch {
    return true;
  }
}

export const Store = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<'adobe' | 'envato'>('adobe');
  const navigate = useNavigate();
  const { user } = useAuth();
  const language = getStoredLanguage() || 'en';

  // Redeem code state
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemValidating, setRedeemValidating] = useState(false);
  const [redeemApplying, setRedeemApplying] = useState(false);
  const [redeemInfo, setRedeemInfo] = useState<any>(null);
  const [redeemError, setRedeemError] = useState('');
  const [redeemSuccess, setRedeemSuccess] = useState('');
  const [showRedeemPanel, setShowRedeemPanel] = useState(false);
  const [waitlistedIds, setWaitlistedIds] = useState<Set<string>>(new Set());
  const [notifyBusy, setNotifyBusy] = useState<string | null>(null);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('is_active', true);

        if (error) throw error;
        if (data) setProducts(data);
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  useEffect(() => {
    const logStoreView = async () => {
      if (!user) return;
      const oncePerDayKey = `funnel:store_view:${user.id}:${new Date().toISOString().slice(0, 10)}`;
      if (!shouldLogClientEvent(oncePerDayKey, 24 * 60 * 60 * 1000)) return;
      try {
        await supabase.from('funnel_events').insert({
          user_id: user.id,
          event_type: 'store_view',
          meta: {},
        });
      } catch { }
    };
    logStoreView();
  }, [user]);

  useEffect(() => {
    const loadWaitlist = async () => {
      if (!user) {
        setWaitlistedIds(new Set());
        return;
      }
      try {
        const { data } = await supabase.from('product_waitlist').select('product_id').eq('user_id', user.id);
        setWaitlistedIds(new Set((data || []).map((r: { product_id: string }) => r.product_id)));
      } catch {
        /* ignore */
      }
    };
    loadWaitlist();
  }, [user]);

  const handleNotifyMe = async (productId: string) => {
    if (!user) {
      navigate('/login');
      return;
    }
    setNotifyBusy(productId);
    try {
      const { error } = await supabase.from('product_waitlist').upsert(
        { user_id: user.id, product_id: productId },
        { onConflict: 'user_id,product_id' }
      );
      if (error) throw error;
      setWaitlistedIds((prev) => new Set(prev).add(productId));
      try {
        const waitlistKey = `funnel:waitlist_join:${user.id}:${productId}`;
        if (!shouldLogClientEvent(waitlistKey, 30 * 24 * 60 * 60 * 1000)) return;
        await supabase.from('funnel_events').insert({
          user_id: user.id,
          event_type: 'waitlist_join',
          meta: { product_id: productId },
        });
      } catch {
        /* optional analytics */
      }
    } catch (e) {
      console.error(e);
      toast.error('Could not save notification request. Try again.');
    } finally {
      setNotifyBusy(null);
    }
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.title_bn && product.title_bn.includes(searchQuery));

    // Simplistic category filter - in a real app this would use a category column
    const matchesCategory = category === 'adobe'
      ? product.title.toLowerCase().includes('adobe') || product.is_personal === true
      : !product.title.toLowerCase().includes('adobe') && product.is_personal !== true;

    // Currently showing all if search is used, otherwise filter by category
    return matchesSearch && (searchQuery ? true : matchesCategory || category === 'adobe');
  });

  const handleBuyNow = (productId: string) => {
    if (user) {
      (async () => {
        try {
          const checkoutKey = `funnel:checkout_start:${user.id}:${productId}`;
          if (!shouldLogClientEvent(checkoutKey, 10 * 60 * 1000)) return;
          await supabase.from('funnel_events').insert({
            user_id: user.id,
            event_type: 'checkout_start',
            meta: { product_id: productId },
          });
        } catch { }
      })();
    }
    navigate(`/checkout/${productId}`);
  };

  const handleRedeemValidate = async () => {
    const code = redeemCode.toUpperCase().trim();
    if (!code) return;
    setRedeemValidating(true);
    setRedeemError('');
    setRedeemInfo(null);
    setRedeemSuccess('');
    try {
      const API_URL = getApiBaseUrl();
      const res = await fetch(`${API_URL}/api/redeem/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.success) {
        setRedeemInfo(data.code);
      } else {
        setRedeemError(data.message || 'Invalid code');
      }
    } catch {
      setRedeemError('Could not connect to server. Try again.');
    } finally {
      setRedeemValidating(false);
    }
  };

  const handleRedeemApply = async () => {
    if (!user) { navigate('/login'); return; }
    if (!redeemInfo) return;
    setRedeemApplying(true);
    setRedeemError('');
    try {
      const token = await getAccessTokenForApi();
      if (!token) {
        setRedeemError('Session expired. Please sign in again.');
        return;
      }

      const API_URL = getApiBaseUrl();
      const res = await fetch(`${API_URL}/api/redeem/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ code: redeemCode.toUpperCase().trim(), user_id: user.id }),
      });
      const data = await res.json();
      if (data.success) {
        let successText =
          typeof data.message === 'string' && data.message.trim()
            ? data.message
            : '🎉 Code redeemed! Your access has been activated.';
        if (data.email_assigned === false && data.assignment_error) {
          successText += `\n\nDetails: ${data.assignment_error}`;
        }
        setRedeemSuccess(successText);
        setRedeemInfo(null);
        setRedeemCode('');
        setTimeout(() => navigate('/adobe-email'), 2000);
      } else {
        setRedeemError(data.message || 'Could not apply code.');
      }
    } catch {
      setRedeemError('Could not connect to server. Try again.');
    } finally {
      setRedeemApplying(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Product Store</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">Browse our collection of authentic subscriptions</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {/* Category Toggle */}
          <div className="flex p-1 bg-gray-100 dark:bg-white/10 rounded-lg">
            <button
              onClick={() => setCategory('adobe')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${category === 'adobe'
                  ? 'bg-white dark:bg-[#151518] text-primary shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:text-gray-200'
                }`}
            >
              Adobe
            </button>
            <button
              onClick={() => setCategory('envato')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${category === 'envato'
                  ? 'bg-white dark:bg-[#151518] text-primary shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:text-gray-200'
                }`}
            >
              Others
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400 dark:text-gray-500" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-200 dark:border-[#26262d] rounded-lg text-sm focus:ring-primary focus:border-primary w-full sm:w-64 outline-none transition-colors dark:bg-[#111113] dark:text-gray-100"
              placeholder="Search products..."
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredProducts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map((product, idx) => {
            const bullets = parseProductDescriptionBullets(product.description);
            const savePct = productSavePercent(product.list_price, product.price);
            return (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.1 }}
              key={product.id}
              className="bg-white dark:bg-[#151518] rounded-2xl border border-gray-100/90 dark:border-white/[0.06] shadow-soft dark:shadow-none transition-all duration-300 overflow-hidden flex flex-col group hover:-translate-y-0.5 hover:border-primary/18 dark:hover:border-white/[0.1] hover:shadow-[0_12px_40px_-14px_rgba(15,23,42,0.14)] dark:hover:shadow-[0_24px_48px_-20px_rgba(0,0,0,0.65)]"
            >
              {/* Product Banner — brand gradient from tailwind primary → secondary */}
              <div className="h-32 bg-gradient-to-r from-primary via-primary-dark to-secondary relative flex items-center justify-center overflow-hidden">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.title} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <>
                    <div className="absolute inset-0 bg-white/10 backdrop-blur-sm"></div>
                    <div className="relative z-10 flex space-x-2">
                      {product.icons?.map((icon, i) => (
                        <div key={i} className="w-10 h-10 rounded-lg bg-white dark:bg-[#151518] shadow-md flex items-center justify-center font-bold text-sm text-slate-800 transform group-hover:scale-110 transition-transform" style={{ transitionDelay: `${i * 50}ms` }}>
                          {icon.toUpperCase()}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="p-6 flex-1 flex flex-col">
                <div className="mb-4 min-h-0 flex-1">
                  <div className="flex justify-between items-start mb-2">
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 line-clamp-2">
                        {pickLocalized(product.title, product.title_bn, language)}
                      </h3>
                      {product.is_personal ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300">
                            Personal
                          </span>
                          <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-medium text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300">
                            Uses your own email
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {bullets.length > 0 ? (
                    <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300 leading-snug">
                      {bullets.map((line, i) => (
                        <li key={i} className="flex gap-2 items-start">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary dark:text-primary-light shrink-0 mt-0.5 opacity-90" aria-hidden />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{product.description}</p>
                  )}
                </div>

                <div className="mt-auto pt-2">
                  <div className="flex items-end justify-between mb-3 gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold tracking-wider">Price</p>
                      <div className="flex flex-wrap items-baseline gap-2 mt-0.5">
                        {savePct != null && product.list_price != null ? (
                          <span className="text-sm text-gray-400 dark:text-gray-500 line-through tabular-nums">
                            ৳{formatBdt(Number(product.list_price))}
                          </span>
                        ) : null}
                        <p className="text-2xl font-bold text-gray-900 dark:text-gray-50 tabular-nums tracking-tight">
                          ৳{formatBdt(Number(product.price))}
                        </p>
                      </div>
                      {savePct != null ? (
                        <span className="inline-block mt-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-primary/12 text-primary dark:bg-primary/18 dark:text-primary-light border border-primary/15 dark:border-primary/25">
                          Save {savePct}%
                        </span>
                      ) : null}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold tracking-wider">Duration</p>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{product.duration}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleBuyNow(product.id)}
                      className="w-full py-3 px-4 rounded-xl font-bold text-white bg-primary hover:bg-primary-dark shadow-[0_1px_2px_rgba(0,0,0,0.06),0_4px_14px_-2px_rgba(139,92,246,0.32)] hover:shadow-[0_1px_2px_rgba(0,0,0,0.08),0_8px_22px_-4px_rgba(139,92,246,0.38)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/55 focus:ring-offset-white dark:focus:ring-offset-[#151518] active:scale-[0.99] transition-[background-color,box-shadow,transform] flex items-center justify-center uppercase tracking-wide text-sm"
                    >
                      <ShoppingBag className="w-4 h-4 mr-2" />
                      Buy Now
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNotifyMe(product.id)}
                      disabled={notifyBusy === product.id || waitlistedIds.has(product.id)}
                      className="w-full py-2.5 px-4 border border-primary/25 dark:border-primary/35 text-primary dark:text-primary-light rounded-xl text-sm font-medium hover:bg-primary/10 dark:hover:bg-primary/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {notifyBusy === product.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Bell className="w-4 h-4" />
                      )}
                      {waitlistedIds.has(product.id) ? 'On notify list' : 'Notify me (price & updates)'}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-[#151518] rounded-xl p-12 text-center shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d]">
          <div className="mx-auto w-16 h-16 bg-gray-100 dark:bg-white/10 rounded-full flex items-center justify-center mb-4">
            <Search className="h-8 w-8 text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">No products found</h3>
          <p className="text-gray-500 dark:text-gray-400">No results for "{searchQuery}"</p>
          <button onClick={() => { setSearchQuery(''); setCategory('adobe'); }} className="mt-4 text-primary font-medium hover:underline">Clear filters</button>
        </div>
      )}

      {/* Redeem Code Section */}
      <div className="mt-4">
        <button
          onClick={() => { setShowRedeemPanel(p => !p); setRedeemError(''); setRedeemInfo(null); setRedeemSuccess(''); }}
          className="group flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/35 py-3.5 px-6 text-sm font-semibold text-primary transition-all hover:bg-primary/5 dark:border-primary/45 dark:text-primary-light dark:hover:bg-primary/10"
        >
          <Gift className="w-4 h-4 group-hover:scale-110 transition-transform" />
          Have a Redeem Code? Click here to activate your free access
          <Sparkles className="w-4 h-4" />
        </button>

        <AnimatePresence>
          {showRedeemPanel && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-soft dark:border-white/[0.07] dark:bg-[#12121a] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
                <div className="mb-4 flex items-center gap-2">
                  <div className="rounded-xl bg-primary/10 p-2 dark:bg-primary/15">
                    <Gift className="h-5 w-5 text-primary dark:text-primary-light" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Redeem Your Gift Code</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Enter the code you received to unlock your free subscription instantly.</p>
                  </div>
                </div>

                {redeemSuccess ? (
                  <div className="flex items-start gap-3 p-4 bg-accent-green/10 dark:bg-accent-green/15 rounded-xl text-accent-green font-medium whitespace-pre-line">
                    <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                    {redeemSuccess}
                  </div>
                ) : (
                  <>
                    <div className="flex gap-3">
                      <input
                        value={redeemCode}
                        onChange={e => { setRedeemCode(e.target.value.toUpperCase()); setRedeemError(''); setRedeemInfo(null); }}
                        onKeyDown={e => e.key === 'Enter' && handleRedeemValidate()}
                        placeholder="e.g. ABCD-EFGH-IJKL"
                        className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-mono text-sm font-bold tracking-widest text-gray-900 placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-gray-400 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary/40 dark:border-[#26262d] dark:bg-[#111113] dark:text-gray-100"
                      />
                      <button
                        onClick={handleRedeemValidate}
                        disabled={redeemValidating || !redeemCode}
                        className="px-5 py-3 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 disabled:opacity-50 text-gray-700 dark:text-gray-300 rounded-xl font-semibold text-sm transition-all"
                      >
                        {redeemValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Check'}
                      </button>
                    </div>

                    {redeemError && (
                      <div className="mt-3 flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-4 py-2.5 rounded-xl">
                        <AlertCircle className="w-4 h-4 shrink-0" /> {redeemError}
                      </div>
                    )}

                    {redeemInfo && (
                      <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-4 dark:border-primary/30 dark:bg-primary/10">
                        <p className="mb-2 text-xs font-semibold text-primary dark:text-primary-light">
                          Valid Code — Grants Access To:
                        </p>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-bold text-gray-900 dark:text-gray-100">{redeemInfo.products?.title}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {redeemInfo.products?.duration} subscription • ৳{redeemInfo.products?.price} value
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleRedeemApply}
                            disabled={redeemApplying}
                            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/15 bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),0_2px_10px_rgba(0,0,0,0.22)] transition-all hover:bg-primary-dark hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22),0_4px_14px_rgba(0,0,0,0.28)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-50 active:scale-[0.99] dark:focus-visible:ring-offset-[#12121a]"
                          >
                            {redeemApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
                            Redeem Now
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
