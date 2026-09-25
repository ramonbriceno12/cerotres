import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import { apiFetch, ApiError, openAuthenticatedPdf } from '../lib/api';
import { formatBolivars, formatMoney, STATUS_LABEL, type AdminOrderDetail } from '../lib/orders';

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const [cancelReason, setCancelReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const orderQuery = useQuery({
    queryKey: ['admin-order', id],
    queryFn: () => apiFetch<{ order: AdminOrderDetail }>(`/api/admin/orders/${id}`),
    enabled: Boolean(id),
  });

  const order = orderQuery.data?.order;

  const statusMutation = useMutation({
    mutationFn: async (toStatus: string) => {
      setError(null);
      return apiFetch<{ order: AdminOrderDetail }>(`/api/admin/orders/${id}/status`, {
        method: 'POST',
        body: {
          toStatus,
          ...(toStatus === 'CANCELLED' ? { cancelReason } : {}),
        },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-order', id] });
      void queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['kitchen-board'] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado');
    },
  });

  if (orderQuery.isLoading) return <p className="text-stone-500">Cargando pedido…</p>;
  if (!order) return <p className="text-red-600">Pedido no encontrado</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <Link to="/orders" className="text-sm text-stone-500 underline">
            ← Pedidos
          </Link>
          <h1 className="mt-1 text-xl font-semibold">{order.publicCode}</h1>
          <p className="text-sm text-stone-500">
            {STATUS_LABEL[order.status] ?? order.status} · {order.channel.name} ·{' '}
            {order.fulfillmentType}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void openAuthenticatedPdf(`/api/admin/orders/${id}/kitchen-ticket.pdf`)}
            className="rounded border border-stone-300 bg-white px-3 py-2 text-sm"
          >
            PDF cocina 58mm
          </button>
          <button
            type="button"
            onClick={() => void openAuthenticatedPdf(`/api/admin/orders/${id}/receipt.pdf`)}
            className="rounded border border-stone-300 bg-white px-3 py-2 text-sm"
          >
            PDF cliente
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded border border-stone-300 bg-white px-3 py-2 text-sm"
          >
            Imprimir pantalla
          </button>
          {order.nextStatus && (
            <button
              type="button"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate(order.nextStatus!)}
              className="rounded bg-stone-900 px-3 py-2 text-sm text-white"
            >
              Avanzar a {STATUS_LABEL[order.nextStatus] ?? order.nextStatus}
            </button>
          )}
        </div>
      </div>

      <div className="ticket-print hidden print:block">
        <img src="/assets/img/iso.png" alt="03" className="mb-2 h-12 w-12 object-contain" />
        <p className="text-lg font-bold">CERO TRES</p>
        <p className="text-2xl font-bold">{order.publicCode}</p>
        <p>
          {order.fulfillmentType} · {order.channel.name}
        </p>
        <p>{order.customerName}</p>
        {order.customerPhone && <p>{order.customerPhone}</p>}
        <hr className="my-2 border-dashed border-black" />
        {order.items.map((item) => (
          <div key={item.id} className="mb-2">
            <p className="font-semibold">
              {item.quantity}× {item.productName}
            </p>
            {item.options.map((opt, idx) => (
              <p key={idx} className="pl-2 text-sm">
                - {opt.optionName}
                {opt.quantity > 1 ? ` ×${opt.quantity}` : ''}
              </p>
            ))}
          </div>
        ))}
        <hr className="my-2 border-dashed border-black" />
        <p className="font-bold">TOTAL {formatMoney(order.totalCents)}</p>
        {order.notes && <p className="mt-2">Notas: {order.notes}</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3 print:hidden">
        <section className="space-y-3 rounded border border-stone-200 bg-white p-4 lg:col-span-2">
          <h2 className="font-medium">Ítems</h2>
          <ul className="space-y-3">
            {order.items.map((item) => (
              <li key={item.id} className="border-b border-stone-100 pb-3">
                <div className="flex justify-between gap-3">
                  <p className="font-medium">
                    {item.quantity}× {item.productName}
                  </p>
                  <p className="tabular-nums">{formatMoney(item.lineTotalCents)}</p>
                </div>
                {item.options.length > 0 && (
                  <ul className="mt-1 text-sm text-stone-600">
                    {item.options.map((opt, idx) => (
                      <li key={idx}>
                        {opt.groupName}: {opt.optionName}
                        {opt.wasFree ? ' (incluido)' : ` +${formatMoney(opt.linePriceDeltaCents)}`}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <div className="space-y-1 border-t border-stone-200 pt-3 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(order.subtotalCents)}</span>
            </div>
            {order.deliveryFeeCents > 0 && (
              <div className="flex justify-between text-stone-600">
                <span>Delivery</span>
                <span className="tabular-nums">{formatMoney(order.deliveryFeeCents)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(order.totalCents)}</span>
            </div>
            {order.totalBolivarsCents != null && (
              <div className="flex justify-between text-stone-600">
                <span>
                  Total Bs
                  {order.exchangeRateBolivarsPerUsd != null
                    ? ` (tasa ${order.exchangeRateBolivarsPerUsd.toFixed(2)})`
                    : ''}
                </span>
                <span className="tabular-nums">{formatBolivars(order.totalBolivarsCents)}</span>
              </div>
            )}
            <div className="flex justify-between text-stone-500">
              <span>Costo de ventas (congelado)</span>
              <span className="tabular-nums">{formatMoney(order.cogsCents)}</span>
            </div>
            {order.commissionAmountCents != null && (
              <div className="flex justify-between text-stone-500">
                <span>
                  Comisión
                  {order.commissionPercentSnapshot != null
                    ? ` (${(order.commissionPercentSnapshot * 100).toFixed(2)}%)`
                    : ''}
                </span>
                <span className="tabular-nums">{formatMoney(order.commissionAmountCents)}</span>
              </div>
            )}
            {order.netPayoutExpectedCents != null && (
              <div className="flex justify-between text-stone-500">
                <span>Neto esperado</span>
                <span className="tabular-nums">{formatMoney(order.netPayoutExpectedCents)}</span>
              </div>
            )}
          </div>
        </section>

        <div className="space-y-4">
          <section className="rounded border border-stone-200 bg-white p-4">
            <h2 className="font-medium">Cliente</h2>
            <p className="mt-2">{order.customerName}</p>
            {order.customerPhone && <p className="text-sm">{order.customerPhone}</p>}
            {order.customerEmail && <p className="text-sm">{order.customerEmail}</p>}
            {order.externalOrderRef && (
              <p className="mt-2 text-sm text-stone-600">Ref: {order.externalOrderRef}</p>
            )}
            {order.notes && <p className="mt-2 text-sm">Notas: {order.notes}</p>}
            {order.cancelReason && (
              <p className="mt-2 text-sm text-red-700">Cancelación: {order.cancelReason}</p>
            )}
          </section>

          <section className="rounded border border-stone-200 bg-white p-4">
            <h2 className="font-medium">Cobros</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {order.payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span>
                    {p.method} · {p.status}
                    {p.reference ? ` · ${p.reference}` : ''}
                  </span>
                  <span className="tabular-nums">{formatMoney(p.amountCents)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded border border-stone-200 bg-white p-4">
            <h2 className="font-medium">Estados</h2>
            <ol className="mt-2 space-y-2 text-sm">
              {order.statusEvents.map((ev) => (
                <li key={ev.id}>
                  <span className="font-medium">{STATUS_LABEL[ev.toStatus] ?? ev.toStatus}</span>
                  <span className="text-stone-500">
                    {' '}
                    · {new Date(ev.createdAt).toLocaleString()}
                    {ev.actor ? ` · ${ev.actor.name}` : ''}
                  </span>
                  {ev.note && <p className="text-stone-600">{ev.note}</p>}
                </li>
              ))}
            </ol>

            {order.allowedTransitions.includes('CANCELLED') && (
              <div className="mt-4 space-y-2 border-t border-stone-100 pt-3">
                <label className="block text-xs text-stone-500">
                  Motivo de cancelación
                  <input
                    className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={statusMutation.isPending || !cancelReason.trim()}
                  onClick={() => statusMutation.mutate('CANCELLED')}
                  className="rounded bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-40"
                >
                  Cancelar pedido
                </button>
              </div>
            )}
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
