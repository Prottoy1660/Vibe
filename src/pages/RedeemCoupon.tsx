import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Ticket, XCircle, CheckCircle2, Loader2 } from 'lucide-react';

export const RedeemCoupon = () => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleRedeem = async () => {
    if (!code.trim()) return;
    
    setLoading(true);
    setMessage(null);

    try {
      // Check if coupon exists and is active
      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', code.toUpperCase())
        .eq('is_active', true)
        .single();

      if (error || !data) {
        setMessage({ type: 'error', text: 'Invalid or expired license code' });
        return;
      }

      // Check usage limits
      if (data.usage_limit > 0 && data.used_count >= data.usage_limit) {
        setMessage({ type: 'error', text: 'This license code has already been fully used' });
        return;
      }

      // Check expiry
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setMessage({ type: 'error', text: 'This license code has expired' });
        return;
      }

      // In a real scenario, this would likely trigger a backend function to
      // assign a product to the user based on the license code.
      // For this demo, we'll just show a success message.
      setMessage({ 
        type: 'success', 
        text: `Successfully redeemed! ${data.discount_percentage}% discount will be applied to your next purchase.` 
      });
      setCode('');

    } catch (error) {
      console.error('Error redeeming code:', error);
      setMessage({ type: 'error', text: 'An error occurred while redeeming the code. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Redeem coupon</h1>

      <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] overflow-hidden">
        <div className="p-6 md:p-8">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
            License Code <span className="text-red-500">*</span>
          </label>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter license code"
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-[#303038] rounded-xl text-sm focus:ring-primary focus:border-primary outline-none transition-colors dark:bg-[#111113] dark:text-gray-100"
            />
            <button
              onClick={handleRedeem}
              disabled={loading || !code.trim()}
              className="px-6 py-3 bg-gradient-primary text-white rounded-xl font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center sm:w-auto w-full"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Redeem Code'}
            </button>
          </div>

          {message && (
            <div className={`mt-4 p-4 rounded-xl flex items-start ${
              message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}>
              {message.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5 text-green-500" />
              ) : (
                <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5 text-red-500" />
              )}
              <span className="text-sm font-medium">{message.text}</span>
            </div>
          )}

          <div className="mt-16 text-center flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
            <div className="w-16 h-16 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center mb-4 border border-gray-100 dark:border-[#26262d]">
              <XCircle className="w-8 h-8 text-gray-300" />
            </div>
            <p className="font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500">No subscriptions</p>
          </div>
        </div>
      </div>
    </div>
  );
};

import { AlertCircle } from 'lucide-react';