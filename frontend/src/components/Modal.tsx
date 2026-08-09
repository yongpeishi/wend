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

/**
 * A centered dialog. No shadows: separation from the page is card tone against
 * a solid page-tone overlay (see Overlay.module.css for why it isn't translucent).
 *
 * Known gap: focus is moved into the dialog on open and Escape closes it, but
 * there is no full focus-trap loop (Tab can still leave the dialog). Good enough
 * for this foundation phase — flagged for the agent building product screens.
 */
export function Modal({ open, onClose, title, children, actions }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
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
        <div className={styles.body}>{children}</div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}
