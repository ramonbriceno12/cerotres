import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { generateOpaqueToken, guestSessionExpiryDate, hashToken } from '../lib/tokens.js';
import { buildTrackingUrl } from '../services/guestSession.js';
import { setGuestCookie } from '../lib/cookies.js';

const resendSchema = z.object({
  email: z.string().email(),
  publicCode: z.string().min(4),
});

const resendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many resend attempts' } },
});

export const guestRouter = Router();

/**
 * Resend tracking link to the order email.
 * Rotates the guest session token for that order.
 */
guestRouter.post('/orders/resend-link', resendLimiter, async (req, res, next) => {
  try {
    const body = resendSchema.parse(req.body);
    const order = await prisma.order.findFirst({
      where: {
        publicCode: body.publicCode,
        customerEmail: { equals: body.email, mode: 'insensitive' },
        deletedAt: null,
      },
      select: {
        id: true,
        publicCode: true,
        customerEmail: true,
        customerId: true,
        guestSession: { select: { id: true } },
      },
    });

    // Always respond the same to avoid account enumeration.
    if (!order?.customerEmail) {
      res.json({ ok: true });
      return;
    }

    const sessionToken = generateOpaqueToken(32);
    const expiresAt = guestSessionExpiryDate();
    const tokenHash = hashToken(sessionToken);

    if (order.guestSession) {
      await prisma.guestSession.update({
        where: { id: order.guestSession.id },
        data: { tokenHash, expiresAt },
      });
    } else {
      await prisma.guestSession.create({
        data: {
          orderId: order.id,
          customerId: order.customerId,
          tokenHash,
          expiresAt,
        },
      });
    }

    setGuestCookie(res, sessionToken, expiresAt);
    const trackingUrl = buildTrackingUrl(order.publicCode, sessionToken);

    // ConsoleProvider until SES (phase 8)
    logger.info(
      { to: order.customerEmail, trackingUrl, publicCode: order.publicCode },
      '[email:console] tracking link resent',
    );

    res.json({
      ok: true,
      // Dev convenience only — remove when SES is live
      ...(env.NODE_ENV === 'development' ? { trackingUrl } : {}),
    });
  } catch (error) {
    next(error);
  }
});

guestRouter.get('/me', async (req, res, next) => {
  try {
    if (!req.guest) {
      throw new AppError(401, 'GUEST_REQUIRED', 'Guest session required');
    }

    const session = await prisma.guestSession.findUnique({
      where: { id: req.guest.sessionId },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        order: {
          select: {
            id: true,
            publicCode: true,
            status: true,
            totalCents: true,
            createdAt: true,
          },
        },
      },
    });

    if (!session) {
      throw new AppError(401, 'GUEST_REQUIRED', 'Guest session not found');
    }

    const orders = session.customerId
      ? await prisma.order.findMany({
          where: { customerId: session.customerId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            publicCode: true,
            status: true,
            totalCents: true,
            createdAt: true,
          },
        })
      : session.order
        ? [session.order]
        : [];

    res.json({
      customer: session.customer,
      currentOrder: session.order,
      orders,
    });
  } catch (error) {
    next(error);
  }
});
