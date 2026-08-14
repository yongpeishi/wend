import { useMemo } from 'react';
import { GripVertical } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { useNavigate } from 'react-router-dom';
import type { Entry, EntryCategory } from '../../api/types';
import { CATEGORY_LABELS } from './filters';
import { formatDuration, joinMeta } from '../../lib/formatDates';
import { IdeaActionsMenu } from './IdeaActionsMenu';
import styles from './IdeaRow.module.css';

export interface IdeaRowProps {
  entry: Entry;
  bundles: Entry[];
  members: Map<number, Entry[]>;
  /**
   * The board is picking several ideas at once. This turns the state dot into
   * the pick circle — see the `Dot` comment for why one element plays both
   * parts, and what that costs.
   */
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: (id: number, shiftKey: boolean) => void;
  /**
   * Opens the idea for editing. The board passes a handler that raises the edit
   * drawer over the board itself; without one the row falls back to navigating
   * to /entries/:id, which is the same drawer over an empty page.
   */
  onEdit?: (id: number) => void;
  onToast?: (message: string) => void;
}

/**
 * The state dot, one of the two colour signals on the row.
 *
 * The design mocks four idea states (decided / open / destination / waiting)
 * against a `state` field an Entry simply does not have — inventing one here
 * would put a fiction in the UI that no endpoint can ever confirm. So the dot is
 * derived from two fields that DO exist, and means only what they mean:
 *
 *   scheduled === true                        -> "decided": it has a slot on the
 *                                                schedule. The strongest settled
 *                                                signal the data model carries.
 *   not scheduled, todos_open_count > 0       -> "open": something is still to
 *                                                find out before it can be placed.
 *   not scheduled, no open todos              -> "waiting": kept, nothing
 *                                                blocking it, just not placed yet.
 *
 * `--stop-destination` (plum) is deliberately unused: it belongs to the trip
 * itself in the trail language, not to an idea within it.
 *
 * Colour is never the only carrier — the dot is exposed to assistive tech with
 * the same wording as `aria-label`, and open todos also appear as words in the
 * meta line below the title.
 */
type IdeaState = 'decided' | 'open' | 'waiting';

const STATE_CLASS: Record<IdeaState, string> = {
  decided: styles.stateDecided,
  open: styles.stateOpen,
  waiting: styles.stateWaiting,
};

const STATE_LABEL: Record<IdeaState, string> = {
  decided: 'Scheduled',
  open: 'Still something to sort out',
  waiting: 'Kept, not placed yet',
};

function ideaState(entry: Entry): IdeaState {
  if (entry.scheduled) return 'decided';
  return entry.todos_open_count > 0 ? 'open' : 'waiting';
}

/**
 * Category colour, the row's other colour signal. The mapping is lifted
 * verbatim from the design prototype's `CAT_COLOR` table, which reaches for
 * existing brand tokens rather than new hexes — so nothing is invented here
 * either. Two categories deliberately share a colour (place and activity are
 * both leaf), and transport/other fall back to `--text-muted`: the palette is
 * three brand hues wide, not six, and stretching it would mean minting colours
 * the design system has never sanctioned.
 *
 * The label itself is always the word, so the colour is decoration only.
 */
const CATEGORY_CLASS: Record<EntryCategory, string> = {
  place: styles.catLeaf,
  food: styles.catApricot,
  activity: styles.catLeaf,
  lodging: styles.catPlum,
  transport: styles.catMuted,
  other: styles.catMuted,
};

/**
 * One idea on the board, as a flat bordered row rather than the old card:
 * state dot, title with its category, a middot meta line, and — when it is in
 * one — the bundles it belongs to.
 *
 * What is NOT here, and why:
 *   - No vote control. Rating is descoped from the board for now (see
 *     doc/backlog/trip-view.md). `VoteControl` and the votes on the entry detail
 *     screen are untouched, so this is one import away from coming back.
 *   - No hatch thumbnail / `EntryRow`. This row is scanned in a long list; the
 *     design trades the thumbnail for density.
 *
 * What is kept, and why:
 *   - The drag handle. Dragging an idea onto a bundle is the core board gesture
 *     (`data: { entryId, title }` is what the bundle drop targets read, and what
 *     TripBoard's onDragEnd turns into a link). Its pointer-free equivalent is
 *     the bundle list inside the ⋯ menu — every drag in Wend has one.
 *   - Multi-select, which is what `BulkBar` acts on — but as a mode now rather
 *     than a permanent checkbox on every row. See the pick circle below.
 *   - Set aside. Nothing on the board is ever deleted; the archive action
 *     soft-archives and `SetAsideSection` brings it back. It moved into the ⋯
 *     menu with the rest of the row's verbs.
 *
 * Editing is now named: the ⋯ button on the right opens Edit, Set aside and the
 * bundles, so the drawer arrives because it was asked for. Clicking the row
 * still opens the same drawer — that shortcut is worth keeping, it just is no
 * longer the only way in.
 *
 * Interaction: hover and press are opacity only, focus is the apricot ring,
 * there are no shadows. A selected row is bordered apricot — the same "this one"
 * accent the design uses for the row under the cursor's attention.
 */
export function IdeaRow({
  entry,
  bundles,
  members,
  selectMode,
  selected,
  onToggleSelect,
  onEdit,
  onToast,
}: IdeaRowProps) {
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `idea-${entry.id}`,
    data: { entryId: entry.id, title: entry.title },
  });

  const state = ideaState(entry);

  function edit() {
    if (onEdit) onEdit(entry.id);
    else navigate(`/entries/${entry.id}`);
  }

  // Category has its own slot beside the title now, so it is out of the meta
  // line — which leaves place, how long it takes, and what is still open.
  const meta = joinMeta(
    entry.location_name,
    formatDuration(entry.duration_minutes),
    entry.todos_open_count > 0 ? `${entry.todos_open_count} open` : null,
  );

  // The optional plum "in <bundle>, <bundle>" line. Derived from the bundle
  // membership TripBoard already loads for the drag targets — no extra request.
  const bundleNames = useMemo(
    () =>
      bundles
        .filter((bundle) => (members.get(bundle.id) ?? []).some((member) => member.id === entry.id))
        .map((bundle) => bundle.title),
    [bundles, members, entry.id],
  );

  return (
    <div className={styles.row} data-selected={selected || undefined} data-dragging={isDragging || undefined}>
      {/*
        One slot, two jobs. Out of select mode this is the 10px state dot and
        nothing else; in select mode it grows to a 22px pick circle, and that
        growth IS how the board says it is in a different mode — no banner, no
        row of ghost checkboxes waiting to be used.

        The two are different elements rather than one element wearing two
        hats, because they are genuinely different things to assistive tech: an
        image that describes the idea's state, and a control you can operate.
        Rendering a `role="checkbox"` that is not operable, or a dot that
        claims to be checkable, would be a lie in one direction or the other.
        The state meaning is not lost while picking — the open-todo count is
        still spelled out in words in the meta line, and the state returns the
        moment select mode ends.

        A <button role="checkbox"> rather than <input type="checkbox">: the
        visual is a filled circle with a tick, which no native checkbox will
        render without being hidden and redrawn anyway, and the shift-click
        range gesture needs the modifier off a click event. Space and Enter
        both activate a button, so the keyboard contract is intact.
      */}
      {selectMode ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select ${entry.title}`}
          className={[styles.pick, selected ? styles.pickOn : ''].filter(Boolean).join(' ')}
          onClick={(event) => {
            // Picking is not opening. Without this the click carries on to the
            // row and the edit drawer arrives on top of the selection.
            event.stopPropagation();
            onToggleSelect(entry.id, event.shiftKey);
          }}
        >
          {/* Colour is never the only signal: the tick and the heavier border
              say "picked" as loudly as the leaf fill does. Decorative, because
              aria-checked already carries the state. */}
          {selected && (
            <span className={styles.pickTick} aria-hidden="true">
              ✓
            </span>
          )}
        </button>
      ) : (
        <span className={[styles.stateDot, STATE_CLASS[state]].join(' ')} role="img" aria-label={STATE_LABEL[state]} />
      )}

      <button type="button" className={styles.main} onClick={edit}>
        <span className={styles.headline}>
          <span className={styles.title}>{entry.title}</span>
          {entry.category && (
            <span className={[styles.category, CATEGORY_CLASS[entry.category]].join(' ')}>
              {CATEGORY_LABELS[entry.category]}
            </span>
          )}
        </span>
        {meta && <span className={styles.meta}>{meta}</span>}
        {bundleNames.length > 0 && <span className={styles.bundleLine}>in {bundleNames.join(', ')}</span>}
      </button>

      <div className={styles.actions}>
        <IdeaActionsMenu
          entry={entry}
          bundles={bundles}
          members={members}
          onEdit={edit}
          onToast={onToast}
        />

        <button
          type="button"
          ref={setNodeRef}
          {...listeners}
          {...attributes}
          className={[styles.iconButton, styles.grip].join(' ')}
          aria-label={`Drag ${entry.title} onto a bundle to add it there`}
        >
          <GripVertical size={18} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
