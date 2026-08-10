import type { HTMLAttributes } from 'react';
import styles from './HatchPlaceholder.module.css';

export interface HatchPlaceholderProps extends HTMLAttributes<HTMLDivElement> {
  /** Square size in px. Default 56 (the Place row thumbnail size). */
  size?: number;
}

/**
 * The diagonal hatch used everywhere a photograph would eventually go.
 * Never a grey box — see `--placeholder-hatch` in tokens/colors.css.
 */
export function HatchPlaceholder({ size = 56, className, style, ...rest }: HatchPlaceholderProps) {
  return (
    <div
      role="img"
      aria-hidden="true"
      className={[styles.hatch, className].filter(Boolean).join(' ')}
      style={{ width: size, height: size, ...style }}
      {...rest}
    />
  );
}
