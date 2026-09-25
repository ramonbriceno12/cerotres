import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';

type Rate = {
  id: string;
  bolivarsPerUsd: number;
  effectiveFrom: string;
  note: string | null;
};

export function ExchangeRatePage() {
  const queryClient = useQueryClient();
  const [rate, setRate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['exchange-rate'],
    queryFn: () =>
      apiFetch<{ active: Rate | null; history: Rate[] }>('/api/admin/finance/exchange-rate'),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/admin/finance/exchange-rate', {
        method: 'POST',
        body: {
          bolivarsPerUsd: Number(rate.replace(',', '.')),
          note: note || null,
        },
      }),
    onSuccess: () => {
      setError(null);
      setRate('');
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['exchange-rate'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Error'),
  });

  const active = query.data?.active;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Tasa USD / Bs</h1>
      <p className="text-sm text-stone-600">
        Uso interno. Los totales se guardan en dólares; la tasa sirve para mostrar y cobrar en
        bolívares.
      </p>

      <section className="max-w-md rounded border border-stone-200 bg-white p-4">
        <p className="text-sm text-stone-600">Tasa activa</p>
        <p className="text-2xl font-semibold tabular-nums">
          {active ? `${active.bolivarsPerUsd.toFixed(4)} Bs / $` : 'Sin tasa'}
        </p>
        {active && (
          <p className="text-xs text-stone-500">
            Desde {new Date(active.effectiveFrom).toLocaleString('es-VE')}
          </p>
        )}
        <label className="mt-4 block text-sm">
          Nueva tasa (Bs por 1 USD)
          <input
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="36.5000"
          />
        </label>
        <label className="mt-2 block text-sm">
          Nota
          <input
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button
          type="button"
          className="mt-3 rounded bg-stone-900 px-3 py-2 text-sm text-white"
          disabled={!rate || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          Guardar tasa
        </button>
      </section>

      <section className="overflow-x-auto rounded border border-stone-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-stone-50 text-xs uppercase text-stone-500">
            <tr>
              <th className="px-3 py-2">Vigente desde</th>
              <th className="px-3 py-2">Bs / USD</th>
              <th className="px-3 py-2">Nota</th>
            </tr>
          </thead>
          <tbody>
            {(query.data?.history ?? []).map((row) => (
              <tr key={row.id} className="border-t border-stone-100">
                <td className="px-3 py-2">{new Date(row.effectiveFrom).toLocaleString('es-VE')}</td>
                <td className="px-3 py-2 tabular-nums">{row.bolivarsPerUsd.toFixed(4)}</td>
                <td className="px-3 py-2">{row.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
