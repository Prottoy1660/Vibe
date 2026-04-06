import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** default: emerald primary; danger: rose for destructive actions */
  variant?: 'default' | 'danger';
};

type Pending = {
  options: {
    title: string;
    description?: string;
    confirmLabel: string;
    cancelLabel: string;
    variant: 'default' | 'danger';
  };
  resolve: (value: boolean) => void;
};

const ConfirmDialogContext = createContext<{
  confirm: (options: ConfirmOptions) => Promise<boolean>;
} | null>(null);

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({
        options: {
          title: options.title,
          description: options.description,
          confirmLabel: options.confirmLabel ?? 'Confirm',
          cancelLabel: options.cancelLabel ?? 'Cancel',
          variant: options.variant ?? 'default',
        },
        resolve,
      });
    });
  }, []);

  const finish = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  };

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        pending.resolve(false);
        setPending(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  return (
    <ConfirmDialogContext.Provider value={{ confirm }}>
      {children}
      {pending ? (
        <div
          className="fixed inset-0 z-[100000] flex items-end justify-end p-3 sm:p-5"
          role="presentation"
          aria-hidden={!pending}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px] transition-opacity"
            aria-label="Close dialog"
            onClick={() => finish(false)}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby={pending.options.description ? 'confirm-dialog-desc' : undefined}
            className="relative z-[100001] w-full max-w-md animate-in slide-in-from-bottom-4 fade-in duration-200 rounded-2xl border border-gray-200/90 bg-white p-5 shadow-2xl dark:border-white/[0.12] dark:bg-[#151518] dark:shadow-black/50"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="confirm-dialog-title"
              className="text-base font-semibold leading-snug text-gray-900 dark:text-gray-100"
            >
              {pending.options.title}
            </h2>
            {pending.options.description ? (
              <p
                id="confirm-dialog-desc"
                className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-600 dark:text-gray-400"
              >
                {pending.options.description}
              </p>
            ) : null}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => finish(false)}
                className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm font-medium text-gray-800 transition hover:bg-gray-100 dark:border-white/15 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/10"
              >
                {pending.options.cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => finish(true)}
                className={
                  pending.options.variant === 'danger'
                    ? 'inline-flex min-h-[40px] items-center justify-center rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white shadow-lg shadow-rose-900/25 transition hover:bg-rose-500 dark:bg-rose-500 dark:hover:bg-rose-400'
                    : 'inline-flex min-h-[40px] items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-900/25 transition hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400'
                }
              >
                {pending.options.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog() {
  const ctx = useContext(ConfirmDialogContext);
  if (!ctx) {
    throw new Error('useConfirmDialog must be used within ConfirmDialogProvider');
  }
  return ctx;
}
