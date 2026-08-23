import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import styles from './Toast.module.css';

export type ToastTone = 'neutral' | 'success' | 'error';

/**
 * A single follow-up a toast can offer — "Undo", "Show me". One, not a list:
 * a toast is a remark, and a remark with a menu is a dialog that should have
 * been a Modal. Activating it runs the handler and dismisses the toast in the
 * same gesture, because the offer is spent either way — a pressed Undo still
 * sitting there would read as pressable again.
 */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastProps {
  message: string;
  tone?: ToastTone;
  action?: ToastAction;
  onDismiss?: () => void;
}

const TONE_CLASS: Record<ToastTone, string> = {
  neutral: styles.neutral,
  success: styles.success,
  error: styles.error,
};

/** A single piece of inline feedback. Tone is carried by a left accent bar
 * only — message text is always --text-strong, never colour-coded. */
export function Toast({ message, tone = 'neutral', action, onDismiss }: ToastProps) {
  return (
    <div
      className={[styles.toast, TONE_CLASS[tone]].join(' ')}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      <p className={styles.message}>{message}</p>
      {action && (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            action.onClick();
            onDismiss?.();
          }}
        >
          {action.label}
        </button>
      )}
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
  action?: ToastAction;
}

/** How long a toast lingers unless the caller says otherwise. */
const DEFAULT_DURATION_MS = 4000;

export interface ToastShowOptions {
  action?: ToastAction;
  /**
   * Override the 4s linger. Exists for toasts that carry an action: an offer
   * like Undo needs longer on screen than a plain remark, because the reader
   * has to decide, not just notice. Plain toasts should leave it alone.
   */
  durationMs?: number;
}

interface ToastContextValue {
  show: (message: string, tone?: ToastTone, options?: ToastShowOptions) => void;
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
    (message: string, tone: ToastTone = 'neutral', options?: ToastShowOptions) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone, action: options?.action }]);
      // The timer keeps running after a manual dismiss; firing on an id that
      // is already gone filters nothing, which is cheaper than a timer handle
      // per toast and impossible to double-free.
      window.setTimeout(() => dismiss(id), options?.durationMs ?? DEFAULT_DURATION_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.stack}>
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            tone={toast.tone}
            action={toast.action}
            onDismiss={() => dismiss(toast.id)}
          />
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
