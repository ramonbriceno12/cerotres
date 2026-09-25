import { describe, expect, it } from 'vitest';
import {
  generateOpaqueToken,
  hashToken,
  signAccessToken,
  verifyAccessToken,
} from '../lib/tokens.js';
import { roleAtLeast } from '../middleware/auth.js';

describe('tokens', () => {
  it('hashes opaque tokens deterministically', () => {
    const token = generateOpaqueToken(32);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
  });

  it('signs and verifies access JWTs', async () => {
    const token = await signAccessToken({
      sub: 'admin_1',
      email: 'owner@cerotres.com',
      role: 'OWNER',
    });
    const payload = await verifyAccessToken(token);
    expect(payload.sub).toBe('admin_1');
    expect(payload.role).toBe('OWNER');
    expect(payload.typ).toBe('access');
  });

  it('rejects tampered tokens', async () => {
    const token = await signAccessToken({
      sub: 'admin_1',
      email: 'owner@cerotres.com',
      role: 'OWNER',
    });
    await expect(verifyAccessToken(`${token}x`)).rejects.toBeTruthy();
  });
});

describe('role guards', () => {
  it('ranks OWNER above KITCHEN and CASHIER', () => {
    expect(roleAtLeast('OWNER', 'MANAGER')).toBe(true);
    expect(roleAtLeast('KITCHEN', 'OWNER')).toBe(false);
    expect(roleAtLeast('MANAGER', 'MANAGER')).toBe(true);
  });
});
