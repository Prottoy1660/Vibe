import type { SupabaseClient } from '@supabase/supabase-js';

export interface ResellerPackageRow {
  id: string;
  label: string;
  value: string;
  cost: number;
}

export interface ResellerPackageWithPricing extends ResellerPackageRow {
  baseCost: number;
  isCustomPrice: boolean;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchAllPackages(supabase: SupabaseClient): Promise<ResellerPackageRow[]> {
  const { data, error } = await supabase
    .from('reseller_packages')
    .select('id, label, value, cost')
    .order('cost', { ascending: true });

  if (error) throw error;

  return (data || []).map((pkg) => ({
    id: String(pkg.id),
    label: String(pkg.label),
    value: String(pkg.value),
    cost: toNumber(pkg.cost),
  }));
}

export async function fetchCustomPricingMap(
  supabase: SupabaseClient,
  resellerId: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('reseller_package_pricing')
    .select('package_id, custom_cost')
    .eq('reseller_id', resellerId);

  if (error) throw error;

  const map = new Map<string, number>();
  for (const row of data || []) {
    map.set(String(row.package_id), toNumber(row.custom_cost));
  }
  return map;
}

export function applyCustomPricing(
  packages: ResellerPackageRow[],
  customMap: Map<string, number>,
): ResellerPackageWithPricing[] {
  return packages.map((pkg) => {
    const custom = customMap.get(pkg.id);
    const baseCost = pkg.cost;
    const effective = custom != null ? custom : baseCost;
    return {
      ...pkg,
      cost: effective,
      baseCost,
      isCustomPrice: custom != null,
    };
  });
}

export async function getResellerPackagesWithPricing(
  supabase: SupabaseClient,
  resellerId: string,
): Promise<ResellerPackageWithPricing[]> {
  const [packages, customMap] = await Promise.all([
    fetchAllPackages(supabase),
    fetchCustomPricingMap(supabase, resellerId),
  ]);
  return applyCustomPricing(packages, customMap);
}

export async function resolvePackageCostByValue(
  supabase: SupabaseClient,
  resellerId: string,
  packageValue: string,
): Promise<{ pkg: ResellerPackageWithPricing; cost: number } | null> {
  const normalized = String(packageValue || '').trim();
  if (!normalized) return null;

  const packages = await getResellerPackagesWithPricing(supabase, resellerId);
  const match = packages.find((p) => p.value === normalized);
  if (!match) return null;

  return { pkg: match, cost: match.cost };
}

export interface AdminPackagePricingRow {
  packageId: string;
  label: string;
  value: string;
  baseCost: number;
  customCost: number | null;
  effectiveCost: number;
}

export async function getAdminPackagePricingRows(
  supabase: SupabaseClient,
  resellerId: string,
): Promise<AdminPackagePricingRow[]> {
  const [packages, customMap] = await Promise.all([
    fetchAllPackages(supabase),
    fetchCustomPricingMap(supabase, resellerId),
  ]);

  return packages.map((pkg) => {
    const custom = customMap.get(pkg.id);
    return {
      packageId: pkg.id,
      label: pkg.label,
      value: pkg.value,
      baseCost: pkg.cost,
      customCost: custom ?? null,
      effectiveCost: custom ?? pkg.cost,
    };
  });
}

export async function upsertResellerPackagePricing(
  supabase: SupabaseClient,
  resellerId: string,
  packageId: string,
  customCost: number,
): Promise<void> {
  const { error } = await supabase.from('reseller_package_pricing').upsert(
    {
      reseller_id: resellerId,
      package_id: packageId,
      custom_cost: customCost,
    },
    { onConflict: 'reseller_id,package_id' },
  );

  if (error) throw error;
}

export async function clearResellerPackagePricing(
  supabase: SupabaseClient,
  resellerId: string,
  packageId: string,
): Promise<void> {
  const { error } = await supabase
    .from('reseller_package_pricing')
    .delete()
    .eq('reseller_id', resellerId)
    .eq('package_id', packageId);

  if (error) throw error;
}
