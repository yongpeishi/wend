import { useEffect, useRef, useState } from 'react';
import { Input } from '../../design/components/core/Input';
import { Button } from '../../design/components/core/Button';
import { Spinner } from '../../components/Spinner';
import { parseLatLng, searchPlace as defaultSearchPlace } from './geocode';
import type { GeocodeResult } from './types';
import styles from './PlaceSearch.module.css';

const DEBOUNCE_MS = 400;

export interface PlaceSearchProps {
  onPick: (result: GeocodeResult) => void;
  /**
   * Injectable so a keyed provider can be swapped in later without touching
   * any caller of <PlaceSearch>, and so tests never depend on a real network
   * call. Defaults to Nominatim via geocode.ts (rate-limited to 1/sec there).
   */
  searchFn?: (query: string, options?: { signal?: AbortSignal }) => Promise<GeocodeResult[]>;
  placeholder?: string;
  /** Shown when a search comes back empty — must always point at a way to proceed anyway. */
  emptyHint?: string;
}

/**
 * Free-text place search, debounced client-side on top of geocode.ts's own
 * 1/sec throttle. A pasted "lat, lng" pair is recognised immediately and
 * skips search entirely — per the maps decision, a failed or empty geocode
 * must never be the only way to place a pin.
 */
export function PlaceSearch({
  onPick,
  searchFn = defaultSearchPlace,
  placeholder = 'Search for a place',
  emptyHint = 'No matches. Paste coordinates instead, or drop a pin on the map.',
}: PlaceSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    },
    [],
  );

  const manual = parseLatLng(query);

  function handleChange(value: string) {
    setQuery(value);
    setResults([]);
    setSearched(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();

    const trimmed = value.trim();
    // A recognised coordinate pair needs no geocoding at all — first-class, not a fallback.
    if (!trimmed || parseLatLng(trimmed)) {
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
          setResults(found);
          setSearched(true);
        })
        .finally(() => setSearching(false));
    }, DEBOUNCE_MS);
  }

  return (
    <div className={styles.wrap}>
      <Input placeholder={placeholder} value={query} onChange={(e) => handleChange(e.target.value)} aria-label={placeholder} />

      {manual && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => onPick({ lat: manual.lat, lng: manual.lng, label: query.trim() })}
        >
          Use these coordinates
        </Button>
      )}

      {searching && <Spinner label="Searching" />}

      {!searching && !manual && results.length > 0 && (
        <ul className={styles.results}>
          {results.map((result, index) => (
            <li key={`${result.lat}-${result.lng}-${index}`}>
              <button type="button" className={styles.result} onClick={() => onPick(result)}>
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!searching && !manual && searched && results.length === 0 && <p className={styles.hint}>{emptyHint}</p>}
    </div>
  );
}
