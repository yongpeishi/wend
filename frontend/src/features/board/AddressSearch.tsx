import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Spinner } from '../../components/Spinner';
import { searchPlace as defaultSearchPlace } from '../map/geocode';
import type { GeocodeResult } from '../map/types';
import styles from './AddressSearch.module.css';

/**
 * Must stay equal to MapSearch's DEBOUNCE_MS. The two fields ask the same
 * geocoder the same question from two places in the product; if one felt
 * snappier than the other, the slower one would read as broken rather than as
 * a deliberate pace. Neither number is a throttle — geocode.ts already paces
 * the wire at 1/sec — this is only how long a pause counts as "done typing".
 */
const DEBOUNCE_MS = 400;

/** A suggestion list longer than a hand is a search result page, not a suggestion. */
const MAX_RESULTS = 5;

export interface AddressSearchProps {
  /** Controlled text — the composer owns the address string. */
  value: string;
  /** Every keystroke. The composer decides what an emptied field means for lat/lng. */
  onChange: (text: string) => void;
  /** A suggestion was chosen (click, or Enter on the highlighted row). */
  onPick: (place: GeocodeResult) => void;
  placeholder?: string;
  /** Accessible name of the input. Default 'Address'. */
  'aria-label'?: string;
  /** Class for the <input> itself so the composer can pass its own `.input` look. */
  inputClassName?: string;
  /** Injectable geocoder — tests never hit the network. Default: `searchPlace` from '../map/geocode'. */
  searchFn?: (query: string, options?: { signal?: AbortSignal }) => Promise<GeocodeResult[]>;
}

/**
 * The composer's address field, grown a suggestion list: type, and the same
 * Nominatim geocoder that answers the map's search offers up to five places to
 * choose from. Choosing one hands the whole `GeocodeResult` up so the composer
 * can keep the coordinates alongside the text; not choosing one costs nothing.
 *
 * That last point is the decision this component is built around
 * (doc/init/decisions.md §3): a failed geocode never blocks capturing an idea.
 * So the text is controlled from above and is always the address — the list
 * is an offer, never a gate. A rejecting provider, an empty answer, a
 * mid-typing abort, all collapse to "no suggestions", and the only thing the
 * field says about it is a muted line admitting the address will be kept as
 * typed. Nothing here can throw at the parent or refuse a save.
 *
 * It is a proper combobox (input + listbox, ARIA 1.2 shape) rather than a
 * list of buttons under a box, because the composer is worked from the
 * keyboard — Tab from the name field, type, arrow, Enter — and a row of
 * focusable buttons would make "pick the second suggestion" a Tab-Tab-Enter
 * hunt that leaves the input. Focus stays in the input throughout; the arrow
 * keys move `aria-activedescendant` and the options are never tab stops.
 *
 * Two keys are deliberately left alone. Enter with nothing highlighted passes
 * straight through, because the composer's Enter means "keep the idea" and
 * this field must not eat it. Escape with the list closed passes through for
 * the same reason — a parent that closes on Escape should still get to. Only
 * an open list claims Escape, and claims it fully (stopPropagation), because
 * "dismiss the suggestions" and "dismiss the composer" are two different
 * wishes and one press must not do both.
 *
 * The list sits in flow below the input, not floated over the card. The
 * composer card simply grows to hold it, which spares the stacking-context
 * and clipping trouble an absolute dropdown brings inside a card that is
 * itself inside a scrolling list. The closed state is a tone step (paper on
 * card), in the same vocabulary as the composer's own parent picker.
 */
export function AddressSearch({
  value,
  onChange,
  onPick,
  placeholder,
  'aria-label': ariaLabel = 'Address',
  inputClassName,
  searchFn = defaultSearchPlace,
}: AddressSearchProps) {
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  // `open` is separate from "has results" so Escape and blur can put the list
  // away without throwing the answers out — an arrow key brings them straight
  // back, with no second round-trip to the geocoder.
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  // True once a search has COMPLETED for the current text. It is what lets
  // "no match" mean "we asked and there was none" and never "we haven't asked
  // yet", which an empty results array alone cannot tell apart.
  const [searched, setSearched] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listboxId = useId();

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    },
    [],
  );

  /** Stop whatever is pending — the timer that hasn't fired and the request that has. */
  function cancelPending() {
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();
  }

  function handleChange(text: string) {
    onChange(text);
    setResults([]);
    setHighlighted(null);
    setSearched(false);
    cancelPending();

    const trimmed = text.trim();
    if (!trimmed) {
      // An emptied field asks nothing: no spinner, no list, no request in
      // flight to arrive late and resurrect suggestions for text that is gone.
      setSearching(false);
      setOpen(false);
      return;
    }

    timerRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      searchFn(trimmed, { signal: controller.signal })
        // The default geocoder already resolves empty on any trouble, but this
        // seam takes any provider — one that rejects must be absorbed here,
        // not surface as an error inside the act of writing an idea down.
        .catch(() => [])
        .then((found) => {
          // A superseded search must not write over the one that replaced it.
          if (controller.signal.aborted) return;
          setResults(found);
          setHighlighted(null);
          setOpen(true);
          setSearched(true);
          setSearching(false);
        });
    }, DEBOUNCE_MS);
  }

  function pick(place: GeocodeResult) {
    // Cancel first: a search still in flight would otherwise land after the
    // pick and reopen the list over the address the writer just chose.
    cancelPending();
    setSearching(false);
    setResults([]);
    setHighlighted(null);
    setOpen(false);
    setSearched(false);
    onPick(place);
  }

  const shown = results.slice(0, MAX_RESULTS);
  const listOpen = open && shown.length > 0;
  const nothingFound = searched && results.length === 0;

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    // While an IME candidate list is up, every one of these keys belongs to
    // it — Enter chooses the candidate, the arrows move through them. Taking
    // any of them here would break typing a Japanese address, which on this
    // trip planner is the ordinary case, not the edge.
    if (event.nativeEvent.isComposing) return;

    switch (event.key) {
      case 'ArrowDown': {
        if (shown.length === 0) return;
        // preventDefault keeps the caret where it is: the browser's own
        // ArrowDown in a text input jumps it to the end of the line.
        event.preventDefault();
        if (!listOpen) {
          setOpen(true);
          setHighlighted(0);
          return;
        }
        setHighlighted((current) => (current === null ? 0 : (current + 1) % shown.length));
        return;
      }
      case 'ArrowUp': {
        if (shown.length === 0) return;
        event.preventDefault();
        // Opening from the bottom: the same reopen as ArrowDown, entered from
        // the other end, so the two keys are mirrors rather than one working.
        if (!listOpen) {
          setOpen(true);
          setHighlighted(shown.length - 1);
          return;
        }
        setHighlighted((current) =>
          current === null ? shown.length - 1 : (current - 1 + shown.length) % shown.length,
        );
        return;
      }
      case 'Enter': {
        // Only a highlighted row makes Enter ours. Otherwise it is the
        // composer's "keep the idea", and we let it through untouched.
        if (!listOpen || highlighted === null) return;
        const place = shown[highlighted];
        if (!place) return;
        event.preventDefault();
        pick(place);
        return;
      }
      case 'Escape': {
        // A closed list has no claim on Escape — see the component comment.
        if (!listOpen) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        setHighlighted(null);
        return;
      }
      default:
        return;
    }
  }

  const activeId = listOpen && highlighted !== null ? `${listboxId}-${highlighted}` : undefined;

  return (
    <div className={styles.field}>
      <input
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={listOpen}
        aria-controls={listboxId}
        aria-activedescendant={activeId}
        aria-label={ariaLabel}
        autoComplete="off"
        className={inputClassName}
        value={value}
        placeholder={placeholder}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={handleKeyDown}
        // Blur closes the list but keeps the results; the options take care
        // not to cause the blur in the first place (see their onMouseDown).
        onBlur={() => {
          setOpen(false);
          setHighlighted(null);
        }}
      />

      {listOpen && (
        <ul className={styles.list} role="listbox" id={listboxId} aria-label={`${ariaLabel} suggestions`}>
          {shown.map((place, index) => {
            const isHighlighted = index === highlighted;
            return (
              <li
                key={place.placeId ?? `${place.lat}-${place.lng}-${index}`}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={isHighlighted}
                className={[styles.option, isHighlighted ? styles.optionOn : ''].filter(Boolean).join(' ')}
                // A mousedown on the row would blur the input, the blur would
                // close the list, and the click would then land on nothing.
                // Swallowing the mousedown keeps focus in the input so the
                // click that follows still reaches the row.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(place)}
              >
                <span className={styles.optionName}>{place.label}</span>
                {place.kind && <span className={styles.optionMeta}>{place.kind}</span>}
              </li>
            );
          })}
        </ul>
      )}

      {searching && <Spinner label="Searching" />}

      {/* Not an error. The text above is the address whatever happened here;
          this only says the geocoder had nothing to add to it. */}
      {nothingFound && <p className={styles.empty}>No match — kept as typed.</p>}
    </div>
  );
}
