import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import styles from './Input.module.css';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Trailing affordance, e.g. the return glyph "↵". */
  hint?: string;
  /** Renders the destination-plum error border. Pair with a <Field> error message. */
  error?: boolean;
  wrapperClassName?: string;
}

/**
 * Single-line text entry — destinations, dates, notes.
 * A real `<input>` under the hood (the design bundle's prototype was a static div);
 * the card border + apricot focus wash come from the wrapper via :focus-within.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { hint, error = false, className, wrapperClassName, ...rest },
  ref,
) {
  const wrapperClasses = [styles.wrapper, error ? styles.error : '', wrapperClassName]
    .filter(Boolean)
    .join(' ');
  const inputClasses = [styles.input, className].filter(Boolean).join(' ');
  return (
    <div className={wrapperClasses}>
      <input ref={ref} className={inputClasses} aria-invalid={error || undefined} {...rest} />
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  );
});
