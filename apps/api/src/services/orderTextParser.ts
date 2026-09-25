import { FulfillmentType, PaymentMethod } from '@prisma/client';
import { z } from 'zod';
import { resolveChannelPriceCents } from '@cerotres/shared';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { previewAdminOrderPricing } from './ordersAdmin.js';

const claudeResponseSchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().optional(),
  customerEmail: z.string().email().optional(),
  fulfillmentType: z.enum(['PICKUP', 'DELIVERY']),
  deliveryZoneName: z.string().optional(),
  addressLine1: z.string().optional(),
  externalOrderRef: z.string().optional(),
  notes: z.string().optional(),
  payments: z
    .array(
      z.object({
        method: z.string(),
        sharePercent: z.number().min(0).max(100).optional(),
        reference: z.string().optional(),
      }),
    )
    .optional(),
  items: z
    .array(
      z.object({
        productName: z.string().min(1),
        quantity: z.number().int().positive(),
        optionNames: z.array(z.string()).default([]),
        notes: z.string().optional(),
      }),
    )
    .min(1),
  parseNotes: z.array(z.string()).optional(),
});

export type TextOrderPreviewItem = {
  productId: string;
  productName: string;
  quantity: number;
  lineTotalCents: number;
  options: Array<{ optionId: string; name: string; quantity: number }>;
  notes: string | null;
};

export type TextOrderPreview = {
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  fulfillmentType: FulfillmentType;
  deliveryZoneId: string | null;
  deliveryZoneName: string | null;
  addressLine1: string | null;
  externalOrderRef: string | null;
  notes: string | null;
  channelId: string;
  payments: Array<{ method: PaymentMethod; amountCents: number; reference: string | null }>;
  items: TextOrderPreviewItem[];
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  warnings: string[];
};

type CatalogProduct = {
  id: string;
  name: string;
  priceCents: number;
  modifierGroups: Array<{
    id: string;
    name: string;
    minSelect: number;
    options: Array<{ id: string; name: string; priceDelta: number }>;
  }>;
};

function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchByName<T extends { name: string }>(label: string, candidates: T[]): T | null {
  const norm = normalizeLabel(label);
  if (!norm) return null;
  const exact = candidates.find((c) => normalizeLabel(c.name) === norm);
  if (exact) return exact;
  const contains = candidates.find((c) => {
    const cn = normalizeLabel(c.name);
    return cn.includes(norm) || norm.includes(cn);
  });
  return contains ?? null;
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced?.[1]?.trim() ?? trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new AppError(502, 'AI_PARSE_ERROR', 'Model did not return JSON');
  }
  return JSON.parse(body.slice(start, end + 1)) as unknown;
}

async function loadCatalog(channelId: string): Promise<{
  products: CatalogProduct[];
  channelPrices: Map<string, number>;
  channels: Array<{ id: string; code: string; name: string }>;
  zones: Array<{ id: string; name: string; feeCents: number }>;
  paymentMethods: PaymentMethod[];
}> {
  const [categories, channels, zones, channelPricesRows] = await Promise.all([
    prisma.category.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        products: {
          where: { deletedAt: null, isActive: true, isAvailable: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            modifierGroups: {
              include: {
                group: {
                  include: {
                    options: { where: { deletedAt: null, isAvailable: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.salesChannel.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
    }),
    prisma.deliveryZone.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true, feeCents: true },
    }),
    prisma.productChannelPrice.findMany({
      where: { channelId },
      select: { productId: true, priceCents: true },
    }),
  ]);

  const products: CatalogProduct[] = [];
  for (const category of categories) {
    for (const product of category.products) {
      products.push({
        id: product.id,
        name: product.name,
        priceCents: product.priceCents,
        modifierGroups: product.modifierGroups.map((link) => ({
          id: link.group.id,
          name: link.group.name,
          minSelect: link.minSelectOverride ?? link.group.minSelect,
          options: link.group.options.map((o) => ({
            id: o.id,
            name: o.name,
            priceDelta: o.priceDelta,
          })),
        })),
      });
    }
  }

  return {
    products,
    channelPrices: new Map(channelPricesRows.map((r) => [r.productId, r.priceCents])),
    channels,
    zones,
    paymentMethods: Object.values(PaymentMethod),
  };
}

function buildCatalogPrompt(products: CatalogProduct[], channelPrices: Map<string, number>) {
  return products.map((product) => ({
    name: product.name,
    priceCents: resolveChannelPriceCents(product.priceCents, channelPrices.get(product.id)),
    modifierGroups: product.modifierGroups.map((g) => ({
      name: g.name,
      minSelect: g.minSelect,
      options: g.options.map((o) => ({ name: o.name, priceDeltaCents: o.priceDelta })),
    })),
  }));
}

async function callClaude(input: {
  text: string;
  catalog: ReturnType<typeof buildCatalogPrompt>;
  channels: Array<{ code: string; name: string }>;
  zones: Array<{ name: string; feeCents: number }>;
  paymentMethods: string[];
  defaultChannelCode: string;
}): Promise<z.infer<typeof claudeResponseSchema>> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new AppError(
      503,
      'AI_NOT_CONFIGURED',
      'Pedido por texto no está configurado (falta ANTHROPIC_API_KEY en el servidor)',
    );
  }

  const system = `You parse Spanish restaurant orders into JSON for a dark kitchen admin system.
Rules:
- Output ONLY valid JSON matching the schema described. No markdown outside JSON.
- Use exact product and option names from the catalog when possible.
- Do NOT invent products or options not in the catalog.
- Do NOT compute prices or totals — only quantities and names.
- fulfillmentType: PICKUP or DELIVERY.
- payment method must be one of: ${input.paymentMethods.join(', ')}.
- If payment split is described, use sharePercent on each payment (must sum to 100).
- Default customerName to "Mostrador" if not specified.
- channel is fixed to ${input.defaultChannelCode}; ignore other channels unless text says delivery app order (then set externalOrderRef if mentioned).
- parseNotes: list ambiguities or assumptions in Spanish.`;

  const user = JSON.stringify(
    {
      orderText: input.text,
      catalog: input.catalog,
      deliveryZones: input.zones,
      paymentMethods: input.paymentMethods,
      schema: {
        customerName: 'string',
        customerPhone: 'string?',
        customerEmail: 'string?',
        fulfillmentType: 'PICKUP | DELIVERY',
        deliveryZoneName: 'string?',
        addressLine1: 'string?',
        externalOrderRef: 'string?',
        notes: 'string?',
        payments: [{ method: 'string', sharePercent: 'number?', reference: 'string?' }],
        items: [
          { productName: 'string', quantity: 'number', optionNames: ['string'], notes: 'string?' },
        ],
        parseNotes: ['string'],
      },
    },
    null,
    2,
  );

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new AppError(502, 'AI_REQUEST_FAILED', 'Anthropic API error', {
      status: response.status,
      detail: detail.slice(0, 500),
    });
  }

  const payload = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const textBlock = payload.content?.find((block) => block.type === 'text');
  if (!textBlock?.text) {
    throw new AppError(502, 'AI_PARSE_ERROR', 'Empty response from model');
  }

  const parsed = claudeResponseSchema.safeParse(extractJsonObject(textBlock.text));
  if (!parsed.success) {
    throw new AppError(
      502,
      'AI_PARSE_ERROR',
      'Model JSON did not match schema',
      parsed.error.flatten(),
    );
  }
  return parsed.data;
}

function resolvePaymentMethod(raw: string, allowed: PaymentMethod[]): PaymentMethod | null {
  const norm = normalizeLabel(raw).replace(/\s+/g, '_');
  const hit = allowed.find(
    (m) => normalizeLabel(m) === normalizeLabel(raw) || m === raw.toUpperCase(),
  );
  if (hit) return hit;
  if (norm.includes('efectivo') || norm.includes('cash')) return PaymentMethod.CASH;
  if (norm.includes('pago') && norm.includes('movil')) return PaymentMethod.PAGO_MOVIL;
  if (norm.includes('zelle')) return PaymentMethod.ZELLE;
  if (norm.includes('transfer')) return PaymentMethod.TRANSFER;
  return null;
}

export async function parseTextOrder(input: {
  text: string;
  channelId: string;
}): Promise<TextOrderPreview> {
  const trimmed = input.text.trim();
  if (trimmed.length < 8) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Describe el pedido con más detalle');
  }

  const catalog = await loadCatalog(input.channelId);
  const channel = catalog.channels.find((c) => c.id === input.channelId);
  if (!channel) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid channel');

  const claude = await callClaude({
    text: trimmed,
    catalog: buildCatalogPrompt(catalog.products, catalog.channelPrices),
    channels: catalog.channels,
    zones: catalog.zones,
    paymentMethods: catalog.paymentMethods,
    defaultChannelCode: channel.code,
  });

  const warnings = [...(claude.parseNotes ?? [])];
  const pricedItemsInput: Array<{
    productId: string;
    quantity: number;
    notes?: string;
    options: Array<{ optionId: string; quantity: number }>;
  }> = [];

  for (const item of claude.items) {
    const product = matchByName(item.productName, catalog.products);
    if (!product) {
      warnings.push(`Producto no encontrado: "${item.productName}"`);
      continue;
    }

    const allOptions = product.modifierGroups.flatMap((g) => g.options);
    const resolvedOptions: Array<{ optionId: string; quantity: number }> = [];
    for (const optionName of item.optionNames) {
      const option = matchByName(optionName, allOptions);
      if (!option) {
        warnings.push(`Extra/opción no encontrada en ${product.name}: "${optionName}"`);
        continue;
      }
      const existing = resolvedOptions.find((o) => o.optionId === option.id);
      if (existing) existing.quantity += 1;
      else resolvedOptions.push({ optionId: option.id, quantity: 1 });
    }

    pricedItemsInput.push({
      productId: product.id,
      quantity: item.quantity,
      ...(item.notes ? { notes: item.notes } : {}),
      options: resolvedOptions,
    });
  }

  if (pricedItemsInput.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'No se pudo mapear ningún producto del catálogo', {
      warnings,
    });
  }

  const { builtItems, subtotalCents } = await previewAdminOrderPricing(
    input.channelId,
    pricedItemsInput,
  );

  let deliveryZoneId: string | null = null;
  let deliveryZoneName: string | null = null;
  let deliveryFeeCents = 0;
  const fulfillmentType =
    claude.fulfillmentType === 'DELIVERY' ? FulfillmentType.DELIVERY : FulfillmentType.PICKUP;

  if (fulfillmentType === FulfillmentType.DELIVERY) {
    if (claude.deliveryZoneName) {
      const zone = matchByName(claude.deliveryZoneName, catalog.zones);
      if (zone) {
        deliveryZoneId = zone.id;
        deliveryZoneName = zone.name;
        deliveryFeeCents = zone.feeCents;
      } else {
        warnings.push(`Zona no encontrada: "${claude.deliveryZoneName}"`);
      }
    } else if (catalog.zones.length === 1) {
      deliveryZoneId = catalog.zones[0]!.id;
      deliveryZoneName = catalog.zones[0]!.name;
      deliveryFeeCents = catalog.zones[0]!.feeCents;
    } else {
      warnings.push('Delivery sin zona — selecciona zona antes de confirmar');
    }
    if (!claude.addressLine1?.trim()) {
      warnings.push('Delivery sin dirección — complétala antes de confirmar');
    }
  }

  const totalCents = subtotalCents + deliveryFeeCents;
  const payments: TextOrderPreview['payments'] = [];

  if (claude.payments?.length) {
    type ResolvedPay = {
      method: PaymentMethod | null;
      sharePercent: number;
      reference: string | null;
    };
    const resolved: ResolvedPay[] = claude.payments.map((p) => {
      const method = resolvePaymentMethod(p.method, catalog.paymentMethods);
      if (!method) warnings.push(`Método de pago desconocido: "${p.method}"`);
      return {
        method,
        sharePercent: p.sharePercent ?? 0,
        reference: p.reference?.trim() ?? null,
      };
    });
    const withMethod = resolved.filter(
      (p): p is { method: PaymentMethod; sharePercent: number; reference: string | null } =>
        p.method !== null,
    );
    const totalShare = withMethod.reduce((s, p) => s + (p.sharePercent || 0), 0);
    if (totalShare > 0 && Math.abs(totalShare - 100) > 0.01) {
      warnings.push('Porcentajes de pago no suman 100% — revisa montos al confirmar');
    }
    let assigned = 0;
    for (let i = 0; i < withMethod.length; i += 1) {
      const row = withMethod[i]!;
      if (!row.method) continue;
      const isLast = i === withMethod.length - 1;
      const amountCents =
        isLast && totalShare > 0
          ? totalCents - assigned
          : Math.round((totalCents * (row.sharePercent || 100 / withMethod.length)) / 100);
      assigned += amountCents;
      payments.push({
        method: row.method,
        amountCents,
        reference: row.reference,
      });
    }
  }

  if (payments.length === 0) {
    payments.push({ method: PaymentMethod.CASH, amountCents: totalCents, reference: null });
  } else {
    const paySum = payments.reduce((s, p) => s + p.amountCents, 0);
    if (paySum !== totalCents) {
      payments[payments.length - 1]!.amountCents += totalCents - paySum;
    }
  }

  const previewItems: TextOrderPreviewItem[] = builtItems.map((item, index) => {
    const source = pricedItemsInput[index]!;
    return {
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      lineTotalCents: item.lineTotalCents,
      options: source.options.map((o) => {
        const opt = item.options.find((x) => x.modifierOptionId === o.optionId);
        return { optionId: o.optionId, name: opt?.optionName ?? o.optionId, quantity: o.quantity };
      }),
      notes: item.notes,
    };
  });

  return {
    customerName: claude.customerName.trim() || 'Mostrador',
    customerPhone: claude.customerPhone?.trim() ?? null,
    customerEmail: claude.customerEmail?.trim() ?? null,
    fulfillmentType,
    deliveryZoneId,
    deliveryZoneName,
    addressLine1: claude.addressLine1?.trim() ?? null,
    externalOrderRef: claude.externalOrderRef?.trim() ?? null,
    notes: claude.notes?.trim() ?? null,
    channelId: input.channelId,
    payments,
    items: previewItems,
    subtotalCents,
    deliveryFeeCents,
    totalCents,
    warnings,
  };
}
