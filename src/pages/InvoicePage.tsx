import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../lib/toast';
import {
  buildInvoiceLines,
  formatPaymentMethodLabel,
  invoiceEligible,
  type InvoiceOrderShape,
} from '../lib/invoiceModel';
import { InvoiceDocument } from '../components/invoice/InvoiceDocument';

export const InvoicePage = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [order, setOrder] = useState<InvoiceOrderShape | null>(undefined);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    if (!orderId || !user) return;
    setOrder(undefined);
    setForbidden(false);
    const { data, error } = await supabase
      .from('orders')
      .select(
        `
        id,
        user_id,
        created_at,
        updated_at,
        status,
        payment_status,
        payment_method,
        total_amount,
        personal_email,
        bkash_trx_id,
        bkash_msisdn,
        bkash_payment_id,
        product:product_id ( title, title_bn, duration, price, list_price, is_personal ),
        coupon:coupon_id ( code, discount_percentage ),
        users:user_id ( name, email, phone )
      `,
      )
      .eq('id', orderId)
      .maybeSingle();

    if (error) {
      console.error(error);
      toast.error('Could not load invoice.');
      setOrder(null);
      return;
    }
    if (!data) {
      setOrder(null);
      return;
    }
    if (!isAdmin && data.user_id !== user.id) {
      setForbidden(true);
      setOrder(null);
      return;
    }
    setOrder(data as unknown as InvoiceOrderShape);
  }, [orderId, user, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const payload = useMemo(() => {
    if (!order || !invoiceEligible(order)) return null;
    const { lines, paid } = buildInvoiceLines(order);
    const u = order.users;
    const billTo = {
      name: (u?.name || 'Customer').trim(),
      email: (u?.email || '').trim() || '—',
      phone: u?.phone?.trim() || null,
    };
    const refs: string[] = [];
    if (order.bkash_trx_id) refs.push(`bKash trx: ${order.bkash_trx_id}`);
    if (order.bkash_msisdn) refs.push(`bKash wallet: ${order.bkash_msisdn}`);
    if (order.bkash_payment_id) refs.push(`bKash payment ID: ${order.bkash_payment_id}`);
    const invoiceNo = `INV-${order.id.replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    const issued = order.updated_at || order.created_at;
    const issuedDateLabel = format(new Date(issued), 'MMMM d, yyyy');
    return {
      invoiceNo,
      issuedDateLabel,
      orderId: order.id,
      billTo,
      lines,
      total: paid,
      paymentMethodLabel: formatPaymentMethodLabel(order.payment_method, order.payment_status),
      paymentRefs: refs,
      statusBanner: order.status === 'refunded' ? ('refunded' as const) : null,
    };
  }, [order]);

  const handlePrint = () => {
    window.print();
  };

  if (order === undefined) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-9 w-9 animate-spin text-indigo-500" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading invoice…</p>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-[#26262d] dark:bg-[#151518]">
        <p className="text-gray-800 dark:text-gray-100 font-medium">You do not have access to this invoice.</p>
        <Link to="/invoices" className="mt-4 inline-block text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
          Back to invoices
        </Link>
      </div>
    );
  }

  if (!order || !payload) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-[#26262d] dark:bg-[#151518]">
        <p className="text-gray-800 dark:text-gray-100 font-medium">
          {!order ? 'Invoice not found.' : 'This order is not eligible for an invoice yet (complete payment first).'}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-[#303038] dark:text-gray-200 dark:hover:bg-white/5"
          >
            Go back
          </button>
          <Link
            to="/invoices"
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            All invoices
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/invoices"
            className="inline-flex items-center whitespace-nowrap rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-[#303038] dark:text-gray-200 dark:hover:bg-white/5 sm:text-sm"
          >
            All invoices
          </Link>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 sm:text-sm"
          >
            <Printer className="h-4 w-4" />
            Download / Print PDF
          </button>
        </div>
      </div>

      <p className="no-print mb-4 text-xs text-gray-500 dark:text-gray-400">
        Use your browser’s print dialog and choose <strong className="font-medium text-gray-700 dark:text-gray-300">Save as PDF</strong> to
        download.
      </p>

      <div className="invoice-print-root rounded-2xl print:rounded-none">
        <InvoiceDocument {...payload} />
      </div>
    </div>
  );
};
