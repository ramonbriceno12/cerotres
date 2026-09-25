import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { formatMoney } from '../lib/orders';

type CashSession = {
  id: string;
  status: string;
  openedAt: string;
  closedAt: string | null;
  openingFloatCents: number;
  expectedCashCents: number | null;
  countedCashCents: number | null;
  differenceCashCents: number | null;
  notes: string | null;
  openedBy?: { name: string };
  closedBy?: { name: string } | null;
};

type Preview = {
  expected: {
    cashCents: number;
    zelleCents: number;
    pagoMovilCents: number;
    transferCents: number;
    otherCents: number;
    cashWithFloatCents: number;
  };
};

function dollarsInputToCents(value: string): number {
  const n = Number(value.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function CashClosePage() {
  const queryClient = useQueryClient();
  const [floatDollars, setFloatDollars] = useState('0');
  const [counted, setCounted] = useState({
    cash: '',
    zelle: '',
    pagoMovil: '',
    transfer: '',
    other: '',
  });
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['cash-sessions'],
    queryFn: () =>
      apiFetch<{ open: CashSession | null; sessions: CashSession[] }>('/api/admin/cash-sessions'),
  });

  const open = listQuery.data?.open ?? null;

  const previewQuery = useQuery({
    queryKey: ['cash-preview', open?.id],
    enabled: Boolean(open?.id),
    queryFn: () => apiFetch<Preview>(`/api/admin/cash-sessions/${open!.id}/preview-close`),
    refetchInterval: 15_000,
  });

  const openMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/admin/cash-sessions/open', {
        method: 'POST',
        body: { openingFloatCents: dollarsInputToCents(floatDollars), notes: notes || null },
      }),
    onSuccess: () => {
      setError(null);
      setNotes('');
      void queryClient.invalidateQueries({ queryKey: ['cash-sessions'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Error'),
  });

  const closeMutation = useMutation({
    mutationFn: () => {
      if (!open) throw new Error('No open session');
      return apiFetch(`/api/admin/cash-sessions/${open.id}/close`, {
        method: 'POST',
        body: {
          countedCashCents: dollarsInputToCents(counted.cash),
          countedZelleCents: dollarsInputToCents(counted.zelle),
          countedPagoMovilCents: dollarsInputToCents(counted.pagoMovil),
          countedTransferCents: dollarsInputToCents(counted.transfer),
          countedOtherCents: dollarsInputToCents(counted.other),
          notes: notes || null,
        },
      });
    },
    onSuccess: () => {
      setError(null);
      setCounted({ cash: '', zelle: '', pagoMovil: '', transfer: '', other: '' });
      setNotes('');
      void queryClient.invalidateQueries({ queryKey: ['cash-sessions'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Error'),
  });

  const expected = previewQuery.data?.expected;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Cierre de caja</h1>
      <p className="text-sm text-stone-600">
        Uso interno: abre con fondo, registra ventas del turno y cuenta al cerrar.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!open && (
        <section className="max-w-md rounded border border-stone-200 bg-white p-4">
          <h2 className="font-medium">Abrir caja</h2>
          <label className="mt-3 block text-sm">
            Fondo inicial (USD)
            <input
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={floatDollars}
              onChange={(e) => setFloatDollars(e.target.value)}
            />
          </label>
          <label className="mt-2 block text-sm">
            Notas
            <input
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="mt-3 rounded bg-stone-900 px-3 py-2 text-sm text-white"
            onClick={() => openMutation.mutate()}
          >
            Abrir turno
          </button>
        </section>
      )}

      {open && (
        <section className="rounded border border-stone-200 bg-white p-4">
          <h2 className="font-medium">Turno abierto</h2>
          <p className="text-sm text-stone-600">
            Desde {new Date(open.openedAt).toLocaleString('es-VE')} · Fondo{' '}
            {formatMoney(open.openingFloatCents)}
            {open.openedBy ? ` · ${open.openedBy.name}` : ''}
          </p>
          {expected && (
            <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
              <li>
                Efectivo esperado (ventas + fondo): {formatMoney(expected.cashWithFloatCents)}
              </li>
              <li>Zelle esperado: {formatMoney(expected.zelleCents)}</li>
              <li>Pago móvil esperado: {formatMoney(expected.pagoMovilCents)}</li>
              <li>Transferencia esperada: {formatMoney(expected.transferCents)}</li>
              <li>Otros: {formatMoney(expected.otherCents)}</li>
            </ul>
          )}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {(
              [
                ['cash', 'Efectivo contado (USD)'],
                ['zelle', 'Zelle contado'],
                ['pagoMovil', 'Pago móvil contado'],
                ['transfer', 'Transferencia contada'],
                ['other', 'Otros contados'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                {label}
                <input
                  className="mt-1 w-full rounded border px-2 py-1.5"
                  value={counted[key]}
                  onChange={(e) => setCounted({ ...counted, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <label className="mt-2 block text-sm">
            Notas de cierre
            <input
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="mt-3 rounded bg-stone-900 px-3 py-2 text-sm text-white"
            onClick={() => closeMutation.mutate()}
          >
            Cerrar caja
          </button>
        </section>
      )}

      <section className="overflow-x-auto rounded border border-stone-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-stone-50 text-xs uppercase text-stone-500">
            <tr>
              <th className="px-3 py-2">Apertura</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Esperado</th>
              <th className="px-3 py-2">Contado</th>
              <th className="px-3 py-2">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {(listQuery.data?.sessions ?? []).map((s) => (
              <tr key={s.id} className="border-t border-stone-100">
                <td className="px-3 py-2">{new Date(s.openedAt).toLocaleString('es-VE')}</td>
                <td className="px-3 py-2">{s.status}</td>
                <td className="px-3 py-2 tabular-nums">
                  {s.expectedCashCents != null ? formatMoney(s.expectedCashCents) : '—'}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {s.countedCashCents != null ? formatMoney(s.countedCashCents) : '—'}
                </td>
                <td
                  className={`px-3 py-2 tabular-nums ${
                    (s.differenceCashCents ?? 0) !== 0 ? 'text-rose-700' : ''
                  }`}
                >
                  {s.differenceCashCents != null ? formatMoney(s.differenceCashCents) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
