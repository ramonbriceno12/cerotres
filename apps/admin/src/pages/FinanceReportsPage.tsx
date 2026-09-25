import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch, getAccessToken } from '../lib/api';
import { formatMoney } from '../lib/orders';

export function FinanceReportsPage() {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 16));
  const [expenseCategory, setExpenseCategory] = useState('Operativo');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('0');
  const [wasteIngredientId, setWasteIngredientId] = useState('');
  const [wasteQty, setWasteQty] = useState('0.1');
  const [wasteUnit, setWasteUnit] = useState('kg');
  const [wasteReason, setWasteReason] = useState('');

  const range = useMemo(
    () => ({
      fromIso: new Date(from).toISOString(),
      toIso: new Date(to).toISOString(),
    }),
    [from, to],
  );

  const pnlQuery = useQuery({
    queryKey: ['pnl', range.fromIso, range.toIso],
    queryFn: () =>
      apiFetch<{ report: Record<string, number | string | null> }>(
        `/api/admin/finance/reports/pnl?from=${encodeURIComponent(range.fromIso)}&to=${encodeURIComponent(range.toIso)}`,
      ),
  });
  const cashQuery = useQuery({
    queryKey: ['cashflow', range.fromIso, range.toIso],
    queryFn: () =>
      apiFetch<{
        report: {
          cashInCents: number;
          cashOutCents: number;
          closingBalanceCents: number;
          openingBalanceCents?: number;
        };
      }>(
        `/api/admin/finance/reports/cashflow?from=${encodeURIComponent(range.fromIso)}&to=${encodeURIComponent(range.toIso)}`,
      ),
  });
  const breakQuery = useQuery({
    queryKey: ['breakeven', range.fromIso, range.toIso],
    queryFn: () =>
      apiFetch<{
        report: {
          avgTicketCents: number;
          variableCostPerOrderCents: number;
          fixedCostsCents: number;
          breakEvenOrderCount: number | null;
        };
      }>(
        `/api/admin/finance/reports/breakeven?from=${encodeURIComponent(range.fromIso)}&to=${encodeURIComponent(range.toIso)}`,
      ),
  });
  const payablesQuery = useQuery({
    queryKey: ['payables'],
    queryFn: () =>
      apiFetch<{
        purchases: Array<{ id: string; label: string; amountCents: number; status: string }>;
        expenses: Array<{ id: string; label: string; amountCents: number; status: string }>;
      }>('/api/admin/finance/payables'),
  });
  const receivablesQuery = useQuery({
    queryKey: ['receivables'],
    queryFn: () =>
      apiFetch<{
        receivables: Array<{
          paymentId: string;
          publicCode: string;
          customerName: string;
          amountCents: number;
          channel: string;
        }>;
      }>('/api/admin/finance/receivables'),
  });
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

  const expenseMutation = useMutation({
    mutationFn: async () =>
      apiFetch('/api/admin/finance/expenses', {
        method: 'POST',
        body: {
          category: expenseCategory,
          description: expenseDesc,
          amountCents: Math.round(Number(expenseAmount) * 100),
          paymentTerms: 'CASH',
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pnl'] });
      void queryClient.invalidateQueries({ queryKey: ['cashflow'] });
      setExpenseDesc('');
      setExpenseAmount('0');
    },
  });

  const wasteMutation = useMutation({
    mutationFn: async () =>
      apiFetch('/api/admin/finance/waste', {
        method: 'POST',
        body: {
          reason: wasteReason || null,
          items: [
            { ingredientId: wasteIngredientId, quantity: Number(wasteQty), unitCode: wasteUnit },
          ],
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pnl'] });
      void queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      setWasteReason('');
      setWasteQty('0.1');
    },
  });

  const markPaid = useMutation({
    mutationFn: async (input: { type: 'PURCHASE' | 'EXPENSE'; id: string }) =>
      apiFetch('/api/admin/finance/payables/mark-paid', { method: 'POST', body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['payables'] }),
  });

  const markCollected = useMutation({
    mutationFn: async (paymentId: string) =>
      apiFetch('/api/admin/finance/receivables/mark-collected', {
        method: 'POST',
        body: { paymentId },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['receivables'] });
      void queryClient.invalidateQueries({ queryKey: ['cashflow'] });
      void queryClient.invalidateQueries({ queryKey: ['pnl'] });
    },
  });

  function exportPnl() {
    const token = getAccessToken();
    const url = `${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/api/admin/finance/reports/pnl.csv?from=${encodeURIComponent(range.fromIso)}&to=${encodeURIComponent(range.toIso)}`;
    void fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then((r) => r.blob())
      .then((blob) => {
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = href;
        a.download = 'pnl.csv';
        a.click();
        URL.revokeObjectURL(href);
      });
  }

  const pnl = pnlQuery.data?.report;
  const cash = cashQuery.data?.report;
  const brk = breakQuery.data?.report;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Finanzas / Tablero</h1>
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
          <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={exportPnl}>
            Exportar P&G CSV
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded border border-stone-200 bg-white p-4 text-sm">
          <h2 className="font-medium">P&G del período</h2>
          {pnl && (
            <ul className="mt-2 space-y-1">
              <li>Ventas netas: {formatMoney(Number(pnl.netSalesCents))}</li>
              <li>COGS: {formatMoney(Number(pnl.cogsCents))}</li>
              <li>Comisiones: {formatMoney(Number(pnl.commissionCents))}</li>
              <li>Mermas: {formatMoney(Number(pnl.wasteCents))}</li>
              <li>Utilidad bruta: {formatMoney(Number(pnl.grossProfitCents))}</li>
              <li>Gastos: {formatMoney(Number(pnl.operatingExpensesCents))}</li>
              <li className="font-semibold">
                Utilidad neta: {formatMoney(Number(pnl.netProfitCents))}
              </li>
              <li>
                Food cost:{' '}
                {pnl.foodCostPercent != null
                  ? `${(Number(pnl.foodCostPercent) * 100).toFixed(1)}%`
                  : '—'}
              </li>
            </ul>
          )}
        </div>
        <div className="rounded border border-stone-200 bg-white p-4 text-sm">
          <h2 className="font-medium">Flujo de caja</h2>
          {cash && (
            <ul className="mt-2 space-y-1">
              <li>Entradas: {formatMoney(cash.cashInCents)}</li>
              <li>Salidas: {formatMoney(cash.cashOutCents)}</li>
              <li className="font-semibold">Cierre: {formatMoney(cash.closingBalanceCents)}</li>
            </ul>
          )}
        </div>
        <div className="rounded border border-stone-200 bg-white p-4 text-sm">
          <h2 className="font-medium">Punto de equilibrio</h2>
          {brk && (
            <ul className="mt-2 space-y-1">
              <li>Ticket promedio: {formatMoney(Number(brk.avgTicketCents))}</li>
              <li>Costo variable/pedido: {formatMoney(Number(brk.variableCostPerOrderCents))}</li>
              <li>Fijos: {formatMoney(Number(brk.fixedCostsCents))}</li>
              <li className="font-semibold">
                Pedidos para equilibrar:{' '}
                {brk.breakEvenOrderCount != null ? brk.breakEvenOrderCount : '—'}
              </li>
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded border border-stone-200 bg-white p-4">
          <h2 className="font-medium">Cuentas por pagar</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {(payablesQuery.data?.purchases ?? []).map((row) => (
              <li key={`p-${row.id}`} className="flex items-center justify-between gap-2">
                <span>
                  Compra · {row.label} · {formatMoney(row.amountCents)}
                </span>
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={() => markPaid.mutate({ type: 'PURCHASE', id: row.id })}
                >
                  Marcar pagado
                </button>
              </li>
            ))}
            {(payablesQuery.data?.expenses ?? []).map((row) => (
              <li key={`e-${row.id}`} className="flex items-center justify-between gap-2">
                <span>
                  Gasto · {row.label} · {formatMoney(row.amountCents)}
                </span>
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={() => markPaid.mutate({ type: 'EXPENSE', id: row.id })}
                >
                  Marcar pagado
                </button>
              </li>
            ))}
            {(payablesQuery.data?.purchases.length ?? 0) +
              (payablesQuery.data?.expenses.length ?? 0) ===
              0 && <li className="text-stone-500">Sin CXP abiertas</li>}
          </ul>
        </section>

        <section className="rounded border border-stone-200 bg-white p-4">
          <h2 className="font-medium">Cuentas por cobrar</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {(receivablesQuery.data?.receivables ?? []).map((row) => (
              <li key={row.paymentId} className="flex items-center justify-between gap-2">
                <span>
                  {row.publicCode} · {row.customerName} · {row.channel} ·{' '}
                  <span className="tabular-nums">{formatMoney(row.amountCents)}</span>
                </span>
                <button
                  type="button"
                  className="shrink-0 text-xs underline"
                  onClick={() => markCollected.mutate(row.paymentId)}
                >
                  Marcar cobrado
                </button>
              </li>
            ))}
            {(receivablesQuery.data?.receivables.length ?? 0) === 0 && (
              <li className="text-stone-500">Sin CXC abiertas</li>
            )}
          </ul>
        </section>
      </div>

      <section className="rounded border border-stone-200 bg-white p-4">
        <h2 className="font-medium">Registrar gasto</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            className="rounded border px-2 py-1.5"
            value={expenseCategory}
            onChange={(e) => setExpenseCategory(e.target.value)}
            placeholder="Categoría"
          />
          <input
            className="min-w-[200px] flex-1 rounded border px-2 py-1.5"
            value={expenseDesc}
            onChange={(e) => setExpenseDesc(e.target.value)}
            placeholder="Descripción"
          />
          <input
            className="w-28 rounded border px-2 py-1.5"
            value={expenseAmount}
            onChange={(e) => setExpenseAmount(e.target.value)}
            placeholder="$"
          />
          <button
            type="button"
            className="rounded bg-stone-900 px-3 py-1.5 text-sm text-white"
            onClick={() => expenseMutation.mutate()}
          >
            Guardar
          </button>
        </div>
      </section>

      <section className="rounded border border-stone-200 bg-white p-4">
        <h2 className="font-medium">Registrar merma</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <select
            className="rounded border px-2 py-1.5"
            value={wasteIngredientId}
            onChange={(e) => {
              const id = e.target.value;
              setWasteIngredientId(id);
              const ing = ingredientsQuery.data?.ingredients.find((i) => i.id === id);
              if (ing) setWasteUnit(ing.unit);
            }}
          >
            <option value="">Insumo…</option>
            {(ingredientsQuery.data?.ingredients ?? []).map((ing) => (
              <option key={ing.id} value={ing.id}>
                {ing.name} ({ing.unit})
              </option>
            ))}
          </select>
          <input
            className="w-28 rounded border px-2 py-1.5"
            value={wasteQty}
            onChange={(e) => setWasteQty(e.target.value)}
            placeholder="Cantidad"
          />
          <select
            className="rounded border px-2 py-1.5"
            value={wasteUnit}
            onChange={(e) => setWasteUnit(e.target.value)}
          >
            {(
              ingredientsQuery.data?.ingredients.find((i) => i.id === wasteIngredientId)
                ?.unitViews ?? [{ unitCode: wasteUnit }]
            ).map((v) => (
              <option key={v.unitCode} value={v.unitCode}>
                {v.unitCode}
              </option>
            ))}
          </select>
          <input
            className="min-w-[180px] flex-1 rounded border px-2 py-1.5"
            value={wasteReason}
            onChange={(e) => setWasteReason(e.target.value)}
            placeholder="Motivo (opcional)"
          />
          <button
            type="button"
            disabled={!wasteIngredientId || wasteMutation.isPending}
            className="rounded bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            onClick={() => wasteMutation.mutate()}
          >
            Guardar merma
          </button>
        </div>
      </section>
    </div>
  );
}
