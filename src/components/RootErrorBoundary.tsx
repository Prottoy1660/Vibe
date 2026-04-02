import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

type Props = { children: ReactNode };

type State = { error: Error | null };

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
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-100 p-6 text-center dark:bg-[#0a0a0b]">
          <AlertTriangle className="h-12 w-12 text-amber-500" aria-hidden />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Something went wrong</h1>
          <p className="max-w-md text-sm text-gray-600 dark:text-gray-400">
            The app hit an error while rendering. Open the browser console (F12 → Console) for details, then refresh the
            page.
          </p>
          <pre className="max-h-40 max-w-full overflow-auto rounded-lg bg-white/80 p-3 text-left text-xs text-red-700 dark:bg-black/40 dark:text-red-300">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white"
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
