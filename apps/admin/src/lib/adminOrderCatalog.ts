import { calculateLinePrice, resolveChannelPriceCents } from '@cerotres/shared';

export type OrderChannel = {
  id: string;
  code: string;
  name: string;
  requiresExternalRef: boolean;
};

export type OrderZone = { id: string; name: string; feeCents: number };

export type CatalogModifierGroup = {
  id: string;
  name: string;
  selectionType: 'SINGLE' | 'MULTI';
  minSelect: number;
  maxSelect: number | null;
  freeQuantity: number;
  freeStrategy: 'HIGHEST_PRICE_FIRST' | 'SELECTION_ORDER';
  maxQtyPerOption: number;
  options: Array<{ id: string; name: string; priceDelta: number; description: string | null }>;
};

export type CatalogProduct = {
  id: string;
  name: string;
  priceCents: number;
  description: string | null;
  imageUrl: string | null;
  categoryId: string;
  categoryName: string;
  channelPrices: Array<{ channelId: string; priceCents: number }>;
  modifierGroups: CatalogModifierGroup[];
};

export type CartOption = {
  optionId: string;
  quantity: number;
  name: string;
  priceDelta: number;
  groupId: string;
};

export type CartLine = {
  key: string;
  productId: string;
  productName: string;
  quantity: number;
  lineTotalCents: number;
  options: CartOption[];
};

type RawCategoryResponse = {
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
};

export function parseCatalogProducts(data: RawCategoryResponse | undefined): CatalogProduct[] {
  const list: CatalogProduct[] = [];
  for (const category of data?.categories ?? []) {
    for (const product of category.products) {
      list.push({
        id: product.id,
        name: product.name,
        description: product.description,
        priceCents: product.priceCents,
        imageUrl: product.imageUrl ?? null,
        categoryId: category.id,
        categoryName: category.name,
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
}

export function productPriceForChannel(product: CatalogProduct, channelId: string): number {
  const override = product.channelPrices.find((row) => row.channelId === channelId);
  return resolveChannelPriceCents(product.priceCents, override?.priceCents);
}

export function withChannelPrice(product: CatalogProduct, channelId: string): CatalogProduct {
  return { ...product, priceCents: productPriceForChannel(product, channelId) };
}

export function lineTotalForProduct(
  product: CatalogProduct,
  quantity: number,
  options: CartOption[],
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

export function buildCartLineKey(productId: string, options: CartOption[]): string {
  const opts = options
    .map((o) => `${o.optionId}x${o.quantity}`)
    .sort()
    .join(',');
  return `${productId}::${opts}`;
}

export function optionsFromQtyMap(
  product: CatalogProduct,
  qtyByOption: Record<string, number>,
): CartOption[] {
  return Object.entries(qtyByOption)
    .filter(([, qty]) => qty > 0)
    .map(([optionId, quantity]) => {
      const group = product.modifierGroups.find((g) => g.options.some((o) => o.id === optionId))!;
      const option = group.options.find((o) => o.id === optionId)!;
      return {
        optionId,
        groupId: group.id,
        name: option.name,
        priceDelta: option.priceDelta,
        quantity,
      };
    });
}

export function productNeedsModifiers(product: CatalogProduct): boolean {
  return product.modifierGroups.some((g) => g.minSelect > 0 || g.options.length > 0);
}
