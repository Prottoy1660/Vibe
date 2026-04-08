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
// GET + POST: some reverse proxies mis-route POST to static; GET avoids 405 on misconfigured /api.
async function geoContextHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  try {
    const ip = clientIp(req)

    // Use ipwho.is (server-to-server) for geo + security flags (vpn/proxy/tor/hosting).
    // Note: `security=1` may be plan-gated; if unavailable we still return geo.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4500)
    const geoRes = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?security=1`,
      { signal: controller.signal },
    )
    clearTimeout(timeout)
    if (!geoRes.ok) throw new Error(`geo provider failed (status ${geoRes.status})`)

    const geo: any = await geoRes.json()

    return res.json({
      success: true,
      ip_address: geo?.ip || ip || '',
      country: geo?.country || '',
      city: geo?.city || '',
      region: geo?.region || '',
      isp: geo?.connection?.isp || geo?.connection?.org || '',
      latitude: typeof geo?.latitude === 'number' ? geo.latitude : null,
      longitude: typeof geo?.longitude === 'number' ? geo.longitude : null,
      is_vpn: typeof geo?.security?.vpn === 'boolean' ? geo.security.vpn : null,
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
      is_vpn: null,
    })
  }
}

router.get('/geo-context', geoLimiter, geoContextHandler)
router.post('/geo-context', geoLimiter, geoContextHandler)

export default router

