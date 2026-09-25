import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { FulfillmentType, PaymentMethod } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { setGuestCookie } from '../lib/cookies.js';
import { createPublicOrder, getPublicOrderByCode } from '../services/orders.js';
import { orderEvents } from '../lib/orderEvents.js';
import { prisma } from '../lib/prisma.js';
import { PricingError } from '@cerotres/shared';

const createOrderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const paymentLineSchema = z.object({
  method: z.nativeEnum(PaymentMethod),
  amountCents: z.number().int().positive(),
  reference: z.string().optional(),
});

const createOrderSchema = z
  .object({
    customerName: z.string().min(2),
    customerEmail: z.string().email(),
    customerPhone: z.string().min(7),
    fulfillmentType: z.nativeEnum(FulfillmentType),
    deliveryZoneId: z.string().optional(),
    addressLine1: z.string().optional(),
    addressReference: z.string().optional(),
    notes: z.string().optional(),
    scheduledFor: z.string().datetime().nullable().optional(),
    paymentMethod: z.nativeEnum(PaymentMethod).optional(),
    paymentReference: z.string().optional(),
    payments: z.array(paymentLineSchema).min(1).optional(),
    clientTotalCents: z.number().int().nonnegative(),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z.number().int().positive(),
          notes: z.string().optional(),
          clientLineTotalCents: z.number().int().nonnegative(),
          options: z.array(
            z.object({
              optionId: z.string().min(1),
              quantity: z.number().int().positive(),
            }),
          ),
        }),
      )
      .min(1),
  })
  .refine((data) => Boolean(data.payments?.length || data.paymentMethod), {
    message: 'payments or paymentMethod required',
    path: ['payments'],
  });

export const publicOrdersRouter = Router();

publicOrdersRouter.get('/meta', async (_req, res, next) => {
  try {
    const zones = await prisma.deliveryZone.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        feeCents: true,
        estimatedMinutes: true,
      },
    });

    const hours = await prisma.storeHours.findMany({
      orderBy: { dayOfWeek: 'asc' },
    });

    const now = new Date();
    // America/Caracas is UTC-4 year-round
    const caracasOffsetHours = -4;
    const local = new Date(now.getTime() + caracasOffsetHours * 60 * 60 * 1000);
    const dayOfWeek = local.getUTCDay();
    const hhmm = `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
    const today = hours.find((h) => h.dayOfWeek === dayOfWeek);
    const isOpen = Boolean(
      today && !today.isClosed && hhmm >= today.openTime && hhmm < today.closeTime,
    );

    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    let nextOpenLabel: string | null = null;
    if (!isOpen) {
      for (let offset = 0; offset < 7; offset += 1) {
        const d = (dayOfWeek + offset) % 7;
        const row = hours.find((h) => h.dayOfWeek === d);
        if (!row || row.isClosed) continue;
        if (offset === 0 && hhmm < row.openTime) {
          nextOpenLabel = `hoy a las ${row.openTime}`;
          break;
        }
        if (offset > 0) {
          nextOpenLabel = `${dayNames[d]} a las ${row.openTime}`;
          break;
        }
      }
    }

    res.json({
      zones,
      hours,
      store: {
        isOpen,
        timezone: 'America/Caracas',
        today,
        nextOpenLabel,
      },
      paymentMethods: [
        { code: 'PAGO_MOVIL', label: 'Pago Móvil' },
        { code: 'ZELLE', label: 'Zelle' },
        { code: 'TRANSFER', label: 'Transferencia' },
        { code: 'CASH', label: 'Efectivo' },
      ],
    });
  } catch (error) {
    next(error);
  }
});

publicOrdersRouter.post('/orders', createOrderLimiter, async (req, res, next) => {
  try {
    const body = createOrderSchema.parse(req.body);
    const result = await createPublicOrder({
      customerName: body.customerName,
      customerEmail: body.customerEmail,
      customerPhone: body.customerPhone,
      fulfillmentType: body.fulfillmentType,
      ...(body.deliveryZoneId ? { deliveryZoneId: body.deliveryZoneId } : {}),
      ...(body.addressLine1 ? { addressLine1: body.addressLine1 } : {}),
      ...(body.addressReference ? { addressReference: body.addressReference } : {}),
      ...(body.notes ? { notes: body.notes } : {}),
      scheduledFor: body.scheduledFor ?? null,
      ...(body.paymentMethod ? { paymentMethod: body.paymentMethod } : {}),
      ...(body.paymentReference ? { paymentReference: body.paymentReference } : {}),
      ...(body.payments
        ? {
            payments: body.payments.map((p) => ({
              method: p.method,
              amountCents: p.amountCents,
              ...(p.reference !== undefined ? { reference: p.reference } : {}),
            })),
          }
        : {}),
      clientTotalCents: body.clientTotalCents,
      items: body.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        ...(item.notes ? { notes: item.notes } : {}),
        clientLineTotalCents: item.clientLineTotalCents,
        options: item.options,
      })),
      ...(typeof req.headers['idempotency-key'] === 'string'
        ? { idempotencyKey: req.headers['idempotency-key'] }
        : {}),
    });

    setGuestCookie(res, result.sessionToken, result.expiresAt);
    res.status(201).json({
      order: result.order,
      sessionToken: result.sessionToken,
      trackingPath: `/pedido/${result.order.publicCode}?t=${result.sessionToken}`,
    });
  } catch (error) {
    if (error instanceof PricingError) {
      next(new AppError(400, error.code, error.message, error.details));
      return;
    }
    next(error);
  }
});

publicOrdersRouter.get('/orders/:code', async (req, res, next) => {
  try {
    const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
    if (!code) throw new AppError(400, 'VALIDATION_ERROR', 'Missing code');
    const order = await getPublicOrderByCode(code);
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found');
    res.json({ order });
  } catch (error) {
    next(error);
  }
});

publicOrdersRouter.get('/orders/:code/stream', async (req, res, next) => {
  try {
    const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
    if (!code) throw new AppError(400, 'VALIDATION_ERROR', 'Missing code');
    const order = await getPublicOrderByCode(code);
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (payload: unknown) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    send({ type: 'snapshot', order });

    const unsubscribe = orderEvents.subscribe(code, (event) => {
      void getPublicOrderByCode(code).then((fresh) => {
        if (fresh) send({ type: 'update', order: fresh, event });
      });
    });

    const heartbeat = setInterval(() => {
      res.write(`: ping\n\n`);
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  } catch (error) {
    next(error);
  }
});
