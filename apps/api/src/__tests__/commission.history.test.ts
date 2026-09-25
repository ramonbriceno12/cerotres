import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FeeBase, FulfillmentType, OrderStatus, Prisma } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { calculateCommissionAmounts } from '../services/commission.js';
import { createAdminOrder } from '../services/ordersAdmin.js';
import { getPublicOrderByCode, toPublicOrderFields } from '../services/orders.js';

const app = createApp();

describe('commission historical integrity', () => {
  let ownerId: string;
  let channelId: string;
  let productId: string;
  let rate25Id: string;
  const createdOrderIds: string[] = [];
  const createdRateIds: string[] = [];
  const testChannelCode = `PY_TEST_${Date.now()}`;

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

    const channel = await prisma.salesChannel.create({
      data: {
        code: testChannelCode,
        name: 'Platform Test Channel',
        requiresExternalRef: true,
        isActive: true,
      },
    });
    channelId = channel.id;

    const rate25 = await prisma.channelFeeRate.create({
      data: {
        channelId,
        percent: new Prisma.Decimal('0.2500'),
        fixedFeeCents: 0,
        appliesTo: FeeBase.SUBTOTAL,
        effectiveFrom: new Date('2024-01-01T00:00:00.000Z'),
        effectiveTo: null,
        note: 'test 25%',
        createdById: ownerId,
      },
    });
    rate25Id = rate25.id;
    createdRateIds.push(rate25.id);
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
    await prisma.channelFeeRate.deleteMany({ where: { channelId } });
    await prisma.salesChannel.deleteMany({ where: { id: channelId } });
    await prisma.$disconnect();
  });

  async function createPyOrder(input: { placedAt: Date; externalRef?: string }) {
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    const lineTotal = product.priceCents;
    const result = await createAdminOrder({
      channelId,
      externalOrderRef: input.externalRef ?? `PY-TEST-${Date.now()}`,
      customerName: 'Cliente Prueba',
      customerEmail: `cliente-${Date.now()}-${Math.random().toString(16).slice(2)}@test.local`,
      customerPhone: '+584120000000',
      fulfillmentType: FulfillmentType.PICKUP,
      placedAt: input.placedAt.toISOString(),
      paymentMethod: 'OTHER',
      clientTotalCents: lineTotal,
      items: [
        {
          productId,
          quantity: 1,
          clientLineTotalCents: lineTotal,
          options: [],
        },
      ],
      actorId: ownerId,
    });
    createdOrderIds.push(result.order.id);
    return result;
  }

  it('1. PedidosYa order copies the current fee into the snapshot', async () => {
    const created = await createPyOrder({
      placedAt: new Date('2025-06-15T12:00:00.000Z'),
      externalRef: 'PY-SNAP-1',
    });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: created.order.id } });
    expect(order.channelFeeRateId).toBe(rate25Id);
    expect(Number(order.commissionPercentSnapshot?.toString())).toBeCloseTo(0.25, 4);
    expect(order.commissionAmountCents).toBe(Math.round(order.subtotalCents * 0.25));
    expect(order.netPayoutExpectedCents).toBe(
      order.totalCents - (order.commissionAmountCents ?? 0),
    );
  });

  it('2. Raising the fee to 30% does not change prior order snapshots', async () => {
    const prior = await createPyOrder({
      placedAt: new Date('2025-06-16T12:00:00.000Z'),
      externalRef: 'PY-PRIOR',
    });
    const before = await prisma.order.findUniqueOrThrow({ where: { id: prior.order.id } });
    const oldPercent = before.commissionPercentSnapshot;
    const oldAmount = before.commissionAmountCents;

    const cutover = new Date('2025-07-01T00:00:00.000Z');
    await prisma.$transaction(async (tx) => {
      await tx.channelFeeRate.update({
        where: { id: rate25Id },
        data: { effectiveTo: cutover },
      });
      const rate30 = await tx.channelFeeRate.create({
        data: {
          channelId,
          percent: new Prisma.Decimal('0.3000'),
          fixedFeeCents: 0,
          appliesTo: FeeBase.SUBTOTAL,
          effectiveFrom: cutover,
          effectiveTo: null,
          note: 'test 30%',
          createdById: ownerId,
        },
      });
      createdRateIds.push(rate30.id);
    });

    const after = await prisma.order.findUniqueOrThrow({ where: { id: prior.order.id } });
    expect(after.commissionPercentSnapshot?.toString()).toBe(oldPercent?.toString());
    expect(after.commissionAmountCents).toBe(oldAmount);
  });

  it('3. Retroactive placedAt uses the fee valid on that date', async () => {
    const retro = await createPyOrder({
      placedAt: new Date('2025-03-10T15:00:00.000Z'),
      externalRef: 'PY-RETRO',
    });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: retro.order.id } });
    expect(Number(order.commissionPercentSnapshot?.toString())).toBeCloseTo(0.25, 4);

    const afterCutover = await createPyOrder({
      placedAt: new Date('2025-08-10T15:00:00.000Z'),
      externalRef: 'PY-AFTER',
    });
    const order2 = await prisma.order.findUniqueOrThrow({ where: { id: afterCutover.order.id } });
    expect(Number(order2.commissionPercentSnapshot?.toString())).toBeCloseTo(0.3, 4);
  });

  it('4. Overlapping fee rates for the same channel fail at the database', async () => {
    await expect(
      prisma.channelFeeRate.create({
        data: {
          channelId,
          percent: new Prisma.Decimal('0.2200'),
          fixedFeeCents: 0,
          appliesTo: FeeBase.SUBTOTAL,
          effectiveFrom: new Date('2025-08-01T00:00:00.000Z'),
          effectiveTo: null,
          note: 'overlap attempt',
          createdById: ownerId,
        },
      }),
    ).rejects.toThrow(/channel_fee_no_overlap|overlap/i);
  });

  it('5. Updating commission snapshot on a non-DRAFT order is rejected by trigger', async () => {
    const created = await createPyOrder({
      placedAt: new Date('2025-08-11T12:00:00.000Z'),
      externalRef: 'PY-IMMUT',
    });
    expect(created.order.status).not.toBe(OrderStatus.DRAFT);

    await expect(
      prisma.order.update({
        where: { id: created.order.id },
        data: { commissionPercentSnapshot: new Prisma.Decimal('0.9900') },
      }),
    ).rejects.toThrow(/inmutable|immutable|snapshot/i);
  });

  it('6. Public serializer hides channel, commission, external ref, and net', async () => {
    const created = await createPyOrder({
      placedAt: new Date('2025-08-12T12:00:00.000Z'),
      externalRef: 'PY-SECRET-999',
    });

    const publicOrder = await getPublicOrderByCode(created.order.publicCode);
    expect(publicOrder).toBeTruthy();
    const json = JSON.stringify(publicOrder);
    expect(json.toLowerCase()).not.toMatch(/pedidosya/);
    expect(json).not.toMatch(/commission/i);
    expect(json).not.toMatch(/externalOrderRef|PY-SECRET/);
    expect(json).not.toMatch(/netPayout|channelId|channelFee/i);

    const fields = toPublicOrderFields(publicOrder as unknown as Record<string, unknown>);
    expect(fields).not.toContain('channel');
    expect(fields).not.toContain('commissionAmountCents');
    expect(fields).not.toContain('externalOrderRef');
    expect(fields).not.toContain('netPayoutExpectedCents');

    const http = await request(app).get(`/api/public/orders/${created.order.publicCode}`);
    expect(http.status).toBe(200);
    const body = JSON.stringify(http.body);
    expect(body.toLowerCase()).not.toMatch(/pedidosya/);
    expect(body).not.toMatch(/commission/i);
    expect(body).not.toMatch(/PY-SECRET/);
  });

  it('7. appliesTo SUBTOTAL ignores delivery; SUBTOTAL_PLUS_DELIVERY includes it', () => {
    const subtotal = 10000;
    const delivery = 2000;
    const total = 12000;

    const onSubtotal = calculateCommissionAmounts({
      percent: 0.25,
      fixedFeeCents: 0,
      appliesTo: FeeBase.SUBTOTAL,
      subtotalCents: subtotal,
      deliveryFeeCents: delivery,
      totalCents: total,
    });
    expect(onSubtotal.baseAmountCents).toBe(10000);
    expect(onSubtotal.commissionAmountCents).toBe(2500);
    expect(onSubtotal.netPayoutExpectedCents).toBe(9500);

    const onSubtotalPlus = calculateCommissionAmounts({
      percent: 0.25,
      fixedFeeCents: 0,
      appliesTo: FeeBase.SUBTOTAL_PLUS_DELIVERY,
      subtotalCents: subtotal,
      deliveryFeeCents: delivery,
      totalCents: total,
    });
    expect(onSubtotalPlus.baseAmountCents).toBe(12000);
    expect(onSubtotalPlus.commissionAmountCents).toBe(3000);
    expect(onSubtotalPlus.netPayoutExpectedCents).toBe(9000);
  });
});
