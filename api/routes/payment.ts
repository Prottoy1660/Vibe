import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { assignEmailForOrder } from '../lib/emailAssignment.js';

dotenv.config();

const router = express.Router();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const UDDOKTAPAY_API_KEY = process.env.UDDOKTAPAY_API_KEY || '';
const UDDOKTAPAY_BASE_URL = process.env.UDDOKTAPAY_BASE_URL || '';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function requireUser(req: any, res: any, next: any) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
    if (!token) return res.status(401).json({ success: false, message: 'Missing Authorization token' });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ success: false, message: 'Invalid token' });

    req.user = data.user;
    return next();
  } catch (e: any) {
    return res.status(401).json({ success: false, message: e?.message || 'Unauthorized' });
  }
}

async function computeOrderPricing(orderId: string) {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, user_id, product_id, status, payment_status, total_amount, products(price, is_personal, duration)')
    .eq('id', orderId)
    .single();
  if (orderError || !order) throw new Error('Order not found');

  const productPrice = Number((order as any).products?.price);
  if (!Number.isFinite(productPrice) || productPrice < 0) throw new Error('Invalid product price');

  return { order, productPrice };
}

async function getIdempotentResponse(userId: string, endpoint: string, idemKey: string) {
  const { data } = await supabase
    .from('payment_idempotency')
    .select('response_payload')
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .eq('idem_key', idemKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as any)?.response_payload || null;
}

async function saveIdempotentResponse(userId: string, endpoint: string, idemKey: string, payload: any) {
  await supabase.from('payment_idempotency').upsert({
    user_id: userId,
    endpoint,
    idem_key: idemKey,
    response_payload: payload,
  }, { onConflict: 'user_id,endpoint,idem_key' });
}

async function postUddoktaCheckout(payload: any) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${UDDOKTAPAY_BASE_URL}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'RT-UDDOKTAPAY-API-KEY': UDDOKTAPAY_API_KEY
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function logOrderEvent(orderId: string, userId: string | null, eventType: string, message: string, meta: any = {}) {
  try {
    await supabase.from('order_events').insert({
      order_id: orderId,
      user_id: userId,
      event_type: eventType,
      message,
      meta,
    });
  } catch {}
}

async function logPaymentEvent(orderId: string | null, userId: string | null, eventType: string, amount: number | null, message: string, meta: any = {}) {
  try {
    await supabase.from('payment_events').insert({
      order_id: orderId,
      user_id: userId,
      event_type: eventType,
      amount,
      gateway: 'uddoktapay',
      message,
      meta,
    });
  } catch {}
}

router.post('/create', requireUser, async (req, res) => {
  // --- Background Lazy Auto-Cleanup Task --- //
  // Silently destroy all pending/abandoned orders older than 30 minutes
  try {
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await supabase.from('orders').delete().eq('status', 'pending').lt('created_at', thirtyMinsAgo);
  } catch (err) {
    console.error('Scheduled lazy cleanup failed:', err);
  }
  // ----------------------------------------- //

  try {
    const { order_id, full_name, email, frontend_url, wallet_deduction } = req.body;
    if (!order_id) return res.status(400).json({ success: false, message: 'Missing order_id' });
    if (!full_name || typeof full_name !== 'string' || full_name.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Invalid full_name' });
    }
    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email' });
    }

    const user = (req as any).user;
    const { order, productPrice } = await computeOrderPricing(order_id);
    if (order.user_id !== user.id) {
      return res.status(403).json({ success: false, message: 'Order does not belong to user' });
    }

    // Dynamically get the base URL:
    // 1. Exact origin reported by the browser checkout page (Most reliable)
    // 2. Vercel environment variable
    // 3. Header-based origin
    const origin = req.headers.origin;
    const baseUrl = frontend_url || process.env.FRONTEND_URL || origin || 'https://vibeaccessbd.shop';

    // Server-side wallet deduction cap (never trust client)
    const requestedWallet = Number(wallet_deduction) || 0;
    const walletDeduction = Math.max(0, Math.min(productPrice, requestedWallet));
    const gatewayAmount = Math.max(0, productPrice - walletDeduction);
    const idempotencyKey = String(
      req.body?.idempotency_key ||
      `order:${order_id}:wallet:${walletDeduction}:due:${gatewayAmount}`
    );
    const cachedCreate = await getIdempotentResponse(user.id, 'payment_create', idempotencyKey);
    if (cachedCreate) {
      return res.json(cachedCreate);
    }
    await logOrderEvent(order_id, user.id, 'payment_init', 'Payment initialization started', {
      wallet_deduction: walletDeduction,
      gateway_amount: gatewayAmount,
    });
    await logPaymentEvent(order_id, user.id, 'payment_init', gatewayAmount, 'Payment initialization started', {
      wallet_deduction: walletDeduction,
    });

    if (!Number.isFinite(gatewayAmount)) {
      return res.status(400).json({ success: false, message: 'Invalid computed payment amount' });
    }

    // Normalize stored totals (server-side truth)
    try {
      await supabase
        .from('orders')
        .update({
          total_amount: productPrice,
          payment_method: gatewayAmount === 0 ? 'wallet' : (walletDeduction > 0 ? 'wallet+gateway' : 'gateway'),
        })
        .eq('id', order_id);
    } catch {}

    // Handle 100% wallet-paid orders
    if (gatewayAmount === 0) {
      console.log(`Processing free order: ${order_id}`);

      // If this order used wallet balance (full wallet payment), deduct it now.
      if (walletDeduction > 0) {
        const { error: deductErr } = await supabase.rpc('deduct_wallet_balance', {
          p_user_id: user.id,
          p_amount: walletDeduction,
        });
        if (deductErr) {
          return res.status(400).json({ success: false, message: 'Insufficient wallet balance.' });
        }
      }
      
      const { data: order } = await supabase.from('orders').select('*, products(is_personal, duration)').eq('id', order_id).single();
      if (order) {
        await supabase.from('orders').update({ status: 'paid', payment_status: 'paid' }).eq('id', order_id);
        
        if (order.products?.is_personal && order.personal_email) {
          try {
            const durationStr = order.products.duration.toLowerCase();
            let months = 1;
            if (durationStr.includes('year') || durationStr.includes('yr')) {
              const match = durationStr.match(/\d+/);
              months = match ? parseInt(match[0]) * 12 : 12;
            } else {
              const match = durationStr.match(/\d+/);
              months = match ? parseInt(match[0]) : 1;
            }
            const { grantAdobeCloudAccess } = await import('../lib/adobeApi.js');
            await grantAdobeCloudAccess(order.personal_email, months);
          } catch (err) {
            console.error('Error in personal subscription fulfillment (free):', err);
          }
        } else {
          const assignment = await assignEmailForOrder(supabase, order.id, order.user_id, order.product_id);
          if (!assignment.success) {
            await supabase.from('orders').update({ status: 'paid' }).eq('id', order.id);
            return res.status(500).json({
              success: false,
              error: assignment.error || 'Failed to assign an email for this order'
            });
          }
        }
        
        await supabase.from('orders').update({ status: 'completed' }).eq('id', order.id);
      }

      const payload = {
        success: true,
        payment_url: `${baseUrl}/adobe-email?payment=success&order_id=${order_id}`
      };
      await logOrderEvent(order_id, user.id, 'wallet_only_paid', 'Order paid by wallet only');
      await logPaymentEvent(order_id, user.id, 'wallet_only_paid', walletDeduction, 'Wallet-only order settled');
      await saveIdempotentResponse(user.id, 'payment_create', idempotencyKey, payload);
      return res.json(payload);
    }

    if (!UDDOKTAPAY_API_KEY || !UDDOKTAPAY_BASE_URL) {
      console.warn("UddoktaPay credentials not set. Simulating successful payment flow for dev.");
      
      // Simulate webhook logic for local dev since we can't receive real webhooks easily
      // In production, remove this block and let the actual webhook handle it
      const { data: order } = await supabase.from('orders').select('*, products(is_personal, duration)').eq('id', order_id).single();
      if (order) {
        await supabase.from('orders').update({ status: 'paid', payment_status: 'paid' }).eq('id', order_id);
        
        if (order.products?.is_personal && order.personal_email) {
          try {
            const durationStr = order.products.duration.toLowerCase();
            let months = 1;
            if (durationStr.includes('year') || durationStr.includes('yr')) {
              const match = durationStr.match(/\d+/);
              months = match ? parseInt(match[0]) * 12 : 12;
            } else {
              const match = durationStr.match(/\d+/);
              months = match ? parseInt(match[0]) : 1;
            }
            const { grantAdobeCloudAccess } = await import('../lib/adobeApi.js');
            await grantAdobeCloudAccess(order.personal_email, months);
          } catch (err) {
            console.error('Error in personal subscription fulfillment (dev):', err);
          }
        } else {
          const assignment = await assignEmailForOrder(supabase, order.id, order.user_id, order.product_id);
          if (!assignment.success) {
            await supabase.from('orders').update({ status: 'paid' }).eq('id', order.id);
            return res.status(500).json({
              success: false,
              error: assignment.error || 'Failed to assign an email for this order'
            });
          }
        }
        
        await supabase.from('orders').update({ status: 'completed' }).eq('id', order.id);
      }

      const payload = {
        success: true,
        payment_url: `${baseUrl}/adobe-email?payment=success&order_id=${order_id}`
      };
      await logOrderEvent(order_id, user.id, 'payment_simulated_dev', 'Payment simulated in dev mode');
      await logPaymentEvent(order_id, user.id, 'payment_simulated_dev', gatewayAmount, 'Payment simulated in dev mode');
      await saveIdempotentResponse(user.id, 'payment_create', idempotencyKey, payload);
      return res.json(payload);
    }

    const payload = {
      full_name,
      email,
      amount: gatewayAmount.toString(),
      metadata: {
        order_id,
        is_recharge: req.body.is_recharge || false,
        recharge_amount: req.body.recharge_amount || 0,
        user_id: user.id,
        wallet_deduction: walletDeduction
      },
      redirect_url: `${baseUrl}/adobe-email?payment=success`,
      cancel_url: `${baseUrl}/store?payment=cancelled`,
      webhook_url: `${baseUrl}/api/payment/webhook`
    };

    const response = await postUddoktaCheckout(payload);

    const data = await response.json() as any;

    if (data.status) {
      const successPayload = { success: true, payment_url: data.payment_url };
      await logPaymentEvent(order_id, user.id, 'payment_session_created', gatewayAmount, 'Gateway checkout session created');
      await saveIdempotentResponse(user.id, 'payment_create', idempotencyKey, successPayload);
      res.json(successPayload);
    } else {
      // Clean up the abandoned order from the DB using Service Role to bypass RLS
      if (order_id) {
        await supabase.from('orders').delete().eq('id', order_id);
      }
      await logPaymentEvent(order_id, user.id, 'payment_session_failed', gatewayAmount, data.message || 'Failed to generate payment URL');
      res.status(400).json({ success: false, message: data.message || 'Failed to generate payment URL' });
    }

  } catch (error: any) {
    console.error('Error creating payment:', error);
    // Attempt cleanup if exception occurred
    if (req.body?.order_id) {
      try {
        await supabase.from('orders').delete().eq('id', req.body.order_id);
      } catch (cleanupErr) {
        console.error('Failed to cleanup on exception:', cleanupErr);
      }
    }
    await logPaymentEvent(req.body?.order_id || null, (req as any)?.user?.id || null, 'payment_create_error', null, error?.message || 'payment create error');
    res.status(500).json({
      success: false,
      message: error?.message || 'Internal server error',
      error: error?.message || 'Internal server error'
    });
  }
});

router.post('/recharge', requireUser, async (req, res) => {
  try {
    const { amount, full_name, email, frontend_url } = req.body;
    const user = (req as any).user;

    const origin = req.headers.origin;
    const baseUrl = frontend_url || process.env.FRONTEND_URL || origin || 'https://vibeaccessbd.shop';

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid recharge parameters' });
    }
    const normalizedAmount = Number(amount);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0 || normalizedAmount > 100000) {
      return res.status(400).json({ success: false, message: 'Recharge amount out of allowed range' });
    }
    if (email && (typeof email !== 'string' || !isValidEmail(email))) {
      return res.status(400).json({ success: false, message: 'Invalid email' });
    }

    const idempotencyKey = String(req.body?.idempotency_key || `recharge:${user.id}:${normalizedAmount}`);
    const cachedRecharge = await getIdempotentResponse(user.id, 'payment_recharge', idempotencyKey);
    if (cachedRecharge) {
      return res.json(cachedRecharge);
    }
    await logPaymentEvent(null, user.id, 'recharge_init', normalizedAmount, 'Recharge initialization started');

    if (!UDDOKTAPAY_API_KEY || !UDDOKTAPAY_BASE_URL) {
      console.warn("UddoktaPay credentials not set. Simulating successful wallet recharge for dev.");
      
      const { data: userData } = await supabase.from('users').select('wallet_balance').eq('id', user.id).single();
      const currentBalance = Number(userData?.wallet_balance) || 0;
      await supabase.from('users').update({ wallet_balance: currentBalance + normalizedAmount }).eq('id', user.id);

      const payload = {
        success: true,
        payment_url: `${baseUrl}/?recharge=success`
      };
      await logPaymentEvent(null, user.id, 'recharge_completed_dev', normalizedAmount, 'Recharge simulated in dev mode');
      await saveIdempotentResponse(user.id, 'payment_recharge', idempotencyKey, payload);
      return res.json(payload);
    }

    // Creating abstract random ID to uniquely identify this standalone transaction log if needed
    const recharge_id = `rech_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const payload = {
      full_name: full_name || 'Customer',
      email: email || 'user@example.com',
      amount: amount.toString(),
      metadata: {
        is_standalone_recharge: true,
        user_id: user.id,
        recharge_amount: normalizedAmount,
        recharge_id
      },
      cancel_url: `${baseUrl}/?recharge=cancelled`,
      redirect_url: `${baseUrl}/?recharge=success`,
      webhook_url: `${baseUrl}/api/payment/webhook`
    };

    const response = await postUddoktaCheckout(payload);

    const data = await response.json() as any;

    if (data.status) {
      const successPayload = { success: true, payment_url: data.payment_url };
      await logPaymentEvent(null, user.id, 'recharge_session_created', normalizedAmount, 'Recharge session created');
      await saveIdempotentResponse(user.id, 'payment_recharge', idempotencyKey, successPayload);
      res.json(successPayload);
    } else {
      await logPaymentEvent(null, user.id, 'recharge_session_failed', normalizedAmount, data.message || 'Failed to generate recharge URL');
      res.status(400).json({ success: false, message: data.message || 'Failed to generate recharge URL' });
    }

  } catch (error) {
    console.error('Error creating recharge session:', error);
    await logPaymentEvent(null, (req as any)?.user?.id || null, 'recharge_error', null, (error as any)?.message || 'Recharge server error');
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/webhook', async (req, res) => {
  // --- Background Lazy Auto-Cleanup Task --- //
  try {
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await supabase.from('orders').delete().eq('status', 'pending').lt('created_at', thirtyMinsAgo);
  } catch (err) {}
  // ----------------------------------------- //

  try {
    const { metadata, status, amount } = req.body;
    
    const headerApiKey = req.headers['rt-uddoktapay-api-key'];
    if (UDDOKTAPAY_API_KEY && headerApiKey !== UDDOKTAPAY_API_KEY) {
       return res.status(401).json({ error: 'Unauthorized' });
    }

    if (status === 'COMPLETED') {
      // Standalone wallet recharge has no order_id, so handle it first.
      // Otherwise, the order update path below can fail and skip wallet credit.
      if (metadata?.is_standalone_recharge && metadata?.user_id && Number(metadata?.recharge_amount) > 0) {
        try {
          const rechargeAmount = Number(metadata.recharge_amount);
          const { data: userData } = await supabase
            .from('users')
            .select('wallet_balance')
            .eq('id', metadata.user_id)
            .single();

          const currentBalance = Number(userData?.wallet_balance) || 0;
          const newBalance = currentBalance + rechargeAmount;

          const { error: walletUpdateError } = await supabase
            .from('users')
            .update({ wallet_balance: newBalance })
            .eq('id', metadata.user_id);

          if (walletUpdateError) throw walletUpdateError;

          console.log(
            `Successfully standalone recharged wallet for user ${metadata.user_id} with amount ${rechargeAmount}`
          );
          await logPaymentEvent(null, metadata.user_id, 'recharge_completed', rechargeAmount, 'Standalone recharge completed');
          return res.status(200).json({ received: true });
        } catch (walletErr) {
          console.error('Error standalone recharging user wallet via webhook:', walletErr);
          await logPaymentEvent(null, metadata?.user_id || null, 'recharge_failed', Number(metadata?.recharge_amount) || null, 'Standalone recharge failed');
          return res.status(500).json({ error: 'Failed to process standalone recharge' });
        }
      }

      const orderId = metadata?.order_id;
      if (!orderId) {
        return res.status(400).json({ error: 'Missing order_id for order payment webhook' });
      }

      const walletDeduction = Number(metadata?.wallet_deduction) || 0;
      const orderUserId = metadata?.user_id;
      const gatewayPaid = Number(amount);

      // If gateway provides amount, ensure it is not lower than expected due amount.
      const { data: payableOrder } = await supabase
        .from('orders')
        .select('id, total_amount')
        .eq('id', orderId)
        .single();
      const expectedTotal = Number(payableOrder?.total_amount) || 0;
      const expectedGatewayDue = Math.max(0, expectedTotal - walletDeduction);
      if (Number.isFinite(gatewayPaid) && gatewayPaid + 0.0001 < expectedGatewayDue) {
        await logPaymentEvent(orderId, orderUserId || null, 'payment_failed_underpaid', gatewayPaid, 'Gateway paid lower than expected due');
        return res.status(400).json({ error: 'Gateway paid amount is lower than expected due amount' });
      }

      const { data: existingOrder } = await supabase
        .from('orders')
        .select('id, status, payment_status')
        .eq('id', orderId)
        .single();

      // Idempotency guard for repeated callbacks.
      if (existingOrder?.payment_status === 'paid' && existingOrder?.status === 'completed') {
        return res.status(200).json({ received: true });
      }

      // For mixed checkout, deduct wallet part only after gateway confirms completion.
      if (walletDeduction > 0 && orderUserId) {
        const { error: deductErr } = await supabase.rpc('deduct_wallet_balance', {
          p_user_id: orderUserId,
          p_amount: walletDeduction,
        });
        if (deductErr) {
          await logPaymentEvent(orderId, orderUserId, 'payment_failed_wallet_insufficient', walletDeduction, 'Insufficient wallet balance during settlement');
          return res.status(400).json({ error: 'Insufficient wallet balance during mixed-payment settlement' });
        }
      }
      
      const { error: updateError } = await supabase
        .from('orders')
        .update({ status: 'paid', payment_status: 'paid' })
        .eq('id', orderId);

      if (updateError) throw updateError;

      const { data: order } = await supabase
        .from('orders')
        .select('*, products(is_personal, duration)')
        .eq('id', orderId)
        .single();

      if (order) {
        await logPaymentEvent(order.id, order.user_id, 'payment_completed', gatewayPaid || expectedGatewayDue, 'Payment webhook completed');
        await logOrderEvent(order.id, order.user_id, 'payment_completed', 'Payment confirmed by webhook');
        if (order.products?.is_personal && order.personal_email) {
          try {
            // Calculate duration in months
            const durationStr = order.products.duration.toLowerCase();
            let months = 1;
            if (durationStr.includes('year') || durationStr.includes('yr')) {
              const match = durationStr.match(/\d+/);
              months = match ? parseInt(match[0]) * 12 : 12;
            } else {
              const match = durationStr.match(/\d+/);
              months = match ? parseInt(match[0]) : 1;
            }

            const { grantAdobeCloudAccess } = await import('../lib/adobeApi.js');
            const res = await grantAdobeCloudAccess(order.personal_email, months);
            
            if (res.success) {
              console.log(`Successfully granted Adobe Cloud Access for personal email: ${order.personal_email}`);
              await logOrderEvent(order.id, order.user_id, 'provisioning_completed', 'Personal Adobe access provisioned');
            } else {
              console.error(`Failed to grant Adobe Cloud Access: ${res.error}`);
              // Note: You could potentially mark order as 'failed' here, but keeping 'completed' 
              // and letting admin handle retry might be safer depending on business logic.
            }
          } catch (err) {
            console.error('Error in personal subscription fulfillment:', err);
          }
        } else {
          // Use product-aware email assignment (respects email_slots & max_users_per_email)
          const assignment = await assignEmailForOrder(supabase, order.id, order.user_id, order.product_id);
          if (!assignment.success) {
            console.error(
              `[payment/webhook] Email assignment failed for order ${order.id}: ${assignment.error || 'Unknown error'}`
            );
            await supabase.from('orders').update({ status: 'paid' }).eq('id', order.id);
            await logOrderEvent(order.id, order.user_id, 'provisioning_failed', assignment.error || 'Email assignment failed');
            return res.status(500).json({ error: assignment.error || 'Email assignment failed' });
          }
          await logOrderEvent(order.id, order.user_id, 'provisioning_completed', 'Assigned product email successfully');
        }

        // Mark order as completed
        await supabase.from('orders').update({ status: 'completed' }).eq('id', order.id);
        await logOrderEvent(order.id, order.user_id, 'order_completed', 'Order moved to completed');
      }
      
      // Legacy fallback for order metadata recharge fields.
      if (metadata.is_recharge && metadata.recharge_amount > 0 && order?.user_id) {
        // Legacy fallback for old orders that might still be processing
        try {
          const { data: userData } = await supabase.from('users').select('wallet_balance').eq('id', order.user_id).single();
          const currentBalance = Number(userData?.wallet_balance) || 0;
          await supabase.from('users').update({ wallet_balance: currentBalance + Number(metadata.recharge_amount) }).eq('id', order.user_id);
        } catch (walletErr) {
          console.error(walletErr);
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    await logPaymentEvent((req.body as any)?.metadata?.order_id || null, (req.body as any)?.metadata?.user_id || null, 'webhook_error', null, (error as any)?.message || 'Webhook error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/assign-email', async (req, res) => {
  try {
    const { order_id } = req.body;
    if (!order_id) {
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }

    // Securely lookup the order bypassing RLS to ensure we can read all details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, products(id, email_slots, max_users_per_email)')
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Ensure order is paid/completed before generating/assigning
    if (order.status !== 'completed' && order.status !== 'paid') {
      return res.status(400).json({ success: false, message: 'Order is not completed' });
    }

    // Optional: check max generation limits if you want, but the smart backend respects shared slots natively
    const result = await assignEmailForOrder(supabase, order.id, order.user_id, order.product_id);
    
    if (result.success) {
      return res.json({ success: true, message: 'Email assigned successfully' });
    } else {
      return res.status(500).json({ success: false, message: result.error || 'Failed to assign email' });
    }

  } catch (error: any) {
    console.error('Manual assign-email error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

export default router;
