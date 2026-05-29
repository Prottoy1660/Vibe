import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AdminResellerMonthlyTrend } from '../../services/admin/adminResellerApi';

type Props = {
  data: AdminResellerMonthlyTrend[];
  title?: string;
};

export const ResellerDepositSpendChart: React.FC<Props> = ({ data, title = 'Monthly deposits vs spend' }) => {
  if (!data.length) {
    return (
      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-6 text-sm text-gray-500 dark:text-gray-400">
        No chart data yet.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 shadow-sm">
      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4">{title}</h3>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-[#303038]" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} className="text-gray-500" />
            <YAxis tick={{ fontSize: 11 }} className="text-gray-500" />
            <Tooltip
              contentStyle={{
                background: 'var(--tw-bg-opacity, 1)',
                borderRadius: '12px',
                border: '1px solid rgba(148,163,184,0.2)',
              }}
              formatter={(value: number, name: string) => [
                `$${Number(value).toFixed(2)}`,
                name === 'deposits' ? 'Deposits' : 'Spend',
              ]}
            />
            <Legend formatter={(v) => (v === 'deposits' ? 'Deposits' : 'Spend')} />
            <Bar dataKey="deposits" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={36} />
            <Bar dataKey="spent" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
