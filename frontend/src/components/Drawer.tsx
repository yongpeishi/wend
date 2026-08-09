import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import overlayStyles from './Overlay.module.css';
import styles from './Drawer.module.css';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * The entry detail panel: a drawer over the planning board. Same solid-overlay
 * approach as <Modal> (see Overlay.module.css) — no shadow, no blur, separation
 * is card tone plus a single 1.5px drawn edge.
 */
export function Drawer({ open, onClose, title, children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
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
        ref={panelRef}
        className={styles.drawer}
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
      </div>
    </div>,
    document.body,
  );
}
