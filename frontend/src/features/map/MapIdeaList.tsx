import { useState } from 'react';
import type { Entry } from '../../api/types';
import type { EntryGroup } from '../board/filters';
import styles from './MapIdeaList.module.css';

export interface MapIdeaListProps {
  /** Already filtered/grouped/ordered located rows — the parent owns all of that. */
  groups: EntryGroup[];
  /** id → muted meta line (may be ''), computed once by the parent via metaLineFor. */
  metaLines: ReadonlyMap<number, string>;
  selectedIds: readonly number[];
  onToggleSelect: (id: number) => void;
  /** Name click — the parent centres the map on this idea's pin. */
  onRowNameClick: (id: number) => void;
  /** Group header action — the parent fits the viewport to the group's pins. */
  onZoomGroup: (key: string) => void;
  justAddedId: number | null;
  /** Ideas with no coordinates — shown in the dashed footer, never as rows. */
  placeless: Entry[];
  /** Enters pin-drop mode in the parent. */
  onPutOnMap: (id: number) => void;
  canEdit: boolean;
}

/**
 * The list beside the map. Rows are deliberately FLAT — no indentation, no
 * parent-before-child ordering — because the map has already flattened the
 * trip into pins, and a hierarchy the pins cannot show would make the list
 * disagree with the picture it annotates. Nesting survives only as words, in
 * the meta line the parent computes ("in Rome · 2 inside are on the map").
 *
 * The component renders exactly what it is handed: grouping, filtering and
 * ordering all happened upstream (mapScreen.ts groupLocated), so every state
 * here is presentational. The one piece of state it owns is whether the
 * place-less footer is unfolded, which nobody else needs to know.
 *
 * The "no ideas in view" message is the PARENT's: an empty groups array
 * renders nothing for the groups part, because only the parent knows whether
 * emptiness means "nothing located", "the viewport narrowed it away" or "a
 * filter did" — and each deserves a different sentence.
 */
export function MapIdeaList({
  groups,
  metaLines,
  selectedIds,
  onToggleSelect,
  onRowNameClick,
  onZoomGroup,
  justAddedId,
  placeless,
  onPutOnMap,
  canEdit,
}: MapIdeaListProps) {
  // The footer's unfolded state. Local on purpose: it is a reading posture,
  // not a fact about the trip, and it resets when the screen does.
  const [placelessOpen, setPlacelessOpen] = useState(false);

  const selected = new Set(selectedIds);

  // The ungrouped case: groupEntries('none') returns one group with an empty
  // label, and a heading with no words over the only section there is would
  // be chrome for its own sake.
  const soloUngrouped = groups.length === 1 && groups[0].label === '';

  return (
    <div className={styles.list}>
      {groups.map((group) => (
        <section key={group.key} className={styles.group}>
          {!soloUngrouped && (
            <div className={styles.groupHeader}>
              <span className={styles.groupLabel}>{group.label}</span>
              <span className={styles.groupCount}>{group.entries.length}</span>
              {/* Quiet, not primary: zooming reads the map, it changes nothing. */}
              <button type="button" className={styles.zoom} onClick={() => onZoomGroup(group.key)}>
                Zoom to {group.label}
              </button>
            </div>
          )}

          {group.entries.map((entry) => {
            const meta = metaLines.get(entry.id) ?? '';
            const justAdded = entry.id === justAddedId;
            return (
              <div key={entry.id} className={styles.row} data-just-added={justAdded || undefined}>
                {/* Same pick idiom as the board's IdeaRow: a button wearing
                    role="checkbox", because the visual is a drawn circle no
                    native checkbox renders without being hidden and redrawn.
                    Its accessible name is the idea's title, so "select what?"
                    is answered by the name alone. A viewer gets no circle at
                    all — selection leads only to verbs they do not have. */}
                {canEdit && (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={selected.has(entry.id)}
                    aria-label={entry.title}
                    className={[styles.pick, selected.has(entry.id) ? styles.pickOn : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => onToggleSelect(entry.id)}
                  >
                    {/* Colour is never the only signal — the tick says "picked"
                        as loudly as the fill. Decorative: aria-checked carries
                        the state. */}
                    {selected.has(entry.id) && (
                      <span className={styles.pickTick} aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </button>
                )}

                <div className={styles.rowBody}>
                  <span className={styles.nameLine}>
                    {/* The name is the row's one navigation: it centres the
                        map. It does NOT toggle selection — that is the circle's
                        job — so a click on a line of text never changes state. */}
                    <button
                      type="button"
                      className={styles.name}
                      onClick={() => onRowNameClick(entry.id)}
                    >
                      {entry.title}
                    </button>
                    {/* Jade writes, it never fills: a confirmation as words. */}
                    {entry.scheduled && <span className={styles.onDay}>✓ on a day</span>}
                    {entry.vote_tally.total !== 0 && (
                      <span className={styles.votes}>▲ {entry.vote_tally.total}</span>
                    )}
                    {/* The label half of the just-added signal; the border is
                        the other half. Apricot as shape only — border and
                        wash — the words stay ink. */}
                    {justAdded && <span className={styles.justAdded}>just added</span>}
                  </span>
                  {meta !== '' && <p className={styles.meta}>{meta}</p>}
                </div>
              </div>
            );
          })}
        </section>
      ))}

      {/* The place-less footer — ALWAYS present when anything qualifies,
          whatever the viewport is doing to the list above, because these ideas
          are invisible to the map no matter where it looks. Dashed border: the
          one block on the screen about things the map cannot draw. */}
      {placeless.length > 0 && (
        <div className={styles.placeless}>
          <div className={styles.placelessHead}>
            <span className={styles.placelessCount}>
              {placeless.length === 1
                ? '1 idea has no place yet'
                : `${placeless.length} ideas have no place yet`}
            </span>
            <button
              type="button"
              className={styles.placelessToggle}
              aria-expanded={placelessOpen}
              onClick={() => setPlacelessOpen((value) => !value)}
            >
              {placelessOpen ? 'Hide them' : 'Show them ›'}
            </button>
          </div>
          {/* Said out loud because a map that shows fewer ideas than the board
              looks like it lost some — the sentence is the reassurance. */}
          <p className={styles.placelessNote}>
            Not hidden — they are on your board, they just cannot be drawn here. Give one a place
            and it joins the map.
          </p>
          {placelessOpen &&
            placeless.map((entry) => (
              <div key={entry.id} className={styles.placelessRow}>
                <span className={styles.placelessTitle}>{entry.title}</span>
                {canEdit && (
                  <button
                    type="button"
                    className={styles.putOnMap}
                    onClick={() => onPutOnMap(entry.id)}
                  >
                    Put it on the map
                  </button>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
