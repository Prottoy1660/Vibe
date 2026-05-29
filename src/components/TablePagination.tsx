import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100];

type TablePaginationProps = {
  totalItems: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
  variant?: 'reseller' | 'admin';
};

export function TablePagination({
  totalItems,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  itemLabel = 'items',
  variant = 'admin',
}: TablePaginationProps) {
  if (totalItems === 0) return null;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, totalItems);

  const isReseller = variant === 'reseller';

  return (
    <div
      className={
        isReseller
          ? 'flex flex-col sm:flex-row items-center justify-between gap-3 px-4 lg:px-6 py-4 border-t border-white/5 bg-white/[0.01]'
          : 'flex flex-col sm:flex-row items-center justify-between gap-3 px-4 lg:px-6 py-4 border-t border-gray-100 dark:border-[#26262d] bg-gray-50/50 dark:bg-white/[0.02]'
      }
    >
      <p className={`text-sm ${isReseller ? 'text-gray-500' : 'text-gray-500 dark:text-gray-400'}`}>
        Showing{' '}
        <span className={isReseller ? 'text-gray-300 font-medium' : 'font-semibold text-gray-900 dark:text-gray-100'}>
          {start}–{end}
        </span>{' '}
        of{' '}
        <span className={isReseller ? 'text-gray-300 font-medium' : 'font-semibold text-gray-900 dark:text-gray-100'}>
          {totalItems}
        </span>{' '}
        {itemLabel}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <label className={`flex items-center gap-2 text-sm ${isReseller ? 'text-gray-400' : 'text-gray-500 dark:text-gray-400'}`}>
          <span>Per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className={
              isReseller
                ? 'px-3 py-1.5 bg-[#111111] border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-indigo-500/40'
                : 'px-3 py-1.5 rounded-lg border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-500/30'
            }
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size} className={isReseller ? 'bg-[#1a1a1a]' : 'bg-white dark:bg-[#1a1a1a]'}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage <= 1}
            className={
              isReseller
                ? 'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white text-sm font-medium hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
                : 'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-800 dark:text-gray-100 text-sm font-medium hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
            }
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </button>
          <span className={`px-3 py-1.5 text-sm tabular-nums ${isReseller ? 'text-gray-400' : 'text-gray-500 dark:text-gray-400'}`}>
            {safePage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage >= totalPages}
            className={
              isReseller
                ? 'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white text-sm font-medium hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
                : 'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] text-gray-800 dark:text-gray-100 text-sm font-medium hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
            }
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function paginateItems<T>(items: T[], page: number, pageSize: number): T[] {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
