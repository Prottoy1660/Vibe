import React from 'react';
import type { InvoiceLine } from '../../lib/invoiceModel';

const BRAND_LOGO_URL =
  'https://exavfdgevoflictkdfak.supabase.co/storage/v1/object/public/product-images/products/favicon.png';

export type InvoiceDocumentProps = {
  invoiceNo: string;
  issuedDateLabel: string;
  orderId: string;
  billTo: { name: string; email: string; phone?: string | null };
  lines: InvoiceLine[];
  total: number;
  paymentMethodLabel: string;
  paymentRefs: string[];
  statusBanner?: 'refunded' | null;
};

function moneyBdt(n: number) {
  const v = Math.round(n * 100) / 100;
  return `৳${v.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function InvoiceDocument({
  invoiceNo,
  issuedDateLabel,
  orderId,
  billTo,
  lines,
  total,
  paymentMethodLabel,
  paymentRefs,
  statusBanner,
}: InvoiceDocumentProps) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-8 text-slate-900 shadow-[0_24px_80px_-24px_rgba(15,23,42,0.18)] dark:border-slate-700/70 dark:bg-slate-900 dark:text-slate-100 dark:shadow-[0_24px_80px_-24px_rgba(2,6,23,0.7)] sm:p-10 md:p-12 print:rounded-none print:border-0 print:bg-white print:text-slate-900 print:shadow-none print:p-0">
      <div className="flex flex-col gap-8 border-b border-slate-200/80 pb-8 dark:border-slate-700/80 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-3">
            <img
              src={BRAND_LOGO_URL}
              alt="VibeAccess logo"
              className="h-10 w-10 rounded-xl border border-slate-200/90 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-800"
            />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-600 dark:text-indigo-400">VibeAccess</p>
              <p className="text-xs text-slate-500 dark:text-slate-300">Official payment invoice</p>
            </div>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
            Invoice
          </h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-300">
            Digital subscription services. This document confirms the amount paid for your order.
          </p>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 px-5 py-4 text-sm dark:border-slate-700 dark:bg-slate-800/70 print:border-slate-200 print:bg-white">
          <div className="flex justify-between gap-8">
            <span className="whitespace-nowrap text-slate-500 dark:text-slate-300">Invoice no.</span>
            <span className="whitespace-nowrap font-mono font-semibold text-slate-900 dark:text-slate-100">{invoiceNo}</span>
          </div>
          <div className="flex justify-between gap-8">
            <span className="whitespace-nowrap text-slate-500 dark:text-slate-300">Issued</span>
            <span className="whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">{issuedDateLabel}</span>
          </div>
          <div className="flex justify-between gap-8">
            <span className="whitespace-nowrap text-slate-500 dark:text-slate-300">Order ID</span>
            <span className="max-w-[200px] truncate font-mono text-xs font-medium text-slate-700 dark:text-slate-300" title={orderId}>
              {orderId}
            </span>
          </div>
        </div>
      </div>

      {statusBanner === 'refunded' ? (
        <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:border-amber-700/70 dark:bg-amber-900/30 dark:text-amber-100 print:border-amber-300">
          This order was later refunded. Totals below reflect the original charge.
        </div>
      ) : null}

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-800/40">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">Bill to</p>
          <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{billTo.name}</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{billTo.email}</p>
          {billTo.phone ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{billTo.phone}</p> : null}
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-800/40">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">From</p>
          <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">VibeAccess</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">vibeaccessbd.com</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Bangladesh · digital services</p>
        </div>
      </div>

      <div className="mt-10 overflow-x-auto rounded-2xl border border-slate-200/90 dark:border-slate-700/70 print:border-slate-300">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-slate-900 text-[11px] font-semibold uppercase tracking-wider text-white dark:bg-slate-950 print:bg-slate-800">
              <th className="px-4 py-3.5 sm:px-5">Description</th>
              <th className="w-36 px-4 py-3.5 text-right sm:w-40 sm:px-5">Amount (BDT)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-900 print:bg-white">
            {lines.map((line, i) => (
              <tr key={i} className="align-top">
                <td className="px-4 py-4 sm:px-5">
                  <span
                    className={
                      line.kind === 'discount' || line.kind === 'adjustment'
                        ? 'font-medium text-emerald-700 dark:text-emerald-400'
                        : 'font-medium text-slate-900 dark:text-slate-100'
                    }
                  >
                    {line.description}
                  </span>
                  {line.detail ? <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{line.detail}</p> : null}
                </td>
                <td
                  className={`px-4 py-4 text-right font-mono tabular-nums sm:px-5 ${
                    line.amount < 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {moneyBdt(line.amount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 dark:bg-slate-800/80 print:bg-slate-50">
              <td className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300 sm:px-5">
                Total paid
              </td>
              <td className="px-4 py-4 text-right font-mono text-base font-bold tabular-nums text-slate-900 dark:text-slate-100 sm:px-5">
                {moneyBdt(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-10 grid gap-6 rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50/90 to-white p-6 dark:border-slate-700 dark:from-slate-800 dark:to-slate-900 sm:grid-cols-2 sm:p-7 print:border-slate-200 print:from-slate-50/90 print:to-white">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">Payment</p>
          <p className="mt-2 whitespace-nowrap text-sm font-medium text-slate-800 dark:text-slate-200">{paymentMethodLabel}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">References</p>
          {paymentRefs.length ? (
            <ul className="mt-2 space-y-1.5 font-mono text-xs text-slate-600 dark:text-slate-300">
              {paymentRefs.map((r) => (
                <li key={r} className="truncate whitespace-nowrap" title={r}>
                  {r}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">—</p>
          )}
        </div>
      </div>

      <p className="mt-10 text-center text-xs leading-relaxed text-slate-400 dark:text-slate-400">
        Thank you for choosing VibeAccess. Questions? Open <span className="font-medium text-slate-600 dark:text-slate-200">Support</span> in your
        account or visit vibeaccessbd.com
      </p>
    </div>
  );
}
