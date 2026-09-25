/** Catalog (web) price unless the channel has an explicit override. */
export function resolveChannelPriceCents(
  catalogPriceCents: number,
  overrideCents: number | null | undefined,
): number {
  if (overrideCents === null || overrideCents === undefined) return catalogPriceCents;
  return overrideCents;
}
