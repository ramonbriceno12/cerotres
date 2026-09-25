import { describe, expect, it } from 'vitest';
import {
  SYSTEM_UNITS,
  UnitConversionError,
  compatibleUnits,
  convertQuantity,
  convertUnitCost,
  factorToBase,
  normalizeUnitCode,
} from './units.js';

describe('unit conversion', () => {
  it('converts mass SI via kg base', () => {
    expect(
      convertQuantity({
        quantity: 200,
        fromUnit: 'g',
        toUnit: 'kg',
        baseUnit: 'kg',
      }),
    ).toBeCloseTo(0.2, 10);

    expect(
      convertQuantity({
        quantity: 0.18,
        fromUnit: 'kg',
        toUnit: 'g',
        baseUnit: 'kg',
      }),
    ).toBeCloseTo(180, 10);
  });

  it('converts volume SI via l base', () => {
    expect(
      convertQuantity({
        quantity: 500,
        fromUnit: 'ml',
        toUnit: 'l',
        baseUnit: 'l',
      }),
    ).toBeCloseTo(0.5, 10);
  });

  it('applies custom pack → kg factor', () => {
    const customToBase = { pack: 0.5 }; // 1 pack = 0.5 kg
    expect(
      convertQuantity({
        quantity: 2,
        fromUnit: 'pack',
        toUnit: 'kg',
        baseUnit: 'kg',
        customToBase,
      }),
    ).toBeCloseTo(1, 10);

    expect(
      convertQuantity({
        quantity: 1,
        fromUnit: 'kg',
        toUnit: 'pack',
        baseUnit: 'kg',
        customToBase,
      }),
    ).toBeCloseTo(2, 10);
  });

  it('scales unit cost to display unit', () => {
    // 670¢ / kg → 0.67¢ / g
    expect(
      convertUnitCost({
        costPerBase: 670,
        toUnit: 'g',
        baseUnit: 'kg',
      }),
    ).toBeCloseTo(0.67, 10);
  });

  it('rejects incompatible units without custom factor', () => {
    expect(() =>
      factorToBase({
        unit: 'und',
        baseUnit: 'kg',
        units: SYSTEM_UNITS,
      }),
    ).toThrow(UnitConversionError);
  });

  it('lists compatible units including custom', () => {
    const list = compatibleUnits({
      baseUnit: 'kg',
      customToBase: { pack: 1 },
    });
    expect(list.map((u) => u.code).sort()).toEqual(['g', 'kg', 'pack'].sort());
  });

  it('normalizes aliases', () => {
    expect(normalizeUnitCode('GR')).toBe('g');
    expect(normalizeUnitCode('lt')).toBe('l');
    expect(normalizeUnitCode('unidad')).toBe('und');
  });
});
