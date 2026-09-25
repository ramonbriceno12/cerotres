import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { AdminRole } from '@prisma/client';
import { env } from '../config/env.js';

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export type AccessTokenPayload = {
  sub: string;
  email: string;
  role: AdminRole;
  typ: 'access';
};

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export async function signAccessToken(payload: Omit<AccessTokenPayload, 'typ'>): Promise<string> {
  return new SignJWT({
    email: payload.email,
    role: payload.role,
    typ: 'access',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, accessSecret);
  if (
    payload.typ !== 'access' ||
    typeof payload.sub !== 'string' ||
    typeof payload.email !== 'string' ||
    typeof payload.role !== 'string'
  ) {
    throw new Error('Invalid access token payload');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    role: payload.role as AdminRole,
    typ: 'access',
  };
}

export function refreshTokenExpiryDate(from = new Date()): Date {
  const expires = new Date(from);
  expires.setUTCDate(expires.getUTCDate() + env.REFRESH_TOKEN_TTL_DAYS);
  return expires;
}

export function guestSessionExpiryDate(from = new Date()): Date {
  const expires = new Date(from);
  expires.setUTCDate(expires.getUTCDate() + env.GUEST_SESSION_TTL_DAYS);
  return expires;
}
