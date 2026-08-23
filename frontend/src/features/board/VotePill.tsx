import { ThumbsDown, ThumbsUp } from 'lucide-react';
import type { EntryCategory } from '../../api/types';
import { CATEGORY_LABELS } from './filters';
import styles from './VotePill.module.css';

export interface VotePillProps {
  category: EntryCategory | null;
  /** The signed sum of everyone's votes — `entry.vote_tally.total`. */
  total: number;
  /**
   * Layout the CALLER needs, never look. The pill owns its own colour, size and
   * radius; a screen that has to push it away from a neighbour adds a margin
   * here rather than reaching into the rule and giving the map a pill that is
   * subtly not the board's.
   */
  className?: string;
}

/**
 * Category and appetite in one plum-wash pill — "Shopping · 👍 6". It says what
 * kind of idea this is and how the votes stand, in that order, as one mark.
 *
 * Plum because a vote marks appetite for a destination, and words beside the
 * number so it can be scanned without a legend — the pill is words as well as
 * colour, so nothing rides on hue alone.
 *
 * Zero votes draws no number (a scoreboard on an idea nobody has judged), just
 * the category word; no category and no votes draws no pill at all, which is
 * why this can return null — there is nothing to say, and an empty plum box
 * would be saying it anyway.
 *
 * Shared rather than inlined because the board row and the map's pin card show
 * the same idea and must make the same claim about it: one component, so the
 * two can never drift into telling the reader different things.
 */
export function VotePill({ category, total, className }: VotePillProps) {
  if (category === null && total === 0) return null;

  return (
    <span
      className={[styles.votePill, className].filter(Boolean).join(' ')}
      title="Everyone's votes added up, from +2 to -2 each"
    >
      {category !== null && CATEGORY_LABELS[category]}
      {total !== 0 && (
        <>
          {category !== null && <span aria-hidden="true">·</span>}
          {total > 0 ? (
            <ThumbsUp size={14} strokeWidth={2} aria-hidden="true" />
          ) : (
            <ThumbsDown size={14} strokeWidth={2} aria-hidden="true" />
          )}
          {total}
        </>
      )}
    </span>
  );
}
