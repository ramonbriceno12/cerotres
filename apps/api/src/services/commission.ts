import { FeeBase, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

export type ResolvedCommission = {
  channelFeeRateId: string | null;
  percent: Prisma.Decimal;
  fixedFeeCents: number;
  appliesTo: FeeBase;
  baseAmountCents: number;
  commissionAmountCents: number;
  netPayoutExpectedCents: number;
  rateNote: string | null;
  effectiveFrom: Date | null;
};

/** Pure commission math — round once at the end. */
export function calculateCommissionAmounts(input: {
  percent: number;
  fixedFeeCents: number;
  appliesTo: FeeBase;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
}): {
  baseAmountCents: number;
  commissionAmountCents: number;
  netPayoutExpectedCents: number;
} {
  let baseAmountCents = input.subtotalCents;
  if (input.appliesTo === FeeBase.SUBTOTAL_PLUS_DELIVERY) {
    baseAmountCents = input.subtotalCents + input.deliveryFeeCents;
  } else if (input.appliesTo === FeeBase.ORDER_TOTAL) {
    baseAmountCents = input.totalCents;
  }

  const percentPart = Math.round(baseAmountCents * input.percent);
  const commissionAmountCents = percentPart + input.fixedFeeCents;
  const netPayoutExpectedCents = input.totalCents - commissionAmountCents;
  return { baseAmountCents, commissionAmountCents, netPayoutExpectedCents };
}

/** Resolve channel fee for the order date and freeze snapshot amounts. */
export async function resolveCommissionSnapshot(input: {
  channelId: string;
  placedAt: Date;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
}): Promise<ResolvedCommission> {
  const rate = await prisma.channelFeeRate.findFirst({
    where: {
      channelId: input.channelId,
      effectiveFrom: { lte: input.placedAt },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: input.placedAt } }],
    },
    orderBy: { effectiveFrom: 'desc' },
  });

  if (!rate) {
    return {
      channelFeeRateId: null,
      percent: new Prisma.Decimal(0),
      fixedFeeCents: 0,
      appliesTo: FeeBase.SUBTOTAL,
      baseAmountCents: input.subtotalCents,
      commissionAmountCents: 0,
      netPayoutExpectedCents: input.totalCents,
      rateNote: null,
      effectiveFrom: null,
    };
  }

  const amounts = calculateCommissionAmounts({
    percent: Number(rate.percent.toString()),
    fixedFeeCents: rate.fixedFeeCents,
    appliesTo: rate.appliesTo,
    subtotalCents: input.subtotalCents,
    deliveryFeeCents: input.deliveryFeeCents,
    totalCents: input.totalCents,
  });

  return {
    channelFeeRateId: rate.id,
    percent: rate.percent,
    fixedFeeCents: rate.fixedFeeCents,
    appliesTo: rate.appliesTo,
    baseAmountCents: amounts.baseAmountCents,
    commissionAmountCents: amounts.commissionAmountCents,
    netPayoutExpectedCents: amounts.netPayoutExpectedCents,
    rateNote: rate.note,
    effectiveFrom: rate.effectiveFrom,
  };
}

export async function previewCommissionForChannel(input: {
  channelId: string;
  placedAt: Date;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
}) {
  const channel = await prisma.salesChannel.findFirst({
    where: { id: input.channelId, isActive: true },
  });
  if (!channel) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid channel');

  const snapshot = await resolveCommissionSnapshot(input);
  return {
    channel: { id: channel.id, code: channel.code, name: channel.name },
    snapshot,
  };
}

/** Close current open rate and open a new one in one transaction. */
export async function createChannelFeeRate(input: {
  channelId: string;
  percent: number;
  fixedFeeCents?: number;
  appliesTo: FeeBase;
  effectiveFrom: Date;
  note?: string | null;
  createdById: string;
}) {
  const channel = await prisma.salesChannel.findFirst({
    where: { id: input.channelId, isActive: true },
  });
  if (!channel) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid channel');

  if (input.percent < 0 || input.percent > 1) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Percent must be between 0 and 1');
  }

  const priorOpenCount = await prisma.order.count({
    where: {
      channelId: input.channelId,
      deletedAt: null,
      placedAt: { lt: input.effectiveFrom },
    },
  });

  const result = await prisma.$transaction(async (tx) => {
    const openRates = await tx.channelFeeRate.findMany({
      where: {
        channelId: input.channelId,
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: input.effectiveFrom } }],
      },
    });

    for (const rate of openRates) {
      if (rate.effectiveFrom >= input.effectiveFrom) {
        throw new AppError(
          409,
          'FEE_OVERLAP',
          'A fee rate already starts on or after this effective date',
        );
      }
      if (!rate.effectiveTo || rate.effectiveTo > input.effectiveFrom) {
        await tx.channelFeeRate.update({
          where: { id: rate.id },
          data: { effectiveTo: input.effectiveFrom },
        });
      }
    }

    const created = await tx.channelFeeRate.create({
      data: {
        channelId: input.channelId,
        percent: new Prisma.Decimal(input.percent.toFixed(4)),
        fixedFeeCents: input.fixedFeeCents ?? 0,
        appliesTo: input.appliesTo,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: null,
        note: input.note ?? null,
        createdById: input.createdById,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return created;
  });

  return {
    rate: result,
    warning: `Aplica solo desde el ${input.effectiveFrom.toISOString().slice(0, 10)}. Los ${priorOpenCount} pedidos anteriores mantienen su comisión original.`,
    priorOrderCount: priorOpenCount,
  };
}
