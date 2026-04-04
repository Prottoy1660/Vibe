import type { SupabaseClient } from '@supabase/supabase-js';

export type ReferralProgramSettings = {
  enabled: boolean;
  auto_process_on_order_complete: boolean;
  referrer_reward_min: number;
  referrer_reward_max: number;
  referee_bonus_matches_referrer: boolean;
  referee_bonus_fixed: number;
  min_order_total_bdt: number;
  risk_review_from: number;
  risk_block_from: number;
  daily_cap_per_referrer_bdt: number;
};

const DEFAULT_SETTINGS: ReferralProgramSettings = {
  enabled: true,
  auto_process_on_order_complete: true,
  referrer_reward_min: 50,
  referrer_reward_max: 100,
  referee_bonus_matches_referrer: true,
  referee_bonus_fixed: 50,
  min_order_total_bdt: 100,
  /** Above this → manual review before credits (fraud signals). */
  risk_review_from: 52,
  /** At or above → no credits until admin overrides. */
  risk_block_from: 88,
  daily_cap_per_referrer_bdt: 1000,
};

export async function loadReferralSettings(supabase: SupabaseClient): Promise<ReferralProgramSettings> {
  const { data } = await supabase.from('system_settings').select('value').eq('key', 'referral_program').maybeSingle();
  const v = (data?.value || {}) as Partial<ReferralProgramSettings>;
  return { ...DEFAULT_SETTINGS, ...v };
}

export function normalizeBdPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const d = String(raw).replace(/\D/g, '');
  if (d.startsWith('880') && d.length >= 12) return d;
  if (d.startsWith('0') && d.length >= 11) return `880${d.slice(1)}`;
  if (d.length >= 10) return d;
  return d;
}

async function sessionOverlapSignals(
  supabase: SupabaseClient,
  userA: string,
  userB: string
): Promise<{ shared_canvas: boolean; shared_ip: boolean }> {
  try {
    const [ra, rb] = await Promise.all([
      supabase
        .from('user_sessions')
        .select('canvas_fingerprint, ip_address')
        .eq('user_id', userA)
        .limit(400),
      supabase
        .from('user_sessions')
        .select('canvas_fingerprint, ip_address')
        .eq('user_id', userB)
        .limit(400),
    ]);
    if (ra.error || rb.error) {
      return { shared_canvas: false, shared_ip: false };
    }
    const sa = ra.data;
    const sb = rb.data;
    const canvA = new Set(
      (sa || []).map((r: any) => r.canvas_fingerprint).filter(Boolean) as string[]
    );
    const ipA = new Set((sa || []).map((r: any) => r.ip_address).filter(Boolean) as string[]);
    let shared_canvas = false;
    let shared_ip = false;
    for (const r of sb || []) {
      if (r.canvas_fingerprint && canvA.has(r.canvas_fingerprint)) shared_canvas = true;
      if (r.ip_address && ipA.has(r.ip_address)) shared_ip = true;
    }
    return { shared_canvas, shared_ip };
  } catch {
    return { shared_canvas: false, shared_ip: false };
  }
}

async function computeReferralRisk(args: {
  supabase: SupabaseClient;
  referrerId: string;
  refereeId: string;
  referrerPhone: string;
  refereePhone: string;
  referrerEmail: string;
  refereeEmail: string;
}): Promise<{ score: number; signals: Record<string, boolean | string | number> }> {
  const { supabase, referrerId, refereeId, referrerPhone, refereePhone, referrerEmail, refereeEmail } = args;
  const signals: Record<string, boolean | string | number> = {};
  let score = 0;

  const rp = normalizeBdPhone(refereePhone);
  const refp = normalizeBdPhone(referrerPhone);
  if (rp && refp && rp === refp) {
    signals.same_phone_as_referrer = true;
    score += 50;
  }

  const reLocal = (refereeEmail || '').split('@')[0]?.toLowerCase() || '';
  const rrLocal = (referrerEmail || '').split('@')[0]?.toLowerCase() || '';
  const reDom = (refereeEmail || '').split('@')[1]?.toLowerCase() || '';
  const rrDom = (referrerEmail || '').split('@')[1]?.toLowerCase() || '';
  if (reDom && reDom === rrDom && reLocal && reLocal === rrLocal) {
    signals.identical_email = true;
    score += 80;
  } else if (reDom && reDom === rrDom && reLocal && rrLocal && Math.abs(reLocal.length - rrLocal.length) <= 1) {
    signals.similar_local_part_same_domain = true;
    score += 20;
  }

  const phoneVariants = [...new Set([refereePhone, rp].filter(Boolean))] as string[];
  if (phoneVariants.length) {
    const { count } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .neq('id', refereeId)
      .in('phone', phoneVariants);
    const c = count || 0;
    if (c > 0) {
      signals.referee_phone_reuse_other_account = true;
      signals.referee_phone_reuse_count = c;
      score += 25;
    }
  }

  const overlap = await sessionOverlapSignals(supabase, referrerId, refereeId);
  if (overlap.shared_canvas) {
    signals.shared_canvas_fingerprint = true;
    score += 28;
  }
  if (overlap.shared_ip) {
    signals.shared_ip_address = true;
    score += 20;
  }

  return { score, signals };
}

async function grantPromotionalCredits(
  supabase: SupabaseClient,
  userId: string,
  amount: number
): Promise<void> {
  const { data: row } = await supabase.from('users').select('wallet_promotional_balance').eq('id', userId).single();
  const cur = Number((row as any)?.wallet_promotional_balance || 0);
  await supabase
    .from('users')
    .update({ wallet_promotional_balance: cur + amount })
    .eq('id', userId);
}

/**
 * Called when an order reaches completed (webhook, wallet-only path, dev sim).
 * Idempotent via unique (referrer, referee, source_order_id).
 */
export async function tryProcessReferralRewardsForOrder(
  supabase: SupabaseClient,
  orderId: string,
  opts?: { force?: boolean }
): Promise<{ ok: boolean; skipped?: string; reward_amount?: number; status?: string }> {
  const settings = await loadReferralSettings(supabase);
  if (!settings.enabled && !opts?.force) {
    return { ok: true, skipped: 'referral_program_disabled' };
  }
  if (!settings.auto_process_on_order_complete && !opts?.force) {
    return { ok: true, skipped: 'auto_process_off' };
  }

  const { data: order } = await supabase
    .from('orders')
    .select('id, user_id, total_amount, status, payment_status')
    .eq('id', orderId)
    .single();

  if (!order || order.status !== 'completed') {
    return { ok: true, skipped: 'order_not_completed' };
  }

  const orderTotal = Number(order.total_amount || 0);
  if (!Number.isFinite(orderTotal) || orderTotal < settings.min_order_total_bdt) {
    return { ok: true, skipped: 'order_total_below_minimum' };
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('id, referred_by_code, email, phone')
    .eq('id', order.user_id)
    .single();

  const refCode = ((userRow as any)?.referred_by_code || '').trim().toUpperCase();
  if (!refCode) {
    return { ok: true, skipped: 'no_referred_by_code' };
  }

  const { data: ownerCode } = await supabase
    .from('referral_codes')
    .select('owner_user_id, code, is_active')
    .eq('code', refCode)
    .maybeSingle();

  if (!ownerCode?.is_active || !ownerCode.owner_user_id || ownerCode.owner_user_id === order.user_id) {
    return { ok: true, skipped: 'invalid_referral_source' };
  }

  const referrerId = ownerCode.owner_user_id as string;
  const refereeId = order.user_id as string;

  const { data: referrerProfile } = await supabase
    .from('users')
    .select('id, email, phone')
    .eq('id', referrerId)
    .single();

  const { score, signals } = await computeReferralRisk({
    supabase,
    referrerId,
    refereeId,
    referrerPhone: (referrerProfile as any)?.phone || '',
    refereePhone: (userRow as any)?.phone || '',
    referrerEmail: (referrerProfile as any)?.email || '',
    refereeEmail: (userRow as any)?.email || '',
  });

  const pct = Math.round(orderTotal * 0.1);
  let rewardAmount = Math.min(settings.referrer_reward_max, Math.max(settings.referrer_reward_min, pct));
  if (!Number.isFinite(rewardAmount) || rewardAmount < settings.referrer_reward_min) {
    rewardAmount = settings.referrer_reward_min;
  }

  const refereeBonus = settings.referee_bonus_matches_referrer
    ? rewardAmount
    : Math.min(settings.referrer_reward_max, Math.max(settings.referrer_reward_min, settings.referee_bonus_fixed));

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { data: dailyRewards } = await supabase
    .from('referral_rewards')
    .select('reward_amount')
    .eq('referrer_user_id', referrerId)
    .gte('created_at', todayStart.toISOString());
  const todayTotal = (dailyRewards || []).reduce((acc: number, r: any) => acc + Number(r.reward_amount || 0), 0);
  if (todayTotal + rewardAmount > settings.daily_cap_per_referrer_bdt) {
    await supabase.from('risk_events').insert({
      user_id: referrerId,
      order_id: order.id,
      risk_type: 'referral_daily_cap_hit',
      severity: 'medium',
      message: 'Referral reward blocked by daily cap',
      meta: { attempted_reward: rewardAmount, daily_total: todayTotal },
    });
    return { ok: true, skipped: 'daily_cap_exceeded' };
  }

  let status: string = 'granted';
  if (score >= settings.risk_block_from) {
    status = 'blocked';
  } else if (score >= settings.risk_review_from) {
    status = 'pending_review';
  }

  const insertPayload = {
    referrer_user_id: referrerId,
    referee_user_id: refereeId,
    source_order_id: order.id,
    reward_amount: rewardAmount,
    status,
    fraud_signals: { ...signals, referee_bonus_bdt: refereeBonus },
    risk_score: score,
  };

  const { error: insErr } = await supabase.from('referral_rewards').insert(insertPayload as any);
  if (insErr) {
    if (String(insErr.message || '').includes('duplicate') || insErr.code === '23505') {
      return { ok: true, skipped: 'already_recorded' };
    }
    console.error('referral_rewards insert:', insErr);
    return { ok: false, skipped: insErr.message };
  }

  if (score >= settings.risk_review_from) {
    await supabase.from('risk_events').insert({
      user_id: refereeId,
      order_id: order.id,
      risk_type: status === 'blocked' ? 'referral_blocked' : 'referral_pending_review',
      severity: status === 'blocked' ? 'high' : 'medium',
      message: `Referral reward ${status.replace('_', ' ')} (risk_score=${score})`,
      meta: { referrer_user_id: referrerId, signals, reward_amount: rewardAmount },
    });
  }

  if (status === 'granted') {
    await grantPromotionalCredits(supabase, referrerId, rewardAmount);
    await grantPromotionalCredits(supabase, refereeId, refereeBonus);
  }

  return { ok: true, reward_amount: rewardAmount, status };
}

export async function adminGrantReferralRewardRow(
  supabase: SupabaseClient,
  rewardId: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: row } = await supabase.from('referral_rewards').select('*').eq('id', rewardId).single();
  if (!row) return { ok: false, error: 'not_found' };
  if ((row as any).status === 'granted') return { ok: true };

  const signals = ((row as any).fraud_signals || {}) as Record<string, unknown>;
  const refereeBonus =
    Number(signals.referee_bonus_bdt || signals.referee_bonus || (row as any).reward_amount || 0) ||
    Number((row as any).reward_amount || 0);

  await grantPromotionalCredits(supabase, (row as any).referrer_user_id, Number((row as any).reward_amount || 0));
  await grantPromotionalCredits(supabase, (row as any).referee_user_id, refereeBonus);

  await supabase.from('referral_rewards').update({ status: 'granted' }).eq('id', rewardId);
  return { ok: true };
}
