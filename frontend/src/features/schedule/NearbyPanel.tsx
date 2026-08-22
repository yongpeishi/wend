import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { Spinner } from '../../components/Spinner';
import { MapView } from '../map/MapView';
import type { MapPin } from '../map/types';
import styles from './NearbyPanel.module.css';

export interface NearbyPlace {
  id: number;
  name: string;
  /** Already-composed meta line, e.g. "food · 12 min walk". */
  meta: string;
  lat: number | null;
  lng: number | null;
}

export interface NearbyPanelProps {
  /** 'overlay' = the mobile full-screen sheet; 'rail' = the desktop side card. */
  layout: 'overlay' | 'rail';
  /** The sentence under the heading. May be ''. */
  blurb: string;
  places: NearbyPlace[];
  /**
   * Where "you" are. Null when nothing on the day is located and the browser
   * will not say — the map is still drawn, because a map is what this panel
   * is, but it has no ring on it and nothing to centre on.
   */
  origin: { lat: number; lng: number } | null;
  loading?: boolean;
  /** Shown in place of the list: denied permission, nothing within range, etc. */
  note?: string | null;
  /** Overlay only. When absent, no × is drawn. */
  onClose?: () => void;
}

/**
 * The standing promise of this panel, and the reason it is a read surface: you
 * can look sideways at what is around you without the plan moving under you.
 */
const CLOSING_LINE = 'Nothing here changes the plan. Pick one up and the day carries on.';

/**
 * Always "you", never a place name. Naming where you are would mean reverse
 * geocoding a coordinate — a second network call spent on a heading — and the
 * blurb underneath already says what the distances are measured from when that
 * is worth saying.
 *
 * There used to be a second line under this one, a title reading "Around you",
 * which said the same thing twice as soon as the place name went. This is the
 * survivor: the eyebrow's small-caps treatment is CSS, so the sentence stays
 * mixed-case in the DOM and a screen reader says it as words rather than
 * spelling out capitals. It is the panel's heading and, in the overlay, the
 * dialog's accessible name.
 */
const HEADING = 'Around you now';

const MAP_HEIGHT_OVERLAY = 320;
const MAP_HEIGHT_RAIL = 260;

/** Only a place we have coordinates for can be a pin; the rest are list-only. */
function pinsFor(places: NearbyPlace[]): MapPin[] {
  const pins: MapPin[] = [];
  for (const place of places) {
    if (place.lat === null || place.lng === null) continue;
    pins.push({ id: place.id, lat: place.lat, lng: place.lng, title: place.name, state: 'potential' });
  }
  return pins;
}

/**
 * "Around you now" — the same panel in two skins, chosen by the caller rather
 * than by a media query, because only the route knows which width it is in and
 * mounting both would put a full-screen sheet underneath the desktop rail.
 *
 * Presentational: everything it knows arrives as props. Where "you" are, what
 * is near, and whether the browser would even say — all of that is the route's
 * problem, and keeping it out of here is what lets the rail and the sheet be
 * one component instead of two that drift.
 *
 * The overlay borrows <Drawer>'s manners rather than inventing its own: it is a
 * dialog, it takes focus when it opens, and Escape closes it. It stops short of
 * <Modal>'s Tab cycle — see the comment on the Escape effect.
 */
export function NearbyPanel({
  layout,
  blurb,
  places,
  origin,
  loading = false,
  note = null,
  onClose,
}: NearbyPanelProps) {
  const isOverlay = layout === 'overlay';
  const panelRef = useRef<HTMLElement>(null);
  const headingId = useId();

  const pins = pinsFor(places);

  // Keyed on the layout alone. Keying it on `onClose` too would let an
  // unmemoised handler yank focus back here on every render of the route.
  useEffect(() => {
    if (!isOverlay) return;
    panelRef.current?.focus();
  }, [isOverlay]);

  // Escape closes, matching Drawer and Modal. Like Drawer, this sheet does not
  // cycle Tab inside itself: it is opaque and covers the whole viewport, so
  // there is nothing visible behind it for Tab to wander into, and a trap would
  // be machinery earning nothing here.
  useEffect(() => {
    if (!isOverlay || !onClose) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOverlay, onClose]);

  return (
    <section
      ref={panelRef}
      className={`${styles.panel} ${isOverlay ? styles.overlay : styles.rail}`}
      role={isOverlay ? 'dialog' : undefined}
      aria-modal={isOverlay ? true : undefined}
      aria-labelledby={headingId}
      tabIndex={isOverlay ? -1 : undefined}
    >
      <header className={styles.head}>
        <div className={styles.headText}>
          <h2 className={styles.eyebrow} id={headingId}>
            {HEADING}
          </h2>
          {blurb && <p className={styles.blurb}>{blurb}</p>}
        </div>
        {isOverlay && onClose && (
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <X size={20} strokeWidth={1.5} aria-hidden="true" />
          </button>
        )}
      </header>

      <div className={styles.body}>
        {/* Always drawn. It used to appear only with both a fix and a pin to
            show, which meant the panel's one picture was missing exactly when
            the reader had most reason to look at it: standing somewhere with
            nothing kept nearby, or before the browser had answered. A map with
            only "you" on it still answers "where am I", and the fit takes the
            ring into account, so it opens on the street rather than the world. */}
        <div className={styles.map}>
          <MapView
            pins={pins}
            youAreHere={origin}
            fitToPins
            height={isOverlay ? MAP_HEIGHT_OVERLAY : MAP_HEIGHT_RAIL}
            aria-label="Map of what is around you"
          />
          {origin && (
            <p className={styles.legend}>
              <span className={styles.here} aria-hidden="true" />
              Where you are now
            </p>
          )}
        </div>

        {loading && <Spinner label="Looking around" />}

        {!loading && note && <p className={styles.note}>{note}</p>}

        {!loading && !note && places.length > 0 && (
          <ul className={styles.list}>
            {places.map((place) => (
              <li key={place.id} className={styles.place}>
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.name}>{place.name}</span>
                {place.meta && <span className={styles.meta}>{place.meta}</span>}
              </li>
            ))}
          </ul>
        )}

        <p className={styles.closing}>{CLOSING_LINE}</p>
      </div>
    </section>
  );
}
