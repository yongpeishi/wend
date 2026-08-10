import styles from './Spinner.module.css';

export interface SpinnerProps {
  /** Announced to screen readers; not shown visually. Default "Loading". */
  label?: string;
  /** For the schedule, the one dark surface in the product. */
  onDark?: boolean;
}

/** Three dots that fade in sequence — 160ms opacity steps, never a bounce/spin. */
export function Spinner({ label = 'Loading', onDark = false }: SpinnerProps) {
  return (
    <span className={onDark ? `${styles.spinner} ${styles.onDark}` : styles.spinner} role="status">
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.srOnly}>{label}</span>
    </span>
  );
}
