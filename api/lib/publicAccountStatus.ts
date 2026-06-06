import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { addDays, addMonths, addWeeks, addYears, differenceInDays, isPast, parseISO } from 'date-fns'
import { fetchAdobePanelUsers } from './adobeApi.js'
import { buildResellerUserStatusFromRow, type ResellerUserStatusPayload } from './resellerUserStatus.js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase: SupabaseClient | null =
  supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null

type DurationUnit = 'day' | 'week' | 'month' | 'year'

function parseDurationSpec(duration: string): { value: number; unit: DurationUnit } {
  const lower = String(duration || '').trim().toLowerCase()
  const numMatch = lower.match(/\d+/)
  const value = Math.max(1, numMatch ? parseInt(numMatch[0], 10) : 1)

  if (lower.includes('day')) return { value, unit: 'day' }
  if (lower.includes('week') || lower.includes('wk')) return { value, unit: 'week' }
  if (lower.includes('year') || lower.includes('yr')) return { value, unit: 'year' }
  return { value, unit: 'month' }
}

function parseDurationToDays(duration: string): number {
  const spec = parseDurationSpec(duration)
  if (spec.unit === 'day') return spec.value
  if (spec.unit === 'week') return spec.value * 7
  if (spec.unit === 'year') return spec.value * 365
  return spec.value * 30
}

function addDurationToDate(date: Date, duration: string): Date {
  const spec = parseDurationSpec(duration)
  if (spec.unit === 'day') return addDays(date, spec.value)
  if (spec.unit === 'week') return addWeeks(date, spec.value)
  if (spec.unit === 'year') return addYears(date, spec.value)
  return addMonths(date, spec.value)
}

export type PublicSharedEmail = {
  id: string
  email: string
  password: string
  assignedAt: string
  isActive: boolean
  isReplaced: boolean
  subscription: {
    duration: string
    expiresAt: string
    daysLeft: number
    isExpired: boolean
    totalDays: number
  } | null
}

export type PublicSharedPlan = {
  orderId: string
  planIndex: number
  isActive: boolean
  autoRenew: boolean
  slotLimit: number
  emailsGenerated: number
  emails: PublicSharedEmail[]
}

export type PublicPersonalPlan = {
  orderId: string
  personalEmail: string
  productTitle: string
  status: string
  paymentStatus: string
  daysLeft: number
  totalDays: number
  expiresAt: string | null
  isExpired: boolean
  autoRenew: boolean
  deliveredAt: string | null
  createdAt: string
}

export type PublicAccountSearchResult = {
  searchedEmail: string
  account: { id: string; email: string; name: string | null } | null
  vibe: {
    sharedPlans: PublicSharedPlan[]
    personalPlans: PublicPersonalPlan[]
  } | null
  resellerSubscriptions: ResellerUserStatusPayload[]
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function orderIsVisible(status: string | null | undefined, paymentMethod: string | null | undefined): boolean {
  const s = String(status || '').toLowerCase()
  const pm = String(paymentMethod || '').toLowerCase()
  if (s === 'refunded' || s === 'cancelled') return false
  if (s === 'paid' || s === 'completed') return true
  if (s === 'pending' && pm === 'redeem_code') return true
  return false
}

function buildSharedPlansFromUserEmails(userEmails: any[]): PublicSharedPlan[] {
  const filtered = (userEmails || []).filter((item) =>
    orderIsVisible(item.orders?.status, item.orders?.payment_method),
  )

  const byOrder = new Map<string, any[]>()
  for (const item of filtered) {
    const orderId = String(item.order_id || 'unassigned')
    if (!byOrder.has(orderId)) byOrder.set(orderId, [])
    byOrder.get(orderId)!.push(item)
  }

  const plans: PublicSharedPlan[] = []
  let planIndex = 0

  for (const [orderId, orderEmails] of byOrder.entries()) {
    planIndex += 1
    const sorted = [...orderEmails].sort(
      (a, b) => new Date(String(a.assigned_at)).getTime() - new Date(String(b.assigned_at)).getTime(),
    )
    const first = sorted[0]
    const product = first?.orders?.products
    const prod = Array.isArray(product) ? product[0] : product
    const slotLimit = Number(prod?.email_slots) || 1

    const emails: PublicSharedEmail[] = sorted.map((item, emailIndex) => {
      let subscription: PublicSharedEmail['subscription'] = null
      if (item.orders?.products) {
        const durationStr = String(item.orders.products.duration || '')
        const totalDays = parseDurationToDays(durationStr)
        const orderDate = parseISO(String(item.orders.created_at))
        const expiresAt = addDurationToDate(orderDate, durationStr)
        const isExpired = isPast(expiresAt)
        const daysLeft = isExpired ? 0 : differenceInDays(expiresAt, new Date())
        subscription = {
          duration: durationStr,
          expiresAt: expiresAt.toISOString(),
          daysLeft,
          isExpired,
          totalDays,
        }
      }

      const pool = item.emails_pool
      const poolRow = Array.isArray(pool) ? pool[0] : pool

      return {
        id: String(item.id),
        email: String(poolRow?.email || 'Unknown'),
        password: String(poolRow?.password || ''),
        assignedAt: String(item.assigned_at),
        isActive: item.is_active !== false,
        isReplaced: emailIndex > 0,
        subscription,
      }
    })

    const firstSub = emails[0]?.subscription
    plans.push({
      orderId,
      planIndex,
      isActive: !!firstSub && !firstSub.isExpired,
      autoRenew: first?.orders?.auto_renew === true,
      slotLimit,
      emailsGenerated: emails.length,
      emails,
    })
  }

  return plans
}

function buildPersonalPlans(orders: any[]): PublicPersonalPlan[] {
  return (orders || [])
    .filter((order) => {
      const prod = Array.isArray(order.products) ? order.products[0] : order.products
      if (!prod?.is_personal || !order.personal_email) return false
      const status = String(order.status || '').toLowerCase()
      const paymentStatus = String(order.payment_status || '').toLowerCase()
      if (status === 'refunded' || status === 'cancelled') return false
      if (paymentStatus === 'refunded' || paymentStatus === 'cancelled' || paymentStatus === 'failed') return false
      return status === 'completed' || status === 'paid' || paymentStatus === 'paid'
    })
    .map((order) => {
      const prod = Array.isArray(order.products) ? order.products[0] : order.products
      const durationStr = String(prod?.duration || '')
      const totalDays = parseDurationToDays(durationStr)
      let daysLeft = 0
      let expiresAt: string | null = null
      let isExpired = false

      if (order.status === 'completed' || order.status === 'paid') {
        const orderDate = parseISO(String(order.created_at))
        const exp = addDurationToDate(orderDate, durationStr)
        isExpired = isPast(exp)
        daysLeft = isExpired ? 0 : differenceInDays(exp, new Date())
        expiresAt = exp.toISOString()
      }

      return {
        orderId: String(order.id),
        personalEmail: String(order.personal_email),
        productTitle: String(prod?.title || 'Personal plan'),
        status: String(order.status || ''),
        paymentStatus: String(order.payment_status || ''),
        daysLeft,
        totalDays,
        expiresAt,
        isExpired,
        autoRenew: order.auto_renew === true,
        deliveredAt: order.delivered_at ? String(order.delivered_at) : null,
        createdAt: String(order.created_at),
      }
    })
}

async function fetchUserEmailsForAccount(userId: string) {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('user_emails')
    .select(`
      id,
      email_id,
      order_id,
      assigned_at,
      is_active,
      emails_pool:email_id (email, password),
      orders:order_id (
        id,
        created_at,
        status,
        payment_method,
        auto_renew,
        products:product_id (id, duration, email_slots, is_personal)
      )
    `)
    .eq('user_id', userId)
    .order('assigned_at', { ascending: true })

  if (error) throw error
  return data || []
}

async function fetchPersonalOrdersForUser(userId: string) {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('orders')
    .select('*, products(*)')
    .eq('user_id', userId)
    .in('status', ['paid', 'completed', 'pending'])

  if (error) throw error
  return data || []
}

export async function lookupPublicAccountByEmail(rawEmail: string): Promise<
  | { ok: true; data: PublicAccountSearchResult }
  | { ok: false; statusCode: number; error: string }
> {
  if (!supabase) {
    return { ok: false, statusCode: 503, error: 'Service unavailable.' }
  }

  const searchedEmail = rawEmail.trim().toLowerCase()
  if (!searchedEmail || !isValidEmail(searchedEmail)) {
    return { ok: false, statusCode: 400, error: 'Valid email is required.' }
  }

  const [
    userByAccountRes,
    userByPersonalRes,
    poolRes,
    resellerRes,
  ] = await Promise.all([
    supabase.from('users').select('id, email, name').eq('email', searchedEmail).maybeSingle(),
    supabase
      .from('orders')
      .select('user_id, users:user_id(id, email, name)')
      .ilike('personal_email', searchedEmail)
      .limit(5),
    supabase.from('emails_pool').select('id, email').ilike('email', searchedEmail).maybeSingle(),
    supabase.from('reseller_user_access').select('*').ilike('customer_email', searchedEmail),
  ])

  let account: PublicAccountSearchResult['account'] = null
  if (userByAccountRes.data) {
    account = {
      id: String(userByAccountRes.data.id),
      email: String(userByAccountRes.data.email || searchedEmail),
      name: userByAccountRes.data.name ?? null,
    }
  }

  const userIds = new Set<string>()
  if (account?.id) userIds.add(account.id)

  for (const row of userByPersonalRes.data || []) {
    const u = Array.isArray(row.users) ? row.users[0] : row.users
    if (u?.id) {
      userIds.add(String(u.id))
      if (!account) {
        account = {
          id: String(u.id),
          email: String(u.email || searchedEmail),
          name: u.name ?? null,
        }
      }
    } else if (row.user_id) {
      userIds.add(String(row.user_id))
    }
  }

  if (poolRes.data?.id) {
    const { data: assignment } = await supabase
      .from('user_emails')
      .select('user_id, users:user_id(id, email, name)')
      .eq('email_id', poolRes.data.id)
      .order('assigned_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const u = assignment?.users
    const userRow = Array.isArray(u) ? u[0] : u
    if (userRow?.id) {
      userIds.add(String(userRow.id))
      if (!account) {
        account = {
          id: String(userRow.id),
          email: String(userRow.email || searchedEmail),
          name: userRow.name ?? null,
        }
      }
    } else if (assignment?.user_id) {
      userIds.add(String(assignment.user_id))
    }
  }

  await fetchAdobePanelUsers(false)

  let sharedPlans: PublicSharedPlan[] = []
  let personalPlans: PublicPersonalPlan[] = []

  for (const userId of userIds) {
    const [userEmails, orders] = await Promise.all([
      fetchUserEmailsForAccount(userId),
      fetchPersonalOrdersForUser(userId),
    ])
    sharedPlans = sharedPlans.concat(buildSharedPlansFromUserEmails(userEmails))
    personalPlans = personalPlans.concat(buildPersonalPlans(orders))
  }

  if (!account && (userByPersonalRes.data?.length || 0) > 0) {
    const { data: personalOnlyOrders } = await supabase
      .from('orders')
      .select('*, products(*)')
      .ilike('personal_email', searchedEmail)
      .in('status', ['paid', 'completed', 'pending'])

    personalPlans = personalPlans.concat(buildPersonalPlans(personalOnlyOrders || []))
  }

  const resellerSubscriptions = (resellerRes.data || []).map((row) =>
    buildResellerUserStatusFromRow(row as Record<string, unknown>),
  )

  const hasVibe =
    sharedPlans.length > 0 ||
    personalPlans.some((p) => p.personalEmail.toLowerCase() === searchedEmail) ||
    personalPlans.length > 0

  const hasReseller = resellerSubscriptions.length > 0

  if (!hasVibe && !hasReseller) {
    return { ok: false, statusCode: 404, error: 'No subscription found for this email.' }
  }

  return {
    ok: true,
    data: {
      searchedEmail,
      account,
      vibe: hasVibe
        ? {
            sharedPlans,
            personalPlans: personalPlans.filter(
              (plan, index, arr) =>
                arr.findIndex((p) => p.orderId === plan.orderId) === index,
            ),
          }
        : null,
      resellerSubscriptions,
    },
  }
}
