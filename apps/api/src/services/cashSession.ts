import { CashSessionStatus, OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { writeAuditLog } from '../lib/audit.js';

function emptyCounts() {
  return {
    cashCents: 0,
    zelleCents: 0,
    pagoMovilCents: 0,
    transferCents: 0,
    otherCents: 0,
  };
}

function addMethod(
  bag: ReturnType<typeof emptyCounts>,
  method: PaymentMethod,
  amountCents: number,
) {
  switch (method) {
    case PaymentMethod.CASH:
      bag.cashCents += amountCents;
      break;
    case PaymentMethod.ZELLE:
      bag.zelleCents += amountCents;
      break;
    case PaymentMethod.PAGO_MOVIL:
      bag.pagoMovilCents += amountCents;
      break;
    case PaymentMethod.TRANSFER:
      bag.transferCents += amountCents;
      break;
    default:
      bag.otherCents += amountCents;
  }
}

export async function getOpenCashSession() {
  return prisma.cashSession.findFirst({
    where: { status: CashSessionStatus.OPEN },
    orderBy: { openedAt: 'desc' },
    include: {
      openedBy: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function listCashSessions(limit = 40) {
  return prisma.cashSession.findMany({
    orderBy: { openedAt: 'desc' },
    take: limit,
    include: {
      openedBy: { select: { id: true, name: true } },
      closedBy: { select: { id: true, name: true } },
    },
  });
}

export async function openCashSession(input: {
  openingFloatCents: number;
  notes?: string | null;
  actorId: string;
}) {
  const existing = await getOpenCashSession();
  if (existing) {
    throw new AppError(409, 'CASH_SESSION_OPEN', 'Already have an open cash session');
  }
  if (input.openingFloatCents < 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'openingFloatCents must be >= 0');
  }

  const session = await prisma.cashSession.create({
    data: {
      openingFloatCents: input.openingFloatCents,
      notes: input.notes ?? null,
      openedById: input.actorId,
      status: CashSessionStatus.OPEN,
    },
    include: { openedBy: { select: { id: true, name: true, email: true } } },
  });

  await writeAuditLog({
    actorId: input.actorId,
    action: 'CASH_SESSION_OPEN',
    entityType: 'CashSession',
    entityId: session.id,
    after: { openingFloatCents: input.openingFloatCents },
  });

  return session;
}

async function expectedPayments(from: Date, to: Date) {
  const payments = await prisma.payment.findMany({
    where: {
      status: PaymentStatus.CONFIRMED,
      createdAt: { gte: from, lte: to },
      order: { status: { not: OrderStatus.CANCELLED } },
    },
    select: { method: true, amountCents: true },
  });
  const bag = emptyCounts();
  for (const p of payments) addMethod(bag, p.method, p.amountCents);
  return bag;
}

export async function previewCashSessionClose(sessionId: string) {
  const session = await prisma.cashSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new AppError(404, 'NOT_FOUND', 'Cash session not found');
  if (session.status !== CashSessionStatus.OPEN) {
    throw new AppError(409, 'CASH_SESSION_CLOSED', 'Session already closed');
  }
  const expected = await expectedPayments(session.openedAt, new Date());
  return {
    session,
    expected: {
      ...expected,
      cashWithFloatCents: expected.cashCents + session.openingFloatCents,
    },
  };
}

export async function closeCashSession(input: {
  sessionId: string;
  countedCashCents: number;
  countedZelleCents: number;
  countedPagoMovilCents: number;
  countedTransferCents: number;
  countedOtherCents: number;
  notes?: string | null;
  actorId: string;
}) {
  const preview = await previewCashSessionClose(input.sessionId);
  const { expected, session } = preview;
  const expectedCashTotal = expected.cashCents + session.openingFloatCents;
  const closedAt = new Date();

  const updated = await prisma.cashSession.update({
    where: { id: input.sessionId },
    data: {
      status: CashSessionStatus.CLOSED,
      closedAt,
      closedById: input.actorId,
      expectedCashCents: expectedCashTotal,
      expectedZelleCents: expected.zelleCents,
      expectedPagoMovilCents: expected.pagoMovilCents,
      expectedTransferCents: expected.transferCents,
      expectedOtherCents: expected.otherCents,
      countedCashCents: input.countedCashCents,
      countedZelleCents: input.countedZelleCents,
      countedPagoMovilCents: input.countedPagoMovilCents,
      countedTransferCents: input.countedTransferCents,
      countedOtherCents: input.countedOtherCents,
      differenceCashCents: input.countedCashCents - expectedCashTotal,
      notes: input.notes ?? session.notes,
    },
    include: {
      openedBy: { select: { id: true, name: true } },
      closedBy: { select: { id: true, name: true } },
    },
  });

  await writeAuditLog({
    actorId: input.actorId,
    action: 'CASH_SESSION_CLOSE',
    entityType: 'CashSession',
    entityId: updated.id,
    after: {
      differenceCashCents: updated.differenceCashCents,
      expectedCashCents: updated.expectedCashCents,
      countedCashCents: updated.countedCashCents,
    },
  });

  return updated;
}
