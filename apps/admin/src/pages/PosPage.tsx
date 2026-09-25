import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PosModifierPanel } from '../components/pos/PosModifierPanel';
import { BrandIsoBadge } from '../components/Brand';
import { apiFetch, ApiError } from '../lib/api';
import {
  buildCartLineKey,
  lineTotalForProduct,
  optionsFromQtyMap,
  parseCatalogProducts,
  type CartLine,
  type CatalogProduct,
  type OrderChannel,
  type OrderZone,
  withChannelPrice,
} from '../lib/adminOrderCatalog';
import { formatMoney } from '../lib/orders';

export function PosPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const metaQuery = useQuery({
    queryKey: ['orders-meta'],
    queryFn: () =>
      apiFetch<{ channels: OrderChannel[]; zones: OrderZone[]; paymentMethods: string[] }>(
        '/api/admin/orders/meta',
      ),
  });

  const catalogQuery = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () =>
      apiFetch<{
        categories: Array<{
          id: string;
          name: string;
          products: Array<{
            id: string;
            name: string;
            description: string | null;
            priceCents: number;
            imageUrl?: string | null;
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

  const products = useMemo(() => parseCatalogProducts(catalogQuery.data), [catalogQuery.data]);

  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const p of products) {
      const existing = map.get(p.categoryId);
      if (existing) existing.count += 1;
      else map.set(p.categoryId, { id: p.categoryId, name: p.categoryName, count: 1 });
    }
    return [...map.values()];
  }, [products]);

  const [channelId, setChannelId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const [customerName, setCustomerName] = useState('Mostrador');
  const [customerPhone, setCustomerPhone] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [fulfillment, setFulfillment] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [zoneId, setZoneId] = useState('');
  const [address, setAddress] = useState('');
  const [payments, setPayments] = useState<
    Array<{ method: string; amount: string; reference: string }>
  >([{ method: 'CASH', amount: '', reference: '' }]);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [modifierProduct, setModifierProduct] = useState<CatalogProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successCode, setSuccessCode] = useState<string | null>(null);

  useEffect(() => {
    if (channelId || !metaQuery.data?.channels.length) return;
    const direct = metaQuery.data.channels.find((c) => c.code === 'DIRECT');
    setChannelId(direct?.id ?? metaQuery.data.channels[0]!.id);
  }, [channelId, metaQuery.data]);

  useEffect(() => {
    if (categoryId || categories.length === 0) return;
    setCategoryId(categories[0]!.id);
  }, [categoryId, categories]);

  const channel = metaQuery.data?.channels.find((c) => c.id === channelId);
  const zone = metaQuery.data?.zones.find((z) => z.id === zoneId);

  const displayProducts = useMemo(
    () => products.map((p) => withChannelPrice(p, channelId)),
    [products, channelId],
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return displayProducts.filter((p) => {
      if (categoryId && p.categoryId !== categoryId) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q);
    });
  }, [displayProducts, categoryId, search]);

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
  }, [displayProducts]);

  const deliveryFee = fulfillment === 'DELIVERY' ? (zone?.feeCents ?? 0) : 0;
  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const totalCents = subtotalCents + deliveryFee;
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  const paidCents = payments.reduce((sum, p) => {
    const n = Number(p.amount.replace(',', '.'));
    return sum + (Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0);
  }, 0);
  const remainingCents = totalCents - paidCents;

  const paymentMethods = metaQuery.data?.paymentMethods ?? [
    'CASH',
    'PAGO_MOVIL',
    'ZELLE',
    'TRANSFER',
    'OTHER',
  ];

  useEffect(() => {
    setPayments((prev) => {
      if (prev.length !== 1) return prev;
      const only = prev[0]!;
      if (only.amount !== '' && Number(only.amount) > 0) return prev;
      return [{ ...only, amount: totalCents > 0 ? (totalCents / 100).toFixed(2) : '' }];
    });
  }, [totalCents]);

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
          ...(externalRef.trim() ? { externalOrderRef: externalRef.trim() } : {}),
          customerName: customerName.trim() || 'Mostrador',
          ...(customerPhone.trim() ? { customerPhone: customerPhone.trim() } : {}),
          fulfillmentType: fulfillment,
          ...(fulfillment === 'DELIVERY' ? { deliveryZoneId: zoneId, addressLine1: address } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          payments: paymentLines,
          paymentsConfirmed: true,
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
      setSuccessCode(data.order.publicCode);
      setLines([]);
      setNotes('');
      setExternalRef('');
      setPayments([{ method: 'CASH', amount: '', reference: '' }]);
      setError(null);
      window.setTimeout(() => setSuccessCode(null), 4000);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el pedido');
    },
  });

  function addProductToCart(product: CatalogProduct, qtyByOption: Record<string, number>) {
    const options = optionsFromQtyMap(product, qtyByOption);
    const key = buildCartLineKey(product.id, options);
    const lineTotalCents = lineTotalForProduct(product, 1, options);

    setLines((prev) => {
      const existing = prev.find((line) => line.key === key);
      if (existing) {
        const quantity = existing.quantity + 1;
        return prev.map((line) =>
          line.key === key
            ? {
                ...line,
                quantity,
                lineTotalCents: lineTotalForProduct(product, quantity, line.options),
              }
            : line,
        );
      }
      return [
        ...prev,
        {
          key,
          productId: product.id,
          productName: product.name,
          quantity: 1,
          lineTotalCents,
          options,
        },
      ];
    });
  }

  function handleProductTap(product: CatalogProduct) {
    setError(null);
    if (product.modifierGroups.length > 0) {
      setModifierProduct(product);
      return;
    }
    addProductToCart(product, {});
  }

  function updateLineQty(key: string, delta: number) {
    setLines((prev) =>
      prev
        .map((line) => {
          if (line.key !== key) return line;
          const quantity = line.quantity + delta;
          if (quantity <= 0) return null;
          const product = displayProducts.find((p) => p.id === line.productId);
          if (!product) return null;
          return {
            ...line,
            quantity,
            lineTotalCents: lineTotalForProduct(product, quantity, line.options),
          };
        })
        .filter((line): line is CartLine => line !== null),
    );
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((line) => line.key !== key));
  }

  function clearCart() {
    setLines([]);
    setError(null);
  }

  function checkout() {
    setError(null);
    if (!channelId || lines.length === 0) {
      setError('Agrega al menos un producto');
      return;
    }
    if (channel?.requiresExternalRef && !externalRef.trim()) {
      setError('Referencia externa requerida para este canal');
      return;
    }
    if (fulfillment === 'DELIVERY' && (!zoneId || !address.trim())) {
      setError('Completa zona y dirección para delivery');
      return;
    }
    if (remainingCents !== 0) {
      setError(`Los pagos deben sumar el total. Diferencia: ${formatMoney(remainingCents)}`);
      return;
    }
    createMutation.mutate();
  }

  const loading = metaQuery.isLoading || catalogQuery.isLoading;

  return (
    <div className="flex h-screen flex-col bg-zinc-100 text-zinc-900">
      <header className="flex shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 sm:px-5">
        <BrandIsoBadge className="h-9 w-9 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tracking-tight">Punto de venta</p>
          <p className="truncate text-xs text-zinc-500">Toca un producto · elige extras · cobra</p>
        </div>
        <select
          className="hidden max-w-[9rem] truncate rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs font-medium sm:block"
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
        >
          {(metaQuery.data?.channels ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Link
          to="/orders/new"
          className="hidden rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 sm:inline-flex"
        >
          Alta manual
        </Link>
        <Link
          to="/orders"
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800"
        >
          Pedidos
        </Link>
      </header>

      {successCode && (
        <div className="shrink-0 bg-emerald-600 px-4 py-2 text-center text-sm font-medium text-white">
          Pedido {successCode} creado ·{' '}
          <button
            type="button"
            className="underline"
            onClick={() => void navigate(`/orders?code=${successCode}`)}
          >
            Ver listado
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-zinc-200 lg:border-b-0 lg:border-r">
          <div className="shrink-0 space-y-3 border-b border-zinc-100 bg-white px-4 py-3 sm:px-5">
            <input
              type="search"
              placeholder="Buscar producto…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryId(cat.id)}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    categoryId === cat.id
                      ? 'bg-zinc-900 text-white'
                      : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                  }`}
                >
                  {cat.name}
                  <span className="ml-1.5 opacity-60">{cat.count}</span>
                </button>
              ))}
            </div>
            {channel && channel.code !== 'DIRECT' && (
              <p className="text-xs text-amber-800">
                Precios de {channel.name}. Sin override = precio web.
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            {loading && <p className="text-center text-sm text-zinc-500">Cargando menú…</p>}
            {!loading && filteredProducts.length === 0 && (
              <p className="text-center text-sm text-zinc-500">Sin productos en esta categoría.</p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => handleProductTap(product)}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left shadow-sm transition-all hover:border-zinc-300 hover:shadow-md active:scale-[0.98]"
                >
                  <div className="relative aspect-[4/3] bg-zinc-100">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-2xl font-semibold text-zinc-300">
                        {product.name.charAt(0)}
                      </div>
                    )}
                    {product.modifierGroups.length > 0 && (
                      <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 shadow-sm">
                        Personalizable
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-3">
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-900">
                      {product.name}
                    </p>
                    <p className="mt-auto pt-2 text-base font-bold tabular-nums text-zinc-900">
                      {formatMoney(product.priceCents)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="flex w-full shrink-0 flex-col bg-white lg:w-[22rem] xl:w-[24rem]">
          <div className="shrink-0 border-b border-zinc-100 px-4 py-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                Carrito
                {itemCount > 0 && (
                  <span className="ml-2 rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-bold text-white">
                    {itemCount}
                  </span>
                )}
              </h2>
              {lines.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Vaciar
                </button>
              )}
            </div>
            <input
              className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              placeholder="Nombre del cliente"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <select
              className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm lg:hidden"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
            >
              {(metaQuery.data?.channels ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {channel?.requiresExternalRef && (
              <input
                className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="Ref. externa (PedidosYa…)"
                value={externalRef}
                onChange={(e) => setExternalRef(e.target.value)}
              />
            )}
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
            {lines.length === 0 && (
              <li className="py-8 text-center text-sm text-zinc-400">
                Toca un producto para empezar
              </li>
            )}
            {lines.map((line) => (
              <li key={line.key} className="border-b border-zinc-50 py-3 last:border-b-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-900">{line.productName}</p>
                    {line.options.length > 0 && (
                      <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                        {line.options.map((o) => o.name).join(' · ')}
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatMoney(line.lineTotalCents)}
                  </p>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateLineQty(line.key, -1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-lg leading-none hover:bg-zinc-50"
                  >
                    −
                  </button>
                  <span className="min-w-[1.5rem] text-center text-sm font-semibold tabular-nums">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateLineQty(line.key, 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-lg leading-none hover:bg-zinc-50"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    className="ml-auto text-xs text-red-600 hover:underline"
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="shrink-0 space-y-3 border-t border-zinc-100 bg-zinc-50 p-4">
            <div className="flex gap-2">
              {(['PICKUP', 'DELIVERY'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFulfillment(type)}
                  className={`flex-1 rounded-xl py-2 text-xs font-semibold uppercase tracking-wide ${
                    fulfillment === type
                      ? 'bg-zinc-900 text-white'
                      : 'bg-white text-zinc-600 ring-1 ring-zinc-200'
                  }`}
                >
                  {type === 'PICKUP' ? 'Retiro' : 'Delivery'}
                </button>
              ))}
            </div>
            {fulfillment === 'DELIVERY' && (
              <div className="space-y-2">
                <select
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
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
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                  placeholder="Dirección"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Pagos
                </p>
                <button
                  type="button"
                  className="text-[11px] font-semibold text-zinc-700 underline"
                  onClick={() =>
                    setPayments((prev) => [
                      ...prev,
                      {
                        method: paymentMethods[0] ?? 'CASH',
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
                <div
                  key={index}
                  className="space-y-1.5 rounded-lg border border-zinc-200 bg-white p-2"
                >
                  <select
                    className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs font-medium"
                    value={row.method}
                    onChange={(e) =>
                      setPayments((prev) =>
                        prev.map((p, i) => (i === index ? { ...p, method: e.target.value } : p)),
                      )
                    }
                  >
                    {paymentMethods.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-1.5">
                    <input
                      className="min-w-0 flex-1 rounded-md border border-zinc-200 px-2 py-1.5 text-xs tabular-nums"
                      placeholder="Monto $"
                      inputMode="decimal"
                      value={row.amount}
                      onChange={(e) =>
                        setPayments((prev) =>
                          prev.map((p, i) => (i === index ? { ...p, amount: e.target.value } : p)),
                        )
                      }
                    />
                    {payments.length > 1 && (
                      <button
                        type="button"
                        className="shrink-0 rounded-md px-2 text-xs text-red-600 hover:bg-red-50"
                        onClick={() => setPayments((prev) => prev.filter((_, i) => i !== index))}
                        aria-label="Quitar método de pago"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <input
                    className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs"
                    placeholder="Referencia (opcional)"
                    value={row.reference}
                    onChange={(e) =>
                      setPayments((prev) =>
                        prev.map((p, i) => (i === index ? { ...p, reference: e.target.value } : p)),
                      )
                    }
                  />
                </div>
              ))}
              <p
                className={`text-[11px] font-medium ${
                  remainingCents === 0 ? 'text-emerald-700' : 'text-amber-800'
                }`}
              >
                {remainingCents === 0
                  ? 'Pagos = total ✓'
                  : `Falta / sobra: ${formatMoney(remainingCents)}`}
              </p>
            </div>

            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-zinc-600">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatMoney(subtotalCents)}</span>
              </div>
              {deliveryFee > 0 && (
                <div className="flex justify-between text-zinc-600">
                  <span>Delivery</span>
                  <span className="tabular-nums">{formatMoney(deliveryFee)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold text-zinc-900">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(totalCents)}</span>
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
            )}

            <button
              type="button"
              disabled={createMutation.isPending || lines.length === 0 || remainingCents !== 0}
              onClick={checkout}
              className="w-full rounded-xl bg-zinc-900 py-3.5 text-sm font-bold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {createMutation.isPending ? 'Procesando…' : `Cobrar ${formatMoney(totalCents)}`}
            </button>
          </div>
        </aside>
      </div>

      {modifierProduct && (
        <PosModifierPanel
          product={modifierProduct}
          onClose={() => setModifierProduct(null)}
          onConfirm={(qtyByOption) => {
            addProductToCart(modifierProduct, qtyByOption);
            setModifierProduct(null);
          }}
        />
      )}
    </div>
  );
}
