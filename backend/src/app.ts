import { existsSync } from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env, isTest } from './config/env';
import { logger } from './config/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimit';
import { apiRouter } from './routes';
import { payRouter } from './routes/pay.routes';

// backend/public in both layouts: src/ (tsx, tests) and dist/src/ (compiled).
const PUBLIC_DIR =
  [path.resolve(__dirname, '..', 'public'), path.resolve(__dirname, '..', '..', 'public')].find(
    (dir) => existsSync(path.join(dir, 'products')),
  ) ?? path.resolve(__dirname, '..', 'public');

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(
    helmet({
      // Product images are loaded cross-origin by the kiosk/admin/kitchen apps.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        // Allow same-origin / non-browser clients (no Origin header) and configured origins.
        if (!origin || env.CORS_ORIGINS.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
    }),
  );
  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        autoLogging: { ignore: (req) => req.url === '/api/health' },
        // Compact request logs: no headers (they may contain cookies/tokens).
        serializers: {
          req: (req: { id: unknown; method: string; url: string }) => ({
            id: req.id,
            method: req.method,
            url: req.url,
          }),
          res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        },
      }),
    );
  }
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use(
    '/static',
    express.static(PUBLIC_DIR, {
      maxAge: '7d',
      fallthrough: true,
      index: false,
    }),
  );

  app.use('/api', apiLimiter, apiRouter);
  // Demo QR payment page opened on the customer's phone (see services/payment.service.ts).
  if (env.PAYMENT_PROVIDER === 'demo')
    app.use('/pay', apiLimiter, express.urlencoded({ extended: false, limit: '1kb' }), payRouter);
  app.get('/health', (_req, res) => res.redirect(307, '/api/health'));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
