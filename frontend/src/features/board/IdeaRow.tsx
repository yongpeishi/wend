import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { useNavigate } from 'react-router-dom';
import type { Entry, EntryCategory } from '../../api/types';
import { CATEGORY_LABELS } from './filters';
import { Button } from '../../design/components/core/Button';
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
   * The board is picking several ideas at once. The row's left slot swaps its
   * drag handle for the pick circle — see the comment on the slot for why the
   * two share one place rather than sitting side by side.
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
  /**
   * How many ideas live inside this one — the subtree the board computed from
   * `parent_ids`. Zero for a leaf, and zero draws no pill: "0 inside" is not a
   * fact worth a control that goes nowhere.
   */
  insideCount: number;
  /**
   * The titles of this idea's OTHER parents — every parent except the level the
   * list is currently showing. Names, not entries, because the row only says
   * them ("also in: A · B"); the board is the one that knows which parent is
   * "here" and so which ones are "also".
   */
  otherParents: string[];
  /** Descend one level — show what lives inside this idea. */
  onDrill: (id: number) => void;
  /**
   * Whether this row is the open one. Expansion used to be local state; it is
   * controlled now because the board opens at most one row at a time, and only
   * the board can know which one that is.
   */
  expanded: boolean;
  /** The click's meaning: asks the board to open this row, or close it again. */
  onToggleExpand: (id: number) => void;
}

/**
 * Category colour — decoration on the open row's category chip. The
 * mapping is lifted verbatim from the design prototype's `CAT_COLOR` table,
 * which reaches for existing brand tokens rather than new hexes — so nothing
 * is invented here either. Two categories deliberately share a colour (place
 * and activity are both leaf), and transport/other fall back to `--text-muted`:
 * the palette is three brand hues wide, not six, and stretching it would mean
 * minting colours the design system has never sanctioned.
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
 * One idea on the board: a card that carries its facts as pills while closed —
 * "✓ on a day" when it is scheduled, "▲ N" when anyone has voted, "N inside ›"
 * when other ideas nest under it — and opens downwards into a panel where the
 * idea can be read in full and acted on.
 *
 * What the closed row no longer says: the meta line (place · duration · open
 * count) and the category word. The redesign spends the closed row on the
 * decisions the board is actually for — is it planned, is it wanted, is there
 * more underneath — and everything descriptive moved into the panel one click
 * away. The pills are words as well as colour, so nothing rides on hue alone.
 *
 * Expansion is CONTROLLED, not local. It used to be `useState` here, on the
 * argument that a disclosure is a reading posture; the drill-down redesign
 * changed the terms — the board opens at most one row at a time and closes it
 * when the level changes, and only TripBoard knows either of those things. So
 * the row reports the click (`onToggleExpand`) and obeys the prop (`expanded`),
 * the same shape as `selected`/`onToggleSelect` beside it.
 *
 * Drilling ("N inside ›", and "Open N inside" in the panel) is the one click
 * on this row that leaves it: it descends into the idea's own list. It lives
 * on a pill rather than the row body so that the row's big target keeps the
 * smaller, reversible meaning — a click on a line of text opens the line of
 * text, never navigates.
 *
 * What is kept, and why:
 *   - The drag handle. Dragging an idea onto a plan is the core board gesture
 *     (`data: { entryId, title }` is what the plan drop targets read, and what
 *     TripBoard's onDragEnd turns into a link). Its pointer-free equivalent is
 *     the plan list inside the ⋯ menu — every drag in Wend has one.
 *   - Multi-select, which is what `BulkBar` acts on — as a mode, taking the
 *     left slot. See the comment on the slot.
 *   - Set aside and Edit, in the ⋯ menu, which sits at the open row's top
 *     right: every verb the row owns arrives with the panel, and the closed
 *     row stays a thing you read, drag, or pick.
 *   - The plan chips, twice — behind the panel's "Add to plan" button and in
 *     the ⋯ menu. Both were asked for; they toggle the same links through the
 *     same mutations.
 *
 * Interaction: hover and press are opacity only, focus is the apricot ring,
 * there are no shadows. A selected row is bordered apricot; an open row takes
 * the 2px leaf border — the design's "this card is active" edge.
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
  insideCount,
  otherParents,
  onDrill,
  expanded,
  onToggleExpand,
}: IdeaRowProps) {
  const navigate = useNavigate();
  const { show } = useToast();
  const panelId = useId();
  const plansLabelId = useId();
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

  // The "Add to plan" popover in the panel's actions row. Open/close state and
  // the two listeners are the same shape as IdeaActionsMenu's, for the same
  // reasons — see the comments there.
  const [plansOpen, setPlansOpen] = useState(false);
  const plansRef = useRef<HTMLDivElement>(null);
  const plansTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!plansOpen) return;
    function onDocPointerDown(event: MouseEvent) {
      if (plansRef.current && !plansRef.current.contains(event.target as Node)) setPlansOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setPlansOpen(false);
      plansTriggerRef.current?.focus();
    }
    document.addEventListener('mousedown', onDocPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [plansOpen]);

  // A closed row cannot keep a popover; without this, closing the panel with
  // the popover up would reopen the panel with the popover already showing.
  useEffect(() => {
    if (!expanded) setPlansOpen(false);
  }, [expanded]);

  function edit() {
    if (onEdit) onEdit(entry.id);
    else navigate(`/entries/${entry.id}`);
  }

  // The plan names for a viewer's tags. Derived from the plan membership
  // TripBoard already loads for the drag targets — no extra request.
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

  return (
    <div
      className={styles.row}
      data-selected={selected || undefined}
      data-expanded={expanded || undefined}
      data-dragging={isDragging || undefined}
    >
      <div className={styles.header}>
        {/*
          One slot, two controls, never both. Out of select mode this is the
          drag handle; in select mode it is the 22px pick circle, and that
          swap IS how the board says it is in a different mode — no banner, no
          row of ghost checkboxes waiting to be used.

          Why the grip goes away while picking rather than shuffling aside:
          the two gestures both start with a press on a row, and dnd-kit reads
          a press-and-move as the start of a drag. Leaving the handle in reach
          of someone shift-clicking their way down a list is an invitation to
          drag an idea onto a plan by accident, mid-selection. Picking is
          also the mode's whole point, so it takes the mode's one slot.

          The two are different elements rather than one element wearing two
          hats, because they are genuinely different things to assistive tech.
          Rendering a `role="checkbox"` that is not operable, or a handle that
          claims to be checkable, would be a lie in one direction or the other.
          Nothing is lost by the swap: the drag's pointer-free equivalent — the
          plan list in the ⋯ menu — is untouched while picking, and the
          handle returns the moment select mode ends.

          A <button role="checkbox"> rather than <input type="checkbox">: the
          visual is a filled circle with a tick, which no native checkbox will
          render without being hidden and redrawn anyway, and the shift-click
          range gesture needs the modifier off a click event. Space and Enter
          both activate a button, so the keyboard contract is intact.

          A viewer gets neither: no pick circle, because a viewer is never
          given select mode, and no grip, because an unlabelled handle that
          refuses is worse than an absent one (doc/architecture.md §5 will not
          let a control be greyed to mean "no"). Their rows simply start at the
          title, which is consistent down the whole board.
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
          canEdit && (
            <button
              type="button"
              ref={setNodeRef}
              {...listeners}
              {...attributes}
              className={[styles.gripSlot, styles.grip].join(' ')}
              aria-label={`Drag ${entry.title} onto a plan to add it there`}
            >
              <GripVertical size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>
          )
        )}

        {/*
          The big click target: the title, the schedule tick, and — when the
          idea belongs elsewhere too — the "also in" chip. Clicking it opens
          the row, which is the smaller and reversible thing to do to someone
          who clicked a line of text; the pills that go somewhere else sit
          OUTSIDE this button, because a button inside a button is invalid and
          a click that leaves the row must never share a target with one that
          only unfolds it.
        */}
        <button
          type="button"
          className={styles.main}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => onToggleExpand(entry.id)}
        >
          <span className={styles.titleLine}>
            <span className={styles.title}>{entry.title}</span>
            {/* The category stays beside the title while the row is open — it
                qualifies the name, so it reads as part of it rather than as a
                fact filed lower down. The closed row still says nothing
                descriptive, so the chip arrives with the panel. */}
            {expanded && entry.category && (
              <span className={[styles.categoryChip, CATEGORY_CLASS[entry.category]].join(' ')}>
                {CATEGORY_LABELS[entry.category]}
              </span>
            )}
            {/* Jade writes, it never fills: "on a day" is a confirmation, so it
                takes the feedback green as words, not as a box. */}
            {entry.scheduled && <span className={styles.onDay}>✓ on a day</span>}
          </span>
          {otherParents.length > 0 && (
            <span className={styles.alsoIn}>also in: {otherParents.join(' · ')}</span>
          )}
        </button>

        {/* The tally, when there is one. Plum because a vote marks appetite for
            a destination, and a pill of words rather than a bare number so the
            closed row can be scanned without a legend. Zero draws nothing:
            "▲ 0" would put a scoreboard on ideas nobody has judged yet. */}
        {entry.vote_tally.total > 0 && (
          <span className={styles.votePill} title="Everyone's votes added up, from +2 to -2 each">
            ▲ {entry.vote_tally.total}
          </span>
        )}

        {/* The one click on the closed row that goes somewhere else. Stops its
            own propagation so descending never also unfolds the row it leaves. */}
        {insideCount > 0 && (
          <button
            type="button"
            className={styles.insidePill}
            onClick={(event) => {
              event.stopPropagation();
              onDrill(entry.id);
            }}
          >
            {insideCount} inside ›
          </button>
        )}

        {/* The ⋯ menu holds the open row's verbs, at the card's top right —
            the corner every card in this product keeps its overflow in. It is
            a sibling of the disclosure, so opening it never also closes the
            row, and its popup is already right-anchored. Arrives with the
            panel: the closed row stays a thing you read, drag, or pick. */}
        {expanded && canEdit && (
          <IdeaActionsMenu
            entry={entry}
            bundles={bundles}
            members={members}
            onEdit={edit}
            onToast={onToast}
          />
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

          {/* Data tracking, because an address is read character by character. */}
          {entry.address && <p className={styles.address}>{entry.address}</p>}

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

          {/*
            The verbs, gathered on one line now that the row has an inside to
            keep them in. A viewer gets the row's words and none of its verbs —
            not a greyed row, just no row — and keeps the answer to "which
            plans?" as tags, the same plum the plan names are written in
            everywhere else.
          */}
          {canEdit ? (
            <div className={styles.actionsRow}>
              <div className={styles.plansWrap} ref={plansRef}>
                <Button
                  ref={plansTriggerRef}
                  size="small"
                  aria-haspopup="true"
                  aria-expanded={plansOpen}
                  onClick={() => setPlansOpen((value) => !value)}
                >
                  Add to plan
                </Button>
                {plansOpen && (
                  <div className={styles.plansMenu} role="group" aria-labelledby={plansLabelId}>
                    <p className={styles.sectionLabel} id={plansLabelId}>
                      Add to plan
                    </p>
                    {bundles.length === 0 ? (
                      <p className={styles.empty}>No plans yet. Start one in the plans column.</p>
                    ) : (
                      <div className={styles.chips}>
                        {bundles.map((bundle) => (
                          <Chip
                            key={bundle.id}
                            selected={isMember(bundle.id)}
                            onClick={() => toggleBundle(bundle)}
                          >
                            {bundle.title}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* The panel's road down, beside the pill's — same destination,
                  reachable once the row is already open and the pill is a
                  scroll away. */}
              {insideCount > 0 && (
                <Button variant="quiet" size="small" onClick={() => onDrill(entry.id)}>
                  Open {insideCount} inside
                </Button>
              )}
            </div>
          ) : (
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
