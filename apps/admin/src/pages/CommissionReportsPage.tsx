import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch } from '../lib/api';
import { formatMoney } from '../lib/orders';

export function CommissionReportsPage() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 16));
  const [simChannelId, setSimChannelId] = useState('');
  const [simPercent, setSimPercent] = useState('30');

  const range = useMemo(
    () => ({
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
    }),
    [from, to],
  );

  const channelsQuery = useQuery({
    queryKey: ['admin-channels'],
    queryFn: () =>
      apiFetch<{ channels: Array<{ id: string; code: string; name: string }> }>(
        '/api/admin/channels',
      ),
  });

  const reportQuery = useQuery({
    queryKey: ['commission-report', range.from, range.to],
    queryFn: () =>
      apiFetch<{
        report: {
          channels: Array<{
            channelCode: string;
            channelName: string;
            orderCount: number;
            grossCents: number;
            commissionCents: number;
            adjustmentsCents: number;
            effectiveCommissionPercent: number;
            profitAfterCommissionCents: number;
          }>;
          comparison: {
            directGrossCents: number;
            platformGrossCents: number;
            platformCommissionCents: number;
            platformCostVsDirectCents: number;
          };
        };
      }>(
        `/api/admin/channels/reports/commission?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
      ),
  });

  const simulateMutation = useMutation({
    mutationFn: async () =>
      apiFetch<{
        simulation: {
          orderCount: number;
          grossCents: number;
          actualCommissionCents: number;
          simulatedCommissionCents: number;
          deltaCommissionCents: number;
          actualNetCents: number;
          simulatedNetCents: number;
          readOnly: true;
        };
      }>('/api/admin/channels/simulate', {
        method: 'POST',
        body: {
          channelId: simChannelId,
          from: range.from,
          to: range.to,
          newPercent: Number(simPercent) / 100,
        },
      }),
  });

  const report = reportQuery.data?.report;
  const sim = simulateMutation.data?.simulation;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Reportes de comisión</h1>

      <div className="flex flex-wrap gap-2">
        <input
          type="datetime-local"
          className="rounded border px-2 py-1.5"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <input
          type="datetime-local"
          className="rounded border px-2 py-1.5"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>

      <section className="overflow-x-auto rounded border border-stone-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-stone-50 text-xs uppercase text-stone-500">
            <tr>
              <th className="px-3 py-2">Canal</th>
              <th className="px-3 py-2">Pedidos</th>
              <th className="px-3 py-2">Bruto</th>
              <th className="px-3 py-2">Comisión</th>
              <th className="px-3 py-2">% efectivo</th>
              <th className="px-3 py-2">Neto / utilidad</th>
            </tr>
          </thead>
          <tbody>
            {(report?.channels ?? []).map((row) => (
              <tr key={row.channelCode} className="border-t border-stone-100">
                <td className="px-3 py-2">{row.channelName}</td>
                <td className="px-3 py-2">{row.orderCount}</td>
                <td className="px-3 py-2 tabular-nums">{formatMoney(row.grossCents)}</td>
                <td className="px-3 py-2 tabular-nums">
                  {formatMoney(row.commissionCents + row.adjustmentsCents)}
                </td>
                <td className="px-3 py-2">{(row.effectiveCommissionPercent * 100).toFixed(2)}%</td>
                <td className="px-3 py-2 tabular-nums">
                  {formatMoney(row.profitAfterCommissionCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {report && (
        <div className="rounded border border-stone-200 bg-white p-4 text-sm">
          <h2 className="font-medium">Comparativa directo vs plataforma</h2>
          <p className="mt-2">
            Directo bruto: {formatMoney(report.comparison.directGrossCents)} · Plataforma bruto:{' '}
            {formatMoney(report.comparison.platformGrossCents)} · Costo comisión plataforma:{' '}
            {formatMoney(report.comparison.platformCostVsDirectCents)}
          </p>
        </div>
      )}

      <section className="rounded border border-stone-200 bg-white p-4">
        <h2 className="font-medium">Simulador (solo lectura)</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <select
            className="rounded border px-2 py-1.5"
            value={simChannelId}
            onChange={(e) => setSimChannelId(e.target.value)}
          >
            <option value="">Canal</option>
            {(channelsQuery.data?.channels ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className="w-24 rounded border px-2 py-1.5"
            value={simPercent}
            onChange={(e) => setSimPercent(e.target.value)}
            placeholder="% nuevo"
          />
          <button
            type="button"
            className="rounded bg-stone-900 px-3 py-1.5 text-white"
            disabled={!simChannelId}
            onClick={() => simulateMutation.mutate()}
          >
            Simular
          </button>
        </div>
        {sim && (
          <div className="mt-3 space-y-1 text-sm">
            <p>
              {sim.orderCount} pedidos · bruto {formatMoney(sim.grossCents)}
            </p>
            <p>
              Comisión real {formatMoney(sim.actualCommissionCents)} → simulada{' '}
              {formatMoney(sim.simulatedCommissionCents)} (Δ {formatMoney(sim.deltaCommissionCents)}
              )
            </p>
            <p>
              Neto real {formatMoney(sim.actualNetCents)} → simulado{' '}
              {formatMoney(sim.simulatedNetCents)}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
