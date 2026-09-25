export type MenuOption = {
  id: string;
  name: string;
  description: string | null;
  priceDelta: number;
};

export type MenuModifierGroup = {
  id: string;
  name: string;
  description: string | null;
  selectionType: 'SINGLE' | 'MULTI';
  minSelect: number;
  maxSelect: number | null;
  freeQuantity: number;
  freeStrategy: 'HIGHEST_PRICE_FIRST' | 'SELECTION_ORDER';
  maxQtyPerOption: number;
  options: MenuOption[];
};

export type MenuProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  modifierGroups: MenuModifierGroup[];
};

export type MenuCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  products: MenuProduct[];
};

export type CartSelection = {
  optionId: string;
  groupId: string;
  name: string;
  priceDelta: number;
  quantity: number;
};

export type CartItem = {
  key: string;
  productId: string;
  productName: string;
  productDescription: string | null;
  imageUrl: string | null;
  quantity: number;
  basePriceCents: number;
  selections: CartSelection[];
  lineTotalCents: number;
  notes?: string;
};

export function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2).replace('.', ',')}`;
}
