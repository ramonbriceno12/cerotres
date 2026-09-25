import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FeeBase, FulfillmentType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { createAdminOrder } from '../services/ordersAdmin.js';

describe('channel-specific product prices', () => {
  let ownerId: string;
  let channelId: string;
  let productId: string;
  let catalogPriceCents: number;
  const createdOrderIds: string[] = [];
  const testChannelCode = `PY_PRICE_${Date.now()}`;
  const overrideCents = 890;

  beforeAll(async () => {
    const owner = await prisma.adminUser.findFirst({
      where: { email: 'owner@cerotres.com', deletedAt: null },
    });
    if (!owner) throw new Error('Seed owner missing — run prisma db seed');
    ownerId = owner.id;

    const product = await prisma.product.findFirst({
      where: { deletedAt: null, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    if (!product) throw new Error('No product in seed');
    productId = product.id;
    catalogPriceCents = product.priceCents;

    const channel = await prisma.salesChannel.create({
      data: {
        code: testChannelCode,
        name: 'Delivery App Price Test',
        requiresExternalRef: true,
        isActive: true,
      },
    });
    channelId = channel.id;

    await prisma.channelFeeRate.create({
      data: {
        channelId,
        percent: new Prisma.Decimal('0.2500'),
        fixedFeeCents: 0,
        appliesTo: FeeBase.SUBTOTAL,
        effectiveFrom: new Date('2024-01-01T00:00:00.000Z'),
        createdById: ownerId,
      },
    });

    await prisma.productChannelPrice.create({
      data: { productId, channelId, priceCents: overrideCents },
    });
  });

  afterAll(async () => {
    if (createdOrderIds.length) {
      await prisma.settlementLine.deleteMany({ where: { orderId: { in: createdOrderIds } } });
      await prisma.commissionAdjustment.deleteMany({ where: { orderId: { in: createdOrderIds } } });
      await prisma.orderStatusEvent.deleteMany({ where: { orderId: { in: createdOrderIds } } });
      await prisma.payment.deleteMany({ where: { orderId: { in: createdOrderIds } } });
      await prisma.orderItemOption.deleteMany({
        where: { orderItem: { orderId: { in: createdOrderIds } } },
      });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    }
    await prisma.productChannelPrice.deleteMany({ where: { channelId } });
    await prisma.channelFeeRate.deleteMany({ where: { channelId } });
    await prisma.salesChannel.deleteMany({ where: { id: channelId } });
    await prisma.$disconnect();
  });

  async function createOrder(lineTotalCents: number) {
    return createAdminOrder({
      channelId,
      externalOrderRef: `PY-PRICE-${Date.now()}`,
      customerName: 'Cliente Precio App',
      fulfillmentType: FulfillmentType.PICKUP,
      paymentMethod: 'OTHER',
      clientTotalCents: lineTotalCents,
      items: [
        {
          productId,
          quantity: 1,
          clientLineTotalCents: lineTotalCents,
          options: [],
        },
      ],
      actorId: ownerId,
    });
  }

  it('accepts the channel override price on admin create', async () => {
    expect(overrideCents).not.toBe(catalogPriceCents);
    const result = await createOrder(overrideCents);
    createdOrderIds.push(result.order.id);
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: result.order.id },
      include: { items: true },
    });
    expect(order.subtotalCents).toBe(overrideCents);
    expect(order.totalCents).toBe(overrideCents);
    expect(order.items[0]?.lineTotalCents).toBe(overrideCents);
  });

  it('rejects the web catalog price when the channel has an override', async () => {
    try {
      await createOrder(catalogPriceCents);
      expect.fail('expected PRICE_MISMATCH');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('PRICE_MISMATCH');
    }
  });
});
