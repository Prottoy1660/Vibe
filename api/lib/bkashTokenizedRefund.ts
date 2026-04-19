import type { BkashTokenizedResolvedCredentials } from './bkashTokenizedSettings.js';

/** v2 refund path is on host origin, not under v1.2 checkout prefix. */
export function bkashV2RefundUrl(apiRoot: string): string {
  const raw = apiRoot.startsWith('http') ? apiRoot : `https://${apiRoot}`;
  const u = new URL(raw);
  return `${u.origin}/v2/tokenized-checkout/refund/payment/transaction`;
}

export async function bkashRefundTokenized(params: {
  creds: BkashTokenizedResolvedCredentials;
  idToken: string;
  paymentId: string;
  trxId: string;
  refundAmount: string;
  sku: string;
  reason: string;
}): Promise<Record<string, unknown>> {
  const url = bkashV2RefundUrl(params.creds.apiRoot);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: params.idToken,
      'X-App-Key': params.creds.appKey,
    },
    body: JSON.stringify({
      paymentId: params.paymentId,
      trxId: params.trxId,
      refundAmount: params.refundAmount,
      sku: params.sku.slice(0, 255),
      reason: params.reason.slice(0, 255),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      String(data.errorMessageEn || data.errorMessage || data.message || '') || `Refund HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (String(data.refundTransactionStatus || '') !== 'Completed') {
    const msg = String(data.errorMessageEn || data.errorMessage || 'bKash refund not completed');
    throw new Error(msg);
  }
  return data;
}
