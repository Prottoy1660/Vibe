import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { assignEmailForOrder } from '../lib/emailAssignment.js';

dotenv.config();

const router = express.Router();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

// POST /api/redeem/validate — check a code without consuming it
router.post('/validate', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Code is required' });
    if (typeof code !== 'string' || code.trim().length < 4 || code.trim().length > 64) {
      return res.status(400).json({ success: false, message: 'Invalid code format' });
    }

    const { data, error } = await supabase
      .from('redeem_codes')
      .select(`
        id, code, is_used, max_uses, used_count,
        products:product_id (id, title, price, duration)
      `)
      .eq('code', code.toUpperCase().trim())
      .eq('is_active', true)
      .single();

    if (error || !data) return res.status(404).json({ success: false, message: 'Invalid or expired redeem code.' });
    if (data.is_used || data.used_count >= data.max_uses) {
      return res.status(400).json({ success: false, message: 'This redeem code has already been used.' });
    }

    res.json({ success: true, code: data });
  } catch (err) {
    console.error('Redeem validate error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/redeem/apply — consume the code and provision the product
router.post('/apply', requireUser, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Code is required' });
    if (typeof code !== 'string' || code.trim().length < 4 || code.trim().length > 64) {
      return res.status(400).json({ success: false, message: 'Invalid code format' });
    }
    const user = (req as any).user;

    // Atomically consume code (locks row + enforces max uses)
    const { data: productId, error: applyErr } = await supabase.rpc('apply_redeem_code', {
      p_user_id: user.id,
      p_code: code,
    });

    if (applyErr || !productId) {
      return res.status(400).json({ success: false, message: applyErr?.message || 'Could not redeem code' });
    }

    // Get real product price to record value in analytics
    const { data: productRow, error: productErr } = await supabase
      .from('products')
      .select('price')
      .eq('id', productId)
      .single();
    if (productErr) throw productErr;
    const productPrice = Number((productRow as any)?.price) || 0;

    // Create the order with pending status for redeem — user gets access but payment is due later
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        product_id: productId,
        payment_method: 'redeem_code',
        total_amount: productPrice,   // actual price for revenue tracking
        status: 'pending',            // Pending until payment is made
        payment_status: 'pending',
        redeem_pending: true,
        payment_due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
      })
      .select()
      .single();

    if (orderError || !order) throw orderError;

    // Assign email using product-aware logic (respects email_slots & max_users_per_email)
    const assignment = await assignEmailForOrder(supabase, order.id, user.id, productId);
    
    // Only set to completed if we successfully provisioned an email
    if (assignment.success) {
      await supabase.from('orders').update({ status: 'completed' }).eq('id', order.id);
    }

    // Attach order_id to the (already created) use record (best-effort)
    try {
      const { data: redeemCodeRow } = await supabase
        .from('redeem_codes')
        .select('id')
        .eq('code', code.toUpperCase().trim())
        .single();
      if (redeemCodeRow?.id) {
        await supabase
          .from('redeem_code_uses')
          .update({ order_id: order.id })
          .eq('user_id', user.id)
          .eq('redeem_code_id', redeemCodeRow.id);
      }
    } catch {}

    res.json({ success: true, message: 'Code redeemed successfully!', order_id: order.id });
  } catch (err) {
    console.error('Redeem apply error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
