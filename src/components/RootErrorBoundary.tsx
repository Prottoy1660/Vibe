import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

type Props = { children: ReactNode };

type State = { error: Error | null };

const SHOW_DEBUG_DETAILS = Boolean(import.meta?.env?.DEV);

/**
 * Catches render errors so #root is not left empty with no explanation (white screen).
 */
export class RootErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[App error]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-100 dark:bg-[#0a0a0b]">
          <div className="w-full max-w-lg rounded-3xl border border-gray-200/70 dark:border-white/10 bg-white/80 dark:bg-white/[0.05] backdrop-blur p-6 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-300">
              <AlertTriangle className="h-7 w-7" aria-hidden />
            </div>
            <h1 className="mt-4 text-lg font-extrabold text-gray-900 dark:text-gray-100">We couldn’t load this screen</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Something broke while opening this page. Please reload and try again.
            </p>

            {SHOW_DEBUG_DETAILS ? (
              <pre className="mt-4 max-h-40 max-w-full overflow-auto rounded-2xl border border-red-200/60 bg-red-50/60 p-3 text-left text-xs text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
                {this.state.error.message}
              </pre>
            ) : null}

            <div className="mt-5 flex flex-col sm:flex-row items-stretch justify-center gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Reload
              </button>
              <button
                type="button"
                onClick={() => window.location.assign('/')}
                className="inline-flex items-center justify-center rounded-xl border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#1c1c21] px-4 py-2.5 text-sm font-semibold text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
              >
                Go to home
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
