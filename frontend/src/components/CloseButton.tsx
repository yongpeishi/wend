import { X } from 'lucide-react';
import styles from './CloseButton.module.css';

export interface CloseButtonProps {
  onClick: () => void;
  /** Extra class laid on the button (rarely needed; position comes from the component). */
  className?: string;
}

/**
 * The X in the top-right corner of a panel. One component so the way out of
 * any panel — a modal, the entry drawer, a popover — is the same X in the same
 * place, and a fix to its hit box or its focus ring lands everywhere at once.
 * The host positions it only by being the containing block; see
 * CloseButton.module.css for the room it needs and how to push it in.
 */
export function CloseButton({ onClick, className }: CloseButtonProps) {
  return (
    <button
      type="button"
      aria-label="Close"
      onClick={onClick}
      className={className ? [styles.closeButton, className].join(' ') : styles.closeButton}
    >
      <X size={20} strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}
