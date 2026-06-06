import express from 'express';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import {
  extendAdobeCloudAccess,
  fetchAdobePanelUsers,
  getAdobeOrgMap,
  getAdobeOrgSnapshotByEmail,
  getAdobePanelUserByEmail,
  revokeAdobeCloudAccess,
} from '../lib/adobeApi.js';
import {
  buildPaymentDetailsFromMatch,
  depositNeedsBinanceSync,
  isBinanceConfigured,
  lookupBinancePayment,
  syncDepositRowFromBinance,
} from '../lib/binancePaymentSync.js';

const router = express.Router();

const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const supabase = supabaseUrl && supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey) 
  : null;

const ADOBE_API_KEY = process.env.ADOBE_API_KEY || '';
const ADOBE_BASE_URL = 'https://reseller.ado-besoft.com/api/credits-pool/external';

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

function formatPlanDurationLabel(durationMonths: string, durationDays: number): string {
  const raw = String(durationMonths || '').trim();
  if (raw.endsWith('d')) {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? `${n} day${n === 1 ? '' : 's'}` : raw;
  }
  const months = parseInt(raw, 10);
  if (Number.isFinite(months) && months > 0) {
    return months === 1 ? '1 month' : `${months} months`;
  }
  if (durationDays > 0) {
    return durationDays === 1 ? '1 day' : `${durationDays} days`;
  }
  return raw || '—';
}

/**
 * GET /api/reseller/users/:id/status
 * Subscription status for one reseller customer (local DB + Adobe credits-pool).
 */
router.get('/users/:id/status', async (req, res) => {
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

    const userId = String(req.params.id || '').trim();
    if (!userId) {
      return res.status(400).json({ success: false, error: 'Missing user id' });
    }

    const forceRefresh = req.query.refresh === '1';
    await fetchAdobePanelUsers(forceRefresh);

    const { data: row, error } = await supabase
      .from('reseller_user_access')
      .select('*')
      .eq('id', userId)
      .eq('reseller_id', authData.user.id)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
    if (!row) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const email = String(row.customer_email || '').trim().toLowerCase();
    const live = getAdobePanelUserByEmail(email);
    const orgSnap = getAdobeOrgSnapshotByEmail(email);

    const activatedAt = row.activated_at ? String(row.activated_at) : '';
    const expiresAt =
      (live?.expiresAt ? String(live.expiresAt) : null) ||
      (row.expires_at ? String(row.expires_at) : '');

    const activatedMs = activatedAt ? new Date(activatedAt).getTime() : NaN;
    const expiresMs = expiresAt ? new Date(expiresAt).getTime() : NaN;
    const nowMs = Date.now();

    let daysLeft = 0;
    let progressPercent = 0;
    if (Number.isFinite(expiresMs)) {
      daysLeft = Math.max(0, Math.ceil((expiresMs - nowMs) / (24 * 60 * 60 * 1000)));
    }
    if (Number.isFinite(activatedMs) && Number.isFinite(expiresMs) && expiresMs > activatedMs) {
      const total = expiresMs - activatedMs;
      const elapsed = Math.min(total, Math.max(0, nowMs - activatedMs));
      progressPercent = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
    }

    const localStatus = String(row.status || 'active');
    const isExpired =
      localStatus === 'expired' ||
      (Number.isFinite(expiresMs) && expiresMs <= nowMs) ||
      String(live?.status || '').toLowerCase() === 'expired';

    const adobeLive = !!live;
    const organizationName =
      row.adobe_organization_name ||
      live?.organizationName ||
      orgSnap?.organizationName ||
      null;

    const products =
      Array.isArray(row.products) && row.products.length > 0
        ? row.products
        : live?.displayProducts?.length
          ? live.displayProducts
          : live?.products?.length
            ? live.products
            : orgSnap?.displayProducts?.length
              ? orgSnap.displayProducts
              : [];

    let teamStatus: 'normal' | 'attention' | 'unknown' = 'unknown';
    let teamMessage = 'Organization data has not been synced yet.';
    if (isExpired) {
      teamStatus = 'attention';
      teamMessage = 'This subscription has expired.';
    } else if (adobeLive && organizationName) {
      teamStatus = 'normal';
      teamMessage = 'This team is operating normally on Super Reseller.';
    } else if (adobeLive) {
      teamStatus = 'attention';
      teamMessage = 'Account is active on Super Reseller but organization name is pending sync.';
    } else if (localStatus === 'active') {
      teamStatus = 'attention';
      teamMessage = 'Not found on Super Reseller yet — try Refresh on My Users.';
    }

    const refundWindowMs = 24 * 60 * 60 * 1000;
    let refundEligible = false;
    let refundRemainingMs: number | null = null;
    if (localStatus === 'active' && Number.isFinite(activatedMs)) {
      const deadline = activatedMs + refundWindowMs;
      const remaining = deadline - nowMs;
      if (remaining > 0) {
        refundEligible = true;
        refundRemainingMs = remaining;
      }
    }

    const overallStatus =
      localStatus === 'refunded'
        ? 'refunded'
        : isExpired
          ? 'expired'
          : localStatus === 'active'
            ? 'active'
            : localStatus;

    return res.status(200).json({
      success: true,
      status: {
        id: row.id,
        email: row.customer_email,
        overallStatus,
        teamStatus,
        teamMessage,
        organizationName,
        organizationId: row.adobe_organization_id ?? live?.organizationId ?? orgSnap?.organizationId ?? null,
        products,
        planDuration: formatPlanDurationLabel(row.duration_months, row.duration_days),
        activatedAt: activatedAt || null,
        expiresAt: expiresAt || null,
        daysLeft,
        progressPercent,
        adobeLive,
        organizationSyncedAt: row.adobe_synced_at ?? null,
        refundEligible,
        refundRemainingMs,
        adobeStatus: live?.status ?? null,
      },
    });
  } catch (error: any) {
    console.error('Reseller user status error:', error);
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

    const durationStr = String(durationMonths).trim();
    if (/^\d+d$/i.test(durationStr)) {
      return res.status(400).json({
        success: false,
        error:
          'Day-based packages (e.g. 7d trial) cannot be used for extension. Choose a monthly package (1–12 months).',
      });
    }
    const monthsNum = Number(durationStr);
    if (!Number.isFinite(monthsNum) || monthsNum < 1 || monthsNum > 12) {
      return res.status(400).json({
        success: false,
        error: 'Extension duration must be between 1 and 12 months.',
      });
    }

    const costNum = Number(cost) || 0;
    const daysNum = Number(durationDays) || monthsNum * 30;

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

    const adobe = await extendAdobeCloudAccess(email, durationStr);
    if (!adobe.success) {
      return res.status(400).json({
        success: false,
        error: adobe.error || 'Failed to extend user on Adobe credits-pool',
      });
    }

    const newBalance = balance - costNum;

    const now = new Date();
    const currentExpiry = new Date(existingUser.expires_at);
    const baseDate = currentExpiry > now ? currentExpiry : now;
    const fallbackExpiresAt = new Date(baseDate.getTime() + daysNum * 24 * 60 * 60 * 1000);
    const newExpiresAt = adobe.newExpiresAt ? new Date(adobe.newExpiresAt) : fallbackExpiresAt;

    await supabase.from('users').update({ wallet_balance: newBalance }).eq('id', user.id);

    await supabase.from('reseller_user_access').update({
      duration_months: durationStr,
      duration_days: daysNum,
      status: 'active',
      expires_at: newExpiresAt.toISOString(),
      adobe_synced_at: new Date().toISOString(),
    }).eq('id', existingUser.id);

    // Record transaction
    await supabase.from('reseller_transactions').insert({
      reseller_id: user.id,
      amount: -costNum,
      type: 'deduct',
      status: 'completed',
      description: `User extended: ${email} (+${durationStr})`,
      balance_after: newBalance
    });

    return res.status(200).json({
      success: true,
      message: 'User extended successfully on Adobe',
      data: { expires_at: newExpiresAt.toISOString(), adobe: adobe.data },
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
 * POST /api/reseller/binance/sync-deposits
 * Pull payer/order details from Binance for this reseller's deposits missing metadata.
 */
router.post('/binance/sync-deposits', async (req, res) => {
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

    if (!isBinanceConfigured()) {
      return res.status(500).json({ success: false, error: 'Binance API keys not configured' });
    }

    const { data: rows, error } = await supabase
      .from('reseller_transactions')
      .select('id, tx_id, amount, created_at, payer_binance_id, payment_channel, binance_transaction_id')
      .eq('reseller_id', authData.user.id)
      .eq('type', 'deposit')
      .not('tx_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    const toSync = (rows || []).filter((row) => depositNeedsBinanceSync(row));
    let synced = 0;

    for (const row of toSync) {
      const result = await syncDepositRowFromBinance(row, async (id, patch) => {
        const { error: updateError } = await supabase
          .from('reseller_transactions')
          .update(patch)
          .eq('id', id)
          .eq('reseller_id', authData.user.id);
        if (updateError) throw updateError;
      });
      if (result.synced) synced += 1;
    }

    return res.status(200).json({
      success: true,
      synced,
      attempted: toSync.length,
    });
  } catch (error: any) {
    console.error('Binance sync-deposits error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

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

    if (!isBinanceConfigured()) {
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

    const lookup = await lookupBinancePayment(String(txId), {
      minAmount: parseFloat(String(expectedAmount)),
      strict: true,
    });

    const verifiedAmount = lookup?.verifiedAmount ?? null;
    const paymentMatch = lookup?.match ?? null;

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
    const paymentDetails = paymentMatch ? buildPaymentDetailsFromMatch(paymentMatch) : {};
    
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
          ...paymentDetails,
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
        ...paymentDetails,
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
