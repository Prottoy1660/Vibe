import express, { type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'

const router = express.Router()

function clientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for']
  if (typeof xf === 'string') return xf.split(',')[0].trim().slice(0, 128)
  if (Array.isArray(xf) && xf[0]) return xf[0].split(',')[0].trim().slice(0, 128)
  const raw = req.socket?.remoteAddress || '0.0.0.0'
  return raw.replace(/^::ffff:/, '').slice(0, 128)
}

const geoLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many telemetry calls. Please try again later.' },
})

// Server-observed IP + geo/ISP enrichment for session logging.
// This improves accuracy vs. client-side IP/geo APIs (mobile networks often block/return inconsistent results).
router.post('/geo-context', geoLimiter, async (req: Request, res: Response) => {
  try {
    const ip = clientIp(req)

    // ipapi supports /json/<ip>
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4500)
    const geoRes = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { signal: controller.signal })
    clearTimeout(timeout)
    if (!geoRes.ok) throw new Error(`geo provider failed (status ${geoRes.status})`)

    const geo: any = await geoRes.json()

    return res.json({
      success: true,
      ip_address: geo?.ip || ip || '',
      country: geo?.country_name || '',
      city: geo?.city || '',
      region: geo?.region || '',
      isp: geo?.org || '',
      latitude: typeof geo?.latitude === 'number' ? geo.latitude : null,
      longitude: typeof geo?.longitude === 'number' ? geo.longitude : null,
    })
  } catch {
    // Return safe fallbacks; client can still persist telemetry without geo fields.
    return res.json({
      success: true,
      ip_address: req.socket?.remoteAddress ? String(req.socket.remoteAddress).replace(/^::ffff:/, '') : '',
      country: '',
      city: '',
      region: '',
      isp: '',
      latitude: null,
      longitude: null,
    })
  }
})

export default router

