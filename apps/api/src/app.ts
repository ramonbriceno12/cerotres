import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { pinoHttp } from 'pino-http';
import type { IncomingMessage } from 'node:http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { resolveGuest } from './middleware/guest.js';
import { healthRouter } from './routes/health.js';
import { adminAuthRouter } from './routes/adminAuth.js';
import { guestRouter } from './routes/guest.js';
import { catalogAdminRouter } from './routes/catalogAdmin.js';
import { publicMenuRouter } from './routes/publicMenu.js';
import { publicOrdersRouter } from './routes/publicOrders.js';
import { ordersAdminRouter } from './routes/ordersAdmin.js';
import { channelsAdminRouter } from './routes/channelsAdmin.js';
import { financeAdminRouter } from './routes/financeAdmin.js';
import { cashAdminRouter } from './routes/cashAdmin.js';

export function createApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.CORS_ORIGINS.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req: IncomingMessage) => req.url === '/health',
      },
    }),
  );

  app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));
  app.use(resolveGuest);

  app.use(healthRouter);
  app.use('/api/admin/auth', adminAuthRouter);
  app.use('/api/admin/catalog', catalogAdminRouter);
  app.use('/api/admin/orders', ordersAdminRouter);
  app.use('/api/admin/channels', channelsAdminRouter);
  app.use('/api/admin/finance', financeAdminRouter);
  app.use('/api/admin/cash-sessions', cashAdminRouter);
  app.use('/api/public/guest', guestRouter);
  app.use('/api/public', publicMenuRouter);
  app.use('/api/public', publicOrdersRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
