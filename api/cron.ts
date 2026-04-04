import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { assignEmailForOrder } from './lib/emailAssignment.js';
import { productDurationToMonths } from './lib/productDuration.js';
import { runSubscriptionExpiryReminders } from './lib/subscriptionExpiryReminders.js';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Executes the auto-renewal logic securely on the server.
 * Returns true if renewal succeeded, false otherwise.
 */
async function processSingleAutoRenew(order: any): Promise<boolean> {
  console.log(`Evaluating hourly Auto-Renew for order: ${order.id}`);
  try {
    const productPrice = Number(order.products?.price) || 0;
    
    // Shut off auto-renew immediately to prevent duplicate runs
    await supabase.from('orders').update({ auto_renew: false }).eq('id', order.id);

    if (productPrice > 0) {
      const { error: deductErr } = await supabase.rpc('deduct_subscription_wallet_combined', {
        p_user_id: order.user_id,
        p_amount: productPrice,
      });
      
      if (deductErr) {
        console.warn(`CRON: Insufficient wallet balance for user ${order.user_id}. Auto-renew suspended for order ${order.id}.`);
        return false;
      }
    }
    
    // 2. Create fresh order perfectly inheriting context
    const { data: newOrder, error: insertErr } = await supabase.from('orders').insert({
      user_id: order.user_id,
      product_id: order.products.id,
      payment_method: 'wallet',
      total_amount: productPrice,
      status: 'completed',
      payment_status: 'paid',
      auto_renew: true,
      personal_email: order.products?.is_personal ? order.personal_email ?? null : null,
    }).select().single();
    
    if (insertErr || !newOrder) {
      console.error('CRON: Failed to create renewed order', insertErr);
      return false;
    }
    
    // 3. Provision fresh email access immediately
    if (!order.products?.is_personal) {
      const assignment = await assignEmailForOrder(supabase, newOrder.id, newOrder.user_id, newOrder.product_id);
      if (!assignment.success) {
        console.error('CRON: AutoRenew Email assignment failed:', assignment.error);
      }
    } else if (order.personal_email) {
      try {
        const { grantAdobeCloudAccess } = await import('./lib/adobeApi.js');
        const months = productDurationToMonths(order.products?.duration);
        const grantOut = await grantAdobeCloudAccess(order.personal_email, months);
        if (!grantOut.success) {
          console.error('CRON: Personal Adobe API failed:', grantOut.error);
        }
      } catch (e) {
        console.error('CRON: Personal config failed', e);
      }
    }
    
    console.log(`CRON: Successfully auto-renewed order ${order.id} -> new order ${newOrder.id}`);
    return true;
  } catch (err: any) {
    console.error('CRON: processSingleAutoRenew error:', err);
    return false;
  }
}

/**
 * Scheduled job to find and renew expired orders
 */
export function initCronJobs() {
  // Run every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    console.log('[CRON] Running hourly subscription renewal check...');
    try {
      // Find orders that are active, completed, auto_renew=true, and whose emails have expired
      // 1. Fetch valid auto-renew orders
      const { data: recurringOrders } = await supabase
        .from('orders')
        .select('*, products(id, price, is_personal, duration)')
        .eq('status', 'completed')
        .eq('auto_renew', true);
        
      if (!recurringOrders || recurringOrders.length === 0) return;

      // Ensure date-fns is available or do manual date comp
      const { isPast, parseISO, addMonths } = await import('date-fns');
      const { parseDurationToMonths } = await import('../src/lib/durationUtils.js'); // Assuming relative path works or write natively
      
      const now = new Date();

      for (const order of recurringOrders) {
        // Calculate expiration manually 
        const durationStr = order.products?.duration || '';
        
        let monthsToAdd = 1;
        const lower = durationStr.toLowerCase();
        const numMatch = lower.match(/\d+/);
        const num = numMatch ? parseInt(numMatch[0], 10) : 1;
        if (lower.includes('year') || lower.includes('yr')) {
          monthsToAdd = num * 12;
        } else {
          monthsToAdd = num;
        }

        const expiresAt = addMonths(parseISO(order.created_at), monthsToAdd);

        // If it's expired by now, process auto renewal!
        if (isPast(expiresAt)) {
          await processSingleAutoRenew(order);
        }
      }
      
    } catch (err) {
      console.error('[CRON] Subscription check failed:', err);
    }
  });

  // Daily: inbox reminders 3 days and 1 day before subscription end (calendar days, Asia/Dhaka-friendly UTC slot).
  cron.schedule('30 2 * * *', async () => {
    console.log('[CRON] Subscription expiry reminders (d3 / d1)...');
    try {
      const r = await runSubscriptionExpiryReminders(supabase);
      console.log('[CRON] Expiry reminders:', r);
    } catch (err) {
      console.error('[CRON] Expiry reminders failed:', err);
    }
  });

  console.log('Cron jobs initialized successfully.');
}
