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
  userId: string,
  productId: string
): Promise<{ success: boolean; emailId?: string; error?: string }> {
  try {
    // Fetch product config
    const { data: product } = await supabase
      .from('products')
      .select('email_slots, max_users_per_email')
      .eq('id', productId)
      .single();

    const maxUsersPerEmail = product?.max_users_per_email ?? 1;

    let emailId: string | null = null;

    if (maxUsersPerEmail <= 1) {
      // ── EXCLUSIVE MODE ──────────────────────────────────────────────────
      // Pick any fresh available email (no product_id set, current_users = 0)
      const { data: available } = await supabase
        .from('emails_pool')
        .select('id')
        .eq('status', 'available')
        .is('product_id', null)     // truly unoccupied
        .limit(1)
        .single();

      if (!available) {
        // Fallback: any 'available' email even if product_id was set (legacy rows)
        const { data: fallback } = await supabase
          .from('emails_pool')
          .select('id')
          .eq('status', 'available')
          .limit(1)
          .single();
        if (!fallback) return { success: false, error: 'No available emails in the pool.' };
        emailId = fallback.id;
      } else {
        emailId = available.id;
      }

      // Mark as exclusively assigned
      await supabase.from('emails_pool').update({
        status: 'assigned',
        assigned_at: new Date().toISOString(),
        current_users: 1,
        product_id: productId,
      }).eq('id', emailId);

    } else {
      // ── SHARED SLOT MODE ────────────────────────────────────────────────
      // 1. Try to find an existing partially-filled slot for this product
      const { data: partialEmail } = await supabase
        .from('emails_pool')
        .select('id, current_users')
        .eq('status', 'available')      // still open (not 'assigned' yet)
        .eq('product_id', productId)    // belongs to this product's shared pool
        .gt('current_users', 0)         // already has someone in it
        .lt('current_users', maxUsersPerEmail) // still has room
        .order('current_users', { ascending: false }) // fill most-used first
        .limit(1)
        .single();

      if (partialEmail) {
        // ✅ Found a slot — join it
        const newCount = (partialEmail.current_users ?? 0) + 1;
        await supabase.from('emails_pool').update({
          current_users: newCount,
          // When slot is now full, flip to 'assigned' so no one else joins
          status: newCount >= maxUsersPerEmail ? 'assigned' : 'available',
        }).eq('id', partialEmail.id);

        emailId = partialEmail.id;
        console.log(`[assignEmailForOrder] Shared slot joined: email ${emailId}, users ${newCount}/${maxUsersPerEmail}`);

      } else {
        // No existing partial slot — take a fresh email and open a new shared slot
        const { data: freshEmail } = await supabase
          .from('emails_pool')
          .select('id')
          .eq('status', 'available')
          .is('product_id', null) // completely unoccupied
          .limit(1)
          .single();

        if (!freshEmail) {
          // Fallback: any available email
          const { data: fallback } = await supabase.from('emails_pool').select('id').eq('status', 'available').limit(1).single();
          if (!fallback) return { success: false, error: 'No available emails in the pool.' };
          emailId = fallback.id;
        } else {
          emailId = freshEmail.id;
        }

        // Open this email as a shared slot (status stays 'available' so next user can join)
        await supabase.from('emails_pool').update({
          status: 'available',           // keep available so next user can find it
          product_id: productId,         // tag it to this product's shared pool
          assigned_at: new Date().toISOString(),
          current_users: 1,             // first occupant
        }).eq('id', emailId);

        console.log(`[assignEmailForOrder] New shared slot opened: email ${emailId}, max ${maxUsersPerEmail}`);
      }
    }

    // Link email to this user's order
    const { error: insertError } = await supabase.from('user_emails').insert({
      user_id: userId,
      email_id: emailId,
      order_id: orderId,
      is_active: true,
    });

    if (insertError) {
      console.error('[assignEmailForOrder] Failed to insert user_email relation:', insertError);
      throw insertError;
    }

    return { success: true, emailId: emailId! };
  } catch (err: any) {
    console.error('[assignEmailForOrder] Error:', err);
    return { success: false, error: err.message };
  }
}
