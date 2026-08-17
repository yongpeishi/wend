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
  /** The caller's "not right now" — a save in flight. Greys the stops; they
   * come back. Not the same question as `canEdit`. */
  disabled?: boolean;
  /**
   * May you change this trip? A prop rather than `useCanEdit()` because this
   * control already takes its verb as a callback — the capability arrives beside
   * the action it governs. False is a permanent no, and swaps the whole control
   * for the read-only summary below; it does not merely disable the stops.
   * Defaults to true, matching a null role.
   */
  canEdit?: boolean;
  /** Optional aggregate. Shown in DM Mono after the stops, e.g. "1.5 · 2", and
   * for a viewer it is the entire control, e.g. "1.5 · 2 votes". */
  average?: number | null;
  count?: number;
  'aria-label'?: string;
}

/**
 * Five stops for a -2..2 desire rating. Designed to read without a legend:
 * size encodes how strongly you feel, fill marks your current vote. Never uses
 * apricot — that colour is reserved for "where you are now" navigation.
 *
 * A viewer gets the answer, not the ballot. Five greyed-out stops are still a
 * question — they take up the shape of "pick one" and then refuse, which reads
 * as being locked out of the vote rather than as a result. So `canEdit={false}`
 * drops the radio group entirely and prints what everyone else has said: an
 * average and a headcount, in the same DM Mono the tally always uses. The
 * per-person list of names and scores lives beside this on the entry drawer and
 * is what carries the detail; this line is the summary above it.
 *
 * `disabled` is a different thing and stays one: the caller's "not right now",
 * a save in flight, for someone who may vote once it lands. That one still
 * greys the live stops, because they are coming back.
 */
export function VoteControl({
  value,
  onChange,
  onClear,
  disabled = false,
  canEdit = true,
  average,
  count,
  'aria-label': ariaLabel = 'Desire rating',
}: VoteControlProps) {
  if (!canEdit) {
    const votes = count ?? 0;
    const summary =
      typeof average === 'number' && votes > 0
        ? `${average.toFixed(1)} · ${votes} ${votes === 1 ? 'vote' : 'votes'}`
        : 'No votes yet';

    // The number alone says nothing about what was rated, so the caller's label
    // rides in front of it where only a screen reader hears it — the sighted
    // reader already has the section heading above.
    return (
      <p className={styles.summary}>
        <span className={styles.srOnly}>{ariaLabel}: </span>
        <span className={styles.tally}>{summary}</span>
      </p>
    );
  }

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
