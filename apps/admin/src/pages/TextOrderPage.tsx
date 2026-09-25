import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, ApiError } from '../lib/api';
import { formatMoney } from '../lib/orders';

type Channel = { id: string; code: string; name: string; requiresExternalRef: boolean };
type Zone = { id: string; name: string; feeCents: number };

type TextOrderPreview = {
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  fulfillmentType: 'PICKUP' | 'DELIVERY';
  deliveryZoneId: string | null;
  deliveryZoneName: string | null;
  addressLine1: string | null;
  externalOrderRef: string | null;
  notes: string | null;
  channelId: string;
  payments: Array<{ method: string; amountCents: number; reference: string | null }>;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    lineTotalCents: number;
    options: Array<{ optionId: string; name: string; quantity: number }>;
    notes: string | null;
  }>;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  warnings: string[];
};

const EXAMPLES = [
  '2 pepitos de lomito, uno con queso extra y cebolla, pickup a nombre de Juan, paga en efectivo',
  '1 pepito mixto sin cebolla, delivery zona centro calle 5, mitad pago móvil mitad efectivo',
  'PedidosYa ref PY-8821: 1 pepito de pollo con salsas garlic y bbq, retiro mostrador',
];

export function TextOrderPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [channelId, setChannelId] = useState('');
  const [preview, setPreview] = useState<TextOrderPreview | null>(null);
  const [zoneId, setZoneId] = useState('');
  const [address, setAddress] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [error, setError] = useState<string | null>(null);

  const metaQuery = useQuery({
    queryKey: ['orders-meta'],
    queryFn: () =>
      apiFetch<{ channels: Channel[]; zones: Zone[]; paymentMethods: string[] }>(
        '/api/admin/orders/meta',
      ),
  });

  useEffect(() => {
    if (channelId || !metaQuery.data?.channels.length) return;
    const direct = metaQuery.data.channels.find((c) => c.code === 'DIRECT');
    setChannelId(direct?.id ?? metaQuery.data.channels[0]!.id);
  }, [channelId, metaQuery.data]);

  useEffect(() => {
    if (!preview) return;
    setZoneId(preview.deliveryZoneId ?? '');
    setAddress(preview.addressLine1 ?? '');
    setExternalRef(preview.externalOrderRef ?? '');
  }, [preview]);

  const channel = metaQuery.data?.channels.find((c) => c.id === channelId);

  const parseMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ preview: TextOrderPreview }>('/api/admin/orders/parse-text', {
        method: 'POST',
        body: { text, channelId },
      }),
    onSuccess: (data) => {
      setPreview(data.preview);
      setError(null);
    },
    onError: (err) => {
      setPreview(null);
      setError(err instanceof ApiError ? err.message : 'No se pudo interpretar el pedido');
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error('No preview');
      const deliveryZone = metaQuery.data?.zones.find((z) => z.id === zoneId);
      const deliveryFeeCents =
        preview.fulfillmentType === 'DELIVERY'
          ? (deliveryZone?.feeCents ?? preview.deliveryFeeCents)
          : 0;
      const totalCents = preview.subtotalCents + deliveryFeeCents;
      const payments = preview.payments.map((p) => {
        const ratio = preview.totalCents > 0 ? p.amountCents / preview.totalCents : 1;
        return {
          method: p.method,
          amountCents: Math.round(totalCents * ratio),
          ...(p.reference ? { reference: p.reference } : {}),
        };
      });
      const paySum = payments.reduce((s, p) => s + p.amountCents, 0);
      if (payments.length > 0 && paySum !== totalCents) {
        payments[payments.length - 1]!.amountCents += totalCents - paySum;
      }
      return apiFetch<{ order: { id: string; publicCode: string } }>('/api/admin/orders', {
        method: 'POST',
        body: {
          channelId: preview.channelId,
          ...(externalRef.trim() ? { externalOrderRef: externalRef.trim() } : {}),
          customerName: preview.customerName,
          ...(preview.customerPhone ? { customerPhone: preview.customerPhone } : {}),
          ...(preview.customerEmail ? { customerEmail: preview.customerEmail } : {}),
          fulfillmentType: preview.fulfillmentType,
          ...(preview.fulfillmentType === 'DELIVERY'
            ? { deliveryZoneId: zoneId, addressLine1: address }
            : {}),
          ...(preview.notes ? { notes: preview.notes } : {}),
          payments,
          paymentsConfirmed: true,
          clientTotalCents: totalCents,
          items: preview.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            clientLineTotalCents: item.lineTotalCents,
            ...(item.notes ? { notes: item.notes } : {}),
            options: item.options.map((o) => ({ optionId: o.optionId, quantity: o.quantity })),
          })),
        },
      });
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['kitchen-board'] });
      navigate(`/orders/${data.order.id}`);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el pedido');
    },
  });

  function onParse() {
    setError(null);
    parseMutation.mutate();
  }

  function onConfirm() {
    setError(null);
    if (!preview) return;
    if (channel?.requiresExternalRef && !externalRef.trim()) {
      setError('Este canal requiere referencia externa');
      return;
    }
    if (preview.fulfillmentType === 'DELIVERY' && (!zoneId || !address.trim())) {
      setError('Completa zona y dirección para delivery');
      return;
    }
    createMutation.mutate();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link to="/orders" className="text-sm text-zinc-500 underline">
          ← Pedidos
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Pedido por texto</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Describe el pedido en español. Claude lo interpreta; tú confirmas antes de crear. Los
          precios los calcula el sistema, no la IA.
        </p>
      </div>

      <section className="admin-card space-y-4 p-5">
        <label className="block text-sm font-medium text-zinc-700">
          Canal
          <select
            className="mt-1.5 w-full max-w-xs"
            value={channelId}
            onChange={(e) => {
              setChannelId(e.target.value);
              setPreview(null);
            }}
          >
            {(metaQuery.data?.channels ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-zinc-700">
          Pedido (texto libre)
          <textarea
            className="mt-1.5 min-h-[140px] w-full resize-y"
            placeholder="Ej: 2 pepitos de lomito, uno con queso extra, pickup, pago efectivo…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((sample) => (
            <button
              key={sample}
              type="button"
              className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-200"
              onClick={() => setText(sample)}
            >
              Ejemplo
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={parseMutation.isPending || text.trim().length < 8 || !channelId}
          className="admin-btn-primary"
          onClick={onParse}
        >
          {parseMutation.isPending ? 'Interpretando…' : 'Interpretar pedido'}
        </button>
      </section>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {preview && (
        <section className="admin-card space-y-4 p-5">
          <h2 className="text-lg font-semibold">Vista previa — confirma antes de crear</h2>

          {preview.warnings.length > 0 && (
            <ul className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {preview.warnings.map((w) => (
                <li key={w}>• {w}</li>
              ))}
            </ul>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase text-zinc-500">Cliente</p>
              <p className="font-medium">{preview.customerName}</p>
              {preview.customerPhone && (
                <p className="text-sm text-zinc-600">{preview.customerPhone}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-zinc-500">Entrega</p>
              <p className="font-medium">
                {preview.fulfillmentType === 'PICKUP' ? 'Retiro' : 'Delivery'}
              </p>
            </div>
          </div>

          {preview.fulfillmentType === 'DELIVERY' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                Zona
                <select
                  className="mt-1 w-full"
                  value={zoneId}
                  onChange={(e) => setZoneId(e.target.value)}
                >
                  <option value="">Seleccionar…</option>
                  {(metaQuery.data?.zones ?? []).map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} · {formatMoney(z.feeCents)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Dirección
                <input
                  className="mt-1 w-full"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </label>
            </div>
          )}

          {(channel?.requiresExternalRef || preview.externalOrderRef) && (
            <label className="block text-sm">
              Referencia externa
              <input
                className="mt-1 w-full"
                value={externalRef}
                onChange={(e) => setExternalRef(e.target.value)}
              />
            </label>
          )}

          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {preview.items.map((item) => (
              <li
                key={`${item.productId}-${item.options.map((o) => o.optionId).join(',')}`}
                className="px-4 py-3"
              >
                <div className="flex justify-between gap-2">
                  <span className="font-medium">
                    {item.quantity}× {item.productName}
                  </span>
                  <span className="tabular-nums">{formatMoney(item.lineTotalCents)}</span>
                </div>
                {item.options.length > 0 && (
                  <p className="mt-0.5 text-sm text-zinc-500">
                    {item.options.map((o) => o.name).join(' · ')}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(preview.subtotalCents)}</span>
            </div>
            {preview.deliveryFeeCents > 0 && (
              <div className="flex justify-between">
                <span>Delivery</span>
                <span className="tabular-nums">{formatMoney(preview.deliveryFeeCents)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(preview.totalCents)}</span>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-zinc-500">Pagos</p>
            <ul className="space-y-1 text-sm">
              {preview.payments.map((p, i) => (
                <li key={i} className="flex justify-between">
                  <span>
                    {p.method}
                    {p.reference ? ` · ${p.reference}` : ''}
                  </span>
                  <span className="tabular-nums">{formatMoney(p.amountCents)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              className="admin-btn-primary"
              disabled={createMutation.isPending}
              onClick={onConfirm}
            >
              {createMutation.isPending ? 'Creando…' : 'Confirmar y crear pedido'}
            </button>
            <button type="button" className="admin-btn-secondary" onClick={() => setPreview(null)}>
              Descartar
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
