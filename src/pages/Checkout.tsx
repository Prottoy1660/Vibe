import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  CreditCard, 
  ShieldCheck, 
  Lock, 
  Zap,
  ArrowRight,
  Loader2,
  Ticket,
  CheckCircle2,
  ShoppingBag,
  Phone
} from 'lucide-react';

interface Product {
  id: string;
  title: string;
  title_bn: string;
  price: number;
  duration: string;
}

export const Checkout = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [couponError, setCouponError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [phone, setPhone] = useState('');
  const [requirePhone, setRequirePhone] = useState(false);
  const [isAutoRenew, setIsAutoRenew] = useState(false);

  useEffect(() => {
    const fetchProductAndUser = async () => {
      if (!id) return;
      
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        if (data) setProduct(data);

        // Check if user has a phone number
        if (user) {
          const { data: userData } = await supabase
            .from('users')
            .select('phone')
            .eq('id', user.id)
            .single();
            
          if (!userData?.phone) {
            setRequirePhone(true);
          } else {
            setPhone(userData.phone);
          }
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
        setCouponError('Invalid or expired coupon');
        setDiscount(0);
        return;
      }

      // Check usage limits
      if (data.usage_limit > 0 && data.used_count >= data.usage_limit) {
        setCouponError('Coupon usage limit reached');
        setDiscount(0);
        return;
      }

      // Check expiry
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setCouponError('Coupon has expired');
        setDiscount(0);
        return;
      }

      setDiscount(data.discount_percentage);
      setCouponError('');
    } catch (error) {
      console.error('Error applying coupon:', error);
      setCouponError('Failed to apply coupon');
      setDiscount(0);
    }
  };

  const handlePayment = async () => {
    const totalAmount = product!.price * (1 - discount / 100);

    if (totalAmount > 0 && !paymentMethod) {
      setPaymentError('The payment method field is required.');
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

      // Update phone number if it was required and provided during checkout
      if (requirePhone && phone) {
        await supabase.from('users').update({ phone }).eq('id', user.id);
        await supabase.auth.updateUser({ data: { phone } });
      }

      // 1. Create order with 'pending' status (or 'paid' if free)
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: user.id,
          product_id: product.id,
          payment_method: totalAmount === 0 ? 'coupon' : paymentMethod,
          total_amount: totalAmount,
          status: totalAmount === 0 ? 'paid' : 'pending',
          payment_status: totalAmount === 0 ? 'paid' : 'pending',
          auto_renew: isAutoRenew
        })
        .select()
        .single();

      if (orderError) throw orderError;
      createdOrderId = order.id;

      if (totalAmount === 0) {
        // Direct assignment logic for 100% free items using the centralized API
        try {
          const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/payment/assign-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: order.id }),
          });
          const assignData = await res.json();
          if (!res.ok || !assignData.success) {
            console.error('Failed to assign free email:', assignData.message);
          }
        } catch (err) {
          console.error('Failed to assign free email network error:', err);
        }
        
        navigate(`/adobe-email?payment=success&order_id=${order.id}`);
        return;
      }

      // 2. Call backend to get UddoktaPay checkout URL for non-zero amounts
      const API_URL = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${API_URL}/api/payment/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          order_id: order.id,
          amount: totalAmount,
          full_name: user.user_metadata?.full_name || 'Customer',
          email: user.email,
          frontend_url: window.location.origin
        })
      });

      const data = await response.json();

      if (data.success && data.payment_url) {
        // Redirect to UddoktaPay
        window.location.href = data.payment_url;
      } else {
        throw new Error(data.message || 'Failed to initialize payment');
      }
      
    } catch (error: any) {
      console.error('Payment processing error:', error);
      setPaymentError(error.message || 'Failed to process payment. Please try again.');
      
      // Cleanup the abandoned order from the database so it doesn't flood the UI
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
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!product) return null;

  const originalPrice = product.price;
  const finalPrice = originalPrice * (1 - discount / 100);

  return (
    <div className="space-y-6 pb-12 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Direct Checkout</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Product & Payment Flow */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Product Summary Card */}
          <div className="bg-white dark:bg-[#151518] rounded-xl p-6 shadow-soft dark:shadow-none">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{product.title_bn || product.title}</h2>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 flex items-center flex-wrap gap-1">
                  <span className="text-orange-500 mr-1">🔥</span> 
                  এখন ৳{product.price} টাকায় VibeAccess - এ পাওয়া যাচ্ছে Complete Package 
                  <span className="font-semibold text-gray-800 dark:text-gray-100 ml-1">Adobe Creative Cloud</span> 
                  একসাথে! <span className="font-bold ml-1">Everything in ONE Bundle!</span>
                </p>
              </div>
              <div className="bg-primary/10 p-3 rounded-xl flex-shrink-0 ml-4">
                <ShoppingBag className="w-6 h-6 text-primary" />
              </div>
            </div>

            <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-[#26262d]">
              <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">
                <ShieldCheck className="w-4 h-4 mr-1.5 text-green-500" />
                Secure Checkout
              </div>
              <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">
                <Zap className="w-4 h-4 mr-1.5 text-blue-500" />
                Instant Delivery
              </div>
              <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">
                <Lock className="w-4 h-4 mr-1.5 text-orange-500" />
                Encrypted Payment
              </div>
            </div>
          </div>

          {/* Checkout Flow Card */}
          <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none overflow-hidden">
            <div className="p-6 border-b border-gray-100 dark:border-[#26262d]">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
                <CreditCard className="w-5 h-5 mr-2 text-primary" />
                Complete Your Purchase
              </h3>
            </div>
            
            {/* Step Indicators */}
            <div className="flex border-b border-gray-100 dark:border-[#26262d]">
              <div className="flex-1 p-4 flex items-center justify-center border-r border-gray-100 dark:border-[#26262d] bg-gray-50/50 dark:bg-white/5">
                <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center mr-2">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Customer Info</span>
              </div>
              <div className="flex-1 p-4 flex items-center justify-center">
                <div className="w-6 h-6 rounded-full border-2 border-primary text-primary flex items-center justify-center mr-2 text-xs font-bold">
                  02
                </div>
                <span className="text-sm font-medium text-primary">Method</span>
              </div>
            </div>

            <div className="p-6">
              {requirePhone && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Contact Number <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Phone className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    </div>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-[#303038] rounded-xl focus:ring-primary focus:border-primary outline-none dark:bg-[#111113] dark:text-gray-100"
                      placeholder="017xxxxxxxx"
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1.5">Required for order delivery and support.</p>
                </div>
              )}

              {finalPrice > 0 ? (
                <>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
                    Select Payment Method <span className="text-red-500">*</span>
                  </label>
                  
                  <div className="grid grid-cols-1 gap-3 mb-2">
                    <button
                      onClick={() => {
                        setPaymentMethod('uddoktapay');
                        setPaymentError('');
                      }}
                      className={`p-4 border rounded-xl flex items-center justify-center h-16 transition-all ${
                        paymentMethod === 'uddoktapay' 
                          ? 'border-primary bg-primary/5 ring-1 ring-primary' 
                          : 'border-gray-200 dark:border-[#26262d] hover:border-gray-300 dark:border-[#303038] bg-white dark:bg-[#151518]'
                      }`}
                    >
                      <span className="font-semibold text-gray-700 dark:text-gray-200">UddoktaPay</span>
                    </button>
                  </div>
                  
                  {paymentError && (
                    <p className="text-red-500 text-xs mt-2">{paymentError}</p>
                  )}
                </>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                  <p className="text-green-800 font-medium flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 mr-2" />
                    100% Discount Applied. No payment required.
                  </p>
                </div>
              )}

              <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-100 dark:border-[#26262d]">
                <button 
                  onClick={() => navigate('/store')}
                  className="px-6 py-2.5 border border-gray-300 dark:border-[#303038] text-gray-700 dark:text-gray-200 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-[#1c1c21] dark:bg-white/5 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handlePayment}
                  disabled={processing}
                  className="px-8 py-2.5 bg-gradient-primary text-white rounded-xl font-medium shadow-sm hover:opacity-90 transition-opacity flex items-center disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {processing ? (
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  ) : null}
                  {finalPrice === 0 ? 'Claim Free' : 'Pay Now'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Order Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none overflow-hidden sticky top-6">
            <div className="p-6 border-b border-gray-100 dark:border-[#26262d]">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Order Summary</h3>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center text-sm text-gray-600 dark:text-gray-300">
                <span>Original Price</span>
                <span>৳{originalPrice.toFixed(2)}</span>
              </div>
              
              {discount > 0 && (
                <div className="flex justify-between items-center text-sm text-green-600">
                  <span>Discount ({discount}%)</span>
                  <span>-৳{(originalPrice * (discount / 100)).toFixed(2)}</span>
                </div>
              )}
              
              <div className="pt-4 border-t border-gray-100 dark:border-[#26262d]">
                <div className="flex justify-between items-end">
                  <span className="text-base font-bold text-gray-900 dark:text-gray-100">Total</span>
                  <div className="text-right">
                    <span className="text-3xl font-bold text-primary">৳{finalPrice.toFixed(2)}</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">Including VAT & Taxes</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Auto-Renew Option */}
            {finalPrice > 0 && (
              <div className="p-5 border-t border-gray-100 dark:border-[#26262d] bg-indigo-50/50 dark:bg-indigo-500/5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 pr-4">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1 flex items-center">
                      <Zap className="w-4 h-4 mr-1.5 text-indigo-500" />
                      Enable Auto-Renewal
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      When this subscription expires, automatically renew it by deducting from your Wallet Balance if you have sufficient funds.
                    </p>
                  </div>
                  <button 
                    onClick={() => setIsAutoRenew(!isAutoRenew)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isAutoRenew ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-[#303038]'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isAutoRenew ? 'translate-x-5' : 'translate-x-0'}`}></span>
                  </button>
                </div>
              </div>
            )}
            
            <div className="p-6 bg-gray-50/50 dark:bg-white/5 border-t border-gray-100 dark:border-[#26262d]">
              <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                <Ticket className="w-4 h-4 mr-1.5 text-primary" />
                Have a Coupon?
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  placeholder="Enter code"
                  className="flex-1 border border-gray-200 dark:border-[#26262d] rounded-lg px-3 py-2 text-sm focus:ring-primary focus:border-primary outline-none dark:bg-[#111113] dark:text-gray-100"
                />
                <button 
                  onClick={handleApplyCoupon}
                  className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors"
                >
                  Apply
                </button>
              </div>
              {couponError && (
                <p className="text-red-500 text-xs mt-2">{couponError}</p>
              )}
              {discount > 0 && (
                <p className="text-green-600 text-xs mt-2">Coupon applied successfully!</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Add CreditCard icon to imports since it wasn't there
