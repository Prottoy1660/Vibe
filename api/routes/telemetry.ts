import express, { type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import { isIP } from 'node:net'

const router = express.Router()

function normalizeCandidateIp(raw: string): string {
  let v = (raw || '').trim().replace(/^for=/i, '').replace(/^"|"$/g, '')
  if (!v) return ''
  // Remove optional :port suffix from IPv4 "1.2.3.4:1234"
  const ipv4Port = v.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)
  if (ipv4Port?.[1]) v = ipv4Port[1]
  // Strip IPv6 mapped prefix.
  v = v.replace(/^::ffff:/i, '')
  // Strip zone suffix from IPv6, e.g. fe80::1%lo0
  v = v.replace(/%.+$/, '')
  return v
}

function isPrivateOrLocalIp(ip: string): boolean {
  if (!ip) return true
  const v = ip.toLowerCase()
  if (v === '::1' || v === '127.0.0.1' || v === '0.0.0.0') return true
  // IPv4 private/link-local ranges
  if (/^10\./.test(v)) return true
  if (/^192\.168\./.test(v)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(v)) return true
  if (/^169\.254\./.test(v)) return true
  // IPv6 local/link-local/ULA
  if (/^fc/i.test(v) || /^fd/i.test(v) || /^fe80:/i.test(v)) return true
  return false
}

function firstValidIpFromHeader(value: string | string[] | undefined): string {
  if (!value) return ''
  const raw = Array.isArray(value) ? value.join(',') : value
  const parts = raw.split(',')
  for (const p of parts) {
    const candidate = normalizeCandidateIp(p)
    if (!candidate) continue
    if (isIP(candidate)) return candidate
  }
  return ''
}

function clientIp(req: Request): string {
  // Highest confidence first (set by trusted CDN/proxy when available).
  const preferredHeaders: Array<keyof Request['headers']> = [
    'cf-connecting-ip',
    'true-client-ip',
    'x-real-ip',
    'x-forwarded-for',
  ]
  for (const key of preferredHeaders) {
    const ip = firstValidIpFromHeader(req.headers[key])
    if (ip && !isPrivateOrLocalIp(ip)) return ip.slice(0, 128)
    if (ip) return ip.slice(0, 128)
  }

  const reqIp = normalizeCandidateIp(String(req.ip || ''))
  if (reqIp && isIP(reqIp)) return reqIp.slice(0, 128)

  const socketIp = normalizeCandidateIp(String(req.socket?.remoteAddress || ''))
  if (socketIp && isIP(socketIp)) return socketIp.slice(0, 128)

  return '0.0.0.0'
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
    const ip = clientIp(req)
    return res.json({
      success: true,
      ip_address: ip === '0.0.0.0' ? '' : ip,
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

