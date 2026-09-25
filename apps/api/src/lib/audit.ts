import { prisma } from '../lib/prisma.js';
import type { Prisma } from '@prisma/client';

export async function writeAuditLog(input: {
  actorId?: string | null | undefined;
  action: string;
  entityType: string;
  entityId?: string | null | undefined;
  before?: unknown;
  after?: unknown;
  ip?: string | null | undefined;
  userAgent?: string | null | undefined;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      ...(input.before !== undefined ? { before: input.before as Prisma.InputJsonValue } : {}),
      ...(input.after !== undefined ? { after: input.after as Prisma.InputJsonValue } : {}),
    },
  });
}
