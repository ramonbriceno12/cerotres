import { randomBytes } from 'node:crypto';
import {
  FeeBase,
  FulfillmentType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { calculateLinePrice, PricingError, type SelectedOption } from '@cerotres/shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { createGuestSession } from '../services/guestSession.js';
import { orderEvents } from '../lib/orderEvents.js';
import { calculateOrderCogs, consumeRecipeStock } from './cogs.js';
import { resolveOrderExchangeRate } from './exchangeRate.js';
import { paymentCreateData, resolveOrderPayments } from './orderPayments.js';

const PUBLIC_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generatePublicCode(): string {
  const bytes = randomBytes(4);
  let suffix = '';
  for (let i = 0; i < 4; i += 1) {
    suffix += PUBLIC_CODE_ALPHABET[bytes[i]! % PUBLIC_CODE_ALPHABET.length];
  }
  return `03-${suffix}`;
}

export type CreateOrderItemInput = {
  productId: string;
  quantity: number;
  notes?: string | undefined;
  options: Array<{ optionId: string; quantity: number }>;
  clientLineTotalCents: number;
};

export type CreateOrderInput = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  fulfillmentType: FulfillmentType;
  deliveryZoneId?: string | undefined;
  addressLine1?: string | undefined;
  addressReference?: string | undefined;
  notes?: string | undefined;
  scheduledFor?: string | null | undefined;
  paymentMethod?: PaymentMethod | undefined;
  paymentReference?: string | undefined;
  payments?:
    | Array<{
        method: PaymentMethod;
        amountCents: number;
        reference?: string | null | undefined;
      }>
    | undefined;
  clientTotalCents: number;
  items: CreateOrderItemInput[];
  idempotencyKey?: string | undefined;
};

function toPublicOrder(order: {
  id: string;
  publicCode: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  deliveryFeeCents: number;
  subtotalCents: number;
  totalCents: number;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  notes: string | null;
  scheduledFor: Date | null;
  placedAt: Date | null;
  createdAt: Date;
  items: Array<{
    id: string;
    productName: string;
    productDescription: string | null;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
    notes: string | null;
    options: Array<{
      groupName: string;
      optionName: string;
      quantity: number;
      unitPriceDeltaCents: number;
      linePriceDeltaCents: number;
      wasFree: boolean;
    }>;
  }>;
  statusEvents: Array<{
    toStatus: OrderStatus;
    createdAt: Date;
  }>;
  deliveryZone: { name: string; estimatedMinutes: number | null } | null;
  payments: Array<{
    method: PaymentMethod;
    status: PaymentStatus;
    amountCents: number;
    reference: string | null;
  }>;
}) {
  return {
    id: order.id,
    publicCode: order.publicCode,
    status: order.status,
    fulfillmentType: order.fulfillmentType,
    deliveryFeeCents: order.deliveryFeeCents,
    subtotalCents: order.subtotalCents,
    totalCents: order.totalCents,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    notes: order.notes,
    scheduledFor: order.scheduledFor,
    placedAt: order.placedAt,
    createdAt: order.createdAt,
    deliveryZone: order.deliveryZone,
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      productDescription: item.productDescription,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents,
      notes: item.notes,
      options: item.options.map((opt) => ({
        groupName: opt.groupName,
        optionName: opt.optionName,
        quantity: opt.quantity,
        unitPriceDeltaCents: opt.unitPriceDeltaCents,
        linePriceDeltaCents: opt.linePriceDeltaCents,
        wasFree: opt.wasFree,
      })),
    })),
    statusEvents: order.statusEvents.map((ev) => ({
      toStatus: ev.toStatus,
      createdAt: ev.createdAt,
    })),
    payments: order.payments.map((p) => ({
      method: p.method,
      status: p.status,
      amountCents: p.amountCents,
      reference: p.reference,
    })),
    // Legacy single payment (first line) for older clients
    payment: order.payments[0]
      ? {
          method: order.payments[0].method,
          status: order.payments[0].status,
          amountCents: order.payments[0].amountCents,
          reference: order.payments[0].reference,
        }
      : null,
  };
}

/** Keys exposed by the public order DTO (for contract tests). */
export function toPublicOrderFields(order: Record<string, unknown>) {
  return Object.keys(order);
}

export async function createPublicOrder(input: CreateOrderInput) {
  if (input.items.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Order needs at least one item');
  }

  const directChannel = await prisma.salesChannel.findUnique({ where: { code: 'DIRECT' } });
  if (!directChannel) {
    throw new AppError(500, 'INTERNAL_ERROR', 'DIRECT channel missing');
  }

  let deliveryFeeCents = 0;
  let deliveryZoneId: string | null = null;
  if (input.fulfillmentType === 'DELIVERY') {
    if (!input.deliveryZoneId || !input.addressLine1) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Delivery requires zone and address');
    }
    const zone = await prisma.deliveryZone.findFirst({
      where: { id: input.deliveryZoneId, isActive: true, deletedAt: null },
    });
    if (!zone) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid delivery zone');
    deliveryFeeCents = zone.feeCents;
    deliveryZoneId = zone.id;
  }

  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      deletedAt: null,
      isActive: true,
      isAvailable: true,
    },
    include: {
      modifierGroups: {
        include: {
          group: {
            include: {
              options: { where: { deletedAt: null } },
            },
          },
        },
      },
    },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  type BuiltItem = {
    productId: string;
    quantity: number;
    notes: string | null;
    productName: string;
    productDescription: string | null;
    unitPriceCents: number;
    lineTotalCents: number;
    options: Array<{
      modifierOptionId: string;
      groupName: string;
      optionName: string;
      optionDescription: string | null;
      quantity: number;
      unitPriceDeltaCents: number;
      linePriceDeltaCents: number;
      wasFree: boolean;
    }>;
  };

  const builtItems: BuiltItem[] = [];
  let subtotalCents = 0;

  for (const item of input.items) {
    const product = productById.get(item.productId);
    if (!product) {
      throw new AppError(400, 'VALIDATION_ERROR', `Product unavailable: ${item.productId}`);
    }

    const groups = product.modifierGroups.map((link) => ({
      groupId: link.group.id,
      name: link.group.name,
      minSelect: link.minSelectOverride ?? link.group.minSelect,
      maxSelect: link.maxSelectOverride ?? link.group.maxSelect,
      freeQuantity: link.freeQuantityOverride ?? link.group.freeQuantity,
      freeStrategy: link.group.freeStrategy as 'HIGHEST_PRICE_FIRST' | 'SELECTION_ORDER',
      options: link.group.options,
    }));

    const optionById = new Map(
      groups.flatMap((g) =>
        g.options.map((o) => [o.id, { ...o, groupName: g.name, groupId: g.groupId }]),
      ),
    );

    const selectedOptions: SelectedOption[] = [];
    for (const sel of item.options) {
      const option = optionById.get(sel.optionId);
      if (!option || !option.isAvailable) {
        throw new AppError(400, 'VALIDATION_ERROR', `Option unavailable: ${sel.optionId}`);
      }
      selectedOptions.push({
        optionId: option.id,
        groupId: option.groupId,
        name: option.name,
        priceDelta: option.priceDelta,
        quantity: sel.quantity,
      });
    }

    let priced;
    try {
      priced = calculateLinePrice({
        productName: product.name,
        basePriceCents: product.priceCents,
        quantity: item.quantity,
        groups: groups.map((g) => ({
          groupId: g.groupId,
          name: g.name,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          freeQuantity: g.freeQuantity,
          freeStrategy: g.freeStrategy,
        })),
        selectedOptions,
      });
    } catch (error) {
      if (error instanceof PricingError) {
        throw new AppError(400, error.code, error.message, error.details);
      }
      throw error;
    }

    if (priced.lineTotalCents !== item.clientLineTotalCents) {
      throw new AppError(409, 'PRICE_MISMATCH', 'Line total mismatch', {
        expected: priced.lineTotalCents,
        received: item.clientLineTotalCents,
        productId: product.id,
      });
    }

    subtotalCents += priced.lineTotalCents;

    const optionsOut = priced.options.map((opt) => {
      const source = optionById.get(opt.optionId)!;
      return {
        modifierOptionId: opt.optionId,
        groupName: source.groupName,
        optionName: opt.name,
        optionDescription: source.description,
        quantity: opt.quantity,
        unitPriceDeltaCents: opt.chargedUnitCents,
        linePriceDeltaCents: opt.chargedLineCents,
        wasFree: opt.wasFree,
      };
    });

    builtItems.push({
      productId: product.id,
      quantity: item.quantity,
      notes: item.notes ?? null,
      productName: product.name,
      productDescription: product.description,
      unitPriceCents: priced.unitTotalCents,
      lineTotalCents: priced.lineTotalCents,
      options: optionsOut,
    });
  }

  const totalCents = subtotalCents + deliveryFeeCents;
  if (totalCents !== input.clientTotalCents) {
    throw new AppError(409, 'PRICE_MISMATCH', 'Order total mismatch', {
      expected: totalCents,
      received: input.clientTotalCents,
    });
  }

  const paymentLines = resolveOrderPayments({
    totalCents,
    ...(input.payments ? { payments: input.payments } : {}),
    ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
    ...(input.paymentReference !== undefined ? { paymentReference: input.paymentReference } : {}),
  });

  const cogsInput = builtItems.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    options: item.options
      .filter((o) => o.modifierOptionId)
      .map((o) => ({ optionId: o.modifierOptionId!, quantity: o.quantity })),
  }));
  const cogs = await calculateOrderCogs(cogsInput);

  let publicCode = generatePublicCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const exists = await prisma.order.findUnique({ where: { publicCode } });
    if (!exists) break;
    publicCode = generatePublicCode();
  }

  const customer = await prisma.customer.upsert({
    where: { email: input.customerEmail.toLowerCase() },
    update: {
      name: input.customerName,
      phone: input.customerPhone,
    },
    create: {
      email: input.customerEmail.toLowerCase(),
      name: input.customerName,
      phone: input.customerPhone,
    },
  });

  let addressId: string | null = null;
  if (input.fulfillmentType === 'DELIVERY' && input.addressLine1) {
    const address = await prisma.customerAddress.create({
      data: {
        customerId: customer.id,
        line1: input.addressLine1,
        reference: input.addressReference ?? null,
        zoneId: deliveryZoneId,
      },
    });
    addressId = address.id;
  }

  const placedAt = new Date();
  const exchangeRate = await resolveOrderExchangeRate(placedAt);
  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        publicCode,
        status: OrderStatus.RECEIVED,
        channelId: directChannel.id,
        customerId: customer.id,
        addressId,
        fulfillmentType: input.fulfillmentType,
        deliveryZoneId,
        deliveryFeeCents,
        scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
        customerName: input.customerName,
        customerEmail: input.customerEmail.toLowerCase(),
        customerPhone: input.customerPhone,
        notes: input.notes ?? null,
        subtotalCents,
        discountCents: 0,
        taxCents: 0,
        totalCents,
        cogsCents: cogs.orderCogsCents,
        exchangeRateBolivarsPerUsd: exchangeRate,
        placedAt,
        // No commission for DIRECT
        commissionPercentSnapshot: new Prisma.Decimal(0),
        commissionFixedSnapshot: 0,
        commissionBaseSnapshot: FeeBase.SUBTOTAL,
        commissionBaseAmountCents: subtotalCents,
        commissionAmountCents: 0,
        netPayoutExpectedCents: totalCents,
        items: {
          create: builtItems.map((item, index) => {
            const itemCogs = cogs.itemCogs[index];
            const optionCogsById = new Map(
              (itemCogs?.optionCogs ?? []).map((row) => [row.optionId, row]),
            );
            return {
              productId: item.productId,
              quantity: item.quantity,
              notes: item.notes,
              productName: item.productName,
              productDescription: item.productDescription,
              unitPriceCents: item.unitPriceCents,
              lineTotalCents: item.lineTotalCents,
              unitCogsCents: itemCogs?.unitCogsCents ?? 0,
              lineCogsCents: itemCogs?.lineCogsCents ?? 0,
              options: {
                create: item.options.map((opt) => {
                  const oc = opt.modifierOptionId
                    ? optionCogsById.get(opt.modifierOptionId)
                    : undefined;
                  return {
                    ...opt,
                    unitCogsCents: oc?.unitCogsCents ?? 0,
                    lineCogsCents: oc?.lineCogsCents ?? 0,
                  };
                }),
              },
            };
          }),
        },
        statusEvents: {
          create: {
            fromStatus: null,
            toStatus: OrderStatus.RECEIVED,
            note: 'Pedido recibido desde la web',
          },
        },
        payments: {
          create: paymentCreateData(paymentLines, PaymentStatus.PENDING),
        },
      },
      include: {
        items: { include: { options: true } },
        statusEvents: { orderBy: { createdAt: 'asc' } },
        deliveryZone: { select: { name: true, estimatedMinutes: true } },
        payments: true,
      },
    });
    await consumeRecipeStock(tx, cogsInput);
    return created;
  });

  const guest = await createGuestSession({
    customerId: customer.id,
    orderId: order.id,
  });

  orderEvents.publish(order.publicCode, { type: 'status', status: order.status });

  return {
    order: toPublicOrder(order),
    sessionToken: guest.sessionToken,
    expiresAt: guest.expiresAt,
  };
}

export async function getPublicOrderByCode(publicCode: string) {
  const order = await prisma.order.findFirst({
    where: { publicCode, deletedAt: null },
    include: {
      items: { include: { options: true }, orderBy: { createdAt: 'asc' } },
      statusEvents: { orderBy: { createdAt: 'asc' } },
      deliveryZone: { select: { name: true, estimatedMinutes: true } },
      payments: true,
    },
  });
  if (!order) return null;
  return toPublicOrder(order);
}
