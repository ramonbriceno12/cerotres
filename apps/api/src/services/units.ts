import { Prisma } from '@prisma/client';
import {
  SYSTEM_UNITS,
  UnitConversionError,
  compatibleUnits,
  convertQuantity,
  convertUnitCost,
  normalizeUnitCode,
  type UnitDef,
} from '@cerotres/shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

export async function listUnitCatalog(): Promise<UnitDef[]> {
  const rows = await prisma.unit.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  });
  if (rows.length === 0) {
    return [...SYSTEM_UNITS];
  }
  return rows.map((u) => ({
    code: u.code,
    name: u.name,
    dimension: u.dimension,
    toCanonical: Number(u.toCanonical.toString()),
  }));
}

export async function ensureSystemUnits() {
  for (const [index, unit] of SYSTEM_UNITS.entries()) {
    await prisma.unit.upsert({
      where: { code: unit.code },
      update: {
        name: unit.name,
        dimension: unit.dimension,
        toCanonical: new Prisma.Decimal(unit.toCanonical),
        sortOrder: index + 1,
        isActive: true,
      },
      create: {
        code: unit.code,
        name: unit.name,
        dimension: unit.dimension,
        toCanonical: new Prisma.Decimal(unit.toCanonical),
        sortOrder: index + 1,
      },
    });
  }
}

export function customFactorsFromRows(
  rows: Array<{ unitCode: string; factorToBase: Prisma.Decimal | number | string }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    out[row.unitCode] = Number(row.factorToBase.toString());
  }
  return out;
}

export function toAppUnitError(error: unknown): never {
  if (error instanceof UnitConversionError) {
    throw new AppError(400, error.code, error.message);
  }
  throw error;
}

export function convertToBaseQuantity(input: {
  quantity: number;
  fromUnit: string;
  baseUnit: string;
  units: UnitDef[];
  customToBase?: Record<string, number>;
}): number {
  try {
    return convertQuantity({
      quantity: input.quantity,
      fromUnit: normalizeUnitCode(input.fromUnit),
      toUnit: normalizeUnitCode(input.baseUnit),
      baseUnit: normalizeUnitCode(input.baseUnit),
      units: input.units,
      ...(input.customToBase ? { customToBase: input.customToBase } : {}),
    });
  } catch (error) {
    toAppUnitError(error);
  }
}

export function buildUnitViews(input: {
  baseUnit: string;
  stockQuantity: number;
  minStockQuantity: number;
  avgCostCents: number;
  units: UnitDef[];
  customToBase?: Record<string, number>;
}) {
  const base = normalizeUnitCode(input.baseUnit);
  const custom = input.customToBase;
  const compat = compatibleUnits({
    baseUnit: base,
    units: input.units,
    ...(custom ? { customToBase: custom } : {}),
  });

  return compat.map((unit) => {
    const stockQuantity = convertQuantity({
      quantity: input.stockQuantity,
      fromUnit: base,
      toUnit: unit.code,
      baseUnit: base,
      units: input.units,
      ...(custom ? { customToBase: custom } : {}),
    });
    const minStockQuantity = convertQuantity({
      quantity: input.minStockQuantity,
      fromUnit: base,
      toUnit: unit.code,
      baseUnit: base,
      units: input.units,
      ...(custom ? { customToBase: custom } : {}),
    });
    const avgCost = convertUnitCost({
      costPerBase: input.avgCostCents,
      toUnit: unit.code,
      baseUnit: base,
      units: input.units,
      ...(custom ? { customToBase: custom } : {}),
    });
    return {
      unitCode: unit.code,
      unitName: unit.name,
      stockQuantity,
      minStockQuantity,
      avgCostCents: avgCost,
    };
  });
}

export async function loadIngredientUnitContext(ingredientId: string) {
  const ingredient = await prisma.ingredient.findFirst({
    where: { id: ingredientId, deletedAt: null },
    include: { unitConversions: true },
  });
  if (!ingredient) {
    throw new AppError(404, 'NOT_FOUND', 'Ingredient not found');
  }
  const units = await listUnitCatalog();
  return {
    ingredient,
    units,
    customToBase: customFactorsFromRows(ingredient.unitConversions),
  };
}
