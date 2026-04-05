import type { SupabaseClient } from '@supabase/supabase-js';
import { REDEEM_RESTORE_WINDOW_MS } from '../../src/lib/redeemManualPaymentPolicy.js';

export type SeizeRedeemResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

/**
 * Same behavior as POST /api/admin/redeem/cancel — cancel order, deactivate emails, ban user, audit rows.
 */
export async function seizeRedeemOrderForUnpaid(
  supabase: SupabaseClient,
  orderId: string,
  context: { seizedByUserId: string | null; source: 'admin' | 'cron' },
): Promise<SeizeRedeemResult> {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(
      'id, user_id, total_amount, payment_status, redeem_seized_at, payment_method, status',
    )
    .eq('id', orderId)
    .single();

  if (orderError || !order) return { ok: false, error: 'Order not found', code: 'not_found' };

  const o = order as {
    user_id: string;
    total_amount?: number;
    payment_status?: string;
    redeem_seized_at?: string | null;
    payment_method?: string;
    status?: string;
  };

  if (o.redeem_seized_at) return { ok: false, error: 'This redeem order was already seized', code: 'already_seized' };
  if (o.payment_method !== 'redeem_code') {
    return { ok: false, error: 'Not a pending manual-payment redeem order', code: 'not_eligible' };
  }
  if (o.payment_status !== 'pending') {
    return { ok: false, error: 'Not a pending manual-payment redeem order', code: 'not_eligible' };
  }
  if (o.status !== 'pending' && o.status !== 'completed') {
    return { ok: false, error: 'Order is not in a redeem-access state', code: 'not_eligible' };
  }

  const { data: targetUser } = await supabase.from('users').select('role').eq('id', o.user_id).single();
  if (targetUser?.role === 'admin' || targetUser?.role === 'super_admin') {
    return { ok: false, error: 'Cannot seize admin accounts', code: 'admin_user' };
  }

  const nowIso = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('orders')
    .update({
      status: 'cancelled',
      payment_status: 'cancelled',
      redeem_pending: false,
      payment_due_date: null,
      redeem_seized_at: nowIso,
      redeem_seized_by: context.seizedByUserId,
    })
    .eq('id', orderId)
    .eq('payment_method', 'redeem_code')
    .eq('payment_status', 'pending')
    .in('status', ['pending', 'completed'])
    .is('redeem_seized_at', null);

  if (updateError) return { ok: false, error: updateError.message, code: 'update_failed' };

  await supabase.from('user_emails').update({ is_active: false }).eq('order_id', orderId);
  await supabase.from('users').update({ is_banned: true }).eq('id', o.user_id);

  const amt = Number(o.total_amount || 0);
  const paymentMsg =
    context.source === 'cron'
      ? 'Redeem auto-seized: payment due time passed without manual payment'
      : 'Redeem seized (unpaid): access revoked; notional amount reversed';

  const { error: paymentError } = await supabase.from('payment_events').insert({
    order_id: orderId,
    user_id: o.user_id,
    event_type: 'redeem_seized',
    amount: amt > 0 ? -amt : 0,
    message: paymentMsg,
    meta: { seized_by: context.seizedByUserId, auto: context.source === 'cron' },
  });
  if (paymentError) console.error('[redeemSeize] payment_events insert:', paymentError);

  const { error: oeErr } = await supabase.from('order_events').insert({
    order_id: orderId,
    user_id: o.user_id,
    event_type: 'redeem_seized',
    status: 'cancelled',
    message:
      context.source === 'cron'
        ? 'System auto-seized redeem order (payment due date passed)'
        : 'Admin seized redeem order (manual payment not received)',
    meta: { admin_id: context.seizedByUserId, auto: context.source === 'cron' },
  });
  if (oeErr) console.error('[redeemSeize] order_events insert:', oeErr);

  return { ok: true };
}

/** Orders where admin never marked paid and the due window has passed (cron). */
export async function listRedeemOrderIdsPastDue(supabase: SupabaseClient): Promise<string[]> {
  const now = Date.now();
  const { data, error } = await supabase
    .from('orders')
    .select('id, payment_due_date, created_at')
    .eq('payment_method', 'redeem_code')
    .eq('payment_status', 'pending')
    .in('status', ['pending', 'completed'])
    .is('redeem_seized_at', null);

  if (error || !data?.length) {
    if (error) console.error('[redeemSeize] list overdue:', error);
    return [];
  }

  const ids: string[] = [];
  for (const row of data) {
    const r = row as { id: string; payment_due_date: string | null; created_at: string };
    const dueMs = r.payment_due_date
      ? new Date(r.payment_due_date).getTime()
      : new Date(r.created_at).getTime() + 24 * 60 * 60 * 1000;
    if (now > dueMs) ids.push(r.id);
  }
  return ids;
}

/**
 * Undo seize for a customer who pays / returns later: unban, reactivate emails, new 24h payment window.
 */
export async function restoreRedeemOrderAfterSeize(
  supabase: SupabaseClient,
  orderId: string,
  adminUserId: string | null,
): Promise<SeizeRedeemResult> {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, user_id, redeem_seized_at, payment_method')
    .eq('id', orderId)
    .single();

  if (orderError || !order) return { ok: false, error: 'Order not found', code: 'not_found' };

  const o = order as { user_id: string; redeem_seized_at?: string | null; payment_method?: string };
  if (o.payment_method !== 'redeem_code') {
    return { ok: false, error: 'Not a redeem order', code: 'not_eligible' };
  }
  if (!o.redeem_seized_at) {
    return { ok: false, error: 'Order was not seized — nothing to restore', code: 'not_eligible' };
  }

  const seizedMs = new Date(o.redeem_seized_at).getTime();
  if (!Number.isFinite(seizedMs)) {
    return { ok: false, error: 'Invalid seize timestamp', code: 'not_eligible' };
  }
  if (Date.now() > seizedMs + REDEEM_RESTORE_WINDOW_MS) {
    return {
      ok: false,
      error:
        'Restore is no longer allowed: more than 48 hours have passed since this account was seized.',
      code: 'restore_expired',
    };
  }

  const { data: targetUser } = await supabase.from('users').select('role').eq('id', o.user_id).single();
  if (targetUser?.role === 'admin' || targetUser?.role === 'super_admin') {
    return { ok: false, error: 'Cannot restore admin accounts this way', code: 'admin_user' };
  }

  const newDue = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data: updated, error: updateError } = await supabase
    .from('orders')
    .update({
      status: 'completed',
      payment_status: 'pending',
      redeem_pending: true,
      redeem_seized_at: null,
      redeem_seized_by: null,
      payment_due_date: newDue,
    })
    .eq('id', orderId)
    .eq('payment_method', 'redeem_code')
    .not('redeem_seized_at', 'is', null)
    .select('id')
    .maybeSingle();

  if (updateError) return { ok: false, error: updateError.message, code: 'update_failed' };
  if (!updated?.id) {
    return { ok: false, error: 'Order was not seized or was already restored', code: 'not_eligible' };
  }

  await supabase.from('users').update({ is_banned: false }).eq('id', o.user_id);
  await supabase.from('user_emails').update({ is_active: true }).eq('order_id', orderId);

  const { error: oeErr } = await supabase.from('order_events').insert({
    order_id: orderId,
    user_id: o.user_id,
    event_type: 'redeem_restored',
    status: 'completed',
    message: 'Admin restored redeem access after prior seize; new payment due window started',
    meta: { admin_id: adminUserId },
  });
  if (oeErr) console.error('[redeemRestore] order_events insert:', oeErr);

  return { ok: true };
}

export async function runAutoSeizeOverdueRedeemOrders(supabase: SupabaseClient): Promise<{
  scanned: number;
  seized: number;
  errors: string[];
}> {
  const ids = await listRedeemOrderIdsPastDue(supabase);
  const errors: string[] = [];
  let seized = 0;
  for (const id of ids) {
    const r = await seizeRedeemOrderForUnpaid(supabase, id, { seizedByUserId: null, source: 'cron' });
    if (r.ok === true) seized++;
    else if (r.code !== 'already_seized' && r.code !== 'not_eligible') {
      errors.push(`${id}: ${r.error}`);
    }
  }
  return { scanned: ids.length, seized, errors };
}
