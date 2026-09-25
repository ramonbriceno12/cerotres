import { describe, expect, it } from 'vitest';
import { PaymentMethod } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { resolveOrderPayments } from '../services/orderPayments.js';

describe('resolveOrderPayments', () => {
  it('accepts legacy single paymentMethod covering the total', () => {
    const lines = resolveOrderPayments({
      totalCents: 1200,
      paymentMethod: PaymentMethod.PAGO_MOVIL,
      paymentReference: '123',
    });
    expect(lines).toEqual([
      { method: PaymentMethod.PAGO_MOVIL, amountCents: 1200, reference: '123' },
    ]);
  });

  it('accepts split payments that sum to total', () => {
    const lines = resolveOrderPayments({
      totalCents: 1200,
      payments: [
        { method: PaymentMethod.PAGO_MOVIL, amountCents: 800 },
        { method: PaymentMethod.ZELLE, amountCents: 400, reference: 'ZL-1' },
      ],
    });
    expect(lines).toHaveLength(2);
    expect(lines.reduce((s, l) => s + l.amountCents, 0)).toBe(1200);
  });

  it('rejects mismatch', () => {
    expect(() =>
      resolveOrderPayments({
        totalCents: 1200,
        payments: [{ method: PaymentMethod.CASH, amountCents: 1000 }],
      }),
    ).toThrow(AppError);
  });
});
