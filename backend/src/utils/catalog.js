export const PRODUCT_SELECT =
  "*, category:categories(id, name), option_groups:product_option_groups(display_order, group:option_groups(*, items:option_items(*)))";

// Flattens the product_option_groups join into a plain, ordered array of
// option groups (each with its active items) - the shape the product
// builder (storefront + admin order form) actually wants to render.
export function normalizeProduct(product) {
  const optionGroups = (product.option_groups || [])
    .map((link) => ({ ...link.group, display_order: link.display_order }))
    .filter((g) => g.is_active)
    .sort((a, b) => a.display_order - b.display_order)
    .map((g) => ({ ...g, items: (g.items || []).filter((i) => i.is_active).sort((a, b) => a.display_order - b.display_order) }));
  return { ...product, option_groups: optionGroups };
}
