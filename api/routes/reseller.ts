import express from 'express';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

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
 * Remove a user via Adobe Reseller API
 * (Assuming the endpoint is /remove-user or /delete-user based on standard reseller API practices)
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

    // The user's documentation didn't explicitly provide the remove-user endpoint, 
    // but we'll assume it's `/remove-user` and takes `{ email: "user@example.com" }`
    const body = { email };
    const headers = getAdobeApiHeaders(body);

    const response = await fetch(`${ADOBE_BASE_URL}/remove-user`, {
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
        error: data.error || data.message || data.msg || 'Failed to deactivate user on Adobe API' 
      });
    }

    // Secure database updates if recordId is provided
    if (recordId) {
      let newStatus = 'expired';
      let finalBalance = currentBalance || 0;
      
      if (hoursDiff <= 24 && status === 'active') {
        newStatus = 'refunded';
        finalBalance += (cost || 0);

        // Update balance
        await supabase.from('users').update({ wallet_balance: finalBalance }).eq('id', user.id);

        // Record refund transaction
        await supabase.from('reseller_transactions').insert({
          reseller_id: user.id,
          amount: cost || 0,
          type: 'refund',
          status: 'completed',
          description: `Refunded: ${email} (within 24h)`,
          balance_after: finalBalance
        });
      } else {
        // Record system deduct transaction
        await supabase.from('reseller_transactions').insert({
          reseller_id: user.id,
          amount: 0,
          type: 'system',
          status: 'completed',
          description: `Subscription expired / removed: ${email}`,
          balance_after: finalBalance
        });
      }

      // Update access record
      await supabase.from('reseller_user_access').update({ status: newStatus }).eq('id', recordId);
    }

    return res.status(200).json({
      success: true,
      message: 'User deactivated successfully',
      data
    });
  } catch (error: any) {
    console.error('Adobe Deactivate Error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

export default router;
