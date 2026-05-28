import express from 'express';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { revokeAdobeCloudAccess } from '../lib/adobeApi.js';

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

    // Create user access record
    const { data: newUserRecord, error: insertError } = await supabase.from('reseller_user_access').insert({
      reseller_id: user.id,
      customer_email: email,
      duration_months: durationStr,
      duration_days: daysNum,
      status: 'active',
      products: ['Creative Cloud Pro'],
      expires_at: expiresAt.toISOString()
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
      .select('id')
      .eq('tx_id', txId)
      .eq('status', 'completed')
      .single();

    if (existingTx) {
      return res.status(400).json({ success: false, error: 'Transaction already processed' });
    }

    // 2. Fetch Binance Pay History
    const timestamp = Date.now();
    // Using Binance Pay Merchant / Pay API history endpoint if applicable
    // Or standard Binance deposit history if using crypto deposit:
    // GET /sapi/v1/capital/deposit/hisrec
    // Since we are verifying a general deposit / transfer, we'll check deposit history.
    
    const queryString = `timestamp=${timestamp}`;
    const signature = generateBinanceSignature(queryString);

    const binanceRes = await fetch(`https://api.binance.com/sapi/v1/capital/deposit/hisrec?${queryString}&signature=${signature}`, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': BINANCE_API_KEY
      }
    });

    const deposits = await binanceRes.json();

    if (!binanceRes.ok) {
      console.error('Binance API Error:', deposits);
      return res.status(400).json({ success: false, error: 'Failed to connect to Binance' });
    }

    // deposits should be an array of deposit objects
    // Example: { txId: "...", amount: "10.00", coin: "USDT", status: 1 } (1 = success)
    let verifiedDeposit = null;
    if (Array.isArray(deposits)) {
      verifiedDeposit = deposits.find(d => 
        (d.txId === txId || d.id === txId) && 
        d.status === 1 && 
        parseFloat(d.amount) >= parseFloat(expectedAmount) &&
        (d.coin === 'USDT' || d.coin === 'BUSD' || d.coin === 'USDC')
      );
    }

    if (!verifiedDeposit) {
      // If we don't find it in deposits, it might be a Binance Pay transfer, 
      // which requires the Binance Pay API (C2C) history.
      // For now, we will fallback to pending state for admin to manually approve
      // if it's a P2P/Pay transfer that standard deposit API doesn't catch.
      
      const { data: profile } = await supabase.from('users').select('wallet_balance').eq('id', user.id).single();
      
      await supabase.from('reseller_transactions').insert({
        reseller_id: user.id,
        amount: expectedAmount,
        type: 'deposit',
        status: 'pending',
        tx_id: txId,
        description: 'Binance verification pending (Not found in auto-scan)',
        balance_after: profile?.wallet_balance || 0
      });

      return res.status(200).json({ 
        success: true, 
        status: 'pending',
        message: 'Transaction recorded. Admin will review shortly.' 
      });
    }

    // 3. Transaction Verified Automatically!
    const verifiedAmount = parseFloat(verifiedDeposit.amount);
    
    // Add balance to user
    const { data: profile } = await supabase.from('users').select('wallet_balance').eq('id', user.id).single();
    const currentBalance = profile?.wallet_balance || 0;
    const newBalance = currentBalance + verifiedAmount;

    await supabase.from('users').update({ wallet_balance: newBalance }).eq('id', user.id);

    await supabase.from('reseller_transactions').insert({
      reseller_id: user.id,
      amount: verifiedAmount,
      type: 'deposit',
      status: 'completed',
      tx_id: txId,
      description: 'Binance Deposit Auto-Verified',
      balance_after: newBalance
    });

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
