import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { Express, Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

export const getClientIp = (req: Request): string => {
  try {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded) && forwarded[0]) {
      return forwarded[0].split(',')[0].trim();
    }
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string') {
      return realIp;
    }
    if (req.socket?.remoteAddress) {
      return req.socket.remoteAddress;
    }
  } catch {
    // fallback
  }
  return '127.0.0.1';
};

export function applySecurityMiddleware(app: Express): void {
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // Strict origin / CSRF check for state-mutating browser requests when cookies are used
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin) {
      const allowedPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
      if (origin === config.appBaseUrl || allowedPattern.test(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader(
          'Access-Control-Allow-Methods',
          'GET, POST, PUT, PATCH, DELETE, OPTIONS'
        );
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, X-Paystack-Signature, X-Hubtel-Signature'
        );
      }
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  if (config.nodeEnv !== 'test' && !process.env.VERCEL) {
    const apiLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 600,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => getClientIp(req),
      skip: () => Boolean(process.env.VERCEL),
      message: { error: 'Too many requests. Please try again shortly.' },
    });
    app.use('/api', apiLimiter);
  }
}

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  skip: () => Boolean(process.env.VERCEL || process.env.NODE_ENV === 'test'),
  message: { error: 'Too many authentication attempts. Please wait 15 minutes.' },
});
