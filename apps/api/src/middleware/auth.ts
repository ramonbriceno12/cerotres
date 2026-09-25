import type { AdminRole, AdminUser } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { prisma } from '../lib/prisma.js';

export type AuthedAdmin = Pick<
  AdminUser,
  'id' | 'email' | 'name' | 'role' | 'totpEnabled' | 'isActive'
>;

declare global {
  namespace Express {
    interface Request {
      admin?: AuthedAdmin;
    }
  }
}

const ROLE_RANK: Record<AdminRole, number> = {
  CASHIER: 1,
  KITCHEN: 1,
  MANAGER: 2,
  OWNER: 3,
};

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError(401, 'UNAUTHORIZED', 'Missing access token');
    }

    const token = header.slice('Bearer '.length).trim();
    const payload = await verifyAccessToken(token);

    const admin = await prisma.adminUser.findFirst({
      where: { id: payload.sub, deletedAt: null, isActive: true },
      select: { id: true, email: true, name: true, role: true, totpEnabled: true, isActive: true },
    });

    if (!admin) {
      throw new AppError(401, 'UNAUTHORIZED', 'Admin not found or inactive');
    }

    req.admin = admin;
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }
    next(new AppError(401, 'UNAUTHORIZED', 'Invalid or expired access token'));
  }
}

export function requireRoles(...allowed: AdminRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin) {
      next(new AppError(401, 'UNAUTHORIZED', 'Not authenticated'));
      return;
    }

    if (!allowed.includes(req.admin.role)) {
      next(new AppError(403, 'FORBIDDEN', 'Insufficient role'));
      return;
    }

    next();
  };
}

/** Higher-or-equal role helper used in tests and future modules. */
export function roleAtLeast(role: AdminRole, minimum: AdminRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}
