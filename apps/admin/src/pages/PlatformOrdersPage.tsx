import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, ApiError } from '../lib/api';
import { formatMoney, STATUS_LABEL } from '../lib/orders';

type PlatformOrder = {
  id: string;
  publicCode: string;
  status: string;
  externalOrderRef: string | null;
  placedAt: string | null;
  totalCents: number;
  commissionBaseAmountCents: number | null;
  commissionPercentSnapshot: number | null;
  commissionAmountCents: number | null;
  adjustmentsSumCents: number;
  netPayoutExpectedCents: number | null;
  effectiveCommissionCents: number;
  settlement: { id: string; status: string } | null;
};

export function PlatformOrdersPage() {
  const queryClient = useQueryClient();
  const [channelCode, setChannelCode] = useState('PEDIDOS_YA');
  const [adjustOrderId, setAdjustOrderId] = useState<string | null>(null);
  const [amount, setAmount] = useState('0');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const channelsQuery = useQuery({
    queryKey: ['admin-channels'],
    queryFn: () =>
      apiFetch<{
        channels: Array<{ id: string; code: string; name: string; requiresExternalRef: boolean }>;
      }>('/api/admin/channels'),
  });

  const platformChannels = (channelsQuery.data?.channels ?? []).filter(
    (c) => c.requiresExternalRef,
  );

  const listQuery = useQuery({
    queryKey: ['platform-orders', channelCode],
    queryFn: () =>
      apiFetch<{
        channel: { name: string };
        orders: PlatformOrder[];
        total: number;
      }>(`/api/admin/channels/platform-orders?page=1&pageSize=50&channelCode=${channelCode}`),
  });

  const adjustMutation = useMutation({
    mutationFn: async () => {
      if (!adjustOrderId) return;
      return apiFetch('/api/admin/channels/adjustments', {
        method: 'POST',
        body: {
          orderId: adjustOrderId,
          amountCents: Math.round(Number(amount) * 100),
          reason,
        },
      });
    },
    onSuccess: () => {
      setAdjustOrderId(null);
      setReason('');
      setAmount('0');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['platform-orders'] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el ajuste');
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Pedidos de apps</h1>
          <p className="text-sm text-stone-500">
            {listQuery.data?.channel.name ?? 'Plataforma'} · comisión snapshot + ajustes
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="rounded border px-2 py-1.5 text-sm"
            value={channelCode}
            onChange={(e) => setChannelCode(e.target.value)}
          >
            {platformChannels.map((c) => (
              <option key={c.id} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <Link to="/channels/settlements" className="text-sm underline">
            Liquidaciones
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-stone-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-stone-50 text-xs uppercase text-stone-500">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Ref externa</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Base</th>
              <th className="px-3 py-2">%</th>
              <th className="px-3 py-2">Comisión</th>
              <th className="px-3 py-2">Neto</th>
              <th className="px-3 py-2">Liquidación</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {(listQuery.data?.orders ?? []).map((order) => (
              <tr key={order.id} className="border-t border-stone-100">
                <td className="px-3 py-2">
                  <Link to={`/orders/${order.id}`} className="underline">
                    {order.publicCode}
                  </Link>
                  <span className="block text-xs text-stone-500">
                    {STATUS_LABEL[order.status] ?? order.status}
                  </span>
                </td>
                <td className="px-3 py-2">{order.externalOrderRef ?? '—'}</td>
                <td className="px-3 py-2 tabular-nums">{formatMoney(order.totalCents)}</td>
                <td className="px-3 py-2 tabular-nums">
                  {formatMoney(order.commissionBaseAmountCents ?? 0)}
                </td>
                <td className="px-3 py-2">
                  {order.commissionPercentSnapshot != null
                    ? `${(order.commissionPercentSnapshot * 100).toFixed(2)}%`
                    : '—'}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {formatMoney(order.effectiveCommissionCents)}
                  {order.adjustmentsSumCents !== 0 && (
                    <span className="block text-xs text-amber-700">
                      adj {formatMoney(order.adjustmentsSumCents)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {formatMoney(order.netPayoutExpectedCents ?? 0)}
                </td>
                <td className="px-3 py-2 text-xs">{order.settlement?.status ?? '—'}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="text-xs underline"
                    onClick={() => setAdjustOrderId(order.id)}
                  >
                    Ajuste
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adjustOrderId && (
        <div className="rounded border border-amber-300 bg-amber-50 p-4">
          <h2 className="font-medium">Ajuste de comisión (no edita el snapshot)</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              className="rounded border px-2 py-1.5"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Monto $ (puede ser negativo)"
            />
            <input
              className="min-w-[240px] flex-1 rounded border px-2 py-1.5"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo"
            />
            <button
              type="button"
              className="rounded bg-stone-900 px-3 py-1.5 text-white"
              onClick={() => adjustMutation.mutate()}
            >
              Guardar ajuste
            </button>
            <button type="button" className="underline" onClick={() => setAdjustOrderId(null)}>
              Cancelar
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
