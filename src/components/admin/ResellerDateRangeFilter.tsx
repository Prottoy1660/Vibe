import React from 'react';
import { ResellerDateRange, RESELLER_DATE_RANGE_LABELS } from '../../services/admin/adminResellerApi';

type Props = {
  value: ResellerDateRange;
  onChange: (value: ResellerDateRange) => void;
  className?: string;
};

export const ResellerDateRangeFilter: React.FC<Props> = ({ value, onChange, className = '' }) => (
  <div
    className={`inline-flex flex-wrap bg-gray-100 dark:bg-black/20 p-1 rounded-xl border border-gray-200/80 dark:border-[#303038] ${className}`}
  >
    {(Object.keys(RESELLER_DATE_RANGE_LABELS) as ResellerDateRange[]).map((key) => (
      <button
        key={key}
        type="button"
        onClick={() => onChange(key)}
        className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
          value === key
            ? 'bg-white dark:bg-[#151518] text-indigo-600 dark:text-indigo-400 shadow-sm'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
        }`}
      >
        {RESELLER_DATE_RANGE_LABELS[key]}
      </button>
    ))}
  </div>
);
