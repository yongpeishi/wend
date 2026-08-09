import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import styles from './Card.module.css';
import { spaceVar, type SpaceToken } from './spacing';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Padding on the 4px scale. Default 4 (16px). */
  padding?: SpaceToken;
  /** Draw the 1.5px --border-subtle edge. Elevation itself is tone-only (card vs page) — never a shadow. */
  bordered?: boolean;
}

/**
 * The one surface primitive: card tone (`--surface-card`) against page tone
 * (`--surface-page`). No shadows — that separation IS the elevation.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = 4, bordered = false, className, style, ...rest },
  ref,
) {
  const classes = [styles.card, bordered ? styles.bordered : '', className].filter(Boolean).join(' ');
  return <div ref={ref} className={classes} style={{ padding: spaceVar(padding), ...style }} {...rest} />;
});
