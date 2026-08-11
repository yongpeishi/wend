import * as React from 'react';

/**
 * Single-line text entry. Leading and trailing slots take any node — an icon,
 * a unit, a key hint, a small button.
 */
export interface InputProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  placeholder?: string;
  /** Apricot border plus a soft wash — the focus treatment used system-wide. */
  focused?: boolean;
  /** Node before the text — usually an 18px icon at 1.5px stroke. */
  leading?: React.ReactNode;
  /** Node after the text — icon, key hint, unit or small action. */
  trailing?: React.ReactNode;
  /** Shorthand for a monospaced trailing hint. Ignored when `trailing` is set. */
  hint?: string;
}

export declare function Input(props: InputProps): React.JSX.Element;
