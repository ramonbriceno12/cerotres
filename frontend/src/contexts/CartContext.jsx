import { createContext, useContext, useEffect, useState, useMemo } from "react";

const CartContext = createContext(null);
const STORAGE_KEY = "cerotres_cart";

function lineKey(productId, optionItemIds, notes) {
  return `${productId}::${[...optionItemIds].sort().join(",")}::${notes || ""}`;
}

export function CartProvider({ children }) {
  const [lines, setLines] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  }, [lines]);

  /**
   * selectedOptions: array of { id, name, price_modifier } chosen in the builder.
   * Each distinct product+option combination becomes its own cart line.
   */
  const addItem = (product, selectedOptions = [], quantity = 1, notes = "") => {
    const optionIds = selectedOptions.map((o) => o.id);
    const key = lineKey(product.id, optionIds, notes);
    const unitPrice = Number(product.base_price) + selectedOptions.reduce((sum, o) => sum + Number(o.price_modifier), 0);

    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + quantity } : l));
      }
      return [
        ...prev,
        {
          key,
          product_id: product.id,
          name: product.name,
          image_url: product.image_url,
          selected_options: selectedOptions.map((o) => ({ option_item_id: o.id, name: o.name, price_modifier: o.price_modifier })),
          unit_price: unitPrice,
          quantity,
          notes,
        },
      ];
    });
  };

  const updateQuantity = (key, quantity) => {
    if (quantity <= 0) return removeItem(key);
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, quantity } : l)));
  };

  const removeItem = (key) => setLines((prev) => prev.filter((l) => l.key !== key));
  const clear = () => setLines([]);

  const subtotal = useMemo(() => lines.reduce((sum, l) => sum + l.unit_price * l.quantity, 0), [lines]);
  const itemCount = useMemo(() => lines.reduce((sum, l) => sum + l.quantity, 0), [lines]);

  return (
    <CartContext.Provider value={{ lines, addItem, updateQuantity, removeItem, clear, subtotal, itemCount }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
