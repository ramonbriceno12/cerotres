import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { FeeBase } from '@prisma/client';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';
import {
  addFeeRate,
  closeSettlement,
  commissionReport,
  createCommissionAdjustment,
  createSettlement,
  getSettlement,
  listChannelsWithFees,
  listPlatformOrders,
  listSettlements,
  simulateCommissionChange,
  uploadSettlementCsv,
} from '../services/channelsAdmin.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function param(value: string | string[] | undefined, name: string): string {
  if (typeof value === 'string' && value) return value;
  if (Array.isArray(value) && value[0]) return value[0];
  throw new AppError(400, 'VALIDATION_ERROR', `Missing ${name}`);
}

export const channelsAdminRouter = Router();
channelsAdminRouter.use(requireAuth, requireRoles('OWNER', 'MANAGER'));

channelsAdminRouter.get('/', async (_req, res, next) => {
  try {
    const channels = await listChannelsWithFees();
    res.json({ channels });
  } catch (error) {
    next(error);
  }
});

const feeSchema = z.object({
  percent: z.number().min(0).max(1),
  fixedFeeCents: z.number().int().nonnegative().optional(),
  appliesTo: z.nativeEnum(FeeBase),
  effectiveFrom: z.string().datetime(),
  note: z.string().optional(),
});

channelsAdminRouter.post('/:channelId/fee-rates', async (req, res, next) => {
  try {
    if (!req.admin) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const channelId = param(req.params.channelId, 'channelId');
    const body = feeSchema.parse(req.body);
    const result = await addFeeRate({
      channelId,
      percent: body.percent,
      ...(body.fixedFeeCents !== undefined ? { fixedFeeCents: body.fixedFeeCents } : {}),
      appliesTo: body.appliesTo,
      effectiveFrom: new Date(body.effectiveFrom),
      ...(body.note !== undefined ? { note: body.note } : {}),
      createdById: req.admin.id,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
    res.status(201).json({
      rate: {
        id: result.rate.id,
        percent: Number(result.rate.percent.toString()),
        fixedFeeCents: result.rate.fixedFeeCents,
        appliesTo: result.rate.appliesTo,
        effectiveFrom: result.rate.effectiveFrom,
        effectiveTo: result.rate.effectiveTo,
        note: result.rate.note,
        createdBy: result.rate.createdBy,
      },
      warning: result.warning,
      priorOrderCount: result.priorOrderCount,
    });
  } catch (error) {
    next(error);
  }
});

channelsAdminRouter.get('/platform-orders', async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1) || 1;
    const pageSize = Math.min(Number(req.query.pageSize ?? 20) || 20, 100);
    const result = await listPlatformOrders({
      page,
      pageSize,
      ...(typeof req.query.channelCode === 'string' ? { channelCode: req.query.channelCode } : {}),
      ...(typeof req.query.from === 'string' ? { from: new Date(req.query.from) } : {}),
      ...(typeof req.query.to === 'string' ? { to: new Date(req.query.to) } : {}),
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

const adjustmentSchema = z.object({
  orderId: z.string().min(1),
  amountCents: z.number().int(),
  reason: z.string().min(3),
});

channelsAdminRouter.post('/adjustments', async (req, res, next) => {
  try {
    if (!req.admin) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const body = adjustmentSchema.parse(req.body);
    const adjustment = await createCommissionAdjustment({
      orderId: body.orderId,
      amountCents: body.amountCents,
      reason: body.reason,
      createdById: req.admin.id,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
    res.status(201).json({ adjustment });
  } catch (error) {
    next(error);
  }
});

channelsAdminRouter.get('/settlements', async (_req, res, next) => {
  try {
    const settlements = await listSettlements();
    res.json({ settlements });
  } catch (error) {
    next(error);
  }
});

const settlementSchema = z.object({
  channelId: z.string().min(1),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  notes: z.string().optional(),
});

channelsAdminRouter.post('/settlements', async (req, res, next) => {
  try {
    if (!req.admin) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const body = settlementSchema.parse(req.body);
    const settlement = await createSettlement({
      channelId: body.channelId,
      periodStart: new Date(body.periodStart),
      periodEnd: new Date(body.periodEnd),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      createdById: req.admin.id,
    });
    res.status(201).json({ settlement });
  } catch (error) {
    next(error);
  }
});

channelsAdminRouter.get('/settlements/:id', async (req, res, next) => {
  try {
    const id = param(req.params.id, 'id');
    const settlement = await getSettlement(id);
    res.json({ settlement });
  } catch (error) {
    next(error);
  }
});

channelsAdminRouter.post('/settlements/:id/csv', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.admin) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const id = param(req.params.id, 'id');
    if (!req.file) throw new AppError(400, 'VALIDATION_ERROR', 'CSV file required');
    const settlement = await uploadSettlementCsv({
      settlementId: id,
      buffer: req.file.buffer,
      filename: req.file.originalname || 'settlement.csv',
      actorId: req.admin.id,
    });
    res.json({ settlement });
  } catch (error) {
    next(error);
  }
});

channelsAdminRouter.post('/settlements/:id/close', async (req, res, next) => {
  try {
    if (!req.admin) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const id = param(req.params.id, 'id');
    const settlement = await closeSettlement({ settlementId: id, actorId: req.admin.id });
    res.json({ settlement });
  } catch (error) {
    next(error);
  }
});

channelsAdminRouter.get('/reports/commission', async (req, res, next) => {
  try {
    if (typeof req.query.from !== 'string' || typeof req.query.to !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', 'from and to required');
    }
    const report = await commissionReport({
      from: new Date(req.query.from),
      to: new Date(req.query.to),
    });
    res.json({ report });
  } catch (error) {
    next(error);
  }
});

const simulateSchema = z.object({
  channelId: z.string().min(1),
  from: z.string().datetime(),
  to: z.string().datetime(),
  newPercent: z.number().min(0).max(1),
});

channelsAdminRouter.post('/simulate', async (req, res, next) => {
  try {
    const body = simulateSchema.parse(req.body);
    const simulation = await simulateCommissionChange({
      channelId: body.channelId,
      from: new Date(body.from),
      to: new Date(body.to),
      newPercent: body.newPercent,
    });
    res.json({ simulation });
  } catch (error) {
    next(error);
  }
});
