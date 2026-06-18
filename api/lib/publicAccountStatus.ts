import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  fetchAdobeOrgSwitchOptions,
  fetchAdobePanelUsers,
  fetchAdobePublicUserStatus,
  getAdobePanelUserByEmail,
} from './adobeApi.js'
import {
  buildResellerUserStatusFromPanel,
  buildResellerUserStatusFromRow,
  type ResellerUserStatusPayload,
} from './resellerUserStatus.js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase: SupabaseClient | null =
  supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null

export type PublicAccountSearchResult = {
  searchedEmail: string
  account: null
  vibe: null
  resellerSubscriptions: ResellerUserStatusPayload[]
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function pickBestLocalRow(rows: Record<string, unknown>[]): Record<string, unknown> | null {
  if (!rows.length) return null
  const active = rows.find((r) => String(r.status || '') === 'active')
  return active || rows[0]
}

/**
 * Public Super Reseller status lookup — live Adobe credits-pool panel is the source of truth.
 * Local DB rows are optional enrichment only; panel presence is required to return a result.
 */
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

  const panelSync = await fetchAdobePanelUsers(false)
  if (!panelSync.success) {
    const retry = await fetchAdobePanelUsers(true)
    if (!retry.success) {
      return {
        ok: false,
        statusCode: 503,
        error: retry.error || panelSync.error || 'Could not load live activation data. Try again shortly.',
      }
    }
  }

  let live = getAdobePanelUserByEmail(searchedEmail)
  if (!live) {
    const refresh = await fetchAdobePanelUsers(true)
    if (!refresh.success) {
      return {
        ok: false,
        statusCode: 503,
        error: refresh.error || 'Could not load live activation data. Try again shortly.',
      }
    }
    live = getAdobePanelUserByEmail(searchedEmail)
  }
  if (!live) {
    return {
      ok: false,
      statusCode: 404,
      error: 'This email is not active on Super Reseller.',
    }
  }

  const { data: localRows } = await supabase
    .from('reseller_user_access')
    .select('*')
    .ilike('customer_email', searchedEmail)
    .order('activated_at', { ascending: false })
    .limit(5)

  const localRow = pickBestLocalRow((localRows || []) as Record<string, unknown>[])
  const status = localRow
    ? buildResellerUserStatusFromRow({ ...localRow, customer_email: searchedEmail })
    : buildResellerUserStatusFromPanel(searchedEmail, live, null)

  const [portalStatus, orgSwitch] = await Promise.all([
    fetchAdobePublicUserStatus(searchedEmail),
    fetchAdobeOrgSwitchOptions(searchedEmail),
  ])

  if (portalStatus?.organization?.name) {
    status.organizationName = portalStatus.organization.name
    if (portalStatus.organization.id) {
      status.organizationId = portalStatus.organization.id
    }
  }
  if (portalStatus?.products?.length) {
    status.products = portalStatus.products
  }
  if (portalStatus?.organizationStatus) {
    status.organizationStatus = {
      status: portalStatus.organizationStatus.status,
      label: portalStatus.organizationStatus.label,
      message: portalStatus.organizationStatus.message,
      lastCheckedAt: portalStatus.organizationStatus.lastCheckedAt ?? null,
    }
    const orgHealth = portalStatus.organizationStatus.status.toLowerCase()
    if (orgHealth === 'inactive') {
      status.teamStatus = 'inactive'
      status.teamMessage = portalStatus.organizationStatus.message
    } else if (orgHealth === 'normal') {
      status.teamStatus = 'normal'
      status.teamMessage = portalStatus.organizationStatus.message
    }
  }
  status.orgSwitch = orgSwitch

  return {
    ok: true,
    data: {
      searchedEmail,
      account: null,
      vibe: null,
      resellerSubscriptions: [status],
    },
  }
}
