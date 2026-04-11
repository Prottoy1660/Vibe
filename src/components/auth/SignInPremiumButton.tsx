import React from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export type SignInPremiumButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  loading?: boolean;
};

/**
 * Premium glass-style CTA for dark SaaS auth. Tailwind + keyframes from tailwind.config.js.
 */
export function SignInPremiumButton({
  loading = false,
  disabled,
  className,
  type = 'submit',
  ...rest
}: SignInPremiumButtonProps) {
  const isDisabled = Boolean(disabled || loading);

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={cn(
        'group relative isolate w-full overflow-hidden rounded-2xl p-[1px]',
        'transition-[transform,box-shadow,filter] duration-300 ease-in-out',
        'hover:scale-[1.045] active:scale-[0.98] active:duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/90 focus-visible:ring-offset-2',
        'focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-[#0A0A0A]',
        'disabled:pointer-events-none disabled:opacity-50',
        'shadow-signin-glow hover:shadow-signin-glow-lg',
        className,
      )}
      {...rest}
    >
      {/* Gradient stroke + animated wash (outer ring) */}
      <span
        aria-hidden
        className={cn(
          'absolute inset-0 rounded-2xl bg-gradient-to-r',
          'from-violet-600 via-fuchsia-500 to-pink-500',
          'bg-[length:220%_100%] animate-signin-gradient-shift',
          'opacity-95 transition-opacity duration-300 ease-in-out group-hover:opacity-100',
        )}
      />
      {/* Extra outer glow on hover */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute -inset-1 -z-10 rounded-[1rem] blur-xl',
          'bg-gradient-to-r from-violet-600/60 via-fuchsia-500/50 to-pink-500/60',
          'opacity-70 transition-opacity duration-300 ease-in-out group-hover:opacity-100',
        )}
      />

      {/* Glass inner */}
      <span className="relative flex min-h-[3.25rem] w-full items-center justify-center gap-2.5 overflow-hidden rounded-[15px] bg-black/35 px-4 py-4 backdrop-blur-xl dark:bg-black/40 sm:min-h-[3.5rem] sm:py-[1.05rem]">
        {/* Saturated gradient seen through glass */}
        <span
          aria-hidden
          className={cn(
            'absolute inset-0 bg-gradient-to-r',
            'from-violet-600/88 via-fuchsia-500/82 to-pink-600/88',
            'bg-[length:220%_100%] animate-signin-gradient-shift',
          )}
        />
        {/* Top glass sheen */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/18 to-transparent"
        />
        {/* Shine sweep on hover */}
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute -left-1/3 top-0 h-full w-1/2 -skew-x-12',
            'bg-gradient-to-r from-transparent via-white/35 to-transparent',
            'translate-x-[-120%] opacity-0 transition-[transform,opacity] duration-700 ease-out',
            'group-hover:translate-x-[280%] group-hover:opacity-100',
          )}
        />

        <span className="relative z-10 flex items-center justify-center gap-2.5">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden />
          ) : (
            <>
              <span className="text-sm font-semibold tracking-wide text-white">Sign In Securely</span>
              <ArrowRight
                className="h-4 w-4 shrink-0 text-white/95 transition-transform duration-300 ease-out group-hover:translate-x-1"
                aria-hidden
              />
            </>
          )}
        </span>
      </span>
    </button>
  );
}
