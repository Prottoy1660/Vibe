import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { loadReferralSettings } from '../lib/referralEngine.js';

dotenv.config();

const router = express.Router();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/** Public: lets checkout show a helpful hint when users paste a referral code into the coupon field. */
router.get('/check-code', async (req, res) => {
  try {
    const raw = String(req.query.code || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (raw.length < 4) {
      return res.json({ success: true, is_referral_code: false });
    }
    const { data } = await supabase.from('referral_codes').select('code').eq('code', raw).maybeSingle();
    return res.json({ success: true, is_referral_code: !!data });
  } catch (e: any) {
    console.error('referral/check-code:', e);
    return res.status(500).json({ success: false, message: e?.message || 'Server error' });
  }
});

async function requireUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
    if (!token) return res.status(401).json({ success: false, message: 'Missing Authorization token' });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ success: false, message: 'Invalid token' });

    (req as any).user = data.user;
    return next();
  } catch (e: any) {
    return res.status(401).json({ success: false, message: e?.message || 'Unauthorized' });
  }
}

function clientIp(req: express.Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim().slice(0, 128);
  const rip = req.socket?.remoteAddress;
  return rip ? String(rip).slice(0, 128) : '';
}

router.get('/me', requireUser, async (req, res) => {
  try {
    const user = (req as any).user;
    const [{ data: codeRow }, { data: profile }, grantedCount, pendingCount] = await Promise.all([
      supabase.from('referral_codes').select('code,is_active').eq('owner_user_id', user.id).maybeSingle(),
      supabase
        .from('users')
        .select('referred_by_code,wallet_promotional_balance,wallet_balance')
        .eq('id', user.id)
        .single(),
      supabase
        .from('referral_rewards')
        .select('id', { count: 'exact', head: true })
        .eq('referrer_user_id', user.id)
        .eq('status', 'granted'),
      supabase
        .from('referral_rewards')
        .select('id', { count: 'exact', head: true })
        .eq('referrer_user_id', user.id)
        .in('status', ['pending_review', 'blocked']),
    ]);

    return res.json({
      success: true,
      code: (codeRow as any)?.code || null,
      code_active: (codeRow as any)?.is_active !== false,
      referred_by_code: (profile as any)?.referred_by_code || null,
      wallet_balance: Number((profile as any)?.wallet_balance || 0),
      wallet_promotional_balance: Number((profile as any)?.wallet_promotional_balance || 0),
      successful_referrals: grantedCount.count || 0,
      flagged_referrals: pendingCount.count || 0,
    });
  } catch (e: any) {
    console.error('referral/me:', e);
    return res.status(500).json({ success: false, message: e?.message || 'Server error' });
  }
});

router.post('/claim', requireUser, async (req, res) => {
  try {
    const settings = await loadReferralSettings(supabase);
    if (!settings.enabled) {
      return res.status(403).json({ success: false, message: 'Referral program is currently disabled' });
    }

    const user = (req as any).user;
    const raw = String(req.body?.code || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (!raw || raw.length < 4) {
      return res.status(400).json({ success: false, message: 'Invalid referral code' });
    }

    const { data: existing } = await supabase.from('users').select('referred_by_code').eq('id', user.id).single();
    if ((existing as any)?.referred_by_code) {
      return res.status(400).json({ success: false, message: 'Referral code already applied' });
    }

    const { data: ownerCode } = await supabase
      .from('referral_codes')
      .select('owner_user_id, code, is_active')
      .eq('code', raw)
      .maybeSingle();

    if (!ownerCode?.is_active || !ownerCode.owner_user_id) {
      return res.status(400).json({ success: false, message: 'Invalid or inactive referral code' });
    }
    if (ownerCode.owner_user_id === user.id) {
      return res.status(400).json({ success: false, message: 'You cannot use your own referral code' });
    }

    const ua = String(req.headers['user-agent'] || '').slice(0, 512);
    const meta = {
      claimed_at: new Date().toISOString(),
      signup_ip: clientIp(req),
      user_agent: ua,
      device_fingerprint: String(req.body?.device_fingerprint || '').slice(0, 256) || null,
    };

    const { error: upErr } = await supabase
      .from('users')
      .update({
        referred_by_code: raw,
        referral_claim_meta: meta,
      })
      .eq('id', user.id);

    if (upErr) {
      console.error('referral claim update:', upErr);
      return res.status(500).json({ success: false, message: upErr.message || 'Failed to apply code' });
    }

    return res.json({ success: true, referred_by_code: raw });
  } catch (e: any) {
    console.error('referral/claim:', e);
    return res.status(500).json({ success: false, message: e?.message || 'Server error' });
  }
});

export default router;
