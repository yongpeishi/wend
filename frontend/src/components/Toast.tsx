import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import styles from './Toast.module.css';

export type ToastTone = 'neutral' | 'success' | 'error';

export interface ToastProps {
  message: string;
  tone?: ToastTone;
  onDismiss?: () => void;
}

const TONE_CLASS: Record<ToastTone, string> = {
  neutral: styles.neutral,
  success: styles.success,
  error: styles.error,
};

/** A single piece of inline feedback. Tone is carried by a left accent bar
 * only — message text is always --text-strong, never colour-coded. */
export function Toast({ message, tone = 'neutral', onDismiss }: ToastProps) {
  return (
    <div
      className={[styles.toast, TONE_CLASS[tone]].join(' ')}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      <p className={styles.message}>{message}</p>
      {onDismiss && (
        <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss">
          <X size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

interface ToastEntry {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Mounts the toast stack once at the app root; call useToast() anywhere below it. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message: string, tone: ToastTone = 'neutral') => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone }]);
      window.setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.stack}>
        {toasts.map((toast) => (
          <Toast key={toast.id} message={toast.message} tone={toast.tone} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
