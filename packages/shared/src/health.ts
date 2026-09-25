import { z } from 'zod';

/** Smoke schema to prove the workspace wiring works across api/web/admin. */
export const healthSchema = z.object({
  status: z.literal('ok'),
  service: z.string().min(1),
  timestamp: z.string().datetime(),
});

export type Health = z.infer<typeof healthSchema>;

export const APP_NAME = 'Cero Tres';
