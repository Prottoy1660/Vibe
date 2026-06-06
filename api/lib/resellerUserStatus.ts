import { getAdobeOrgSnapshotByEmail, getAdobePanelUserByEmail } from './adobeApi.js'

export function formatPlanDurationLabel(durationMonths: string, durationDays: number): string {
  const raw = String(durationMonths || '').trim()
  if (raw.endsWith('d')) {
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? `${n} day${n === 1 ? '' : 's'}` : raw
  }
  const months = parseInt(raw, 10)
  if (Number.isFinite(months) && months > 0) {
    return months === 1 ? '1 month' : `${months} months`
  }
  if (durationDays > 0) {
    return durationDays === 1 ? '1 day' : `${durationDays} days`
  }
  return raw || '—'
}

export type ResellerUserStatusPayload = {
  id: string
  email: string
  overallStatus: 'active' | 'expired' | 'refunded' | string
  teamStatus: 'normal' | 'attention' | 'unknown'
  teamMessage: string
  organizationName: string | null
  organizationId: number | null
  products: string[]
  planDuration: string
  activatedAt: string | null
  expiresAt: string | null
  daysLeft: number
  progressPercent: number
  adobeLive: boolean
  organizationSyncedAt: string | null
  refundEligible: boolean
  refundRemainingMs: number | null
  adobeStatus: string | null
}

export function buildResellerUserStatusFromRow(row: Record<string, unknown>): ResellerUserStatusPayload {
  const email = String(row.customer_email || '').trim().toLowerCase()
  const live = getAdobePanelUserByEmail(email)
  const orgSnap = getAdobeOrgSnapshotByEmail(email)

  const activatedAt = row.activated_at ? String(row.activated_at) : ''
  const expiresAt =
    (live?.expiresAt ? String(live.expiresAt) : null) ||
    (row.expires_at ? String(row.expires_at) : '')

  const activatedMs = activatedAt ? new Date(activatedAt).getTime() : NaN
  const expiresMs = expiresAt ? new Date(expiresAt).getTime() : NaN
  const nowMs = Date.now()

  let daysLeft = 0
  let progressPercent = 0
  if (Number.isFinite(expiresMs)) {
    daysLeft = Math.max(0, Math.ceil((expiresMs - nowMs) / (24 * 60 * 60 * 1000)))
  }
  if (Number.isFinite(activatedMs) && Number.isFinite(expiresMs) && expiresMs > activatedMs) {
    const total = expiresMs - activatedMs
    const elapsed = Math.min(total, Math.max(0, nowMs - activatedMs))
    progressPercent = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)))
  }

  const localStatus = String(row.status || 'active')
  const isExpired =
    localStatus === 'expired' ||
    (Number.isFinite(expiresMs) && expiresMs <= nowMs) ||
    String(live?.status || '').toLowerCase() === 'expired'

  const adobeLive = !!live
  const organizationName =
    (row.adobe_organization_name as string | null | undefined) ||
    live?.organizationName ||
    orgSnap?.organizationName ||
    null

  const products =
    Array.isArray(row.products) && row.products.length > 0
      ? (row.products as string[])
      : live?.displayProducts?.length
        ? live.displayProducts
        : live?.products?.length
          ? live.products
          : orgSnap?.displayProducts?.length
            ? orgSnap.displayProducts
            : []

  let teamStatus: 'normal' | 'attention' | 'unknown' = 'unknown'
  let teamMessage = 'Organization data has not been synced yet.'
  if (isExpired) {
    teamStatus = 'attention'
    teamMessage = 'This subscription has expired.'
  } else if (adobeLive && organizationName) {
    teamStatus = 'normal'
    teamMessage = 'This team is operating normally on Adobe credits-pool.'
  } else if (adobeLive) {
    teamStatus = 'attention'
    teamMessage = 'Account is active on Adobe but organization name is pending sync.'
  } else if (localStatus === 'active') {
    teamStatus = 'attention'
    teamMessage = 'Not found on Adobe credits-pool yet — try refreshing status.'
  }

  const refundWindowMs = 24 * 60 * 60 * 1000
  let refundEligible = false
  let refundRemainingMs: number | null = null
  if (localStatus === 'active' && Number.isFinite(activatedMs)) {
    const deadline = activatedMs + refundWindowMs
    const remaining = deadline - nowMs
    if (remaining > 0) {
      refundEligible = true
      refundRemainingMs = remaining
    }
  }

  const overallStatus =
    localStatus === 'refunded'
      ? 'refunded'
      : isExpired
        ? 'expired'
        : localStatus === 'active'
          ? 'active'
          : localStatus

  return {
    id: String(row.id),
    email: String(row.customer_email || ''),
    overallStatus,
    teamStatus,
    teamMessage,
    organizationName,
    organizationId:
      (row.adobe_organization_id as number | null | undefined) ??
      live?.organizationId ??
      orgSnap?.organizationId ??
      null,
    products,
    planDuration: formatPlanDurationLabel(
      String(row.duration_months || ''),
      Number(row.duration_days) || 0,
    ),
    activatedAt: activatedAt || null,
    expiresAt: expiresAt || null,
    daysLeft,
    progressPercent,
    adobeLive,
    organizationSyncedAt: (row.adobe_synced_at as string | null | undefined) ?? null,
    refundEligible,
    refundRemainingMs,
    adobeStatus: live?.status ?? null,
  }
}
