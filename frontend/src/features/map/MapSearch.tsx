import { useEffect, useRef, useState } from 'react';
import { Input } from '../../design/components/core/Input';
import { Spinner } from '../../components/Spinner';
import { searchPlace as defaultSearchPlace } from './geocode';
import { matchIdeas } from './mapScreen';
import type { LocatedEntry } from './mapScreen';
import type { GeocodeResult } from './types';
import styles from './MapSearch.module.css';

const DEBOUNCE_MS = 400;

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
   * Injectable so a keyed provider can be swapped in later without touching
   * any caller, and so tests never depend on a real network call. Defaults to
   * Nominatim via geocode.ts (rate-limited to 1/sec there).
   */
  searchFn?: (query: string, options?: { signal?: AbortSignal }) => Promise<GeocodeResult[]>;
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
  searchFn = defaultSearchPlace,
}: MapSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function reset() {
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();
    setQuery('');
    setResults([]);
    setSearching(false);
    setSearched(false);
  }

  // Ref-guard idiom: the ref starts at whatever nonce the parent mounted with,
  // so only a CHANGE clears the field — an initial value never counts.
  const nonceRef = useRef(clearNonce);
  useEffect(() => {
    if (clearNonce === undefined || clearNonce === nonceRef.current) return;
    nonceRef.current = clearNonce;
    reset();
  }, [clearNonce]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    },
    [],
  );

  function handleChange(value: string) {
    setQuery(value);
    setResults([]);
    setSearched(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();

    const trimmed = value.trim();
    if (!trimmed) {
      setSearching(false);
      return;
    }

    timerRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      searchFn(trimmed, { signal: controller.signal })
        // A swapped-in provider might reject instead of resolving empty — the
        // seam itself must absorb that, not just geocode.ts's default fetch.
        .catch(() => [])
        .then((found) => {
          // A superseded search must not write over the one that replaced it.
          if (controller.signal.aborted) return;
          setResults(found);
          setSearched(true);
          setSearching(false);
        });
    }, DEBOUNCE_MS);
  }

  const ideaMatches = matchIdeas(query, ideas, MAX_IDEA_MATCHES);
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
