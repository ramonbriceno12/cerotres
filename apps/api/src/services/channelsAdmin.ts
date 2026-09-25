import { FeeBase, OrderStatus, Prisma, SettlementStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { writeAuditLog } from '../lib/audit.js';
import { storage } from './storage.js';
import { createChannelFeeRate } from './commission.js';

export async function listChannelsWithFees() {
  const channels = await prisma.salesChannel.findMany({
    orderBy: { name: 'asc' },
    include: {
      feeRates: {
        orderBy: { effectiveFrom: 'desc' },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  return channels.map((channel) => ({
    id: channel.id,
    code: channel.code,
    name: channel.name,
    isActive: channel.isActive,
    requiresExternalRef: channel.requiresExternalRef,
    colorHex: channel.colorHex,
    feeRates: channel.feeRates.map((rate) => ({
      id: rate.id,
      percent: Number(rate.percent.toString()),
      fixedFeeCents: rate.fixedFeeCents,
      appliesTo: rate.appliesTo,
      effectiveFrom: rate.effectiveFrom,
      effectiveTo: rate.effectiveTo,
      note: rate.note,
      createdAt: rate.createdAt,
      createdBy: rate.createdBy,
    })),
  }));
}

export async function addFeeRate(input: {
  channelId: string;
  percent: number;
  fixedFeeCents?: number;
  appliesTo: FeeBase;
  effectiveFrom: Date;
  note?: string | null;
  createdById: string;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const result = await createChannelFeeRate({
    channelId: input.channelId,
    percent: input.percent,
    ...(input.fixedFeeCents !== undefined ? { fixedFeeCents: input.fixedFeeCents } : {}),
    appliesTo: input.appliesTo,
    effectiveFrom: input.effectiveFrom,
    ...(input.note !== undefined ? { note: input.note } : {}),
    createdById: input.createdById,
  });

  await writeAuditLog({
    actorId: input.createdById,
    action: 'CHANNEL_FEE_CREATE',
    entityType: 'ChannelFeeRate',
    entityId: result.rate.id,
    after: {
      channelId: input.channelId,
      percent: input.percent,
      effectiveFrom: input.effectiveFrom,
    },
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return result;
}

export async function listPlatformOrders(input: {
  channelCode?: string;
  page: number;
  pageSize: number;
  from?: Date;
  to?: Date;
}) {
  const channel = await prisma.salesChannel.findFirst({
    where: {
      code: input.channelCode ?? 'PEDIDOS_YA',
      isActive: true,
    },
  });
  if (!channel) throw new AppError(404, 'NOT_FOUND', 'Platform channel not found');

  const where: Prisma.OrderWhereInput = {
    deletedAt: null,
    channelId: channel.id,
  };
  if (input.from || input.to) {
    where.placedAt = {};
    if (input.from) where.placedAt.gte = input.from;
    if (input.to) where.placedAt.lte = input.to;
  }

  const skip = (input.page - 1) * input.pageSize;
  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: [{ placedAt: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: input.pageSize,
      include: {
        settlementLines: {
          include: {
            settlement: { select: { id: true, status: true, periodStart: true, periodEnd: true } },
          },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
        commissionAdjustments: true,
      },
    }),
  ]);

  return {
    channel: { id: channel.id, code: channel.code, name: channel.name },
    total,
    page: input.page,
    pageSize: input.pageSize,
    orders: orders.map((order) => {
      const adjustmentsSum = order.commissionAdjustments.reduce((s, a) => s + a.amountCents, 0);
      const line = order.settlementLines[0];
      return {
        id: order.id,
        publicCode: order.publicCode,
        status: order.status,
        externalOrderRef: order.externalOrderRef,
        placedAt: order.placedAt,
        subtotalCents: order.subtotalCents,
        deliveryFeeCents: order.deliveryFeeCents,
        totalCents: order.totalCents,
        commissionBaseAmountCents: order.commissionBaseAmountCents,
        commissionPercentSnapshot: order.commissionPercentSnapshot
          ? Number(order.commissionPercentSnapshot.toString())
          : null,
        commissionAmountCents: order.commissionAmountCents,
        adjustmentsSumCents: adjustmentsSum,
        netPayoutExpectedCents: order.netPayoutExpectedCents,
        effectiveCommissionCents: (order.commissionAmountCents ?? 0) + adjustmentsSum,
        settlement: line?.settlement
          ? {
              id: line.settlement.id,
              status: line.settlement.status,
              periodStart: line.settlement.periodStart,
              periodEnd: line.settlement.periodEnd,
            }
          : null,
      };
    }),
  };
}

export async function createCommissionAdjustment(input: {
  orderId: string;
  amountCents: number;
  reason: string;
  createdById: string;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, deletedAt: null },
  });
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found');
  if (!input.reason.trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Reason is required');
  }

  const adjustment = await prisma.commissionAdjustment.create({
    data: {
      orderId: order.id,
      amountCents: input.amountCents,
      reason: input.reason.trim(),
      createdById: input.createdById,
    },
  });

  await writeAuditLog({
    actorId: input.createdById,
    action: 'COMMISSION_ADJUSTMENT',
    entityType: 'CommissionAdjustment',
    entityId: adjustment.id,
    after: {
      orderId: order.id,
      amountCents: input.amountCents,
      reason: input.reason,
    },
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return adjustment;
}

export async function createSettlement(input: {
  channelId: string;
  periodStart: Date;
  periodEnd: Date;
  notes?: string | null;
  createdById: string;
}) {
  if (input.periodEnd <= input.periodStart) {
    throw new AppError(400, 'VALIDATION_ERROR', 'periodEnd must be after periodStart');
  }

  const channel = await prisma.salesChannel.findFirst({ where: { id: input.channelId } });
  if (!channel) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid channel');

  const orders = await prisma.order.findMany({
    where: {
      channelId: input.channelId,
      deletedAt: null,
      status: { not: OrderStatus.CANCELLED },
      placedAt: { gte: input.periodStart, lte: input.periodEnd },
    },
    include: { commissionAdjustments: true },
  });

  const expectedNetCents = orders.reduce((sum, order) => {
    const adjustments = order.commissionAdjustments.reduce((s, a) => s + a.amountCents, 0);
    const net = (order.netPayoutExpectedCents ?? order.totalCents) - adjustments;
    return sum + net;
  }, 0);

  const settlement = await prisma.$transaction(async (tx) => {
    const created = await tx.settlement.create({
      data: {
        channelId: input.channelId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        status: SettlementStatus.PENDING,
        expectedNetCents,
        notes: input.notes ?? null,
        createdById: input.createdById,
        lines: {
          create: orders.map((order) => {
            const adjustments = order.commissionAdjustments.reduce((s, a) => s + a.amountCents, 0);
            return {
              orderId: order.id,
              externalOrderRef: order.externalOrderRef,
              expectedCommissionCents: (order.commissionAmountCents ?? 0) + adjustments,
              reportedCommissionCents: null,
              differenceCents: 0,
            };
          }),
        },
      },
      include: { lines: true, channel: true },
    });
    return created;
  });

  await writeAuditLog({
    actorId: input.createdById,
    action: 'SETTLEMENT_CREATE',
    entityType: 'Settlement',
    entityId: settlement.id,
    after: {
      channelId: input.channelId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      expectedNetCents,
      lineCount: orders.length,
    },
  });

  return settlement;
}

export async function listSettlements() {
  return prisma.settlement.findMany({
    orderBy: { periodStart: 'desc' },
    include: {
      channel: { select: { id: true, code: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      _count: { select: { lines: true } },
    },
  });
}

export async function getSettlement(id: string) {
  const settlement = await prisma.settlement.findUnique({
    where: { id },
    include: {
      channel: true,
      createdBy: { select: { id: true, name: true, email: true } },
      lines: {
        include: {
          order: {
            select: {
              id: true,
              publicCode: true,
              totalCents: true,
              commissionAmountCents: true,
              netPayoutExpectedCents: true,
              placedAt: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!settlement) throw new AppError(404, 'NOT_FOUND', 'Settlement not found');
  return settlement;
}

/** Parse platform CSV: externalOrderRef,reportedCommissionCents */
export function parseSettlementCsv(text: string): Array<{
  externalOrderRef: string;
  reportedCommissionCents: number;
}> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const rows: Array<{ externalOrderRef: string; reportedCommissionCents: number }> = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const lower = line.toLowerCase();
    if (
      i === 0 &&
      (lower.includes('external') || lower.includes('ref') || lower.includes('commission'))
    ) {
      continue;
    }
    const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
    const ref = parts[0];
    const amountRaw = parts[1];
    if (!ref || amountRaw === undefined) continue;
    const reportedCommissionCents = Number(amountRaw);
    if (!Number.isFinite(reportedCommissionCents)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Invalid commission amount for ${ref}`);
    }
    rows.push({
      externalOrderRef: ref,
      reportedCommissionCents: Math.round(reportedCommissionCents),
    });
  }
  return rows;
}

export async function uploadSettlementCsv(input: {
  settlementId: string;
  buffer: Buffer;
  filename: string;
  actorId: string;
}) {
  const settlement = await getSettlement(input.settlementId);
  if (settlement.status === SettlementStatus.COLLECTED) {
    throw new AppError(409, 'SETTLEMENT_CLOSED', 'Settlement is already closed');
  }

  const stored = await storage.putObject({
    buffer: input.buffer,
    contentType: 'text/csv',
    folder: 'settlements',
    filename: input.filename.endsWith('.csv') ? input.filename : `${input.filename}.csv`,
  });

  const parsed = parseSettlementCsv(input.buffer.toString('utf8'));
  const byRef = new Map(parsed.map((r) => [r.externalOrderRef, r.reportedCommissionCents]));

  await prisma.$transaction(async (tx) => {
    for (const line of settlement.lines) {
      const ref = line.externalOrderRef;
      if (!ref || !byRef.has(ref)) continue;
      const reported = byRef.get(ref)!;
      const differenceCents = reported - line.expectedCommissionCents;
      await tx.settlementLine.update({
        where: { id: line.id },
        data: {
          reportedCommissionCents: reported,
          differenceCents,
        },
      });
    }

    const refreshed = await tx.settlementLine.findMany({ where: { settlementId: settlement.id } });
    const hasDiff = refreshed.some((l) => (l.differenceCents ?? 0) !== 0);
    const reportedNet = refreshed.reduce((sum, l) => {
      const expectedNet =
        (l.orderId
          ? settlement.lines.find((x) => x.id === l.id)?.order?.netPayoutExpectedCents
          : null) ?? 0;
      // Approximate reported net as total-style: keep expectedNetCents field as sum of (order net adjusted by commission diff)
      return sum + expectedNet - (l.differenceCents ?? 0);
    }, 0);

    await tx.settlement.update({
      where: { id: settlement.id },
      data: {
        csvObjectKey: stored.key,
        reportedNetCents: reportedNet,
        status: hasDiff ? SettlementStatus.WITH_DIFFERENCES : SettlementStatus.RECONCILED,
      },
    });
  });

  await writeAuditLog({
    actorId: input.actorId,
    action: 'SETTLEMENT_CSV_UPLOAD',
    entityType: 'Settlement',
    entityId: settlement.id,
    after: { csvObjectKey: stored.key, rows: parsed.length },
  });

  return getSettlement(settlement.id);
}

export async function closeSettlement(input: { settlementId: string; actorId: string }) {
  const settlement = await getSettlement(input.settlementId);
  if (settlement.status === SettlementStatus.COLLECTED) {
    return settlement;
  }
  if (settlement.status === SettlementStatus.PENDING) {
    throw new AppError(409, 'SETTLEMENT_OPEN', 'Upload and reconcile CSV before closing');
  }

  const closed = await prisma.settlement.update({
    where: { id: settlement.id },
    data: { status: SettlementStatus.COLLECTED },
    include: {
      channel: true,
      createdBy: { select: { id: true, name: true, email: true } },
      lines: { include: { order: true } },
    },
  });

  await writeAuditLog({
    actorId: input.actorId,
    action: 'SETTLEMENT_CLOSE',
    entityType: 'Settlement',
    entityId: settlement.id,
  });

  return closed;
}

export async function commissionReport(input: { from: Date; to: Date }) {
  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      status: { not: OrderStatus.CANCELLED },
      placedAt: { gte: input.from, lte: input.to },
    },
    include: {
      channel: true,
      commissionAdjustments: true,
    },
  });

  type Bucket = {
    channelId: string;
    channelCode: string;
    channelName: string;
    orderCount: number;
    grossCents: number;
    commissionCents: number;
    adjustmentsCents: number;
    netCents: number;
  };

  const byChannel = new Map<string, Bucket>();
  for (const order of orders) {
    const key = order.channelId;
    const bucket =
      byChannel.get(key) ??
      ({
        channelId: order.channel.id,
        channelCode: order.channel.code,
        channelName: order.channel.name,
        orderCount: 0,
        grossCents: 0,
        commissionCents: 0,
        adjustmentsCents: 0,
        netCents: 0,
      } satisfies Bucket);

    const adjustments = order.commissionAdjustments.reduce((s, a) => s + a.amountCents, 0);
    const commission = (order.commissionAmountCents ?? 0) + adjustments;
    bucket.orderCount += 1;
    bucket.grossCents += order.totalCents;
    bucket.commissionCents += order.commissionAmountCents ?? 0;
    bucket.adjustmentsCents += adjustments;
    bucket.netCents += order.totalCents - commission;
    byChannel.set(key, bucket);
  }

  const channels = [...byChannel.values()].map((b) => ({
    ...b,
    effectiveCommissionPercent:
      b.grossCents === 0
        ? 0
        : Number(((b.commissionCents + b.adjustmentsCents) / b.grossCents).toFixed(4)),
    profitAfterCommissionCents: b.netCents,
  }));

  const direct = channels.find((c) => c.channelCode === 'DIRECT');
  const platformChannels = channels.filter((c) => ['PEDIDOS_YA', 'YUMMY'].includes(c.channelCode));
  const platformGrossCents = platformChannels.reduce((s, c) => s + c.grossCents, 0);
  const platformCommissionCents = platformChannels.reduce(
    (s, c) => s + c.commissionCents + c.adjustmentsCents,
    0,
  );

  return {
    from: input.from,
    to: input.to,
    channels,
    comparison: {
      directGrossCents: direct?.grossCents ?? 0,
      platformGrossCents,
      platformCommissionCents,
      platformCostVsDirectCents: platformCommissionCents,
    },
  };
}

export async function simulateCommissionChange(input: {
  channelId: string;
  from: Date;
  to: Date;
  newPercent: number;
}) {
  if (input.newPercent < 0 || input.newPercent > 1) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Percent must be between 0 and 1');
  }

  const orders = await prisma.order.findMany({
    where: {
      channelId: input.channelId,
      deletedAt: null,
      status: { not: OrderStatus.CANCELLED },
      placedAt: { gte: input.from, lte: input.to },
    },
    include: { commissionAdjustments: true },
  });

  let actualCommission = 0;
  let simulatedCommission = 0;
  let gross = 0;

  for (const order of orders) {
    const adjustments = order.commissionAdjustments.reduce((s, a) => s + a.amountCents, 0);
    actualCommission += (order.commissionAmountCents ?? 0) + adjustments;
    const base = order.commissionBaseAmountCents ?? order.subtotalCents;
    simulatedCommission += Math.round(base * input.newPercent) + adjustments;
    gross += order.totalCents;
  }

  return {
    orderCount: orders.length,
    grossCents: gross,
    actualCommissionCents: actualCommission,
    simulatedCommissionCents: simulatedCommission,
    deltaCommissionCents: simulatedCommission - actualCommission,
    actualNetCents: gross - actualCommission,
    simulatedNetCents: gross - simulatedCommission,
    readOnly: true as const,
  };
}
