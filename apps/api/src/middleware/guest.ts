import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { hashToken } from '../lib/tokens.js';

export type GuestContext = {
  sessionId: string;
  customerId: string | null;
  orderId: string | null;
};

declare global {
  namespace Express {
    interface Request {
      guest?: GuestContext;
    }
  }
}

/**
 * Optional guest resolver: reads opaque token from cookie, query `t`, or Bearer.
 * Does not fail the request if missing/invalid — just leaves req.guest undefined.
 */
export async function resolveGuest(req: Request, _res: Response, next: NextFunction) {
  try {
    const cookieToken =
      typeof req.cookies?.guest_session === 'string' ? req.cookies.guest_session : undefined;
    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ')
      ? header.slice('Bearer '.length).trim()
      : undefined;
    const queryToken = typeof req.query.t === 'string' ? req.query.t : undefined;

    const raw = cookieToken ?? queryToken ?? bearer;
    if (!raw) {
      next();
      return;
    }

    const tokenHash = hashToken(raw);
    const session = await prisma.guestSession.findFirst({
      where: {
        tokenHash,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, customerId: true, orderId: true },
    });

    if (session) {
      req.guest = {
        sessionId: session.id,
        customerId: session.customerId,
        orderId: session.orderId,
      };
    }

    next();
  } catch (error) {
    next(error);
  }
}

export function requireGuest(req: Request, _res: Response, next: NextFunction) {
  if (!req.guest) {
    next(new AppError(401, 'GUEST_REQUIRED', 'Guest session required'));
    return;
  }
  next();
}
