/**
 * Store / checkout helpers: bullet list from description + discount badge math.
 */

/** Split description into display lines; strip leading list markers. */
export function parseProductDescriptionBullets(description: string | null | undefined): string[] {
  const raw = String(description ?? '').trim();
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^[-*•]\s*/, '')
        .replace(/^\d+[.)]\s*/, '')
        .trim(),
    )
    .filter(Boolean);
}

/** Percent saved when list_price > sale_price. */
export function productSavePercent(listPrice: number | null | undefined, salePrice: number | null | undefined): number | null {
  const list = Number(listPrice);
  const sale = Number(salePrice);
  if (!Number.isFinite(list) || !Number.isFinite(sale) || list <= 0 || sale <= 0) return null;
  if (list <= sale) return null;
  return Math.max(1, Math.min(99, Math.round(100 * (1 - sale / list))));
}

export function hasStoreDiscount(listPrice: number | null | undefined, salePrice: number | null | undefined): boolean {
  return productSavePercent(listPrice, salePrice) != null;
}

export const PRODUCT_STORE_VISIBILITY_SETTINGS_KEY = 'product_store_visibility';

export function parseHiddenProductIds(value: unknown): string[] {
  const hiddenIds = (value as { hidden_product_ids?: unknown } | null | undefined)?.hidden_product_ids;
  if (!Array.isArray(hiddenIds)) return [];
  return hiddenIds
    .filter((id): id is string => typeof id === 'string')
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isProductHiddenFromStore(productId: string | null | undefined, hiddenProductIds: Iterable<string>): boolean {
  if (!productId) return false;
  const hiddenSet = hiddenProductIds instanceof Set ? hiddenProductIds : new Set(hiddenProductIds);
  return hiddenSet.has(productId);
}
