import { useMemo } from 'react';
import { MapView } from '../map/MapView';
import type { Bounds, MapPin } from '../map/types';
import styles from './BoardMapPane.module.css';

export interface BoardMapPaneProps {
  /** Already filtered and already toned — see TripBoard, which is the only thing that knows both. */
  pins: MapPin[];
  selectedId: number | null;
  onSelectPin: (id: number) => void;
  onSelectCluster: (ids: number[]) => void;
  onBoundsChange: (bounds: Bounds) => void;
  /** Bumped by "Widen" — see MapView's `fitRequest`. */
  fitRequest: number;
  /**
   * Is the list currently taking its cue from this map? Decides which sentence
   * the status pill says — in legacy mode only. With `labeledIds` set the list
   * never follows the map, so this is ignored and the pill never speaks in
   * following vocabulary.
   */
  following: boolean;
  /** How many of the trip's shown ideas sit outside the current view. */
  offCount: number;
  onWiden: () => void;
  /**
   * Whether the counts are facts yet — same contract as FilterBar's countKnown.
   * While the ideas query is still pending or has failed, "Everything kept is
   * in view" is an affirmative claim about data that never arrived, so the pill
   * holds its tongue instead. Defaults to true: a caller with no query to wait
   * on has counts the moment it has pins.
   */
  countKnown?: boolean;
  /**
   * The ids of the ideas in the list currently on screen. When provided, the
   * map splits its pins two ways instead of toning them: ids in the set draw
   * as labelled leaf chips, every other located idea as a small neutral dot —
   * and the explanatory caption appears under the map. Absent (today's
   * callers), pins draw exactly as before, tones and all.
   */
  labeledIds?: ReadonlySet<number>;
  /**
   * When provided, the pane grows its own header row — the "Map" label and a
   * "Hide map" link-look button wired to this. Absent, no header: the caller
   * owns the chrome, as today.
   */
  onHide?: () => void;
}

/** "1 idea outside this view", never "1 ideas" — the mockup's own line has that bug. */
function outsideLine(count: number): string {
  return `${count} ${count === 1 ? 'idea' : 'ideas'} outside this view`;
}

/**
 * The board's map: the seam's <MapView>, plus the one piece of chrome that is
 * board vocabulary rather than map vocabulary — a pill in the bottom corner
 * saying what the current view is doing to the list, and the way back out.
 *
 * That chrome lives here and not inside features/map for the same reason pin
 * tone does: "the list is following me" and "twelve ideas are off-screen" are
 * facts about a board with a list on it, and teaching the map seam about them
 * would nail it to this one screen and break the provider swap.
 *
 * With `labeledIds` set, the list never takes its cue from the map at all, so
 * following vocabulary would describe a switch that no longer exists. The pill
 * then says only the one thing left worth saying — "N off view" when the view
 * cuts anything — and stays away entirely otherwise: the chip/dot split and
 * its caption already explain the quiet states.
 *
 * In legacy mode (no `labeledIds`) the pill always says something, in all
 * three states, because silence is the one answer a reader cannot act on (the
 * one exception: while the counts aren't known yet — see countKnown — the
 * count sentences would be guesses, and silence beats a guess):
 *   - following, some cut     -> how many are out there
 *   - following, nothing cut  -> "Everything kept is in view", so a short list
 *                                reads as a short list rather than a hidden one
 *   - not following           -> says so, so panning-with-no-effect is explained
 *                                rather than looking broken
 *
 * "Widen" appears whenever anything is outside the view, INCLUDING while the
 * follow switch is off. It re-fits the map to every pin — it moves the map, not
 * the list — so its usefulness has nothing to do with whether the list is
 * listening. Hiding it with the switch off would take away the only one-move way
 * back to the whole trip exactly when panning has stopped explaining itself.
 */
export function BoardMapPane({
  pins,
  selectedId,
  onSelectPin,
  onSelectCluster,
  onBoundsChange,
  fitRequest,
  following,
  offCount,
  onWiden,
  countKnown = true,
  labeledIds,
  onHide,
}: BoardMapPaneProps) {
  // No count sentence while the counts aren't known — see countKnown. In
  // legacy mode the not-following line survives that, because it is a fact
  // about the switch, not about the data.
  const status = labeledIds
    ? countKnown && offCount > 0
      ? `${offCount} off view`
      : null
    : following
      ? countKnown
        ? offCount > 0
          ? outsideLine(offCount)
          : 'Everything kept is in view'
        : null
      : 'The list is not following the map';

  // The chip/dot split, computed here for the same reason tone is: only the
  // board knows which ideas the visible list holds. The map just draws marks.
  const markedPins = useMemo<MapPin[]>(
    () =>
      labeledIds
        ? pins.map((pin) => ({ ...pin, mark: labeledIds.has(pin.id) ? ('chip' as const) : ('dot' as const) }))
        : pins,
    [pins, labeledIds],
  );

  return (
    <div className={styles.pane}>
      {onHide && (
        <div className={styles.header}>
          <p className={styles.headerLabel}>Map</p>
          <button type="button" className={styles.hide} onClick={onHide}>
            Hide map
          </button>
        </div>
      )}

      <div className={styles.mapBox}>
        <MapView
          pins={markedPins}
          selectedId={selectedId}
          onSelectPin={onSelectPin}
          onSelectCluster={onSelectCluster}
          onBoundsChange={onBoundsChange}
          fitToPins
          fitRequest={fitRequest}
          pinVariant="label"
          height="100%"
          aria-label="Map of the ideas in this trip"
        />

        {/* aria-live, because this sentence changes as a consequence of dragging
            the map — nothing focuses, so a screen reader would otherwise never
            learn that the list underneath had just been cut down. Polite: it is a
            running commentary, not an interruption. */}
        <div className={styles.footer}>
          {/* In labeled mode a silent state draws no pill at all — an empty
              bordered pill floating on the map would be chrome about nothing.
              Legacy mode keeps the element mounted in every state, as today. */}
          {(!labeledIds || status !== null) && (
            <p className={styles.status} aria-live="polite">
              {status}
            </p>
          )}
          {offCount > 0 && (
            <button type="button" className={styles.widen} onClick={onWiden}>
              Widen
            </button>
          )}
        </div>
      </div>

      {/* Only alongside the chip/dot split it explains — a caption about
          labelled pins under a map that has none would be a riddle. */}
      {labeledIds && (
        <p className={styles.caption}>
          Pins are ideas with an address. Labelled ones are in the list you&rsquo;re viewing; the rest wait as dots.
        </p>
      )}
    </div>
  );
}
