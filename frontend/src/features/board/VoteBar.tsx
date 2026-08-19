import type { ReactElement } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { DoubleThumbsDown, DoubleThumbsUp } from '../../components/icons/DoubleThumbs';
import { SidewaysThumb } from '../../components/icons/SidewaysThumb';
import type { VoteTally, VoteVoter } from '../../api/types';
import styles from './VoteBar.module.css';

/**
 * Best first. Every list in this control — the stops, the result pills — runs
 * `2 → -2`, because the question is "how keen?" and the enthusiastic answer is
 * the one people look for. Reversing either list would break the mapping the
 * eye has already learned from the other.
 */
const SCORES = [2, 1, 0, -1, -2] as const;
export type VoteScore = (typeof SCORES)[number];

/**
 * Plain-word meaning per stop, verbatim from the design's own `VOTE_LABEL`.
 * The UI carries no legend: the glyphs say it to a sighted reader and these say
 * it to everyone else, so the two must keep saying the same thing.
 */
const VOTE_LABEL: Record<VoteScore, string> = {
  [2]: 'Really keen',
  [1]: 'Keen',
  [0]: 'Neutral',
  [-1]: 'Not keen',
  [-2]: 'Really not keen',
};

/**
 * The glyph for a stop. Magnitude is doubling (one thumb vs two) and direction
 * is which way it points — up, sideways, down. 0 is a thumb held flat rather
 * than a dash, so that "no strong feeling" is an answer in the same language as
 * the other four rather than the gap between the two halves of the scale.
 */
function Glyph({ score, size }: { score: VoteScore; size: number }) {
  switch (score) {
    case 2:
      // The custom pair is drawn in a 34x30 box, so it needs a hair more height
      // than a lucide glyph to read at the same weight beside it.
      return <DoubleThumbsUp size={size + 2} />;
    case 1:
      return <ThumbsUp size={size} strokeWidth={1.5} aria-hidden />;
    case 0:
      return <SidewaysThumb size={size} />;
    case -1:
      return <ThumbsDown size={size} strokeWidth={1.5} aria-hidden />;
    case -2:
      return <DoubleThumbsDown size={size + 2} />;
  }
}

/** A voter with no name still voted; they read as somebody rather than a blank. */
function voterName(voter: VoteVoter): string {
  return voter.user_name ?? 'Someone';
}

export interface VoteBarProps {
  /** The signed-in user's vote, or null if they haven't voted. */
  myVote: number | null;
  tally: VoteTally;
  /** User picked a score. */
  onVote: (score: VoteScore) => void;
  /** User clicked their already-selected score — withdraws the vote. */
  onClear: () => void;
  /**
   * The caller's "not right now" — a save in flight. Greys the stops; they come
   * back. Not the same question as `canVote`, which is a permanent no.
   */
  disabled?: boolean;
  /** Viewers get the result, not the ballot. Default true. */
  canVote?: boolean;
  /** Used to name the control for assistive tech. */
  entryTitle: string;
}

/**
 * The board's "Keen?" control: five stops from really keen to really not, and
 * beside them the result — one pill per score anybody picked, carrying who
 * picked it.
 *
 * A viewer gets the answer, not the ballot. Five greyed-out stops are still a
 * question: they take the shape of "pick one" and then refuse, which reads as
 * being locked out rather than as a result (`doc/architecture.md` §5, and the
 * same reasoning as `VoteControl`'s `canEdit={false}` branch). So `canVote`
 * false drops the label and the radio group entirely and prints the tally
 * instead. `disabled` is the other thing and stays one — a save in flight, for
 * someone who may vote the moment it lands, so those stops grey rather than go.
 *
 * Each result pill is a real `<button>`, which looks like overkill for a thing
 * that does nothing when clicked. It is how "who voted for this" reaches a
 * keyboard: the names live in a tooltip, and a tooltip that only answers
 * `:hover` answers a mouse and nobody else. Being focusable gives the bubble a
 * `:focus-visible` to open on, and the visually-hidden label on the same button
 * gives a screen reader the list outright.
 */
export function VoteBar({
  myVote,
  tally,
  onVote,
  onClear,
  disabled = false,
  canVote = true,
  entryTitle,
}: VoteBarProps): ReactElement {
  // Optional on the type only, so the older `vote_tally` fixtures keep
  // compiling; the wire always sends it, already ordered by user_id.
  const voters = tally.voters ?? [];

  // One entry per score somebody actually chose, in the scale's own order.
  // Empty scores are skipped rather than shown as zero: a pill is "these people
  // said this", and nobody saying it is not a result worth a slot.
  const groups = SCORES.map((score) => ({
    score,
    names: voters.filter((voter) => voter.score === score).map(voterName),
  })).filter((group) => group.names.length > 0);

  const pills =
    groups.length === 0 ? (
      <p className={styles.empty}>No votes yet</p>
    ) : (
      <div className={styles.pills}>
        {groups.map(({ score, names }) => {
          const who = names.join(', ');
          return (
            <button key={score} type="button" className={styles.pill} title={who}>
              {/* The whole visible pill is a picture of the number: the glyph and
                  the count both restate what this label already says in words. */}
              <span className={styles.srOnly}>{`${VOTE_LABEL[score]}: ${who}`}</span>
              <span className={styles.pillFace} aria-hidden="true">
                <Glyph score={score} size={16} />
                <span className={styles.pillCount}>{names.length}</span>
              </span>
              {/* CSS, not state: the bubble is pure presentation and a React
                  `hovered` flag would only re-render the row to say the same
                  thing. `aria-hidden` because the label above already carries it. */}
              <span className={styles.tip} aria-hidden="true">
                {who}
              </span>
            </button>
          );
        })}
      </div>
    );

  if (!canVote) {
    // No votes at all: the summary would be "0 · 0 votes", which is a number
    // pretending to be news. The empty line says it plainly instead.
    if (groups.length === 0) {
      return <div className={styles.bar}>{pills}</div>;
    }

    const total = `${tally.total > 0 ? '+' : ''}${tally.total}`;
    return (
      <div className={styles.bar}>
        {/* The sign is explicit on the positive side too — "+3" is a score,
            "3" could be a headcount, and the headcount is right beside it. */}
        <p className={styles.summary}>{`${total} · ${tally.count} ${tally.count === 1 ? 'vote' : 'votes'}`}</p>
        {pills}
      </div>
    );
  }

  return (
    <div className={styles.bar}>
      <span className={styles.label}>Keen?</span>
      <div className={styles.stops} role="radiogroup" aria-label={`How keen are you on ${entryTitle}?`}>
        {SCORES.map((score) => {
          const selected = myVote === score;
          return (
            <button
              key={score}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={VOTE_LABEL[score]}
              className={selected ? `${styles.stop} ${styles.stopOn}` : styles.stop}
              disabled={disabled}
              // Clicking your own answer takes it back. Without this the only
              // way out of a vote is to pick a different one, and "I'd rather
              // not say" would come out as a neutral vote — which is not the
              // same thing, and would land in the total as one.
              onClick={() => (selected ? onClear() : onVote(score))}
            >
              <Glyph score={score} size={20} />
            </button>
          );
        })}
      </div>
      {pills}
    </div>
  );
}
