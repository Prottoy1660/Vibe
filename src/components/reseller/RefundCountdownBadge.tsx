import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';

const REFUND_WINDOW_MS = 24 * 60 * 60 * 1000;

function getRefundState(activatedAt: string, now: number) {
  const activatedMs = new Date(activatedAt).getTime();
  if (Number.isNaN(activatedMs)) return null;

  const deadlineMs = activatedMs + REFUND_WINDOW_MS;
  const remainingMs = deadlineMs - now;
  if (remainingMs <= 0) return null;

  const progress = remainingMs / REFUND_WINDOW_MS;
  return { remainingMs, progress, deadlineMs };
}

function formatRemaining(ms: number) {
  const totalSec = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  return `${seconds}s`;
}

function toneForProgress(progress: number) {
  if (progress <= 1 / 24) {
    return {
      text: 'text-rose-300',
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/30',
      ring: 'stroke-rose-400',
      glow: 'shadow-rose-500/20',
    };
  }
  if (progress <= 6 / 24) {
    return {
      text: 'text-amber-300',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      ring: 'stroke-amber-400',
      glow: 'shadow-amber-500/15',
    };
  }
  return {
    text: 'text-indigo-300',
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/30',
    ring: 'stroke-indigo-400',
    glow: 'shadow-indigo-500/15',
  };
}

type RefundCountdownBadgeProps = {
  activatedAt: string;
  onExpired?: () => void;
  /** `compact` = single-line badge for dense table rows */
  variant?: 'default' | 'compact';
};

export const RefundCountdownBadge: React.FC<RefundCountdownBadgeProps> = ({
  activatedAt,
  onExpired,
  variant = 'default',
}) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const state = useMemo(() => getRefundState(activatedAt, now), [activatedAt, now]);

  useEffect(() => {
    if (!state && onExpired) onExpired();
  }, [state, onExpired]);

  if (!state) return null;

  const { remainingMs, progress } = state;
  const tone = toneForProgress(progress);
  const label = formatRemaining(remainingMs);
  const urgent = progress <= 1 / 24;
  const circumference = 2 * Math.PI * 7;
  const dashOffset = circumference * (1 - progress);

  const ring = (
    <span className="relative flex h-[16px] w-[16px] shrink-0 items-center justify-center">
      <svg className="h-[16px] w-[16px] -rotate-90" viewBox="0 0 18 18" aria-hidden>
        <circle cx="9" cy="9" r="7" fill="none" className="stroke-white/10" strokeWidth="2" />
        <motion.circle
          cx="9"
          cy="9"
          r="7"
          fill="none"
          className={tone.ring}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 0.85, ease: 'linear' }}
        />
      </svg>
      {urgent && (
        <motion.span
          className={`absolute inset-0 rounded-full ${tone.bg}`}
          animate={{ opacity: [0.35, 0.75, 0.35], scale: [1, 1.15, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </span>
  );

  if (variant === 'compact') {
    return (
      <motion.span
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        title="Full refund if removed before this timer ends"
        className={`inline-flex items-center gap-1.5 whitespace-nowrap pl-1 pr-2 py-0.5 rounded-full border text-[10px] font-medium ${tone.bg} ${tone.border} ${tone.text}`}
      >
        {ring}
        <span className="font-mono tabular-nums">
          Refund <span className="opacity-60">·</span> {label}
        </span>
      </motion.span>
    );
  }

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.92, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      title="Full refund if removed before this timer ends"
      className={`inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border text-[10px] font-semibold tracking-wide shadow-sm ${tone.bg} ${tone.border} ${tone.text} ${tone.glow}`}
    >
      <span className="relative flex h-[18px] w-[18px] shrink-0 items-center justify-center">
        <svg className="h-[18px] w-[18px] -rotate-90" viewBox="0 0 18 18" aria-hidden>
          <circle cx="9" cy="9" r="7" fill="none" className="stroke-white/10" strokeWidth="2" />
          <motion.circle
            cx="9"
            cy="9"
            r="7"
            fill="none"
            className={tone.ring}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={circumference}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 0.85, ease: 'linear' }}
          />
        </svg>
        {urgent && (
          <motion.span
            className={`absolute inset-0 rounded-full ${tone.bg}`}
            animate={{ opacity: [0.35, 0.75, 0.35], scale: [1, 1.15, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </span>

      <span className="flex flex-col leading-none">
        <span className="text-[8px] uppercase tracking-[0.14em] opacity-70">Refund</span>
        <motion.span
          key={label}
          initial={{ opacity: 0.6, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="font-mono tabular-nums text-[11px]"
        >
          {label} left
        </motion.span>
      </span>
    </motion.span>
  );
};

export function isWithinRefundWindow(activatedAt: string, now = Date.now()) {
  return getRefundState(activatedAt, now) !== null;
}
