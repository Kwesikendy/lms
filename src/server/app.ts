import express from 'express';
import { applySecurityMiddleware } from './middleware/security.js';
import { authRouter } from './routes/auth.js';
import { catalogRouter } from './routes/catalog.js';
import { learningRouter, mediaRouter } from './routes/learning.js';
import { paymentsRouter } from './routes/payments.js';
import { livekitRouter } from './routes/livekit.js';
import { instructorRouter } from './routes/instructor.js';
import { adminRouter } from './routes/admin.js';
import { ensureSeedData } from './db/seed.js';

export function createApp(options?: { skipSeed?: boolean }) {
  const app = express();

  // Serverless / Lambda compatibility shim for socket properties
  app.use((req, _res, next) => {
    if (!req.socket) {
      (req as unknown as { socket: { remoteAddress: string } }).socket = { remoteAddress: '127.0.0.1' };
    }
    if (!req.connection) {
      (req as unknown as { connection: typeof req.socket }).connection = req.socket;
    }
    next();
  });

  applySecurityMiddleware(app);

  // Capture raw body for cryptographic webhook signature verification (Paystack, Hubtel, LiveKit)
  app.use(
    express.json({
      limit: '15mb',
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody?: string }).rawBody = buf.toString('utf-8');
      },
    })
  );

  if (!options?.skipSeed) {
    ensureSeedData();
  }

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/catalog', catalogRouter);
  app.use('/api/learning', learningRouter);
  app.use('/api/media', mediaRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/livekit', livekitRouter);
  app.use('/api/instructor', instructorRouter);
  app.use('/api/admin', adminRouter);

  // Safe API error handler
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error('[API Error caught in app.use]:', err);
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({
        error: err.message || 'An unexpected server error occurred.',
        stack: err.stack,
      });
    }
  );

  return app;
}
