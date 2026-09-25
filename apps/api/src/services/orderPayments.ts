import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { AppError } from '../lib/errors.js';

export type PaymentLineInput = {
  method: PaymentMethod;
  amountCents: number;
  reference?: string | null | undefined;
};

/** Resolve payments from multi-line payload or legacy single method. */
export function resolveOrderPayments(input: {
  totalCents: number;
  payments?: PaymentLineInput[] | undefined;
  paymentMethod?: PaymentMethod | undefined;
  paymentReference?: string | null | undefined;
}): Array<{
  method: PaymentMethod;
  amountCents: number;
  reference: string | null;
}> {
  let lines = input.payments?.filter((p) => p.amountCents > 0) ?? [];

  if (lines.length === 0) {
    if (!input.paymentMethod) {
      throw new AppError(400, 'VALIDATION_ERROR', 'At least one payment is required');
    }
    lines = [
      {
        method: input.paymentMethod,
        amountCents: input.totalCents,
        reference: input.paymentReference ?? null,
      },
    ];
  }

  for (const line of lines) {
    if (!Number.isInteger(line.amountCents) || line.amountCents <= 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Each payment amount must be a positive integer');
    }
  }

  const sum = lines.reduce((s, line) => s + line.amountCents, 0);
  if (sum !== input.totalCents) {
    throw new AppError(409, 'PAYMENT_MISMATCH', 'Payment amounts must equal order total', {
      expected: input.totalCents,
      received: sum,
    });
  }

  return lines.map((line) => ({
    method: line.method,
    amountCents: line.amountCents,
    reference: line.reference?.trim() ? line.reference.trim() : null,
  }));
}

export function paymentCreateData(
  lines: ReturnType<typeof resolveOrderPayments>,
  status: PaymentStatus,
) {
  return lines.map((line) => ({
    method: line.method,
    amountCents: line.amountCents,
    reference: line.reference,
    status,
    ...(status === PaymentStatus.CONFIRMED ? { confirmedAt: new Date() } : {}),
  }));
}
