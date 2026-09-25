import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

/** Round once at the end of a monetary sum of (qty * unitCents). */
export function costFromQuantity(quantity: number, unitCostCents: number): number {
  return Math.round(quantity * unitCostCents);
}

export function weightedAverageCostCents(input: {
  currentStock: number;
  currentAvgCents: number;
  incomingQty: number;
  incomingUnitCostCents: number;
}): number {
  const currentStock = Math.max(0, input.currentStock);
  const incomingQty = Math.max(0, input.incomingQty);
  const totalQty = currentStock + incomingQty;
  if (totalQty <= 0) return input.incomingUnitCostCents;
  const totalValue =
    currentStock * input.currentAvgCents + incomingQty * input.incomingUnitCostCents;
  return Math.round(totalValue / totalQty);
}

export type RecipeCostLine = {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  quantity: number;
  unitCostCents: number;
  lineCostCents: number;
};

export type ProductRecipeCost = {
  productId: string;
  recipeCostCents: number;
  foodCostPercent: number | null;
  lines: RecipeCostLine[];
};

export type ModifierOptionRecipeCost = {
  modifierOptionId: string;
  recipeCostCents: number;
  lines: RecipeCostLine[];
};

export type OrderLineCogsInput = {
  productId: string;
  quantity: number;
  options?: Array<{ optionId: string; quantity: number }>;
};

export type OrderLineOptionCogs = {
  optionId: string;
  /** Cost of this option selection for one unit of the parent product */
  unitCogsCents: number;
  /** unitCogsCents × parent line quantity */
  lineCogsCents: number;
};

export type OrderLineCogs = {
  index: number;
  productId: string;
  unitCogsCents: number;
  lineCogsCents: number;
  optionCogs: OrderLineOptionCogs[];
};

async function recipeLinesFromItems(
  items: Array<{
    quantity: Prisma.Decimal;
    ingredient: {
      id: string;
      name: string;
      unit: string;
      avgCostCents: number;
      costPerUnitCents: number;
    };
  }>,
): Promise<{ lines: RecipeCostLine[]; recipeCostCents: number }> {
  const lines: RecipeCostLine[] = items.map((item) => {
    const quantity = Number(item.quantity.toString());
    const unitCostCents = item.ingredient.avgCostCents || item.ingredient.costPerUnitCents;
    return {
      ingredientId: item.ingredient.id,
      ingredientName: item.ingredient.name,
      unit: item.ingredient.unit,
      quantity,
      unitCostCents,
      lineCostCents: costFromQuantity(quantity, unitCostCents),
    };
  });
  const recipeCostCents = lines.reduce((sum, line) => sum + line.lineCostCents, 0);
  return { lines, recipeCostCents };
}

export async function calculateProductRecipeCost(
  productId: string,
  sellPriceCents?: number,
): Promise<ProductRecipeCost> {
  const items = await prisma.recipeItem.findMany({
    where: { productId },
    include: { ingredient: true },
  });

  const { lines, recipeCostCents } = await recipeLinesFromItems(items);
  const foodCostPercent =
    sellPriceCents && sellPriceCents > 0
      ? Number((recipeCostCents / sellPriceCents).toFixed(4))
      : null;

  return { productId, recipeCostCents, foodCostPercent, lines };
}

export async function calculateModifierOptionRecipeCost(
  modifierOptionId: string,
): Promise<ModifierOptionRecipeCost> {
  const items = await prisma.modifierOptionRecipeItem.findMany({
    where: { modifierOptionId },
    include: { ingredient: true },
  });
  const { lines, recipeCostCents } = await recipeLinesFromItems(items);
  return { modifierOptionId, recipeCostCents, lines };
}

export async function calculateOrderCogs(items: OrderLineCogsInput[]): Promise<{
  orderCogsCents: number;
  itemCogs: OrderLineCogs[];
}> {
  const itemCogs: OrderLineCogs[] = [];
  let orderCogsCents = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    const productCost = await calculateProductRecipeCost(item.productId);
    let optionsUnitCogs = 0;
    const optionCogs: OrderLineOptionCogs[] = [];

    for (const opt of item.options ?? []) {
      const optCost = await calculateModifierOptionRecipeCost(opt.optionId);
      const unitCogsCents = optCost.recipeCostCents * opt.quantity;
      const lineCogsCents = unitCogsCents * item.quantity;
      optionCogs.push({ optionId: opt.optionId, unitCogsCents, lineCogsCents });
      optionsUnitCogs += unitCogsCents;
    }

    const unitCogsCents = productCost.recipeCostCents + optionsUnitCogs;
    const lineCogsCents = unitCogsCents * item.quantity;
    itemCogs.push({
      index,
      productId: item.productId,
      unitCogsCents,
      lineCogsCents,
      optionCogs,
    });
    orderCogsCents += lineCogsCents;
  }

  return { orderCogsCents, itemCogs };
}

/** Deduct recipe ingredients (product + selected modifiers) from stock. */
export async function consumeRecipeStock(
  tx: Prisma.TransactionClient,
  items: OrderLineCogsInput[],
) {
  for (const item of items) {
    const recipe = await tx.recipeItem.findMany({
      where: { productId: item.productId },
    });
    for (const line of recipe) {
      const consumeQty = Number(line.quantity.toString()) * item.quantity;
      await tx.ingredient.update({
        where: { id: line.ingredientId },
        data: {
          stockQuantity: {
            decrement: new Prisma.Decimal(consumeQty),
          },
        },
      });
    }

    for (const opt of item.options ?? []) {
      const optRecipe = await tx.modifierOptionRecipeItem.findMany({
        where: { modifierOptionId: opt.optionId },
      });
      for (const line of optRecipe) {
        const consumeQty = Number(line.quantity.toString()) * opt.quantity * item.quantity;
        await tx.ingredient.update({
          where: { id: line.ingredientId },
          data: {
            stockQuantity: {
              decrement: new Prisma.Decimal(consumeQty),
            },
          },
        });
      }
    }
  }
}
