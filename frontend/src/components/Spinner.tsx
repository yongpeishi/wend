import styles from './Spinner.module.css';

export interface SpinnerProps {
  /** Announced to screen readers; not shown visually. Default "Loading". */
  label?: string;
}

/** Three dots that fade in sequence — 160ms opacity steps, never a bounce/spin. */
export function Spinner({ label = 'Loading' }: SpinnerProps) {
  return (
    <span className={styles.spinner} role="status">
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.srOnly}>{label}</span>
    </span>
  );
}
