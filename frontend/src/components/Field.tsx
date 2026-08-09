import { useId } from 'react';
import { Input } from '../design/components/core/Input';
import type { InputProps } from '../design/components/core/Input';
import styles from './Field.module.css';

export interface FieldProps extends Omit<InputProps, 'id' | 'error'> {
  label: string;
  /** Plain-language help text shown when there is no error. */
  description?: string;
  /** Validation message. No red is defined in the token set, so this reads in
   * bold --text-strong rather than an invented error colour — see frontend README. */
  error?: string;
  id?: string;
}

/** A labelled form field wrapping <Input>, with description/error text below. */
export function Field({ label, description, error, id, ...inputProps }: FieldProps) {
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
      <Input id={fieldId} error={Boolean(error)} aria-describedby={describedBy} {...inputProps} />
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
