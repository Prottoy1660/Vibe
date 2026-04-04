/**
 * This is a API server
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import compression from 'compression'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import { existsSync } from 'fs'
import authRoutes from './routes/auth.js'
import paymentRoutes from './routes/payment.js'
import cpanelRoutes from './routes/cpanel.js'
import adminRoutes from './routes/admin.js'
import redeemRoutes from './routes/redeem.js'
import platformRoutes from './routes/platform.js'
import rateLimit from 'express-rate-limit'
import cronRoutes from './routes/cron.js'
import telemetryRoutes from './routes/telemetry.js'
import referralRoutes from './routes/referral.js'
import supportChatRoutes from './routes/supportChat.js'

// for esm mode
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// load env
dotenv.config()

const app: express.Application = express()
app.set('trust proxy', 1)

function withWwwVariants(url?: string) {
  if (!url) return [];
  try {
    const u = new URL(url);
    const base = `${u.protocol}//${u.host}`;
    const variants = new Set<string>([base]);
    if (u.hostname.startsWith('www.')) {
      variants.add(`${u.protocol}//${u.hostname.replace(/^www\./, '')}${u.port ? `:${u.port}` : ''}`);
    } else {
      variants.add(`${u.protocol}//www.${u.hostname}${u.port ? `:${u.port}` : ''}`);
    }
    return [...variants];
  } catch {
    return [url];
  }
}

const allowedOrigins = new Set([
  ...withWwwVariants(process.env.FRONTEND_URL),
  ...(process.env.VERCEL_URL ? withWwwVariants(`https://${process.env.VERCEL_URL}`) : []),
  'https://vibeaccessbd.shop',
  'https://www.vibeaccessbd.shop',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
]);

app.use(cors({
  origin: (origin, callback) => {
    // allow server-to-server calls (no Origin header)
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    // Don't throw 500 for disallowed origins; just disable CORS for that request.
    return callback(null, false);
  },
  credentials: true,
}))
app.use(compression())
// Basic hardening headers (kept lightweight to avoid dependency overhead)
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if ((req.headers['x-forwarded-proto'] || '').toString().includes('https')) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  next()
})
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))

// Request ID for tracing errors end-to-end
app.use((req: Request, res: Response, next: NextFunction) => {
  const existing = req.header('x-request-id');
  const requestId = existing || crypto.randomUUID();
  (res.locals as any).requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});

// Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { success: false, error: 'Too many requests from this IP, please try again after 15 minutes' }
})

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 requests per `window` (here, per 15 minutes)
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many cPanel requests, please wait and try again' }
})

const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many payment requests, please wait and try again' }
})

const redeemLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many redeem attempts, please wait and try again' }
})

const referralLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many referral requests, please wait and try again' },
})

const supportChatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many support chat requests, please wait and try again' },
})

app.use(globalLimiter)

/**
 * API Routes
 */
app.use('/api/auth', authRoutes)
app.use('/api/platform', platformRoutes)
app.use('/api/payment', paymentLimiter, paymentRoutes)
app.use('/api/cpanel', strictLimiter, cpanelRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/redeem', redeemLimiter, redeemRoutes)
app.use('/api/referral', referralLimiter, referralRoutes)
app.use('/api/support-chat', supportChatLimiter, supportChatRoutes)
app.use('/api/cron', cronRoutes)
app.use('/api/telemetry', telemetryRoutes)

/**
 * health
 */
app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

/**
 * Optional: serve Vite `dist/` from the same Node process (Coolify single service).
 * Set SERVE_STATIC_SPA=1 and ensure `dist/` exists next to the built `api/` output.
 * Avoids reverse-proxy misroutes where GET /api/health hits Node but POST /api/* returns 405.
 */
if (process.env.SERVE_STATIC_SPA === '1') {
  const distPath = (() => {
    if (process.env.SPA_DIST_PATH) {
      return path.resolve(process.cwd(), process.env.SPA_DIST_PATH)
    }
    const siblingDist = path.join(__dirname, '../dist')
    const parentAsDist = path.join(__dirname, '..')
    if (existsSync(path.join(siblingDist, 'index.html'))) return siblingDist
    if (existsSync(path.join(parentAsDist, 'index.html'))) return parentAsDist
    return siblingDist
  })()
  app.use(express.static(distPath, { index: false }))
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(distPath, 'index.html'), (err) => {
      if (err) next(err)
    })
  })
}

/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  const requestId = (res.locals as any)?.requestId;
  console.error(`[api] request_id=${requestId} unhandled_error=`, error);
  res.status(500).json({
    success: false,
    error: 'Server internal error',
    request_id: requestId,
  })
})

/**
 * 404 handler (API only — non-API GET is handled by SERVE_STATIC_SPA catch-all above)
 */
app.use((req: Request, res: Response) => {
  const requestId = (res.locals as any)?.requestId;
  if (!req.path.startsWith('/api')) {
    res.status(404).type('text/plain').send('Not found')
    return
  }
  res.status(404).json({
    success: false,
    error: 'API not found',
    request_id: requestId,
  })
})

export default app
