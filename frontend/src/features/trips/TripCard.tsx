import { Link } from 'react-router-dom';
import { ProsCons } from './ProsCons';
import { formatTripDates, joinMeta } from '../../lib/formatDates';
import type { Entry } from '../../api/types';
import styles from './TripCard.module.css';

export interface TripCardProps {
  trip: Entry;
  /** "Save for later" — archives the trip into the section below. */
  onArchive: () => void;
}

/** `12–17 Oct · 41 ideas`, or `No dates · 1 idea`. A dateless trip is normal. */
function metaLine(trip: Entry): string {
  const ideas = trip.children_count;
  return joinMeta(
    formatTripDates(trip.starts_on, trip.ends_on) ?? 'No dates',
    ideas === 1 ? '1 idea' : `${ideas} ideas`,
  );
}

/**
 * One trip in the grid on `/`.
 *
 * The card carries interactive controls (archive, and the pros/cons list with
 * its own buttons and input), so the card itself is *not* a link — nesting
 * buttons inside an anchor is invalid HTML and unusable by keyboard. Instead the
 * title is the real link and its ::after stretches over the whole card, so a
 * click anywhere in the quiet parts still navigates while every control keeps
 * its own tab stop. Controls sit above the overlay via `position: relative`,
 * which is also why none of them needs to stop propagation.
 */
export function TripCard({ trip, onArchive }: TripCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          <Link to={`/trips/${trip.id}`} className={styles.titleLink}>
            {trip.title}
          </Link>
        </h2>
        <button
          type="button"
          className={styles.archive}
          title="Save for later"
          aria-label={`Save ${trip.title} for later`}
          onClick={onArchive}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="5" rx="1" />
            <path d="M5 9v9a2 2 0 002 2h10a2 2 0 002-2V9" />
            <path d="M10 13h4" />
          </svg>
        </button>
      </div>

      {trip.description && <p className={styles.note}>{trip.description}</p>}

      <div className={styles.reasons}>
        <ProsCons entryId={trip.id} tripTitle={trip.title} pros={trip.pros} cons={trip.cons} />
      </div>

      <p className={styles.meta}>{metaLine(trip)}</p>
    </article>
  );
}
