import React from 'react';
import { CreditCard } from 'lucide-react';
import { AdminUddoktaPaySettings } from './AdminUddoktaPaySettings';
import { AdminBkashTokenizedSettings } from './AdminBkashTokenizedSettings';

export const AdminPaymentGateways: React.FC = () => {
  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] px-5 py-4 sm:px-6 shadow-sm dark:shadow-none">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Payment gateways</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Configure UddoktaPay and bKash (tokenized) side by side. Use each card&apos;s &quot;Show on checkout&quot;
              checkbox to show or hide that option—saved API credentials stay in place when a gateway is hidden.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0">
          <AdminUddoktaPaySettings />
        </div>
        <div className="min-w-0">
          <AdminBkashTokenizedSettings />
        </div>
      </div>
    </div>
  );
};
