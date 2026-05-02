/** Shared types + helpers for customer & admin invoices (paid / completed orders). */

export type InvoiceProduct = {
  title: string;
  title_bn?: string | null;
  duration?: string | null;
  price?: number | string | null;
  list_price?: number | string | null;
  is_personal?: boolean | null;
};

export type InvoiceCoupon = {
  code: string;
  discount_percentage?: number | string | null;
};

export type InvoiceCustomer = {
  name: string;
  email: string;
  phone?: string | null;
};

export type InvoiceOrderShape = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at?: string | null;
  status: string;
  payment_status: string;
  payment_method?: string | null;
  total_amount: number | string;
  personal_email?: string | null;
  bkash_trx_id?: string | null;
  bkash_msisdn?: string | null;
  bkash_payment_id?: string | null;
  product?: InvoiceProduct | null;
  coupon?: InvoiceCoupon | null;
  users?: InvoiceCustomer | null;
};

export function invoiceEligible(order: { status: string; payment_status: string }): boolean {
  if (order.status === 'cancelled') return false;
  if (order.payment_status === 'paid') return true;
  const s = order.status;
  return s === 'completed' || s === 'paid' || s === 'refunded';
}

export function formatPaymentMethodLabel(method: string | null | undefined, paymentStatus: string): string {
  const m = (method || '').toLowerCase().replace(/_/g, ' ');
  const pretty =
    m === 'uddoktapay' || m === 'gateway'
      ? 'Card / wallet (gateway)'
      : m === 'bkash tokenized' || m === 'bkash_tokenized'
        ? 'bKash (tokenized)'
        : m === 'wallet+bkash tokenized' || m === 'wallet+bkash_tokenized' || m === 'wallet + bkash tokenized'
          ? 'Wallet + bKash'
          : m === 'wallet+gateway' || m === 'wallet + gateway'
            ? 'Wallet + gateway'
            : m === 'wallet'
              ? 'Wallet balance'
              : m === 'coupon'
                ? 'Coupon'
              : m === 'redeem code' || m === 'redeem_code'
                ? 'Redeem code'
                : m === 'admin renew' || m === 'admin_renew'
                  ? 'Admin renewal'
                  : m === 'pending'
                    ? 'Pending'
                    : m.trim()
                      ? m.replace(/\b\w/g, (c) => c.toUpperCase())
                      : '—';
  const ps = (paymentStatus || '').replace(/_/g, ' ');
  return `${pretty} · ${ps || '—'}`;
}

export type InvoiceLine = { description: string; detail?: string; amount: number; kind: 'item' | 'discount' | 'adjustment' };

export function buildInvoiceLines(order: InvoiceOrderShape): { lines: InvoiceLine[]; catalogPrice: number; paid: number } {
  const paid = Math.round(Number(order.total_amount || 0) * 100) / 100;
  const product = order.product;
  const catalogRaw = product?.price != null ? Number(product.price) : paid;
  const catalogPrice = Math.round(Math.max(0, catalogRaw) * 100) / 100;

  const title = (product?.title || 'Adobe subscription').trim();
  const duration = product?.duration ? String(product.duration).trim() : '';
  const desc = duration ? `${title} · ${duration}` : title;
  const detailParts: string[] = [];
  if (product?.is_personal) detailParts.push('Personal Adobe ID');
  if (order.personal_email) detailParts.push(`Adobe ID: ${order.personal_email}`);
  const detail = detailParts.length ? detailParts.join(' · ') : undefined;

  const lines: InvoiceLine[] = [];

  lines.push({
    kind: 'item',
    description: desc,
    detail,
    amount: catalogPrice,
  });

  const coupon = order.coupon;
  const pct = coupon?.discount_percentage != null ? Number(coupon.discount_percentage) : NaN;
  if (coupon?.code && Number.isFinite(pct) && pct > 0) {
    const disc = Math.round(catalogPrice * (pct / 100) * 100) / 100;
    lines.push({
      kind: 'discount',
      description: `Coupon ${coupon.code}`,
      detail: `${pct}% off list price`,
      amount: -disc,
    });
  }

  const afterCoupon = lines.reduce((s, l) => s + l.amount, 0);
  const walletOrOther = Math.round(Math.max(0, afterCoupon - paid) * 100) / 100;
  if (walletOrOther > 0.009) {
    lines.push({
      kind: 'adjustment',
      description: 'Wallet / subscription credits',
      detail: 'Applied at checkout',
      amount: -walletOrOther,
    });
  }

  return { lines, catalogPrice, paid };
}
