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
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (profile?.role !== 'reseller') {
       return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const { email, durationMonths } = req.body;
    if (!email || !durationMonths) {
      return res.status(400).json({ success: false, error: 'Missing email or durationMonths' });
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

    return res.status(200).json(data);
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

    const { email } = req.body;
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

    return res.status(200).json(data);
  } catch (error: any) {
    console.error('Adobe Deactivate Error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

export default router;
