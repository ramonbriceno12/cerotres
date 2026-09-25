const LAST_ORDER_KEY = 'cerotres.lastOrder.v1';

type LastOrder = {
  publicCode: string;
  savedAt: number;
};

/** Persist last tracked/created order for at least 24h (client-side fallback). */
const MIN_TTL_MS = 24 * 60 * 60 * 1000;

export function saveLastOrderCode(publicCode: string) {
  const payload: LastOrder = { publicCode, savedAt: Date.now() };
  try {
    localStorage.setItem(LAST_ORDER_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

export function readLastOrderCode(
  maxAgeMs = Math.max(MIN_TTL_MS, 30 * 24 * 60 * 60 * 1000),
): string | null {
  try {
    const raw = localStorage.getItem(LAST_ORDER_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as LastOrder;
    if (!data.publicCode || typeof data.savedAt !== 'number') return null;
    if (Date.now() - data.savedAt > maxAgeMs) return null;
    return data.publicCode;
  } catch {
    return null;
  }
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  RECEIVED: 'Recibido',
  CONFIRMED: 'Confirmado',
  IN_PREPARATION: 'En preparación',
  READY: 'Listo',
  ON_THE_WAY: 'En camino',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABEL[status] ?? status;
}

const OPEN_STATUSES = new Set(['RECEIVED', 'CONFIRMED', 'IN_PREPARATION', 'READY', 'ON_THE_WAY']);

export function pickActiveOrderCode(
  orders: Array<{ publicCode: string; status: string }>,
  currentOrder?: { publicCode: string; status: string } | null,
): string | null {
  if (currentOrder && OPEN_STATUSES.has(currentOrder.status)) {
    return currentOrder.publicCode;
  }
  const open = orders.find((o) => OPEN_STATUSES.has(o.status));
  if (open) return open.publicCode;
  if (currentOrder) return currentOrder.publicCode;
  return orders[0]?.publicCode ?? null;
}
