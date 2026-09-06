import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '../../design/components/core/Input';
import { Spinner } from '../../components/Spinner';
import { usePlaceSearch } from './usePlaceSearch';
import type { PlaceSearchFn } from './usePlaceSearch';
import { matchIdeas } from './mapScreen';
import type { LocatedEntry } from './mapScreen';
import type { Bounds, GeocodeResult } from './types';
import styles from './MapSearch.module.css';

/** A dropdown longer than the screen is not a suggestion — same caps as matchIdeas. */
const MAX_IDEA_MATCHES = 3;
const MAX_PLACE_RESULTS = 4;

export interface MapSearchProps {
  /** The located ideas to match against — instant, no network. */
  ideas: LocatedEntry[];
  onPickIdea: (id: number) => void;
  onPickPlace: (place: GeocodeResult) => void;
  /** "Put it on the map yourself" — called with the query that found nothing. */
  onDropPinIntent: (query: string) => void;
  canEdit: boolean;
  /**
   * Bump (change the number) to clear the field and results from outside —
   * e.g. after the parent finishes the flow a pick started. The initial value
   * never counts as a bump, so mounting with any nonce leaves the field alone.
   */
  clearNonce?: number;
  /**
   * The map's current viewport — biases both halves of the answer toward what
   * is on screen: place results via the provider's viewbox, idea matches via
   * nearest-first ordering from the viewport centre. Null/undefined (a map that
   * hasn't reported bounds yet, or a caller that has none) means unbiased,
   * exactly as before this prop existed.
   */
  bounds?: Bounds | null;
  /**
   * Injectable so a keyed provider can be swapped in later without touching
   * any caller, and so tests never depend on a real network call. Defaults to
   * Nominatim via geocode.ts (rate-limited to 1/sec there).
   */
  searchFn?: PlaceSearchFn;
}

/**
 * The "Search the map" field that overlays the map top-left (the parent
 * positions it; this styles the card itself). One query feeds two answers at
 * two speeds: idea matching is instant and local (matchIdeas), place search is
 * debounced and abortable on top of geocode.ts's own 1/sec throttle. The two
 * live in labelled sections so "already yours" and "not yours yet" never blur
 * into one list.
 */
export function MapSearch({
  ideas,
  onPickIdea,
  onPickPlace,
  onDropPinIntent,
  canEdit,
  clearNonce,
  bounds,
  searchFn,
}: MapSearchProps) {
  const [query, setQuery] = useState('');

  /**
   * The viewport, handed to the hook as a getter rather than a value — and
   * deliberately NOT in any dependency array. Two things are being kept apart:
   *
   * 1. The search fires on a debounce timer. A captured `bounds` would be
   *    whatever it was when the key was pressed; if you nudge the map in that
   *    gap the request would be biased toward where you *were*. The hook calls
   *    this at fire time, so the bias follows the map.
   * 2. Panning must not re-run a geocode. `bounds` changes on every frame of a
   *    drag; wiring it into an effect dependency (or resubscribing the debounce
   *    to it) would fire a request per pan, which both burns Nominatim's 1/sec
   *    budget and makes the results flicker under a still-typing user. Bounds
   *    are an input to the next search, never a trigger for one.
   */
  const { results, searching, searched, search, clear } = usePlaceSearch({
    searchFn,
    requestOptions: () => ({ viewbox: bounds ?? undefined }),
  });

  // Stable, because the effect below lists it: `clear` is stable for the life
  // of the hook, so this is too, and the effect stays a nonce watcher rather
  // than something that runs on every render.
  const reset = useCallback(() => {
    clear();
    setQuery('');
  }, [clear]);

  // Ref-guard idiom: the ref starts at whatever nonce the parent mounted with,
  // so only a CHANGE clears the field — an initial value never counts.
  const nonceRef = useRef(clearNonce);
  useEffect(() => {
    if (clearNonce === undefined || clearNonce === nonceRef.current) return;
    nonceRef.current = clearNonce;
    reset();
  }, [clearNonce, reset]);

  function handleChange(value: string) {
    setQuery(value);
    search(value);
  }

  // Idea matching is local and instant, so it reads `bounds` straight from the
  // props — no getter needed, because there is no gap between deciding and doing:
  // this runs during the same render that received the new viewport. Re-ordering
  // on pan is the point, and costs nothing (no network, a handful of entries).
  const near = bounds
    ? { lat: (bounds.north + bounds.south) / 2, lng: (bounds.east + bounds.west) / 2 }
    : undefined;
  const ideaMatches = matchIdeas(query, ideas, MAX_IDEA_MATCHES, near);
  const places = canEdit ? results.slice(0, MAX_PLACE_RESULTS) : [];
  const nothingFound = searched && ideaMatches.length === 0 && results.length === 0;
  const panelOpen =
    query.trim() !== '' && (ideaMatches.length > 0 || places.length > 0 || searching || nothingFound);

  return (
    <div className={styles.card}>
      <Input
        aria-label="Search the map"
        placeholder="Search the map"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
      />

      {panelOpen && (
        <div className={styles.panel}>
          {ideaMatches.length > 0 && (
            <section>
              <h3 className={styles.sectionLabel}>{`On your map · ${ideaMatches.length}`}</h3>
              <ul className={styles.rows}>
                {ideaMatches.map((idea) => (
                  <li key={idea.id}>
                    <button
                      type="button"
                      className={styles.row}
                      onClick={() => {
                        onPickIdea(idea.id);
                        reset();
                      }}
                    >
                      <span className={styles.rowName}>{idea.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {places.length > 0 && (
            <section>
              <h3 className={styles.sectionLabel}>Places · not yours yet</h3>
              <ul className={styles.rows}>
                {places.map((place, index) => (
                  <li key={place.placeId ?? `${place.lat}-${place.lng}-${index}`}>
                    <button
                      type="button"
                      className={styles.row}
                      onClick={() => {
                        onPickPlace(place);
                        reset();
                      }}
                    >
                      <span className={styles.rowName}>{place.label}</span>
                      {place.kind && <span className={styles.rowMeta}>{place.kind}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {searching && <Spinner label="Searching" />}

          {nothingFound &&
            (canEdit ? (
              <div className={styles.nothing}>
                <p className={styles.nothingLine}>
                  Nothing by that name. You can put it on the map yourself — click where it is.
                </p>
                <button
                  type="button"
                  className={styles.dropPin}
                  onClick={() => {
                    const dropped = query.trim();
                    onDropPinIntent(dropped);
                    reset();
                  }}
                >
                  Click where it is
                </button>
              </div>
            ) : (
              <p className={styles.nothingLine}>Nothing by that name.</p>
            ))}
        </div>
      )}
    </div>
  );
}
