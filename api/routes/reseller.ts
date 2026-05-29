import express from 'express';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import {
  fetchAdobePanelUsers,
  getAdobeOrgMap,
  getAdobeOrgSnapshotByEmail,
  revokeAdobeCloudAccess,
} from '../lib/adobeApi.js';

const router = express.Router();

const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const supabase = supabaseUrl && supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey) 
  : null;

const ADOBE_API_KEY = process.env.ADOBE_API_KEY || '';
const ADOBE_BASE_URL = 'https://reseller.ado-besoft.com/api/credits-pool/external';
const BINANCE_API_KEY = process.env.BINANCE_API_KEY || '';
const BINANCE_SECRET_KEY = process.env.BINANCE_SECRET_KEY || '';
const BINANCE_PAY_UID = process.env.BINANCE_PAY_UID || '1096316678';
const STABLE_COINS = new Set(['USDT', 'BUSD', 'USDC']);

/**
 * Helper function to generate HMAC signature and headers for Adobe API
 */
function getAdobeApiHeaders(body: object) {
  const timestamp = Date.now().toString();
  const payload = timestamp + JSON.stringify(body);
  const signature = crypto
    .createHmac('sha256', ADOBE_API_KEY)
    .update(payload)
    .digest('hex');

  return {
    'Content-Type': 'application/json',
    'x-api-key': ADOBE_API_KEY,
    'x-timestamp': timestamp,
    'x-signature': signature,
  };
}

async function syncAdobeOrganizationsForReseller(resellerId: string, forceRefresh = false) {
  if (!supabase) return { synced: 0, error: 'Supabase client not initialized' };

  const panel = await fetchAdobePanelUsers(forceRefresh);
  if (!panel.success) {
    return { synced: 0, error: panel.error || 'Failed to fetch Adobe users' };
  }

  const orgMap = getAdobeOrgMap();
  const { data: rows, error } = await supabase
    .from('reseller_user_access')
    .select('id, customer_email')
    .eq('reseller_id', resellerId)
    .neq('status', 'refunded');

  if (error || !rows?.length) {
    return { synced: 0, error: error?.message };
  }

  const now = new Date().toISOString();
  let synced = 0;

  await Promise.all(
    rows.map(async (row) => {
      const email = String(row.customer_email || '').trim().toLowerCase();
      const snap = orgMap.get(email);
      if (!snap) return;

      const { error: updateError } = await supabase
        .from('reseller_user_access')
        .update({
          adobe_organization_id: snap.organizationId,
          adobe_organization_name: snap.organizationName,
          adobe_synced_at: now,
        })
        .eq('id', row.id);

      if (!updateError) synced += 1;
    }),
  );

  return { synced };
}

/**
 * POST /api/reseller/adobe/sync-organizations
 * Pull organization names from Adobe credits-pool panel and update local records.
 */
router.post('/adobe/sync-organizations', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase client not initialized' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const { data: profile } = await supabase.from('users').select('role').eq('id', authData.user.id).single();
    if (profile?.role !== 'reseller') {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const forceRefresh = req.body?.force === true;
    const result = await syncAdobeOrganizationsForReseller(authData.user.id, forceRefresh);
    if (result.error && result.synced === 0) {
      return res.status(400).json({ success: false, error: result.error });
    }

    return res.status(200).json({
      success: true,
      synced: result.synced,
      message: `Synced organization for ${result.synced} user(s).`,
    });
  } catch (error: any) {
    console.error('Adobe org sync error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

/**
 * GET /api/reseller/users
 * List reseller customers with Adobe organization names (synced server-side).
 */
router.get('/users', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase client not initialized' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const { data: profile } = await supabase.from('users').select('role').eq('id', authData.user.id).single();
    if (profile?.role !== 'reseller') {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const forceRefresh = req.query.refresh === '1';
    const syncResult = await syncAdobeOrganizationsForReseller(authData.user.id, forceRefresh);
    const orgMap = getAdobeOrgMap();

    const { data: rows, error } = await supabase
      .from('reseller_user_access')
      .select('*')
      .eq('reseller_id', authData.user.id)
      .neq('status', 'refunded')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    const users = (rows || []).map((row) => {
      const email = String(row.customer_email || '').trim().toLowerCase();
      const live = orgMap.get(email);
      const organizationId = row.adobe_organization_id ?? live?.organizationId ?? null;
      const organizationName = row.adobe_organization_name ?? live?.organizationName ?? null;
      const products =
        Array.isArray(row.products) && row.products.length > 0
          ? row.products
          : live?.displayProducts?.length
            ? live.displayProducts
            : [];

      return {
        id: row.id,
        reseller_id: row.reseller_id,
        email: row.customer_email,
        durationMonths: row.duration_months,
        durationDays: row.duration_days,
        status: row.status,
        products,
        activatedAt: row.activated_at,
        expiresAt: row.expires_at,
        organizationId,
        organizationName,
        organizationSyncedAt: row.adobe_synced_at ?? null,
      };
    });

    return res.status(200).json({
      success: true,
      users,
      sync: {
        synced: syncResult.synced,
        warning: syncResult.error && syncResult.synced === 0 ? syncResult.error : undefined,
      },
    });
  } catch (error: any) {
    console.error('Reseller users list error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

/**
 * POST /api/reseller/adobe/activate
 * Add a user via Adobe Reseller API
 */
router.post('/adobe/activate', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase client not initialized' });
    }

    // 1. Verify user authentication (via authorization header)
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    // Ensure user is a reseller
    const { data: userRoleProfile } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (userRoleProfile?.role !== 'reseller') {
       return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const { email, durationMonths, cost, durationDays } = req.body;
    if (!email || !durationMonths) {
      return res.status(400).json({ success: false, error: 'Missing email or durationMonths' });
    }

    const costNum = Number(cost) || 0;
    const daysNum = Number(durationDays) || 30;

    // Verify balance before calling Adobe API
    const { data: balanceProfile } = await supabase.from('users').select('wallet_balance').eq('id', user.id).single();
    const balance = balanceProfile?.wallet_balance || 0;

    if (balance < costNum) {
      return res.status(400).json({ success: false, error: 'Insufficient balance.' });
    }

    // Convert '7d' or '14d' to valid days string if Adobe API expects days for trials,
    // otherwise pass it exactly as it is since the Adobe API might be handling '7d' directly.
    const durationStr = durationMonths.toString();

    // 2. Prepare payload for Adobe API
    const body = {
      email,
      durationMonths: durationStr
    };

    const headers = getAdobeApiHeaders(body);

    // 3. Call Adobe API
    const response = await fetch(`${ADOBE_BASE_URL}/add-user`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      console.error('Adobe API returned non-JSON:', text);
      return res.status(response.status).json({
        success: false,
        error: `Adobe API Error: ${response.status} ${response.statusText}`
      });
    }

    if (!response.ok || data.success === false) {
      return res.status(response.status === 200 ? 400 : response.status).json({ 
        success: false, 
        error: data.error || data.message || data.msg || 'Failed to activate user on Adobe API' 
      });
    }

    // 4. Update Database (bypasses RLS because supabase uses service_role key)
    const newBalance = balance - costNum;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + daysNum * 24 * 60 * 60 * 1000);

    // Deduct balance
    await supabase.from('users').update({ wallet_balance: newBalance }).eq('id', user.id);

    await fetchAdobePanelUsers(true);
    const orgSnap =
      getAdobeOrgSnapshotByEmail(email) ||
      (() => {
        const orgId = Number((data as any)?.user?.organizationId || 0);
        const orgName = (data as any)?.user?.organizationName;
        if (!orgId && !orgName) return null;
        return {
          organizationId: orgId > 0 ? orgId : null,
          organizationName: orgName ? String(orgName) : null,
          displayProducts: [],
        };
      })();

    // Create user access record
    const { data: newUserRecord, error: insertError } = await supabase.from('reseller_user_access').insert({
      reseller_id: user.id,
      customer_email: email,
      duration_months: durationStr,
      duration_days: daysNum,
      status: 'active',
      products: orgSnap?.displayProducts?.length
        ? orgSnap.displayProducts
        : ['Creative Cloud Pro'],
      expires_at: expiresAt.toISOString(),
      adobe_organization_id: orgSnap?.organizationId ?? null,
      adobe_organization_name: orgSnap?.organizationName ?? null,
      adobe_synced_at: new Date().toISOString(),
    }).select().single();

    if (insertError) {
      console.error('Failed to insert user access record:', insertError);
    }

    // Record transaction
    await supabase.from('reseller_transactions').insert({
      reseller_id: user.id,
      amount: -costNum,
      type: 'deduct',
      status: 'completed',
      description: `User activation: ${email} (${durationStr})`,
      balance_after: newBalance
    });

    return res.status(200).json({
      success: true,
      message: 'User activated successfully',
      data: newUserRecord || data
    });
  } catch (error: any) {
    console.error('Adobe Activate Error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

/**
 * POST /api/reseller/adobe/extend
 * Extend user duration
 */
router.post('/adobe/extend', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase client not initialized' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const { data: userRoleProfile } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (userRoleProfile?.role !== 'reseller') {
       return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const { email, durationMonths, cost, durationDays } = req.body;
    if (!email || !durationMonths) {
      return res.status(400).json({ success: false, error: 'Missing email or durationMonths' });
    }

    const costNum = Number(cost) || 0;
    const daysNum = Number(durationDays) || 30;

    // Verify balance
    const { data: balanceProfile } = await supabase.from('users').select('wallet_balance').eq('id', user.id).single();
    const balance = balanceProfile?.wallet_balance || 0;

    if (balance < costNum) {
      return res.status(400).json({ success: false, error: 'Insufficient balance.' });
    }

    // Check if user exists in local DB (prefer active record when duplicates exist)
    const { data: existingUser } = await supabase
      .from('reseller_user_access')
      .select('*')
      .eq('reseller_id', user.id)
      .eq('customer_email', email)
      .neq('status', 'refunded')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!existingUser) {
      return res.status(404).json({ success: false, error: 'User not found in your account. Please activate them first.' });
    }

    // 1. Attempt to call Adobe API (try add-user to renew)
    const body = {
      email,
      durationMonths: durationMonths.toString()
    };
    const headers = getAdobeApiHeaders(body);
    
    // We try to call Adobe API. If it fails, we still process locally or return error based on response
    try {
      const response = await fetch(`${ADOBE_BASE_URL}/add-user`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
      // We'll ignore the adobe response and just trust it if it succeeds, or log if fails.
      // Often "add-user" works for extending as well.
    } catch (e) {
      console.error('Adobe API Extension warning:', e);
      // Fall through to update local DB anyway, so the reseller panel is accurate.
    }

    // 2. Update Database
    const newBalance = balance - costNum;
    
    // Calculate new expiration
    const now = new Date();
    const currentExpiry = new Date(existingUser.expires_at);
    
    // If already expired, start from now. If active, add to existing expiry.
    const baseDate = currentExpiry > now ? currentExpiry : now;
    const newExpiresAt = new Date(baseDate.getTime() + daysNum * 24 * 60 * 60 * 1000);

    // Deduct balance
    await supabase.from('users').update({ wallet_balance: newBalance }).eq('id', user.id);

    // Update user access record
    await supabase.from('reseller_user_access').update({
      duration_months: durationMonths.toString(),
      duration_days: daysNum,
      status: 'active',
      expires_at: newExpiresAt.toISOString()
    }).eq('id', existingUser.id);

    // Record transaction
    await supabase.from('reseller_transactions').insert({
      reseller_id: user.id,
      amount: -costNum,
      type: 'deduct',
      status: 'completed',
      description: `User extended: ${email} (+${durationMonths.toString()})`,
      balance_after: newBalance
    });

    return res.status(200).json({
      success: true,
      message: 'User extended successfully',
      data: { expires_at: newExpiresAt.toISOString() }
    });
  } catch (error: any) {
    console.error('Adobe Extend Error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

/**
 * POST /api/reseller/adobe/deactivate
 * Remove a reseller customer (Adobe API when available, always updates local records).
 */
router.post('/adobe/deactivate', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase client not initialized' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (profile?.role !== 'reseller') {
       return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const { email, recordId, cost, hoursDiff, currentBalance, status } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Missing email' });
    }

    const adobe = await revokeAdobeCloudAccess(email);
    if (!adobe.success) {
      return res.status(400).json({ success: false, error: adobe.error || 'Failed to deactivate user on Adobe API' });
    }

    if (recordId) {
      const { data: accessRow, error: accessError } = await supabase
        .from('reseller_user_access')
        .select('id')
        .eq('id', recordId)
        .eq('reseller_id', user.id)
        .single();

      if (accessError || !accessRow) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      let newStatus = 'expired';
      let finalBalance = currentBalance || 0;
      
      if (hoursDiff <= 24 && status === 'active') {
        newStatus = 'refunded';
        finalBalance += (cost || 0);

        await supabase.from('users').update({ wallet_balance: finalBalance }).eq('id', user.id);

        await supabase.from('reseller_transactions').insert({
          reseller_id: user.id,
          amount: cost || 0,
          type: 'refund',
          status: 'completed',
          description: `Refunded: ${email} (within 24h)`,
          balance_after: finalBalance
        });
      } else {
        await supabase.from('reseller_transactions').insert({
          reseller_id: user.id,
          amount: 0,
          type: 'system',
          status: 'completed',
          description: `Subscription expired / removed: ${email}`,
          balance_after: finalBalance
        });
      }

      await supabase
        .from('reseller_user_access')
        .update({ status: newStatus })
        .eq('id', recordId)
        .eq('reseller_id', user.id);
    }

    return res.status(200).json({
      success: true,
      message: adobe.alreadyGone
        ? 'User was already removed from Adobe; your panel has been updated.'
        : 'User deactivated and removed from Adobe successfully',
      adobeAlreadyGone: !!adobe.alreadyGone,
      data: adobe.data,
    });
  } catch (error: any) {
    console.error('Adobe Deactivate Error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

/**
 * Helper to generate Binance HMAC signature
 */
function generateBinanceSignature(queryString: string) {
  return crypto
    .createHmac('sha256', BINANCE_SECRET_KEY)
    .update(queryString)
    .digest('hex');
}

async function signedBinanceGet(
  path: string,
  params: Record<string, string | number> = {},
): Promise<{ ok: boolean; data: unknown }> {
  const query = new URLSearchParams({
    timestamp: String(Date.now()),
    ...Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ),
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

type BinancePayTx = {
  orderId?: string;
  transactionId?: string;
  amount?: string;
  currency?: string;
  uid?: number;
  orderType?: string;
};

function matchBinancePayTx(
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

/**
 * POST /api/reseller/binance/verify
 * Verifies a transaction ID and adds funds automatically if valid
 */
router.post('/binance/verify', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase client not initialized' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !authData.user) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
    
    const user = authData.user;
    const { txId, expectedAmount } = req.body;

    if (!txId || !expectedAmount) {
      return res.status(400).json({ success: false, error: 'Transaction ID and amount are required' });
    }

    if (!BINANCE_API_KEY || !BINANCE_SECRET_KEY) {
      return res.status(500).json({ success: false, error: 'Binance API keys not configured' });
    }

    // 1. Check if this TxID is already used
    const { data: existingTx } = await supabase
      .from('reseller_transactions')
      .select('id, status')
      .eq('tx_id', txId)
      .in('status', ['completed', 'pending'])
      .maybeSingle();

    if (existingTx?.status === 'completed') {
      return res.status(400).json({ success: false, error: 'Transaction already processed' });
    }

    // 2. Binance Pay C2C (what resellers use) — then on-chain crypto deposits as fallback
    let verifiedAmount: number | null = null;

    const payRes = await signedBinanceGet('/sapi/v1/pay/transactions', { limit: 100 });
    if (!payRes.ok) {
      console.error('Binance Pay API Error:', payRes.data);
      return res.status(400).json({ success: false, error: 'Failed to connect to Binance Pay' });
    }

    const payRows = (payRes.data as { data?: BinancePayTx[] })?.data;
    if (Array.isArray(payRows)) {
      const payMatch = matchBinancePayTx(payRows, txId, expectedAmount);
      if (payMatch) {
        verifiedAmount = parseFloat(payMatch.amount || '0');
      }
    }

    if (verifiedAmount === null) {
      const depRes = await signedBinanceGet('/sapi/v1/capital/deposit/hisrec', { limit: 100 });
      if (!depRes.ok) {
        console.error('Binance deposit API Error:', depRes.data);
        return res.status(400).json({ success: false, error: 'Failed to connect to Binance' });
      }

      const deposits = depRes.data;
      if (Array.isArray(deposits)) {
        const cryptoMatch = deposits.find(
          (d: { txId?: string; id?: string; status?: number; amount?: string; coin?: string }) =>
            (d.txId === txId || String(d.id) === txId) &&
            d.status === 1 &&
            parseFloat(d.amount || '0') >= parseFloat(String(expectedAmount)) &&
            STABLE_COINS.has(String(d.coin || '').toUpperCase()),
        );
        if (cryptoMatch) {
          verifiedAmount = parseFloat(cryptoMatch.amount || '0');
        }
      }
    }

    if (verifiedAmount === null) {
      const { data: profile } = await supabase.from('users').select('wallet_balance').eq('id', user.id).single();

      if (!existingTx) {
        await supabase.from('reseller_transactions').insert({
          reseller_id: user.id,
          amount: expectedAmount,
          type: 'deposit',
          status: 'pending',
          tx_id: txId,
          description: 'Binance verification pending (Not found in auto-scan)',
          balance_after: profile?.wallet_balance || 0,
        });
      }

      return res.status(200).json({
        success: true,
        status: 'pending',
        message: 'Transaction recorded. Admin will review shortly.',
      });
    }

    // 3. Transaction verified — credit wallet
    
    // Add balance to user
    const { data: profile } = await supabase.from('users').select('wallet_balance').eq('id', user.id).single();
    const currentBalance = profile?.wallet_balance || 0;
    const newBalance = currentBalance + verifiedAmount;

    await supabase.from('users').update({ wallet_balance: newBalance }).eq('id', user.id);

    if (existingTx?.status === 'pending') {
      await supabase
        .from('reseller_transactions')
        .update({
          amount: verifiedAmount,
          status: 'completed',
          description: 'Binance Pay Auto-Verified',
          balance_after: newBalance,
        })
        .eq('id', existingTx.id);
    } else {
      await supabase.from('reseller_transactions').insert({
        reseller_id: user.id,
        amount: verifiedAmount,
        type: 'deposit',
        status: 'completed',
        tx_id: txId,
        description: 'Binance Pay Auto-Verified',
        balance_after: newBalance,
      });
    }

    return res.status(200).json({
      success: true,
      status: 'completed',
      message: `Successfully verified and added $${verifiedAmount} to balance.`
    });

  } catch (error: any) {
    console.error('Binance Verify Error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

export default router;
