import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';
import {
  closeCashSession,
  getOpenCashSession,
  listCashSessions,
  openCashSession,
  previewCashSessionClose,
} from '../services/cashSession.js';

function param(value: string | string[] | undefined, name: string): string {
  if (typeof value === 'string' && value) return value;
  if (Array.isArray(value) && value[0]) return value[0];
  throw new AppError(400, 'VALIDATION_ERROR', `Missing ${name}`);
}

export const cashAdminRouter = Router();
cashAdminRouter.use(requireAuth, requireRoles('OWNER', 'MANAGER', 'CASHIER'));

cashAdminRouter.get('/', async (_req, res, next) => {
  try {
    const [open, sessions] = await Promise.all([getOpenCashSession(), listCashSessions()]);
    res.json({ open, sessions });
  } catch (error) {
    next(error);
  }
});

const openCashSchema = z.object({
  openingFloatCents: z.number().int().nonnegative().default(0),
  notes: z.string().nullable().optional(),
});

cashAdminRouter.post('/open', async (req, res, next) => {
  try {
    if (!req.admin) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const body = openCashSchema.parse(req.body);
    const session = await openCashSession({
      openingFloatCents: body.openingFloatCents,
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      actorId: req.admin.id,
    });
    res.status(201).json({ session });
  } catch (error) {
    next(error);
  }
});

cashAdminRouter.get('/:id/preview-close', async (req, res, next) => {
  try {
    const id = param(req.params.id, 'id');
    res.json(await previewCashSessionClose(id));
  } catch (error) {
    next(error);
  }
});

const closeCashSchema = z.object({
  countedCashCents: z.number().int().nonnegative(),
  countedZelleCents: z.number().int().nonnegative().default(0),
  countedPagoMovilCents: z.number().int().nonnegative().default(0),
  countedTransferCents: z.number().int().nonnegative().default(0),
  countedOtherCents: z.number().int().nonnegative().default(0),
  notes: z.string().nullable().optional(),
});

cashAdminRouter.post('/:id/close', async (req, res, next) => {
  try {
    if (!req.admin) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const id = param(req.params.id, 'id');
    const body = closeCashSchema.parse(req.body);
    const session = await closeCashSession({
      sessionId: id,
      countedCashCents: body.countedCashCents,
      countedZelleCents: body.countedZelleCents,
      countedPagoMovilCents: body.countedPagoMovilCents,
      countedTransferCents: body.countedTransferCents,
      countedOtherCents: body.countedOtherCents,
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      actorId: req.admin.id,
    });
    res.json({ session });
  } catch (error) {
    next(error);
  }
});
