import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import webpush from 'web-push';

dotenv.config();

const router = express.Router();

const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const vapidPublicKey = (process.env.WEB_PUSH_VAPID_PUBLIC_KEY || process.env.VITE_WEB_PUSH_PUBLIC_KEY || '').trim();
const vapidPrivateKey = (process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '').trim();
const vapidSubject = (process.env.WEB_PUSH_SUBJECT || process.env.FRONTEND_URL || 'mailto:admin@example.com').trim();

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
} else {
  console.warn('[push] Missing WEB_PUSH_VAPID_PUBLIC_KEY/WEB_PUSH_VAPID_PRIVATE_KEY. Push sending will be disabled.');
}

async function requireUser(req: express.Request, res: express.Response) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token || token === 'undefined') {
    res.status(401).json({ success: false, error: 'Missing Authorization token' });
    return null;
  }
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return null;
  }
  return user;
}

router.get('/vapid-public-key', async (_req, res) => {
  // Public key is safe to expose; clients need it to subscribe.
  return res.json({ success: true, publicKey: vapidPublicKey || null });
});

router.post('/subscribe', async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const sub = req.body?.subscription;
    const endpoint = String(sub?.endpoint || '').trim();
    const p256dh = String(sub?.keys?.p256dh || '').trim();
    const auth = String(sub?.keys?.auth || '').trim();
    const ua = typeof req.body?.user_agent === 'string' ? req.body.user_agent.slice(0, 512) : null;

    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ success: false, error: 'Invalid subscription payload' });
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          endpoint,
          p256dh,
          auth,
          user_agent: ua,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' },
      );
    if (error) throw error;

    return res.json({ success: true });
  } catch (e: any) {
    console.error('push subscribe error:', e);
    return res.status(500).json({ success: false, error: e?.message || 'Subscribe failed' });
  }
});

router.post('/unsubscribe', async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint.trim() : '';

    let q = supabase.from('push_subscriptions').delete().eq('user_id', user.id);
    if (endpoint) q = q.eq('endpoint', endpoint);

    const { error } = await q;
    if (error) throw error;
    return res.json({ success: true });
  } catch (e: any) {
    console.error('push unsubscribe error:', e);
    return res.status(500).json({ success: false, error: e?.message || 'Unsubscribe failed' });
  }
});

// Admin-only endpoint to send a push to a user (used by admin notification tools).
router.post('/admin/send', async (req, res) => {
  try {
    // Reuse admin verification logic inline (keeps this router self-contained).
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token || token === 'undefined') return res.status(401).json({ success: false, error: 'Missing Authorization token' });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });
    const { data: roleRow } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (roleRow?.role !== 'admin' && roleRow?.role !== 'super_admin') return res.status(403).json({ success: false, error: 'Forbidden' });

    if (!vapidPublicKey || !vapidPrivateKey) {
      return res.status(500).json({ success: false, error: 'Push VAPID keys are not configured on the server' });
    }

    const userId = String(req.body?.user_id || '').trim();
    const title = String(req.body?.title || '').trim().slice(0, 200);
    const body = String(req.body?.body || '').trim().slice(0, 2000);
    const url = typeof req.body?.url === 'string' ? req.body.url.trim().slice(0, 1024) : '';
    if (!userId || !title || !body) return res.status(400).json({ success: false, error: 'user_id, title, body required' });

    const { data: subs, error: subErr } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId)
      .limit(20);
    if (subErr) throw subErr;

    let sent = 0;
    let removed = 0;
    const payload = JSON.stringify({
      title,
      body,
      url: url || '/',
    });

    for (const s of subs || []) {
      const subscription = {
        endpoint: (s as any).endpoint,
        keys: { p256dh: (s as any).p256dh, auth: (s as any).auth },
      } as any;

      try {
        await webpush.sendNotification(subscription, payload);
        sent++;
        await supabase.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', (s as any).id);
      } catch (err: any) {
        const code = err?.statusCode;
        if (code === 404 || code === 410) {
          removed++;
          await supabase.from('push_subscriptions').delete().eq('id', (s as any).id);
        }
      }
    }

    return res.json({ success: true, subscriptions: subs?.length || 0, sent, removed });
  } catch (e: any) {
    console.error('push admin send error:', e);
    return res.status(500).json({ success: false, error: e?.message || 'Send failed' });
  }
});

export default router;

