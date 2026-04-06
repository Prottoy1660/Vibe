import { Toaster } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';

export function AppToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      offset={{ bottom: '1rem', right: '1rem' }}
      gap={10}
      richColors
      closeButton
      duration={4500}
      toastOptions={{
        classNames: {
          toast:
            'font-sans text-sm rounded-xl shadow-xl border bg-white dark:bg-[#151518] ' +
            'border-gray-200/90 dark:border-white/[0.1] ' +
            '[&:has([data-description])]:items-start',
          title: 'font-semibold text-gray-900 dark:text-gray-100',
          description: 'text-xs leading-relaxed text-gray-600 dark:text-gray-400 mt-0.5',
          success:
            'border-l-4 !border-l-emerald-500 dark:!border-l-emerald-400 ' +
            '[&_[data-icon]]:!text-emerald-600 dark:[&_[data-icon]]:!text-emerald-400',
          error:
            'border-l-4 !border-l-rose-500 dark:!border-l-rose-400 ' +
            '[&_[data-icon]]:!text-rose-600 dark:[&_[data-icon]]:!text-rose-400',
          warning:
            'border-l-4 !border-l-amber-500 dark:!border-l-amber-400 ' +
            '[&_[data-icon]]:!text-amber-600 dark:[&_[data-icon]]:!text-amber-400',
          info:
            'border-l-4 !border-l-sky-500 dark:!border-l-sky-400 ' +
            '[&_[data-icon]]:!text-sky-600 dark:[&_[data-icon]]:!text-sky-400',
        },
      }}
    />
  );
}
