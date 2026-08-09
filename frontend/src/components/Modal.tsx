import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import overlayStyles from './Overlay.module.css';
import styles from './Modal.module.css';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}

const FOCUSABLE =
  'input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])';

/**
 * A centered dialog. No shadows: separation from the page is card tone against
 * a solid page-tone overlay (see Overlay.module.css for why it isn't translucent).
 *
 * On open, focus moves to the first focusable control inside the dialog — for a
 * form that is its first field, which is what every caller wants. Focusing the
 * dialog wrapper instead used to defeat a child's `autoFocus`, so a form modal
 * opened with focus nowhere useful.
 *
 * Tab and Shift+Tab cycle within the dialog, and Escape closes it.
 */
export function Modal({ open, onClose, title, children, actions }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Move focus in once per opening. Deliberately keyed on `open` alone: keying
  // it on `onClose` too meant an unmemoized handler re-ran this on every
  // render, yanking focus back mid-word while someone was typing.
  //
  // Target order matters. The close button sits before the content in the DOM,
  // so "first focusable in the dialog" would land there and a form modal would
  // open with focus on Close — useless. So aim at the body's first control.
  //
  // React applies `autoFocus` as a property at mount, not as an attribute, so
  // it cannot be found by selector — but it has already run by the time this
  // effect fires. If focus is therefore already somewhere inside the dialog,
  // leave it alone; overriding it would defeat the caller's explicit choice.
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (dialog.contains(document.activeElement) && document.activeElement !== dialog) return;
    const firstInBody = bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? null;
    (firstInBody ?? dialog).focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
      );
      if (focusable.length === 0) return;

      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      const active = document.activeElement;

      // Wrap at both ends so Tab can never walk out of the dialog and into the
      // page behind it.
      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={overlayStyles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <button type="button" className={overlayStyles.closeButton} onClick={onClose} aria-label="Close">
          <X size={20} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <h2 className={styles.title} id={titleId}>
          {title}
        </h2>
        <div className={styles.body} ref={bodyRef}>
          {children}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}
