import express from 'express';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { runSubscriptionExpiryReminders } from '../lib/subscriptionExpiryReminders.js';
import { attachAdminActivityLogging } from '../lib/adminActivityLog.js';

dotenv.config();

const router = express.Router();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const verifyAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'No authorization header' });

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error } = await supabase.auth.getUser(token);
    if (error || !userData?.user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { data: profile, error: profileErr } = await supabase
      .from('users')
      .select('role')
      .eq('id', userData.user.id)
      .single();

    if (profileErr) throw profileErr;
    if (profile?.role !== 'admin' && profile?.role !== 'super_admin') return res.status(403).json({ success: false, error: 'Forbidden' });

    attachAdminActivityLogging(req, res, userData.user.id);
    next();
  } catch (err: any) {
    console.error('verifyAdmin error:', err);
    res.status(500).json({ success: false, error: 'Server error during admin verification' });
  }
};

// Admin-only expiration/burn runner (call from host cron)
router.post('/burn-expired-emails', verifyAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabase.rpc('burn_expired_emails');
    if (error) throw error;

    return res.json({
      success: true,
      burned_count: typeof data === 'number' ? data : Number(data || 0),
    });
  } catch (err: any) {
    console.error('burn-expired-emails error:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to burn expired emails' });
  }
});

/** Host cron / manual run: same logic as daily node-cron job. */
router.post('/subscription-expiry-reminders', verifyAdmin, async (_req, res) => {
  try {
    const r = await runSubscriptionExpiryReminders(supabase);
    return res.json({ success: true, ...r });
  } catch (err: any) {
    console.error('subscription-expiry-reminders error:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to run expiry reminders' });
  }
});

export default router;

