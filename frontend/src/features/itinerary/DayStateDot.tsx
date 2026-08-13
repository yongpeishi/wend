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
 *   more than one live version  -> "open": this is the day you are deciding.
 *                                  Apricot, which means exactly that and only
 *                                  that anywhere in Wend.
 *   one version, things on it   -> "decided": a plan you have settled on.
 *   one version, nothing on it  -> "waiting": an empty day, which is
 *                                  legitimate and never an error.
 *
 * Colour is never the only carrier: the same wording reaches assistive tech,
 * and the collapsed row spells the split out in words beside it.
 */
export function DayStateDot({ day }: DayStateDotProps) {
  if (day.versions.length > 1) {
    return (
      <span
        className={[styles.dot, styles.open].join(' ')}
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
