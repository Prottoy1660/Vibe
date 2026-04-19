import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { postJsonWithFallback } from '../lib/apiClient';

/**
 * bKash Tokenized Checkout redirects here with ?paymentID=...&status=success|failure|cancel
 * (exact query keys may vary; we accept common variants).
 */
export const BkashReturn = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'working' | 'done' | 'err'>('working');
  const [message, setMessage] = useState('Confirming with bKash…');

  useEffect(() => {
    const paymentID =
      params.get('paymentID') || params.get('paymentId') || params.get('payment_id') || '';
    const status = (params.get('status') || '').toLowerCase();

    if (!paymentID) {
      setPhase('err');
      setMessage('Missing payment reference from bKash. You can go back to checkout and try again.');
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const data = await postJsonWithFallback(
          '/api/payment/bkash-tokenized/finish',
          { payment_id: paymentID, status },
          { skipErrorPageRedirect: true },
        );
        if (cancelled) return;

        if (data.success && data.flow === 'checkout' && typeof data.redirect_path === 'string') {
          navigate(data.redirect_path, { replace: true });
          return;
        }
        if (data.success && data.flow === 'agreement') {
          setPhase('done');
          setMessage('Your bKash wallet is linked. You can return to checkout and pay with PIN only.');
          return;
        }
        if (!data.success) {
          setPhase('err');
          setMessage(data.message || 'Payment could not be completed.');
          return;
        }
        setPhase('err');
        setMessage('Unexpected response from server.');
      } catch (e: unknown) {
        if (cancelled) return;
        setPhase('err');
        setMessage(e instanceof Error ? e.message : 'Something went wrong.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, params]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121214] p-8 shadow-sm text-center">
        {phase === 'working' ? (
          <>
            <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mx-auto mb-4" />
            <p className="text-sm text-zinc-700 dark:text-zinc-200 font-medium">{message}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">Do not close this tab.</p>
          </>
        ) : phase === 'done' ? (
          <>
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-4" />
            <p className="text-sm text-zinc-800 dark:text-zinc-100 font-medium">{message}</p>
            <button
              type="button"
              onClick={() => navigate('/store', { replace: true })}
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-indigo-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-indigo-500"
            >
              Back to store
            </button>
          </>
        ) : (
          <>
            <XCircle className="w-10 h-10 text-red-500 mx-auto mb-4" />
            <p className="text-sm text-zinc-800 dark:text-zinc-100 font-medium whitespace-pre-wrap">{message}</p>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="mt-6 inline-flex items-center justify-center rounded-xl border border-zinc-300 dark:border-zinc-600 px-4 py-2.5 text-sm font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              Go back
            </button>
          </>
        )}
      </div>
    </div>
  );
};
