import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, getAccessToken } from '../lib/api';
import { formatMoney, STATUS_LABEL, type AdminOrderDetail } from '../lib/orders';
import { BrandIsoBadge } from '../components/Brand';

const COLUMNS = ['RECEIVED', 'CONFIRMED', 'IN_PREPARATION', 'READY', 'ON_THE_WAY'] as const;

const TARGET_MS = 20 * 60 * 1000;

function elapsedColor(placedAt: string | null) {
  if (!placedAt) return 'border-stone-300';
  const age = Date.now() - new Date(placedAt).getTime();
  if (age > TARGET_MS * 1.5) return 'border-red-500 bg-red-50';
  if (age > TARGET_MS) return 'border-amber-500 bg-amber-50';
  return 'border-emerald-500 bg-white';
}

function formatElapsed(placedAt: string | null) {
  if (!placedAt) return '—';
  const mins = Math.floor((Date.now() - new Date(placedAt).getTime()) / 60000);
  return `${mins} min`;
}

export function KitchenPage() {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const knownIds = useRef<Set<string>>(new Set());
  const audioCtx = useRef<AudioContext | null>(null);

  const boardQuery = useQuery({
    queryKey: ['kitchen-board'],
    queryFn: () => apiFetch<{ orders: AdminOrderDetail[] }>('/api/admin/orders/kitchen'),
    refetchInterval: 15000,
  });

  const orders = boardQuery.data?.orders ?? [];

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    const token = getAccessToken();
    if (!token) return;

    const source = new EventSource(
      `${apiUrl}/api/admin/orders/kitchen/stream?access_token=${encodeURIComponent(token)}`,
    );
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          type?: string;
          orders?: AdminOrderDetail[];
        };
        if (payload.orders) {
          queryClient.setQueryData(['kitchen-board'], { orders: payload.orders });
        }
      } catch {
        // ignore
      }
    };
    return () => source.close();
  }, [queryClient]);

  useEffect(() => {
    if (!boardQuery.data) return;
    const ids = new Set(orders.map((o) => o.id));
    let isNew = false;
    for (const id of ids) {
      if (knownIds.current.size > 0 && !knownIds.current.has(id)) isNew = true;
    }
    if (isNew) {
      try {
        if (!audioCtx.current) audioCtx.current = new AudioContext();
        const ctx = audioCtx.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 880;
        gain.gain.value = 0.05;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } catch {
        // ignore audio errors
      }
    }
    knownIds.current = ids;
  }, [orders, boardQuery.data]);

  const byStatus = useMemo(() => {
    const map: Record<string, AdminOrderDetail[]> = {};
    for (const col of COLUMNS) map[col] = [];
    for (const order of orders) {
      if (!map[order.status]) map[order.status] = [];
      map[order.status]!.push(order);
    }
    return map;
  }, [orders]);

  const advanceMutation = useMutation({
    mutationFn: async (order: AdminOrderDetail) => {
      if (!order.nextStatus) return;
      return apiFetch(`/api/admin/orders/${order.id}/status`, {
        method: 'POST',
        body: { toStatus: order.nextStatus },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['kitchen-board'] });
    },
  });

  void now;

  return (
    <div className="-mx-4 -my-6 min-h-screen bg-stone-900 p-4 text-stone-100">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BrandIsoBadge className="h-11 w-11" />
          <h1 className="text-2xl font-semibold tracking-tight">Cocina (KDS)</h1>
        </div>
        <div className="flex items-center gap-4 text-sm text-stone-400">
          <span>{orders.length} activos · toque para avanzar</span>
          <a href="/orders" className="underline hover:text-white">
            Volver
          </a>
        </div>
      </div>

      <div className="grid min-h-[80vh] grid-flow-col auto-cols-[minmax(220px,1fr)] gap-3 overflow-x-auto">
        {COLUMNS.map((col) => (
          <section key={col} className="rounded-lg bg-stone-800/80 p-2">
            <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-stone-300">
              {STATUS_LABEL[col] ?? col} ({byStatus[col]?.length ?? 0})
            </h2>
            <div className="space-y-3">
              {(byStatus[col] ?? []).map((order) => (
                <button
                  key={order.id}
                  type="button"
                  disabled={!order.nextStatus || advanceMutation.isPending}
                  onClick={() => advanceMutation.mutate(order)}
                  className={`w-full rounded-lg border-4 p-3 text-left text-stone-900 shadow ${elapsedColor(order.placedAt)}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-2xl font-bold leading-none">{order.publicCode}</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatElapsed(order.placedAt)}
                    </p>
                  </div>
                  <p className="mt-1 text-sm font-medium">
                    {order.fulfillmentType === 'DELIVERY' ? 'Delivery' : 'Pickup'} ·{' '}
                    {order.channel.name}
                  </p>
                  <p className="text-sm">{order.customerName}</p>
                  <ul className="mt-2 space-y-1 text-base font-medium">
                    {order.items.map((item) => (
                      <li key={item.id}>
                        {item.quantity}× {item.productName}
                        {item.options.length > 0 && (
                          <span className="block text-sm font-normal text-stone-700">
                            {item.options.map((o) => o.optionName).join(', ')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-right text-lg font-bold tabular-nums">
                    {formatMoney(order.totalCents)}
                  </p>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
