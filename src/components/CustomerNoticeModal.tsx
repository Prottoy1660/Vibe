import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bell, ExternalLink } from 'lucide-react';
import { snoozeNoticeModal } from '../lib/noticeModalStorage';

/** Active row from `welcome_popups` shown in the customer welcome modal. */
export type WelcomePopupContent = {
  id: string;
  title: string;
  content: string;
  type: string;
  created_at: string;
  hero_image_url?: string | null;
  cta_label?: string | null;
  cta_url?: string | null;
  snooze_hours?: number | null;
};

type Props = {
  notice: WelcomePopupContent;
  onClose: () => void;
};

export const CustomerNoticeModal: React.FC<Props> = ({ notice, onClose }) => {
  const snoozeH = Math.min(168, Math.max(1, Math.floor(Number(notice.snooze_hours) || 6)));
  const hasHero = Boolean(notice.hero_image_url?.trim());
  const ctaLabel = notice.cta_label?.trim() || 'Learn more';
  const ctaUrl = notice.cta_url?.trim() || '';
  const [heroBroken, setHeroBroken] = useState(false);

  useEffect(() => {
    setHeroBroken(false);
  }, [notice.id, notice.hero_image_url]);

  /** Modal rim tint only — buttons stay neutral glass so they work on any hero artwork. */
  const accent = useMemo(() => {
    const t = notice.type;
    if (t === 'error') return { ring: 'ring-red-500/40' };
    if (t === 'warning') return { ring: 'ring-amber-500/35' };
    return { ring: 'ring-violet-500/35' };
  }, [notice.type]);

  const btnPrimaryGlass =
    'inline-flex items-center justify-center gap-2 rounded-full border border-white/45 bg-white/22 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_6px_28px_rgba(0,0,0,0.35)] backdrop-blur-xl transition hover:border-white/60 hover:bg-white/32 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70';

  const btnSecondaryGlass =
    'inline-flex items-center justify-center gap-2 rounded-full border border-white/30 bg-white/12 px-6 py-3.5 text-sm font-semibold text-white/95 shadow-[0_4px_20px_rgba(0,0,0,0.25)] backdrop-blur-xl transition hover:border-white/45 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60';

  const handleDismiss = () => {
    snoozeNoticeModal(notice.id, snoozeH);
    onClose();
  };

  const openCta = () => {
    if (ctaUrl) window.open(ctaUrl, '_blank', 'noopener,noreferrer');
  };

  if (typeof document === 'undefined') return null;

  const heroSrc = notice.hero_image_url?.trim() || '';

  return createPortal(
    <AnimatePresence>
      <motion.div
        key={notice.id}
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-notice-title"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6"
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/65 backdrop-blur-md"
          aria-hidden
        />
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className={`relative w-full overflow-hidden rounded-2xl shadow-2xl ring-1 ${accent.ring} ring-inset ${
            hasHero && !heroBroken ? 'max-w-2xl sm:max-w-3xl' : 'max-w-lg'
          }`}
        >
          {hasHero && !heroBroken ? (
            <>
              <span id="customer-notice-title" className="sr-only">
                {notice.title}. {notice.content}
              </span>
              {/* One surface: hero fills the card; chrome floats on soft gradients (no solid black bars). */}
              <div className="relative bg-zinc-950 text-white">
                <img
                  src={heroSrc}
                  alt=""
                  className="block max-h-[min(78vh,800px)] w-full object-contain object-center"
                  onError={() => setHeroBroken(true)}
                />

                <div
                  className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-28 bg-gradient-to-b from-black/75 via-black/40 to-transparent sm:h-32"
                  aria-hidden
                />

                <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] flex items-start justify-between gap-2 p-3 sm:p-4">
                  <div className="pointer-events-auto inline-flex max-w-[calc(100%-3.5rem)] items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1.5 text-[10px] font-medium text-white shadow-sm backdrop-blur-md sm:max-w-[20rem] sm:text-xs">
                    <Bell className="h-3.5 w-3.5 shrink-0 text-violet-200" aria-hidden />
                    <span className="leading-snug text-white/95">
                      Will show again in {snoozeH} hour{snoozeH === 1 ? '' : 's'} after you close
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDismiss}
                    className="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white shadow-sm backdrop-blur-md transition hover:bg-white/20"
                    aria-label="Close notice"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div
              className={`relative min-h-[280px] text-white bg-gradient-to-br from-zinc-950 via-zinc-900 to-rose-950 [background-image:linear-gradient(135deg,#09090b_0%,#18181b_45%,#4c0519_100%)]`}
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.07]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                }}
              />

              <div className="relative flex flex-col px-6 pb-8 pt-5 sm:px-10 sm:pb-10 sm:pt-7">
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[10px] font-medium text-white/95 shadow-sm backdrop-blur-md sm:text-xs">
                    <Bell className="h-3.5 w-3.5 shrink-0 text-white/80" aria-hidden />
                    <span className="leading-snug">
                      Will show again in {snoozeH} hour{snoozeH === 1 ? '' : 's'} after you close
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDismiss}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white shadow-sm backdrop-blur-md transition hover:bg-white/20"
                    aria-label="Close notice"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <h2
                  id="customer-notice-title"
                  className="text-center text-xl font-bold leading-snug tracking-tight text-white drop-shadow-md sm:text-2xl"
                >
                  {notice.title}
                </h2>

                <div className="mt-6 space-y-4 text-center text-sm leading-[1.65] text-white/92 drop-shadow-sm sm:text-[15px]">
                  {notice.content.split('\n').map((paragraph, i) => (
                    <p key={i} className="whitespace-pre-wrap break-words">
                      {paragraph}
                    </p>
                  ))}
                </div>

                <div className="mt-9 flex flex-col items-stretch gap-3 sm:mt-11 sm:flex-row sm:justify-center">
                  {ctaUrl ? (
                    <button type="button" onClick={openCta} className={btnPrimaryGlass}>
                      {ctaLabel}
                      <ExternalLink className="h-4 w-4 opacity-90" aria-hidden />
                    </button>
                  ) : null}
                  <button type="button" onClick={handleDismiss} className={btnSecondaryGlass}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
};
