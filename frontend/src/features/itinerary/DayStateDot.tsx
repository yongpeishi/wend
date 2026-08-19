import type { ItineraryDay } from './itineraryModel';
import styles from './DayStateDot.module.css';

export interface DayStateDotProps {
  day: ItineraryDay;
}

/**
 * The dot at the head of a day, in the trail's own three states.
 *
 * The design mocks a `state` field the data model does not have, so — as on
 * the idea row — the dot is derived from fields that really exist and means
 * only what they mean:
 *
 *   more than one live version  -> "split": more than one way to spend it,
 *                                  none of them settled. A bister ring — bister is
 *                                  what Wend already uses for things kept and
 *                                  set aside, and it is what the versions tag
 *                                  beside this dot is drawn in.
 *   one version, things on it   -> "decided": a plan you have settled on.
 *   one version, nothing on it  -> "waiting": an empty day, which is
 *                                  legitimate and never an error.
 *
 * No state here is apricot. Apricot means exactly one thing anywhere in Wend —
 * "this is where you are deciding now" — and on this screen that is the focus
 * ring, which must stay the only apricot on the page for it to keep meaning
 * anything.
 *
 * Colour is never the only carrier: the three dots differ in size and in shape
 * (a ring against two fills), the same wording reaches assistive tech, and the
 * collapsed row spells the split out in words beside it.
 */
export function DayStateDot({ day }: DayStateDotProps) {
  if (day.versions.length > 1) {
    return (
      <span
        className={[styles.dot, styles.split].join(' ')}
        role="img"
        aria-label={`${day.versions.length} ways to spend it, not settled`}
      />
    );
  }

  const planned = (day.versions[0]?.schedule_items.length ?? 0) > 0;
  return (
    <span
      className={[styles.dot, planned ? styles.decided : styles.waiting].join(' ')}
      role="img"
      aria-label={planned ? 'Planned' : 'Nothing planned yet'}
    />
  );
}
