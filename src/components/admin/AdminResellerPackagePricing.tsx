import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RotateCcw, Save, Tag } from 'lucide-react';
import {
  AdminResellerApi,
  AdminResellerPackagePricingItem,
} from '../../services/admin/adminResellerApi';
import { toast } from '../../lib/toast';

type Props = {
  resellerId: string;
};

const money = (n: number) => `$${n.toFixed(2)}`;

export const AdminResellerPackagePricing: React.FC<Props> = ({ resellerId }) => {
  const [packages, setPackages] = useState<AdminResellerPackagePricingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draftCosts, setDraftCosts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await AdminResellerApi.getPackagePricing(resellerId);
      setPackages(rows);
      const drafts: Record<string, string> = {};
      for (const row of rows) {
        drafts[row.packageId] = row.customCost != null ? row.customCost.toFixed(2) : '';
      }
      setDraftCosts(drafts);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load package pricing');
    } finally {
      setLoading(false);
    }
  }, [resellerId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (row: AdminResellerPackagePricingItem) => {
    const raw = (draftCosts[row.packageId] ?? '').trim();
    let customCost: number | null = null;

    if (raw !== '') {
      customCost = Number(raw);
      if (!Number.isFinite(customCost) || customCost < 0) {
        toast.error('Enter a valid price (0 or higher), or leave blank for standard pricing.');
        return;
      }
    }

    setSavingId(row.packageId);
    try {
      const updated = await AdminResellerApi.setPackagePricing(resellerId, row.packageId, customCost);
      setPackages(updated);
      const drafts: Record<string, string> = {};
      for (const item of updated) {
        drafts[item.packageId] = item.customCost != null ? item.customCost.toFixed(2) : '';
      }
      setDraftCosts(drafts);
      toast.success(
        customCost == null
          ? `${row.label} reset to standard price (${money(row.baseCost)})`
          : `${row.label} set to ${money(customCost)} for this reseller`,
      );
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save pricing');
    } finally {
      setSavingId(null);
    }
  };

  const handleReset = (row: AdminResellerPackagePricingItem) => {
    setDraftCosts((prev) => ({ ...prev, [row.packageId]: '' }));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (packages.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-gray-500 dark:text-gray-400 text-sm">
        No packages configured yet. Add packages under Reseller Packages first.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <p className="px-4 pt-4 pb-2 text-sm text-gray-500 dark:text-gray-400">
        Set a custom price per package for this reseller only. Leave blank to use the standard package price.
      </p>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/[0.02]">
            <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Package</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Standard</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Custom price</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">Effective</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase text-gray-500 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-[#26262d]">
          {packages.map((row) => {
            const hasCustom = row.customCost != null;
            const draft = draftCosts[row.packageId] ?? '';
            const draftNum = draft.trim() === '' ? null : Number(draft);
            const effectivePreview =
              draftNum != null && Number.isFinite(draftNum) ? draftNum : row.baseCost;

            return (
              <tr key={row.packageId} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <div className="font-semibold text-gray-900 dark:text-gray-100">{row.label}</div>
                  <div className="text-xs text-gray-500 font-mono">{row.value}</div>
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{money(row.baseCost)}</td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft}
                    onChange={(e) =>
                      setDraftCosts((prev) => ({ ...prev, [row.packageId]: e.target.value }))
                    }
                    placeholder="Standard price"
                    className="w-full max-w-[140px] px-3 py-2 rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#111113] text-sm"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${hasCustom ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-gray-100'}`}>
                      {money(effectivePreview)}
                    </span>
                    {hasCustom && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        <Tag className="h-3 w-3" />
                        Custom
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleReset(row)}
                      className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg"
                      title="Reset to standard"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSave(row)}
                      disabled={savingId === row.packageId}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50"
                    >
                      {savingId === row.packageId ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
