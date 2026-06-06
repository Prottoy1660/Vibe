import React, { useState } from 'react';
import { format } from 'date-fns';
import { Copy, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import type { PublicPersonalPlan, PublicSharedPlan } from '../../lib/publicAccountStatus';

function PasswordDisplay({ password }: { password: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="mt-0.5 flex items-center justify-between rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-950 px-3 py-2.5 font-mono text-sm text-zinc-900 dark:text-zinc-100">
      <span>{visible ? password : '••••••••••••'}</span>
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="ml-2 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        title={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

type Props = {
  sharedPlans: PublicSharedPlan[];
  personalPlans: PublicPersonalPlan[];
};

export const PublicAdobeAccessStatus: React.FC<Props> = ({ sharedPlans, personalPlans }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copy = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {sharedPlans.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Team / shared Adobe access</h2>
          {sharedPlans.map((plan) => (
            <div
              key={plan.orderId}
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121214] shadow-sm overflow-hidden"
            >
              <div className="p-5 sm:p-6 border-b border-zinc-100 dark:border-white/5 flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Plan #{plan.planIndex}</h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                    plan.isActive
                      ? 'border-emerald-700/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'border-red-800 bg-red-950 text-red-100'
                  }`}
                >
                  {plan.isActive ? 'Active' : 'Expired'}
                </span>
                <span className="text-sm text-zinc-500">
                  {plan.emailsGenerated} of {plan.slotLimit} email{plan.slotLimit === 1 ? '' : 's'} used
                </span>
                {plan.autoRenew && (
                  <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                    Auto-renew on
                  </span>
                )}
              </div>

              <div className="p-4 sm:p-6 space-y-4">
                {plan.emails.map((email) => (
                  <div
                    key={email.id}
                    className={`rounded-xl border p-4 sm:p-5 ${
                      email.isReplaced
                        ? 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/20 opacity-75'
                        : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/30'
                    }`}
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Email address</p>
                        <p className="mt-0.5 break-all font-mono text-sm text-zinc-900 dark:text-zinc-100">{email.email}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Password</p>
                        <PasswordDisplay password={email.password} />
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-zinc-200/90 pt-3 text-sm dark:border-zinc-800/90">
                      <div>
                        <p className="text-xs font-medium text-zinc-500">Assigned</p>
                        <p className="mt-0.5 text-zinc-800 dark:text-zinc-200">
                          {format(new Date(email.assignedAt), 'MMM d, yyyy')}
                        </p>
                      </div>
                      {email.subscription ? (
                        <div>
                          <p className="text-xs font-medium text-zinc-500">Subscription ends</p>
                          <p
                            className={`mt-0.5 font-medium ${
                              email.subscription.isExpired
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {email.subscription.daysLeft} days left ·{' '}
                            {format(new Date(email.subscription.expiresAt), 'MMM d, yyyy')}
                          </p>
                        </div>
                      ) : null}
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          email.isReplaced
                            ? 'border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                            : email.isActive
                              ? 'border-emerald-800 bg-emerald-950 text-emerald-100'
                              : 'border-red-800 bg-red-950 text-red-100'
                        }`}
                      >
                        {email.isReplaced ? 'Replaced' : email.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => copy(email.email, `email-${email.id}`)}
                        className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-200"
                      >
                        {copiedId === `email-${email.id}` ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                        Copy email
                      </button>
                      <button
                        type="button"
                        onClick={() => copy(email.password, `pass-${email.id}`)}
                        className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-200"
                      >
                        {copiedId === `pass-${email.id}` ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                        Copy password
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {personalPlans.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Personal subscriptions</h2>
          {personalPlans.map((plan) => (
            <div
              key={plan.orderId}
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121214] shadow-sm p-5 sm:p-6 space-y-3"
            >
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{plan.productTitle}</h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                    plan.isExpired
                      ? 'border-red-800 bg-red-950 text-red-100'
                      : 'border-emerald-700/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {plan.isExpired ? 'Expired' : 'Active'}
                </span>
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-300 break-all">
                Personal email: <span className="font-mono">{plan.personalEmail}</span>
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <div>
                  <p className="text-xs text-zinc-500">Order status</p>
                  <p className="font-medium capitalize text-zinc-800 dark:text-zinc-200">{plan.status}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Days left</p>
                  <p className="font-medium text-zinc-800 dark:text-zinc-200">{plan.daysLeft}</p>
                </div>
                {plan.expiresAt && (
                  <div>
                    <p className="text-xs text-zinc-500">Expires</p>
                    <p className="font-medium text-zinc-800 dark:text-zinc-200">
                      {format(new Date(plan.expiresAt), 'MMM d, yyyy')}
                    </p>
                  </div>
                )}
                {plan.deliveredAt && (
                  <div>
                    <p className="text-xs text-zinc-500">Delivered</p>
                    <p className="font-medium text-zinc-800 dark:text-zinc-200">
                      {format(new Date(plan.deliveredAt), 'MMM d, yyyy')}
                    </p>
                  </div>
                )}
                {plan.autoRenew && (
                  <div>
                    <p className="text-xs text-zinc-500">Auto-renew</p>
                    <p className="font-medium text-indigo-600 dark:text-indigo-400">Enabled</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
};
