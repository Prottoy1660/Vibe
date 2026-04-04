/**
 * Smart email assignment helper that respects product configuration:
 * - email_slots: how many emails a user can generate per order (default 3)
 * - max_users_per_email: how many users share one email (1 = exclusive, 2+ = shared slot)
 *
 * SHARED MODE logic (avoids adding a new 'shared' status enum value):
 * - Fresh / unoccupied email: status='available', product_id=NULL, current_users=0
 * - Partially filled shared slot: status='available', product_id=<product>, current_users=1..N-1
 * - Fully filled / exclusive: status='assigned', current_users=N
 *
 * So to find a partially-filled shared slot we query:
 *   status = 'available' AND product_id = <productId> AND current_users > 0 AND current_users < max
 */
export async function assignEmailForOrder(
  supabase: any,
  orderId: string,
  _userId: string,
  _productId: string
): Promise<{
  success: boolean;
  emailId?: string;
  error?: string;
  code?: string;
  nextEligibleAt?: string;
}> {
  try {
    // All strict shared-slot rules and concurrency protection are enforced inside the DB RPC.
    const { data, error } = await supabase.rpc('assign_email_for_order_strict_24h', {
      p_order_id: orderId,
    });

    if (error) {
      console.error('[assignEmailForOrder] RPC error:', error);
      return { success: false, error: error.message };
    }

    const payload = data as any;
    if (!payload?.success) {
      return {
        success: false,
        error: payload?.error || 'Email assignment failed',
        code: payload?.code,
        nextEligibleAt: payload?.next_eligible_at,
      };
    }

    return { success: true, emailId: payload?.email_id || payload?.emailId };
  } catch (err: any) {
    console.error('[assignEmailForOrder] Error:', err);
    return { success: false, error: err.message };
  }
}
