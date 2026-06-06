import { getAdobeOrgSnapshotByEmail, getAdobePanelUserByEmail, type AdobePanelUserRow } from './adobeApi.js'

export const SUPER_RESELLER_BRAND = 'Super Reseller'

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

function computeStatusTiming(activatedAt: string, expiresAt: string) {
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

  return { activatedMs, expiresMs, nowMs, daysLeft, progressPercent }
}

function inferPlanDurationLabel(activatedAt: string | null, expiresAt: string | null): string {
  if (!activatedAt || !expiresAt) return '—'
  const activatedMs = new Date(activatedAt).getTime()
  const expiresMs = new Date(expiresAt).getTime()
  if (!Number.isFinite(activatedMs) || !Number.isFinite(expiresMs) || expiresMs <= activatedMs) return '—'
  const days = Math.ceil((expiresMs - activatedMs) / (24 * 60 * 60 * 1000))
  if (days < 30) return `${days} day${days === 1 ? '' : 's'}`
  const months = Math.max(1, Math.round(days / 30))
  return months === 1 ? '1 month' : `${months} months`
}

function buildTeamStatus(
  isExpired: boolean,
  adobeLive: boolean,
  organizationName: string | null,
  localStatus: string,
): { teamStatus: ResellerUserStatusPayload['teamStatus']; teamMessage: string } {
  if (isExpired) {
    return { teamStatus: 'attention', teamMessage: 'This subscription has expired.' }
  }
  if (adobeLive && organizationName) {
    return {
      teamStatus: 'normal',
      teamMessage: `This team is operating normally on ${SUPER_RESELLER_BRAND}.`,
    }
  }
  if (adobeLive) {
    return {
      teamStatus: 'attention',
      teamMessage: `Account is active on ${SUPER_RESELLER_BRAND} but organization name is pending sync.`,
    }
  }
  if (localStatus === 'active') {
    return {
      teamStatus: 'attention',
      teamMessage: `Not found on ${SUPER_RESELLER_BRAND} yet — try refreshing status.`,
    }
  }
  return { teamStatus: 'unknown', teamMessage: 'Organization data has not been synced yet.' }
}

/** Status from Adobe credits-pool panel (live API). Local row optional for refund/extra fields. */
export function buildResellerUserStatusFromPanel(
  email: string,
  live: AdobePanelUserRow,
  localRow?: Record<string, unknown> | null,
): ResellerUserStatusPayload {
  const normalizedEmail = email.trim().toLowerCase()
  const orgSnap = getAdobeOrgSnapshotByEmail(normalizedEmail)

  const activatedAt =
    (live.activatedAt ? String(live.activatedAt) : '') ||
    (localRow?.activated_at ? String(localRow.activated_at) : '')
  const expiresAt =
    (live.expiresAt ? String(live.expiresAt) : '') ||
    (localRow?.expires_at ? String(localRow.expires_at) : '')

  const { activatedMs, expiresMs, nowMs, daysLeft, progressPercent } = computeStatusTiming(
    activatedAt,
    expiresAt,
  )

  const localStatus = localRow ? String(localRow.status || 'active') : 'active'
  const isExpired =
    localStatus === 'expired' ||
    (Number.isFinite(expiresMs) && expiresMs <= nowMs) ||
    String(live.status || '').toLowerCase() === 'expired'

  const organizationName =
    live.organizationName ||
    orgSnap?.organizationName ||
    (localRow?.adobe_organization_name as string | null | undefined) ||
    null

  const products =
    live.displayProducts?.length
      ? live.displayProducts
      : live.products?.length
        ? live.products
        : orgSnap?.displayProducts?.length
          ? orgSnap.displayProducts
          : Array.isArray(localRow?.products) && localRow.products.length > 0
            ? (localRow.products as string[])
            : []

  const { teamStatus, teamMessage } = buildTeamStatus(isExpired, true, organizationName, localStatus)

  const refundWindowMs = 24 * 60 * 60 * 1000
  let refundEligible = false
  let refundRemainingMs: number | null = null
  if (localRow && localStatus === 'active' && Number.isFinite(activatedMs)) {
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
        : 'active'

  return {
    id: localRow?.id ? String(localRow.id) : `panel:${normalizedEmail}`,
    email: normalizedEmail,
    overallStatus,
    teamStatus,
    teamMessage,
    organizationName,
    organizationId:
      (Number.isFinite(Number(live.organizationId)) && Number(live.organizationId) > 0
        ? Number(live.organizationId)
        : null) ??
      orgSnap?.organizationId ??
      (localRow?.adobe_organization_id as number | null | undefined) ??
      null,
    products,
    planDuration: localRow
      ? formatPlanDurationLabel(String(localRow.duration_months || ''), Number(localRow.duration_days) || 0)
      : inferPlanDurationLabel(activatedAt || null, expiresAt || null),
    activatedAt: activatedAt || null,
    expiresAt: expiresAt || null,
    daysLeft,
    progressPercent,
    adobeLive: true,
    organizationSyncedAt: (localRow?.adobe_synced_at as string | null | undefined) ?? null,
    refundEligible,
    refundRemainingMs,
    adobeStatus: live.status ?? null,
  }
}

export function buildResellerUserStatusFromRow(row: Record<string, unknown>): ResellerUserStatusPayload {
  const email = String(row.customer_email || '').trim().toLowerCase()
  const live = getAdobePanelUserByEmail(email)
  const orgSnap = getAdobeOrgSnapshotByEmail(email)

  const activatedAt = row.activated_at ? String(row.activated_at) : ''
  const expiresAt =
    (live?.expiresAt ? String(live.expiresAt) : null) ||
    (row.expires_at ? String(row.expires_at) : '')

  const { activatedMs, expiresMs, nowMs, daysLeft, progressPercent } = computeStatusTiming(
    activatedAt,
    expiresAt,
  )

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

  const { teamStatus, teamMessage } = buildTeamStatus(isExpired, adobeLive, organizationName, localStatus)

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
