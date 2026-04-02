import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

export default router;