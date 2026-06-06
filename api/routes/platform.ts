/**
 * Public platform status (for /status page and monitoring).
 */
import { Router, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import { createClient } from '@supabase/supabase-js'
import { lookupPublicAccountByEmail } from '../lib/publicAccountStatus.js'

const router = Router()

const searchStatusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.PUBLIC_SEARCH_RATE_LIMIT_MAX || 40),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many search requests, please wait and try again.' },
})

const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null

/**
 * GET /api/platform/status
 * Returns API health + platform_status from system_settings (service role).
 */
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  const payload: Record<string, unknown> = {
    ok: true,
    api: 'ok',
    time: new Date().toISOString(),
  }

  if (!supabase) {
    payload.platform = { level: 'unknown', message: '', show_banner: false }
    res.status(200).json(payload)
    return
  }

  try {
    const { data, error } = await supabase.from('system_settings').select('value').eq('key', 'platform_status').maybeSingle()

    if (error || !data?.value) {
      payload.platform = { level: 'operational', message: '', show_banner: false }
    } else {
      payload.platform = data.value
    }
  } catch {
    payload.platform = { level: 'operational', message: '', show_banner: false }
  }

  res.status(200).json(payload)
})

/**
 * POST /api/platform/search-status
 * Public lookup by email — returns subscription / Adobe access status (read-only).
 */
router.post('/search-status', searchStatusLimiter, async (req: Request, res: Response): Promise<void> => {
  const email = typeof req.body?.email === 'string' ? req.body.email : ''
  const result = await lookupPublicAccountByEmail(email)

  if (result.ok === false) {
    res.status(result.statusCode).json({ success: false, error: result.error })
    return
  }

  res.status(200).json({ success: true, data: result.data })
})

export default router
