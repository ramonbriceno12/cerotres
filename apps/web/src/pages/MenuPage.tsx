import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import type { MenuCategory, MenuProduct } from '../lib/types';
import { formatMoney } from '../lib/types';
import { useCart } from '../contexts/CartContext';
import { ProductBuilderSheet } from '../components/ProductBuilderSheet';
import { BrandPlaceholder, MenuBrandHero } from '../components/Brand';
import { BottomNav, CartFloatingBar } from '../components/Shell';

export function MenuPage() {
  const { addProduct } = useCart();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [builderProduct, setBuilderProduct] = useState<MenuProduct | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const metaQuery = useQuery({
    queryKey: ['public-meta'],
    queryFn: () =>
      apiFetch<{
        store: { isOpen: boolean; nextOpenLabel: string | null };
      }>('/api/public/meta'),
  });

  const menuQuery = useQuery({
    queryKey: ['public-menu'],
    queryFn: () => apiFetch<{ categories: MenuCategory[] }>('/api/public/menu'),
  });

  const categories = menuQuery.data?.categories ?? [];

  useEffect(() => {
    if (categories[0] && !activeCategory) setActiveCategory(categories[0].id);
  }, [categories, activeCategory]);

  const flatProducts = useMemo(
    () => categories.flatMap((c) => c.products.map((p) => ({ ...p, categoryId: c.id }))),
    [categories],
  );

  function scrollToCategory(id: string) {
    setActiveCategory(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-bg pb-36 text-cream">
      <MenuBrandHero
        subtitle="Pepitos venezolanos · pickup o delivery"
        closedLabel={
          metaQuery.data?.store.isOpen === false
            ? `Cerrado ahora${
                metaQuery.data.store.nextOpenLabel
                  ? ` · abrimos ${metaQuery.data.store.nextOpenLabel}`
                  : ''
              }`
            : null
        }
      />

      <div className="sticky top-0 z-20 border-y border-white/10 bg-bg/95 px-2 py-2 backdrop-blur">
        <div className="flex gap-2 overflow-x-auto">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => scrollToCategory(category.id)}
              className={`whitespace-nowrap rounded-pill px-3 py-1.5 text-sm transition ${
                activeCategory === category.id ? 'bg-cream text-ink' : 'bg-surface text-cream-dim'
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      {menuQuery.isLoading && (
        <div className="space-y-3 p-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-md bg-surface" />
          ))}
        </div>
      )}

      {menuQuery.isError && (
        <p className="p-4 text-danger">No se pudo cargar el menú. Revisa la API.</p>
      )}

      <div className="space-y-8 px-4 py-4">
        {categories.map((category) => (
          <section
            key={category.id}
            ref={(el) => {
              sectionRefs.current[category.id] = el;
            }}
          >
            <h2 className="mb-3 font-display text-2xl">{category.name}</h2>
            <ul className="space-y-3">
              {category.products.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => setBuilderProduct(product)}
                    className="flex w-full gap-3 rounded-md bg-surface p-3 text-left transition active:scale-[0.97]"
                  >
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-surface-2">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <BrandPlaceholder />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-lg leading-tight">{product.name}</p>
                      {product.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-cream-dim">
                          {product.description}
                        </p>
                      )}
                      <p className="mt-2 font-display text-xl tabular-nums text-cream">
                        {formatMoney(product.priceCents)}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {builderProduct && (
        <ProductBuilderSheet
          product={builderProduct}
          onClose={() => setBuilderProduct(null)}
          onAdd={(selections) => {
            addProduct(builderProduct, selections, 1);
            setBuilderProduct(null);
          }}
        />
      )}

      <CartFloatingBar />
      <BottomNav />
      <span className="sr-only">{flatProducts.length} productos</span>
    </div>
  );
}
