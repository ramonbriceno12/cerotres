import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import { formatMoney } from '../lib/orders';

type RecipeLine = {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  quantity: number;
  unitCostCents: number;
  lineCostCents: number;
};

type FoodCostRow = {
  productId: string;
  name: string;
  category: string;
  priceCents: number;
  recipeCostCents: number;
  marginCents: number;
  marginPercent: number | null;
  foodCostPercent: number | null;
  lines: RecipeLine[];
};

type ModifierCostRow = {
  modifierOptionId: string;
  name: string;
  groupName: string;
  priceDeltaCents: number;
  recipeCostCents: number;
  marginCents: number;
  foodCostPercent: number | null;
  lines: RecipeLine[];
};

type Ingredient = {
  id: string;
  name: string;
  unit: string;
  unitViews: Array<{ unitCode: string }>;
};

type DraftLine = { ingredientId: string; quantity: string; unitCode: string };

export function RecipesPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'products' | 'modifiers'>('products');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [draftLines, setDraftLines] = useState<DraftLine[]>([
    { ingredientId: '', quantity: '100', unitCode: 'g' },
  ]);
  const [error, setError] = useState<string | null>(null);

  const foodQuery = useQuery({
    queryKey: ['food-costs'],
    queryFn: () => apiFetch<{ products: FoodCostRow[] }>('/api/admin/finance/food-costs'),
  });
  const modifierQuery = useQuery({
    queryKey: ['modifier-food-costs'],
    queryFn: () =>
      apiFetch<{ options: ModifierCostRow[] }>('/api/admin/finance/modifier-food-costs'),
  });
  const ingredientsQuery = useQuery({
    queryKey: ['ingredients'],
    queryFn: () => apiFetch<{ ingredients: Ingredient[] }>('/api/admin/finance/ingredients'),
  });

  const selectedProduct =
    foodQuery.data?.products.find((p) => p.productId === selectedProductId) ?? null;
  const selectedOption =
    modifierQuery.data?.options.find((o) => o.modifierOptionId === selectedOptionId) ?? null;
  const selected = tab === 'products' ? selectedProduct : selectedOption;
  const ingredients = ingredientsQuery.data?.ingredients ?? [];

  useEffect(() => {
    if (!selected) return;
    if (selected.lines.length === 0) {
      setDraftLines([{ ingredientId: '', quantity: '100', unitCode: 'g' }]);
      return;
    }
    setDraftLines(
      selected.lines.map((line) => ({
        ingredientId: line.ingredientId,
        quantity: String(line.quantity),
        unitCode: line.unit,
      })),
    );
  }, [selected]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const lines = draftLines
        .filter((l) => l.ingredientId && Number(l.quantity) > 0)
        .map((l) => ({
          ingredientId: l.ingredientId,
          quantity: Number(l.quantity),
          unitCode: l.unitCode,
        }));
      if (tab === 'products') {
        if (!selectedProductId) return;
        return apiFetch(`/api/admin/finance/recipes/${selectedProductId}`, {
          method: 'PUT',
          body: { lines },
        });
      }
      if (!selectedOptionId) return;
      return apiFetch(`/api/admin/finance/modifier-recipes/${selectedOptionId}`, {
        method: 'PUT',
        body: { lines },
      });
    },
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['food-costs'] });
      void queryClient.invalidateQueries({ queryKey: ['modifier-food-costs'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Error'),
  });

  function unitsFor(ingredientId: string): string[] {
    const ing = ingredients.find((i) => i.id === ingredientId);
    if (!ing) return ['kg', 'g', 'l', 'ml', 'und'];
    return ing.unitViews.map((v) => v.unitCode);
  }

  const title =
    tab === 'products'
      ? selectedProduct
        ? `Receta · ${selectedProduct.name}`
        : 'Elige un producto'
      : selectedOption
        ? `Receta · ${selectedOption.name}`
        : 'Elige un extra / salsa';

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Recetas y food cost</h1>
      <p className="text-sm text-stone-600">
        Productos base y extras/salsas. Las cantidades se convierten a la unidad base del insumo.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className={`rounded px-3 py-1.5 text-sm ${
            tab === 'products' ? 'bg-stone-900 text-white' : 'border border-stone-300 bg-white'
          }`}
          onClick={() => setTab('products')}
        >
          Productos
        </button>
        <button
          type="button"
          className={`rounded px-3 py-1.5 text-sm ${
            tab === 'modifiers' ? 'bg-stone-900 text-white' : 'border border-stone-300 bg-white'
          }`}
          onClick={() => setTab('modifiers')}
        >
          Extras y salsas
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto rounded border border-stone-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase text-stone-500">
              <tr>
                <th className="px-3 py-2">{tab === 'products' ? 'Producto' : 'Opción'}</th>
                <th className="px-3 py-2">Precio</th>
                <th className="px-3 py-2">Costo</th>
                <th className="px-3 py-2">Food cost</th>
                <th className="px-3 py-2">Margen</th>
              </tr>
            </thead>
            <tbody>
              {tab === 'products' &&
                (foodQuery.data?.products ?? []).map((row) => (
                  <tr
                    key={row.productId}
                    className={`cursor-pointer border-t border-stone-100 hover:bg-stone-50 ${
                      selectedProductId === row.productId ? 'bg-stone-100' : ''
                    }`}
                    onClick={() => setSelectedProductId(row.productId)}
                  >
                    <td className="px-3 py-2">
                      {row.name}
                      <span className="block text-xs text-stone-500">{row.category}</span>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(row.priceCents)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(row.recipeCostCents)}</td>
                    <td
                      className={`px-3 py-2 ${
                        (row.foodCostPercent ?? 0) > 0.4 ? 'bg-rose-100 text-rose-800' : ''
                      }`}
                    >
                      {row.foodCostPercent != null
                        ? `${(row.foodCostPercent * 100).toFixed(1)}%`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(row.marginCents)}</td>
                  </tr>
                ))}
              {tab === 'modifiers' &&
                (modifierQuery.data?.options ?? []).map((row) => (
                  <tr
                    key={row.modifierOptionId}
                    className={`cursor-pointer border-t border-stone-100 hover:bg-stone-50 ${
                      selectedOptionId === row.modifierOptionId ? 'bg-stone-100' : ''
                    }`}
                    onClick={() => setSelectedOptionId(row.modifierOptionId)}
                  >
                    <td className="px-3 py-2">
                      {row.name}
                      <span className="block text-xs text-stone-500">{row.groupName}</span>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(row.priceDeltaCents)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(row.recipeCostCents)}</td>
                    <td
                      className={`px-3 py-2 ${
                        (row.foodCostPercent ?? 0) > 0.4 ? 'bg-rose-100 text-rose-800' : ''
                      }`}
                    >
                      {row.foodCostPercent != null
                        ? `${(row.foodCostPercent * 100).toFixed(1)}%`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(row.marginCents)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <section className="rounded border border-stone-200 bg-white p-4">
          <h2 className="font-medium">{title}</h2>
          {selected && (
            <>
              <div className="mt-3 space-y-2">
                {draftLines.map((line, idx) => (
                  <div key={idx} className="grid gap-2 sm:grid-cols-[1fr_5rem_4.5rem]">
                    <select
                      className="rounded border px-2 py-1.5 text-sm"
                      value={line.ingredientId}
                      onChange={(e) => {
                        const ingredientId = e.target.value;
                        const ing = ingredients.find((i) => i.id === ingredientId);
                        const next = [...draftLines];
                        next[idx] = {
                          ...line,
                          ingredientId,
                          unitCode: ing?.unit ?? line.unitCode,
                        };
                        setDraftLines(next);
                      }}
                    >
                      <option value="">Insumo</option>
                      {ingredients.map((ing) => (
                        <option key={ing.id} value={ing.id}>
                          {ing.name} (base {ing.unit})
                        </option>
                      ))}
                    </select>
                    <input
                      className="rounded border px-2 py-1.5 text-sm"
                      value={line.quantity}
                      onChange={(e) => {
                        const next = [...draftLines];
                        next[idx] = { ...line, quantity: e.target.value };
                        setDraftLines(next);
                      }}
                    />
                    <select
                      className="rounded border px-2 py-1.5 text-sm"
                      value={line.unitCode}
                      onChange={(e) => {
                        const next = [...draftLines];
                        next[idx] = { ...line, unitCode: e.target.value };
                        setDraftLines(next);
                      }}
                    >
                      {unitsFor(line.ingredientId).map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="rounded border px-3 py-1.5 text-sm"
                  onClick={() =>
                    setDraftLines([
                      ...draftLines,
                      { ingredientId: '', quantity: '100', unitCode: 'g' },
                    ])
                  }
                >
                  + línea
                </button>
                <button
                  type="button"
                  className="rounded bg-stone-900 px-3 py-1.5 text-sm text-white"
                  onClick={() => saveMutation.mutate()}
                >
                  Guardar receta
                </button>
              </div>
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              {selected.lines.length > 0 && (
                <ul className="mt-4 space-y-1 border-t pt-3 text-xs text-stone-600">
                  {selected.lines.map((line) => (
                    <li key={line.ingredientId}>
                      Guardado: {line.quantity} {line.unit} · {formatMoney(line.lineCostCents)}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
