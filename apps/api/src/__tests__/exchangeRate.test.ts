import { describe, expect, it } from 'vitest';
import { bolivarsCentsToUsdCents, usdCentsToBolivarsCents } from '../services/exchangeRate.js';

describe('exchange rate conversion', () => {
  it('converts USD cents to Bs céntimos rounding once', () => {
    // $6.50 at 36.5 Bs/$ → 237.25 Bs → 23725 céntimos
    expect(usdCentsToBolivarsCents(650, 36.5)).toBe(23725);
  });

  it('converts Bs céntimos back to USD cents', () => {
    expect(bolivarsCentsToUsdCents(23725, 36.5)).toBe(650);
  });
});
