import React from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  DollarSign,
  ShieldCheck,
} from 'lucide-react';
import type { ResellerUserStatus } from '../../services/reseller/resellerApi';

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRefundRemaining(ms: number) {
  const totalSec = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function overallBadge(status: ResellerUserStatus['overallStatus']) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        Active
      </span>
    );
  }
  if (status === 'expired') {
    return (
      <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase bg-red-500/15 text-red-300 border border-red-500/30">
        Expired
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase bg-orange-500/15 text-orange-300 border border-orange-500/30">
      Refunded
    </span>
  );
}

function teamBadge(teamStatus: ResellerUserStatus['teamStatus']) {
  if (teamStatus === 'normal') {
    return (
      <span className="shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wider uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
        Normal
      </span>
    );
  }
  if (teamStatus === 'attention') {
    return (
      <span className="shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wider uppercase bg-amber-500/15 text-amber-300 border border-amber-500/25">
        Attention
      </span>
    );
  }
  return (
    <span className="shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wider uppercase bg-gray-500/15 text-gray-400 border border-gray-500/25">
      Unknown
    </span>
  );
}

type Props = {
  status: ResellerUserStatus;
};

export const PublicSubscriptionStatusCard: React.FC<Props> = ({ status }) => {
  const progressUsed = status.progressPercent ?? 0;
  const progressTone =
    status.overallStatus === 'expired'
      ? 'from-red-500 to-rose-400'
      : progressUsed >= 85
        ? 'from-amber-500 to-yellow-400'
        : 'from-emerald-500 to-teal-400';

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121214] shadow-sm overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-zinc-100 dark:border-white/5">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Subscription status</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1 break-all">{status.email}</p>
        <div className="mt-4 flex justify-center">{overallBadge(status.overallStatus)}</div>
      </div>

      <div className="p-5 sm:p-6 space-y-5">
        <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#111111] overflow-hidden">
          <div className="flex gap-0">
            <div
              className={`w-1 shrink-0 ${
                status.teamStatus === 'normal'
                  ? 'bg-emerald-500'
                  : status.teamStatus === 'attention'
                    ? 'bg-amber-500'
                    : 'bg-gray-600'
              }`}
            />
            <div className="flex-1 p-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                  Team status:{' '}
                  {status.teamStatus === 'normal'
                    ? 'Normal'
                    : status.teamStatus === 'attention'
                      ? 'Needs attention'
                      : 'Unknown'}
                </p>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{status.teamMessage}</p>
              </div>
              {teamBadge(status.teamStatus)}
            </div>
          </div>

          <div className="px-4 pb-4 space-y-4 border-t border-zinc-200/80 dark:border-white/5 pt-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                <Building2 className="h-5 w-5 text-indigo-500 dark:text-indigo-300" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">Organization</p>
                <p className="text-base font-bold text-zinc-900 dark:text-white mt-0.5 truncate">
                  {status.organizationName || 'Not synced yet'}
                </p>
                {status.organizationSyncedAt && (
                  <p className="text-xs text-zinc-500 mt-1">
                    Last synced {formatDate(status.organizationSyncedAt)}
                  </p>
                )}
                {status.adobeLive && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-500/80 mt-1 flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Verified on Super Reseller
                  </p>
                )}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase mb-2">Active plan</p>
              <div className="flex flex-wrap gap-2">
                {status.products.length > 0 ? (
                  status.products.map((p) => (
                    <span
                      key={p}
                      className="inline-flex px-3 py-1.5 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-white/5 text-zinc-700 dark:text-gray-200 border border-zinc-200 dark:border-white/10"
                    >
                      {p}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-zinc-500 italic">No product label</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#111111] p-5 space-y-4">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-300">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs font-bold tracking-widest uppercase">Subscription details</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p
                className={`text-3xl font-bold tabular-nums ${
                  status.overallStatus === 'expired' ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {status.overallStatus === 'expired' ? '0' : status.daysLeft}
              </p>
              <p className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase mt-1">Days left</p>
            </div>
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <p className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">Progress</p>
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{progressUsed}% used</p>
              </div>
              <div className="h-2 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${progressTone} transition-all duration-500`}
                  style={{ width: `${progressUsed}%` }}
                />
              </div>
              <p className="text-[10px] text-zinc-500 mt-2 leading-snug">
                {formatDateTime(status.activatedAt)} → {formatDateTime(status.expiresAt)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-zinc-200/80 dark:border-white/5">
            <div>
              <p className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">Plan duration</p>
              <p className="text-sm font-bold text-zinc-900 dark:text-white mt-1">{status.planDuration}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">Added on</p>
              <p className="text-sm font-bold text-zinc-900 dark:text-white mt-1">{formatDate(status.activatedAt)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-500 pt-1">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>
              Expires <span className="text-zinc-700 dark:text-gray-300 font-medium">{formatDate(status.expiresAt)}</span>
            </span>
          </div>
        </div>

        {status.refundEligible && status.refundRemainingMs != null && (
          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 px-4 py-3 flex items-center gap-3 text-sm text-violet-700 dark:text-violet-200">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-violet-500 dark:text-violet-300" />
            <span>
              Refund window:{' '}
              <span className="font-bold">{formatRefundRemaining(status.refundRemainingMs)}</span> remaining
            </span>
          </div>
        )}

        {status.teamStatus === 'attention' && !status.adobeLive && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 flex items-start gap-3 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <span>Super Reseller data may still be syncing. Search again in a few minutes for the latest status.</span>
          </div>
        )}
      </div>
    </div>
  );
};
