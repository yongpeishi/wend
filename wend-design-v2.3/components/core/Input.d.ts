import * as React from 'react';

/**
 * Single-line text entry. Leading and trailing slots take any node — an icon,
 * a unit, a key hint, a small button.
 *
 * Labels name the field in ordinary words ("Arrival date"); placeholders may ask
 * a question ("Where are you going?"). A placeholder is never the only label.
 */
export interface InputProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  placeholder?: string;
  /** Uppercase field label. Always supply one — a question placeholder is not a label. */
  label?: string;
  /**
   * Feedback state. `success` borders and ticks in jade, `error` borders in rust and
   * bolds the message, `pending` shows a monospaced "checking…" while a check runs.
   */
  state?: 'default' | 'success' | 'error' | 'pending';
  /** Helper, success or error text under the field. Errors say what to do, not just what broke. */
  message?: string;
  /** Apricot border plus a soft wash — the focus treatment used system-wide. */
  focused?: boolean;
  /** Node before the text — usually an 18px icon at 1.5px stroke. */
  leading?: React.ReactNode;
  /** Node after the text — icon, key hint, unit or small action. Overrides the state tick. */
  trailing?: React.ReactNode;
  /** Shorthand for a monospaced trailing hint. Ignored when `trailing` is set. */
  hint?: string;
}

export declare function Input(props: InputProps): React.JSX.Element;
