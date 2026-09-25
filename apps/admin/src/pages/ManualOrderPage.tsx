import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { calculateLinePrice, resolveChannelPriceCents } from '@cerotres/shared';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, ApiError } from '../lib/api';
import { formatMoney } from '../lib/orders';

type Channel = {
  id: string;
  code: string;
  name: string;
  requiresExternalRef: boolean;
};

type Zone = { id: string; name: string; feeCents: number };

type CatalogProduct = {
  id: string;
  name: string;
  priceCents: number;
  description: string | null;
  channelPrices: Array<{ channelId: string; priceCents: number }>;
  modifierGroups: Array<{
    id: string;
    name: string;
    selectionType: 'SINGLE' | 'MULTI';
    minSelect: number;
    maxSelect: number | null;
    freeQuantity: number;
    freeStrategy: 'HIGHEST_PRICE_FIRST' | 'SELECTION_ORDER';
    maxQtyPerOption: number;
    options: Array<{ id: string; name: string; priceDelta: number; description: string | null }>;
  }>;
};

type CartLine = {
  key: string;
  productId: string;
  productName: string;
  quantity: number;
  lineTotalCents: number;
  options: Array<{
    optionId: string;
    quantity: number;
    name: string;
    priceDelta: number;
    groupId: string;
  }>;
};

function productPriceForChannel(product: CatalogProduct, channelId: string): number {
  const override = product.channelPrices.find((row) => row.channelId === channelId);
  return resolveChannelPriceCents(product.priceCents, override?.priceCents);
}

function withChannelPrice(product: CatalogProduct, channelId: string): CatalogProduct {
  return { ...product, priceCents: productPriceForChannel(product, channelId) };
}

function lineTotalForProduct(
  product: CatalogProduct,
  quantity: number,
  options: CartLine['options'],
): number {
  return calculateLinePrice({
    productName: product.name,
    basePriceCents: product.priceCents,
    quantity,
    groups: product.modifierGroups.map((g) => ({
      groupId: g.id,
      name: g.name,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      freeQuantity: g.freeQuantity,
      freeStrategy: g.freeStrategy,
    })),
    selectedOptions: options.map((o) => ({
      optionId: o.optionId,
      groupId: o.groupId,
      name: o.name,
      priceDelta: o.priceDelta,
      quantity: o.quantity,
    })),
  }).lineTotalCents;
}

export function ManualOrderPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const metaQuery = useQuery({
    queryKey: ['orders-meta'],
    queryFn: () =>
      apiFetch<{ channels: Channel[]; zones: Zone[]; paymentMethods: string[] }>(
        '/api/admin/orders/meta',
      ),
  });
  const catalogQuery = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () =>
      apiFetch<{
        categories: Array<{
          products: Array<{
            id: string;
            name: string;
            description: string | null;
            priceCents: number;
            channelPrices?: Array<{ channelId: string; priceCents: number }>;
            modifierGroups: Array<{
              group: {
                id: string;
                name: string;
                selectionType: 'SINGLE' | 'MULTI';
                minSelect: number;
                maxSelect: number | null;
                freeQuantity: number;
                freeStrategy: 'HIGHEST_PRICE_FIRST' | 'SELECTION_ORDER';
                maxQtyPerOption: number;
                options: Array<{
                  id: string;
                  name: string;
                  priceDelta: number;
                  description: string | null;
                }>;
              };
              minSelectOverride: number | null;
              maxSelectOverride: number | null;
              freeQuantityOverride: number | null;
            }>;
          }>;
        }>;
      }>('/api/admin/catalog/categories'),
  });

  const products: CatalogProduct[] = useMemo(() => {
    const list: CatalogProduct[] = [];
    for (const category of catalogQuery.data?.categories ?? []) {
      for (const product of category.products) {
        list.push({
          id: product.id,
          name: product.name,
          description: product.description,
          priceCents: product.priceCents,
          channelPrices: product.channelPrices ?? [],
          modifierGroups: product.modifierGroups.map((link) => ({
            id: link.group.id,
            name: link.group.name,
            selectionType: link.group.selectionType,
            minSelect: link.minSelectOverride ?? link.group.minSelect,
            maxSelect: link.maxSelectOverride ?? link.group.maxSelect,
            freeQuantity: link.freeQuantityOverride ?? link.group.freeQuantity,
            freeStrategy: link.group.freeStrategy,
            maxQtyPerOption: link.group.maxQtyPerOption,
            options: link.group.options,
          })),
        });
      }
    }
    return list;
  }, [catalogQuery.data]);

  const [channelId, setChannelId] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [fulfillment, setFulfillment] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [zoneId, setZoneId] = useState('');
  const [address, setAddress] = useState('');
  const [placedAt, setPlacedAt] = useState('');
  const [payments, setPayments] = useState<
    Array<{ method: string; amount: string; reference: string }>
  >([{ method: 'CASH', amount: '', reference: '' }]);
  const [paymentsConfirmed, setPaymentsConfirmed] = useState(true);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [builderProduct, setBuilderProduct] = useState<CatalogProduct | null>(null);
  const [qtyByOption, setQtyByOption] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const channel = metaQuery.data?.channels.find((c) => c.id === channelId);
  const displayProducts = useMemo(
    () => products.map((product) => withChannelPrice(product, channelId)),
    [products, channelId],
  );

  useEffect(() => {
    setLines((prev) => {
      if (prev.length === 0) return prev;
      let changed = false;
      const next = prev.map((line) => {
        const product = displayProducts.find((p) => p.id === line.productId);
        if (!product) return line;
        const lineTotalCents = lineTotalForProduct(product, line.quantity, line.options);
        if (lineTotalCents === line.lineTotalCents) return line;
        changed = true;
        return { ...line, lineTotalCents };
      });
      return changed ? next : prev;
    });
    setBuilderProduct((prev) => {
      if (!prev) return prev;
      const next = displayProducts.find((p) => p.id === prev.id);
      return next ?? prev;
    });
  }, [displayProducts]);
  const zone = metaQuery.data?.zones.find((z) => z.id === zoneId);
  const deliveryFee = fulfillment === 'DELIVERY' ? (zone?.feeCents ?? 0) : 0;
  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const totalCents = subtotalCents + deliveryFee;
  const paidCents = payments.reduce((sum, p) => {
    const n = Number(p.amount.replace(',', '.'));
    return sum + (Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0);
  }, 0);
  const remainingCents = totalCents - paidCents;

  useEffect(() => {
    setPayments((prev) => {
      if (prev.length !== 1) return prev;
      const only = prev[0]!;
      if (only.amount !== '' && Number(only.amount) > 0) return prev;
      return [{ ...only, amount: (totalCents / 100).toFixed(2) }];
    });
  }, [totalCents]);

  const previewQuery = useQuery({
    queryKey: ['commission-preview', channelId, placedAt, subtotalCents, deliveryFee, totalCents],
    enabled: Boolean(channelId) && totalCents > 0,
    queryFn: () =>
      apiFetch<{
        percent: number;
        commissionAmountCents: number;
        warning: string | null;
        effectiveFrom: string | null;
      }>('/api/admin/orders/preview-commission', {
        method: 'POST',
        body: {
          channelId,
          ...(placedAt ? { placedAt: new Date(placedAt).toISOString() } : {}),
          subtotalCents,
          deliveryFeeCents: deliveryFee,
          totalCents,
        },
      }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const paymentLines = payments
        .map((p) => ({
          method: p.method,
          amountCents: Math.round(Number(p.amount.replace(',', '.')) * 100),
          reference: p.reference.trim() || undefined,
        }))
        .filter((p) => p.amountCents > 0);
      return apiFetch<{ order: { id: string; publicCode: string } }>('/api/admin/orders', {
        method: 'POST',
        body: {
          channelId,
          ...(externalRef ? { externalOrderRef: externalRef } : {}),
          customerName,
          ...(customerEmail ? { customerEmail } : {}),
          ...(customerPhone ? { customerPhone } : {}),
          fulfillmentType: fulfillment,
          ...(fulfillment === 'DELIVERY' ? { deliveryZoneId: zoneId, addressLine1: address } : {}),
          ...(notes ? { notes } : {}),
          ...(placedAt ? { placedAt: new Date(placedAt).toISOString() } : {}),
          payments: paymentLines,
          paymentsConfirmed,
          clientTotalCents: totalCents,
          items: lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            clientLineTotalCents: line.lineTotalCents,
            options: line.options.map((o) => ({ optionId: o.optionId, quantity: o.quantity })),
          })),
        },
      });
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['kitchen-board'] });
      navigate(`/orders/${data.order.id}`);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el pedido');
    },
  });

  function addCurrentBuilder() {
    if (!builderProduct) return;
    const selections = Object.entries(qtyByOption)
      .filter(([, qty]) => qty > 0)
      .map(([optionId, quantity]) => {
        const group = builderProduct.modifierGroups.find((g) =>
          g.options.some((o) => o.id === optionId),
        )!;
        const option = group.options.find((o) => o.id === optionId)!;
        return {
          optionId,
          groupId: group.id,
          name: option.name,
          priceDelta: option.priceDelta,
          quantity,
        };
      });

    const priced = calculateLinePrice({
      productName: builderProduct.name,
      basePriceCents: builderProduct.priceCents,
      quantity: 1,
      groups: builderProduct.modifierGroups.map((g) => ({
        groupId: g.id,
        name: g.name,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        freeQuantity: g.freeQuantity,
        freeStrategy: g.freeStrategy,
      })),
      selectedOptions: selections,
    });

    const key = `${builderProduct.id}::${selections.map((s) => `${s.optionId}x${s.quantity}`).join(',')}`;
    setLines((prev) => [
      ...prev,
      {
        key,
        productId: builderProduct.id,
        productName: builderProduct.name,
        quantity: 1,
        lineTotalCents: priced.lineTotalCents,
        options: selections,
      },
    ]);
    setBuilderProduct(null);
    setQtyByOption({});
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!channelId || lines.length === 0 || !customerName) {
      setError('Completa canal, cliente e ítems');
      return;
    }
    if (channel?.requiresExternalRef && !externalRef.trim()) {
      setError('Este canal requiere referencia externa');
      return;
    }
    if (remainingCents !== 0) {
      setError(`Los pagos deben sumar el total. Diferencia: ${formatMoney(remainingCents)}`);
      return;
    }
    createMutation.mutate();
  }

  return (
    <div className="space-y-4">
      <div>
        <Link to="/orders" className="text-sm text-stone-500 underline">
          ← Pedidos
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Alta manual</h1>
      </div>

      <form className="grid gap-4 lg:grid-cols-2" onSubmit={onSubmit}>
        <section className="space-y-3 rounded border border-stone-200 bg-white p-4">
          <h2 className="font-medium">Datos</h2>
          <select
            required
            className="w-full rounded border border-stone-300 px-2 py-2"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
          >
            <option value="">Canal de venta</option>
            {(metaQuery.data?.channels ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {channel?.requiresExternalRef && (
            <input
              required
              placeholder="Referencia externa"
              className="w-full rounded border border-stone-300 px-2 py-2"
              value={externalRef}
              onChange={(e) => setExternalRef(e.target.value)}
            />
          )}
          <input
            required
            placeholder="Nombre del cliente"
            className="w-full rounded border border-stone-300 px-2 py-2"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
          <input
            placeholder="Teléfono"
            className="w-full rounded border border-stone-300 px-2 py-2"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
          />
          <input
            type="email"
            placeholder="Email (opcional)"
            className="w-full rounded border border-stone-300 px-2 py-2"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
          />
          <div className="flex gap-2">
            {(['PICKUP', 'DELIVERY'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setFulfillment(type)}
                className={`flex-1 rounded border px-2 py-2 text-sm ${
                  fulfillment === type ? 'border-stone-900 bg-stone-900 text-white' : ''
                }`}
              >
                {type}
              </button>
            ))}
          </div>
          {fulfillment === 'DELIVERY' && (
            <>
              <select
                required
                className="w-full rounded border border-stone-300 px-2 py-2"
                value={zoneId}
                onChange={(e) => setZoneId(e.target.value)}
              >
                <option value="">Zona</option>
                {(metaQuery.data?.zones ?? []).map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} · {formatMoney(z.feeCents)}
                  </option>
                ))}
              </select>
              <input
                required
                placeholder="Dirección"
                className="w-full rounded border border-stone-300 px-2 py-2"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </>
          )}
          <label className="block text-sm text-stone-600">
            Fecha del pedido (retroactiva opcional)
            <input
              type="datetime-local"
              className="mt-1 w-full rounded border border-stone-300 px-2 py-2"
              value={placedAt}
              onChange={(e) => setPlacedAt(e.target.value)}
            />
          </label>
          {previewQuery.data && (
            <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Comisión estimada: {formatMoney(previewQuery.data.commissionAmountCents)} (
              {(previewQuery.data.percent * 100).toFixed(2)}%).{' '}
              {previewQuery.data.warning ?? 'Tarifa vigente ahora.'}
            </p>
          )}
          <div className="space-y-2 rounded border border-stone-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Pagos</p>
              <button
                type="button"
                className="text-xs underline"
                onClick={() =>
                  setPayments((prev) => [
                    ...prev,
                    {
                      method: metaQuery.data?.paymentMethods?.[0] ?? 'CASH',
                      amount: remainingCents > 0 ? (remainingCents / 100).toFixed(2) : '',
                      reference: '',
                    },
                  ])
                }
              >
                + Método
              </button>
            </div>
            {payments.map((row, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-3">
                <select
                  className="rounded border border-stone-300 px-2 py-1.5 text-sm"
                  value={row.method}
                  onChange={(e) =>
                    setPayments((prev) =>
                      prev.map((p, i) => (i === index ? { ...p, method: e.target.value } : p)),
                    )
                  }
                >
                  {(
                    metaQuery.data?.paymentMethods ?? ['CASH', 'PAGO_MOVIL', 'ZELLE', 'TRANSFER']
                  ).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <input
                  className="rounded border border-stone-300 px-2 py-1.5 text-sm tabular-nums"
                  placeholder="Monto $"
                  value={row.amount}
                  onChange={(e) =>
                    setPayments((prev) =>
                      prev.map((p, i) => (i === index ? { ...p, amount: e.target.value } : p)),
                    )
                  }
                />
                <div className="flex gap-2">
                  <input
                    className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1.5 text-sm"
                    placeholder="Ref."
                    value={row.reference}
                    onChange={(e) =>
                      setPayments((prev) =>
                        prev.map((p, i) => (i === index ? { ...p, reference: e.target.value } : p)),
                      )
                    }
                  />
                  {payments.length > 1 && (
                    <button
                      type="button"
                      className="text-xs text-red-700 underline"
                      onClick={() => setPayments((prev) => prev.filter((_, i) => i !== index))}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
            <p className={`text-xs ${remainingCents === 0 ? 'text-stone-600' : 'text-amber-800'}`}>
              {remainingCents === 0
                ? 'Pagos = total'
                : `Falta / sobra: ${formatMoney(remainingCents)}`}
            </p>
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={paymentsConfirmed}
                onChange={(e) => setPaymentsConfirmed(e.target.checked)}
              />
              Marcar pagos como cobrados
            </label>
          </div>
          <textarea
            placeholder="Notas"
            className="w-full rounded border border-stone-300 px-2 py-2"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </section>

        <section className="space-y-3 rounded border border-stone-200 bg-white p-4">
          <h2 className="font-medium">Productos</h2>
          {channel && channel.code !== 'DIRECT' && (
            <p className="rounded bg-zinc-100 px-3 py-2 text-xs text-zinc-600">
              Precios de {channel.name}
              {channel.requiresExternalRef ? ' (los que figuran en la app de delivery).' : '.'} Si
              un producto no tiene precio propio, se usa el del menú web.
            </p>
          )}
          <div className="max-h-48 overflow-y-auto rounded border border-stone-100">
            {displayProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                className="flex w-full items-center justify-between border-b border-stone-100 px-3 py-2 text-left text-sm hover:bg-stone-50"
                onClick={() => {
                  setBuilderProduct(product);
                  setQtyByOption({});
                }}
              >
                <span>{product.name}</span>
                <span className="tabular-nums">{formatMoney(product.priceCents)}</span>
              </button>
            ))}
          </div>

          {builderProduct && (
            <div className="rounded border border-stone-300 p-3">
              <p className="font-medium">{builderProduct.name}</p>
              {builderProduct.modifierGroups.map((group) => (
                <div key={group.id} className="mt-2">
                  <p className="text-xs uppercase text-stone-500">{group.name}</p>
                  <div className="mt-1 space-y-1">
                    {group.options.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`flex w-full justify-between rounded px-2 py-1 text-sm ${
                          qtyByOption[option.id] ? 'bg-stone-900 text-white' : 'bg-stone-100'
                        }`}
                        onClick={() =>
                          setQtyByOption((prev) => {
                            if (group.selectionType === 'SINGLE') {
                              const next: Record<string, number> = { ...prev };
                              for (const opt of group.options) delete next[opt.id];
                              if (!prev[option.id]) next[option.id] = 1;
                              return next;
                            }
                            const current = prev[option.id] ?? 0;
                            return {
                              ...prev,
                              [option.id]: current >= group.maxQtyPerOption ? 0 : current + 1,
                            };
                          })
                        }
                      >
                        <span>
                          {option.name}
                          {(qtyByOption[option.id] ?? 0) > 1 ? ` ×${qtyByOption[option.id]}` : ''}
                        </span>
                        <span>+{formatMoney(option.priceDelta)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="mt-3 w-full rounded bg-stone-900 py-2 text-sm text-white"
                onClick={addCurrentBuilder}
              >
                Agregar al pedido
              </button>
            </div>
          )}

          <ul className="space-y-2 text-sm">
            {lines.map((line) => (
              <li
                key={line.key}
                className="flex justify-between gap-2 border-b border-stone-100 pb-2"
              >
                <span>
                  {line.quantity}× {line.productName}
                  {line.options.length > 0 && (
                    <span className="block text-stone-500">
                      {line.options.map((o) => o.name).join(', ')}
                    </span>
                  )}
                </span>
                <span className="tabular-nums">{formatMoney(line.lineTotalCents)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(totalCents)}</span>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="w-full rounded bg-stone-900 py-2.5 text-white disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creando…' : 'Crear pedido'}
          </button>
        </section>
      </form>
    </div>
  );
}
