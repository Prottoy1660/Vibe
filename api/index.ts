/**
 * Vercel deploy entry handler, for serverless deployment, please don't modify this file
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from './app.js';

export const maxDuration = 60; // Set max execution time to 60 seconds for Vercel

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}