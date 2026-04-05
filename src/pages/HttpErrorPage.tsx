import React, { useMemo } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Braces,
  Clock,
  CloudOff,
  CreditCard,
  FileQuestion,
  FileWarning,
  FileX2,
  GitBranch,
  Home,
  Hourglass,
  ListX,
  Lock,
  LogIn,
  PackageX,
  Puzzle,
  RefreshCw,
  ShieldOff,
  ShoppingBag,
  SlidersHorizontal,
  Timer,
  Unplug,
  Upload,
  Wrench,
} from 'lucide-react';

const ease = [0.22, 1, 0.36, 1] as const;

type ErrorConfig = {
  code: number;
  title: string;
  subtitle: string;
  hints: string[];
  Icon: LucideIcon;
  orbA: string;
  orbB: string;
  orbC: string;
  badgeClass: string;
  codeClass: string;
};

const CONFIG: Record<number, ErrorConfig> = {
  400: {
    code: 400,
    title: 'That request didn’t work',
    subtitle: 'Something in the data sent from this page wasn’t accepted. It’s usually a quick fix — check the form and try again.',
    hints: ['Refresh the page if fields look empty', 'Remove special characters if you pasted from elsewhere'],
    Icon: FileWarning,
    orbA: 'bg-amber-500/25',
    orbB: 'bg-orange-600/20',
    orbC: 'bg-yellow-500/15',
    badgeClass: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
    codeClass: 'from-amber-200 via-orange-200 to-yellow-100',
  },
  401: {
    code: 401,
    title: 'Sign in required',
    subtitle: 'Your session may have ended or you’re not logged in yet. Sign in again to continue where you left off.',
    hints: ['Sessions expire after a period of inactivity for security'],
    Icon: Lock,
    orbA: 'bg-indigo-600/25',
    orbB: 'bg-violet-600/20',
    orbC: 'bg-blue-500/15',
    badgeClass: 'border-indigo-400/30 bg-indigo-500/10 text-indigo-200',
    codeClass: 'from-indigo-200 via-violet-200 to-blue-100',
  },
  402: {
    code: 402,
    title: 'Payment needed',
    subtitle: 'This action requires payment or an active subscription before it can continue. Complete checkout or top up, then try again.',
    hints: ['Reserved in HTTP for payment-required flows (rare in browsers)', 'Check wallet balance or renewal status if you’re paying inside the app'],
    Icon: CreditCard,
    orbA: 'bg-emerald-600/22',
    orbB: 'bg-teal-600/18',
    orbC: 'bg-cyan-500/12',
    badgeClass: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
    codeClass: 'from-emerald-200 via-teal-200 to-cyan-100',
  },
  403: {
    code: 403,
    title: 'Access not allowed',
    subtitle: 'You’re signed in, but this action or page isn’t available for your account. If you think that’s wrong, contact support.',
    hints: ['Admins may have restricted this feature', 'Try going back to your dashboard'],
    Icon: ShieldOff,
    orbA: 'bg-rose-600/25',
    orbB: 'bg-red-600/18',
    orbC: 'bg-fuchsia-500/12',
    badgeClass: 'border-rose-400/30 bg-rose-500/10 text-rose-200',
    codeClass: 'from-rose-200 via-red-200 to-fuchsia-100',
  },
  404: {
    code: 404,
    title: 'Page not found',
    subtitle: 'This URL doesn’t exist or was moved. Double-check the link, or head home and open the section you need from the menu.',
    hints: ['Broken bookmarks and mistyped addresses are the usual cause', 'Use the store or dashboard links below if you’re lost'],
    Icon: FileQuestion,
    orbA: 'bg-sky-600/22',
    orbB: 'bg-blue-600/18',
    orbC: 'bg-indigo-500/12',
    badgeClass: 'border-sky-400/30 bg-sky-500/10 text-sky-200',
    codeClass: 'from-sky-200 via-blue-200 to-indigo-100',
  },
  405: {
    code: 405,
    title: 'Method not allowed',
    subtitle: 'This address doesn’t support the way the request was sent (for example GET vs POST). That’s a configuration issue, not something you can fix in the form.',
    hints: ['Try again from the official app or site (not a raw bookmarked API URL)', 'If it keeps happening, tell support which button you pressed'],
    Icon: ArrowLeftRight,
    orbA: 'bg-orange-600/22',
    orbB: 'bg-amber-600/18',
    orbC: 'bg-yellow-500/12',
    badgeClass: 'border-orange-400/30 bg-orange-500/10 text-orange-200',
    codeClass: 'from-orange-200 via-amber-200 to-yellow-100',
  },
  406: {
    code: 406,
    title: 'Can’t satisfy this format',
    subtitle: 'The server can’t produce a response in the format your client asked for (Accept headers). Usually automatic — a refresh or app update fixes it.',
    hints: ['Hard refresh the page (Ctrl+Shift+R)', 'Update the app or browser if you’re on an old version'],
    Icon: SlidersHorizontal,
    orbA: 'bg-violet-600/22',
    orbB: 'bg-purple-600/18',
    orbC: 'bg-fuchsia-500/12',
    badgeClass: 'border-violet-400/30 bg-violet-500/10 text-violet-200',
    codeClass: 'from-violet-200 via-purple-200 to-fuchsia-100',
  },
  408: {
    code: 408,
    title: 'Request timed out',
    subtitle: 'The server waited for your request to finish but it took too long. Your network might be slow or the connection dropped briefly.',
    hints: ['Check Wi‑Fi or mobile data and try again', 'Avoid uploading huge files on a weak signal'],
    Icon: Clock,
    orbA: 'bg-amber-600/20',
    orbB: 'bg-yellow-600/16',
    orbC: 'bg-lime-500/10',
    badgeClass: 'border-amber-400/25 bg-amber-500/10 text-amber-200',
    codeClass: 'from-amber-200 via-yellow-200 to-lime-100',
  },
  409: {
    code: 409,
    title: 'This conflicts with the latest data',
    subtitle: 'Something changed on the server since this page loaded — for example an order or slot was already taken. Refresh and try once more.',
    hints: ['Refresh before retrying the same action', 'Open one tab at a time for sensitive steps'],
    Icon: GitBranch,
    orbA: 'bg-purple-600/25',
    orbB: 'bg-violet-600/20',
    orbC: 'bg-fuchsia-500/15',
    badgeClass: 'border-purple-400/30 bg-purple-500/10 text-purple-200',
    codeClass: 'from-purple-200 via-violet-200 to-fuchsia-100',
  },
  410: {
    code: 410,
    title: 'Gone — no longer here',
    subtitle: 'This resource used to exist but was permanently removed. The link won’t work again; use a current link from the site or app.',
    hints: ['Old emails or posts may point to retired URLs', 'Open the homepage and navigate fresh'],
    Icon: PackageX,
    orbA: 'bg-stone-600/22',
    orbB: 'bg-zinc-600/18',
    orbC: 'bg-neutral-500/12',
    badgeClass: 'border-stone-400/30 bg-stone-500/10 text-stone-200',
    codeClass: 'from-stone-200 via-zinc-200 to-neutral-100',
  },
  413: {
    code: 413,
    title: 'Payload too large',
    subtitle: 'The file or data you sent is bigger than the server allows. Compress, resize, or split it into smaller parts.',
    hints: ['Images: shrink dimensions or export as JPEG/WebP', 'Try a file under a few MB unless the product says otherwise'],
    Icon: Upload,
    orbA: 'bg-red-600/20',
    orbB: 'bg-orange-600/18',
    orbC: 'bg-rose-500/12',
    badgeClass: 'border-red-400/30 bg-red-500/10 text-red-200',
    codeClass: 'from-red-200 via-orange-200 to-rose-100',
  },
  415: {
    code: 415,
    title: 'Unsupported media type',
    subtitle: 'The server doesn’t accept this file or content type. Use a format listed in the upload instructions (for example PNG, JPG, or PDF).',
    hints: ['Rename alone doesn’t change file type — convert in an editor', 'If the API expects JSON, don’t send form-data by mistake'],
    Icon: FileX2,
    orbA: 'bg-pink-600/22',
    orbB: 'bg-rose-600/18',
    orbC: 'bg-fuchsia-500/12',
    badgeClass: 'border-pink-400/30 bg-pink-500/10 text-pink-200',
    codeClass: 'from-pink-200 via-rose-200 to-fuchsia-100',
  },
  422: {
    code: 422,
    title: 'We couldn’t process that input',
    subtitle: 'The shape of the data was understood, but values failed validation (missing fields, wrong format, or business rules). Fix the highlighted issues and submit again.',
    hints: ['Read any inline error messages on the form', 'Check required fields and formats (email, phone, dates)'],
    Icon: ListX,
    orbA: 'bg-lime-600/18',
    orbB: 'bg-green-600/16',
    orbC: 'bg-emerald-500/12',
    badgeClass: 'border-lime-400/30 bg-lime-500/10 text-lime-200',
    codeClass: 'from-lime-200 via-green-200 to-emerald-100',
  },
  429: {
    code: 429,
    title: 'Slow down for a moment',
    subtitle: 'Too many actions happened in a short time. Wait a little, then try again — this protects the service for everyone.',
    hints: ['Usually clears within a minute', 'Avoid double-clicking submit buttons'],
    Icon: Timer,
    orbA: 'bg-cyan-500/25',
    orbB: 'bg-teal-600/20',
    orbC: 'bg-emerald-500/12',
    badgeClass: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200',
    codeClass: 'from-cyan-200 via-teal-200 to-emerald-100',
  },
  500: {
    code: 500,
    title: 'Something went wrong on our side',
    subtitle: 'We hit an unexpected server problem. It’s not your fault. You can retry in a moment or check the status page.',
    hints: ['If it keeps happening, note the time and tell support'],
    Icon: Wrench,
    orbA: 'bg-slate-500/20',
    orbB: 'bg-red-600/22',
    orbC: 'bg-orange-500/12',
    badgeClass: 'border-slate-400/25 bg-white/5 text-slate-200',
    codeClass: 'from-slate-100 via-red-100/90 to-orange-100',
  },
  501: {
    code: 501,
    title: 'Not implemented',
    subtitle: 'The server doesn’t support this operation yet. Nothing is wrong with your device — the feature or HTTP method isn’t available on this endpoint.',
    hints: ['You may be using an outdated client link', 'Contact support if the app explicitly offered this action'],
    Icon: Puzzle,
    orbA: 'bg-indigo-600/20',
    orbB: 'bg-violet-600/18',
    orbC: 'bg-purple-500/12',
    badgeClass: 'border-indigo-400/25 bg-indigo-500/10 text-indigo-200',
    codeClass: 'from-indigo-200 via-violet-200 to-purple-100',
  },
  502: {
    code: 502,
    title: 'Bad gateway',
    subtitle: 'A front server got an invalid response from an upstream service. Often temporary — infrastructure is reconnecting.',
    hints: ['Wait a minute and refresh', 'Check the status page for outages'],
    Icon: Unplug,
    orbA: 'bg-orange-600/22',
    orbB: 'bg-red-600/20',
    orbC: 'bg-amber-500/12',
    badgeClass: 'border-orange-400/30 bg-orange-500/10 text-orange-200',
    codeClass: 'from-orange-200 via-red-200 to-amber-100',
  },
  503: {
    code: 503,
    title: 'Service unavailable',
    subtitle: 'We’re temporarily at capacity or undergoing maintenance. Please try again shortly — no action is required on your account.',
    hints: ['Planned work is often announced on the status page', 'Retry with a short pause instead of hammering refresh'],
    Icon: CloudOff,
    orbA: 'bg-blue-600/22',
    orbB: 'bg-slate-600/20',
    orbC: 'bg-cyan-500/12',
    badgeClass: 'border-blue-400/30 bg-blue-500/10 text-blue-200',
    codeClass: 'from-blue-200 via-slate-200 to-cyan-100',
  },
  504: {
    code: 504,
    title: 'Gateway timeout',
    subtitle: 'A server in the middle waited too long for another service. The request may still have completed in the background — check orders or history before retrying.',
    hints: ['Wait and retry once', 'Avoid duplicate payments if you already submitted'],
    Icon: Hourglass,
    orbA: 'bg-teal-600/22',
    orbB: 'bg-cyan-600/18',
    orbC: 'bg-emerald-500/12',
    badgeClass: 'border-teal-400/30 bg-teal-500/10 text-teal-200',
    codeClass: 'from-teal-200 via-cyan-200 to-emerald-100',
  },
  505: {
    code: 505,
    title: 'HTTP version not supported',
    subtitle: 'The server refuses the HTTP protocol version used for this request. Extremely rare in normal browsers — usually a proxy, VPN, or custom client.',
    hints: ['Try another network or disable an unusual proxy', 'Update your browser to the latest version'],
    Icon: Braces,
    orbA: 'bg-zinc-600/22',
    orbB: 'bg-neutral-600/18',
    orbC: 'bg-slate-500/12',
    badgeClass: 'border-zinc-400/30 bg-zinc-500/10 text-zinc-200',
    codeClass: 'from-zinc-200 via-neutral-200 to-slate-100',
  },
};

const VALID = new Set(Object.keys(CONFIG).map(Number));

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.06 },
  },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease } },
};

export function HttpErrorPage() {
  const { code: codeParam } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const code = useMemo(() => {
    const n = parseInt(String(codeParam), 10);
    return Number.isFinite(n) && VALID.has(n) ? n : null;
  }, [codeParam]);

  if (code === null) {
    return <Navigate to="/error/500" replace />;
  }

  const cfg = CONFIG[code];
  const Icon = cfg.Icon;

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#050508] text-white">
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          className={`absolute -left-1/4 top-0 h-[72vh] w-[72vw] rounded-full ${cfg.orbA} blur-[120px]`}
          animate={{ x: [0, 36, 0], y: [0, 24, 0], opacity: [0.35, 0.55, 0.35] }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className={`absolute -right-1/4 bottom-0 h-[64vh] w-[64vw] rounded-full ${cfg.orbB} blur-[110px]`}
          animate={{ x: [0, -28, 0], y: [0, -20, 0], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className={`absolute left-1/2 top-1/2 h-[42vh] w-[42vw] -translate-x-1/2 -translate-y-1/2 rounded-full ${cfg.orbC} blur-[95px]`}
          animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.38, 0.2] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div
          className="absolute inset-0 opacity-[0.1]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.12) 1px, transparent 0)`,
            backgroundSize: '28px 28px',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-lg flex-col items-center justify-center px-5 py-16 text-center sm:max-w-xl">
        <motion.div variants={container} initial="hidden" animate="show" className="flex w-full flex-col items-center">
          <motion.div variants={item} className="relative mb-8">
            <motion.div
              className="absolute inset-0 scale-[1.35] rounded-full bg-white/8 blur-2xl"
              animate={{ opacity: [0.4, 0.7, 0.4], scale: [1.35, 1.45, 1.35] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className={`relative flex h-24 w-24 items-center justify-center rounded-3xl border ${cfg.badgeClass} backdrop-blur-sm shadow-[0_0_60px_rgba(0,0,0,0.35)]`}
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Icon className="h-11 w-11 text-white/95" strokeWidth={1.5} aria-hidden />
            </motion.div>
          </motion.div>

          <motion.div variants={item} className={`mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] ${cfg.badgeClass}`}>
            <AlertTriangle className="h-3.5 w-3.5 opacity-80" aria-hidden />
            Error {cfg.code}
          </motion.div>

          <motion.h1
            variants={item}
            className="font-calm text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-[2.35rem] leading-tight"
          >
            {cfg.title}
          </motion.h1>

          <motion.p variants={item} className="mt-4 text-sm leading-relaxed text-white/65 sm:text-base max-w-md">
            {cfg.subtitle}
          </motion.p>

          <motion.div
            variants={item}
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
          >
            <motion.span
              className={`inline-block bg-gradient-to-br ${cfg.codeClass} bg-clip-text text-6xl font-black tabular-nums tracking-tighter text-transparent sm:text-7xl md:text-8xl drop-shadow-sm`}
              animate={{ scale: [1, 1.02, 1] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
            >
              {cfg.code}
            </motion.span>
          </motion.div>

          <motion.ul variants={item} className="mt-10 w-full max-w-md space-y-2.5 text-left text-sm text-white/55">
            {cfg.hints.map((h) => (
              <li key={h} className="flex gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-2.5 backdrop-blur-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/40" aria-hidden />
                <span>{h}</span>
              </li>
            ))}
          </motion.ul>

          <motion.div variants={item} className="mt-10 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 transition hover:bg-white/10"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Go back
            </button>
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-gray-900 transition hover:bg-white/90"
            >
              <Home className="h-4 w-4" aria-hidden />
              Home
            </Link>
            {cfg.code === 401 && (
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-indigo-400/40 bg-indigo-500/20 px-5 py-3 text-sm font-semibold text-indigo-100 transition hover:bg-indigo-500/30"
              >
                <LogIn className="h-4 w-4" aria-hidden />
                Sign in
              </Link>
            )}
            {cfg.code === 404 && (
              <Link
                to="/store"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-sky-400/40 bg-sky-500/15 px-5 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/25"
              >
                <ShoppingBag className="h-4 w-4" aria-hidden />
                Store
              </Link>
            )}
          </motion.div>

          <motion.div variants={item} className="mt-8 text-[11px] text-white/35">
            <Link to="/status" className="underline decoration-white/20 underline-offset-4 hover:text-white/55">
              Service status
            </Link>
            <span className="mx-2">·</span>
            <Link to="/support" className="underline decoration-white/20 underline-offset-4 hover:text-white/55">
              Support
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
