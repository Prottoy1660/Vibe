import React from 'react';
import { motion } from 'framer-motion';
import { AdobeSuiteCalmRow } from './AdobeCreativeSuiteIcons';

const ease = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 * i, duration: 0.65, ease },
  }),
};

type Props = {
  variant: 'login' | 'register';
  isDark: boolean;
};

const REGISTER_LINES = [
  'Instant access to premium subscriptions',
  'Secure automated delivery system',
  '24/7 dedicated support team',
];

/**
 * Calm editorial side panel: serif/sans typography + optional Adobe suite marks (user SVGs).
 */
export function AuthCalmSidePanel({ variant, isDark }: Props) {
  const muted = isDark ? 'text-zinc-500' : 'text-slate-500';
  const body = isDark ? 'text-zinc-400' : 'text-slate-600';
  const headline = isDark ? 'text-zinc-100' : 'text-slate-900';
  const card = isDark
    ? 'border border-white/[0.07] bg-[#0c0c0e]/[0.55] shadow-[0_24px_80px_-24px_rgba(0,0,0,0.65)]'
    : 'border border-slate-200/90 bg-white/[0.72] shadow-[0_20px_60px_-20px_rgba(15,23,42,0.12)]';

  return (
    <div className={`relative overflow-hidden rounded-[2rem] px-7 py-9 sm:px-9 sm:py-11 backdrop-blur-xl ${card}`}>
      {/* Soft breathing light — very slow, non-distracting */}
      <motion.div
        aria-hidden
        className={`pointer-events-none absolute -left-1/4 top-1/2 h-[120%] w-[70%] rounded-full blur-[80px] ${
          isDark ? 'bg-indigo-600/[0.09]' : 'bg-indigo-400/[0.12]'
        }`}
        animate={{ opacity: [0.45, 0.75, 0.45], scale: [1, 1.03, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className={`pointer-events-none absolute -right-1/4 bottom-0 h-[90%] w-[55%] rounded-full blur-[70px] ${
          isDark ? 'bg-violet-600/[0.06]' : 'bg-violet-300/[0.14]'
        }`}
        animate={{ opacity: [0.35, 0.6, 0.35] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
      />

      {/* Vertical hairline — subtle rhythm */}
      <motion.div
        aria-hidden
        className={`absolute left-6 top-0 bottom-0 w-px sm:left-7 ${
          isDark ? 'bg-gradient-to-b from-transparent via-white/12 to-transparent' : 'bg-gradient-to-b from-transparent via-slate-300/70 to-transparent'
        }`}
        initial={{ scaleY: 0, originY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 1.1, ease }}
      />

      <div className="relative pl-5 sm:pl-6">
        {variant === 'login' ? (
          <>
            <motion.p
              custom={0}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className={`font-calm text-[11px] font-medium uppercase tracking-[0.28em] ${muted}`}
            >
              Trusted by many
            </motion.p>

            <motion.div
              custom={1}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="mt-5 flex flex-wrap items-end gap-x-4 gap-y-2"
            >
              <span className={`font-display text-[clamp(2.75rem,6vw,3.75rem)] font-semibold leading-none tracking-tight ${headline}`}>
                5,000+
              </span>
              <span className={`font-calm max-w-[12rem] pb-1 text-[13px] font-medium leading-snug ${body}`}>
                users trust our platform
              </span>
            </motion.div>

            <motion.h2
              custom={2}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className={`font-display mt-9 text-[clamp(1.65rem,3.2vw,2.15rem)] font-semibold leading-[1.2] tracking-[-0.02em] ${headline}`}
            >
              Unlock your potential
              <span className={`mt-2 block font-display text-[clamp(1.35rem,2.6vw,1.75rem)] font-medium italic text-zinc-400 dark:text-zinc-500`}>
                with instant access to premium tools.
              </span>
            </motion.h2>

            <motion.p
              custom={3}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className={`font-calm mt-7 max-w-md text-[15px] font-normal leading-[1.75] ${body}`}
            >
              Experience seamless delivery of Adobe subscriptions directly to your dashboard. No waiting, no complex setups.{' '}
              <span className={`font-medium ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>Just pure creativity.</span>
            </motion.p>

            <motion.div custom={4} variants={fadeUp} initial="hidden" animate="show" className="mt-9 max-w-md">
              <AdobeSuiteCalmRow isDark={isDark} />
            </motion.div>

            <motion.div
              aria-hidden
              className={`mt-10 h-px max-w-xs bg-gradient-to-r ${isDark ? 'from-white/20 to-transparent' : 'from-slate-300 to-transparent'}`}
              initial={{ scaleX: 0, originX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.85, duration: 1, ease }}
            />
          </>
        ) : (
          <>
            <motion.p
              custom={0}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className={`font-calm text-[11px] font-medium uppercase tracking-[0.28em] ${muted}`}
            >
              Why join
            </motion.p>

            <motion.h2
              custom={1}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className={`font-display mt-6 text-[clamp(1.85rem,3.6vw,2.45rem)] font-semibold leading-[1.18] tracking-[-0.02em] ${headline}`}
            >
              Join the next generation of professionals.
            </motion.h2>

            <ul className="mt-9 space-y-7">
              {REGISTER_LINES.map((line, i) => (
                <motion.li
                  key={line}
                  custom={i + 2}
                  variants={fadeUp}
                  initial="hidden"
                  animate="show"
                  className="group flex gap-5"
                >
                  <span
                    className={`font-display pt-0.5 text-2xl font-semibold tabular-nums leading-none ${
                      isDark ? 'text-white/[0.12] group-hover:text-indigo-400/40' : 'text-slate-300 group-hover:text-indigo-400/50'
                    } transition-colors duration-500`}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <p className={`font-calm flex-1 text-[15px] font-normal leading-[1.7] ${body}`}>{line}</p>
                </motion.li>
              ))}
            </ul>

            <motion.div custom={5} variants={fadeUp} initial="hidden" animate="show" className="mt-10 max-w-md">
              <AdobeSuiteCalmRow isDark={isDark} />
            </motion.div>

            <motion.div
              aria-hidden
              className={`mt-10 h-px max-w-xs bg-gradient-to-r ${isDark ? 'from-white/15 to-transparent' : 'from-slate-300 to-transparent'}`}
              initial={{ scaleX: 0, originX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.9, duration: 1, ease }}
            />
          </>
        )}
      </div>
    </div>
  );
}
