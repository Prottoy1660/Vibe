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
