/**
 * Smart email assignment helper that respects product configuration:
 * - email_slots: how many emails a user can generate per order (default 3)
 * - max_users_per_email: how many users share one email (1 = exclusive, 2+ = shared slot)
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
      // EXCLUSIVE MODE: Find a fully available email (status = 'available')
      const { data: available } = await supabase
        .from('emails_pool')
        .select('id')
        .eq('status', 'available')
        .limit(1)
        .single();

      if (!available) return { success: false, error: 'No available emails in the pool.' };

      // Mark as fully assigned (status = 'assigned', current_users = 1)
      await supabase
        .from('emails_pool')
        .update({
          status: 'assigned',
          assigned_at: new Date().toISOString(),
          current_users: 1,
        })
        .eq('id', available.id);

      emailId = available.id;
    } else {
      // SHARED SLOT MODE: Find an email with free slots
      // First try existing partially-filled shared emails for this product
      const { data: partialEmail } = await supabase
        .from('emails_pool')
        .select('id, current_users')
        .eq('status', 'shared')
        .eq('product_id', productId)
        .lt('current_users', maxUsersPerEmail)
        .order('current_users', { ascending: false }) // fill the most-used first
        .limit(1)
        .single();

      if (partialEmail) {
        // Fill this slot
        const newCount = (partialEmail.current_users ?? 0) + 1;
        await supabase
          .from('emails_pool')
          .update({
            current_users: newCount,
            // If now full, mark as assigned (no more room)
            status: newCount >= maxUsersPerEmail ? 'assigned' : 'shared',
          })
          .eq('id', partialEmail.id);

        emailId = partialEmail.id;
      } else {
        // No shared slot open — open a new one from available pool
        const { data: freshEmail } = await supabase
          .from('emails_pool')
          .select('id')
          .eq('status', 'available')
          .limit(1)
          .single();

        if (!freshEmail) return { success: false, error: 'No available emails in the pool.' };

        await supabase
          .from('emails_pool')
          .update({
            status: maxUsersPerEmail > 1 ? 'shared' : 'assigned',
            product_id: productId,
            assigned_at: new Date().toISOString(),
            current_users: 1,
          })
          .eq('id', freshEmail.id);

        emailId = freshEmail.id;
      }
    }

    // Link to user
    await supabase.from('user_emails').insert({
      user_id: userId,
      email_id: emailId,
      order_id: orderId,
      is_active: true,
    });

    return { success: true, emailId: emailId! };
  } catch (err: any) {
    console.error('[assignEmailForOrder] Error:', err);
    return { success: false, error: err.message };
  }
}
