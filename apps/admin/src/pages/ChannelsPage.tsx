import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { formatMoney } from '../lib/orders';

type FeeRate = {
  id: string;
  percent: number;
  fixedFeeCents: number;
  appliesTo: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string | null;
  createdBy: { name: string; email: string };
};

type Channel = {
  id: string;
  code: string;
  name: string;
  requiresExternalRef: boolean;
  feeRates: FeeRate[];
};

export function ChannelsPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [percent, setPercent] = useState('25');
  const [appliesTo, setAppliesTo] = useState('SUBTOTAL');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [note, setNote] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const channelsQuery = useQuery({
    queryKey: ['admin-channels'],
    queryFn: () => apiFetch<{ channels: Channel[] }>('/api/admin/channels'),
  });

  const channels = channelsQuery.data?.channels ?? [];
  const selected = channels.find((c) => c.id === selectedId) ?? channels[0] ?? null;

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const pct = Number(percent) / 100;
      return apiFetch<{ warning: string }>(`/api/admin/channels/${selected.id}/fee-rates`, {
        method: 'POST',
        body: {
          percent: pct,
          appliesTo,
          effectiveFrom: new Date(effectiveFrom).toISOString(),
          ...(note ? { note } : {}),
        },
      });
    },
    onSuccess: (data) => {
      setWarning(data?.warning ?? null);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-channels'] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear la tarifa');
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Canales y tarifas</h1>
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <aside className="rounded border border-stone-200 bg-white p-2">
          {channels.map((channel) => (
            <button
              key={channel.id}
              type="button"
              onClick={() => setSelectedId(channel.id)}
              className={`mb-1 w-full rounded px-3 py-2 text-left text-sm ${
                selected?.id === channel.id ? 'bg-stone-900 text-white' : 'hover:bg-stone-100'
              }`}
            >
              {channel.name}
              <span className="block text-xs opacity-70">{channel.code}</span>
            </button>
          ))}
        </aside>

        {selected && (
          <div className="space-y-4">
            <section className="rounded border border-stone-200 bg-white p-4">
              <h2 className="font-medium">Línea de tiempo · {selected.name}</h2>
              <ol className="mt-3 space-y-3">
                {selected.feeRates.map((rate) => (
                  <li key={rate.id} className="border-l-2 border-stone-300 pl-3 text-sm">
                    <p className="font-medium">
                      {(rate.percent * 100).toFixed(2)}% · {rate.appliesTo}
                      {!rate.effectiveTo && (
                        <span className="ml-2 rounded bg-emerald-100 px-1.5 text-xs text-emerald-800">
                          vigente
                        </span>
                      )}
                    </p>
                    <p className="text-stone-500">
                      {new Date(rate.effectiveFrom).toLocaleDateString()} →{' '}
                      {rate.effectiveTo
                        ? new Date(rate.effectiveTo).toLocaleDateString()
                        : 'abierta'}
                    </p>
                    <p className="text-stone-500">
                      {rate.createdBy.name}
                      {rate.note ? ` · ${rate.note}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded border border-stone-200 bg-white p-4">
              <h2 className="font-medium">Nueva tarifa</h2>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <label className="text-sm">
                  Porcentaje
                  <input
                    className="mt-1 w-full rounded border px-2 py-1.5"
                    value={percent}
                    onChange={(e) => setPercent(e.target.value)}
                    placeholder="25"
                  />
                </label>
                <label className="text-sm">
                  Aplica a
                  <select
                    className="mt-1 w-full rounded border px-2 py-1.5"
                    value={appliesTo}
                    onChange={(e) => setAppliesTo(e.target.value)}
                  >
                    <option value="SUBTOTAL">SUBTOTAL</option>
                    <option value="SUBTOTAL_PLUS_DELIVERY">SUBTOTAL_PLUS_DELIVERY</option>
                    <option value="ORDER_TOTAL">ORDER_TOTAL</option>
                  </select>
                </label>
                <label className="text-sm">
                  Vigente desde
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded border px-2 py-1.5"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Motivo
                  <input
                    className="mt-1 w-full rounded border px-2 py-1.5"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
              </div>
              {warning && (
                <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {warning}
                </p>
              )}
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              <button
                type="button"
                disabled={!effectiveFrom || createMutation.isPending}
                onClick={() => createMutation.mutate()}
                className="mt-3 rounded bg-stone-900 px-3 py-2 text-sm text-white disabled:opacity-40"
              >
                Crear tarifa (cierra la anterior)
              </button>
            </section>
          </div>
        )}
      </div>
      <p className="text-xs text-stone-500">
        Los importes se muestran en centavos en reportes; aquí el % es editable como número humano
        (25 = 25%). Total ejemplo: {formatMoney(10000)}.
      </p>
    </div>
  );
}
