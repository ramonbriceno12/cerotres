import {
  FulfillmentType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  type AdminRole,
} from '@prisma/client';
import {
  calculateLinePrice,
  PricingError,
  resolveChannelPriceCents,
  type SelectedOption,
} from '@cerotres/shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { writeAuditLog } from '../lib/audit.js';
import { orderEvents } from '../lib/orderEvents.js';
import { resolveCommissionSnapshot } from './commission.js';
import { generatePublicCode } from './orders.js';
import {
  assertTransition,
  getAllowedTransitions,
  getNextStatus,
  InvalidTransitionError,
} from './orderStatusMachine.js';
import { calculateOrderCogs, consumeRecipeStock } from './cogs.js';
import { resolveOrderExchangeRate, usdCentsToBolivarsCents } from './exchangeRate.js';
import { paymentCreateData, resolveOrderPayments } from './orderPayments.js';
import { loadChannelPriceOverrideMap } from './channelPrices.js';

const OPEN_KDS_STATUSES: OrderStatus[] = [
  OrderStatus.RECEIVED,
  OrderStatus.CONFIRMED,
  OrderStatus.IN_PREPARATION,
  OrderStatus.READY,
  OrderStatus.ON_THE_WAY,
];

export type AdminOrderListQuery = {
  page: number;
  pageSize: number;
  status?: OrderStatus;
  channelId?: string;
  fulfillmentType?: FulfillmentType;
  q?: string;
  from?: Date;
  to?: Date;
};

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

async function buildPricedItems(
  items: Array<{
    productId: string;
    quantity: number;
    notes?: string | undefined;
    options: Array<{ optionId: string; quantity: number }>;
    clientLineTotalCents?: number | undefined;
  }>,
  channelId: string,
): Promise<{ builtItems: BuiltItem[]; subtotalCents: number }> {
  const productIds = items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, deletedAt: null, isActive: true },
    include: {
      modifierGroups: {
        include: {
          group: {
            include: { options: { where: { deletedAt: null } } },
          },
        },
      },
    },
  });
  const productById = new Map(products.map((p) => [p.id, p]));
  const channelPriceByProductId = await loadChannelPriceOverrideMap(productIds, channelId);

  const builtItems: BuiltItem[] = [];
  let subtotalCents = 0;

  for (const item of items) {
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
        basePriceCents: resolveChannelPriceCents(
          product.priceCents,
          channelPriceByProductId.get(product.id),
        ),
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

    if (
      item.clientLineTotalCents !== undefined &&
      priced.lineTotalCents !== item.clientLineTotalCents
    ) {
      throw new AppError(409, 'PRICE_MISMATCH', 'Line total mismatch', {
        expected: priced.lineTotalCents,
        received: item.clientLineTotalCents,
        productId: product.id,
      });
    }

    subtotalCents += priced.lineTotalCents;
    builtItems.push({
      productId: product.id,
      quantity: item.quantity,
      notes: item.notes ?? null,
      productName: product.name,
      productDescription: product.description,
      unitPriceCents: priced.unitTotalCents,
      lineTotalCents: priced.lineTotalCents,
      options: priced.options.map((opt) => {
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
      }),
    });
  }

  return { builtItems, subtotalCents };
}

function adminOrderInclude() {
  return {
    channel: true,
    deliveryZone: true,
    items: { include: { options: true }, orderBy: { createdAt: 'asc' as const } },
    statusEvents: {
      include: { actorAdmin: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' as const },
    },
    payments: true,
    customer: { select: { id: true, name: true, email: true, phone: true } },
  };
}

export function serializeAdminOrder(
  order: Prisma.OrderGetPayload<{ include: ReturnType<typeof adminOrderInclude> }>,
) {
  return {
    id: order.id,
    publicCode: order.publicCode,
    status: order.status,
    fulfillmentType: order.fulfillmentType,
    channel: {
      id: order.channel.id,
      code: order.channel.code,
      name: order.channel.name,
      colorHex: order.channel.colorHex,
      requiresExternalRef: order.channel.requiresExternalRef,
    },
    externalOrderRef: order.externalOrderRef,
    customer: order.customer,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    notes: order.notes,
    cancelReason: order.cancelReason,
    deliveryZone: order.deliveryZone
      ? {
          id: order.deliveryZone.id,
          name: order.deliveryZone.name,
          feeCents: order.deliveryZone.feeCents,
          estimatedMinutes: order.deliveryZone.estimatedMinutes,
        }
      : null,
    deliveryFeeCents: order.deliveryFeeCents,
    scheduledFor: order.scheduledFor,
    placedAt: order.placedAt,
    createdAt: order.createdAt,
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    taxCents: order.taxCents,
    totalCents: order.totalCents,
    cogsCents: order.cogsCents,
    exchangeRateBolivarsPerUsd: order.exchangeRateBolivarsPerUsd
      ? Number(order.exchangeRateBolivarsPerUsd.toString())
      : null,
    totalBolivarsCents: order.exchangeRateBolivarsPerUsd
      ? usdCentsToBolivarsCents(
          order.totalCents,
          Number(order.exchangeRateBolivarsPerUsd.toString()),
        )
      : null,
    commissionPercentSnapshot: order.commissionPercentSnapshot
      ? Number(order.commissionPercentSnapshot.toString())
      : null,
    commissionAmountCents: order.commissionAmountCents,
    netPayoutExpectedCents: order.netPayoutExpectedCents,
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      productDescription: item.productDescription,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents,
      unitCogsCents: item.unitCogsCents,
      lineCogsCents: item.lineCogsCents,
      notes: item.notes,
      options: item.options.map((opt) => ({
        groupName: opt.groupName,
        optionName: opt.optionName,
        quantity: opt.quantity,
        unitPriceDeltaCents: opt.unitPriceDeltaCents,
        linePriceDeltaCents: opt.linePriceDeltaCents,
        wasFree: opt.wasFree,
        unitCogsCents: opt.unitCogsCents,
        lineCogsCents: opt.lineCogsCents,
      })),
    })),
    statusEvents: order.statusEvents.map((ev) => ({
      id: ev.id,
      fromStatus: ev.fromStatus,
      toStatus: ev.toStatus,
      note: ev.note,
      createdAt: ev.createdAt,
      actor: ev.actorAdmin
        ? { id: ev.actorAdmin.id, name: ev.actorAdmin.name, email: ev.actorAdmin.email }
        : null,
    })),
    payments: order.payments.map((p) => ({
      id: p.id,
      method: p.method,
      status: p.status,
      amountCents: p.amountCents,
      reference: p.reference,
      createdAt: p.createdAt,
    })),
    allowedTransitions: getAllowedTransitions(order.status, order.fulfillmentType),
    nextStatus: getNextStatus(order.status, order.fulfillmentType),
  };
}

export async function listAdminOrders(query: AdminOrderListQuery) {
  const where: Prisma.OrderWhereInput = { deletedAt: null };
  if (query.status) where.status = query.status;
  if (query.channelId) where.channelId = query.channelId;
  if (query.fulfillmentType) where.fulfillmentType = query.fulfillmentType;
  if (query.from || query.to) {
    where.placedAt = {};
    if (query.from) where.placedAt.gte = query.from;
    if (query.to) where.placedAt.lte = query.to;
  }
  if (query.q?.trim()) {
    const q = query.q.trim();
    where.OR = [
      { publicCode: { contains: q, mode: 'insensitive' } },
      { customerName: { contains: q, mode: 'insensitive' } },
      { customerEmail: { contains: q, mode: 'insensitive' } },
      { customerPhone: { contains: q, mode: 'insensitive' } },
      { externalOrderRef: { contains: q, mode: 'insensitive' } },
    ];
  }

  const skip = (query.page - 1) * query.pageSize;
  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: [{ placedAt: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: query.pageSize,
      include: {
        channel: true,
        deliveryZone: { select: { name: true } },
        payments: { take: 1, orderBy: { createdAt: 'desc' } },
      },
    }),
  ]);

  return {
    total,
    page: query.page,
    pageSize: query.pageSize,
    orders: rows.map((order) => ({
      id: order.id,
      publicCode: order.publicCode,
      status: order.status,
      fulfillmentType: order.fulfillmentType,
      channel: {
        id: order.channel.id,
        code: order.channel.code,
        name: order.channel.name,
        colorHex: order.channel.colorHex,
      },
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      externalOrderRef: order.externalOrderRef,
      totalCents: order.totalCents,
      placedAt: order.placedAt,
      deliveryZoneName: order.deliveryZone?.name ?? null,
      paymentStatus: order.payments[0]?.status ?? null,
    })),
  };
}

export async function getAdminOrder(idOrCode: string) {
  const order = await prisma.order.findFirst({
    where: {
      deletedAt: null,
      OR: [{ id: idOrCode }, { publicCode: idOrCode }],
    },
    include: adminOrderInclude(),
  });
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found');
  return serializeAdminOrder(order);
}

export async function transitionOrderStatus(input: {
  orderId: string;
  toStatus: OrderStatus;
  cancelReason?: string | null | undefined;
  note?: string | null | undefined;
  actorId: string;
  ip?: string | null | undefined;
  userAgent?: string | null | undefined;
}) {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, deletedAt: null },
  });
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found');

  try {
    assertTransition({
      from: order.status,
      to: input.toStatus,
      fulfillmentType: order.fulfillmentType,
      cancelReason: input.cancelReason,
    });
  } catch (error) {
    if (error instanceof InvalidTransitionError) {
      throw new AppError(409, error.code, error.message);
    }
    throw error;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.order.update({
      where: { id: order.id },
      data: {
        status: input.toStatus,
        cancelReason:
          input.toStatus === OrderStatus.CANCELLED
            ? (input.cancelReason ?? '').trim()
            : order.cancelReason,
      },
      include: adminOrderInclude(),
    });

    await tx.orderStatusEvent.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: input.toStatus,
        note:
          input.toStatus === OrderStatus.CANCELLED
            ? (input.cancelReason ?? '').trim()
            : (input.note ?? null),
        actorAdminId: input.actorId,
      },
    });

    return tx.order.findUniqueOrThrow({
      where: { id: order.id },
      include: adminOrderInclude(),
    });
  });

  await writeAuditLog({
    actorId: input.actorId,
    action: 'ORDER_STATUS_CHANGE',
    entityType: 'Order',
    entityId: order.id,
    before: { status: order.status },
    after: { status: input.toStatus, cancelReason: input.cancelReason ?? null },
    ip: input.ip,
    userAgent: input.userAgent,
  });

  orderEvents.publish(updated.publicCode, {
    type: 'status',
    status: updated.status,
    orderId: updated.id,
  });

  return serializeAdminOrder(updated);
}

export async function listKitchenBoard() {
  const orders = await prisma.order.findMany({
    where: { deletedAt: null, status: { in: OPEN_KDS_STATUSES } },
    orderBy: [{ placedAt: 'asc' }, { createdAt: 'asc' }],
    include: adminOrderInclude(),
  });
  return orders.map(serializeAdminOrder);
}

export type CreateAdminOrderInput = {
  channelId: string;
  externalOrderRef?: string | undefined;
  customerName: string;
  customerEmail?: string | undefined;
  customerPhone?: string | undefined;
  fulfillmentType: FulfillmentType;
  deliveryZoneId?: string | undefined;
  addressLine1?: string | undefined;
  addressReference?: string | undefined;
  notes?: string | undefined;
  placedAt?: string | undefined;
  paymentMethod?: PaymentMethod | undefined;
  paymentReference?: string | undefined;
  payments?:
    | Array<{
        method: PaymentMethod;
        amountCents: number;
        reference?: string | null | undefined;
      }>
    | undefined;
  /** When true, all payment lines are stored as CONFIRMED. */
  paymentsConfirmed?: boolean | undefined;
  clientTotalCents: number;
  items: Array<{
    productId: string;
    quantity: number;
    notes?: string | undefined;
    options: Array<{ optionId: string; quantity: number }>;
    clientLineTotalCents: number;
  }>;
  actorId: string;
  ip?: string | null | undefined;
  userAgent?: string | null | undefined;
};

export async function createAdminOrder(input: CreateAdminOrderInput) {
  const channel = await prisma.salesChannel.findFirst({
    where: { id: input.channelId, isActive: true },
  });
  if (!channel) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid channel');
  if (channel.requiresExternalRef && !input.externalOrderRef?.trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'External reference required for this channel');
  }

  let deliveryFeeCents = 0;
  let deliveryZoneId: string | null = null;
  if (input.fulfillmentType === FulfillmentType.DELIVERY) {
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

  const { builtItems, subtotalCents } = await buildPricedItems(input.items, channel.id);
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
  const paymentStatus = input.paymentsConfirmed ? PaymentStatus.CONFIRMED : PaymentStatus.PENDING;

  const placedAt = input.placedAt ? new Date(input.placedAt) : new Date();
  if (Number.isNaN(placedAt.getTime())) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid placedAt');
  }

  const commission = await resolveCommissionSnapshot({
    channelId: channel.id,
    placedAt,
    subtotalCents,
    deliveryFeeCents,
    totalCents,
  });

  const cogsInput = builtItems.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    options: item.options
      .filter((o) => o.modifierOptionId)
      .map((o) => ({ optionId: o.modifierOptionId!, quantity: o.quantity })),
  }));
  const cogs = await calculateOrderCogs(cogsInput);
  const exchangeRate = await resolveOrderExchangeRate(placedAt);

  let publicCode = generatePublicCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const exists = await prisma.order.findUnique({ where: { publicCode } });
    if (!exists) break;
    publicCode = generatePublicCode();
  }

  let customerId: string | null = null;
  if (input.customerEmail) {
    const customer = await prisma.customer.upsert({
      where: { email: input.customerEmail.toLowerCase() },
      update: {
        name: input.customerName,
        ...(input.customerPhone ? { phone: input.customerPhone } : {}),
      },
      create: {
        email: input.customerEmail.toLowerCase(),
        name: input.customerName,
        phone: input.customerPhone ?? null,
      },
    });
    customerId = customer.id;
  } else if (input.fulfillmentType === FulfillmentType.DELIVERY) {
    const customer = await prisma.customer.create({
      data: {
        name: input.customerName,
        phone: input.customerPhone ?? null,
      },
    });
    customerId = customer.id;
  }

  let addressId: string | null = null;
  if (input.fulfillmentType === FulfillmentType.DELIVERY && input.addressLine1 && customerId) {
    const address = await prisma.customerAddress.create({
      data: {
        customerId,
        line1: input.addressLine1,
        reference: input.addressReference ?? null,
        zoneId: deliveryZoneId,
      },
    });
    addressId = address.id;
  }

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        publicCode,
        status: OrderStatus.RECEIVED,
        channelId: channel.id,
        customerId,
        addressId,
        fulfillmentType: input.fulfillmentType,
        deliveryZoneId,
        deliveryFeeCents,
        customerName: input.customerName,
        customerEmail: input.customerEmail?.toLowerCase() ?? null,
        customerPhone: input.customerPhone ?? null,
        notes: input.notes ?? null,
        externalOrderRef: input.externalOrderRef?.trim() || null,
        subtotalCents,
        discountCents: 0,
        taxCents: 0,
        totalCents,
        placedAt,
        channelFeeRateId: commission.channelFeeRateId,
        commissionPercentSnapshot: commission.percent,
        commissionFixedSnapshot: commission.fixedFeeCents,
        commissionBaseSnapshot: commission.appliesTo,
        commissionBaseAmountCents: commission.baseAmountCents,
        commissionAmountCents: commission.commissionAmountCents,
        netPayoutExpectedCents: commission.netPayoutExpectedCents,
        cogsCents: cogs.orderCogsCents,
        exchangeRateBolivarsPerUsd: exchangeRate,
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
            note: 'Pedido recibido',
            actorAdminId: input.actorId,
          },
        },
        payments: {
          create: paymentCreateData(paymentLines, paymentStatus).map((row) => ({
            ...row,
            ...(paymentStatus === PaymentStatus.CONFIRMED
              ? { confirmedByAdminId: input.actorId }
              : {}),
            ...(exchangeRate
              ? {
                  exchangeRateBolivarsPerUsd: exchangeRate,
                  amountBolivarsCents: usdCentsToBolivarsCents(
                    row.amountCents,
                    Number(exchangeRate.toString()),
                  ),
                }
              : {}),
          })),
        },
      },
      include: adminOrderInclude(),
    });
    await consumeRecipeStock(tx, cogsInput);
    return created;
  });

  await writeAuditLog({
    actorId: input.actorId,
    action: 'ORDER_CREATE_MANUAL',
    entityType: 'Order',
    entityId: order.id,
    after: {
      publicCode: order.publicCode,
      channelId: channel.id,
      placedAt,
      commissionAmountCents: commission.commissionAmountCents,
    },
    ip: input.ip,
    userAgent: input.userAgent,
  });

  orderEvents.publish(order.publicCode, {
    type: 'created',
    status: order.status,
    orderId: order.id,
  });

  return {
    order: serializeAdminOrder(order),
    commissionPreview: {
      percent: Number(commission.percent.toString()),
      commissionAmountCents: commission.commissionAmountCents,
      netPayoutExpectedCents: commission.netPayoutExpectedCents,
      effectiveFrom: commission.effectiveFrom,
      rateNote: commission.rateNote,
    },
  };
}

export function ordersToCsv(
  rows: Array<{
    publicCode: string;
    status: string;
    channelName: string;
    fulfillmentType: string;
    customerName: string;
    totalCents: number;
    placedAt: Date | null;
    externalOrderRef: string | null;
  }>,
) {
  const header = [
    'publicCode',
    'status',
    'channel',
    'fulfillment',
    'customer',
    'totalCents',
    'placedAt',
    'externalOrderRef',
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    const cells = [
      row.publicCode,
      row.status,
      row.channelName,
      row.fulfillmentType,
      row.customerName,
      String(row.totalCents),
      row.placedAt?.toISOString() ?? '',
      row.externalOrderRef ?? '',
    ].map((cell) => `"${cell.replaceAll('"', '""')}"`);
    lines.push(cells.join(','));
  }
  return `${lines.join('\n')}\n`;
}

export async function exportAdminOrdersCsv(query: Omit<AdminOrderListQuery, 'page' | 'pageSize'>) {
  const list = await listAdminOrders({ ...query, page: 1, pageSize: 5000 });
  return ordersToCsv(
    list.orders.map((o) => ({
      publicCode: o.publicCode,
      status: o.status,
      channelName: o.channel.name,
      fulfillmentType: o.fulfillmentType,
      customerName: o.customerName,
      totalCents: o.totalCents,
      placedAt: o.placedAt,
      externalOrderRef: o.externalOrderRef,
    })),
  );
}

export function canManageOrders(role: AdminRole) {
  return role === 'OWNER' || role === 'MANAGER' || role === 'CASHIER' || role === 'KITCHEN';
}

export async function previewAdminOrderPricing(
  channelId: string,
  items: Array<{
    productId: string;
    quantity: number;
    notes?: string | undefined;
    options: Array<{ optionId: string; quantity: number }>;
  }>,
) {
  return buildPricedItems(items, channelId);
}
