import crypto from 'crypto';

const BINANCE_API_KEY = process.env.BINANCE_API_KEY || '';
const BINANCE_SECRET_KEY = process.env.BINANCE_SECRET_KEY || '';
const BINANCE_PAY_UID = process.env.BINANCE_PAY_UID || '1096316678';
const STABLE_COINS = new Set(['USDT', 'BUSD', 'USDC']);

export type BinancePayerInfo = {
  name?: string;
  type?: string;
  binanceId?: string;
  accountId?: string;
  email?: string;
};

export type BinancePayTx = {
  orderId?: string;
  transactionId?: string;
  amount?: string;
  currency?: string;
  uid?: number;
  orderType?: string;
  transactionTime?: number;
  payerInfo?: BinancePayerInfo;
  receiverInfo?: BinancePayerInfo;
};

export type BinanceCryptoDeposit = {
  txId?: string;
  id?: string;
  status?: number;
  amount?: string;
  coin?: string;
  network?: string;
  insertTime?: number;
};

export type PaymentMatch =
  | { channel: 'pay'; row: BinancePayTx }
  | { channel: 'crypto'; row: BinanceCryptoDeposit };

export type PaymentDetailsRecord = {
  binance_order_id: string | null;
  binance_transaction_id: string | null;
  payer_binance_id: string | null;
  payer_name: string | null;
  payer_type: string | null;
  payment_channel: 'pay' | 'crypto' | null;
  payment_currency: string | null;
  binance_transaction_time: string | null;
};

export function isBinanceConfigured(): boolean {
  return Boolean(BINANCE_API_KEY && BINANCE_SECRET_KEY);
}

function generateBinanceSignature(queryString: string) {
  return crypto.createHmac('sha256', BINANCE_SECRET_KEY).update(queryString).digest('hex');
}

async function signedBinanceGet(
  path: string,
  params: Record<string, string | number> = {},
): Promise<{ ok: boolean; data: unknown }> {
  const query = new URLSearchParams({
    timestamp: String(Date.now()),
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
  const signature = generateBinanceSignature(query.toString());
  const url = `https://api.binance.com${path}?${query.toString()}&signature=${signature}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'X-MBX-APIKEY': BINANCE_API_KEY },
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

export function buildPaymentDetailsFromMatch(match: PaymentMatch): PaymentDetailsRecord {
  if (match.channel === 'pay') {
    const row = match.row;
    const payer = row.payerInfo || {};
    return {
      binance_order_id: row.orderId ? String(row.orderId) : null,
      binance_transaction_id: row.transactionId ? String(row.transactionId) : null,
      payer_binance_id: payer.binanceId ? String(payer.binanceId) : null,
      payer_name: payer.name ? String(payer.name) : null,
      payer_type: payer.type ? String(payer.type) : null,
      payment_channel: 'pay',
      payment_currency: row.currency ? String(row.currency).toUpperCase() : null,
      binance_transaction_time: row.transactionTime
        ? new Date(row.transactionTime).toISOString()
        : null,
    };
  }

  const row = match.row;
  return {
    binance_order_id: null,
    binance_transaction_id: row.id ? String(row.id) : null,
    payer_binance_id: null,
    payer_name: null,
    payer_type: null,
    payment_channel: 'crypto',
    payment_currency: row.coin ? String(row.coin).toUpperCase() : null,
    binance_transaction_time: row.insertTime ? new Date(row.insertTime).toISOString() : null,
  };
}

function matchBinancePayTxStrict(
  rows: BinancePayTx[],
  txId: string,
  expectedAmount: number,
): BinancePayTx | null {
  const normalizedTxId = String(txId).trim();
  const minAmount = parseFloat(String(expectedAmount));

  return (
    rows.find((row) => {
      const idMatch =
        String(row.orderId) === normalizedTxId ||
        String(row.transactionId) === normalizedTxId;
      const amountOk = parseFloat(row.amount || '0') >= minAmount;
      const coinOk = STABLE_COINS.has(String(row.currency || '').toUpperCase());
      const receiverOk = String(row.uid) === BINANCE_PAY_UID;
      return idMatch && amountOk && coinOk && receiverOk;
    }) ?? null
  );
}

function matchBinancePayTxById(rows: BinancePayTx[], txId: string): BinancePayTx | null {
  const normalizedTxId = String(txId).trim();
  return (
    rows.find(
      (row) =>
        (String(row.orderId) === normalizedTxId ||
          String(row.transactionId) === normalizedTxId) &&
        String(row.uid) === BINANCE_PAY_UID,
    ) ?? null
  );
}

function matchBinanceCryptoStrict(
  deposits: BinanceCryptoDeposit[],
  txId: string,
  expectedAmount: number,
): BinanceCryptoDeposit | null {
  return (
    deposits.find(
      (d) =>
        (d.txId === txId || String(d.id) === txId) &&
        d.status === 1 &&
        parseFloat(d.amount || '0') >= parseFloat(String(expectedAmount)) &&
        STABLE_COINS.has(String(d.coin || '').toUpperCase()),
    ) ?? null
  );
}

function matchBinanceCryptoById(
  deposits: BinanceCryptoDeposit[],
  txId: string,
): BinanceCryptoDeposit | null {
  return (
    deposits.find(
      (d) => (d.txId === txId || String(d.id) === txId) && d.status === 1,
    ) ?? null
  );
}

function timeWindowParams(aroundTime?: Date): Record<string, number> {
  if (!aroundTime || Number.isNaN(aroundTime.getTime())) return {};
  return {
    startTime: aroundTime.getTime() - 2 * 24 * 60 * 60 * 1000,
    endTime: aroundTime.getTime() + 14 * 24 * 60 * 60 * 1000,
  };
}

export async function lookupBinancePayment(
  txId: string,
  opts?: {
    minAmount?: number;
    aroundTime?: Date;
    strict?: boolean;
  },
): Promise<{ match: PaymentMatch; verifiedAmount: number } | null> {
  if (!isBinanceConfigured() || !txId?.trim()) return null;

  const strict = opts?.strict ?? false;
  const timeParams = timeWindowParams(opts?.aroundTime);

  const payRes = await signedBinanceGet('/sapi/v1/pay/transactions', {
    limit: 100,
    ...timeParams,
  });

  if (payRes.ok) {
    const payRows = (payRes.data as { data?: BinancePayTx[] })?.data;
    if (Array.isArray(payRows)) {
      const payMatch = strict
        ? matchBinancePayTxStrict(payRows, txId, opts?.minAmount ?? 0)
        : matchBinancePayTxById(payRows, txId);
      if (payMatch) {
        return {
          match: { channel: 'pay', row: payMatch },
          verifiedAmount: parseFloat(payMatch.amount || '0'),
        };
      }
    }
  }

  const depRes = await signedBinanceGet('/sapi/v1/capital/deposit/hisrec', {
    limit: 100,
    ...timeParams,
  });

  if (depRes.ok && Array.isArray(depRes.data)) {
    const deposits = depRes.data as BinanceCryptoDeposit[];
    const cryptoMatch = strict
      ? matchBinanceCryptoStrict(deposits, txId, opts?.minAmount ?? 0)
      : matchBinanceCryptoById(deposits, txId);
    if (cryptoMatch) {
      return {
        match: { channel: 'crypto', row: cryptoMatch },
        verifiedAmount: parseFloat(cryptoMatch.amount || '0'),
      };
    }
  }

  // Fallback: widen search without time window for sync/backfill
  if (Object.keys(timeParams).length > 0) {
    return lookupBinancePayment(txId, {
      minAmount: opts?.minAmount,
      strict,
    });
  }

  return null;
}

export function depositNeedsBinanceSync(row: {
  tx_id?: string | null;
  payer_binance_id?: string | null;
  payment_channel?: string | null;
  binance_transaction_id?: string | null;
}): boolean {
  if (!row.tx_id) return false;
  return !row.payer_binance_id && !row.payment_channel && !row.binance_transaction_id;
}

export async function syncDepositRowFromBinance(
  row: {
    id: string;
    tx_id: string | null;
    amount: number;
    created_at?: string;
  },
  updateRow: (id: string, patch: PaymentDetailsRecord) => Promise<void>,
): Promise<{ synced: boolean; details?: PaymentDetailsRecord }> {
  if (!row.tx_id) return { synced: false };

  const lookup = await lookupBinancePayment(row.tx_id, {
    minAmount: Number(row.amount) || 0,
    aroundTime: row.created_at ? new Date(row.created_at) : undefined,
    strict: false,
  });

  if (!lookup) return { synced: false };

  const details = buildPaymentDetailsFromMatch(lookup.match);
  await updateRow(row.id, details);
  return { synced: true, details };
}

export { STABLE_COINS, BINANCE_PAY_UID };
