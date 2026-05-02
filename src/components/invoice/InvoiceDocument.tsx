import React from 'react';
import type { InvoiceLine } from '../../lib/invoiceModel';

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
    <div className="rounded-2xl border border-slate-200/90 bg-white p-8 shadow-[0_24px_80px_-24px_rgba(15,23,42,0.18)] sm:p-10 md:p-12 print:border-0 print:shadow-none print:rounded-none print:p-0">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-600">VibeAccess</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Invoice
          </h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
            Digital subscription services. This document confirms the amount paid for your order.
          </p>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 px-5 py-4 text-sm print:border-slate-200 print:bg-white">
          <div className="flex justify-between gap-8">
            <span className="text-slate-500">Invoice no.</span>
            <span className="font-mono font-semibold text-slate-900">{invoiceNo}</span>
          </div>
          <div className="flex justify-between gap-8">
            <span className="text-slate-500">Issued</span>
            <span className="font-medium text-slate-800">{issuedDateLabel}</span>
          </div>
          <div className="flex justify-between gap-8">
            <span className="text-slate-500">Order ID</span>
            <span className="max-w-[200px] truncate font-mono text-xs font-medium text-slate-700" title={orderId}>
              {orderId}
            </span>
          </div>
        </div>
      </div>

      {statusBanner === 'refunded' ? (
        <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 print:border-amber-300">
          This order was later refunded. Totals below reflect the original charge.
        </div>
      ) : null}

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Bill to</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{billTo.name}</p>
          <p className="mt-1 text-sm text-slate-600">{billTo.email}</p>
          {billTo.phone ? <p className="mt-1 text-sm text-slate-600">{billTo.phone}</p> : null}
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">From</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">VibeAccess</p>
          <p className="mt-1 text-sm text-slate-600">vibeaccessbd.com</p>
          <p className="mt-1 text-sm text-slate-500">Bangladesh · digital services</p>
        </div>
      </div>

      <div className="mt-10 overflow-hidden rounded-2xl border border-slate-200/90 print:border-slate-300">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-slate-900 text-[11px] font-semibold uppercase tracking-wider text-white print:bg-slate-800">
              <th className="px-4 py-3.5 sm:px-5">Description</th>
              <th className="w-36 px-4 py-3.5 text-right sm:w-40 sm:px-5">Amount (BDT)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {lines.map((line, i) => (
              <tr key={i} className="align-top">
                <td className="px-4 py-4 sm:px-5">
                  <span
                    className={
                      line.kind === 'discount' || line.kind === 'adjustment'
                        ? 'font-medium text-emerald-700'
                        : 'font-medium text-slate-900'
                    }
                  >
                    {line.description}
                  </span>
                  {line.detail ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{line.detail}</p> : null}
                </td>
                <td
                  className={`px-4 py-4 text-right font-mono tabular-nums sm:px-5 ${
                    line.amount < 0 ? 'text-emerald-700' : 'text-slate-900'
                  }`}
                >
                  {moneyBdt(line.amount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 print:bg-slate-50">
              <td className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-5">
                Total paid
              </td>
              <td className="px-4 py-4 text-right font-mono text-base font-bold tabular-nums text-slate-900 sm:px-5">
                {moneyBdt(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-10 grid gap-6 rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50/90 to-white p-6 sm:grid-cols-2 sm:p-7 print:border-slate-200">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Payment</p>
          <p className="mt-2 text-sm font-medium text-slate-800">{paymentMethodLabel}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">References</p>
          {paymentRefs.length ? (
            <ul className="mt-2 space-y-1.5 font-mono text-xs text-slate-600">
              {paymentRefs.map((r) => (
                <li key={r} className="break-all">
                  {r}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-slate-500">—</p>
          )}
        </div>
      </div>

      <p className="mt-10 text-center text-xs leading-relaxed text-slate-400">
        Thank you for choosing VibeAccess. Questions? Open <span className="font-medium text-slate-600">Support</span> in your
        account or visit vibeaccessbd.com
      </p>
    </div>
  );
}
