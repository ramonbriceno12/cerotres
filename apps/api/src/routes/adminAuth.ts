import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { verifyPassword } from '../lib/password.js';
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from '../lib/cookies.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import {
  clearFailedLogins,
  isAccountLocked,
  issueAdminSession,
  registerFailedLogin,
  revokeRefreshToken,
  rotateRefreshToken,
  verifyTotpCode,
} from '../services/adminAuth.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  totpCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

export const adminAuthRouter = Router();

adminAuthRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const admin = await prisma.adminUser.findFirst({
      where: { email: body.email.toLowerCase(), deletedAt: null },
    });

    if (!admin || !admin.isActive) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    }

    if (isAccountLocked(admin)) {
      throw new AppError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.');
    }

    const passwordOk = await verifyPassword(admin.passwordHash, body.password);
    if (!passwordOk) {
      await registerFailedLogin(admin.id, admin.failedLoginAttempts);
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    }

    if (admin.totpEnabled) {
      if (!admin.totpSecret) {
        throw new AppError(500, 'TOTP_MISCONFIGURED', 'TOTP enabled without secret');
      }
      if (!body.totpCode || !verifyTotpCode(admin.totpSecret, body.totpCode)) {
        await registerFailedLogin(admin.id, admin.failedLoginAttempts);
        throw new AppError(401, 'TOTP_REQUIRED', 'Valid TOTP code required');
      }
    }

    await clearFailedLogins(admin.id);
    const session = await issueAdminSession(admin);
    setRefreshCookie(res, session.refreshToken, session.expiresAt);

    res.json({
      accessToken: session.accessToken,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        totpEnabled: admin.totpEnabled,
      },
    });
  } catch (error) {
    next(error);
  }
});

adminAuthRouter.post('/refresh', async (req, res, next) => {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (typeof raw !== 'string' || !raw) {
      throw new AppError(401, 'UNAUTHORIZED', 'Missing refresh token');
    }

    const rotated = await rotateRefreshToken(raw);
    if (!rotated) {
      clearRefreshCookie(res);
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid refresh token');
    }

    setRefreshCookie(res, rotated.refreshToken, rotated.expiresAt);
    res.json({
      accessToken: rotated.accessToken,
      admin: {
        id: rotated.admin.id,
        email: rotated.admin.email,
        role: rotated.admin.role,
      },
    });
  } catch (error) {
    next(error);
  }
});

adminAuthRouter.post('/logout', async (req, res, next) => {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (typeof raw === 'string' && raw) {
      await revokeRefreshToken(raw);
    }
    clearRefreshCookie(res);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

adminAuthRouter.get('/me', requireAuth, async (req, res) => {
  res.json({ admin: req.admin });
});

/** Sample OWNER-only route for role guard checks. */
adminAuthRouter.get('/owner-only', requireAuth, requireRoles('OWNER'), (_req, res) => {
  res.json({ ok: true, scope: 'owner' });
});
