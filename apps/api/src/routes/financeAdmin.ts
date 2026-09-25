import { Router } from 'express';
import { z } from 'zod';
import { PurchasePaymentTerms } from '@prisma/client';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';
import {
  breakEven,
  cashFlow,
  createExpense,
  createPurchase,
  createWaste,
  deactivateSupplier,
  getModifierOptionRecipe,
  getProductRecipe,
  listExpenses,
  listIngredients,
  listMenuFoodCosts,
  listModifierFoodCosts,
  listPayables,
  listPurchases,
  listReceivables,
  listSuppliers,
  markPayablePaid,
  markReceivableCollected,
  profitAndLoss,
  setModifierOptionRecipe,
  setProductRecipe,
  upsertIngredient,
  upsertSupplier,
} from '../services/finance.js';
import {
  getActiveExchangeRate,
  listExchangeRates,
  setExchangeRate,
} from '../services/exchangeRate.js';
import { ensureSystemUnits, listUnitCatalog } from '../services/units.js';

function param(value: string | string[] | undefined, name: string): string {
  if (typeof value === 'string' && value) return value;
  if (Array.isArray(value) && value[0]) return value[0];
  throw new AppError(400, 'VALIDATION_ERROR', `Missing ${name}`);
}

export const financeAdminRouter = Router();
financeAdminRouter.use(requireAuth, requireRoles('OWNER', 'MANAGER'));

financeAdminRouter.get('/units', async (_req, res, next) => {
  try {
    await ensureSystemUnits();
    res.json({ units: await listUnitCatalog() });
  } catch (error) {
    next(error);
  }
});

financeAdminRouter.get('/ingredients', async (_req, res, next) => {
  try {
    res.json({ ingredients: await listIngredients() });
  } catch (error) {
    next(error);
  }
});

const conversionSchema = z.object({
  unitCode: z.string().min(1),
  factorToBase: z.number().positive(),
  note: z.string().nullable().optional(),
});

const ingredientSchema = z.object({
  id: z.string().optional(),
  code: z.string().nullable().optional(),
  name: z.string().min(1),
  unit: z.string().min(1),
  avgCostCents: z.number().int().nonnegative().optional(),
  minStockQuantity: z.number().nonnegative().optional(),
  stockQuantity: z.number().optional(),
  isActive: z.boolean().optional(),
  conversions: z.array(conversionSchema).optional(),
});

financeAdminRouter.post('/ingredients', async (req, res, next) => {
  try {
    if (!req.admin) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const body = ingredientSchema.parse(req.body);
    const ingredient = await upsertIngredient({
      ...(body.id ? { id: body.id } : {}),
      name: body.name,
      unit: body.unit,
      ...(body.code !== undefined ? { code: body.code } : {}),
      ...(body.avgCostCents !== undefined ? { avgCostCents: body.avgCostCents } : {}),
      ...(body.minStockQuantity !== undefined ? { minStockQuantity: body.minStockQuantity } : {}),
      ...(body.stockQuantity !== undefined ? { stockQuantity: body.stockQuantity } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.conversions !== undefined
        ? {
            conversions: body.conversions.map((c) => ({
              unitCode: c.unitCode,
              factorToBase: c.factorToBase,
              ...(c.note !== undefined ? { note: c.note } : {}),
            })),
          }
        : {}),
      actorId: req.admin.id,
    });
    res.status(body.id ? 200 : 201).json({ ingredient });
  } catch (error) {
    next(error);
  }
});

financeAdminRouter.get('/food-costs', async (_req, res, next) => {
  try {
    res.json({ products: await listMenuFoodCosts() });
  } catch (error) {
    next(error);
  }
});

financeAdminRouter.get('/recipes/:productId', async (req, res, next) => {
  try {
    const productId = param(req.params.productId, 'productId');
    res.json(await getProductRecipe(productId));
  } catch (error) {
    next(error);
  }
});

const recipeSchema = z.object({
  lines: z.array(
    z.object({
      ingredientId: z.string().min(1),
      quantity: z.number().positive(),
      unitCode: z.string().min(1).optional(),
    }),
  ),
});

financeAdminRouter.put('/recipes/:productId', async (req, res, next) => {
  try {
    if (!req.admin) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const productId = param(req.params.productId, 'productId');
    const body = recipeSchema.parse(req.body);
    const recipe = await setProductRecipe({
      productId,
      lines: body.lines.map((line) => ({
        ingredientId: line.ingredientId,
        quantity: line.quantity,
        ...(line.unitCode !== undefined ? { unitCode: line.unitCode } : {}),
      })),
      actorId: req.admin.id,
    });
    res.json(recipe);
  } catch (error) {
    next(error);
  }
});

financeAdminRouter.get('/modifier-food-costs', async (_req, res, next) => {
  try {
    res.json({ options: await listModifierFoodCosts() });
  } catch (error) {
    next(error);
  }
});

financeAdminRouter.get('/modifier-recipes/:optionId', async (req, res, next) => {
  try {
    const optionId = param(req.params.optionId, 'optionId');
    res.json(await getModifierOptionRecipe(optionId));
  } catch (error) {
    next(error);
  }
});

financeAdminRouter.put('/modifier-recipes/:optionId', async (req, res, next) => {
  try {
    if (!req.admin) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const optionId = param(req.params.optionId, 'optionId');
    const body = recipeSchema.parse(req.body);
    const recipe = await setModifierOptionRecipe({
      modifierOptionId: optionId,
      lines: body.lines.map((line) => ({
        ingredientId: line.ingredientId,
        quantity: line.quantity,
        ...(line.unitCode !== undefined ? { unitCode: line.unitCode } : {}),
      })),
      actorId: req.admin.id,
    });
    res.json(recipe);
  } catch (error) {
    next(error);
  }
});

financeAdminRouter.get('/exchange-rate', async (_req, res, next) => {
  try {
    const active = await getActiveExchangeRate();
    const history = await listExchangeRates(20);
    res.json({ active, history });
  } catch (error) {
    next(error);
  }
});

const exchangeSchema = z.object({
  bolivarsPerUsd: z.number().positive(),
  effectiveFrom: z.string().datetime().optional(),
  note: z.string().nullable().optional(),
});

financeAdminRouter.post('/exchange-rate', async (req, res, next) => {
  try {
    if (!req.admin) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const body = exchangeSchema.parse(req.body);
    const rate = await setExchangeRate({
      bolivarsPerUsd: body.bolivarsPerUsd,
      ...(body.effectiveFrom ? { effectiveFrom: new Date(body.effectiveFrom) } : {}),
      ...(body.note !== undefined ? { note: body.note } : {}),
      actorId: req.admin.id,
    });
    res.status(201).json({ rate });
  } catch (error) {
    next(error);
  }
});

financeAdminRouter.get('/suppliers', async (_req, res, next) => {
  try {
    res.json({ suppliers: await listSuppliers() });
  } catch (error) {
    next(error);
  }
});

const supplierSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

financeAdminRouter.post('/suppliers', async (req, res, next) => {
  try {
    if (!req.admin) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const body = supplierSchema.parse(req.body);
    const supplier = await upsertSupplier({
      ...(body.id ? { id: body.id } : {}),
      name: body.name,
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      actorId: req.admin.id,
    });
    res.status(body.id ? 200 : 201).json({ supplier });
  } catch (error) {
    next(error);
  }
});

financeAdminRouter.post('/suppliers/:id/deactivate', async (req, res, next) => {
  try {
    if (!req.admin) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const id = param(req.params.id, 'id');
    const supplier = await deactivateSupplier({ id, actorId: req.admin.id });
    res.json({ supplier });
  } catch (error) {
    next(error);
  }
});

financeAdminRouter.get('/purchases', async (_req, res, next) => {
  try {
    res.json({ purchases: await listPurchases() });
  } catch (error) {
    next(error);
  }
});

const purchaseSchema = z.object({
  supplierId: z.string().nullable().optional(),
  supplierName: z.string().min(1),
  purchasedAt: z.string().datetime().optional(),
  paymentTerms: z.nativeEnum(PurchasePaymentTerms),
  dueAt: z.string().datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        ingredientId: z.string().min(1),
        quantity: z.number().positive(),
        unitCostCents: z.number().int().nonnegative(),
        unitCode: z.string().min(1).optional(),
      }),
    )
    .min(1),
});

financeAdminRouter.post('/purchases', async (req, res, next) => {
  try {
    if (!req.admin) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const body = purchaseSchema.parse(req.body);
    const purchase = await createPurchase({
      ...(body.supplierId !== undefined ? { supplierId: body.supplierId } : {}),
      supplierName: body.supplierName,
      ...(body.purchasedAt ? { purchasedAt: new Date(body.purchasedAt) } : {}),
      paymentTerms: body.paymentTerms,
      ...(body.dueAt !== undefined ? { dueAt: body.dueAt ? new Date(body.dueAt) : null } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      items: body.items.map((item) => ({
        ingredientId: item.ingredientId,
        quantity: item.quantity,
        unitCostCents: item.unitCostCents,
        ...(item.unitCode !== undefined ? { unitCode: item.unitCode } : {}),
      })),
      actorId: req.admin.id,
    });
    res.status(201).json({ purchase });
  } catch (error) {
    next(error);
  }
});

financeAdminRouter.get('/expenses', async (_req, res, next) => {
  try {
    res.json({ expenses: await listExpenses() });
  } catch (error) {
    next(error);
  }
});

const expenseSchema = z.object({
  category: z.string().min(1),
  description: z.string().min(1),
  amountCents: z.number().int().positive(),
  spentAt: z.string().datetime().optional(),
  paymentTerms: z.nativeEnum(PurchasePaymentTerms),
  dueAt: z.string().datetime().nullable().optional(),
});

financeAdminRouter.post('/expenses', async (req, res, next) => {
  try {
    if (!req.admin) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const body = expenseSchema.parse(req.body);
    const expense = await createExpense({
      category: body.category,
      description: body.description,
      amountCents: body.amountCents,
      ...(body.spentAt ? { spentAt: new Date(body.spentAt) } : {}),
      paymentTerms: body.paymentTerms,
      ...(body.dueAt !== undefined ? { dueAt: body.dueAt ? new Date(body.dueAt) : null } : {}),
      actorId: req.admin.id,
    });
    res.status(201).json({ expense });
  } catch (error) {
    next(error);
  }
});

const wasteSchema = z.object({
  wastedAt: z.string().datetime().optional(),
  reason: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        ingredientId: z.string().min(1),
        quantity: z.number().positive(),
        unitCode: z.string().min(1).optional(),
      }),
    )
    .min(1),
});

financeAdminRouter.post('/waste', async (req, res, next) => {
  try {
    if (!req.admin) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const body = wasteSchema.parse(req.body);
    const waste = await createWaste({
      ...(body.wastedAt ? { wastedAt: new Date(body.wastedAt) } : {}),
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
      items: body.items.map((item) => ({
        ingredientId: item.ingredientId,
        quantity: item.quantity,
        ...(item.unitCode !== undefined ? { unitCode: item.unitCode } : {}),
      })),
      actorId: req.admin.id,
    });
    res.status(201).json({ waste });
  } catch (error) {
    next(error);
  }
});

financeAdminRouter.get('/payables', async (_req, res, next) => {
  try {
    res.json(await listPayables());
  } catch (error) {
    next(error);
  }
});

financeAdminRouter.get('/receivables', async (_req, res, next) => {
  try {
    res.json({ receivables: await listReceivables() });
  } catch (error) {
    next(error);
  }
});

const paySchema = z.object({
  type: z.enum(['PURCHASE', 'EXPENSE']),
  id: z.string().min(1),
});

financeAdminRouter.post('/payables/mark-paid', async (req, res, next) => {
  try {
    if (!req.admin) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const body = paySchema.parse(req.body);
    const result = await markPayablePaid({
      type: body.type,
      id: body.id,
      actorId: req.admin.id,
    });
    res.json({ result });
  } catch (error) {
    next(error);
  }
});

const collectSchema = z.object({
  paymentId: z.string().min(1),
  notes: z.string().nullable().optional(),
});

financeAdminRouter.post('/receivables/mark-collected', async (req, res, next) => {
  try {
    if (!req.admin) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const body = collectSchema.parse(req.body);
    const result = await markReceivableCollected({
      paymentId: body.paymentId,
      actorId: req.admin.id,
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    });
    res.json({ payment: result });
  } catch (error) {
    next(error);
  }
});

financeAdminRouter.get('/reports/pnl', async (req, res, next) => {
  try {
    if (typeof req.query.from !== 'string' || typeof req.query.to !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', 'from and to required');
    }
    res.json({
      report: await profitAndLoss({
        from: new Date(req.query.from),
        to: new Date(req.query.to),
      }),
    });
  } catch (error) {
    next(error);
  }
});

financeAdminRouter.get('/reports/cashflow', async (req, res, next) => {
  try {
    if (typeof req.query.from !== 'string' || typeof req.query.to !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', 'from and to required');
    }
    res.json({
      report: await cashFlow({
        from: new Date(req.query.from),
        to: new Date(req.query.to),
        ...(typeof req.query.opening === 'string'
          ? { openingBalanceCents: Number(req.query.opening) }
          : {}),
      }),
    });
  } catch (error) {
    next(error);
  }
});

financeAdminRouter.get('/reports/breakeven', async (req, res, next) => {
  try {
    if (typeof req.query.from !== 'string' || typeof req.query.to !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', 'from and to required');
    }
    res.json({
      report: await breakEven({
        from: new Date(req.query.from),
        to: new Date(req.query.to),
      }),
    });
  } catch (error) {
    next(error);
  }
});

financeAdminRouter.get('/reports/pnl.csv', async (req, res, next) => {
  try {
    if (typeof req.query.from !== 'string' || typeof req.query.to !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', 'from and to required');
    }
    const report = await profitAndLoss({
      from: new Date(req.query.from),
      to: new Date(req.query.to),
    });
    const rows = [
      ['metric', 'cents'],
      ['netSalesCents', String(report.netSalesCents)],
      ['cogsCents', String(report.cogsCents)],
      ['commissionCents', String(report.commissionCents)],
      ['wasteCents', String(report.wasteCents)],
      ['grossProfitCents', String(report.grossProfitCents)],
      ['operatingExpensesCents', String(report.operatingExpensesCents)],
      ['netProfitCents', String(report.netProfitCents)],
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="pnl.csv"');
    res.send(`${csv}\n`);
  } catch (error) {
    next(error);
  }
});
