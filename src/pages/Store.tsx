import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Search, ShoppingBag, Loader2, Gift, CheckCircle2, AlertCircle, Sparkles, Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { getStoredLanguage, pickLocalized } from '../lib/language';
import { getApiBaseUrl } from '../lib/apiBase';
import { parseProductDescriptionBullets, productSavePercent } from '../lib/productStoreDisplay';

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
}

function formatBdt(n: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0';
  return Number.isInteger(x) ? x.toLocaleString() : x.toLocaleString(undefined, { maximumFractionDigits: 2 });
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
      alert('Could not save notification request. Try again.');
    } finally {
      setNotifyBusy(null);
    }
  };

  const filteredProducts = products.filter(product => {
    // Hide personal products from the main store
    if ((product as any).is_personal) return false;

    const matchesSearch = product.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.title_bn && product.title_bn.includes(searchQuery));

    // Simplistic category filter - in a real app this would use a category column
    const matchesCategory = category === 'adobe'
      ? product.title.toLowerCase().includes('adobe')
      : !product.title.toLowerCase().includes('adobe');

    // Currently showing all if search is used, otherwise filter by category
    return matchesSearch && (searchQuery ? true : matchesCategory || category === 'adobe');
  });

  const handleBuyNow = (productId: string) => {
    if (user) {
      (async () => {
        try {
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
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

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
        setRedeemSuccess('🎉 Code redeemed! Your access has been activated.');
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
              className="bg-white dark:bg-[#151518] rounded-2xl shadow-soft dark:shadow-none dark:ring-1 dark:ring-primary/10 hover:shadow-glow dark:hover:shadow-[0_0_24px_rgba(139,92,246,0.22)] hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col group"
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
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 line-clamp-2">
                      {pickLocalized(product.title, product.title_bn, language)}
                    </h3>
                  </div>
                  {bullets.length > 0 ? (
                    <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300 leading-snug">
                      {bullets.map((line, i) => (
                        <li key={i} className="flex gap-2 items-start">
                          <CheckCircle2 className="w-3.5 h-3.5 text-accent-green shrink-0 mt-0.5" aria-hidden />
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
                        <p className="text-2xl font-bold text-accent-green tabular-nums">
                          ৳{formatBdt(Number(product.price))}
                        </p>
                      </div>
                      {savePct != null ? (
                        <span className="inline-block mt-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-accent-green text-gray-900">
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
                      className="w-full py-3 px-4 rounded-xl font-bold text-gray-900 bg-accent-green hover:brightness-110 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary dark:focus:ring-offset-[#151518] transition-all flex items-center justify-center uppercase tracking-wide text-sm"
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
          className="w-full flex items-center justify-center gap-2 py-3.5 px-6 border-2 border-dashed border-primary/35 dark:border-primary/40 rounded-2xl text-primary dark:text-primary-light hover:bg-primary/5 dark:hover:bg-primary/10 transition-all text-sm font-semibold group"
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
              <div className="bg-white dark:bg-[#151518] rounded-2xl border border-primary/15 dark:border-primary/25 p-6 shadow-soft dark:shadow-none">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-primary/10 dark:bg-primary/15 rounded-xl">
                    <Gift className="w-5 h-5 text-primary dark:text-primary-light" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Redeem Your Gift Code</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Enter the code you received to unlock your free subscription instantly.</p>
                  </div>
                </div>

                {redeemSuccess ? (
                  <div className="flex items-center gap-3 p-4 bg-accent-green/10 dark:bg-accent-green/15 rounded-xl text-accent-green font-medium">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
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
                        className="flex-1 px-4 py-3 bg-gray-50 dark:bg-[#111113] border border-gray-200 dark:border-[#26262d] rounded-xl text-sm font-mono tracking-widest font-bold text-gray-900 dark:text-gray-100 placeholder:font-sans placeholder:tracking-normal placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
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
                      <div className="mt-3 p-4 bg-primary/5 dark:bg-primary/10 border border-primary/20 dark:border-primary/30 rounded-xl">
                        <p className="text-xs text-primary dark:text-primary-light font-semibold mb-2">Valid Code — Grants Access To:</p>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-bold text-gray-900 dark:text-gray-100">{redeemInfo.products?.title}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{redeemInfo.products?.duration} subscription • ৳{redeemInfo.products?.price} value</p>
                          </div>
                          <button
                            onClick={handleRedeemApply}
                            disabled={redeemApplying}
                            className="px-5 py-2.5 bg-accent-green hover:brightness-110 disabled:opacity-50 text-gray-900 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-sm"
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