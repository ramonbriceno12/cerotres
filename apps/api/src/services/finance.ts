import { PayableStatus, Prisma, PurchasePaymentTerms, type OrderStatus } from '@prisma/client';
import { normalizeUnitCode } from '@cerotres/shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { writeAuditLog } from '../lib/audit.js';
import {
  calculateModifierOptionRecipeCost,
  calculateProductRecipeCost,
  costFromQuantity,
  weightedAverageCostCents,
} from './cogs.js';
import {
  buildUnitViews,
  convertToBaseQuantity,
  customFactorsFromRows,
  ensureSystemUnits,
  listUnitCatalog,
} from './units.js';

function dec(value: number | string) {
  return new Prisma.Decimal(value);
}

export async function listIngredients() {
  const [rows, units] = await Promise.all([
    prisma.ingredient.findMany({
      where: { deletedAt: null },
      include: { unitConversions: true },
      orderBy: { name: 'asc' },
    }),
    listUnitCatalog(),
  ]);

  return rows.map((row) => {
    const stockQuantity = Number(row.stockQuantity.toString());
    const minStockQuantity = Number(row.minStockQuantity.toString());
    const avgCostCents = row.avgCostCents || row.costPerUnitCents;
    const customToBase = customFactorsFromRows(row.unitConversions);
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      unit: row.unit,
      baseUnit: row.unit,
      avgCostCents,
      lastCostCents: row.lastCostCents,
      stockQuantity,
      minStockQuantity,
      lowStock: stockQuantity <= minStockQuantity,
      inventoryValueCents: costFromQuantity(stockQuantity, avgCostCents),
      conversions: row.unitConversions.map((c) => ({
        unitCode: c.unitCode,
        factorToBase: Number(c.factorToBase.toString()),
        note: c.note,
      })),
      unitViews: buildUnitViews({
        baseUnit: row.unit,
        stockQuantity,
        minStockQuantity,
        avgCostCents,
        units,
        customToBase,
      }),
    };
  });
}

export async function upsertIngredient(input: {
  id?: string;
  code?: string | null;
  name: string;
  unit: string;
  avgCostCents?: number;
  minStockQuantity?: number;
  stockQuantity?: number;
  isActive?: boolean;
  conversions?: Array<{ unitCode: string; factorToBase: number; note?: string | null }>;
  actorId: string;
}) {
  await ensureSystemUnits();
  const baseUnit = normalizeUnitCode(input.unit);
  const unitExists = await prisma.unit.findUnique({ where: { code: baseUnit } });
  if (!unitExists) {
    throw new AppError(400, 'UNKNOWN_UNIT', `Unknown base unit "${baseUnit}"`);
  }

  const data = {
    name: input.name.trim(),
    unit: baseUnit,
    code: input.code?.trim() || null,
    ...(input.avgCostCents !== undefined
      ? {
          avgCostCents: input.avgCostCents,
          costPerUnitCents: input.avgCostCents,
          lastCostCents: input.avgCostCents,
        }
      : {}),
    ...(input.minStockQuantity !== undefined
      ? { minStockQuantity: dec(input.minStockQuantity) }
      : {}),
    ...(input.stockQuantity !== undefined ? { stockQuantity: dec(input.stockQuantity) } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  };

  const ingredient = await prisma.$transaction(async (tx) => {
    const saved = input.id
      ? await tx.ingredient.update({ where: { id: input.id }, data })
      : await tx.ingredient.create({ data });

    if (input.conversions) {
      await tx.ingredientUnitConversion.deleteMany({ where: { ingredientId: saved.id } });
      for (const conv of input.conversions) {
        const code = normalizeUnitCode(conv.unitCode);
        if (code === baseUnit) continue;
        if (!(conv.factorToBase > 0)) {
          throw new AppError(400, 'VALIDATION_ERROR', 'factorToBase must be positive');
        }
        const alt = await tx.unit.findUnique({ where: { code } });
        if (!alt) {
          throw new AppError(400, 'UNKNOWN_UNIT', `Unknown unit "${code}"`);
        }
        await tx.ingredientUnitConversion.create({
          data: {
            ingredientId: saved.id,
            unitCode: code,
            factorToBase: dec(conv.factorToBase),
            note: conv.note ?? null,
          },
        });
      }
    }

    return saved;
  });

  await writeAuditLog({
    actorId: input.actorId,
    action: input.id ? 'INGREDIENT_UPDATE' : 'INGREDIENT_CREATE',
    entityType: 'Ingredient',
    entityId: ingredient.id,
    after: { name: ingredient.name, avgCostCents: ingredient.avgCostCents, unit: ingredient.unit },
  });

  return ingredient;
}

export async function getProductRecipe(productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
  });
  if (!product) throw new AppError(404, 'NOT_FOUND', 'Product not found');
  const cost = await calculateProductRecipeCost(productId, product.priceCents);
  return { product, ...cost };
}

export async function setProductRecipe(input: {
  productId: string;
  lines: Array<{ ingredientId: string; quantity: number; unitCode?: string }>;
  actorId: string;
}) {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, deletedAt: null },
  });
  if (!product) throw new AppError(404, 'NOT_FOUND', 'Product not found');

  const units = await listUnitCatalog();
  const normalizedLines: Array<{ ingredientId: string; quantity: number }> = [];

  for (const line of input.lines) {
    const ingredient = await prisma.ingredient.findFirst({
      where: { id: line.ingredientId, deletedAt: null },
      include: { unitConversions: true },
    });
    if (!ingredient) {
      throw new AppError(404, 'NOT_FOUND', `Ingredient ${line.ingredientId} not found`);
    }
    const entryUnit = normalizeUnitCode(line.unitCode ?? ingredient.unit);
    const quantityBase = convertToBaseQuantity({
      quantity: line.quantity,
      fromUnit: entryUnit,
      baseUnit: ingredient.unit,
      units,
      customToBase: customFactorsFromRows(ingredient.unitConversions),
    });
    normalizedLines.push({ ingredientId: line.ingredientId, quantity: quantityBase });
  }

  await prisma.$transaction(async (tx) => {
    await tx.recipeItem.deleteMany({ where: { productId: input.productId } });
    if (normalizedLines.length) {
      await tx.recipeItem.createMany({
        data: normalizedLines.map((line) => ({
          productId: input.productId,
          ingredientId: line.ingredientId,
          quantity: dec(line.quantity),
        })),
      });
    }
  });

  await writeAuditLog({
    actorId: input.actorId,
    action: 'RECIPE_SET',
    entityType: 'Product',
    entityId: input.productId,
    after: { lines: normalizedLines.length },
  });

  return getProductRecipe(input.productId);
}

export async function getModifierOptionRecipe(modifierOptionId: string) {
  const option = await prisma.modifierOption.findFirst({
    where: { id: modifierOptionId, deletedAt: null },
    include: { group: true },
  });
  if (!option) throw new AppError(404, 'NOT_FOUND', 'Modifier option not found');
  const cost = await calculateModifierOptionRecipeCost(modifierOptionId);
  return {
    option: {
      id: option.id,
      name: option.name,
      groupName: option.group.name,
      priceDeltaCents: option.priceDelta,
    },
    ...cost,
    marginCents: option.priceDelta - cost.recipeCostCents,
  };
}

export async function setModifierOptionRecipe(input: {
  modifierOptionId: string;
  lines: Array<{ ingredientId: string; quantity: number; unitCode?: string }>;
  actorId: string;
}) {
  const option = await prisma.modifierOption.findFirst({
    where: { id: input.modifierOptionId, deletedAt: null },
  });
  if (!option) throw new AppError(404, 'NOT_FOUND', 'Modifier option not found');

  const units = await listUnitCatalog();
  const normalizedLines: Array<{ ingredientId: string; quantity: number }> = [];

  for (const line of input.lines) {
    const ingredient = await prisma.ingredient.findFirst({
      where: { id: line.ingredientId, deletedAt: null },
      include: { unitConversions: true },
    });
    if (!ingredient) {
      throw new AppError(404, 'NOT_FOUND', `Ingredient ${line.ingredientId} not found`);
    }
    const entryUnit = normalizeUnitCode(line.unitCode ?? ingredient.unit);
    const quantityBase = convertToBaseQuantity({
      quantity: line.quantity,
      fromUnit: entryUnit,
      baseUnit: ingredient.unit,
      units,
      customToBase: customFactorsFromRows(ingredient.unitConversions),
    });
    normalizedLines.push({ ingredientId: line.ingredientId, quantity: quantityBase });
  }

  await prisma.$transaction(async (tx) => {
    await tx.modifierOptionRecipeItem.deleteMany({
      where: { modifierOptionId: input.modifierOptionId },
    });
    if (normalizedLines.length) {
      await tx.modifierOptionRecipeItem.createMany({
        data: normalizedLines.map((line) => ({
          modifierOptionId: input.modifierOptionId,
          ingredientId: line.ingredientId,
          quantity: dec(line.quantity),
        })),
      });
    }
  });

  await writeAuditLog({
    actorId: input.actorId,
    action: 'MODIFIER_RECIPE_SET',
    entityType: 'ModifierOption',
    entityId: input.modifierOptionId,
    after: { lines: normalizedLines.length },
  });

  return getModifierOptionRecipe(input.modifierOptionId);
}

export async function listModifierFoodCosts() {
  const options = await prisma.modifierOption.findMany({
    where: { deletedAt: null },
    include: { group: true },
    orderBy: [{ group: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
  });

  const rows = [];
  for (const option of options) {
    const cost = await calculateModifierOptionRecipeCost(option.id);
    const marginCents = option.priceDelta - cost.recipeCostCents;
    rows.push({
      modifierOptionId: option.id,
      name: option.name,
      groupName: option.group.name,
      priceDeltaCents: option.priceDelta,
      recipeCostCents: cost.recipeCostCents,
      marginCents,
      foodCostPercent:
        option.priceDelta > 0
          ? Number((cost.recipeCostCents / option.priceDelta).toFixed(4))
          : null,
      lines: cost.lines,
    });
  }
  return rows;
}

export async function listMenuFoodCosts() {
  const products = await prisma.product.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { category: true },
  });

  const rows = [];
  for (const product of products) {
    const cost = await calculateProductRecipeCost(product.id, product.priceCents);
    const marginCents = product.priceCents - cost.recipeCostCents;
    rows.push({
      productId: product.id,
      name: product.name,
      category: product.category.name,
      priceCents: product.priceCents,
      recipeCostCents: cost.recipeCostCents,
      marginCents,
      marginPercent:
        product.priceCents > 0 ? Number((marginCents / product.priceCents).toFixed(4)) : null,
      foodCostPercent: cost.foodCostPercent,
      lines: cost.lines,
    });
  }
  return rows;
}

export async function listSuppliers() {
  return prisma.supplier.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
  });
}

export async function upsertSupplier(input: {
  id?: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  isActive?: boolean;
  actorId: string;
}) {
  const data = {
    name: input.name.trim(),
    phone: input.phone ?? null,
    email: input.email ?? null,
    notes: input.notes ?? null,
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    ...(input.isActive === true ? { deletedAt: null } : {}),
  };
  const supplier = input.id
    ? await prisma.supplier.update({ where: { id: input.id }, data })
    : await prisma.supplier.create({ data });

  await writeAuditLog({
    actorId: input.actorId,
    action: input.id ? 'SUPPLIER_UPDATE' : 'SUPPLIER_CREATE',
    entityType: 'Supplier',
    entityId: supplier.id,
  });
  return supplier;
}

export async function createPurchase(input: {
  supplierId?: string | null;
  supplierName: string;
  purchasedAt?: Date;
  paymentTerms: PurchasePaymentTerms;
  dueAt?: Date | null;
  notes?: string | null;
  items: Array<{
    ingredientId: string;
    quantity: number;
    unitCostCents: number;
    unitCode?: string;
  }>;
  actorId: string;
}) {
  if (input.items.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Purchase needs items');
  }

  const purchasedAt = input.purchasedAt ?? new Date();
  const paymentTerms = input.paymentTerms;
  const payableStatus =
    paymentTerms === PurchasePaymentTerms.CASH ? PayableStatus.PAID : PayableStatus.OPEN;
  const paidAt = payableStatus === PayableStatus.PAID ? purchasedAt : null;

  const units = await listUnitCatalog();
  const lines: Array<{
    ingredientId: string;
    quantity: number;
    unitCostCents: number;
    lineTotalCents: number;
  }> = [];

  for (const item of input.items) {
    const ingredient = await prisma.ingredient.findFirst({
      where: { id: item.ingredientId, deletedAt: null },
      include: { unitConversions: true },
    });
    if (!ingredient) {
      throw new AppError(404, 'NOT_FOUND', `Ingredient ${item.ingredientId} not found`);
    }
    const entryUnit = normalizeUnitCode(item.unitCode ?? ingredient.unit);
    const customToBase = customFactorsFromRows(ingredient.unitConversions);
    const quantityBase = convertToBaseQuantity({
      quantity: item.quantity,
      fromUnit: entryUnit,
      baseUnit: ingredient.unit,
      units,
      customToBase,
    });
    // Money: line total from entry qty × entry unit cost; then derive cost per base unit.
    const lineTotalCents = costFromQuantity(item.quantity, item.unitCostCents);
    const unitCostBase =
      quantityBase > 0 ? Math.round(lineTotalCents / quantityBase) : item.unitCostCents;
    lines.push({
      ingredientId: item.ingredientId,
      quantity: quantityBase,
      unitCostCents: unitCostBase,
      lineTotalCents,
    });
  }
  const totalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);

  const purchase = await prisma.$transaction(async (tx) => {
    const created = await tx.purchase.create({
      data: {
        supplierId: input.supplierId ?? null,
        supplierName: input.supplierName.trim(),
        purchasedAt,
        paymentTerms,
        dueAt: input.dueAt ?? null,
        paidAt,
        payableStatus,
        totalCents,
        notes: input.notes ?? null,
        createdById: input.actorId,
        items: {
          create: lines.map((line) => ({
            ingredientId: line.ingredientId,
            quantity: dec(line.quantity),
            unitCostCents: line.unitCostCents,
            lineTotalCents: line.lineTotalCents,
          })),
        },
      },
      include: { items: true, supplier: true },
    });

    for (const line of lines) {
      const ingredient = await tx.ingredient.findUniqueOrThrow({
        where: { id: line.ingredientId },
      });
      const currentStock = Number(ingredient.stockQuantity.toString());
      const avg = weightedAverageCostCents({
        currentStock,
        currentAvgCents: ingredient.avgCostCents || ingredient.costPerUnitCents,
        incomingQty: line.quantity,
        incomingUnitCostCents: line.unitCostCents,
      });
      await tx.ingredient.update({
        where: { id: line.ingredientId },
        data: {
          stockQuantity: dec(currentStock + line.quantity),
          avgCostCents: avg,
          costPerUnitCents: avg,
          lastCostCents: line.unitCostCents,
        },
      });
    }

    return created;
  });

  await writeAuditLog({
    actorId: input.actorId,
    action: 'PURCHASE_CREATE',
    entityType: 'Purchase',
    entityId: purchase.id,
    after: { totalCents, payableStatus },
  });

  return purchase;
}

export async function listPurchases() {
  return prisma.purchase.findMany({
    where: { deletedAt: null },
    orderBy: { purchasedAt: 'desc' },
    include: {
      items: { include: { ingredient: true } },
      supplier: true,
    },
    take: 100,
  });
}

export async function createExpense(input: {
  category: string;
  description: string;
  amountCents: number;
  spentAt?: Date;
  paymentTerms: PurchasePaymentTerms;
  dueAt?: Date | null;
  actorId: string;
}) {
  const spentAt = input.spentAt ?? new Date();
  const payableStatus =
    input.paymentTerms === PurchasePaymentTerms.CASH ? PayableStatus.PAID : PayableStatus.OPEN;
  const expense = await prisma.expense.create({
    data: {
      category: input.category.trim(),
      description: input.description.trim(),
      amountCents: input.amountCents,
      spentAt,
      paymentTerms: input.paymentTerms,
      dueAt: input.dueAt ?? null,
      paidAt: payableStatus === PayableStatus.PAID ? spentAt : null,
      payableStatus,
      createdById: input.actorId,
    },
  });
  await writeAuditLog({
    actorId: input.actorId,
    action: 'EXPENSE_CREATE',
    entityType: 'Expense',
    entityId: expense.id,
  });
  return expense;
}

export async function listExpenses() {
  return prisma.expense.findMany({
    where: { deletedAt: null },
    orderBy: { spentAt: 'desc' },
    take: 200,
  });
}

export async function createWaste(input: {
  wastedAt?: Date;
  reason?: string | null;
  items: Array<{ ingredientId: string; quantity: number; unitCode?: string }>;
  actorId: string;
}) {
  if (input.items.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Waste needs items');
  }

  const units = await listUnitCatalog();
  const waste = await prisma.$transaction(async (tx) => {
    const prepared = [];
    for (const item of input.items) {
      const ingredient = await tx.ingredient.findUniqueOrThrow({
        where: { id: item.ingredientId },
        include: { unitConversions: true },
      });
      const entryUnit = normalizeUnitCode(item.unitCode ?? ingredient.unit);
      const quantityBase = convertToBaseQuantity({
        quantity: item.quantity,
        fromUnit: entryUnit,
        baseUnit: ingredient.unit,
        units,
        customToBase: customFactorsFromRows(ingredient.unitConversions),
      });
      const unitCostCents = ingredient.avgCostCents || ingredient.costPerUnitCents;
      const lineTotalCents = costFromQuantity(quantityBase, unitCostCents);
      prepared.push({
        ingredientId: item.ingredientId,
        quantity: quantityBase,
        unitCostCents,
        lineTotalCents,
      });
    }
    const totalCents = prepared.reduce((s, l) => s + l.lineTotalCents, 0);
    const created = await tx.waste.create({
      data: {
        wastedAt: input.wastedAt ?? new Date(),
        reason: input.reason ?? null,
        totalCents,
        createdById: input.actorId,
        items: {
          create: prepared.map((line) => ({
            ingredientId: line.ingredientId,
            quantity: dec(line.quantity),
            unitCostCents: line.unitCostCents,
            lineTotalCents: line.lineTotalCents,
          })),
        },
      },
      include: { items: true },
    });

    for (const line of prepared) {
      await tx.ingredient.update({
        where: { id: line.ingredientId },
        data: { stockQuantity: { decrement: dec(line.quantity) } },
      });
    }
    return created;
  });

  await writeAuditLog({
    actorId: input.actorId,
    action: 'WASTE_CREATE',
    entityType: 'Waste',
    entityId: waste.id,
  });
  return waste;
}

export async function listPayables() {
  const [purchases, expenses] = await Promise.all([
    prisma.purchase.findMany({
      where: {
        deletedAt: null,
        payableStatus: { in: [PayableStatus.OPEN, PayableStatus.PARTIAL] },
      },
      orderBy: [{ dueAt: 'asc' }, { purchasedAt: 'asc' }],
    }),
    prisma.expense.findMany({
      where: {
        deletedAt: null,
        payableStatus: { in: [PayableStatus.OPEN, PayableStatus.PARTIAL] },
      },
      orderBy: [{ dueAt: 'asc' }, { spentAt: 'asc' }],
    }),
  ]);

  return {
    purchases: purchases.map((p) => ({
      id: p.id,
      type: 'PURCHASE' as const,
      label: p.supplierName,
      amountCents: p.totalCents,
      dueAt: p.dueAt,
      purchasedAt: p.purchasedAt,
      status: p.payableStatus,
    })),
    expenses: expenses.map((e) => ({
      id: e.id,
      type: 'EXPENSE' as const,
      label: `${e.category}: ${e.description}`,
      amountCents: e.amountCents,
      dueAt: e.dueAt,
      spentAt: e.spentAt,
      status: e.payableStatus,
    })),
  };
}

export async function listReceivables() {
  // Open AR = unpaid / pending platform or delivery payments still pending confirmation
  const payments = await prisma.payment.findMany({
    where: { status: 'PENDING' },
    include: {
      order: {
        select: {
          id: true,
          publicCode: true,
          customerName: true,
          totalCents: true,
          placedAt: true,
          status: true,
          channel: { select: { name: true, code: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });

  return payments
    .filter((p) => p.order && p.order.status !== ('CANCELLED' as OrderStatus))
    .map((p) => ({
      paymentId: p.id,
      orderId: p.order.id,
      publicCode: p.order.publicCode,
      customerName: p.order.customerName,
      channel: p.order.channel.name,
      amountCents: p.amountCents,
      method: p.method,
      placedAt: p.order.placedAt,
      status: 'OPEN' as const,
    }));
}

export async function markPayablePaid(input: {
  type: 'PURCHASE' | 'EXPENSE';
  id: string;
  actorId: string;
}) {
  if (input.type === 'PURCHASE') {
    const purchase = await prisma.purchase.update({
      where: { id: input.id },
      data: { payableStatus: PayableStatus.PAID, paidAt: new Date() },
    });
    await writeAuditLog({
      actorId: input.actorId,
      action: 'PAYABLE_PAID',
      entityType: 'Purchase',
      entityId: purchase.id,
    });
    return purchase;
  }
  const expense = await prisma.expense.update({
    where: { id: input.id },
    data: { payableStatus: PayableStatus.PAID, paidAt: new Date() },
  });
  await writeAuditLog({
    actorId: input.actorId,
    action: 'PAYABLE_PAID',
    entityType: 'Expense',
    entityId: expense.id,
  });
  return expense;
}

/** Confirm a pending payment so it leaves cuentas por cobrar. */
export async function markReceivableCollected(input: {
  paymentId: string;
  actorId: string;
  notes?: string | null;
}) {
  const payment = await prisma.payment.findUnique({ where: { id: input.paymentId } });
  if (!payment) {
    throw new AppError(404, 'NOT_FOUND', 'Payment not found');
  }
  if (payment.status !== 'PENDING') {
    throw new AppError(409, 'INVALID_STATE', 'Payment is not pending');
  }

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: 'CONFIRMED',
      confirmedAt: new Date(),
      confirmedByAdminId: input.actorId,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });

  await writeAuditLog({
    actorId: input.actorId,
    action: 'RECEIVABLE_COLLECTED',
    entityType: 'Payment',
    entityId: updated.id,
    after: { orderId: updated.orderId, amountCents: updated.amountCents },
  });

  return updated;
}

export async function deactivateSupplier(input: { id: string; actorId: string }) {
  const supplier = await prisma.supplier.update({
    where: { id: input.id },
    data: { isActive: false, deletedAt: new Date() },
  });
  await writeAuditLog({
    actorId: input.actorId,
    action: 'SUPPLIER_DEACTIVATE',
    entityType: 'Supplier',
    entityId: supplier.id,
  });
  return supplier;
}

export async function profitAndLoss(input: { from: Date; to: Date }) {
  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      status: { not: 'CANCELLED' },
      placedAt: { gte: input.from, lte: input.to },
    },
  });
  const expenses = await prisma.expense.findMany({
    where: { deletedAt: null, spentAt: { gte: input.from, lte: input.to } },
  });
  const waste = await prisma.waste.findMany({
    where: { deletedAt: null, wastedAt: { gte: input.from, lte: input.to } },
  });

  const netSalesCents = orders.reduce((s, o) => s + o.totalCents, 0);
  const cogsCents = orders.reduce((s, o) => s + o.cogsCents, 0);
  const commissionCents = orders.reduce((s, o) => s + (o.commissionAmountCents ?? 0), 0);
  const deliveryFeeCents = orders.reduce((s, o) => s + o.deliveryFeeCents, 0);
  const wasteCents = waste.reduce((s, w) => s + w.totalCents, 0);
  const operatingExpensesCents = expenses.reduce((s, e) => s + e.amountCents, 0);
  const grossProfitCents = netSalesCents - cogsCents - commissionCents - wasteCents;
  const netProfitCents = grossProfitCents - operatingExpensesCents;

  return {
    from: input.from,
    to: input.to,
    orderCount: orders.length,
    netSalesCents,
    cogsCents,
    commissionCents,
    deliveryFeeCents,
    wasteCents,
    grossProfitCents,
    operatingExpensesCents,
    netProfitCents,
    foodCostPercent: netSalesCents > 0 ? Number((cogsCents / netSalesCents).toFixed(4)) : null,
    netMarginPercent:
      netSalesCents > 0 ? Number((netProfitCents / netSalesCents).toFixed(4)) : null,
  };
}

export async function cashFlow(input: { from: Date; to: Date; openingBalanceCents?: number }) {
  const opening = input.openingBalanceCents ?? 0;
  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      status: { not: 'CANCELLED' },
      placedAt: { gte: input.from, lte: input.to },
    },
    include: { payments: true },
  });
  const purchases = await prisma.purchase.findMany({
    where: {
      deletedAt: null,
      OR: [
        { paidAt: { gte: input.from, lte: input.to } },
        {
          paymentTerms: PurchasePaymentTerms.CASH,
          purchasedAt: { gte: input.from, lte: input.to },
        },
      ],
    },
  });
  const expenses = await prisma.expense.findMany({
    where: {
      deletedAt: null,
      OR: [
        { paidAt: { gte: input.from, lte: input.to } },
        {
          paymentTerms: PurchasePaymentTerms.CASH,
          spentAt: { gte: input.from, lte: input.to },
        },
      ],
    },
  });

  const cashInCents = orders.reduce((sum, order) => {
    const confirmed = order.payments
      .filter((p) => p.status === 'CONFIRMED' || p.status === 'PENDING')
      .reduce((s, p) => s + p.amountCents, 0);
    return sum + (confirmed || order.totalCents);
  }, 0);
  const cashOutPurchases = purchases.reduce((s, p) => s + p.totalCents, 0);
  const cashOutExpenses = expenses.reduce((s, e) => s + e.amountCents, 0);
  const cashOutCents = cashOutPurchases + cashOutExpenses;
  const closingBalanceCents = opening + cashInCents - cashOutCents;

  return {
    from: input.from,
    to: input.to,
    openingBalanceCents: opening,
    cashInCents,
    cashOutCents,
    closingBalanceCents,
  };
}

export async function breakEven(input: { from: Date; to: Date }) {
  const pnl = await profitAndLoss(input);
  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      status: { not: 'CANCELLED' },
      placedAt: { gte: input.from, lte: input.to },
    },
  });
  const avgTicket =
    orders.length > 0
      ? Math.round(orders.reduce((s, o) => s + o.totalCents, 0) / orders.length)
      : 0;
  const variablePerOrder =
    orders.length > 0
      ? Math.round(
          orders.reduce((s, o) => s + o.cogsCents + (o.commissionAmountCents ?? 0), 0) /
            orders.length,
        )
      : 0;
  const contribution = avgTicket - variablePerOrder;
  const fixedCosts = pnl.operatingExpensesCents;
  const breakEvenOrders = contribution > 0 ? Math.ceil(fixedCosts / contribution) : null;

  return {
    avgTicketCents: avgTicket,
    variableCostPerOrderCents: variablePerOrder,
    contributionMarginCents: contribution,
    fixedCostsCents: fixedCosts,
    breakEvenOrderCount: breakEvenOrders,
  };
}
