import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { FileText, Loader2, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { invoiceEligible } from '../lib/invoiceModel';

type Row = {
  id: string;
  created_at: string;
  status: string;
  payment_status: string;
  total_amount: number;
  product: { title: string } | null;
};

export const Invoices = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(
          `
          id,
          created_at,
          status,
          payment_status,
          total_amount,
          product:product_id ( title )
        `,
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const list = (data || []) as unknown as Row[];
      setRows(list.filter((r) => invoiceEligible(r)));
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const empty = useMemo(() => !loading && rows.length === 0, [loading, rows.length]);

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/40 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent p-6 dark:border-indigo-500/20 dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] md:p-8">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/60 bg-white/80 px-3 py-1 text-xs font-semibold text-indigo-700 dark:border-indigo-500/30 dark:bg-white/5 dark:text-indigo-300">
              <FileText className="h-3.5 w-3.5" />
              Invoices
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 md:text-3xl">Your invoices</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              Download a clean PDF for any completed purchase. Use <strong className="font-medium text-gray-800 dark:text-gray-200">Print</strong>{' '}
              → Save as PDF.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-[#26262d] dark:bg-[#151518] dark:shadow-none overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <Loader2 className="h-9 w-9 animate-spin text-indigo-500" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
          </div>
        ) : empty ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/5">
              <FileText className="h-7 w-7 text-gray-400" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">No invoices yet</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              After you complete a subscription purchase, it will appear here with a download option.
            </p>
            <Link
              to="/store"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Browse store
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-white/10">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/invoices/${r.id}`}
                  className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between hover:bg-gray-50/80 dark:hover:bg-white/[0.03] transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {r.product?.title || 'Subscription'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {format(new Date(r.created_at), 'MMM d, yyyy')} ·{' '}
                      <span className="font-mono text-indigo-600 dark:text-indigo-400">#{r.id.slice(0, 8)}</span>
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <span className="text-sm font-semibold tabular-nums text-gray-800 dark:text-gray-200">
                      ৳{Number(r.total_amount).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                      View invoice
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
