import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const UDDOKTAPAY_API_KEY = process.env.UDDOKTAPAY_API_KEY || '';
const UDDOKTAPAY_BASE_URL = process.env.UDDOKTAPAY_BASE_URL || '';

router.post('/create', async (req, res) => {
  try {
    const { order_id, amount, full_name, email } = req.body;

    // Dynamically get the base URL from the incoming request's Origin header to guarantee it perfectly matches
    // the frontend domain (e.g. .vercel.app, .shop, localhost:5173) the user is actively visiting.
    const origin = req.headers.origin;
    const baseUrl = process.env.FRONTEND_URL || origin || 'https://vibeaccessbd.shop';

    // Handle 100% discount / free orders
    if (amount === 0 || amount === '0') {
      console.log(`Processing free order: ${order_id}`);
      
      const { data: order } = await supabase.from('orders').select('*').eq('id', order_id).single();
      if (order) {
        await supabase.from('orders').update({ status: 'paid', payment_status: 'paid' }).eq('id', order_id);
        const { data: availableEmail } = await supabase.from('emails_pool').select('id').eq('status', 'available').limit(1).single();
        if (availableEmail) {
          await supabase.from('emails_pool').update({ status: 'assigned', assigned_at: new Date().toISOString() }).eq('id', availableEmail.id);
          await supabase.from('user_emails').insert({ user_id: order.user_id, email_id: availableEmail.id, order_id: order.id, is_active: true });
          await supabase.from('orders').update({ status: 'completed' }).eq('id', order.id);
          
          // Update or create generation logs for the current month
          const currentMonth = new Date().toISOString().substring(0, 7); // Format: YYYY-MM
          const { data: existingLog } = await supabase
            .from('email_generation_logs')
            .select('id, count')
            .eq('user_id', order.user_id)
            .eq('month', currentMonth)
            .single();

          if (existingLog) {
            await supabase
              .from('email_generation_logs')
              .update({ count: existingLog.count + 1 })
              .eq('id', existingLog.id);
          } else {
            await supabase
              .from('email_generation_logs')
              .insert({
                user_id: order.user_id,
                count: 1,
                month: currentMonth
              });
          }
        }
      }

      return res.json({
        success: true,
        payment_url: `${baseUrl}/adobe-email?payment=success&order_id=${order_id}`
      });
    }

    if (!UDDOKTAPAY_API_KEY || !UDDOKTAPAY_BASE_URL) {
      console.warn("UddoktaPay credentials not set. Simulating successful payment flow for dev.");
      
      // Simulate webhook logic for local dev since we can't receive real webhooks easily
      // In production, remove this block and let the actual webhook handle it
      const { data: order } = await supabase.from('orders').select('*').eq('id', order_id).single();
      if (order) {
        await supabase.from('orders').update({ status: 'paid', payment_status: 'paid' }).eq('id', order_id);
        const { data: availableEmail } = await supabase.from('emails_pool').select('id').eq('status', 'available').limit(1).single();
        if (availableEmail) {
          await supabase.from('emails_pool').update({ status: 'assigned', assigned_at: new Date().toISOString() }).eq('id', availableEmail.id);
          await supabase.from('user_emails').insert({ user_id: order.user_id, email_id: availableEmail.id, order_id: order.id, is_active: true });
          await supabase.from('orders').update({ status: 'completed' }).eq('id', order.id);
        }
      }

      return res.json({
        success: true,
        payment_url: `${baseUrl}/adobe-email?payment=success&order_id=${order_id}`
      });
    }

    const payload = {
      full_name,
      email,
      amount: amount.toString(),
      metadata: {
        order_id
      },
      redirect_url: `${baseUrl}/adobe-email?payment=success`,
      cancel_url: `${baseUrl}/store?payment=cancelled`,
      webhook_url: `${baseUrl}/api/payment/webhook`
    };

    const response = await fetch(`${UDDOKTAPAY_BASE_URL}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'RT-UDDOKTAPAY-API-KEY': UDDOKTAPAY_API_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json() as any;

    if (data.status) {
      res.json({ success: true, payment_url: data.payment_url });
    } else {
      // Clean up the abandoned order from the DB using Service Role to bypass RLS
      if (order_id) {
        await supabase.from('orders').delete().eq('id', order_id);
      }
      res.status(400).json({ success: false, message: data.message || 'Failed to generate payment URL' });
    }

  } catch (error) {
    console.error('Error creating payment:', error);
    // Attempt cleanup if exception occurred
    if (req.body?.order_id) {
      try {
        await supabase.from('orders').delete().eq('id', req.body.order_id);
      } catch (cleanupErr) {
        console.error('Failed to cleanup on exception:', cleanupErr);
      }
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/webhook', async (req, res) => {
  try {
    const { metadata, status } = req.body;
    
    const headerApiKey = req.headers['rt-uddoktapay-api-key'];
    if (UDDOKTAPAY_API_KEY && headerApiKey !== UDDOKTAPAY_API_KEY) {
       return res.status(401).json({ error: 'Unauthorized' });
    }

    if (status === 'COMPLETED') {
      const orderId = metadata.order_id;
      
      const { error: updateError } = await supabase
        .from('orders')
        .update({ status: 'paid', payment_status: 'paid' })
        .eq('id', orderId);

      if (updateError) throw updateError;

      const { data: order } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (order) {
        const { data: availableEmail } = await supabase
          .from('emails_pool')
          .select('id')
          .eq('status', 'available')
          .limit(1)
          .single();

        if (availableEmail) {
          // Assign email to user
          await supabase
            .from('emails_pool')
            .update({ status: 'assigned', assigned_at: new Date().toISOString() })
            .eq('id', availableEmail.id);

          await supabase
            .from('user_emails')
            .insert({
              user_id: order.user_id,
              email_id: availableEmail.id,
              order_id: order.id,
              is_active: true
            });

          // Mark order as completed
          await supabase
            .from('orders')
            .update({ status: 'completed' })
            .eq('id', order.id);

          // Update or create generation logs for the current month
          const currentMonth = new Date().toISOString().substring(0, 7); // Format: YYYY-MM
          const { data: existingLog } = await supabase
            .from('email_generation_logs')
            .select('id, count')
            .eq('user_id', order.user_id)
            .eq('month', currentMonth)
            .single();

          if (existingLog) {
            await supabase
              .from('email_generation_logs')
              .update({ count: existingLog.count + 1 })
              .eq('id', existingLog.id);
          } else {
            await supabase
              .from('email_generation_logs')
              .insert({
                user_id: order.user_id,
                count: 1,
                month: currentMonth
              });
          }
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
