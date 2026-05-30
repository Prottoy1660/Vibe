import type { SupabaseClient } from '@supabase/supabase-js';

/** Ensure `public.users.role = reseller` after Super Reseller sign-up (service role). */
export async function ensureResellerPublicProfile(
  supabase: SupabaseClient,
  args: { userId: string; email: string; name: string; phone?: string },
): Promise<{ ok: boolean; error?: string }> {
  const { userId, email, name, phone } = args;

  await supabase.auth.admin.updateUserById(userId, {
    user_metadata: {
      role: 'reseller',
      full_name: name,
      ...(phone ? { phone } : {}),
    },
  });

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data: row } = await supabase.from('users').select('id, role').eq('id', userId).maybeSingle();
    if (row) {
      if (row.role === 'admin' || row.role === 'super_admin') {
        return { ok: false, error: 'This account cannot be used as a reseller.' };
      }
      if (row.role !== 'reseller') {
        const { error } = await supabase
          .from('users')
          .update({ role: 'reseller', name, phone: phone || null })
          .eq('id', userId);
        if (error) return { ok: false, error: error.message };
      }
      return { ok: true };
    }
    await new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1)));
  }

  const { error: insertErr } = await supabase.from('users').insert({
    id: userId,
    email,
    name: name.slice(0, 100) || email.split('@')[0]?.slice(0, 100) || 'Reseller',
    role: 'reseller',
    phone: phone || null,
    signup_auth_provider: 'email',
    last_sign_in_provider: 'email',
  });
  if (insertErr && insertErr.code !== '23505') {
    return { ok: false, error: insertErr.message };
  }

  const { error: updateErr } = await supabase
    .from('users')
    .update({ role: 'reseller', name, phone: phone || null })
    .eq('id', userId);
  if (updateErr) return { ok: false, error: updateErr.message };

  return { ok: true };
}
