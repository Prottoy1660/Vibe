import express from 'express';
import { createClient, type User } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { assignEmailForOrder } from '../lib/emailAssignment.js';

dotenv.config();

const router = express.Router();
const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

function configOk(res: express.Response): boolean {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[redeem] Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    res.status(503).json({
      success: false,
      message: 'Redeem service is not configured. Set Supabase URL and service role key on the API server.',
    });
    return false;
  }
  return true;
}

/** public.users row is required for orders.user_id FK — some signups only have auth.users. */
async function ensurePublicUserProfile(user: User) {
  const { data: existing } = await supabase.from('users').select('id').eq('id', user.id).maybeSingle();
  if (existing) return;

  const meta = user.user_metadata || {};
  const name = (
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    (user.email ? user.email.split('@')[0] : 'Customer')
  ).slice(0, 100);

  const tryEmails = [
    user.email || '',
    `user-${user.id.slice(0, 8)}@pending.sync`,
    `u-${user.id.replace(/-/g, '')}@redeem.internal`,
  ].filter(Boolean);

  let lastErr: { message?: string } | null = null;
  for (const email of tryEmails) {
    const { error } = await supabase.from('users').insert({
      id: user.id,
      email: email.slice(0, 255),
      name,
    });
    if (!error) return;
    lastErr = error;
    if (/duplicate key value violates unique constraint.*users_pkey|already exists/i.test(error.message || '')) {
      return;
    }
    if (!/unique|duplicate/i.test(error.message || '')) {
      throw error;
    }
  }
  if (lastErr) throw lastErr;
}

function asProductUuid(v: unknown): string {
  if (v == null) return '';
  const s = typeof v === 'string' ? v.trim() : String(v);
  return s;
}

async function releaseStaleRedeemConsumption(userId: string, code: string) {
  try {
    const { error } = await supabase.rpc('release_stale_redeem_consumption', {
      p_user_id: userId,
      p_code: code,
    });
    if (error && /function .* does not exist/i.test(error.message || '')) {
      console.warn('[redeem] release_stale_redeem_consumption RPC missing — run migration 064 on Supabase');
    }
  } catch (e) {
    console.error('[redeem] release_stale_redeem_consumption:', e);
  }
}

async function requireUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
    if (!token) return res.status(401).json({ success: false, message: 'Missing Authorization token' });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ success: false, message: 'Invalid token' });

    (req as express.Request & { user?: User }).user = data.user;
    return next();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unauthorized';
    return res.status(401).json({ success: false, message: msg });
  }
}

// POST /api/redeem/validate — check a code without consuming it
router.post('/validate', async (req, res) => {
  if (!configOk(res)) return;
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Code is required' });
    if (typeof code !== 'string' || code.trim().length < 4 || code.trim().length > 64) {
      return res.status(400).json({ success: false, message: 'Invalid code format' });
    }

    const normalized = code.toUpperCase().trim();

    const { data: row, error: codeErr } = await supabase
      .from('redeem_codes')
      .select('id, code, is_used, max_uses, used_count, product_id')
      .eq('code', normalized)
      .eq('is_active', true)
      .maybeSingle();

    if (codeErr) {
      console.error('[redeem/validate] redeem_codes:', codeErr);
      return res.status(500).json({ success: false, message: 'Could not verify code. Try again.' });
    }
    if (!row) return res.status(404).json({ success: false, message: 'Invalid or expired redeem code.' });
    if (row.is_used || row.used_count >= row.max_uses) {
      return res.status(400).json({ success: false, message: 'This redeem code has already been used.' });
    }

    const { data: product, error: prodErr } = await supabase
      .from('products')
      .select('id, title, price, duration')
      .eq('id', row.product_id)
      .maybeSingle();

    if (prodErr || !product) {
      console.error('[redeem/validate] product missing for code', row.product_id, prodErr);
      return res.status(400).json({
        success: false,
        message: 'This code is not linked to a valid product. Contact support.',
      });
    }

    res.json({
      success: true,
      code: {
        ...row,
        products: product,
      },
    });
  } catch (err) {
    console.error('Redeem validate error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/redeem/apply — consume the code and provision the product
router.post('/apply', requireUser, async (req, res) => {
  if (!configOk(res)) return;
  const user = (req as express.Request & { user: User }).user;
  const codeRaw = req.body?.code;

  try {
    if (!codeRaw) return res.status(400).json({ success: false, message: 'Code is required' });
    if (typeof codeRaw !== 'string' || codeRaw.trim().length < 4 || codeRaw.trim().length > 64) {
      return res.status(400).json({ success: false, message: 'Invalid code format' });
    }
    const normalized = codeRaw.toUpperCase().trim();

    await ensurePublicUserProfile(user);
    await releaseStaleRedeemConsumption(user.id, normalized);

    const { data: rcRow } = await supabase
      .from('redeem_codes')
      .select('id, product_id')
      .eq('code', normalized)
      .maybeSingle();

    if (rcRow) {
      const { data: useAfter } = await supabase
        .from('redeem_code_uses')
        .select('id')
        .eq('user_id', user.id)
        .eq('redeem_code_id', rcRow.id)
        .maybeSingle();

      if (useAfter) {
        const { data: existingOrder } = await supabase
          .from('orders')
          .select('id')
          .eq('user_id', user.id)
          .eq('product_id', rcRow.product_id)
          .eq('payment_method', 'redeem_code')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingOrder?.id) {
          return res.json({
            success: true,
            message: 'This code is already linked to your account.',
            order_id: existingOrder.id,
          });
        }
      }
    }

    const { data: productId, error: applyErr } = await supabase.rpc('apply_redeem_code', {
      p_user_id: user.id,
      p_code: normalized,
    });

    if (applyErr || productId == null || productId === '') {
      return res.status(400).json({ success: false, message: applyErr?.message || 'Could not redeem code' });
    }

    const productUuid = asProductUuid(productId);
    if (!productUuid) {
      await releaseStaleRedeemConsumption(user.id, normalized);
      return res.status(400).json({ success: false, message: 'Invalid product from redeem code.' });
    }

    const { data: productRow, error: productErr } = await supabase
      .from('products')
      .select('price')
      .eq('id', productUuid)
      .single();
    if (productErr || !productRow) {
      console.error('[redeem/apply] product fetch after RPC:', productErr);
      await releaseStaleRedeemConsumption(user.id, normalized);
      return res.status(400).json({ success: false, message: 'Product for this code is missing.' });
    }
    const rawPrice = (productRow as { price?: number }).price;
    const productPrice = Math.round(Number(rawPrice) * 100) / 100;
    const totalAmount = Number.isFinite(productPrice) ? productPrice : 0;

    const baseOrder = {
      user_id: user.id,
      product_id: productUuid,
      payment_method: 'redeem_code',
      total_amount: totalAmount,
      status: 'pending' as const,
      payment_status: 'pending' as const,
    };

    const withRedeemMeta = {
      ...baseOrder,
      redeem_pending: true,
      payment_due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    let { data: order, error: orderError } = await supabase.from('orders').insert(withRedeemMeta).select().single();

    if (
      orderError &&
      /redeem_pending|payment_due_date|column .* does not exist|42703/i.test(orderError.message || '')
    ) {
      console.warn('[redeem/apply] retrying order insert without redeem_pending columns:', orderError.message);
      const second = await supabase.from('orders').insert(baseOrder).select().single();
      order = second.data;
      orderError = second.error;
    }

    if (orderError || !order) {
      const err = orderError as { code?: string; message?: string; details?: string } | null;
      console.error('[redeem/apply] order insert:', JSON.stringify(err, null, 2));
      await releaseStaleRedeemConsumption(user.id, normalized);
      const pg = err?.code || '';
      const msg = (err?.message || '').toLowerCase();
      let hint =
        'Could not create your access order. Try again or contact support.';
      if (pg === '23503' || msg.includes('foreign key') || msg.includes('user_id')) {
        hint =
          'Your account profile could not be linked. Try logging out and back in, then redeem again.';
      } else if (msg.includes('product_id') || msg.includes('products')) {
        hint = 'This product is no longer available for redemption. Contact support.';
      }
      return res.status(400).json({ success: false, message: hint });
    }

    const assignment = await assignEmailForOrder(supabase, order.id, user.id, productUuid);

    if (assignment.success) {
      await supabase.from('orders').update({ status: 'completed' }).eq('id', order.id);
    }

    try {
      const { data: redeemCodeRow } = await supabase
        .from('redeem_codes')
        .select('id')
        .eq('code', normalized)
        .single();
      if (redeemCodeRow?.id) {
        await supabase
          .from('redeem_code_uses')
          .update({ order_id: order.id })
          .eq('user_id', user.id)
          .eq('redeem_code_id', redeemCodeRow.id);
      }
    } catch {
      /* best-effort */
    }

    res.json({ success: true, message: 'Code redeemed successfully!', order_id: order.id });
  } catch (err) {
    console.error('Redeem apply error:', err);
    if (user?.id && typeof codeRaw === 'string') {
      await releaseStaleRedeemConsumption(user.id, codeRaw.toUpperCase().trim());
    }
    res.status(500).json({
      success: false,
      message:
        'Something went wrong while completing redemption. If no access appeared, try Redeem again once.',
    });
  }
});

export default router;
