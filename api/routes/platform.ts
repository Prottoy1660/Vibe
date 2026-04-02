/**
 * Public platform status (for /status page and monitoring).
 */
import { Router, type Request, type Response } from 'express'
import { createClient } from '@supabase/supabase-js'

const router = Router()

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

export default router
