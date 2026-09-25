import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { calculateLinePrice } from '@cerotres/shared';
import type { CartItem, CartSelection, MenuProduct } from '../lib/types';

const STORAGE_KEY = 'cerotres.cart.v1';

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  subtotalCents: number;
  addProduct: (product: MenuProduct, selections: CartSelection[], quantity?: number) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function makeKey(productId: string, selections: CartSelection[]) {
  const opts = [...selections]
    .sort((a, b) => a.optionId.localeCompare(b.optionId))
    .map((s) => `${s.optionId}x${s.quantity}`)
    .join(',');
  return `${productId}::${opts}`;
}

function priceItem(product: MenuProduct, selections: CartSelection[], quantity: number) {
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
    selectedOptions: selections.map((s) => ({
      optionId: s.optionId,
      groupId: s.groupId,
      name: s.name,
      priceDelta: s.priceDelta,
      quantity: s.quantity,
    })),
  });
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const value = useMemo<CartContextValue>(() => {
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);

    return {
      items,
      itemCount,
      subtotalCents,
      addProduct(product, selections, quantity = 1) {
        const key = makeKey(product.id, selections);
        const priced = priceItem(product, selections, quantity);
        setItems((prev) => {
          const existing = prev.find((i) => i.key === key);
          if (existing) {
            const nextQty = existing.quantity + quantity;
            const nextPriced = priceItem(product, selections, nextQty);
            return prev.map((i) =>
              i.key === key
                ? { ...i, quantity: nextQty, lineTotalCents: nextPriced.lineTotalCents }
                : i,
            );
          }
          return [
            ...prev,
            {
              key,
              productId: product.id,
              productName: product.name,
              productDescription: product.description,
              imageUrl: product.imageUrl,
              quantity,
              basePriceCents: product.priceCents,
              selections,
              lineTotalCents: priced.lineTotalCents,
            },
          ];
        });
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate?.(8);
        }
      },
      updateQuantity(key, quantity) {
        setItems((prev) =>
          prev
            .map((item) => {
              if (item.key !== key) return item;
              if (quantity < 1) return item;
              // recompute from stored selections relative to unit
              const unit = Math.round(item.lineTotalCents / item.quantity);
              return { ...item, quantity, lineTotalCents: unit * quantity };
            })
            .filter((item) => item.quantity > 0),
        );
      },
      removeItem(key) {
        setItems((prev) => prev.filter((item) => item.key !== key));
      },
      clear() {
        setItems([]);
      },
    };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
