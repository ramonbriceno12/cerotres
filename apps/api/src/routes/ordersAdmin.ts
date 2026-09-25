import { Router } from 'express';
import { z } from 'zod';
import { FulfillmentType, OrderStatus, PaymentMethod } from '@prisma/client';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';
import { orderEvents } from '../lib/orderEvents.js';
import { prisma } from '../lib/prisma.js';
import { previewCommissionForChannel } from '../services/commission.js';
import {
  createAdminOrder,
  exportAdminOrdersCsv,
  getAdminOrder,
  listAdminOrders,
  listKitchenBoard,
  transitionOrderStatus,
} from '../services/ordersAdmin.js';
import { parseTextOrder } from '../services/orderTextParser.js';
import { sendCustomerReceiptPdf, sendKitchenTicketPdf } from '../services/orderTickets.js';
import { PricingError } from '@cerotres/shared';

function param(value: string | string[] | undefined, name: string): string {
  if (typeof value === 'string' && value) return value;
  if (Array.isArray(value) && value[0]) return value[0];
  throw new AppError(400, 'VALIDATION_ERROR', `Missing ${name}`);
}

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.nativeEnum(OrderStatus).optional(),
  channelId: z.string().optional(),
  fulfillmentType: z.nativeEnum(FulfillmentType).optional(),
  q: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const statusSchema = z.object({
  toStatus: z.nativeEnum(OrderStatus),
  cancelReason: z.string().optional(),
  note: z.string().optional(),
});

const paymentLineSchema = z.object({
  method: z.nativeEnum(PaymentMethod),
  amountCents: z.number().int().positive(),
  reference: z.string().optional(),
});

const createSchema = z
  .object({
    channelId: z.string().min(1),
    externalOrderRef: z.string().optional(),
    customerName: z.string().min(2),
    customerEmail: z.string().email().optional(),
    customerPhone: z.string().optional(),
    fulfillmentType: z.nativeEnum(FulfillmentType),
    deliveryZoneId: z.string().optional(),
    addressLine1: z.string().optional(),
    addressReference: z.string().optional(),
    notes: z.string().optional(),
    placedAt: z.string().datetime().optional(),
    paymentMethod: z.nativeEnum(PaymentMethod).optional(),
    paymentReference: z.string().optional(),
    payments: z.array(paymentLineSchema).min(1).optional(),
    paymentsConfirmed: z.boolean().optional(),
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

const previewSchema = z.object({
  channelId: z.string().min(1),
  placedAt: z.string().datetime().optional(),
  subtotalCents: z.number().int().nonnegative(),
  deliveryFeeCents: z.number().int().nonnegative().default(0),
  totalCents: z.number().int().nonnegative(),
});

const parseTextSchema = z.object({
  text: z.string().min(8).max(8000),
  channelId: z.string().min(1),
});

export const ordersAdminRouter = Router();

async function resolveAdminFromQueryToken(req: import('express').Request) {
  const token = typeof req.query.access_token === 'string' ? req.query.access_token : '';
  if (!token) throw new AppError(401, 'UNAUTHORIZED', 'Missing access token');
  const { verifyAccessToken } = await import('../lib/tokens.js');
  const payload = await verifyAccessToken(token);
  const admin = await prisma.adminUser.findFirst({
    where: { id: payload.sub, deletedAt: null, isActive: true },
    select: { id: true, email: true, name: true, role: true, totpEnabled: true, isActive: true },
  });
  if (!admin) throw new AppError(401, 'UNAUTHORIZED', 'Admin not found');
  if (!['OWNER', 'MANAGER', 'KITCHEN', 'CASHIER'].includes(admin.role)) {
    throw new AppError(403, 'FORBIDDEN', 'Insufficient role');
  }
  req.admin = admin;
}

ordersAdminRouter.get('/kitchen/stream', async (req, res, next) => {
  try {
    await resolveAdminFromQueryToken(req);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (payload: unknown) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const orders = await listKitchenBoard();
    send({ type: 'snapshot', orders });

    const unsubscribe = orderEvents.subscribeKitchen((event) => {
      void listKitchenBoard().then((fresh) => {
        send({ type: 'update', event, orders: fresh });
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

ordersAdminRouter.use(requireAuth, requireRoles('OWNER', 'MANAGER', 'KITCHEN', 'CASHIER'));

ordersAdminRouter.get('/meta', async (_req, res, next) => {
  try {
    const [channels, zones] = await Promise.all([
      prisma.salesChannel.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          code: true,
          name: true,
          colorHex: true,
          requiresExternalRef: true,
        },
      }),
      prisma.deliveryZone.findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, feeCents: true, estimatedMinutes: true },
      }),
    ]);
    res.json({
      channels,
      zones,
      statuses: Object.values(OrderStatus),
      paymentMethods: Object.values(PaymentMethod),
    });
  } catch (error) {
    next(error);
  }
});

ordersAdminRouter.get('/', async (req, res, next) => {
  try {
    const query = listSchema.parse(req.query);
    const result = await listAdminOrders({
      page: query.page,
      pageSize: query.pageSize,
      ...(query.status ? { status: query.status } : {}),
      ...(query.channelId ? { channelId: query.channelId } : {}),
      ...(query.fulfillmentType ? { fulfillmentType: query.fulfillmentType } : {}),
      ...(query.q ? { q: query.q } : {}),
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

ordersAdminRouter.get('/export.csv', async (req, res, next) => {
  try {
    const query = listSchema.parse(req.query);
    const csv = await exportAdminOrdersCsv({
      ...(query.status ? { status: query.status } : {}),
      ...(query.channelId ? { channelId: query.channelId } : {}),
      ...(query.fulfillmentType ? { fulfillmentType: query.fulfillmentType } : {}),
      ...(query.q ? { q: query.q } : {}),
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

ordersAdminRouter.get('/kitchen', async (_req, res, next) => {
  try {
    const orders = await listKitchenBoard();
    res.json({ orders });
  } catch (error) {
    next(error);
  }
});

ordersAdminRouter.post(
  '/preview-commission',
  requireRoles('OWNER', 'MANAGER', 'CASHIER'),
  async (req, res, next) => {
    try {
      const body = previewSchema.parse(req.body);
      const preview = await previewCommissionForChannel({
        channelId: body.channelId,
        placedAt: body.placedAt ? new Date(body.placedAt) : new Date(),
        subtotalCents: body.subtotalCents,
        deliveryFeeCents: body.deliveryFeeCents,
        totalCents: body.totalCents,
      });
      res.json({
        channel: preview.channel,
        percent: Number(preview.snapshot.percent.toString()),
        commissionAmountCents: preview.snapshot.commissionAmountCents,
        netPayoutExpectedCents: preview.snapshot.netPayoutExpectedCents,
        effectiveFrom: preview.snapshot.effectiveFrom,
        rateNote: preview.snapshot.rateNote,
        warning: body.placedAt
          ? `Se aplicará la tarifa vigente al ${new Date(body.placedAt).toISOString().slice(0, 10)}.`
          : null,
      });
    } catch (error) {
      next(error);
    }
  },
);

ordersAdminRouter.post(
  '/parse-text',
  requireRoles('OWNER', 'MANAGER', 'CASHIER'),
  async (req, res, next) => {
    try {
      const body = parseTextSchema.parse(req.body);
      const preview = await parseTextOrder({
        text: body.text,
        channelId: body.channelId,
      });
      res.json({ preview });
    } catch (error) {
      if (error instanceof PricingError) {
        next(new AppError(400, error.code, error.message, error.details));
        return;
      }
      next(error);
    }
  },
);

ordersAdminRouter.post('/', requireRoles('OWNER', 'MANAGER', 'CASHIER'), async (req, res, next) => {
  try {
    if (!req.admin) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const body = createSchema.parse(req.body);
    const result = await createAdminOrder({
      channelId: body.channelId,
      ...(body.externalOrderRef ? { externalOrderRef: body.externalOrderRef } : {}),
      customerName: body.customerName,
      ...(body.customerEmail ? { customerEmail: body.customerEmail } : {}),
      ...(body.customerPhone ? { customerPhone: body.customerPhone } : {}),
      fulfillmentType: body.fulfillmentType,
      ...(body.deliveryZoneId ? { deliveryZoneId: body.deliveryZoneId } : {}),
      ...(body.addressLine1 ? { addressLine1: body.addressLine1 } : {}),
      ...(body.addressReference ? { addressReference: body.addressReference } : {}),
      ...(body.notes ? { notes: body.notes } : {}),
      ...(body.placedAt ? { placedAt: body.placedAt } : {}),
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
      ...(body.paymentsConfirmed !== undefined
        ? { paymentsConfirmed: body.paymentsConfirmed }
        : {}),
      clientTotalCents: body.clientTotalCents,
      items: body.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        ...(item.notes ? { notes: item.notes } : {}),
        clientLineTotalCents: item.clientLineTotalCents,
        options: item.options,
      })),
      actorId: req.admin.id,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof PricingError) {
      next(new AppError(400, error.code, error.message, error.details));
      return;
    }
    next(error);
  }
});

ordersAdminRouter.get('/:id', async (req, res, next) => {
  try {
    const id = param(req.params.id, 'id');
    const order = await getAdminOrder(id);
    res.json({ order });
  } catch (error) {
    next(error);
  }
});

ordersAdminRouter.get('/:id/kitchen-ticket.pdf', async (req, res, next) => {
  try {
    const id = param(req.params.id, 'id');
    await sendKitchenTicketPdf(id, res);
  } catch (error) {
    next(error);
  }
});

ordersAdminRouter.get('/:id/receipt.pdf', async (req, res, next) => {
  try {
    const id = param(req.params.id, 'id');
    await sendCustomerReceiptPdf(id, res);
  } catch (error) {
    next(error);
  }
});

ordersAdminRouter.post('/:id/status', async (req, res, next) => {
  try {
    if (!req.admin) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const id = param(req.params.id, 'id');
    const body = statusSchema.parse(req.body);
    const order = await transitionOrderStatus({
      orderId: id,
      toStatus: body.toStatus,
      ...(body.cancelReason !== undefined ? { cancelReason: body.cancelReason } : {}),
      ...(body.note !== undefined ? { note: body.note } : {}),
      actorId: req.admin.id,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
    res.json({ order });
  } catch (error) {
    next(error);
  }
});
