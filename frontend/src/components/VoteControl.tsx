import styles from './VoteControl.module.css';

const SCORES = [-2, -1, 0, 1, 2] as const;
export type VoteScore = (typeof SCORES)[number];

/** Plain-word meaning per stop — read by screen readers; the UI itself carries
 * no legend, only dot size (magnitude) and fill (your current vote). */
const LABELS: Record<VoteScore, string> = {
  [-2]: 'Would rather not',
  [-1]: 'Not keen',
  [0]: 'Neutral',
  [1]: 'Interested',
  [2]: 'Really want this',
};

/** Dot diameter grows with distance from neutral — the stronger the opinion,
 * the bigger the mark. Mirrors the varying stop radii on <Trail>. */
const SIZE: Record<VoteScore, number> = {
  [-2]: 18,
  [-1]: 14,
  [0]: 10,
  [1]: 14,
  [2]: 18,
};

export interface VoteControlProps {
  /** The current user's vote, -2..2, or null if they haven't voted. */
  value: number | null;
  onChange: (score: VoteScore) => void;
  /** Clicking the already-selected stop withdraws the vote (score becomes null). */
  onClear?: () => void;
  disabled?: boolean;
  /** Optional aggregate, shown in DM Mono after the stops, e.g. "1.5 · 2". */
  average?: number | null;
  count?: number;
  'aria-label'?: string;
}

/**
 * Five stops for a -2..2 desire rating. Designed to read without a legend:
 * size encodes how strongly you feel, fill marks your current vote. Never uses
 * apricot — that colour is reserved for "where you are now" navigation.
 */
export function VoteControl({
  value,
  onChange,
  onClear,
  disabled = false,
  average,
  count,
  'aria-label': ariaLabel = 'Desire rating',
}: VoteControlProps) {
  return (
    <div className={styles.group} role="radiogroup" aria-label={ariaLabel}>
      {SCORES.map((score) => {
        const selected = value === score;
        return (
          <button
            key={score}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={LABELS[score]}
            className={styles.stop}
            disabled={disabled}
            onClick={() => (selected && onClear ? onClear() : onChange(score))}
          >
            <span
              className={[styles.dot, selected ? styles.selected : ''].filter(Boolean).join(' ')}
              style={{ width: SIZE[score], height: SIZE[score] }}
            />
          </button>
        );
      })}
      {typeof average === 'number' && (
        <span className={styles.tally}>
          {average.toFixed(1)}
          {typeof count === 'number' ? ` · ${count}` : ''}
        </span>
      )}
    </div>
  );
}
