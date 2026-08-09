import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'onDark';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary is the single forward action per screen. onDark for deep-leaf surfaces. */
  variant?: ButtonVariant;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: styles.primary,
  secondary: styles.secondary,
  quiet: styles.quiet,
  onDark: styles.onDark,
};

/**
 * Actions. Labels are verbs of movement — "Take the long way", "Widen again".
 * Focus is handled by :focus-visible (real keyboard-focus detection), not a prop.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className, type = 'button', ...rest },
  ref,
) {
  const classes = [styles.button, VARIANT_CLASS[variant], className].filter(Boolean).join(' ');
  return <button ref={ref} type={type} className={classes} {...rest} />;
});
