import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Loader2,
  Building2,
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  DollarSign,
  ShieldCheck,
} from 'lucide-react';
import { ResellerApi, ResellerUser, ResellerUserStatus } from '../../services/reseller/resellerApi';

type Props = {
  user: ResellerUser;
  onClose: () => void;
};

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

export const UserStatusModal: React.FC<Props> = ({ user, onClose }) => {
  const [status, setStatus] = useState<ResellerUserStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const data = await ResellerApi.getUserStatus(user.id, { forceRefresh });
      setStatus(data);
    } catch (e: any) {
      setError(e?.message || 'Could not load status');
      setStatus(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load(true);
  }, [user.id]);

  const progressUsed = status?.progressPercent ?? 0;
  const progressTone =
    status?.overallStatus === 'expired'
      ? 'from-red-500 to-rose-400'
      : progressUsed >= 85
        ? 'from-amber-500 to-yellow-400'
        : 'from-emerald-500 to-teal-400';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar bg-[#0a0a0a] border border-white/10 rounded-3xl shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 p-6 border-b border-white/5 bg-[#0a0a0a]/95 backdrop-blur-md">
          <div>
            <h2 className="text-xl font-bold text-white">Subscription Status</h2>
            <p className="text-sm text-gray-400 mt-1 break-all">{user.email}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={loading || refreshing}
              className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
              title="Refresh from Super Reseller"
            >
              <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {loading && !status ? (
            <div className="py-16 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-400 mx-auto" />
              <p className="text-gray-500 mt-4 text-sm font-medium">Checking subscription…</p>
            </div>
          ) : error && !status ? (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-4 text-sm text-rose-300">
              {error}
            </div>
          ) : status ? (
            <>
              <div className="flex justify-center">{overallBadge(status.overallStatus)}</div>

              <div className="rounded-2xl border border-white/10 bg-[#111111] overflow-hidden">
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
                      <p className="text-sm font-semibold text-white">
                        Team status:{' '}
                        {status.teamStatus === 'normal'
                          ? 'Normal'
                          : status.teamStatus === 'attention'
                            ? 'Needs attention'
                            : 'Unknown'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{status.teamMessage}</p>
                    </div>
                    {teamBadge(status.teamStatus)}
                  </div>
                </div>

                <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-4">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                      <Building2 className="h-5 w-5 text-indigo-300" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Organization</p>
                      <p className="text-base font-bold text-white mt-0.5 truncate">
                        {status.organizationName || 'Not synced yet'}
                      </p>
                      {status.organizationSyncedAt && (
                        <p className="text-xs text-gray-500 mt-1">
                          Last synced {formatDate(status.organizationSyncedAt)}
                        </p>
                      )}
                      {status.adobeLive && (
                        <p className="text-xs text-emerald-500/80 mt-1 flex items-center gap-1">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Verified on Super Reseller
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mb-2">Active plan</p>
                    <div className="flex flex-wrap gap-2">
                      {status.products.length > 0 ? (
                        status.products.map((p) => (
                          <span
                            key={p}
                            className="inline-flex px-3 py-1.5 rounded-full text-xs font-semibold bg-white/5 text-gray-200 border border-white/10"
                          >
                            {p}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-gray-500 italic">No product label</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#111111] p-5 space-y-4">
                <div className="flex items-center gap-2 text-indigo-300">
                  <DollarSign className="h-4 w-4" />
                  <span className="text-xs font-bold tracking-widest uppercase">Subscription details</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p
                      className={`text-3xl font-bold tabular-nums ${
                        status.overallStatus === 'expired' ? 'text-red-400' : 'text-emerald-400'
                      }`}
                    >
                      {status.overallStatus === 'expired' ? '0' : status.daysLeft}
                    </p>
                    <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mt-1">Days left</p>
                  </div>
                  <div>
                    <div className="flex justify-between items-baseline mb-2">
                      <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Progress</p>
                      <p className="text-xs font-bold text-emerald-400">{progressUsed}% used</p>
                    </div>
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${progressTone} transition-all duration-500`}
                        style={{ width: `${progressUsed}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-500 mt-2 leading-snug">
                      {formatDateTime(status.activatedAt)} → {formatDateTime(status.expiresAt)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Plan duration</p>
                    <p className="text-sm font-bold text-white mt-1">{status.planDuration}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Added on</p>
                    <p className="text-sm font-bold text-white mt-1">{formatDate(status.activatedAt)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-500 pt-1">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Expires{' '}
                    <span className="text-gray-300 font-medium">{formatDate(status.expiresAt)}</span>
                  </span>
                </div>
              </div>

              {status.refundEligible && status.refundRemainingMs != null && (
                <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 px-4 py-3 flex items-center gap-3 text-sm text-violet-200">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-violet-300" />
                  <span>
                    Refund window:{' '}
                    <span className="font-bold">{formatRefundRemaining(status.refundRemainingMs)}</span> remaining
                  </span>
                </div>
              )}

              {status.teamStatus === 'attention' && !status.adobeLive && (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 flex items-start gap-3 text-sm text-amber-200">
                  <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                  <span>
                    Use <span className="font-semibold">Refresh</span> on My Users or here to pull the latest status from Super Reseller.
                  </span>
                </div>
              )}
            </>
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
};
