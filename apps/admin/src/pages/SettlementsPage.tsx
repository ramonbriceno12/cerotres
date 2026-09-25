import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, ApiError, getAccessToken } from '../lib/api';
import { formatMoney } from '../lib/orders';

type SettlementListItem = {
  id: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  expectedNetCents: number;
  reportedNetCents: number | null;
  channel: { id: string; code: string; name: string };
  _count: { lines: number };
};

type SettlementDetail = {
  id: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  expectedNetCents: number;
  reportedNetCents: number | null;
  csvObjectKey: string | null;
  channel: { id: string; name: string };
  lines: Array<{
    id: string;
    externalOrderRef: string | null;
    expectedCommissionCents: number;
    reportedCommissionCents: number | null;
    differenceCents: number;
    order: { publicCode: string; totalCents: number } | null;
  }>;
};

export function SettlementsPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [channelId, setChannelId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [error, setError] = useState<string | null>(null);

  const channelsQuery = useQuery({
    queryKey: ['admin-channels'],
    queryFn: () =>
      apiFetch<{
        channels: Array<{ id: string; code: string; name: string; requiresExternalRef: boolean }>;
      }>('/api/admin/channels'),
  });

  const listQuery = useQuery({
    queryKey: ['settlements'],
    queryFn: () =>
      apiFetch<{ settlements: SettlementListItem[] }>('/api/admin/channels/settlements'),
  });

  const detailQuery = useQuery({
    queryKey: ['settlement', selectedId],
    enabled: Boolean(selectedId),
    queryFn: () =>
      apiFetch<{ settlement: SettlementDetail }>(`/api/admin/channels/settlements/${selectedId}`),
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      apiFetch<{ settlement: { id: string } }>('/api/admin/channels/settlements', {
        method: 'POST',
        body: {
          channelId,
          periodStart: new Date(periodStart).toISOString(),
          periodEnd: new Date(periodEnd).toISOString(),
        },
      }),
    onSuccess: (data) => {
      setSelectedId(data.settlement.id);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['settlements'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Error al crear'),
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) return;
      return apiFetch(`/api/admin/channels/settlements/${selectedId}/close`, { method: 'POST' });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settlement', selectedId] });
      void queryClient.invalidateQueries({ queryKey: ['settlements'] });
    },
  });

  async function uploadCsv(file: File) {
    if (!selectedId) return;
    const token = getAccessToken();
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(
      `${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/api/admin/channels/settlements/${selectedId}/csv`,
      {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
        body: form,
      },
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      setError(data.error?.message ?? 'Error al subir CSV');
      return;
    }
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ['settlement', selectedId] });
    void queryClient.invalidateQueries({ queryKey: ['settlements'] });
  }

  const detail = detailQuery.data?.settlement;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Liquidaciones</h1>
        <Link to="/channels/platform-orders" className="text-sm underline">
          Pedidos plataforma
        </Link>
      </div>

      <section className="rounded border border-stone-200 bg-white p-4">
        <h2 className="font-medium">Nueva liquidación</h2>
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <select
            className="rounded border px-2 py-1.5"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
          >
            <option value="">Canal</option>
            {(channelsQuery.data?.channels ?? [])
              .filter((c) => c.code === 'PEDIDOS_YA' || c.requiresExternalRef)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <input
            type="datetime-local"
            className="rounded border px-2 py-1.5"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
          />
          <input
            type="datetime-local"
            className="rounded border px-2 py-1.5"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
          />
          <button
            type="button"
            className="rounded bg-stone-900 px-3 py-1.5 text-white"
            onClick={() => createMutation.mutate()}
          >
            Crear período
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <p className="mt-2 text-xs text-stone-500">
          CSV esperado: <code>externalOrderRef,reportedCommissionCents</code>
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ul className="space-y-2 rounded border border-stone-200 bg-white p-3">
          {(listQuery.data?.settlements ?? []).map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSelectedId(s.id)}
                className={`w-full rounded px-3 py-2 text-left text-sm ${
                  selectedId === s.id ? 'bg-stone-900 text-white' : 'hover:bg-stone-50'
                }`}
              >
                <span className="font-medium">{s.channel.name}</span>
                <span className="block text-xs opacity-80">
                  {new Date(s.periodStart).toLocaleDateString()} –{' '}
                  {new Date(s.periodEnd).toLocaleDateString()} · {s.status} · {s._count.lines}{' '}
                  líneas
                </span>
              </button>
            </li>
          ))}
        </ul>

        {detail && (
          <section className="rounded border border-stone-200 bg-white p-4">
            <h2 className="font-medium">{detail.channel.name}</h2>
            <p className="text-sm text-stone-500">
              {detail.status} · neto esperado {formatMoney(detail.expectedNetCents)}
              {detail.reportedNetCents != null
                ? ` · reportado ${formatMoney(detail.reportedNetCents)}`
                : ''}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <label className="cursor-pointer rounded border px-3 py-1.5 text-sm">
                Subir CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadCsv(file);
                  }}
                />
              </label>
              <button
                type="button"
                className="rounded bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                disabled={detail.status === 'PENDING' || detail.status === 'COLLECTED'}
                onClick={() => closeMutation.mutate()}
              >
                Cerrar liquidación
              </button>
            </div>
            <table className="mt-4 w-full text-left text-sm">
              <thead className="text-xs uppercase text-stone-500">
                <tr>
                  <th className="py-1">Pedido</th>
                  <th>Ref</th>
                  <th>Esp.</th>
                  <th>Rep.</th>
                  <th>Diff</th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((line) => (
                  <tr key={line.id} className="border-t border-stone-100">
                    <td className="py-1">{line.order?.publicCode ?? '—'}</td>
                    <td>{line.externalOrderRef ?? '—'}</td>
                    <td className="tabular-nums">{formatMoney(line.expectedCommissionCents)}</td>
                    <td className="tabular-nums">
                      {line.reportedCommissionCents != null
                        ? formatMoney(line.reportedCommissionCents)
                        : '—'}
                    </td>
                    <td
                      className={`tabular-nums ${
                        line.differenceCents !== 0 ? 'text-amber-700' : ''
                      }`}
                    >
                      {formatMoney(line.differenceCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}
