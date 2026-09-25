import { Router } from 'express';
import type { Health } from '@cerotres/shared';
import { healthSchema } from '@cerotres/shared';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  const payload: Health = healthSchema.parse({
    status: 'ok',
    service: 'api',
    timestamp: new Date().toISOString(),
  });

  res.json(payload);
});
