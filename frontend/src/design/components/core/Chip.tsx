import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes } from 'react';
import styles from './Chip.module.css';

export type ChipTone = 'default' | 'saved';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  /** 'saved' renders the bister tag used for kept places. */
  tone?: ChipTone;
}

function toneClass(tone: ChipTone, selected: boolean): string {
  if (tone === 'saved') return styles.saved;
  return selected ? styles.selected : styles.unselected;
}

/**
 * An interactive filter/interest toggle. Renders a real `<button>` so it is
 * keyboard-operable and gets `aria-pressed` semantics for free when `selected` is set.
 */
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { selected = false, tone = 'default', className, type = 'button', ...rest },
  ref,
) {
  const classes = [styles.chip, toneClass(tone, selected), className].filter(Boolean).join(' ');
  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      aria-pressed={tone === 'default' ? selected : undefined}
      {...rest}
    />
  );
});

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
}

/**
 * A static, non-interactive label — e.g. "Saved · 12". Same visual language as
 * Chip but rendered as a `<span>` since it triggers no action.
 */
export const Tag = forwardRef<HTMLSpanElement, TagProps>(function Tag(
  { tone = 'default', className, ...rest },
  ref,
) {
  const classes = [styles.chip, toneClass(tone, false), className].filter(Boolean).join(' ');
  return <span ref={ref} className={classes} {...rest} />;
});
