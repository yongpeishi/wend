import { cloneElement, isValidElement, useId } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Input } from '../design/components/core/Input';
import type { InputProps } from '../design/components/core/Input';
import styles from './Field.module.css';

export interface FieldProps extends Omit<InputProps, 'id' | 'error'> {
  label: string;
  /** Plain-language help text shown when there is no error. */
  description?: string;
  /** Validation message. Reads in bold --text-error (rust), matching the error
   * field state the design system specifies — rust border, bold rust message,
   * role="alert". The rust reinforces the message; it never replaces it. Colour
   * never carries meaning alone here, so the text must still name the fix on its
   * own ("Enter a date in 2026 or later.") for anyone who can't see the hue. */
  error?: string;
  id?: string;
  /**
   * A control to label instead of the built-in <Input> — a textarea, a select,
   * or an input that needs its own props. It is given the generated id and
   * aria-describedby so the label and error text still point at the right
   * element. Omit this and the field renders its own <Input>, as before.
   */
  children?: ReactNode;
}

/** A labelled form field wrapping <Input> (or a supplied control), with
 * description/error text below. */
export function Field({ label, description, error, id, children, ...inputProps }: FieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;
  const descriptionId = `${fieldId}-description`;
  const describedBy = error ? errorId : description ? descriptionId : undefined;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={fieldId}>
        {label}
      </label>
      {children ? (
        isValidElement(children) ? (
          cloneElement(children as ReactElement<Record<string, unknown>>, {
            id: fieldId,
            'aria-describedby': describedBy,
          })
        ) : (
          children
        )
      ) : (
        <Input id={fieldId} error={Boolean(error)} aria-describedby={describedBy} {...inputProps} />
      )}
      {error ? (
        <p className={styles.error} id={errorId} role="alert">
          {error}
        </p>
      ) : description ? (
        <p className={styles.hintText} id={descriptionId}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
