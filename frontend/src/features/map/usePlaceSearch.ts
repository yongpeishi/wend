import { useCallback, useEffect, useRef, useState } from 'react';
import { searchPlace as defaultSearchPlace } from './geocode';
import type { Bounds, GeocodeResult } from './types';

/**
 * How long a pause counts as "done typing", shared by every place search in
 * the product. Two fields ask this geocoder the same question from two places
 * — the map's "Search the map" and the composer's address box — and if one
 * felt snappier than the other, the slower one would read as broken rather
 * than as a deliberate pace. That is the whole reason this number lives here
 * and not twice.
 *
 * It is not a throttle: geocode.ts already paces the wire at 1/sec, which is
 * Nominatim's usage policy. This only decides when to start asking.
 */
export const SEARCH_DEBOUNCE_MS = 400;

/**
 * The geocoder seam. Injectable everywhere so a keyed provider can be swapped
 * in later without touching a caller, and so tests never depend on a network
 * call. Defaults to Nominatim via geocode.ts.
 */
export type PlaceSearchFn = (
  query: string,
  options?: { signal?: AbortSignal; viewbox?: Bounds },
) => Promise<GeocodeResult[]>;

export interface UsePlaceSearchArgs {
  searchFn?: PlaceSearchFn;
  /**
   * Extra request options, read at *fire* time rather than at keystroke time.
   * The map passes its viewport this way: the debounced closure would
   * otherwise carry whatever the viewport was when the key was pressed, so
   * nudging the map during the pause would bias the request toward where you
   * used to be.
   */
  requestOptions?: () => { viewbox?: Bounds };
  /**
   * An answer landed, and it is the current one — a superseded search never
   * calls this. The composer uses it to open its suggestion list, which is a
   * thing only it has.
   */
  onResults?: (found: GeocodeResult[]) => void;
}

export interface PlaceSearch {
  results: GeocodeResult[];
  /** A request is in flight, or a debounce is waiting to start one. */
  searching: boolean;
  /**
   * True once a search has COMPLETED for the current text. It is what lets
   * "no match" mean "we asked and there was none" and never "we haven't asked
   * yet", which an empty results array alone cannot tell apart.
   */
  searched: boolean;
  /**
   * Debounce, abort the search before it, and ask. An empty query asks
   * nothing at all — no spinner, no request in flight to arrive late and
   * resurrect results for text that is gone.
   */
  search: (query: string) => void;
  /**
   * Stop the timer that hasn't fired and the request that has, and put the
   * spinner away — but keep the answers already found. This is what a blur
   * wants: a result landing after focus has moved on would pop a list open
   * under a field nobody is in.
   */
  cancel: () => void;
  /** `cancel`, and throw the answers away too. */
  clear: () => void;
}

/**
 * The debounce-and-abort loop that both place searches in this product are
 * built on: wait out the typing, ask the geocoder once, and let the next
 * keystroke cancel the answer to the last one.
 *
 * The two callers were the same twenty lines twice, which is how the
 * cancel-in-flight-on-blur fix came to exist in one of them and not the other.
 * What is *not* here is anything either field does with the answer — the map
 * groups it against local idea matches, the composer opens a combobox listbox
 * over it — because that is the part that genuinely differs. This owns the
 * asking; the components own the showing.
 *
 * Nothing here can throw at its caller. A rejecting provider collapses to an
 * empty result, per decisions.md §3: a failed geocode never blocks capturing
 * an idea, so the search is always an offer and never a gate.
 */
export function usePlaceSearch({
  searchFn = defaultSearchPlace,
  requestOptions,
  onResults,
}: UsePlaceSearchArgs = {}): PlaceSearch {
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // The three moving parts a scheduled search must read *late*. They are
  // assigned during render rather than in an effect, so the very first search
  // after mount already sees the real ones rather than the mount-time ones.
  const searchFnRef = useRef(searchFn);
  searchFnRef.current = searchFn;
  const requestOptionsRef = useRef(requestOptions);
  requestOptionsRef.current = requestOptions;
  const onResultsRef = useRef(onResults);
  onResultsRef.current = onResults;

  /** Stop whatever is pending — the timer that hasn't fired and the request that has. */
  const stopPending = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();
  }, []);

  useEffect(() => stopPending, [stopPending]);

  // The three returned actions are deliberately stable for the life of the
  // hook — everything they read that can change is behind a ref. That is what
  // lets a caller put one in an effect's dependency list (the map's
  // clear-on-nonce effect does) without the effect re-running every render.
  const search = useCallback((query: string) => {
    setResults([]);
    setSearched(false);
    // Deliberately not `cancel()`: the spinner is left alone here. A typist
    // who adds a letter mid-request is still searching, and blinking the
    // spinner off for the length of the debounce would say otherwise.
    stopPending();

    const trimmed = query.trim();
    if (!trimmed) {
      setSearching(false);
      return;
    }

    timerRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      searchFnRef
        .current(trimmed, { signal: controller.signal, ...requestOptionsRef.current?.() })
        // The default geocoder already resolves empty on any trouble, but this
        // seam takes any provider — one that rejects must be absorbed here,
        // not surface as an error inside the act of writing an idea down.
        .catch(() => [])
        .then((found) => {
          // A superseded search must not write over the one that replaced it.
          if (controller.signal.aborted) return;
          setResults(found);
          setSearched(true);
          setSearching(false);
          onResultsRef.current?.(found);
        });
    }, SEARCH_DEBOUNCE_MS);
  }, [stopPending]);

  const cancel = useCallback(() => {
    stopPending();
    setSearching(false);
  }, [stopPending]);

  const clear = useCallback(() => {
    stopPending();
    setResults([]);
    setSearching(false);
    setSearched(false);
  }, [stopPending]);

  return { results, searching, searched, search, cancel, clear };
}
