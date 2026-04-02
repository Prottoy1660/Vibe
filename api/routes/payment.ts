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

router.post('/create', async (req, res) => {
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
    const { order_id, amount, full_name, email, frontend_url } = req.body;

    // Dynamically get the base URL:
    // 1. Exact origin reported by the browser checkout page (Most reliable)
    // 2. Vercel environment variable
    // 3. Header-based origin
    const origin = req.headers.origin;
    const baseUrl = frontend_url || process.env.FRONTEND_URL || origin || 'https://vibeaccessbd.shop';

    // Handle 100% discount / free orders
    if (amount === 0 || amount === '0') {
      console.log(`Processing free order: ${order_id}`);
      
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

      return res.json({
        success: true,
        payment_url: `${baseUrl}/adobe-email?payment=success&order_id=${order_id}`
      });
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
        order_id,
        is_recharge: req.body.is_recharge || false,
        recharge_amount: req.body.recharge_amount || 0
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

router.post('/recharge', async (req, res) => {
  try {
    const { user_id, amount, full_name, email, frontend_url } = req.body;

    const origin = req.headers.origin;
    const baseUrl = frontend_url || process.env.FRONTEND_URL || origin || 'https://vibeaccessbd.shop';

    if (!user_id || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid recharge parameters' });
    }

    if (!UDDOKTAPAY_API_KEY || !UDDOKTAPAY_BASE_URL) {
      console.warn("UddoktaPay credentials not set. Simulating successful wallet recharge for dev.");
      
      const { data: userData } = await supabase.from('users').select('wallet_balance').eq('id', user_id).single();
      const currentBalance = Number(userData?.wallet_balance) || 0;
      await supabase.from('users').update({ wallet_balance: currentBalance + Number(amount) }).eq('id', user_id);

      return res.json({
        success: true,
        payment_url: `${baseUrl}/?recharge=success`
      });
    }

    // Creating abstract random ID to uniquely identify this standalone transaction log if needed
    const recharge_id = `rech_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const payload = {
      full_name: full_name || 'Customer',
      email: email || 'user@example.com',
      amount: amount.toString(),
      metadata: {
        is_standalone_recharge: true,
        user_id,
        recharge_amount: amount,
        recharge_id
      },
      cancel_url: `${baseUrl}/?recharge=cancelled`,
      redirect_url: `${baseUrl}/?recharge=success`,
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
      res.status(400).json({ success: false, message: data.message || 'Failed to generate recharge URL' });
    }

  } catch (error) {
    console.error('Error creating recharge session:', error);
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
        .select('*, products(is_personal, duration)')
        .eq('id', orderId)
        .single();

      if (order) {
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
            return res.status(500).json({ error: assignment.error || 'Email assignment failed' });
          }
        }

        // Mark order as completed
        await supabase.from('orders').update({ status: 'completed' }).eq('id', order.id);
      }
      
      // Process Wallet Recharge if applicable
      if (metadata.is_standalone_recharge && metadata.user_id && metadata.recharge_amount > 0) {
        try {
          // Fetch current balance
          const { data: userData } = await supabase
            .from('users')
            .select('wallet_balance')
            .eq('id', metadata.user_id)
            .single();
            
          const currentBalance = Number(userData?.wallet_balance) || 0;
          const newBalance = currentBalance + Number(metadata.recharge_amount);
          
          await supabase
            .from('users')
            .update({ wallet_balance: newBalance })
            .eq('id', metadata.user_id);
            
          console.log(`Successfully standalone recharged wallet for user ${metadata.user_id} with amount ${metadata.recharge_amount}`);
        } catch (walletErr) {
          console.error('Error standalone recharging user wallet via webhook:', walletErr);
        }
      } else if (metadata.is_recharge && metadata.recharge_amount > 0 && order?.user_id) {
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
