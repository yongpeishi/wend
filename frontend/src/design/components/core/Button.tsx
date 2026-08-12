import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'onDark';
export type ButtonSize = 'small' | 'medium' | 'large';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary is the single forward action per screen. onDark for deep-leaf surfaces. */
  variant?: ButtonVariant;
  /**
   * medium is the default and covers nearly every case. small is for a button
   * inside an already-dense row — it sits under the 48px tap minimum on purpose,
   * so never make it the only way to reach a primary action. large is for a
   * single hero CTA.
   */
  size?: ButtonSize;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: styles.primary,
  secondary: styles.secondary,
  quiet: styles.quiet,
  onDark: styles.onDark,
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  small: styles.small,
  medium: styles.medium,
  large: styles.large,
};

/**
 * Actions. Labels are verbs of movement — "Take the long way", "Widen again".
 * Focus is handled by :focus-visible (real keyboard-focus detection), not a prop.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'medium', className, type = 'button', ...rest },
  ref,
) {
  const classes = [styles.button, VARIANT_CLASS[variant], SIZE_CLASS[size], className]
    .filter(Boolean)
    .join(' ');
  return <button ref={ref} type={type} className={classes} {...rest} />;
});
