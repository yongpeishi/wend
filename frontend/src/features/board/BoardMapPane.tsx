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
  /** Is the list currently taking its cue from this map? Decides which sentence the status pill says. */
  following: boolean;
  /** How many of the trip's shown ideas sit outside the current view. */
  offCount: number;
  onWiden: () => void;
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
 * The pill always says something, in all three states, because silence is the
 * one answer a reader cannot act on:
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
}: BoardMapPaneProps) {
  const status = following
    ? offCount > 0
      ? outsideLine(offCount)
      : 'Everything kept is in view'
    : 'The list is not following the map';

  return (
    <div className={styles.pane}>
      <MapView
        pins={pins}
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
        <p className={styles.status} aria-live="polite">
          {status}
        </p>
        {offCount > 0 && (
          <button type="button" className={styles.widen} onClick={onWiden}>
            Widen
          </button>
        )}
      </div>
    </div>
  );
}
