import { useId, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Spinner } from '../../components/Spinner';
import { usePlaceSearch } from '../map/usePlaceSearch';
import type { PlaceSearchFn } from '../map/usePlaceSearch';
import type { GeocodeResult } from '../map/types';
import styles from './AddressSearch.module.css';

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
  searchFn?: PlaceSearchFn;
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
 * mid-typing abort, all collapse to "no suggestions", and the most the field
 * ever says about it is a muted line ending "kept as typed." Nothing here can
 * throw at the parent or refuse a save.
 *
 * The one distinction that line does draw is between a search that ran and
 * matched nothing and one that could not run at all (`unreachable` from
 * usePlaceSearch). Nominatim rate-limits at 1/sec, so the second is an
 * ordinary outcome of typing quickly — and telling someone "no match" for it
 * would send them back to re-read an address that was fine.
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
  searchFn,
}: AddressSearchProps) {
  const [highlighted, setHighlighted] = useState<number | null>(null);
  // `open` is separate from "has results" so Escape and blur can put the list
  // away without throwing the answers out — an arrow key brings them straight
  // back, with no second round-trip to the geocoder.
  const [open, setOpen] = useState(false);
  const listboxId = useId();

  // The debounce/abort loop is the map search's, shared (usePlaceSearch). What
  // is local to this field is the list built on top of it — whether it shows,
  // and which row the arrow keys are on. An answer landing opens the list, and
  // opens it with nothing highlighted, so the first ArrowDown reaches the
  // first row rather than the second.
  const { results, searching, searched, unreachable, search, cancel, clear } = usePlaceSearch({
    searchFn,
    onResults: () => {
      setHighlighted(null);
      setOpen(true);
    },
  });

  function handleChange(text: string) {
    onChange(text);
    setHighlighted(null);
    search(text);

    // An emptied field asks nothing, so it shows nothing either — `search`
    // has already seen to it that no request is left in flight to arrive late
    // and resurrect suggestions for text that is gone.
    if (!text.trim()) setOpen(false);
  }

  function pick(place: GeocodeResult) {
    // Clear first: a search still in flight would otherwise land after the
    // pick and reopen the list over the address the writer just chose.
    clear();
    setHighlighted(null);
    setOpen(false);
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
        // Pending work is cancelled too: a search that landed after focus had
        // moved on would open the list under a field nobody is in, and shove
        // whatever sits below it out from under the pointer.
        onBlur={() => {
          cancel();
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

      {/* Neither line is an error. The text above is the address whatever
          happened here; these only say what the geocoder could add to it, and
          both end the same way to make that plain. Which one shows is the
          whole point: "no match" invites a second look at what you typed,
          and someone who typed an address they know is right would keep
          re-reading it. Nominatim rate-limits at 1/sec, so being told the
          search is unreachable is an ordinary thing to need to hear. */}
      {nothingFound &&
        (unreachable ? (
          <p className={styles.empty}>Couldn’t reach the address search — kept as typed.</p>
        ) : (
          <p className={styles.empty}>No match — kept as typed.</p>
        ))}
    </div>
  );
}
