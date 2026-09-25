export type UnitDimension = 'MASS' | 'VOLUME' | 'COUNT' | 'OTHER';

export type UnitDef = {
  code: string;
  name: string;
  dimension: UnitDimension;
  /** Multiply qty in this unit by this to get the dimension canonical (kg / l / und). */
  toCanonical: number;
};

/** Built-in units. Mass canonical = kg, volume = l, count = und. */
export const SYSTEM_UNITS: readonly UnitDef[] = [
  { code: 'kg', name: 'Kilogramo', dimension: 'MASS', toCanonical: 1 },
  { code: 'g', name: 'Gramo', dimension: 'MASS', toCanonical: 0.001 },
  { code: 'l', name: 'Litro', dimension: 'VOLUME', toCanonical: 1 },
  { code: 'ml', name: 'Mililitro', dimension: 'VOLUME', toCanonical: 0.001 },
  { code: 'und', name: 'Unidad', dimension: 'COUNT', toCanonical: 1 },
] as const;

export class UnitConversionError extends Error {
  code: 'UNKNOWN_UNIT' | 'INCOMPATIBLE_UNITS';

  constructor(code: UnitConversionError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

function indexUnits(units: readonly UnitDef[]): Map<string, UnitDef> {
  return new Map(units.map((u) => [u.code, u]));
}

/**
 * How many `baseUnit` equal 1 of `unit`.
 * Uses SI factors when same dimension; otherwise `customToBase[unit]`.
 */
export function factorToBase(input: {
  unit: string;
  baseUnit: string;
  units?: readonly UnitDef[];
  /** 1 alternate unit = N base units (e.g. 1 pack = 0.5 kg) */
  customToBase?: Record<string, number>;
}): number {
  const unit = input.unit.trim().toLowerCase();
  const baseUnit = input.baseUnit.trim().toLowerCase();
  if (unit === baseUnit) return 1;

  const custom = input.customToBase?.[unit];
  if (custom !== undefined) {
    if (!(custom > 0)) {
      throw new UnitConversionError('INCOMPATIBLE_UNITS', `Invalid custom factor for ${unit}`);
    }
    return custom;
  }

  const catalog = indexUnits(input.units ?? SYSTEM_UNITS);
  const from = catalog.get(unit);
  const base = catalog.get(baseUnit);
  if (!from || !base) {
    throw new UnitConversionError('UNKNOWN_UNIT', `Unknown unit "${!from ? unit : baseUnit}"`);
  }
  if (from.dimension !== base.dimension || from.dimension === 'OTHER') {
    throw new UnitConversionError(
      'INCOMPATIBLE_UNITS',
      `Cannot convert ${unit} → ${baseUnit} without a custom factor`,
    );
  }
  return from.toCanonical / base.toCanonical;
}

/** Convert a quantity from one unit into another, via the ingredient base unit. */
export function convertQuantity(input: {
  quantity: number;
  fromUnit: string;
  toUnit: string;
  baseUnit: string;
  units?: readonly UnitDef[];
  customToBase?: Record<string, number>;
}): number {
  if (!(input.quantity >= 0) || Number.isNaN(input.quantity)) {
    throw new UnitConversionError('INCOMPATIBLE_UNITS', 'Quantity must be a non-negative number');
  }
  const catalog = input.units;
  const custom = input.customToBase;
  const inBase =
    input.quantity *
    factorToBase({
      unit: input.fromUnit,
      baseUnit: input.baseUnit,
      ...(catalog ? { units: catalog } : {}),
      ...(custom ? { customToBase: custom } : {}),
    });
  const toFactor = factorToBase({
    unit: input.toUnit,
    baseUnit: input.baseUnit,
    ...(catalog ? { units: catalog } : {}),
    ...(custom ? { customToBase: custom } : {}),
  });
  return inBase / toFactor;
}

/**
 * Cost per display unit given cost per base unit.
 * Example: 670¢/kg → 0.67¢/g when display is g.
 */
export function convertUnitCost(input: {
  costPerBase: number;
  toUnit: string;
  baseUnit: string;
  units?: readonly UnitDef[];
  customToBase?: Record<string, number>;
}): number {
  const factor = factorToBase({
    unit: input.toUnit,
    baseUnit: input.baseUnit,
    ...(input.units ? { units: input.units } : {}),
    ...(input.customToBase ? { customToBase: input.customToBase } : {}),
  });
  return input.costPerBase * factor;
}

/** Units that can be used with this base (same dimension + any custom keys). */
export function compatibleUnits(input: {
  baseUnit: string;
  units?: readonly UnitDef[];
  customToBase?: Record<string, number>;
}): UnitDef[] {
  const catalog = input.units ?? SYSTEM_UNITS;
  const base = catalog.find((u) => u.code === input.baseUnit.trim().toLowerCase());
  const fromCatalog = base
    ? catalog.filter(
        (u) =>
          u.dimension === base.dimension && (base.dimension !== 'OTHER' || u.code === base.code),
      )
    : catalog.filter((u) => u.code === input.baseUnit.trim().toLowerCase());

  const customCodes = Object.keys(input.customToBase ?? {});
  const extras: UnitDef[] = customCodes
    .filter((code) => !fromCatalog.some((u) => u.code === code))
    .map((code) => {
      const known = catalog.find((u) => u.code === code);
      return (
        known ?? {
          code,
          name: code,
          dimension: 'OTHER' as const,
          toCanonical: 1,
        }
      );
    });

  return [...fromCatalog, ...extras];
}

export function normalizeUnitCode(raw: string): string {
  const v = raw.trim().toLowerCase();
  const aliases: Record<string, string> = {
    gr: 'g',
    gramos: 'g',
    gram: 'g',
    grams: 'g',
    kilo: 'kg',
    kilos: 'kg',
    kilogramo: 'kg',
    kilogramos: 'kg',
    lt: 'l',
    litro: 'l',
    litros: 'l',
    mililitro: 'ml',
    mililitros: 'ml',
    un: 'und',
    u: 'und',
    unidad: 'und',
    unidades: 'und',
  };
  return aliases[v] ?? v;
}
