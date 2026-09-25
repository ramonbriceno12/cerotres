import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { writeAuditLog } from '../lib/audit.js';

/** Convert USD cents → bolívar céntimos using Bs-per-USD rate. Round once at the end. */
export function usdCentsToBolivarsCents(usdCents: number, bolivarsPerUsd: number): number {
  return Math.round(usdCents * bolivarsPerUsd);
}

/** Convert bolívar céntimos → USD cents. Round once at the end. */
export function bolivarsCentsToUsdCents(bolivarsCents: number, bolivarsPerUsd: number): number {
  if (!(bolivarsPerUsd > 0)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Exchange rate must be positive');
  }
  return Math.round(bolivarsCents / bolivarsPerUsd);
}

export async function getActiveExchangeRate(at: Date = new Date()) {
  const row = await prisma.exchangeRate.findFirst({
    where: { effectiveFrom: { lte: at } },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!row) return null;
  return {
    id: row.id,
    bolivarsPerUsd: Number(row.bolivarsPerUsd.toString()),
    effectiveFrom: row.effectiveFrom,
    note: row.note,
  };
}

export async function listExchangeRates(limit = 30) {
  const rows = await prisma.exchangeRate.findMany({
    orderBy: { effectiveFrom: 'desc' },
    take: limit,
    include: { createdBy: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    bolivarsPerUsd: Number(row.bolivarsPerUsd.toString()),
    effectiveFrom: row.effectiveFrom,
    note: row.note,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  }));
}

export async function setExchangeRate(input: {
  bolivarsPerUsd: number;
  effectiveFrom?: Date;
  note?: string | null;
  actorId: string;
}) {
  if (!(input.bolivarsPerUsd > 0)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'bolivarsPerUsd must be positive');
  }
  const rate = await prisma.exchangeRate.create({
    data: {
      bolivarsPerUsd: new Prisma.Decimal(input.bolivarsPerUsd.toFixed(4)),
      effectiveFrom: input.effectiveFrom ?? new Date(),
      note: input.note ?? null,
      createdById: input.actorId,
    },
  });
  await writeAuditLog({
    actorId: input.actorId,
    action: 'EXCHANGE_RATE_SET',
    entityType: 'ExchangeRate',
    entityId: rate.id,
    after: { bolivarsPerUsd: input.bolivarsPerUsd },
  });
  return {
    id: rate.id,
    bolivarsPerUsd: Number(rate.bolivarsPerUsd.toString()),
    effectiveFrom: rate.effectiveFrom,
    note: rate.note,
  };
}

/** Resolve rate for order placement; returns Prisma Decimal or null. */
export async function resolveOrderExchangeRate(at: Date = new Date()) {
  const active = await getActiveExchangeRate(at);
  if (!active) return null;
  return new Prisma.Decimal(active.bolivarsPerUsd.toFixed(4));
}
