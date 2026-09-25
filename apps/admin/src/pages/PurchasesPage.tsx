import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, ApiError } from '../lib/api';
import { formatMoney } from '../lib/orders';

type LineDraft = {
  ingredientId: string;
  quantity: string;
  unitCost: string;
  unitCode: string;
};

const emptyLine = (): LineDraft => ({
  ingredientId: '',
  quantity: '1',
  unitCost: '0',
  unitCode: 'kg',
});

export function PurchasesPage() {
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [paymentTerms, setPaymentTerms] = useState<'CASH' | 'CREDIT'>('CASH');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  const ingredientsQuery = useQuery({
    queryKey: ['ingredients'],
    queryFn: () =>
      apiFetch<{
        ingredients: Array<{
          id: string;
          name: string;
          unit: string;
          unitViews: Array<{ unitCode: string }>;
        }>;
      }>('/api/admin/finance/ingredients'),
  });
  const suppliersQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: () =>
      apiFetch<{
        suppliers: Array<{ id: string; name: string }>;
      }>('/api/admin/finance/suppliers'),
  });
  const purchasesQuery = useQuery({
    queryKey: ['purchases'],
    queryFn: () =>
      apiFetch<{
        purchases: Array<{
          id: string;
          supplierName: string;
          purchasedAt: string;
          totalCents: number;
          paymentTerms: string;
          payableStatus: string;
          items?: Array<{ quantity: string | number; unitCostCents: number }>;
        }>;
      }>('/api/admin/finance/purchases'),
  });

  const draftTotalCents = useMemo(() => {
    return lines.reduce((sum, line) => {
      const qty = Number(line.quantity);
      const unit = Math.round(Number(line.unitCost) * 100);
      if (!line.ingredientId || !(qty > 0) || !(unit >= 0)) return sum;
      return sum + Math.round(qty * unit);
    }, 0);
  }, [lines]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const items = lines
        .filter((l) => l.ingredientId && Number(l.quantity) > 0)
        .map((l) => ({
          ingredientId: l.ingredientId,
          quantity: Number(l.quantity),
          unitCostCents: Math.round(Number(l.unitCost) * 100),
          unitCode: l.unitCode,
        }));
      if (items.length === 0) {
        throw new ApiError(400, 'Agrega al menos un insumo', 'VALIDATION_ERROR');
      }
      const name =
        supplierName.trim() ||
        suppliersQuery.data?.suppliers.find((s) => s.id === supplierId)?.name ||
        '';
      if (!name) {
        throw new ApiError(400, 'Indica un proveedor', 'VALIDATION_ERROR');
      }
      return apiFetch('/api/admin/finance/purchases', {
        method: 'POST',
        body: {
          ...(supplierId ? { supplierId } : {}),
          supplierName: name,
          paymentTerms,
          ...(paymentTerms === 'CREDIT'
            ? { dueAt: new Date(Date.now() + 7 * 86400000).toISOString() }
            : {}),
          items,
        },
      });
    },
    onSuccess: () => {
      setError(null);
      setLines([emptyLine()]);
      void queryClient.invalidateQueries({ queryKey: ['purchases'] });
      void queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      void queryClient.invalidateQueries({ queryKey: ['payables'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Error'),
  });

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-xl font-semibold">Compras</h1>
        <Link to="/finance/suppliers" className="text-sm underline">
          Gestionar proveedores
        </Link>
      </div>

      <section className="rounded border border-stone-200 bg-white p-4">
        <h2 className="font-medium">Registrar compra</h2>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <select
            className="rounded border px-2 py-1.5"
            value={supplierId}
            onChange={(e) => {
              const id = e.target.value;
              setSupplierId(id);
              const found = suppliersQuery.data?.suppliers.find((s) => s.id === id);
              if (found) setSupplierName(found.name);
            }}
          >
            <option value="">Proveedor guardado…</option>
            {(suppliersQuery.data?.suppliers ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            className="rounded border px-2 py-1.5"
            placeholder="O escribe el nombre del proveedor"
            value={supplierName}
            onChange={(e) => {
              setSupplierName(e.target.value);
              setSupplierId('');
            }}
          />
          <select
            className="rounded border px-2 py-1.5"
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value as 'CASH' | 'CREDIT')}
          >
            <option value="CASH">Contado</option>
            <option value="CREDIT">Crédito (CXP)</option>
          </select>
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium text-stone-700">Líneas de insumos</p>
          {lines.map((line, index) => {
            const ing = (ingredientsQuery.data?.ingredients ?? []).find(
              (i) => i.id === line.ingredientId,
            );
            const unitCodes = ing?.unitViews.map((v) => v.unitCode) ?? [
              'kg',
              'g',
              'l',
              'ml',
              'und',
            ];
            return (
              <div key={index} className="grid gap-2 md:grid-cols-5">
                <select
                  className="rounded border px-2 py-1.5 md:col-span-2"
                  value={line.ingredientId}
                  onChange={(e) => {
                    const ingredientId = e.target.value;
                    const found = (ingredientsQuery.data?.ingredients ?? []).find(
                      (i) => i.id === ingredientId,
                    );
                    updateLine(index, {
                      ingredientId,
                      unitCode: found?.unit ?? line.unitCode,
                    });
                  }}
                >
                  <option value="">Insumo</option>
                  {(ingredientsQuery.data?.ingredients ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} (base {item.unit})
                    </option>
                  ))}
                </select>
                <input
                  className="rounded border px-2 py-1.5"
                  placeholder="Cantidad"
                  value={line.quantity}
                  onChange={(e) => updateLine(index, { quantity: e.target.value })}
                />
                <select
                  className="rounded border px-2 py-1.5"
                  value={line.unitCode}
                  onChange={(e) => updateLine(index, { unitCode: e.target.value })}
                >
                  {unitCodes.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    className="min-w-0 flex-1 rounded border px-2 py-1.5"
                    placeholder="Costo / und $"
                    value={line.unitCost}
                    onChange={(e) => updateLine(index, { unitCost: e.target.value })}
                  />
                  {lines.length > 1 && (
                    <button
                      type="button"
                      className="rounded border px-2 text-xs text-red-700"
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                    >
                      Quitar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <button
            type="button"
            className="text-sm underline"
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
          >
            + Agregar línea
          </button>
        </div>

        <p className="mt-3 text-sm text-stone-600">
          Total estimado:{' '}
          <span className="font-medium tabular-nums">{formatMoney(draftTotalCents)}</span>
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button
          type="button"
          className="mt-3 rounded bg-stone-900 px-3 py-1.5 text-sm text-white"
          disabled={createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          Guardar compra
        </button>
      </section>

      <div className="overflow-x-auto rounded border border-stone-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-stone-50 text-xs uppercase text-stone-500">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Proveedor</th>
              <th className="px-3 py-2">Término</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Líneas</th>
              <th className="px-3 py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {(purchasesQuery.data?.purchases ?? []).map((p) => (
              <tr key={p.id} className="border-t border-stone-100">
                <td className="px-3 py-2">{new Date(p.purchasedAt).toLocaleString()}</td>
                <td className="px-3 py-2">{p.supplierName}</td>
                <td className="px-3 py-2">{p.paymentTerms}</td>
                <td className="px-3 py-2">{p.payableStatus}</td>
                <td className="px-3 py-2">{p.items?.length ?? '—'}</td>
                <td className="px-3 py-2 tabular-nums">{formatMoney(p.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
