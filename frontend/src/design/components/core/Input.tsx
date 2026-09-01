import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import styles from './Input.module.css';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Trailing affordance, e.g. the return glyph "↵". */
  hint?: string;
  /**
   * Renders the rust error border (--border-error). Rust is reserved for
   * problems and means nothing else in this product, so set this only when the
   * field's value is actually wrong — not to draw attention. Pair with a
   * <Field> error message: the border says "something here", the text says what.
   */
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
  // An empty native date input still paints ghost text in the full value
  // colour (Safari shows today's date, Chrome "mm/dd/yyyy"), so an empty field
  // is indistinguishable from a filled one. Every date field here is controlled
  // (value comes in as '' when unset), so emptiness is read straight off the
  // prop and .emptyDate restyles the ghost as the placeholder it really is.
  const emptyDate = rest.type === 'date' && rest.value === '';
  const inputClasses = [styles.input, emptyDate ? styles.emptyDate : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={wrapperClasses}>
      <input ref={ref} className={inputClasses} aria-invalid={error || undefined} {...rest} />
      {/* The ghost's TEXT is browser chrome — Chrome paints a dd/mm/yyyy mask
          but Safari paints today's actual date, which still reads like a value.
          While the field is empty and unfocused the CSS hides the native ghost
          and this literal overlay stands in, so every browser shows the same
          placeholder. On focus the overlay hides (`.emptyDate:focus ~`) and the
          muted-italic native ghost returns, keeping typing visible. Sighted-only
          by design: aria-hidden, and pointer-events pass through to the input. */}
      {emptyDate && (
        <span className={styles.datePlaceholder} aria-hidden="true">
          dd/mm/yyyy
        </span>
      )}
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  );
});
