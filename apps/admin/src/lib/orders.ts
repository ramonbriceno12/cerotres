export function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Bolívar céntimos (same scale as USD cents) → display. */
export function formatBolivars(bolivarsCents: number) {
  return `Bs. ${(bolivarsCents / 100).toFixed(2)}`;
}

export function formatMoneyDual(usdCents: number, bolivarsPerUsd: number | null | undefined) {
  const usd = formatMoney(usdCents);
  if (bolivarsPerUsd == null || !(bolivarsPerUsd > 0)) return usd;
  const bs = Math.round(usdCents * bolivarsPerUsd);
  return `${usd} · ${formatBolivars(bs)}`;
}

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  RECEIVED: 'Recibido',
  CONFIRMED: 'Confirmado',
  IN_PREPARATION: 'En preparación',
  READY: 'Listo',
  ON_THE_WAY: 'En camino',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
};

export type AdminOrderListItem = {
  id: string;
  publicCode: string;
  status: string;
  fulfillmentType: string;
  channel: { id: string; code: string; name: string; colorHex: string | null };
  customerName: string;
  customerPhone: string | null;
  externalOrderRef: string | null;
  totalCents: number;
  placedAt: string | null;
  deliveryZoneName: string | null;
  paymentStatus: string | null;
};

export type AdminOrderDetail = {
  id: string;
  publicCode: string;
  status: string;
  fulfillmentType: string;
  channel: {
    id: string;
    code: string;
    name: string;
    colorHex: string | null;
    requiresExternalRef: boolean;
  };
  externalOrderRef: string | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  notes: string | null;
  cancelReason: string | null;
  deliveryZone: {
    id: string;
    name: string;
    feeCents: number;
    estimatedMinutes: number | null;
  } | null;
  deliveryFeeCents: number;
  scheduledFor: string | null;
  placedAt: string | null;
  createdAt: string;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  cogsCents: number;
  exchangeRateBolivarsPerUsd?: number | null;
  totalBolivarsCents?: number | null;
  commissionPercentSnapshot: number | null;
  commissionAmountCents: number | null;
  netPayoutExpectedCents: number | null;
  items: Array<{
    id: string;
    productName: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
    lineCogsCents?: number;
    notes: string | null;
    options: Array<{
      groupName: string;
      optionName: string;
      quantity: number;
      linePriceDeltaCents: number;
      wasFree: boolean;
    }>;
  }>;
  statusEvents: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    note: string | null;
    createdAt: string;
    actor: { id: string; name: string; email: string } | null;
  }>;
  payments: Array<{
    id: string;
    method: string;
    status: string;
    amountCents: number;
    reference: string | null;
    createdAt: string;
  }>;
  allowedTransitions: string[];
  nextStatus: string | null;
};
