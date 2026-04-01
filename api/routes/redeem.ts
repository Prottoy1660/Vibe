import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { assignEmailForOrder } from '../lib/emailAssignment.js';

dotenv.config();

const router = express.Router();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// POST /api/redeem/validate — check a code without consuming it
router.post('/validate', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Code is required' });

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
router.post('/apply', async (req, res) => {
  try {
    const { code, user_id } = req.body;
    if (!code || !user_id) return res.status(400).json({ success: false, message: 'Code and user_id are required' });

    // Fetch and lock the redeem code
    const { data: redeemCode, error: fetchError } = await supabase
      .from('redeem_codes')
      .select(`
        id, code, is_used, max_uses, used_count, product_id,
        products:product_id (id, title, price)
      `)
      .eq('code', code.toUpperCase().trim())
      .eq('is_active', true)
      .single();

    if (fetchError || !redeemCode) {
      return res.status(404).json({ success: false, message: 'Invalid or expired redeem code.' });
    }

    if (redeemCode.is_used || redeemCode.used_count >= redeemCode.max_uses) {
      return res.status(400).json({ success: false, message: 'This redeem code has already been fully used.' });
    }

    // Check if this user already used this code
    const { data: existingUse } = await supabase
      .from('redeem_code_uses')
      .select('id')
      .eq('redeem_code_id', redeemCode.id)
      .eq('user_id', user_id)
      .single();

    if (existingUse) {
      return res.status(400).json({ success: false, message: 'You have already used this redeem code.' });
    }

    // Get the actual product price to record the real cost in the system
    const productPrice = (redeemCode.products as any)?.price ?? 0;

    // Create the order with the REAL product price — user pays ৳0 but
    // the system records the full value so revenue/analytics stay accurate
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id,
        product_id: redeemCode.product_id,
        payment_method: 'redeem_code',
        total_amount: productPrice,   // ← actual price, not 0
        status: 'completed',
        payment_status: 'paid',
      })
      .select()
      .single();

    if (orderError || !order) throw orderError;

    // Assign email using product-aware logic (respects email_slots & max_users_per_email)
    await assignEmailForOrder(supabase, order.id, user_id, redeemCode.product_id);

    // Log the usage
    await supabase.from('redeem_code_uses').insert({
      redeem_code_id: redeemCode.id,
      user_id,
      order_id: order.id,
    });

    // Update usage count; mark as fully used if needed
    const newUsedCount = redeemCode.used_count + 1;
    await supabase.from('redeem_codes').update({
      used_count: newUsedCount,
      is_used: newUsedCount >= redeemCode.max_uses,
    }).eq('id', redeemCode.id);

    res.json({ success: true, message: 'Code redeemed successfully!', order_id: order.id });
  } catch (err) {
    console.error('Redeem apply error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
