import { ResellerPackage } from '../services/reseller/resellerApi';

/** Adobe panel extend-user only accepts 1–12 month values, not day trials (7d, 14d). */
export function isMonthBasedPackageValue(value: string): boolean {
  const v = String(value || '').trim().toLowerCase();
  if (!v || v.endsWith('d')) return false;
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 12;
}

export function filterExtendPackages(packages: ResellerPackage[]): ResellerPackage[] {
  return packages.filter((p) => isMonthBasedPackageValue(p.value));
}
