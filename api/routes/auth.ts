/**
 * Auth-related API routes (server-side checks; Supabase Auth still runs in the browser).
 */
import { Router, type Request, type Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import rateLimit from 'express-rate-limit'

const router = Router()

const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
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

export default router
