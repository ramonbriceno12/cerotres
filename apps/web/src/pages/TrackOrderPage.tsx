import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { API_URL, apiFetch } from '../lib/api';
import {
  orderStatusLabel,
  pickActiveOrderCode,
  readLastOrderCode,
  saveLastOrderCode,
} from '../lib/guestOrder';
import { formatMoney } from '../lib/types';
import { BrandIso } from '../components/Brand';
import { BottomNav } from '../components/Shell';

type PublicOrder = {
  publicCode: string;
  status: string;
  fulfillmentType: string;
  totalCents: number;
  placedAt: string | null;
  deliveryZone: { name: string; estimatedMinutes: number | null } | null;
  statusEvents: Array<{ toStatus: string; createdAt: string }>;
  items: Array<{ productName: string; quantity: number; lineTotalCents: number }>;
  payments?: Array<{
    method: string;
    status: string;
    amountCents: number;
    reference: string | null;
  }>;
};

type GuestMe = {
  currentOrder: { publicCode: string; status: string } | null;
  orders: Array<{ publicCode: string; status: string }>;
};

const STATUS_FLOW = [
  'RECEIVED',
  'CONFIRMED',
  'IN_PREPARATION',
  'READY',
  'ON_THE_WAY',
  'DELIVERED',
] as const;

export function TrackOrderPage() {
  const { code: paramCode } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const codeFromUrl = (paramCode ?? search.get('code') ?? '').trim().toUpperCase();
  const [resolving, setResolving] = useState(!codeFromUrl);
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const code = codeFromUrl;

  // Restore session order when opening /seguimiento without a code
  useEffect(() => {
    if (codeFromUrl) {
      setResolving(false);
      return;
    }
    let cancelled = false;
    async function resolveFromSession() {
      setResolving(true);
      try {
        const me = await apiFetch<GuestMe>('/api/public/guest/me');
        const picked = pickActiveOrderCode(me.orders, me.currentOrder);
        if (!cancelled && picked) {
          saveLastOrderCode(picked);
          navigate(`/pedido/${picked}`, { replace: true });
          return;
        }
      } catch {
        // no guest cookie — try local fallback
      }
      const local = readLastOrderCode();
      if (!cancelled && local) {
        navigate(`/pedido/${local}`, { replace: true });
        return;
      }
      if (!cancelled) setResolving(false);
    }
    void resolveFromSession();
    return () => {
      cancelled = true;
    };
  }, [codeFromUrl, navigate]);

  useEffect(() => {
    if (!code) return;
    saveLastOrderCode(code);
    let cancelled = false;
    let source: EventSource | null = null;
    let pollTimer: number | undefined;

    async function load() {
      try {
        const data = await apiFetch<{ order: PublicOrder }>(
          `/api/public/orders/${encodeURIComponent(code)}`,
        );
        if (!cancelled) {
          setOrder(data.order);
          setError(null);
        }
      } catch {
        if (!cancelled) setError('No encontramos ese pedido');
      }
    }

    void load();
    pollTimer = window.setInterval(() => {
      void load();
    }, 15000);

    try {
      source = new EventSource(`${API_URL}/api/public/orders/${encodeURIComponent(code)}/stream`);
      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { order?: PublicOrder };
          if (payload.order) setOrder(payload.order);
        } catch {
          // ignore
        }
      };
    } catch {
      // polling already running
    }

    return () => {
      cancelled = true;
      source?.close();
      if (pollTimer) window.clearInterval(pollTimer);
    };
  }, [code]);

  if (!code) {
    return (
      <div className="mx-auto min-h-dvh max-w-lg bg-bg px-4 pb-28 pt-6 text-cream">
        <BrandIso className="mb-3 h-10 w-10" />
        <h1 className="font-display text-3xl font-bold">Seguimiento</h1>
        {resolving ? (
          <div className="mt-6 space-y-2">
            <div className="h-4 animate-pulse rounded bg-surface" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-surface" />
            <p className="text-sm text-cream-dim">Buscando tu pedido en este dispositivo…</p>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-cream-dim">
              No encontramos un pedido reciente en este dispositivo. Si tienes el código, pégalo
              aquí.
            </p>
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (manualCode.trim()) {
                  const next = manualCode.trim().toUpperCase();
                  saveLastOrderCode(next);
                  navigate(`/pedido/${next}`);
                }
              }}
            >
              <input
                className="flex-1 rounded-md bg-surface px-3 py-3"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="03-XXXX"
              />
              <button type="submit" className="rounded-md bg-brand px-4">
                Ver
              </button>
            </form>
          </>
        )}
        <BottomNav />
      </div>
    );
  }

  const flow =
    order?.fulfillmentType === 'PICKUP'
      ? STATUS_FLOW.filter((s) => s !== 'ON_THE_WAY')
      : [...STATUS_FLOW];

  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-bg px-4 pb-28 pt-6 text-cream">
      <div className="mb-2 flex items-center gap-2">
        <BrandIso className="h-8 w-8" />
        <p className="text-sm uppercase tracking-wide text-cream-dim">Pedido</p>
      </div>
      <h1 className="font-display text-3xl font-bold">{code}</h1>
      {order && (
        <p className="mt-1 text-sm text-cream-dim">Estado: {orderStatusLabel(order.status)}</p>
      )}

      {error && <p className="mt-4 text-danger">{error}</p>}
      {!order && !error && (
        <div className="mt-6 space-y-2">
          <div className="h-4 animate-pulse rounded bg-surface" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-surface" />
        </div>
      )}

      {order && (
        <>
          <p className="mt-2 font-display text-2xl tabular-nums">{formatMoney(order.totalCents)}</p>
          {order.deliveryZone?.estimatedMinutes && (
            <p className="text-sm text-cream-dim">
              ETA ~{order.deliveryZone.estimatedMinutes} min · {order.deliveryZone.name}
            </p>
          )}

          <ol className="mt-8 space-y-3">
            {flow.map((status) => {
              const reached =
                order.status === 'CANCELLED'
                  ? false
                  : flow.indexOf(status as (typeof flow)[number]) <=
                    flow.indexOf(order.status as (typeof flow)[number]);
              const current = order.status === status;
              return (
                <li key={status} className="flex items-center gap-3">
                  <span
                    className={`h-3 w-3 rounded-full ${
                      current ? 'bg-brand' : reached ? 'bg-success' : 'bg-surface-2'
                    }`}
                  />
                  <span className={current ? 'font-medium text-cream' : 'text-cream-dim'}>
                    {orderStatusLabel(status)}
                  </span>
                </li>
              );
            })}
            {order.status === 'CANCELLED' && <li className="text-danger">Cancelado</li>}
          </ol>

          <ul className="mt-8 space-y-2 rounded-md bg-surface p-3 text-sm">
            {order.items.map((item, idx) => (
              <li key={idx} className="flex justify-between gap-3">
                <span>
                  {item.quantity}× {item.productName}
                </span>
                <span className="font-display tabular-nums">
                  {formatMoney(item.lineTotalCents)}
                </span>
              </li>
            ))}
          </ul>

          {(order.payments?.length ?? 0) > 0 && (
            <ul className="mt-4 space-y-2 rounded-md bg-surface p-3 text-sm">
              <li className="font-medium">Pagos</li>
              {order.payments!.map((p, idx) => (
                <li key={idx} className="flex justify-between gap-3 text-cream-dim">
                  <span>
                    {p.method}
                    {p.reference ? ` · ${p.reference}` : ''}
                  </span>
                  <span className="font-display tabular-nums text-cream">
                    {formatMoney(p.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <BottomNav />
    </div>
  );
}
