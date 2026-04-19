import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { assignEmailForOrder } from '../lib/emailAssignment.js';
import { productDurationToMonths } from '../lib/productDuration.js';
import { tryProcessReferralRewardsForOrder } from '../lib/referralEngine.js';
import { getUddoktaPayCredentialsCached } from '../lib/uddoktapaySettings.js';
import { getBkashTokenizedCredentialsCached } from '../lib/bkashTokenizedSettings.js';
import { bkashGrantToken, bkashPostJson } from '../lib/bkashTokenizedClient.js';

dotenv.config();

const router = express.Router();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function requireUser(req: any, res: any, next: any) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
    if (!token || token === 'undefined') {
      return res.status(401).json({ success: false, message: 'Missing Authorization token' });
    }

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
    .select('id, user_id, product_id, status, payment_status, total_amount, coupon_id, payment_method, products(price, is_personal, duration)')
    .eq('id', orderId)
    .single();
  if (orderError || !order) throw new Error('Order not found');

  const productPrice = Number((order as any).products?.price);
  if (!Number.isFinite(productPrice) || productPrice < 0) throw new Error('Invalid product price');

  return { order, productPrice };
}

/** Server-side payable amount: trust order.total_amount only when it matches list price or verified coupon discount. */
async function resolvePayableTotal(order: any, productPrice: number): Promise<{ ok: true; payableTotal: number } | { ok: false; message: string }> {
  const stored = Math.round(Number(order.total_amount) * 100) / 100;
  if (!Number.isFinite(stored) || stored < 0) {
    return { ok: false, message: 'Invalid order total' };
  }
  if (stored > Math.round(productPrice * 100) / 100 + 0.01) {
    return { ok: false, message: 'Order total exceeds product price' };
  }

  const fullPrice = Math.round(productPrice * 100) / 100;
  const isFullPrice = Math.abs(stored - fullPrice) <= 0.02;

  if (isFullPrice) {
    if (order.coupon_id) {
      return { ok: false, message: 'Order total does not match coupon' };
    }
    return { ok: true, payableTotal: fullPrice };
  }

  if (!order.coupon_id) {
    return { ok: false, message: 'Discounted orders require a valid coupon on the order' };
  }

  const { data: couponRow, error: cErr } = await supabase
    .from('coupons')
    .select('id, discount_percentage, is_active, expires_at, usage_limit, used_count')
    .eq('id', order.coupon_id)
    .single();

  if (cErr || !couponRow || !couponRow.is_active) {
    return { ok: false, message: 'Invalid or inactive coupon' };
  }
  if (couponRow.expires_at && new Date(couponRow.expires_at) < new Date()) {
    return { ok: false, message: 'Coupon has expired' };
  }
  if (couponRow.usage_limit > 0 && couponRow.used_count >= couponRow.usage_limit) {
    return { ok: false, message: 'Coupon usage limit reached' };
  }

  const pct = Number(couponRow.discount_percentage);
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
    return { ok: false, message: 'Invalid coupon discount' };
  }

  const expected = Math.round(productPrice * (1 - pct / 100) * 100) / 100;
  if (Math.abs(expected - stored) > 0.02) {
    return { ok: false, message: 'Order total does not match coupon discount' };
  }

  return { ok: true, payableTotal: expected };
}

async function incrementCouponUsedIfPresent(order: any) {
  const couponId = order?.coupon_id;
  if (!couponId) return;
  try {
    const { data: row } = await supabase.from('coupons').select('used_count, usage_limit').eq('id', couponId).single();
    if (!row) return;
    if (row.usage_limit > 0 && row.used_count >= row.usage_limit) return;
    await supabase.from('coupons').update({ used_count: (row.used_count || 0) + 1 }).eq('id', couponId);
  } catch (e) {
    console.error('incrementCouponUsedIfPresent:', e);
  }
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

async function postUddoktaCheckout(
  payload: any,
  creds: { apiKey: string; baseUrl: string },
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${creds.baseUrl}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'RT-UDDOKTAPAY-API-KEY': creds.apiKey,
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

async function logPaymentEvent(
  orderId: string | null,
  userId: string | null,
  eventType: string,
  amount: number | null,
  message: string,
  meta: any = {},
  gateway: string = 'uddoktapay',
) {
  try {
    await supabase.from('payment_events').insert({
      order_id: orderId,
      user_id: userId,
      event_type: eventType,
      amount,
      gateway,
      message,
      meta,
    });
  } catch {}
}

/** When false, new personal-plan purchases and wallet auto-renew for personal products are blocked (system_settings.personal_subscriptions). */
async function isPersonalSubscriptionsEnabled(): Promise<boolean> {
  const { data } = await supabase.from('system_settings').select('value').eq('key', 'personal_subscriptions').maybeSingle();
  const v = (data?.value || {}) as { enabled?: boolean };
  return v.enabled !== false;
}

/** Grant reseller Adobe access for personal orders; logs failures to order_events for admin visibility. */
async function fulfillPersonalAdobeAccess(order: {
  id: string;
  user_id: string;
  personal_email: string | null;
  products?: { duration?: string | null } | null;
}) {
  const email = order.personal_email?.trim();
  if (!email) return;
  const months = productDurationToMonths(order.products?.duration ?? null);
  try {
    const { grantAdobeCloudAccess } = await import('../lib/adobeApi.js');
    const { data: adobeCfgRow } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'adobe_api_config')
      .maybeSingle();
    const adobeCfg = (adobeCfgRow?.value || {}) as { organizationId?: number; products?: string[] };

    const grantOut = await grantAdobeCloudAccess(email, months, {
      organizationId: adobeCfg.organizationId,
      products: adobeCfg.products,
    });
    if (grantOut.success) {
      console.log(`Successfully granted Adobe Cloud Access for personal email: ${email}`);
      await logOrderEvent(order.id, order.user_id, 'provisioning_completed', 'Personal Adobe access provisioned');
    } else {
      console.error(`Failed to grant Adobe Cloud Access: ${grantOut.error}`);
      await logOrderEvent(order.id, order.user_id, 'provisioning_failed', grantOut.error || 'Adobe API rejected provisioning');
    }
  } catch (err) {
    console.error('Error in personal subscription fulfillment:', err);
    await logOrderEvent(
      order.id,
      order.user_id,
      'provisioning_failed',
      err instanceof Error ? err.message : 'Personal Adobe fulfillment error',
    );
  }
}

/** Shared settlement after gateway confirms payment (UddoktaPay webhook or bKash execute). */
async function settleOrderAfterGatewayPayment(params: {
  orderId: string;
  orderUserId: string;
  walletDeduction: number;
  gatewayPaid: number;
  gatewayLabel: string;
}): Promise<{ ok: true } | { ok: false; statusCode: number; publicMessage: string }> {
  const { orderId, orderUserId, walletDeduction, gatewayPaid, gatewayLabel } = params;

  const { data: payableOrder } = await supabase.from('orders').select('id, total_amount').eq('id', orderId).single();
  const expectedTotal = Number(payableOrder?.total_amount) || 0;
  const expectedGatewayDue = Math.max(0, expectedTotal - walletDeduction);
  if (Number.isFinite(gatewayPaid) && gatewayPaid + 0.0001 < expectedGatewayDue) {
    await logPaymentEvent(
      orderId,
      orderUserId || null,
      'payment_failed_underpaid',
      gatewayPaid,
      'Gateway paid lower than expected due',
      {},
      gatewayLabel,
    );
    return { ok: false, statusCode: 400, publicMessage: 'Paid amount is lower than expected due amount.' };
  }

  const { data: existingOrder } = await supabase
    .from('orders')
    .select('id, status, payment_status')
    .eq('id', orderId)
    .single();

  if (existingOrder?.payment_status === 'paid' && existingOrder?.status === 'completed') {
    return { ok: true };
  }

  if (walletDeduction > 0 && orderUserId) {
    const { error: deductErr } = await supabase.rpc('deduct_subscription_wallet_combined', {
      p_user_id: orderUserId,
      p_amount: walletDeduction,
    });
    if (deductErr) {
      await logPaymentEvent(
        orderId,
        orderUserId,
        'payment_failed_wallet_insufficient',
        walletDeduction,
        'Insufficient wallet balance during settlement',
        {},
        gatewayLabel,
      );
      return { ok: false, statusCode: 400, publicMessage: 'Insufficient wallet balance during mixed-payment settlement.' };
    }
  }

  const { error: updateError } = await supabase.from('orders').update({ status: 'paid', payment_status: 'paid' }).eq('id', orderId);
  if (updateError) {
    return { ok: false, statusCode: 500, publicMessage: 'Failed to update order status.' };
  }

  const { data: order } = await supabase.from('orders').select('*, products(is_personal, duration)').eq('id', orderId).single();

  if (order) {
    await logPaymentEvent(
      order.id,
      order.user_id,
      'payment_completed',
      gatewayPaid || expectedGatewayDue,
      `Payment confirmed (${gatewayLabel})`,
      {},
      gatewayLabel,
    );
    await logOrderEvent(order.id, order.user_id, 'payment_completed', 'Payment confirmed');
    if (order.products?.is_personal && order.personal_email) {
      await fulfillPersonalAdobeAccess(order);
    } else {
      const assignment = await assignEmailForOrder(supabase, order.id, order.user_id, order.product_id);
      if (!assignment.success) {
        console.error(`[settleOrderAfterGatewayPayment] Email assignment failed for order ${order.id}: ${assignment.error || 'Unknown'}`);
        await supabase.from('orders').update({ status: 'paid' }).eq('id', order.id);
        await logOrderEvent(order.id, order.user_id, 'provisioning_failed', assignment.error || 'Email assignment failed');
        return { ok: false, statusCode: 500, publicMessage: assignment.error || 'Email assignment failed' };
      }
      await logOrderEvent(order.id, order.user_id, 'provisioning_completed', 'Assigned product email successfully');
    }

    await supabase.from('orders').update({ status: 'completed' }).eq('id', order.id);
    await logOrderEvent(order.id, order.user_id, 'order_completed', 'Order moved to completed');
    await incrementCouponUsedIfPresent(order);
    try {
      await tryProcessReferralRewardsForOrder(supabase, order.id);
    } catch (e) {
      console.error('referral processing (settle):', e);
    }
  }

  return { ok: true };
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
    const paymentGateway = String(req.body?.gateway || 'uddoktapay').toLowerCase().trim();
    const { order, productPrice } = await computeOrderPricing(order_id);
    if (order.user_id !== user.id) {
      return res.status(403).json({ success: false, message: 'Order does not belong to user' });
    }

    const personalOk = await isPersonalSubscriptionsEnabled();
    if ((order as any).products?.is_personal && !personalOk) {
      await supabase.from('orders').delete().eq('id', order_id);
      return res.status(400).json({
        success: false,
        message: 'Personal Adobe subscriptions are not available right now. Please choose a team plan or try again later.',
      });
    }

    // Dynamically get the base URL:
    // 1. Exact origin reported by the browser checkout page (Most reliable)
    // 2. Vercel environment variable
    // 3. Header-based origin
    const origin = req.headers.origin;
    const baseUrl = frontend_url || process.env.FRONTEND_URL || origin || 'https://vibeaccessbd.com';

    if ((order as any).status === 'completed' && (order as any).payment_status === 'paid') {
      const payload = {
        success: true,
        payment_url: `${baseUrl}/adobe-email?payment=success&order_id=${order_id}`,
      };
      return res.json(payload);
    }

    const payableResolved = await resolvePayableTotal(order, productPrice);
    if (payableResolved.ok === false) {
      return res.status(400).json({ success: false, message: payableResolved.message });
    }
    const payableTotal = payableResolved.payableTotal;

    // Server-side wallet deduction cap (never trust client) — cap to payable line total, not full list price
    const requestedWallet = Number(wallet_deduction) || 0;
    const walletDeduction = Math.max(0, Math.min(payableTotal, requestedWallet));
    const gatewayAmount = Math.max(0, payableTotal - walletDeduction);
    const idempotencyKey = String(
      req.body?.idempotency_key ||
        `order:${order_id}:gw:${paymentGateway}:wallet:${walletDeduction}:due:${gatewayAmount}`,
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

    if (gatewayAmount > 0 && paymentGateway !== 'uddoktapay' && paymentGateway !== 'bkash_tokenized') {
      return res.status(400).json({ success: false, message: 'Invalid payment gateway.' });
    }

    if (walletDeduction > 0) {
      const { data: wb } = await supabase
        .from('users')
        .select('wallet_balance, wallet_promotional_balance')
        .eq('id', user.id)
        .single();
      const totalSpendable =
        Number((wb as any)?.wallet_balance || 0) + Number((wb as any)?.wallet_promotional_balance || 0);
      if (walletDeduction > totalSpendable + 0.001) {
        return res.status(400).json({ success: false, message: 'Insufficient wallet balance.' });
      }
    }

    // Persist normalized payable total (never replace a coupon line with full list price)
    try {
      const gwTag = paymentGateway === 'bkash_tokenized' ? 'bkash_tokenized' : 'gateway';
      const paymentMethodResolved =
        gatewayAmount > 0
          ? walletDeduction > 0
            ? `wallet+${gwTag}`
            : gwTag
          : walletDeduction > 0
            ? 'wallet'
            : (order as any).coupon_id
              ? 'coupon'
              : payableTotal <= 0
                ? 'free'
                : 'wallet';
      await supabase
        .from('orders')
        .update({
          total_amount: payableTotal,
          payment_method: paymentMethodResolved,
        })
        .eq('id', order_id);
    } catch {}

    // Handle zero gateway due (100% coupon, wallet-only, or free list price)
    if (gatewayAmount === 0) {
      console.log(`Processing free order: ${order_id}`);

      // If this order used wallet balance (full wallet payment), deduct it now.
      if (walletDeduction > 0) {
        const { error: deductErr } = await supabase.rpc('deduct_subscription_wallet_combined', {
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
          await fulfillPersonalAdobeAccess(order);
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
        await incrementCouponUsedIfPresent(order);
        try {
          await tryProcessReferralRewardsForOrder(supabase, order.id);
        } catch (e) {
          console.error('referral processing (wallet-only):', e);
        }
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

    const isLocalhost = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');
    const baseOrigin = (() => {
      try {
        const raw = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
        return new URL(raw).origin;
      } catch {
        return String(baseUrl).replace(/\/$/, '');
      }
    })();

    if (paymentGateway === 'bkash_tokenized') {
      const bkashCreds = await getBkashTokenizedCredentialsCached(supabase);
      if (isLocalhost) {
        console.warn('bKash tokenized dev mode: Simulating successful payment on localhost.');
        const { data: orderSim } = await supabase
          .from('orders')
          .select('*, products(is_personal, duration)')
          .eq('id', order_id)
          .single();
        if (orderSim) {
          await supabase.from('orders').update({ status: 'paid', payment_status: 'paid' }).eq('id', order_id);
          if (orderSim.products?.is_personal && orderSim.personal_email) {
            await fulfillPersonalAdobeAccess(orderSim);
          } else {
            const assignment = await assignEmailForOrder(supabase, orderSim.id, orderSim.user_id, orderSim.product_id);
            if (!assignment.success) {
              await supabase.from('orders').update({ status: 'paid' }).eq('id', orderSim.id);
              return res.status(500).json({
                success: false,
                error: assignment.error || 'Failed to assign an email for this order',
              });
            }
          }
          await supabase.from('orders').update({ status: 'completed' }).eq('id', order_id);
          await incrementCouponUsedIfPresent(orderSim);
          try {
            await tryProcessReferralRewardsForOrder(supabase, orderSim.id);
          } catch (e) {
            console.error('referral processing (bkash dev sim):', e);
          }
        }
        const payload = {
          success: true,
          payment_url: `${baseUrl}/adobe-email?payment=success&order_id=${order_id}`,
        };
        await logOrderEvent(order_id, user.id, 'payment_simulated_dev', 'bKash tokenized payment simulated in dev mode');
        await logPaymentEvent(
          order_id,
          user.id,
          'payment_simulated_dev',
          gatewayAmount,
          'Payment simulated in dev mode',
          {},
          'bkash_tokenized',
        );
        await saveIdempotentResponse(user.id, 'payment_create', idempotencyKey, payload);
        return res.json(payload);
      }

      if (!bkashCreds) {
        await supabase.from('orders').delete().eq('id', order_id);
        return res.status(503).json({
          success: false,
          message: 'bKash tokenized checkout is not configured. Ask an admin to add credentials or set server environment variables.',
        });
      }

      const { data: urow } = await supabase.from('users').select('bkash_agreement_id, phone').eq('id', user.id).single();
      const agreementId = typeof urow?.bkash_agreement_id === 'string' ? urow.bkash_agreement_id.trim() : '';
      if (!agreementId) {
        return res.status(400).json({
          success: false,
          needs_bkash_agreement: true,
          message: 'Link your bKash wallet once (tokenized agreement), then you can pay with PIN only.',
        });
      }

      const digitsPhone = String(urow?.phone || '').replace(/\D/g, '').slice(0, 255);
      const payerReference =
        digitsPhone.length >= 10 ? digitsPhone : `u${String(user.id).replace(/-/g, '').slice(0, 24)}`;
      const callbackURL = `${baseOrigin}/bkash-return`;
      const merchantInvoiceNumber = `V${Date.now()}${String(order_id).replace(/-/g, '').slice(0, 12)}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 255);

      const idToken = await bkashGrantToken(bkashCreds);
      const amountStr =
        gatewayAmount % 1 === 0 ? String(Math.round(gatewayAmount)) : gatewayAmount.toFixed(2);
      const createBody: Record<string, unknown> = {
        mode: '0001',
        payerReference,
        callbackURL,
        agreementID: agreementId,
        amount: amountStr,
        currency: 'BDT',
        intent: 'sale',
        merchantInvoiceNumber,
      };

      const created = await bkashPostJson(bkashCreds, '/checkout/create', idToken, createBody);
      if (String(created.statusCode || '') !== '0000' || !created.bkashURL) {
        await logPaymentEvent(
          order_id,
          user.id,
          'bkash_create_failed',
          gatewayAmount,
          String(created.statusMessage || created.errorMessage || 'bKash create failed'),
          { raw: created },
          'bkash_tokenized',
        );
        await supabase.from('orders').delete().eq('id', order_id);
        return res.status(400).json({
          success: false,
          message: String(created.errorMessage || created.statusMessage || 'bKash could not start payment.'),
        });
      }

      const paymentId = String(created.paymentID || '').trim();
      if (!paymentId) {
        await supabase.from('orders').delete().eq('id', order_id);
        return res.status(500).json({ success: false, message: 'bKash did not return paymentID.' });
      }

      const { error: pendErr } = await supabase.from('bkash_pending_sessions').insert({
        payment_id: paymentId,
        user_id: user.id,
        flow: 'checkout',
        order_id,
        wallet_deduction: walletDeduction,
        gateway_amount: gatewayAmount,
        merchant_invoice: merchantInvoiceNumber,
      });
      if (pendErr) {
        console.error('bkash_pending_sessions insert:', pendErr);
        await supabase.from('orders').delete().eq('id', order_id);
        return res.status(500).json({ success: false, message: 'Could not store payment session.' });
      }

      await logPaymentEvent(
        order_id,
        user.id,
        'bkash_session_created',
        gatewayAmount,
        'bKash tokenized checkout session created',
        { payment_id: paymentId },
        'bkash_tokenized',
      );
      const successPayload = { success: true, payment_url: String(created.bkashURL) };
      await saveIdempotentResponse(user.id, 'payment_create', idempotencyKey, successPayload);
      return res.json(successPayload);
    }

    const uddoktaCreds = await getUddoktaPayCredentialsCached(supabase);
    if (!uddoktaCreds.apiKey || !uddoktaCreds.baseUrl || isLocalhost) {
      console.warn("UddoktaPay dev mode: Simulating successful payment flow for dev/localhost.");
      
      // Simulate webhook logic for local dev since we can't receive real webhooks easily
      // In production, remove this block and let the actual webhook handle it
      const { data: order } = await supabase.from('orders').select('*, products(is_personal, duration)').eq('id', order_id).single();
      if (order) {
        await supabase.from('orders').update({ status: 'paid', payment_status: 'paid' }).eq('id', order_id);
        
        if (order.products?.is_personal && order.personal_email) {
          await fulfillPersonalAdobeAccess(order);
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
        await incrementCouponUsedIfPresent(order);
        try {
          await tryProcessReferralRewardsForOrder(supabase, order.id);
        } catch (e) {
          console.error('referral processing (dev sim):', e);
        }
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

    const response = await postUddoktaCheckout(payload, uddoktaCreds);

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
    const baseUrl = frontend_url || process.env.FRONTEND_URL || origin || 'https://vibeaccessbd.com';

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

    const uddoktaCreds = await getUddoktaPayCredentialsCached(supabase);
    const isLocalhost = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');
    if (!uddoktaCreds.apiKey || !uddoktaCreds.baseUrl || isLocalhost) {
      console.warn("UddoktaPay dev mode: Simulating successful wallet recharge for dev/localhost.");
      
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

    const response = await postUddoktaCheckout(payload, uddoktaCreds);

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

router.post('/bkash-tokenized/status', requireUser, async (req, res) => {
  try {
    const user = (req as any).user;
    const creds = await getBkashTokenizedCredentialsCached(supabase);
    const { data: u } = await supabase.from('users').select('bkash_agreement_id').eq('id', user.id).maybeSingle();
    const agreement = typeof u?.bkash_agreement_id === 'string' ? u.bkash_agreement_id.trim() : '';
    return res.json({
      success: true,
      configured: Boolean(creds),
      has_agreement: Boolean(agreement),
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message || 'Error' });
  }
});

router.post('/bkash-tokenized/agreement/start', requireUser, async (req, res) => {
  try {
    const user = (req as any).user;
    const { frontend_url } = req.body || {};
    const origin = req.headers.origin;
    const baseUrl = frontend_url || process.env.FRONTEND_URL || origin || 'https://vibeaccessbd.com';
    const baseOrigin = (() => {
      try {
        const raw = String(baseUrl).startsWith('http') ? String(baseUrl) : `https://${baseUrl}`;
        return new URL(raw).origin;
      } catch {
        return String(baseUrl).replace(/\/$/, '');
      }
    })();

    const creds = await getBkashTokenizedCredentialsCached(supabase);
    const isLocalhost = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');
    if (!creds || isLocalhost) {
      return res.status(400).json({
        success: false,
        message: isLocalhost
          ? 'bKash agreement cannot be completed from localhost. Use a deployed URL and sandbox credentials.'
          : 'bKash tokenized checkout is not configured (admin or server environment).',
      });
    }

    const { data: urow } = await supabase.from('users').select('phone, bkash_agreement_id').eq('id', user.id).single();
    if (typeof urow?.bkash_agreement_id === 'string' && urow.bkash_agreement_id.trim()) {
      return res.status(400).json({ success: false, message: 'bKash account is already linked.' });
    }
    const digitsPhone = String(urow?.phone || '').replace(/\D/g, '');
    if (digitsPhone.length < 10) {
      return res.status(400).json({ success: false, message: 'Add a valid mobile number on your profile before linking bKash.' });
    }

    const idToken = await bkashGrantToken(creds);
    const callbackURL = `${baseOrigin}/bkash-return`;
    const merchantInvoiceNumber = `AGR${Date.now()}${String(user.id).replace(/-/g, '').slice(0, 10)}`.slice(0, 255);
    const createBody: Record<string, unknown> = {
      mode: '0000',
      payerReference: digitsPhone.slice(0, 255),
      callbackURL,
      amount: '1',
      currency: 'BDT',
      intent: 'sale',
      merchantInvoiceNumber,
    };

    const created = await bkashPostJson(creds, '/checkout/create', idToken, createBody);
    if (String(created.statusCode || '') !== '0000' || !created.bkashURL) {
      return res.status(400).json({
        success: false,
        message: String(created.errorMessage || created.statusMessage || 'Could not start bKash agreement.'),
      });
    }

    const paymentId = String(created.paymentID || '').trim();
    if (!paymentId) {
      return res.status(500).json({ success: false, message: 'bKash did not return paymentID.' });
    }

    await supabase.from('bkash_pending_sessions').delete().eq('user_id', user.id).eq('flow', 'agreement');
    const { error: insErr } = await supabase.from('bkash_pending_sessions').insert({
      payment_id: paymentId,
      user_id: user.id,
      flow: 'agreement',
      order_id: null,
      wallet_deduction: 0,
      gateway_amount: 0,
      merchant_invoice: merchantInvoiceNumber,
    });
    if (insErr) {
      console.error('bkash agreement pending insert:', insErr);
      return res.status(500).json({ success: false, message: 'Could not store agreement session.' });
    }

    await logPaymentEvent(null, user.id, 'bkash_agreement_started', null, 'bKash agreement flow started', { payment_id: paymentId }, 'bkash_tokenized');
    return res.json({ success: true, payment_url: String(created.bkashURL) });
  } catch (e: any) {
    console.error('bkash agreement/start:', e);
    return res.status(500).json({ success: false, message: e?.message || 'Agreement start failed' });
  }
});

router.post('/bkash-tokenized/finish', requireUser, async (req, res) => {
  try {
    const user = (req as any).user;
    const paymentID = String(req.body?.payment_id || req.body?.paymentID || '').trim();
    const statusQ = String(req.body?.status || '').toLowerCase();

    if (!paymentID) {
      return res.status(400).json({ success: false, message: 'Missing payment_id' });
    }

    const creds = await getBkashTokenizedCredentialsCached(supabase);
    if (!creds) {
      return res.status(503).json({ success: false, message: 'bKash is not configured.' });
    }

    const { data: row, error: rowErr } = await supabase
      .from('bkash_pending_sessions')
      .select('*')
      .eq('payment_id', paymentID)
      .maybeSingle();
    if (rowErr || !row || row.user_id !== user.id) {
      return res.status(404).json({ success: false, message: 'Unknown or expired bKash session.' });
    }

    if (statusQ === 'failure' || statusQ === 'cancel' || statusQ === 'cancelled') {
      await supabase.from('bkash_pending_sessions').delete().eq('payment_id', paymentID);
      return res.json({
        success: false,
        cancelled: statusQ === 'cancel' || statusQ === 'cancelled',
        message: 'Payment was not completed.',
      });
    }

    const idToken = await bkashGrantToken(creds);
    const execJson = await bkashPostJson(creds, '/checkout/execute', idToken, { paymentID });

    if (row.flow === 'agreement') {
      if (String(execJson.agreementStatus || '') !== 'Completed') {
        return res.status(400).json({
          success: false,
          message: String(execJson.errorMessage || execJson.statusMessage || 'Agreement was not completed.'),
        });
      }
      const agr = String(execJson.agreementID || '').trim();
      if (!agr) {
        return res.status(500).json({ success: false, message: 'No agreementID from bKash.' });
      }
      await supabase.from('users').update({ bkash_agreement_id: agr }).eq('id', user.id);
      await supabase.from('bkash_pending_sessions').delete().eq('payment_id', paymentID);
      await logPaymentEvent(null, user.id, 'bkash_agreement_completed', null, 'bKash agreement linked', { agreement_id: agr }, 'bkash_tokenized');
      return res.json({ success: true, flow: 'agreement' });
    }

    if (row.flow !== 'checkout' || !row.order_id) {
      await supabase.from('bkash_pending_sessions').delete().eq('payment_id', paymentID);
      return res.status(400).json({ success: false, message: 'Invalid checkout session.' });
    }

    if (String(execJson.transactionStatus || '') !== 'Completed') {
      return res.status(400).json({
        success: false,
        message: String(execJson.errorMessage || execJson.statusMessage || 'Payment was not completed.'),
      });
    }

    const { data: ord } = await supabase.from('orders').select('user_id').eq('id', row.order_id).single();
    if (!ord || ord.user_id !== user.id) {
      return res.status(403).json({ success: false, message: 'Order mismatch.' });
    }

    const paid = Number(execJson.amount);
    const gatewayPaid = Number.isFinite(paid) ? paid : Number(row.gateway_amount) || 0;
    const settle = await settleOrderAfterGatewayPayment({
      orderId: row.order_id,
      orderUserId: user.id,
      walletDeduction: Number(row.wallet_deduction) || 0,
      gatewayPaid,
      gatewayLabel: 'bkash_tokenized',
    });
    if (settle.ok === false) {
      return res.status(settle.statusCode).json({ success: false, message: settle.publicMessage });
    }

    const trxId = String(execJson.trxID || '').trim();
    const msisdn = String(execJson.customerMsisdn || execJson.payerReference || '')
      .trim()
      .slice(0, 20);
    await supabase
      .from('orders')
      .update({
        bkash_payment_id: paymentID,
        bkash_trx_id: trxId || null,
        bkash_msisdn: msisdn || null,
        bkash_gateway_amount: gatewayPaid,
      })
      .eq('id', row.order_id);

    await supabase.from('bkash_pending_sessions').delete().eq('payment_id', paymentID);
    await logPaymentEvent(
      row.order_id,
      user.id,
      'bkash_payment_executed',
      gatewayPaid,
      'bKash execute completed',
      { trx_id: trxId, payment_id: paymentID, msisdn: msisdn || undefined },
      'bkash_tokenized',
    );

    return res.json({
      success: true,
      flow: 'checkout',
      redirect_path: `/adobe-email?payment=success&order_id=${row.order_id}`,
    });
  } catch (e: any) {
    console.error('bkash finish:', e);
    return res.status(500).json({ success: false, message: e?.message || 'Finish failed' });
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

    const uddoktaCreds = await getUddoktaPayCredentialsCached(supabase);
    const headerRaw = req.headers['rt-uddoktapay-api-key'];
    const headerApiKey = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
    if (uddoktaCreds.apiKey && headerApiKey !== uddoktaCreds.apiKey) {
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

      const settle = await settleOrderAfterGatewayPayment({
        orderId,
        orderUserId: String(orderUserId || ''),
        walletDeduction,
        gatewayPaid,
        gatewayLabel: 'uddoktapay',
      });
      if (settle.ok === false) {
        return res.status(settle.statusCode).json({ error: settle.publicMessage });
      }

      const { data: order } = await supabase.from('orders').select('user_id').eq('id', orderId).maybeSingle();

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

router.post('/assign-email', requireUser, async (req, res) => {
  try {
    const user = (req as any).user;
    const { order_id } = req.body;
    if (!order_id) {
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }

    // Securely lookup the order bypassing RLS to ensure we can read all details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, products(id, email_slots, email_slot_interval_days, max_users_per_email)')
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Authorization: allow only the order owner, or an admin.
    const { data: profile, error: profileErr } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profileErr) throw profileErr;

    const callerIsAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
    if (!callerIsAdmin && order.user_id !== user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // Ensure order is paid/completed before generating/assigning
    if (order.status !== 'completed' && order.status !== 'paid') {
      return res.status(400).json({ success: false, message: 'Order is not completed' });
    }

    // Optional: check max generation limits if you want, but the smart backend respects shared slots natively
    const result = await assignEmailForOrder(supabase, order.id, order.user_id, order.product_id);

    if (result.success) {
      return res.json({ success: true, message: 'Email assigned successfully' });
    }
    const status = result.code === 'slot_timing' ? 400 : 500;
    return res.status(status).json({
      success: false,
      message: result.error || 'Failed to assign email',
      code: result.code,
      next_eligible_at: result.nextEligibleAt,
    });

  } catch (error: any) {
    console.error('Manual assign-email error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

router.post('/bulk-assign-emails', requireUser, async (req, res) => {
  try {
    const user = (req as any).user;
    
    // Check admin permissions
    const { data: userProfile } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (userProfile?.role !== 'admin' && userProfile?.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Forbidden: Admins only' });
    }

    // Fetch all orders that are paid or completed, filtering out personal ones.
    // Joining with user_emails allows us to see if the order got an email or not.
    const { data: candidateOrders, error: fetchErr } = await supabase
      .from('orders')
      .select('*, products!inner(id, is_personal), user_emails(id)')
      .in('status', ['paid', 'completed'])
      .eq('payment_status', 'paid')
      .eq('products.is_personal', false);
      
    if (fetchErr) throw fetchErr;
    
    // Filter strictly to orders that have NO assigned emails at all
    const unfulfilledOrders = candidateOrders.filter((o: any) => !o.user_emails || o.user_emails.length === 0);
    
    if (!unfulfilledOrders || unfulfilledOrders.length === 0) {
      return res.json({ success: true, message: 'No missing/unfulfilled orders found.', results: [] });
    }
    
    const results = [];
    let successCount = 0;
    
    for (const order of unfulfilledOrders) {
      const assignment = await assignEmailForOrder(supabase, order.id, order.user_id, order.product_id);
      if (assignment.success) {
        await supabase.from('orders').update({ status: 'completed' }).eq('id', order.id);
        results.push({ order_id: order.id, success: true });
        successCount++;
        
        try {
          await supabase.from('order_events').insert({
            order_id: order.id,
            user_id: user.id, // The admin doing the action
            event_type: 'bulk_provisioning_completed',
            message: 'Assigned product email successfully via bulk action'
          });
        } catch {}
      } else {
        results.push({ order_id: order.id, success: false, error: assignment.error });
      }
    }
    
    return res.json({ 
      success: true, 
      message: `Successfully fulfilled ${successCount} out of ${unfulfilledOrders.length} pending emails.`,
      results 
    });

  } catch (error: any) {
    console.error('Bulk assign emails error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

router.post('/toggle-auto-renew', requireUser, async (req, res) => {
  try {
    const user = (req as any).user;
    const { order_id, auto_renew } = req.body;
    
    if (!order_id) return res.status(400).json({ success: false, message: 'Missing order_id' });
    
    // Ensure the order belongs to this user
    const { data: order, error: verifyErr } = await supabase
      .from('orders')
      .select('id')
      .eq('id', order_id)
      .eq('user_id', user.id)
      .single();
      
    if (verifyErr || !order) {
      return res.status(403).json({ success: false, message: 'Forbidden or order not found' });
    }
    
    // Update it securely from backend (bypassing RLS which restricts user edits)
    const { error: updateErr } = await supabase
      .from('orders')
      .update({ auto_renew: Boolean(auto_renew) })
      .eq('id', order.id);
      
    if (updateErr) throw updateErr;
    
    res.json({ success: true, message: 'Auto-renew updated successfully' });
  } catch (err: any) {
    console.error('Toggle auto-renew error:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
});

router.post('/process-auto-renew', requireUser, async (req, res) => {
  try {
    const user = (req as any).user;
    const { old_order_id } = req.body;
    
    if (!old_order_id) return res.status(400).json({ success: false, message: 'Missing old_order_id' });
    
    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('*, products(id, price, is_personal, email_slots)')
      .eq('id', old_order_id)
      .eq('user_id', user.id)
      .single();
      
    if (fetchErr || !order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!order.auto_renew) return res.status(400).json({ success: false, message: 'Auto-renew is disabled for this order' });

    if (order.products?.is_personal && !(await isPersonalSubscriptionsEnabled())) {
      return res.status(400).json({
        success: false,
        message: 'Personal subscription renewals are paused. Enable personal plans in admin or renew manually when available.',
      });
    }

    const productPrice = Number(order.products?.price) || 0;
    
    if (productPrice > 0) {
      const { error: deductErr } = await supabase.rpc('deduct_subscription_wallet_combined', {
        p_user_id: user.id,
        p_amount: productPrice,
      });
      
      if (deductErr) {
        // Suspend auto-renew
        await supabase.from('orders').update({ auto_renew: false }).eq('id', old_order_id);
        return res.status(400).json({ success: false, message: 'Insufficient wallet balance. Auto-renew disabled.', suspended: true });
      }
    }
    
    // 2. Shut off auto-renew on the old order 
    await supabase.from('orders').update({ auto_renew: false }).eq('id', old_order_id);
    
    // 3. Create fresh order perfectly inheriting context
    const { data: newOrder, error: insertErr } = await supabase.from('orders').insert({
      user_id: user.id,
      product_id: order.products.id,
      payment_method: 'wallet',
      total_amount: productPrice,
      status: 'completed',
      payment_status: 'paid',
      auto_renew: true
    }).select().single();
    
    if (insertErr || !newOrder) throw insertErr || new Error('Failed to create renewed order');
    
    // 4. Provision fresh email access immediately
    if (!order.products?.is_personal) {
      const assignment = await assignEmailForOrder(supabase, newOrder.id, newOrder.user_id, newOrder.product_id);
      if (!assignment.success) {
        console.error('AutoRenew Email assignment failed:', assignment.error);
        // Fail-safe logic can just log it since the order is paid
      }
    }
    
    res.json({ success: true, message: 'Auto-renewed successfully' });
  } catch (err: any) {
    console.error('process-auto-renew error:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
});

export default router;
