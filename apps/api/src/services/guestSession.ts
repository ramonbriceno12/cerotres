import { prisma } from '../lib/prisma.js';
import { generateOpaqueToken, guestSessionExpiryDate, hashToken } from '../lib/tokens.js';
import { env } from '../config/env.js';

export async function createGuestSession(input: {
  customerId?: string | null;
  orderId?: string | null;
}) {
  const sessionToken = generateOpaqueToken(32);
  const expiresAt = guestSessionExpiryDate();

  const session = await prisma.guestSession.create({
    data: {
      customerId: input.customerId ?? null,
      orderId: input.orderId ?? null,
      tokenHash: hashToken(sessionToken),
      expiresAt,
    },
  });

  return { session, sessionToken, expiresAt };
}

export function buildTrackingUrl(publicCode: string, sessionToken: string): string {
  const url = new URL(`/pedido/${publicCode}`, env.WEB_APP_URL);
  url.searchParams.set('t', sessionToken);
  return url.toString();
}
