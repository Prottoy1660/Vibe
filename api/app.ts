/**
 * This is a API server
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import authRoutes from './routes/auth.js'
import paymentRoutes from './routes/payment.js'
import cpanelRoutes from './routes/cpanel.js'
import adminRoutes from './routes/admin.js'
import redeemRoutes from './routes/redeem.js'
import rateLimit from 'express-rate-limit'

// for esm mode
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// load env
dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

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

app.use(globalLimiter)

/**
 * API Routes
 */
app.use('/api/auth', authRoutes)
app.use('/api/payment', paymentRoutes)
app.use('/api/cpanel', strictLimiter, cpanelRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/redeem', redeemRoutes)

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
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  const requestId = (res.locals as any)?.requestId;
  res.status(404).json({
    success: false,
    error: 'API not found',
    request_id: requestId,
  })
})

export default app
