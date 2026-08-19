import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import styles from './Logo.module.css';

export type LogoVariant = 'primary' | 'reversed';

export interface LogoProps extends HTMLAttributes<HTMLSpanElement> {
  /** primary sits on paper; reversed sits on deep leaf. */
  variant?: LogoVariant;
  /** Mark height in px. At 28 or below the stroke thickens automatically. Never below 24. */
  size?: number;
  /** Hide for favicons, app icons and stamps. */
  showWordmark?: boolean;
}

/**
 * The Michikusa mark: three stops on a dotted trail (decided, open, waiting/destination),
 * with the WEND wordmark lock-up. Path data is identical to
 * wend-design/project/assets/michikusa-mark*.svg.
 */
export const Logo = forwardRef<HTMLSpanElement, LogoProps>(function Logo(
  { variant = 'primary', size = 40, showWordmark = true, className, style, ...rest },
  ref,
) {
  const reversed = variant === 'reversed';
  const trail = reversed ? 'var(--trail-line-on-dark)' : 'var(--stop-decided)';
  const openFill = reversed ? 'var(--surface-inverse)' : 'var(--surface-page)';
  const start = reversed ? 'var(--text-on-dark)' : 'var(--stop-decided)';
  const end = reversed ? 'var(--wend-bister-tint)' : 'var(--stop-destination)';
  const small = size <= 28;

  return (
    <span
      ref={ref}
      className={[styles.logo, className].filter(Boolean).join(' ')}
      style={{ gap: size * 0.36, ...style }}
      {...rest}
    >
      <svg width={size * 1.33} height={size} viewBox="0 0 96 72" fill="none" role="img" aria-label="Wend">
        <path
          d="M10 60 C 10 34, 44 46, 44 26 C 44 10, 74 12, 82 30"
          stroke={trail}
          strokeWidth={small ? 5 : 3}
          strokeLinecap="round"
          strokeDasharray={small ? '1 7' : '1 8'}
        />
        <circle cx="10" cy="60" r={small ? 9 : 7} fill={start} />
        <circle cx="44" cy="26" r={small ? 11 : 9} fill={openFill} stroke="var(--stop-open)" strokeWidth={small ? 5 : 3.5} />
        <circle cx="82" cy="30" r={small ? 8 : 6} fill={end} />
      </svg>
      {showWordmark && (
        <span className={styles.wordmark} data-variant={variant} style={{ fontSize: size * 0.72 }}>
          Wend
        </span>
      )}
    </span>
  );
});
