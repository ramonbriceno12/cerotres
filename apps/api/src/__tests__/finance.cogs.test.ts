import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  calculateProductRecipeCost,
  costFromQuantity,
  weightedAverageCostCents,
} from '../services/cogs.js';
import { setProductRecipe, upsertIngredient } from '../services/finance.js';

describe('finance COGS and recipes', () => {
  let ownerId: string;
  let productId: string;
  let meatId: string;
  let breadId: string;
  const cleanupIngredientIds: string[] = [];

  beforeAll(async () => {
    const owner = await prisma.adminUser.findFirst({
      where: { email: 'owner@cerotres.com', deletedAt: null },
    });
    if (!owner) throw new Error('Seed owner missing');
    ownerId = owner.id;

    const product = await prisma.product.findFirst({
      where: { deletedAt: null, name: { contains: 'Lomito', mode: 'insensitive' } },
    });
    if (!product) throw new Error('Pepito lomito missing from seed');
    productId = product.id;

    const meat = await upsertIngredient({
      code: `TEST-MEAT-${Date.now()}`,
      name: 'Carne test',
      unit: 'kg',
      avgCostCents: 670,
      stockQuantity: 10,
      minStockQuantity: 1,
      actorId: ownerId,
    });
    const bread = await upsertIngredient({
      code: `TEST-BREAD-${Date.now()}`,
      name: 'Pan test',
      unit: 'und',
      avgCostCents: 40,
      stockQuantity: 50,
      minStockQuantity: 5,
      actorId: ownerId,
    });
    meatId = meat.id;
    breadId = bread.id;
    cleanupIngredientIds.push(meat.id, bread.id);

    await setProductRecipe({
      productId,
      actorId: ownerId,
      lines: [
        { ingredientId: meatId, quantity: 0.18 },
        { ingredientId: breadId, quantity: 1 },
      ],
    });
  });

  afterAll(async () => {
    await prisma.recipeItem.deleteMany({ where: { productId } });
    await prisma.ingredient.deleteMany({ where: { id: { in: cleanupIngredientIds } } });
    await prisma.$disconnect();
  });

  it('food cost of a pepito matches hand calculation', async () => {
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    const expected = costFromQuantity(0.18, 670) + costFromQuantity(1, 40); // 121 + 40 = 161
    const cost = await calculateProductRecipeCost(productId, product.priceCents);
    expect(cost.recipeCostCents).toBe(expected);
    expect(cost.foodCostPercent).toBe(Number((expected / product.priceCents).toFixed(4)));
  });

  it('weighted average updates correctly on purchase math', () => {
    const avg = weightedAverageCostCents({
      currentStock: 10,
      currentAvgCents: 100,
      incomingQty: 10,
      incomingUnitCostCents: 200,
    });
    expect(avg).toBe(150);
  });

  it('changing ingredient cost does not alter frozen order COGS', async () => {
    const order = await prisma.order.create({
      data: {
        publicCode: `03-T${Date.now().toString(36).slice(-4).toUpperCase()}`,
        status: 'RECEIVED',
        channelId: (await prisma.salesChannel.findFirstOrThrow({ where: { code: 'DIRECT' } })).id,
        fulfillmentType: 'PICKUP',
        customerName: 'COGS Freeze',
        subtotalCents: 650,
        totalCents: 650,
        cogsCents: 161,
        placedAt: new Date(),
        commissionPercentSnapshot: new Prisma.Decimal(0),
        commissionAmountCents: 0,
        netPayoutExpectedCents: 650,
        items: {
          create: {
            productId,
            quantity: 1,
            productName: 'Test',
            unitPriceCents: 650,
            lineTotalCents: 650,
            unitCogsCents: 161,
            lineCogsCents: 161,
          },
        },
      },
    });

    await prisma.ingredient.update({
      where: { id: meatId },
      data: { avgCostCents: 9999, costPerUnitCents: 9999 },
    });

    const afterCost = await calculateProductRecipeCost(productId);
    expect(afterCost.recipeCostCents).toBeGreaterThan(161);

    const frozen = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(frozen.cogsCents).toBe(161);

    await expect(
      prisma.order.update({
        where: { id: order.id },
        data: { cogsCents: 1 },
      }),
    ).rejects.toThrow(/inmutable|COGS|costo/i);

    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.order.delete({ where: { id: order.id } });
  });

  it('selected modifier options add to line COGS', async () => {
    const { calculateOrderCogs, calculateModifierOptionRecipeCost } =
      await import('../services/cogs.js');
    const { setModifierOptionRecipe } = await import('../services/finance.js');

    const bacon = await upsertIngredient({
      code: `TEST-BACON-${Date.now()}`,
      name: 'Tocineta test',
      unit: 'kg',
      avgCostCents: 800,
      stockQuantity: 2,
      minStockQuantity: 0.2,
      actorId: ownerId,
    });
    cleanupIngredientIds.push(bacon.id);

    const option = await prisma.modifierOption.findFirst({
      where: { name: 'Tocineta Crispy', deletedAt: null },
    });
    if (!option) throw new Error('Tocineta Crispy missing from seed');

    await setModifierOptionRecipe({
      modifierOptionId: option.id,
      actorId: ownerId,
      lines: [{ ingredientId: bacon.id, quantity: 0.03 }], // 30g
    });

    const optCost = await calculateModifierOptionRecipeCost(option.id);
    expect(optCost.recipeCostCents).toBe(costFromQuantity(0.03, 800)); // 24

    const base = await calculateProductRecipeCost(productId);
    const withExtras = await calculateOrderCogs([
      {
        productId,
        quantity: 1,
        options: [{ optionId: option.id, quantity: 1 }],
      },
    ]);

    expect(withExtras.itemCogs[0]!.unitCogsCents).toBe(
      base.recipeCostCents + optCost.recipeCostCents,
    );
    expect(withExtras.orderCogsCents).toBe(base.recipeCostCents + optCost.recipeCostCents);

    await prisma.modifierOptionRecipeItem.deleteMany({
      where: { modifierOptionId: option.id },
    });
  });
});
