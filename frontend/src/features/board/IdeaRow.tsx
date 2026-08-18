import { useId, useMemo, useState } from 'react';
import { ChevronDown, GripVertical } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { useNavigate } from 'react-router-dom';
import type { Entry, EntryCategory } from '../../api/types';
import { CATEGORY_LABELS } from './filters';
import { formatDuration, joinMeta } from '../../lib/formatDates';
import { Chip, Tag } from '../../design/components/core/Chip';
import { useToast } from '../../components/Toast';
import { useDeleteVote, useVote } from '../../api';
import { IdeaActionsMenu } from './IdeaActionsMenu';
import { IdeaTodos } from './IdeaTodos';
import { VoteBar } from './VoteBar';
import { useLinkMutations } from './useLinkMutations';
import styles from './IdeaRow.module.css';

/** The house sentence for a write that did not land. Same words everywhere. */
const SAVE_FAILED = "That didn't save. It's still here — try again.";

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
   * Opens the idea for editing — now reached only from the ⋯ menu's Edit, since
   * clicking the row expands it instead. The board passes a handler that raises
   * the edit drawer over the board itself; without one the row falls back to
   * navigating to /entries/:id, which is the same drawer over an empty page.
   */
  onEdit?: (id: number) => void;
  onToast?: (message: string) => void;
  /**
   * May you change this trip? A prop rather than `useCanEdit()` because this row
   * already takes every one of its verbs as a callback from the board — the
   * capability arrives by the same road as the actions it governs, so a row
   * rendered outside a trip (or in a test) says so in one place instead of
   * needing a provider around it. Defaults to true: the not-in-a-trip case is
   * yours, exactly as `tripRole.ts` reads a null role.
   */
  canEdit?: boolean;
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
 * one — the bundles it belongs to. Clicking it opens the row downwards into a
 * panel where the idea can be acted on.
 *
 * Where the vote lives, and why here.
 *   This row used to carry a comment saying there was deliberately no vote
 *   control on the board at all. That was true while rating had nowhere to go
 *   but the edit dialog, and it stopped being true the moment the row could
 *   open. The tally is not one of the idea's own fields — it is a fact about
 *   the group's appetite for it, which changes without the idea changing —
 *   so it does not belong in the dialog that edits what the idea IS. It
 *   belongs where you are already looking at the idea and deciding about it:
 *   in the expanded panel, beside the to-dos and the bundles, with the running
 *   total in the header so the answer is legible without opening anything.
 *
 * What is still NOT here:
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
 * Editing is now named, and named only once: the ⋯ button on the right opens
 * Edit, so the drawer arrives because it was asked for. The row itself no
 * longer opens it — a click that used to throw a dialog over the board now
 * does the smaller, reversible thing instead.
 *
 * The bundle chips exist twice on purpose — in the ⋯ menu, which is the row's
 * list of verbs and the drag's pointer-free equivalent, and in the panel, where
 * they sit with the other things you do to an idea you have opened. Both were
 * asked for; they toggle the same links through the same mutations.
 *
 * Expansion is local state, not lifted. Which rows are open is a reading
 * posture rather than board state: nobody needs it after a reload, no other
 * component acts on it, and hoisting it would make TripBoard re-render every
 * row to remember one row's disclosure.
 *
 * Interaction: hover and press are opacity only, focus is the apricot ring,
 * there are no shadows. A selected row is bordered apricot — the same "this one"
 * accent the design uses for the row under the cursor's attention — and so is an
 * expanded one, which is the mockup's own choice and the same claim on
 * attention.
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
  canEdit = true,
}: IdeaRowProps) {
  const navigate = useNavigate();
  const { show } = useToast();
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const bundlesLabelId = useId();
  const vote = useVote(entry.id);
  const deleteVote = useDeleteVote(entry.id);
  const { addLink, removeLink } = useLinkMutations();
  // Disabled, not merely un-gripped: dnd-kit binds its listeners to whatever
  // element takes them, and a viewer with a keyboard would still be able to
  // start a drag that the server is only going to refuse.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `idea-${entry.id}`,
    data: { entryId: entry.id, title: entry.title },
    disabled: !canEdit,
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

  function isMember(bundleId: number): boolean {
    return (members.get(bundleId) ?? []).some((member) => member.id === entry.id);
  }

  // The same two mutations and the same two sentences as the ⋯ menu's chips,
  // because they are the same act — only reached from the other place.
  function toggleBundle(bundle: Entry) {
    if (isMember(bundle.id)) {
      removeLink.mutate(
        { parentId: bundle.id, childId: entry.id },
        { onSuccess: () => onToast?.(`Removed from ${bundle.title}. Still kept.`) },
      );
    } else {
      addLink.mutate(
        { parentId: bundle.id, childId: entry.id },
        { onSuccess: () => onToast?.(`Added to ${bundle.title}.`) },
      );
    }
  }

  // The sign is explicit on the positive side too, and 0 keeps none: "+5" is a
  // score where "5" could be a headcount, and "0" is genuinely the middle of
  // this scale rather than an absence of one.
  const score = `${entry.vote_tally.total > 0 ? '+' : ''}${entry.vote_tally.total}`;

  return (
    <div
      className={styles.row}
      data-selected={selected || undefined}
      data-expanded={expanded || undefined}
      data-dragging={isDragging || undefined}
    >
      <div className={styles.header}>
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
              // Picking is not opening. Without this the click carries on to
              // the row and the panel unfolds under the selection.
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

        {/*
          The big click target. It used to raise the edit drawer; it now opens the
          row, which is the smaller and reversible thing to do to someone who
          clicked a line of text. The score and the chevron ride inside it rather
          than beside it, so the whole width of the row is the disclosure — the
          number is what you came to read, and reaching for it should not be a
          different gesture from opening the thing it summarises.
        */}
        <button
          type="button"
          className={styles.main}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((open) => !open)}
        >
          <span className={styles.text}>
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
          </span>

          {/* The running total, closed or open. A tally nobody can see without
              opening five rows is not a group decision aid, so it stays in the
              header; the ballot that produced it is inside. The title attribute
              is the mockup's own gloss, and the only place the scale is spelled
              out on the closed row. */}
          <span className={styles.score} title="Everyone's votes added up, from +2 to -2 each">
            <span className={styles.scoreValue}>{score}</span>
            <span className={styles.scoreLabel}>group score</span>
          </span>

          {/* Decorative: aria-expanded above carries the state in words. Same
              rotation language as IdeaList's group headers. */}
          <ChevronDown
            size={18}
            strokeWidth={1.5}
            aria-hidden="true"
            className={[styles.chevron, expanded ? styles.chevronOpen : ''].filter(Boolean).join(' ')}
          />
        </button>

        {/*
          A viewer gets the row's words and none of its verbs. Not a greyed ⋯ and
          not a grip that refuses — an unlabelled handle that does nothing is
          worse than an absent one, and doc/architecture.md §5 will not let a
          control be greyed to mean "no". This guard deliberately stops here: the
          toggle above and the panel below are reading, not editing, and a viewer
          keeps both. What they find inside answers for itself — VoteBar prints
          the result instead of the ballot, IdeaTodos the list instead of the
          checkboxes.
        */}
        {canEdit && (
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
        )}
      </div>

      {/*
        The panel is a sibling of the toggle, never a child of it. Nesting it
        would make every click inside — a vote, a tick, a chip — bubble up to
        the toggle and shut the row on the person using it.

        Not rendered while closed rather than rendered hidden: IdeaTodos fetches
        on mount, and a board of forty rows would open with forty requests for
        lists nobody has asked to see.
      */}
      {expanded && (
        <div id={panelId} className={styles.panel}>
          {/* The mockup has one `note`; our model splits the same idea into a
              description and private notes, and both are worth reading here.
              The notes are muted because they are the aside, not the pitch. */}
          {entry.description && <p className={styles.body}>{entry.description}</p>}
          {entry.notes && <p className={[styles.body, styles.notes].join(' ')}>{entry.notes}</p>}

          <VoteBar
            myVote={entry.my_vote}
            tally={entry.vote_tally}
            entryTitle={entry.title}
            canVote={canEdit}
            // The optimistic write lives in useVote/useDeleteVote, so the stop
            // fills before the request lands; all this has to do is stop taking
            // a second answer while the first is in the air.
            onVote={(score) => vote.mutate(score, { onError: () => show(SAVE_FAILED, 'error') })}
            onClear={() => deleteVote.mutate(undefined, { onError: () => show(SAVE_FAILED, 'error') })}
            disabled={vote.isPending || deleteVote.isPending}
          />

          <IdeaTodos entryId={entry.id} canEdit={canEdit} />

          {canEdit ? (
            <div className={styles.section}>
              <p className={styles.sectionLabel} id={bundlesLabelId}>
                Add to bundle
              </p>
              {bundles.length === 0 ? (
                <p className={styles.empty}>No bundles yet. Start one in the bundles column.</p>
              ) : (
                <div className={styles.chips} aria-labelledby={bundlesLabelId}>
                  {bundles.map((bundle) => (
                    <Chip key={bundle.id} selected={isMember(bundle.id)} onClick={() => toggleBundle(bundle)}>
                      {bundle.title}
                    </Chip>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // A viewer gets the answer to "which bundles?" without a toggle
            // that would only refuse. The plum tag is the same one the header's
            // bundle line is written in, so the two agree at a glance.
            bundleNames.length > 0 && (
              <div className={styles.tags}>
                {bundleNames.map((name) => (
                  <Tag key={name} tone="saved">
                    {name}
                  </Tag>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
