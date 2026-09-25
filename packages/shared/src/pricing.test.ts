import { describe, expect, it } from 'vitest';
import {
  PricingError,
  calculateLinePrice,
  type PricingInput,
  type SelectedOption,
} from './pricing.js';

const EXTRA_GRATINADO = {
  optionId: 'ex-grat',
  groupId: 'extras',
  name: 'Gratinado',
  priceDelta: 150,
  quantity: 1,
};
const EXTRA_TOCINETA = {
  optionId: 'ex-toc',
  groupId: 'extras',
  name: 'Tocineta Crispy',
  priceDelta: 150,
  quantity: 1,
};
const EXTRA_VEGETALES = {
  optionId: 'ex-veg',
  groupId: 'extras',
  name: 'Vegetales Grillados',
  priceDelta: 150,
  quantity: 1,
};

const SAUCE_MAYO = {
  optionId: 'sc-mayo',
  groupId: 'classic',
  name: 'Mayonesa',
  priceDelta: 25,
  quantity: 1,
};
const SAUCE_KETCHUP = {
  optionId: 'sc-ket',
  groupId: 'classic',
  name: 'Ketchup',
  priceDelta: 25,
  quantity: 1,
};
const SAUCE_MAIZ = {
  optionId: 'sc-maiz',
  groupId: 'classic',
  name: 'Salsa de Maíz',
  priceDelta: 25,
  quantity: 1,
};
const SAUCE_MAYOPSTO = {
  optionId: 'sh-mayo',
  groupId: 'house',
  name: 'Mayopesto',
  priceDelta: 50,
  quantity: 1,
};
const SAUCE_MAIZ_TOC = {
  optionId: 'sh-maiz',
  groupId: 'house',
  name: 'Maíz y Tocineta',
  priceDelta: 50,
  quantity: 1,
};

function pepito(options: SelectedOption[] = []): PricingInput {
  return {
    productName: 'Pepito de Lomito',
    basePriceCents: 650,
    quantity: 1,
    groups: [
      {
        groupId: 'extras',
        name: 'Extras',
        minSelect: 0,
        maxSelect: null,
        freeQuantity: 2,
        freeStrategy: 'HIGHEST_PRICE_FIRST',
      },
      {
        groupId: 'classic',
        name: 'Salsas clásicas',
        minSelect: 0,
        maxSelect: null,
        freeQuantity: 2,
        freeStrategy: 'HIGHEST_PRICE_FIRST',
      },
      {
        groupId: 'house',
        name: 'Salsas de la casa',
        minSelect: 0,
        maxSelect: null,
        freeQuantity: 0,
        freeStrategy: 'HIGHEST_PRICE_FIRST',
      },
    ],
    selectedOptions: options,
  };
}

function combo(options: SelectedOption[]): PricingInput {
  return {
    productName: 'Combo Cerotres',
    basePriceCents: 799,
    quantity: 1,
    groups: [
      {
        groupId: 'extras',
        name: 'Extras',
        minSelect: 0,
        maxSelect: null,
        freeQuantity: 3,
        freeStrategy: 'HIGHEST_PRICE_FIRST',
      },
      {
        groupId: 'classic',
        name: 'Salsas clásicas',
        minSelect: 0,
        maxSelect: null,
        freeQuantity: 2,
        freeStrategy: 'HIGHEST_PRICE_FIRST',
      },
      {
        groupId: 'house',
        name: 'Salsas de la casa',
        minSelect: 0,
        maxSelect: null,
        freeQuantity: 2,
        freeStrategy: 'HIGHEST_PRICE_FIRST',
      },
    ],
    selectedOptions: options,
  };
}

function papas(options: SelectedOption[]): PricingInput {
  return {
    productName: 'Papas fritas',
    basePriceCents: 200,
    quantity: 1,
    groups: [
      {
        groupId: 'extras',
        name: 'Extras',
        minSelect: 0,
        maxSelect: null,
        freeQuantity: 0,
        freeStrategy: 'HIGHEST_PRICE_FIRST',
      },
      {
        groupId: 'classic',
        name: 'Salsas clásicas',
        minSelect: 0,
        maxSelect: null,
        freeQuantity: 1,
        freeStrategy: 'HIGHEST_PRICE_FIRST',
      },
    ],
    selectedOptions: options,
  };
}

describe('calculateLinePrice (Cero Tres menu cases)', () => {
  it('Pepito de Lomito sin tocar nada → $6.50', () => {
    const result = calculateLinePrice(pepito());
    expect(result.lineTotalCents).toBe(650);
    expect(result.modifiersTotalCents).toBe(0);
  });

  it('Pepito + 2 extras (Gratinado, Tocineta) → $6.50', () => {
    const result = calculateLinePrice(pepito([EXTRA_GRATINADO, EXTRA_TOCINETA]));
    expect(result.lineTotalCents).toBe(650);
  });

  it('Pepito + 3 extras → $8.00', () => {
    const result = calculateLinePrice(pepito([EXTRA_GRATINADO, EXTRA_TOCINETA, EXTRA_VEGETALES]));
    expect(result.lineTotalCents).toBe(800);
    expect(result.modifiersTotalCents).toBe(150);
  });

  it('Pepito + 2 salsas clásicas → $6.50', () => {
    const result = calculateLinePrice(pepito([SAUCE_MAYO, SAUCE_KETCHUP]));
    expect(result.lineTotalCents).toBe(650);
  });

  it('Pepito + 3 salsas clásicas → $6.75', () => {
    const result = calculateLinePrice(pepito([SAUCE_MAYO, SAUCE_KETCHUP, SAUCE_MAIZ]));
    expect(result.lineTotalCents).toBe(675);
  });

  it('Pepito + 2 clásicas + 1 Mayopesto → $7.00', () => {
    const result = calculateLinePrice(pepito([SAUCE_MAYO, SAUCE_KETCHUP, SAUCE_MAYOPSTO]));
    expect(result.lineTotalCents).toBe(700);
  });

  it('Combo Cerotres con 3 extras y 4 salsas (2+2) → $7.99', () => {
    const result = calculateLinePrice(
      combo([
        EXTRA_GRATINADO,
        EXTRA_TOCINETA,
        EXTRA_VEGETALES,
        SAUCE_MAYO,
        SAUCE_KETCHUP,
        SAUCE_MAYOPSTO,
        SAUCE_MAIZ_TOC,
      ]),
    );
    expect(result.lineTotalCents).toBe(799);
  });

  it('Combo + 1 salsa de la casa extra → $8.49', () => {
    const result = calculateLinePrice(
      combo([
        EXTRA_GRATINADO,
        EXTRA_TOCINETA,
        EXTRA_VEGETALES,
        SAUCE_MAYO,
        SAUCE_KETCHUP,
        SAUCE_MAYOPSTO,
        SAUCE_MAIZ_TOC,
        { optionId: 'sh-curry', groupId: 'house', name: 'Mayocurry', priceDelta: 50, quantity: 1 },
      ]),
    );
    expect(result.lineTotalCents).toBe(849);
  });

  it('Papas fritas + Tocineta Crispy → $3.50', () => {
    const result = calculateLinePrice(papas([EXTRA_TOCINETA]));
    expect(result.lineTotalCents).toBe(350);
  });

  it('Grupo con min_select=1 sin selección → MODIFIER_MIN_NOT_MET', () => {
    expect(() =>
      calculateLinePrice({
        productName: 'Required sauce item',
        basePriceCents: 200,
        quantity: 1,
        groups: [
          {
            groupId: 'classic',
            name: 'Salsas clásicas',
            minSelect: 1,
            maxSelect: 1,
            freeQuantity: 1,
            freeStrategy: 'HIGHEST_PRICE_FIRST',
          },
        ],
        selectedOptions: [],
      }),
    ).toThrow(PricingError);

    try {
      calculateLinePrice({
        productName: 'Required sauce item',
        basePriceCents: 200,
        quantity: 1,
        groups: [
          {
            groupId: 'classic',
            name: 'Salsas clásicas',
            minSelect: 1,
            maxSelect: 1,
            freeQuantity: 1,
            freeStrategy: 'HIGHEST_PRICE_FIRST',
          },
        ],
        selectedOptions: [],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(PricingError);
      expect((error as PricingError).code).toBe('MODIFIER_MIN_NOT_MET');
    }
  });

  it('price_delta 0 never consumes free quota', () => {
    const result = calculateLinePrice(
      pepito([
        { optionId: 'note', groupId: 'extras', name: 'Sin cebolla', priceDelta: 0, quantity: 1 },
        EXTRA_GRATINADO,
        EXTRA_TOCINETA,
        EXTRA_VEGETALES,
      ]),
    );
    // free slots still cover 2 paid extras; third paid costs 150
    expect(result.lineTotalCents).toBe(800);
  });
});
