import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, Wrench, ExternalLink } from 'lucide-react';
import {
  CreativeCloudMark,
  PhotoshopMark,
  IllustratorMark,
  PremiereMark,
  AfterEffectsMark,
  InDesignMark,
  LightroomMark,
} from '../components/auth/AdobeCreativeSuiteIcons';

const ease = [0.22, 1, 0.36, 1] as const;

const FLOAT_APPS = [
  { Mark: PhotoshopMark, label: 'Ps', delay: 0 },
  { Mark: IllustratorMark, label: 'Ai', delay: 0.08 },
  { Mark: PremiereMark, label: 'Pr', delay: 0.16 },
  { Mark: AfterEffectsMark, label: 'Ae', delay: 0.24 },
  { Mark: InDesignMark, label: 'Id', delay: 0.32 },
  { Mark: LightroomMark, label: 'Lr', delay: 0.4 },
];

type Props = {
  message?: string;
};

export const PublicMaintenancePage: React.FC<Props> = ({ message }) => {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#050508] text-white">
      {/* Aurora / mesh background */}
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute -left-1/4 top-0 h-[70vh] w-[70vw] rounded-full bg-violet-600/25 blur-[120px]"
          animate={{ x: [0, 40, 0], y: [0, 20, 0], opacity: [0.35, 0.5, 0.35] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -right-1/4 bottom-0 h-[60vh] w-[60vw] rounded-full bg-fuchsia-600/20 blur-[100px]"
          animate={{ x: [0, -30, 0], y: [0, -25, 0], opacity: [0.3, 0.45, 0.3] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute left-1/2 top-1/2 h-[40vh] w-[40vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/15 blur-[90px]"
          animate={{ scale: [1, 1.08, 1], opacity: [0.2, 0.35, 0.2] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.14) 1px, transparent 0)`,
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-4xl flex-col items-center justify-center px-5 py-16 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease }}
          className="mb-8 flex flex-col items-center"
        >
          <motion.div
            className="relative mb-6"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div className="absolute inset-0 scale-150 rounded-full bg-white/10 blur-2xl" />
            <CreativeCloudMark className="relative h-24 w-24 sm:h-28 sm:w-28 drop-shadow-[0_0_40px_rgba(168,85,247,0.45)]" />
          </motion.div>

          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-200/90">
            <Wrench className="h-3.5 w-3.5 text-violet-300" aria-hidden />
            Maintenance
          </div>

          <h1 className="font-calm mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
            We&apos;re polishing{' '}
            <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">
              Creative Cloud
            </span>{' '}
            access
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-zinc-400 sm:text-base">
            The site is temporarily unavailable while we upgrade systems. Please check back soon — your subscriptions and
            data stay safe.
          </p>
        </motion.div>

        {message?.trim() ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.55, ease }}
            className="mb-10 w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-left shadow-xl shadow-black/40 backdrop-blur-md"
          >
            <p className="flex items-start gap-2 text-sm text-zinc-200">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-300/90" aria-hidden />
              <span>{message.trim()}</span>
            </p>
          </motion.div>
        ) : (
          <div className="mb-10" />
        )}

        {/* App constellation */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="mb-10 flex flex-wrap items-end justify-center gap-3 sm:gap-4"
        >
          {FLOAT_APPS.map(({ Mark, label, delay }) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 + delay, duration: 0.5, ease }}
              className="flex flex-col items-center gap-1.5"
            >
              <motion.div
                animate={{ y: [0, -5, 0] }}
                transition={{
                  duration: 2.8 + delay * 3,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay,
                }}
                whileHover={{ scale: 1.06 }}
                className="rounded-2xl border border-white/10 bg-white/[0.07] p-2.5 shadow-lg shadow-black/30 ring-1 ring-white/5 backdrop-blur-sm"
              >
                <Mark className="h-10 w-10 sm:h-11 sm:w-11" />
              </motion.div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55, duration: 0.5 }}
          className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6"
        >
          <Link
            to="/status"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            <ExternalLink className="h-4 w-4 opacity-80" aria-hidden />
            Status page
          </Link>
          <Link
            to="/login"
            className="text-sm font-medium text-zinc-500 transition hover:text-zinc-300 underline-offset-4 hover:underline"
          >
            Admin sign in
          </Link>
        </motion.div>

        <p className="mt-14 text-[11px] text-zinc-600">© {new Date().getFullYear()} · We&apos;ll be back shortly</p>
      </div>
    </div>
  );
};
