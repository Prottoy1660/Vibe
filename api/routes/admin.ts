import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

function durationToMonths(duration: string | null | undefined) {
  const raw = String(duration || '').toLowerCase();
  if (!raw) return 1;
  if (raw.includes('year') || raw.includes('yr')) {
    const match = raw.match(/\d+/);
    return match ? Math.max(1, Number(match[0]) * 12) : 12;
  }
  const match = raw.match(/\d+/);
  return match ? Math.max(1, Number(match[0])) : 1;
}

// Middleware to verify admin
const verifyAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check if user is admin in public.users
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    next();
  } catch (err) {
    console.error('Verify admin error:', err);
    res.status(500).json({ error: 'Server error during authorization' });
  }
};

router.delete('/users/:id', verifyAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    // Prevent deleting admins for safety/security.
    const { data: userRow, error: userRowErr } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (userRowErr) {
      return res.status(500).json({ error: 'Failed to read user role before delete' });
    }

    if (userRow?.role === 'admin') {
      return res.status(403).json({ error: 'Admins cannot be deleted' });
    }

    // Delete from auth.users (This cascades to public.users if FK is setup, otherwise we delete manually)
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    
    if (authError) {
      console.error('Error deleting from auth:', authError);
      return res.status(500).json({ error: authError.message });
    }

    // Also explicitly delete from public.users just in case cascade is not set
    await supabase.from('users').delete().eq('id', userId);

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/users/:id', verifyAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { name, email, phone, password, avatar_url } = req.body;

    // 1. Prepare Auth Updates (Email, Password, Phone metadata)
    const authUpdateData: any = {};
    if (email) authUpdateData.email = email;
    if (password) authUpdateData.password = password;
    if (phone) authUpdateData.phone = phone;

    const userMetadata: any = {};
    if (name) userMetadata.full_name = name;
    if (phone) userMetadata.phone = phone;
    
    if (Object.keys(userMetadata).length > 0) {
      authUpdateData.user_metadata = userMetadata;
    }

    if (Object.keys(authUpdateData).length > 0) {
      const { error: authError } = await supabase.auth.admin.updateUserById(userId, authUpdateData);
      if (authError) {
        console.error('Error updating auth user:', authError);
        return res.status(400).json({ error: authError.message });
      }
    }

    // 2. Prepare Public Profile Updates (Name, Phone, Avatar)
    const publicUpdateData: any = {};
    if (name) publicUpdateData.name = name;
    if (email) publicUpdateData.email = email; // Also sync email to public table
    if (phone) publicUpdateData.phone = phone;
    if (avatar_url !== undefined) publicUpdateData.avatar_url = avatar_url;

    if (Object.keys(publicUpdateData).length > 0) {
      const { error: publicError } = await supabase
        .from('users')
        .update(publicUpdateData)
        .eq('id', userId);

      if (publicError) {
        console.error('Error updating public user:', publicError);
        return res.status(400).json({ error: publicError.message });
      }
    }

    // 3. Log the activity
    const changes: string[] = [];
    if (name) changes.push('Name');
    if (email) changes.push('Email');
    if (phone) changes.push('Phone Number');
    if (password) changes.push('Password');
    if (avatar_url !== undefined) changes.push('Avatar');

    if (changes.length > 0) {
      // Get the admin's user ID from the token we verified earlier
      const authHeader = req.headers.authorization;
      const token = authHeader?.replace('Bearer ', '') || '';
      const { data: { user: adminUser } } = await supabase.auth.getUser(token);

      await supabase.from('user_activity_logs').insert({
        user_id: userId,
        action_type: 'admin_update',
        changed_by: adminUser?.id || null,
        details: { message: `Admin updated ${changes.join(', ')}` }
      });
    }

    res.json({ success: true, message: 'User updated successfully' });
  } catch (error: any) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/ops/support-summary/:userId', verifyAdmin, async (req, res) => {
  try {
    const userId = req.params.userId;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const [{ data: profile }, { data: orders }, { data: walletRow }, { data: paymentEvents }, { data: riskEvents }, { data: orderEvents }] =
      await Promise.all([
        supabase.from('users').select('id, name, email, phone, wallet_balance, created_at').eq('id', userId).single(),
        supabase
          .from('orders')
          .select('id, status, payment_status, payment_method, total_amount, created_at, product:product_id(title)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase.from('users').select('wallet_balance').eq('id', userId).single(),
        supabase
          .from('payment_events')
          .select('id, event_type, amount, message, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('risk_events')
          .select('id, risk_type, severity, message, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('order_events')
          .select('id, order_id, event_type, status, message, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(40),
      ]);

    const failedPayments = (paymentEvents || []).filter((e: any) =>
      String(e.event_type || '').toLowerCase().includes('fail')
    ).length;

    return res.json({
      success: true,
      profile,
      wallet_balance: Number(walletRow?.wallet_balance || 0),
      order_count: orders?.length || 0,
      failed_payments_last: failedPayments,
      latest_orders: orders || [],
      payment_events: paymentEvents || [],
      risk_events: riskEvents || [],
      timeline_events: orderEvents || [],
    });
  } catch (error: any) {
    console.error('ops support-summary error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/risk-overview', verifyAdmin, async (req, res) => {
  try {
    const hours = Math.max(1, Math.min(168, Number(req.query.hours || 24)));
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const [{ data: recentPaymentEvents }, { data: recentRiskEvents }, { data: recentOrders }] = await Promise.all([
      supabase
        .from('payment_events')
        .select('event_type, created_at, user_id')
        .gte('created_at', since),
      supabase
        .from('risk_events')
        .select('risk_type, severity, created_at, user_id')
        .gte('created_at', since),
      supabase
        .from('orders')
        .select('id, user_id, status, payment_status, created_at')
        .gte('created_at', since),
    ]);

    const paymentFailures = (recentPaymentEvents || []).filter((e: any) =>
      String(e.event_type || '').toLowerCase().includes('fail')
    ).length;

    const retrySignals = (recentPaymentEvents || []).filter((e: any) =>
      String(e.event_type || '').toLowerCase().includes('retry')
    ).length;

    const pendingOrders = (recentOrders || []).filter((o: any) => o.status === 'pending').length;
    const suspiciousWallet = (recentRiskEvents || []).filter((r: any) => r.risk_type === 'wallet_anomaly').length;
    const redeemAbuse = (recentRiskEvents || []).filter((r: any) => r.risk_type === 'redeem_abuse').length;

    return res.json({
      success: true,
      window_hours: hours,
      metrics: {
        payment_failures: paymentFailures,
        retries: retrySignals,
        pending_orders: pendingOrders,
        suspicious_wallet_events: suspiciousWallet,
        redeem_abuse_events: redeemAbuse,
        total_risk_events: recentRiskEvents?.length || 0,
      },
      recent_risk_events: (recentRiskEvents || []).slice(0, 50),
    });
  } catch (error: any) {
    console.error('ops risk-overview error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/run-policies', verifyAdmin, async (req, res) => {
  try {
    const now = Date.now();
    const pendingOlderThan25 = new Date(now - 25 * 60 * 1000).toISOString();
    const pendingYoungerThan30 = new Date(now - 30 * 60 * 1000).toISOString();

    const { data: pendingOrders } = await supabase
      .from('orders')
      .select('id, user_id, created_at, status')
      .eq('status', 'pending')
      .lte('created_at', pendingOlderThan25)
      .gte('created_at', pendingYoungerThan30)
      .limit(500);

    let remindersQueued = 0;
    for (const order of pendingOrders || []) {
      const { data: existing } = await supabase
        .from('notification_queue')
        .select('id')
        .eq('order_id', order.id)
        .eq('template_key', 'pending_25m_reminder')
        .maybeSingle();
      if (existing?.id) continue;

      const { error } = await supabase.from('notification_queue').insert({
        user_id: order.user_id,
        order_id: order.id,
        channel: 'in_app',
        template_key: 'pending_25m_reminder',
        payload: { message: 'Your order is still pending. Complete payment soon before expiry.' },
        status: 'pending',
        scheduled_for: new Date().toISOString(),
      });
      if (!error) remindersQueued++;
    }

    const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000).toISOString();
    const { data: paymentFailures } = await supabase
      .from('payment_events')
      .select('user_id, event_type, created_at')
      .gte('created_at', thirtyMinutesAgo);

    const failureMap: Record<string, number> = {};
    for (const e of paymentFailures || []) {
      const type = String((e as any).event_type || '').toLowerCase();
      if (!type.includes('fail') && !type.includes('error')) continue;
      const uid = (e as any).user_id;
      if (!uid) continue;
      failureMap[uid] = (failureMap[uid] || 0) + 1;
    }

    let throttleFlags = 0;
    for (const [uid, count] of Object.entries(failureMap)) {
      if (count < 3) continue;
      const { data: existingRisk } = await supabase
        .from('risk_events')
        .select('id')
        .eq('user_id', uid)
        .eq('risk_type', 'repeat_payment_failures')
        .gte('created_at', thirtyMinutesAgo)
        .maybeSingle();
      if (existingRisk?.id) continue;

      const { error } = await supabase.from('risk_events').insert({
        user_id: uid,
        risk_type: 'repeat_payment_failures',
        severity: 'medium',
        message: `User has ${count} payment failures within 30 minutes`,
        meta: { failures_30m: count, suggested_action: 'temporary_throttle' },
      });
      if (!error) throttleFlags++;
    }

    return res.json({
      success: true,
      reminders_queued: remindersQueued,
      throttle_flags_created: throttleFlags,
    });
  } catch (error: any) {
    console.error('ops run-policies error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/bulk/orders/status', verifyAdmin, async (req, res) => {
  try {
    const { order_ids, new_status } = req.body as { order_ids: string[]; new_status: string };
    if (!Array.isArray(order_ids) || order_ids.length === 0 || !new_status) {
      return res.status(400).json({ error: 'order_ids and new_status are required' });
    }

    const updates: any = { status: new_status };
    if (new_status === 'completed') updates.payment_status = 'paid';
    if (new_status === 'cancelled') updates.payment_status = 'cancelled';

    const { error } = await supabase.from('orders').update(updates).in('id', order_ids);
    if (error) throw error;

    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '') || '';
    const { data: { user: adminUser } } = await supabase.auth.getUser(token);
    await supabase.from('bulk_action_logs').insert({
      action_type: 'bulk_order_status',
      target_count: order_ids.length,
      payload: { new_status, order_ids },
      performed_by: adminUser?.id || null,
    });

    return res.json({ success: true, updated: order_ids.length });
  } catch (error: any) {
    console.error('bulk order status error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/bulk/notices', verifyAdmin, async (req, res) => {
  try {
    const { user_ids, title, content, type = 'info' } = req.body as {
      user_ids: string[]; title: string; content: string; type?: string;
    };
    if (!Array.isArray(user_ids) || user_ids.length === 0 || !title || !content) {
      return res.status(400).json({ error: 'user_ids, title and content are required' });
    }

    const rows = user_ids.map((uid) => ({
      user_id: uid,
      channel: 'in_app',
      template_key: 'bulk_notice',
      payload: { title, content, type },
      status: 'pending',
      scheduled_for: new Date().toISOString(),
    }));
    const { error } = await supabase.from('notification_queue').insert(rows);
    if (error) throw error;

    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '') || '';
    const { data: { user: adminUser } } = await supabase.auth.getUser(token);
    await supabase.from('bulk_action_logs').insert({
      action_type: 'bulk_notice',
      target_count: user_ids.length,
      payload: { title, content, type },
      performed_by: adminUser?.id || null,
    });

    return res.json({ success: true, queued: user_ids.length });
  } catch (error: any) {
    console.error('bulk notices error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/bulk/renew-offers', verifyAdmin, async (req, res) => {
  try {
    const { user_ids, days = 7 } = req.body as { user_ids?: string[]; days?: number };
    const threshold = Math.max(1, Math.min(30, Number(days) || 7));

    let targets: string[] = [];
    if (Array.isArray(user_ids) && user_ids.length > 0) {
      targets = [...new Set(user_ids)];
    } else {
      const since = new Date(Date.now() - threshold * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentOrders } = await supabase
        .from('orders')
        .select('user_id, created_at, status')
        .eq('status', 'completed')
        .gte('created_at', since)
        .limit(500);
      targets = [...new Set((recentOrders || []).map((o: any) => o.user_id).filter(Boolean))];
    }

    if (targets.length === 0) return res.json({ success: true, queued: 0 });
    const rows = targets.map((uid) => ({
      user_id: uid,
      channel: 'in_app',
      template_key: 'renew_offer',
      payload: { message: 'Your subscription may expire soon. Renew now with one tap.' },
      status: 'pending',
      scheduled_for: new Date().toISOString(),
    }));
    const { error } = await supabase.from('notification_queue').insert(rows);
    if (error) throw error;

    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '') || '';
    const { data: { user: adminUser } } = await supabase.auth.getUser(token);
    await supabase.from('bulk_action_logs').insert({
      action_type: 'bulk_renew_offer',
      target_count: targets.length,
      payload: { days: threshold },
      performed_by: adminUser?.id || null,
    });

    return res.json({ success: true, queued: targets.length });
  } catch (error: any) {
    console.error('bulk renew offers error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/campaigns', verifyAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return res.json({ success: true, campaigns: data || [] });
  } catch (error: any) {
    console.error('campaign list error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/campaigns', verifyAdmin, async (req, res) => {
  try {
    const { name, channel = 'in_app', campaign_type = 'renewal', budget = 0, metadata = {} } = req.body || {};
    if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'Valid name is required' });

    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '') || '';
    const { data: { user: adminUser } } = await supabase.auth.getUser(token);

    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        name: String(name).trim(),
        channel,
        campaign_type,
        status: 'draft',
        budget: Number(budget) || 0,
        metadata,
        created_by: adminUser?.id || null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return res.json({ success: true, campaign: data });
  } catch (error: any) {
    console.error('campaign create error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.put('/ops/campaigns/:id', verifyAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { name, status, budget, metadata } = req.body || {};
    const updates: any = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (status !== undefined) updates.status = status;
    if (budget !== undefined) updates.budget = Number(budget) || 0;
    if (metadata !== undefined) updates.metadata = metadata;

    const { data, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return res.json({ success: true, campaign: data });
  } catch (error: any) {
    console.error('campaign update error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/campaigns/:id/roi', verifyAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const [{ data: campaign }, { data: events }] = await Promise.all([
      supabase.from('campaigns').select('*').eq('id', id).single(),
      supabase.from('campaign_events').select('event_type, revenue_amount').eq('campaign_id', id),
    ]);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const impressions = (events || []).filter((e: any) => e.event_type === 'impression').length;
    const clicks = (events || []).filter((e: any) => e.event_type === 'click').length;
    const conversions = (events || []).filter((e: any) => e.event_type === 'conversion').length;
    const revenue = (events || [])
      .filter((e: any) => e.event_type === 'conversion')
      .reduce((acc: number, e: any) => acc + Number(e.revenue_amount || 0), 0);
    const cost = Number((campaign as any).budget || 0);
    const roiPercent = cost > 0 ? ((revenue - cost) / cost) * 100 : (revenue > 0 ? 100 : 0);

    return res.json({
      success: true,
      campaign,
      metrics: {
        impressions,
        clicks,
        conversions,
        conversion_rate: clicks > 0 ? (conversions / clicks) * 100 : 0,
        revenue,
        cost,
        roi_percent: roiPercent,
      },
    });
  } catch (error: any) {
    console.error('campaign roi error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/run-reminders', verifyAdmin, async (_req, res) => {
  try {
    const { data: completedOrders } = await supabase
      .from('orders')
      .select('id, user_id, created_at, products:product_id(duration)')
      .eq('status', 'completed')
      .limit(1000);

    let queued = 0;
    const now = Date.now();
    for (const o of completedOrders || []) {
      const months = durationToMonths((o as any).products?.duration);
      const expiry = new Date((o as any).created_at).getTime();
      const expiryAt = new Date(expiry);
      expiryAt.setMonth(expiryAt.getMonth() + months);
      const daysLeft = Math.ceil((expiryAt.getTime() - now) / (24 * 60 * 60 * 1000));
      const key = daysLeft === 7 ? 'expiry_7d' : daysLeft === 3 ? 'expiry_3d' : daysLeft === 1 ? 'expiry_1d' : null;
      if (!key) continue;

      const { data: existing } = await supabase
        .from('notification_queue')
        .select('id')
        .eq('order_id', (o as any).id)
        .eq('template_key', key)
        .maybeSingle();
      if (existing?.id) continue;

      const { error } = await supabase.from('notification_queue').insert({
        user_id: (o as any).user_id,
        order_id: (o as any).id,
        channel: 'in_app',
        template_key: key,
        payload: {
          message: `Your subscription expires in ${daysLeft} day${daysLeft > 1 ? 's' : ''}. Renew now in one tap.`,
          cta: '/orders',
        },
        status: 'pending',
        scheduled_for: new Date().toISOString(),
      });
      if (!error) queued++;
    }

    return res.json({ success: true, queued });
  } catch (error: any) {
    console.error('run reminders error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/subscription-health', verifyAdmin, async (req, res) => {
  try {
    const limit = Math.max(20, Math.min(500, Number(req.query.limit || 120)));
    const { data: orders } = await supabase
      .from('orders')
      .select('id, user_id, status, auto_renew, created_at, users:user_id(email, name), products:product_id(title, duration)')
      .in('status', ['completed', 'paid'])
      .order('created_at', { ascending: false })
      .limit(limit);

    const { data: paymentFails } = await supabase
      .from('payment_events')
      .select('user_id, event_type, created_at')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const failMap: Record<string, number> = {};
    for (const e of paymentFails || []) {
      const type = String((e as any).event_type || '').toLowerCase();
      if (!type.includes('fail') && !type.includes('error')) continue;
      const uid = (e as any).user_id;
      if (!uid) continue;
      failMap[uid] = (failMap[uid] || 0) + 1;
    }

    const now = Date.now();
    const rows = (orders || []).map((o: any) => {
      const months = durationToMonths(o.products?.duration);
      const expiry = new Date(o.created_at);
      expiry.setMonth(expiry.getMonth() + months);
      const daysLeft = Math.ceil((expiry.getTime() - now) / (24 * 60 * 60 * 1000));
      const userFails = failMap[o.user_id] || 0;

      let score = 100;
      const reasons: string[] = [];
      if (daysLeft <= 0) { score -= 65; reasons.push('expired'); }
      else if (daysLeft <= 3) { score -= 40; reasons.push('expiring_soon_3d'); }
      else if (daysLeft <= 7) { score -= 20; reasons.push('expiring_soon_7d'); }
      if (!o.auto_renew) { score -= 15; reasons.push('auto_renew_off'); }
      if (userFails >= 3) { score -= 20; reasons.push('payment_failures_recent'); }

      score = Math.max(0, Math.min(100, score));
      const label = score >= 75 ? 'healthy' : score >= 45 ? 'risk' : 'action_needed';
      return {
        order_id: o.id,
        user_id: o.user_id,
        user_name: o.users?.name || '',
        user_email: o.users?.email || '',
        product_title: o.products?.title || 'Unknown',
        auto_renew: !!o.auto_renew,
        days_left: daysLeft,
        score,
        label,
        reasons,
      };
    });

    return res.json({ success: true, rows });
  } catch (error: any) {
    console.error('subscription health error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/analytics/cohort-retention', verifyAdmin, async (req, res) => {
  try {
    const months = Math.max(1, Math.min(12, Number(req.query.months || 6)));
    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const { data: orders } = await supabase
      .from('orders')
      .select('id, user_id, created_at, status')
      .eq('status', 'completed')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true });

    const byUser: Record<string, Date[]> = {};
    for (const o of orders || []) {
      if (!o.user_id) continue;
      byUser[o.user_id] = byUser[o.user_id] || [];
      byUser[o.user_id].push(new Date(o.created_at));
    }

    const cohorts: Record<string, { users: number; retained30: number }> = {};
    for (const [uid, dates] of Object.entries(byUser)) {
      const first = dates[0];
      const cohortKey = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`;
      cohorts[cohortKey] = cohorts[cohortKey] || { users: 0, retained30: 0 };
      cohorts[cohortKey].users += 1;
      const retained = dates.some((d) => d.getTime() - first.getTime() >= 30 * 24 * 60 * 60 * 1000);
      if (retained) cohorts[cohortKey].retained30 += 1;
    }

    const rows = Object.entries(cohorts).map(([cohort, v]) => ({
      cohort,
      users: v.users,
      retained_30d: v.retained30,
      retention_30d_percent: v.users > 0 ? (v.retained30 / v.users) * 100 : 0,
    }));

    return res.json({ success: true, rows });
  } catch (error: any) {
    console.error('cohort retention error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/analytics/funnel', verifyAdmin, async (req, res) => {
  try {
    const days = Math.max(1, Math.min(90, Number(req.query.days || 30)));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const [funnelRes, paymentRes] = await Promise.all([
      supabase.from('funnel_events').select('event_type').gte('created_at', since),
      supabase.from('payment_events').select('event_type').gte('created_at', since),
    ]);

    const count = (arr: any[] | null | undefined, key: string) =>
      (arr || []).filter((x: any) => String(x.event_type || '').toLowerCase() === key).length;

    const storeView = count(funnelRes.data, 'store_view');
    const checkoutStart = count(funnelRes.data, 'checkout_start');
    const paymentInit = count(paymentRes.data, 'payment_init');
    const paid = count(paymentRes.data, 'payment_completed') + count(paymentRes.data, 'wallet_only_paid');

    return res.json({
      success: true,
      window_days: days,
      stages: {
        store_view: storeView,
        checkout_start: checkoutStart,
        payment_init: paymentInit,
        paid,
      },
      conversion: {
        store_to_checkout: storeView > 0 ? (checkoutStart / storeView) * 100 : 0,
        checkout_to_paid: checkoutStart > 0 ? (paid / checkoutStart) * 100 : 0,
        overall: storeView > 0 ? (paid / storeView) * 100 : 0,
      },
    });
  } catch (error: any) {
    console.error('funnel diagnostics error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/analytics/ltv', verifyAdmin, async (req, res) => {
  try {
    const limit = Math.max(20, Math.min(500, Number(req.query.limit || 100)));
    const { data: orders } = await supabase
      .from('orders')
      .select('user_id, total_amount, status')
      .in('status', ['completed', 'paid'])
      .limit(5000);

    const spendMap: Record<string, number> = {};
    for (const o of orders || []) {
      if (!o.user_id) continue;
      spendMap[o.user_id] = (spendMap[o.user_id] || 0) + Number(o.total_amount || 0);
    }
    const sorted = Object.entries(spendMap)
      .map(([user_id, ltv]) => ({ user_id, ltv }))
      .sort((a, b) => b.ltv - a.ltv)
      .slice(0, limit);

    return res.json({ success: true, rows: sorted });
  } catch (error: any) {
    console.error('ltv analytics error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.get('/ops/renewal-packs', verifyAdmin, async (req, res) => {
  try {
    const days = Math.max(1, Math.min(30, Number(req.query.days || 7)));
    const { data: orders } = await supabase
      .from('orders')
      .select('id, user_id, created_at, auto_renew, users:user_id(name, email), products:product_id(title, duration, price)')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1000);

    const now = Date.now();
    const rows: any[] = [];
    for (const o of orders || []) {
      const months = durationToMonths((o as any).products?.duration);
      const exp = new Date((o as any).created_at);
      exp.setMonth(exp.getMonth() + months);
      const daysLeft = Math.ceil((exp.getTime() - now) / (24 * 60 * 60 * 1000));
      if (daysLeft < 0 || daysLeft > days) continue;
      rows.push({
        order_id: (o as any).id,
        user_id: (o as any).user_id,
        user_name: (o as any).users?.name || '',
        user_email: (o as any).users?.email || '',
        product_title: (o as any).products?.title || 'Unknown',
        suggested_price: Number((o as any).products?.price || 0),
        days_left: daysLeft,
        auto_renew: !!(o as any).auto_renew,
      });
    }
    return res.json({ success: true, rows: rows.slice(0, 300) });
  } catch (error: any) {
    console.error('renewal packs error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/referral/process-order/:orderId', verifyAdmin, async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const maxRewardPerOrder = Math.max(10, Math.min(500, Number(req.body?.max_reward || 100)));

    const { data: order } = await supabase
      .from('orders')
      .select('id, user_id, total_amount, status')
      .eq('id', orderId)
      .single();
    if (!order || order.status !== 'completed') return res.status(400).json({ error: 'Order not eligible' });

    const { data: userRow } = await supabase
      .from('users')
      .select('id, referred_by_code')
      .eq('id', order.user_id)
      .single();
    const refCode = (userRow as any)?.referred_by_code;
    if (!refCode) return res.json({ success: true, skipped: 'No referred_by_code on user' });

    const { data: ownerCode } = await supabase
      .from('referral_codes')
      .select('owner_user_id, code, is_active')
      .eq('code', refCode)
      .single();
    if (!ownerCode?.is_active || !ownerCode.owner_user_id || ownerCode.owner_user_id === order.user_id) {
      return res.json({ success: true, skipped: 'Invalid referral source' });
    }

    const rewardAmount = Math.min(maxRewardPerOrder, Math.max(10, Math.round(Number(order.total_amount || 0) * 0.1)));
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const { data: dailyRewards } = await supabase
      .from('referral_rewards')
      .select('reward_amount')
      .eq('referrer_user_id', ownerCode.owner_user_id)
      .gte('created_at', todayStart.toISOString());
    const todayTotal = (dailyRewards || []).reduce((acc: number, r: any) => acc + Number(r.reward_amount || 0), 0);
    if (todayTotal + rewardAmount > 1000) {
      await supabase.from('risk_events').insert({
        user_id: ownerCode.owner_user_id,
        order_id: order.id,
        risk_type: 'referral_daily_cap_hit',
        severity: 'medium',
        message: 'Referral reward blocked by daily cap',
        meta: { attempted_reward: rewardAmount, daily_total: todayTotal },
      });
      return res.json({ success: true, skipped: 'Daily cap exceeded' });
    }

    const { error: rewardErr } = await supabase.from('referral_rewards').insert({
      referrer_user_id: ownerCode.owner_user_id,
      referee_user_id: order.user_id,
      source_order_id: order.id,
      reward_amount: rewardAmount,
      status: 'granted',
    });
    if (rewardErr) return res.json({ success: true, skipped: rewardErr.message });

    const { data: refWallet } = await supabase.from('users').select('wallet_balance').eq('id', ownerCode.owner_user_id).single();
    const { data: newWallet } = await supabase.from('users').select('wallet_balance').eq('id', order.user_id).single();
    await supabase.from('users').update({ wallet_balance: Number(refWallet?.wallet_balance || 0) + rewardAmount }).eq('id', ownerCode.owner_user_id);
    await supabase.from('users').update({ wallet_balance: Number(newWallet?.wallet_balance || 0) + rewardAmount }).eq('id', order.user_id);

    return res.json({ success: true, reward_amount: rewardAmount });
  } catch (error: any) {
    console.error('referral process error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/churn/run-campaign', verifyAdmin, async (req, res) => {
  try {
    const days = Math.max(1, Math.min(30, Number(req.body?.days || 7)));
    const inactiveDays = Math.max(3, Math.min(60, Number(req.body?.inactive_days || 14)));
    const now = Date.now();

    const [{ data: orders }, { data: activity }] = await Promise.all([
      supabase
        .from('orders')
        .select('id, user_id, created_at, status, products:product_id(duration)')
        .eq('status', 'completed')
        .limit(2000),
      supabase
        .from('user_activity_logs')
        .select('user_id, created_at')
        .gte('created_at', new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    const lastSeen: Record<string, number> = {};
    for (const a of activity || []) {
      if (!(a as any).user_id) continue;
      const ts = new Date((a as any).created_at).getTime();
      lastSeen[(a as any).user_id] = Math.max(lastSeen[(a as any).user_id] || 0, ts);
    }

    const targetUserIds = new Set<string>();
    for (const o of orders || []) {
      const uid = (o as any).user_id;
      if (!uid) continue;
      const exp = new Date((o as any).created_at);
      exp.setMonth(exp.getMonth() + durationToMonths((o as any).products?.duration));
      const daysLeft = Math.ceil((exp.getTime() - now) / (24 * 60 * 60 * 1000));
      if (daysLeft < 0 || daysLeft > days) continue;
      const seen = lastSeen[uid] || 0;
      const inactiveFor = seen ? Math.floor((now - seen) / (24 * 60 * 60 * 1000)) : 999;
      if (inactiveFor >= inactiveDays) targetUserIds.add(uid);
    }

    const rows = [...targetUserIds].map((uid) => ({
      user_id: uid,
      channel: 'in_app',
      template_key: 'churn_prevention_offer',
      payload: { message: 'We miss you! Renew now with a special offer.' },
      status: 'pending',
      scheduled_for: new Date().toISOString(),
    }));
    if (rows.length) await supabase.from('notification_queue').insert(rows);

    return res.json({ success: true, queued: rows.length });
  } catch (error: any) {
    console.error('churn campaign error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

router.post('/ops/process-notification-queue', verifyAdmin, async (req, res) => {
  try {
    const limit = Math.max(10, Math.min(500, Number(req.body?.limit || 200)));
    const nowIso = new Date().toISOString();

    const { data: jobs, error: fetchErr } = await supabase
      .from('notification_queue')
      .select('id, user_id, order_id, channel, template_key, payload, status, scheduled_for')
      .eq('status', 'pending')
      .or(`scheduled_for.is.null,scheduled_for.lte.${nowIso}`)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (fetchErr) throw fetchErr;

    let processed = 0;
    for (const job of jobs || []) {
      // v1 processor: mark as processed (in-app queue consumed)
      // Future: send email/sms providers per channel and then mark result.
      const { error: updateErr } = await supabase
        .from('notification_queue')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('id', (job as any).id)
        .eq('status', 'pending');
      if (!updateErr) processed++;
    }

    return res.json({ success: true, scanned: jobs?.length || 0, processed });
  } catch (error: any) {
    console.error('process notification queue error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

// Admin renew (Option A)
// Creates a new order linked to `renewed_from_order_id` and provisions fresh access.
// Body:
// - charge_wallet?: boolean (default true)
// - preserve_auto_renew?: boolean (default true)
router.post('/orders/:orderId/renew', verifyAdmin, async (req, res) => {
  try {
    const oldOrderId = req.params.orderId;
    const { charge_wallet = true, preserve_auto_renew = true } = req.body || {};

    if (!oldOrderId) return res.status(400).json({ success: false, error: 'orderId required' });

    const { data: oldOrder, error: oldErr } = await supabase
      .from('orders')
      .select(`
        id,
        user_id,
        product_id,
        status,
        payment_status,
        auto_renew,
        personal_email,
        created_at,
        renewed_from_order_id,
        products:product_id (
          id,
          is_personal,
          duration,
          price
        )
      `)
      .eq('id', oldOrderId)
      .single();

    if (oldErr || !oldOrder) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const product = (oldOrder as any).products;
    if (!product) return res.status(400).json({ success: false, error: 'Missing product' });

    const isPersonal = !!product.is_personal;
    const price = Number(product.price || 0);

    if (charge_wallet && price <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid product price for wallet charge' });
    }

    if (!['paid', 'completed'].includes(oldOrder.status)) {
      return res.status(400).json({ success: false, error: 'Order must be paid/completed to renew' });
    }

    // Create the new order first to know the ID for provisioning.
    // (If provisioning fails, we refund best-effort.)
    if (charge_wallet) {
      const { error: deductErr } = await supabase.rpc('deduct_wallet_balance', {
        p_user_id: oldOrder.user_id,
        p_amount: price,
      });
      if (deductErr) {
        return res.status(400).json({ success: false, error: 'Insufficient wallet balance' });
      }
    }

    const { data: created, error: createErr } = await supabase
      .from('orders')
      .insert({
        user_id: oldOrder.user_id,
        product_id: oldOrder.product_id,
        payment_method: charge_wallet ? 'wallet' : 'admin_renew',
        total_amount: price,
        status: 'completed',
        payment_status: 'paid',
        auto_renew: preserve_auto_renew ? !!oldOrder.auto_renew : false,
        personal_email: isPersonal ? oldOrder.personal_email : null,
        renewed_from_order_id: oldOrder.id,
      })
      .select()
      .single();

    if (createErr || !created) {
      // Refund best-effort if we already charged
      if (charge_wallet) {
        try {
          const { data: uRow } = await supabase.from('users').select('wallet_balance').eq('id', oldOrder.user_id).single();
          const current = Number((uRow as any)?.wallet_balance || 0);
          await supabase.from('users').update({ wallet_balance: current + price }).eq('id', oldOrder.user_id);
        } catch {}
      }
      return res.status(500).json({ success: false, error: 'Failed to create renewed order' });
    }

    // Prevent duplicate renewals from the old order auto-renew flag.
    await supabase.from('orders').update({ auto_renew: false }).eq('id', oldOrder.id);

    // Provision fresh access
    if (isPersonal) {
      const months = durationToMonths(product.duration);
      const email = oldOrder.personal_email;
      const { grantAdobeCloudAccess } = await import('../lib/adobeApi.js');
      const out = await grantAdobeCloudAccess(email, months);
      if (!out?.success) {
        if (charge_wallet) {
          try {
            const { data: uRow } = await supabase.from('users').select('wallet_balance').eq('id', oldOrder.user_id).single();
            const current = Number((uRow as any)?.wallet_balance || 0);
            await supabase.from('users').update({ wallet_balance: current + price }).eq('id', oldOrder.user_id);
          } catch {}
        }
        await supabase.from('orders').update({ status: 'refunded', payment_status: 'refunded' }).eq('id', created.id);
        return res.status(500).json({ success: false, error: out?.error || 'Personal provisioning failed' });
      }
    } else {
      const { data: assignRes, error: assignErr } = await supabase.rpc('assign_email_for_order_strict_24h', {
        p_order_id: created.id,
      });

      if (assignErr || !(assignRes as any)?.success) {
        if (charge_wallet) {
          try {
            const { data: uRow } = await supabase.from('users').select('wallet_balance').eq('id', oldOrder.user_id).single();
            const current = Number((uRow as any)?.wallet_balance || 0);
            await supabase.from('users').update({ wallet_balance: current + price }).eq('id', oldOrder.user_id);
          } catch {}
        }
        await supabase.from('orders').update({ status: 'refunded', payment_status: 'refunded' }).eq('id', created.id);
        return res.status(500).json({ success: false, error: (assignRes as any)?.error || assignErr?.message || 'Provisioning failed' });
      }
    }

    return res.json({ success: true, renewed_order_id: created.id });
  } catch (error: any) {
    console.error('Admin renew error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Internal server error' });
  }
});

export default router;