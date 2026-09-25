import { resolveChannelPriceCents } from '@cerotres/shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { writeAuditLog } from '../lib/audit.js';

export type ChannelPriceDto = {
  channelId: string;
  channelCode: string;
  channelName: string;
  priceCents: number;
};

export function toChannelPriceDtos(
  rows: Array<{
    channelId: string;
    priceCents: number;
    channel: { code: string; name: string };
  }>,
): ChannelPriceDto[] {
  return rows.map((row) => ({
    channelId: row.channelId,
    channelCode: row.channel.code,
    channelName: row.channel.name,
    priceCents: row.priceCents,
  }));
}

export async function loadChannelPriceOverrideMap(
  productIds: string[],
  channelId: string,
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const rows = await prisma.productChannelPrice.findMany({
    where: { productId: { in: productIds }, channelId },
    select: { productId: true, priceCents: true },
  });
  return new Map(rows.map((row) => [row.productId, row.priceCents]));
}

export function priceForChannel(
  catalogPriceCents: number,
  overrideByProductId: Map<string, number>,
  productId: string,
): number {
  return resolveChannelPriceCents(catalogPriceCents, overrideByProductId.get(productId));
}

export async function syncProductChannelPrices(input: {
  productId: string;
  prices: Array<{ channelId: string; priceCents: number | null }>;
  actorId: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<ChannelPriceDto[]> {
  const channelIds = [...new Set(input.prices.map((p) => p.channelId))];
  const channels = await prisma.salesChannel.findMany({
    where: { id: { in: channelIds }, isActive: true },
    select: { id: true, code: true },
  });
  if (channels.length !== channelIds.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid or inactive channel');
  }

  const before = await prisma.productChannelPrice.findMany({
    where: { productId: input.productId },
    select: { channelId: true, priceCents: true },
  });

  await prisma.$transaction(async (tx) => {
    for (const row of input.prices) {
      if (row.priceCents === null) {
        await tx.productChannelPrice.deleteMany({
          where: { productId: input.productId, channelId: row.channelId },
        });
        continue;
      }
      await tx.productChannelPrice.upsert({
        where: {
          productId_channelId: { productId: input.productId, channelId: row.channelId },
        },
        create: {
          productId: input.productId,
          channelId: row.channelId,
          priceCents: row.priceCents,
        },
        update: { priceCents: row.priceCents },
      });
    }
  });

  const after = await prisma.productChannelPrice.findMany({
    where: { productId: input.productId },
    include: { channel: { select: { code: true, name: true } } },
    orderBy: { channel: { name: 'asc' } },
  });

  await writeAuditLog({
    actorId: input.actorId,
    action: 'PRODUCT_CHANNEL_PRICES_UPDATE',
    entityType: 'Product',
    entityId: input.productId,
    before: { channelPrices: before },
    after: {
      channelPrices: after.map((row) => ({
        channelId: row.channelId,
        channelCode: row.channel.code,
        priceCents: row.priceCents,
      })),
    },
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return toChannelPriceDtos(after);
}

const channelPriceInclude = {
  channel: { select: { code: true, name: true } },
} as const;

export const productChannelPricesInclude = {
  channelPrices: {
    include: channelPriceInclude,
    orderBy: { channel: { name: 'asc' as const } },
  },
};
