import type { ReactNode } from 'react';
import { Trail } from '../design/components/brand/Trail';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  /** Full sentence(s) in Wend's voice — see architecture.md §5, e.g.
   * "Nothing kept yet. Saving something is how a trip starts." */
  message: string;
  action?: ReactNode;
}

/** No icon, no illustration — just a single waiting trail dot and the copy. */
export function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <Trail stops={['waiting']} height={20} aria-hidden="true" />
      <p className={styles.message}>{message}</p>
      {action}
    </div>
  );
}
