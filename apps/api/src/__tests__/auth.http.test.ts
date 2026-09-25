import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/password.js';
import { signAccessToken } from '../lib/tokens.js';

const app = createApp();

const kitchenEmail = 'kitchen-test@cerotres.com';
const ownerEmail = 'owner@cerotres.com';

describe('admin auth HTTP', () => {
  beforeAll(async () => {
    await prisma.adminUser.upsert({
      where: { email: kitchenEmail },
      update: {
        passwordHash: await hashPassword('KitchenPass123!'),
        role: 'KITCHEN',
        isActive: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        deletedAt: null,
      },
      create: {
        email: kitchenEmail,
        name: 'Kitchen Test',
        role: 'KITCHEN',
        passwordHash: await hashPassword('KitchenPass123!'),
      },
    });
  });

  afterAll(async () => {
    await prisma.adminRefreshToken.deleteMany({
      where: { adminUser: { email: kitchenEmail } },
    });
    await prisma.adminUser.deleteMany({ where: { email: kitchenEmail } });
    await prisma.$disconnect();
  });

  it('logs in owner and rejects kitchen on owner-only route', async () => {
    const login = await request(app)
      .post('/api/admin/auth/login')
      .send({
        email: ownerEmail,
        password: process.env.OWNER_PASSWORD ?? 'ChangeMeNow123!',
      });

    expect(login.status).toBe(200);
    expect(login.body.accessToken).toBeTruthy();

    const ownerOnly = await request(app)
      .get('/api/admin/auth/owner-only')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(ownerOnly.status).toBe(200);

    const kitchenLogin = await request(app).post('/api/admin/auth/login').send({
      email: kitchenEmail,
      password: 'KitchenPass123!',
    });
    expect(kitchenLogin.status).toBe(200);

    const forbidden = await request(app)
      .get('/api/admin/auth/owner-only')
      .set('Authorization', `Bearer ${kitchenLogin.body.accessToken}`);
    expect(forbidden.status).toBe(403);
  });

  it('rejects protected route without session', async () => {
    const res = await request(app).get('/api/admin/auth/me');
    expect(res.status).toBe(401);
  });

  it('refreshes access token using cookie rotation', async () => {
    const login = await request(app)
      .post('/api/admin/auth/login')
      .send({
        email: ownerEmail,
        password: process.env.OWNER_PASSWORD ?? 'ChangeMeNow123!',
      });
    expect(login.status).toBe(200);
    const cookies = login.headers['set-cookie'];
    expect(cookies).toBeTruthy();
    const cookieHeader = Array.isArray(cookies) ? cookies : [cookies as string];

    const refresh = await request(app).post('/api/admin/auth/refresh').set('Cookie', cookieHeader);
    expect(refresh.status).toBe(200);
    expect(refresh.body.accessToken).toBeTruthy();
    const refreshCookies = refresh.headers['set-cookie'];
    expect(refreshCookies).toBeTruthy();
    expect(String(refreshCookies)).not.toBe(String(cookies));
  });

  it('signs kitchen token that still cannot access owner route', async () => {
    const kitchen = await prisma.adminUser.findUniqueOrThrow({ where: { email: kitchenEmail } });
    const token = await signAccessToken({
      sub: kitchen.id,
      email: kitchen.email,
      role: kitchen.role,
    });
    const res = await request(app)
      .get('/api/admin/auth/owner-only')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
