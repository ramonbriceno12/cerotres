import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { formatMoney } from '../lib/orders';

type UnitView = {
  unitCode: string;
  unitName: string;
  stockQuantity: number;
  minStockQuantity: number;
  avgCostCents: number;
};

type Ingredient = {
  id: string;
  code: string | null;
  name: string;
  unit: string;
  avgCostCents: number;
  lastCostCents: number;
  stockQuantity: number;
  minStockQuantity: number;
  lowStock: boolean;
  inventoryValueCents: number;
  conversions: Array<{ unitCode: string; factorToBase: number; note: string | null }>;
  unitViews: UnitView[];
};

type UnitDef = { code: string; name: string; dimension: string };

function formatUnitCost(cents: number): string {
  if (Math.abs(cents) >= 1) return formatMoney(Math.round(cents));
  return `$${(cents / 100).toFixed(4)}`;
}

function formatQty(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/\.?0+$/, '');
}

export function IngredientsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('kg');
  const [code, setCode] = useState('');
  const [avgCost, setAvgCost] = useState('0');
  const [stock, setStock] = useState('0');
  const [minStock, setMinStock] = useState('0');
  const [displayById, setDisplayById] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const unitsQuery = useQuery({
    queryKey: ['units'],
    queryFn: () => apiFetch<{ units: UnitDef[] }>('/api/admin/finance/units'),
  });

  const listQuery = useQuery({
    queryKey: ['ingredients'],
    queryFn: () => apiFetch<{ ingredients: Ingredient[] }>('/api/admin/finance/ingredients'),
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      apiFetch('/api/admin/finance/ingredients', {
        method: 'POST',
        body: {
          name,
          unit,
          ...(code ? { code } : {}),
          avgCostCents: Math.round(Number(avgCost) * 100),
          stockQuantity: Number(stock),
          minStockQuantity: Number(minStock),
        },
      }),
    onSuccess: () => {
      setName('');
      setCode('');
      setAvgCost('0');
      setStock('0');
      setMinStock('0');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['ingredients'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Error'),
  });

  const unitOptions = useMemo(() => unitsQuery.data?.units ?? [], [unitsQuery.data]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Insumos / inventario</h1>
      <p className="text-sm text-stone-600">
        El stock y el costo se guardan en la <strong>unidad base</strong>. Puedes verlos en kg, g,
        ml, und, etc. sin cambiar los números guardados.
      </p>

      <section className="rounded border border-stone-200 bg-white p-4">
        <h2 className="font-medium">Nuevo insumo</h2>
        <div className="mt-2 grid gap-2 md:grid-cols-3 lg:grid-cols-6">
          <input
            className="rounded border px-2 py-1.5"
            placeholder="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="rounded border px-2 py-1.5"
            placeholder="Código"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <select
            className="rounded border px-2 py-1.5"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          >
            {unitOptions.map((u) => (
              <option key={u.code} value={u.code}>
                {u.code} — {u.name}
              </option>
            ))}
          </select>
          <input
            className="rounded border px-2 py-1.5"
            placeholder="Costo unitario $ (base)"
            value={avgCost}
            onChange={(e) => setAvgCost(e.target.value)}
          />
          <input
            className="rounded border px-2 py-1.5"
            placeholder="Stock (base)"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
          />
          <input
            className="rounded border px-2 py-1.5"
            placeholder="Stock mínimo (base)"
            value={minStock}
            onChange={(e) => setMinStock(e.target.value)}
          />
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button
          type="button"
          className="mt-3 rounded bg-stone-900 px-3 py-1.5 text-sm text-white"
          onClick={() => createMutation.mutate()}
        >
          Guardar
        </button>
      </section>

      <div className="overflow-x-auto rounded border border-stone-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-stone-50 text-xs uppercase text-stone-500">
            <tr>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Base</th>
              <th className="px-3 py-2">Ver en</th>
              <th className="px-3 py-2">Stock</th>
              <th className="px-3 py-2">Mín.</th>
              <th className="px-3 py-2">Costo / und</th>
              <th className="px-3 py-2">Valor</th>
            </tr>
          </thead>
          <tbody>
            {(listQuery.data?.ingredients ?? []).map((ing) => {
              const displayUnit = displayById[ing.id] ?? ing.unit;
              const view =
                ing.unitViews.find((v) => v.unitCode === displayUnit) ??
                ing.unitViews.find((v) => v.unitCode === ing.unit);
              return (
                <tr
                  key={ing.id}
                  className={`border-t border-stone-100 ${ing.lowStock ? 'bg-amber-50' : ''}`}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{ing.name}</div>
                    {ing.code && <div className="text-xs text-stone-500">{ing.code}</div>}
                  </td>
                  <td className="px-3 py-2">{ing.unit}</td>
                  <td className="px-3 py-2">
                    <select
                      className="rounded border px-2 py-1 text-sm"
                      value={displayUnit}
                      onChange={(e) =>
                        setDisplayById((prev) => ({ ...prev, [ing.id]: e.target.value }))
                      }
                    >
                      {ing.unitViews.map((v) => (
                        <option key={v.unitCode} value={v.unitCode}>
                          {v.unitCode}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {view ? `${formatQty(view.stockQuantity)} ${view.unitCode}` : '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {view ? `${formatQty(view.minStockQuantity)} ${view.unitCode}` : '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {view ? `${formatUnitCost(view.avgCostCents)} / ${view.unitCode}` : '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{formatMoney(ing.inventoryValueCents)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
