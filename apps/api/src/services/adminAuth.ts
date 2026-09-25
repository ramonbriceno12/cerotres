import { verifySync } from 'otplib';
import type { AdminUser } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  generateOpaqueToken,
  hashToken,
  refreshTokenExpiryDate,
  signAccessToken,
} from '../lib/tokens.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export function isAccountLocked(admin: Pick<AdminUser, 'lockedUntil'>): boolean {
  return Boolean(admin.lockedUntil && admin.lockedUntil.getTime() > Date.now());
}

export async function registerFailedLogin(adminId: string, currentAttempts: number) {
  const failedLoginAttempts = currentAttempts + 1;
  const lockedUntil =
    failedLoginAttempts >= MAX_FAILED_ATTEMPTS
      ? new Date(Date.now() + LOCK_MINUTES * 60_000)
      : null;

  return prisma.adminUser.update({
    where: { id: adminId },
    data: {
      failedLoginAttempts,
      lockedUntil,
    },
  });
}

export async function clearFailedLogins(adminId: string) {
  return prisma.adminUser.update({
    where: { id: adminId },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });
}

export function verifyTotpCode(secret: string, token: string): boolean {
  const result = verifySync({ secret, token });
  return result.valid;
}

export async function issueAdminSession(admin: Pick<AdminUser, 'id' | 'email' | 'role'>) {
  const accessToken = await signAccessToken({
    sub: admin.id,
    email: admin.email,
    role: admin.role,
  });

  const refreshToken = generateOpaqueToken(48);
  const expiresAt = refreshTokenExpiryDate();
  const record = await prisma.adminRefreshToken.create({
    data: {
      adminUserId: admin.id,
      tokenHash: hashToken(refreshToken),
      expiresAt,
    },
  });

  return { accessToken, refreshToken, expiresAt, refreshTokenId: record.id };
}

export async function rotateRefreshToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const existing = await prisma.adminRefreshToken.findUnique({
    where: { tokenHash },
    include: {
      adminUser: {
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!existing || existing.revokedAt || existing.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  if (!existing.adminUser.isActive || existing.adminUser.deletedAt) {
    return null;
  }

  const next = await issueAdminSession(existing.adminUser);

  await prisma.adminRefreshToken.update({
    where: { id: existing.id },
    data: {
      revokedAt: new Date(),
      replacedByTokenId: next.refreshTokenId,
    },
  });

  return {
    admin: existing.adminUser,
    ...next,
  };
}

export async function revokeRefreshToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  await prisma.adminRefreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export { MAX_FAILED_ATTEMPTS, LOCK_MINUTES };
