import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { getAccessToken } from '../lib/api';

type Product = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  isAvailable: boolean;
  sortOrder: number;
  imageUrl: string | null;
  category: { id: string; name: string };
  channelPrices: Array<{
    channelId: string;
    channelCode: string;
    channelName: string;
    priceCents: number;
  }>;
};

type PricingChannel = {
  id: string;
  code: string;
  name: string;
  requiresExternalRef: boolean;
};

type Category = {
  id: string;
  name: string;
  products: Product[];
};

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function ProductsPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftPrice, setDraftPrice] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftChannelPrices, setDraftChannelPrices] = useState<Record<string, string>>({});
  const [dragId, setDragId] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => apiFetch<{ categories: Category[] }>('/api/admin/catalog/categories'),
  });

  const channelsQuery = useQuery({
    queryKey: ['orders-meta'],
    queryFn: () => apiFetch<{ channels: PricingChannel[] }>('/api/admin/orders/meta'),
  });

  const pricingChannels = useMemo(
    () => (channelsQuery.data?.channels ?? []).filter((c) => c.code !== 'DIRECT'),
    [channelsQuery.data],
  );

  const products = useMemo(
    () => categoriesQuery.data?.categories.flatMap((c) => c.products) ?? [],
    [categoriesQuery.data],
  );

  const selected = products.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    setDraftChannelPrices((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const channel of pricingChannels) {
        if (channel.id in next) continue;
        const override = selected.channelPrices?.find((row) => row.channelId === channel.id);
        next[channel.id] = override ? (override.priceCents / 100).toFixed(2) : '';
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [pricingChannels, selected]);

  function openProduct(product: Product) {
    setSelectedId(product.id);
    setDraftName(product.name);
    setDraftPrice((product.priceCents / 100).toFixed(2));
    setDraftDescription(product.description ?? '');
    const next: Record<string, string> = {};
    for (const channel of pricingChannels) {
      const override = product.channelPrices?.find((row) => row.channelId === channel.id);
      next[channel.id] = override ? (override.priceCents / 100).toFixed(2) : '';
    }
    setDraftChannelPrices(next);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const priceCents = Math.round(Number(draftPrice) * 100);
      if (!Number.isFinite(priceCents) || priceCents < 0) {
        throw new Error('Precio inválido');
      }
      const channelPrices = pricingChannels.map((channel) => {
        const raw = (draftChannelPrices[channel.id] ?? '').trim();
        if (raw === '') return { channelId: channel.id, priceCents: null };
        const cents = Math.round(Number(raw.replace(',', '.')) * 100);
        if (!Number.isFinite(cents) || cents < 0) {
          throw new Error(`Precio inválido en ${channel.name}`);
        }
        return { channelId: channel.id, priceCents: cents };
      });
      return apiFetch(`/api/admin/catalog/products/${selected.id}`, {
        method: 'PATCH',
        body: {
          name: draftName,
          description: draftDescription || null,
          priceCents,
          channelPrices,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
    },
  });

  const eightySixMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/admin/catalog/products/${id}/86`, { method: 'POST' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) =>
      apiFetch('/api/admin/catalog/products/reorder', {
        method: 'POST',
        body: { orderedIds },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!selected) return;
      const form = new FormData();
      form.append('file', file);
      const token = getAccessToken();
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(
        `${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/api/admin/catalog/products/${selected.id}/image`,
        {
          method: 'POST',
          credentials: 'include',
          headers,
          body: form,
        },
      );
      if (!res.ok) throw new Error('No se pudo subir la imagen');
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
    },
  });

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = products.map((p) => p.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    void reorderMutation.mutateAsync(next);
    setDragId(null);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <section className="rounded border border-stone-200 bg-white">
        <header className="border-b border-stone-200 px-4 py-3">
          <h1 className="text-lg font-semibold">Catálogo</h1>
          <p className="text-sm text-stone-500">
            Arrastra para reordenar · 86 agota al instante · edita a la derecha
          </p>
        </header>

        {categoriesQuery.isLoading && <p className="p-4 text-sm text-stone-500">Cargando…</p>}
        {categoriesQuery.isError && (
          <p className="p-4 text-sm text-red-600">No se pudo cargar el catálogo</p>
        )}

        <div className="divide-y divide-stone-100">
          {categoriesQuery.data?.categories.map((category) => (
            <div key={category.id} className="p-3">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                {category.name}
              </h2>
              <ul className="space-y-2">
                {category.products.map((product) => (
                  <li
                    key={product.id}
                    draggable
                    onDragStart={() => setDragId(product.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(product.id)}
                    className={`flex items-center justify-between gap-3 rounded border px-3 py-2 ${
                      selectedId === product.id
                        ? 'border-stone-900 bg-stone-50'
                        : 'border-stone-200'
                    }`}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => openProduct(product)}
                    >
                      <p className="truncate text-sm font-medium">{product.name}</p>
                      <p className="text-xs text-stone-500">
                        Web {formatMoney(product.priceCents)}
                        {(product.channelPrices ?? []).map((row) => (
                          <span key={row.channelId}>
                            {' · '}
                            {row.channelName} {formatMoney(row.priceCents)}
                          </span>
                        ))}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void eightySixMutation.mutateAsync(product.id)}
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        product.isAvailable
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {product.isAvailable ? '86' : 'Agotado'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <aside className="rounded border border-stone-200 bg-white p-4">
        {!selected && <p className="text-sm text-stone-500">Selecciona un producto para editar.</p>}
        {selected && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void saveMutation.mutateAsync();
            }}
          >
            <h2 className="text-base font-semibold">Editar producto</h2>
            <p className="text-xs text-stone-500">{selected.category.name}</p>

            <label className="block text-sm">
              Nombre
              <input
                className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
              />
            </label>

            <label className="block text-sm">
              Precio menú web (USD)
              <input
                className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
                value={draftPrice}
                onChange={(e) => setDraftPrice(e.target.value)}
                inputMode="decimal"
              />
            </label>

            {pricingChannels.length > 0 && (
              <div className="space-y-2 rounded border border-stone-200 p-3">
                <p className="text-sm font-medium">Precios en apps de delivery</p>
                <p className="text-xs text-stone-500">
                  Vacío = mismo precio que el menú web. PedidosYa y otras apps se cargan a mano con
                  este precio.
                </p>
                {pricingChannels.map((channel) => (
                  <label key={channel.id} className="block text-sm">
                    {channel.name}
                    <input
                      className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
                      placeholder={`Igual que web (${draftPrice || '—'})`}
                      value={draftChannelPrices[channel.id] ?? ''}
                      onChange={(e) =>
                        setDraftChannelPrices((prev) => ({
                          ...prev,
                          [channel.id]: e.target.value,
                        }))
                      }
                      inputMode="decimal"
                    />
                  </label>
                ))}
              </div>
            )}

            <label className="block text-sm">
              Descripción
              <textarea
                className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
                rows={4}
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
              />
            </label>

            <label className="block text-sm">
              Foto
              <input
                className="mt-1 block w-full text-xs"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadMutation.mutateAsync(file);
                }}
              />
            </label>
            {selected.imageUrl && (
              <img
                src={selected.imageUrl}
                alt={selected.name}
                className="h-28 w-full rounded object-cover"
              />
            )}

            {(saveMutation.isError || uploadMutation.isError) && (
              <p className="text-sm text-red-600">No se pudo guardar</p>
            )}
            {saveMutation.isSuccess && (
              <p className="text-sm text-emerald-700">Guardado. Revisa el menú público.</p>
            )}

            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="w-full rounded bg-stone-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saveMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </form>
        )}
      </aside>
    </div>
  );
}
