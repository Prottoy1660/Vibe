/**
 * Auth-related API routes (server-side checks; Supabase Auth still runs in the browser).
 */
import { Router, type Request, type Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import rateLimit from 'express-rate-limit'
import { promises as fs } from 'fs'
import path from 'path'

const router = Router()

const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim()
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const supabase =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null

/** Max signup-intent records per IP per rolling 24h window */
const SIGNUP_MAX_PER_IP = 8
const SIGNUP_WINDOW_MS = 24 * 60 * 60 * 1000

const signupIntentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many signup checks from this IP. Please wait and try again.' },
})

const authTemplateFileByKey: Record<string, string> = {
  confirmation: 'confirm-signup.html',
  invite: 'invite-user.html',
  magic_link: 'magic-link.html',
  recovery: 'reset-password.html',
  email_change: 'confirm-email-change.html',
  reauthentication: 'confirm-reauthentication.html',
}

function resolveAuthTemplatePath(templateKey: string): string | null {
  const fileName = authTemplateFileByKey[templateKey]
  if (!fileName) return null
  return path.resolve(process.cwd(), 'supabase', 'email-templates', fileName)
}

function clientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for']
  if (typeof xf === 'string') return xf.split(',')[0].trim().slice(0, 128)
  if (Array.isArray(xf) && xf[0]) return xf[0].split(',')[0].trim().slice(0, 128)
  const raw = req.socket?.remoteAddress || '0.0.0.0'
  return raw.replace(/^::ffff:/, '').slice(0, 128)
}

/**
 * Call this immediately before supabase.auth.signUp from the browser.
 * Records one row per attempt and blocks if the IP exceeded the limit in 24h.
 * POST /api/auth/signup-intent
 */
router.post('/signup-intent', signupIntentLimiter, async (req: Request, res: Response): Promise<void> => {
  if (!supabase) {
    res.status(503).json({ success: false, error: 'Signup check unavailable (server configuration).' })
    return
  }

  const ip = clientIp(req)
  const since = new Date(Date.now() - SIGNUP_WINDOW_MS).toISOString()

  try {
    const { count, error: countErr } = await supabase
      .from('signup_ip_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('created_at', since)

    if (countErr) {
      console.error('[signup-intent] count error', countErr)
      res.status(500).json({ success: false, error: 'Could not verify signup eligibility.' })
      return
    }

    if ((count ?? 0) >= SIGNUP_MAX_PER_IP) {
      res.status(429).json({
        success: false,
        error:
          'Too many sign-up attempts from this network. Please try again after 24 hours or use a different connection.',
      })
      return
    }

    const { error: insErr } = await supabase.from('signup_ip_attempts').insert({ ip })
    if (insErr) {
      console.error('[signup-intent] insert error', insErr)
      res.status(500).json({ success: false, error: 'Could not record signup attempt.' })
      return
    }

    res.status(200).json({ success: true })
  } catch (e) {
    console.error('[signup-intent]', e)
    res.status(500).json({ success: false, error: 'Signup check failed.' })
  }
})

/**
 * GET /api/auth/email-templates/:templateKey
 * Serves local Supabase Auth email templates over HTTPS for self-hosted GoTrue.
 *
 * Supported keys:
 * - confirmation
 * - invite
 * - magic_link
 * - recovery
 * - email_change
 * - reauthentication
 */
router.get('/email-templates/:templateKey', async (req: Request, res: Response): Promise<void> => {
  const key = (req.params.templateKey || '').trim().toLowerCase()
  const filePath = resolveAuthTemplatePath(key)
  if (!filePath) {
    res.status(404).json({ success: false, error: 'Unknown template key' })
    return
  }

  try {
    const html = await fs.readFile(filePath, 'utf8')
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.status(200).send(html)
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      res.status(404).json({ success: false, error: 'Template file not found' })
      return
    }
    console.error('[auth-email-template] read error', err)
    res.status(500).json({ success: false, error: 'Could not load template' })
  }
})

/**
 * GET /api/auth/my-emails
 * Returns the authenticated user's assigned emails with pool credentials.
 * Uses the service-role client so emails_pool RLS doesn't block the join.
 */
router.get('/my-emails', async (req: Request, res: Response): Promise<void> => {
  if (!supabase) {
    res.status(503).json({ success: false, error: 'Service unavailable' })
    return
  }

  try {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) {
      res.status(401).json({ success: false, error: 'Missing token' })
      return
    }

    const { data: authData, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !authData?.user) {
      res.status(401).json({ success: false, error: 'Invalid token' })
      return
    }

    const userId = authData.user.id

    // Service-role query — bypasses RLS so emails_pool columns are visible
    const { data: userEmails, error: emailsError } = await supabase
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
          products:product_id (id, duration, price, email_slots, email_slot_interval_days, max_users_per_email, single_device_warning, is_personal)
        )
      `)
      .eq('user_id', userId)
      .order('assigned_at', { ascending: false })

    if (emailsError) {
      console.error('[my-emails] query error', emailsError)
      res.status(500).json({ success: false, error: 'Failed to fetch emails' })
      return
    }

    res.json({ success: true, data: userEmails || [] })
  } catch (e) {
    console.error('[my-emails]', e)
    res.status(500).json({ success: false, error: 'Internal error' })
  }
})

export default router
