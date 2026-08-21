import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { GripVertical, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import type { Entry } from '../../api/types';
import { CATEGORY_LABELS } from './filters';
import { Button } from '../../design/components/core/Button';
import { Chip, Tag } from '../../design/components/core/Chip';
import { useToast } from '../../components/Toast';
import { useArchiveEntry, useDeleteVote, useUpdateEntry, useVote } from '../../api';
import { IdeaComposer } from './IdeaComposer';
import type { IdeaComposerDraft } from './IdeaComposer';
import { IdeaTodos } from './IdeaTodos';
import { VoteBar } from './VoteBar';
import { subtreeIdeaIds } from './tree';
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
  /**
   * Every live idea on the trip. The edit form is what needs the whole set:
   * the names of this idea's current parents, and the ideas it could be filed
   * under instead — everything except itself and its own subtree, because an
   * idea inside its own descendant is a loop the board could never draw.
   */
  allIdeas: Entry[];
  /** Descend one level — show what lives inside this idea. */
  onDrill: (id: number) => void;
  /**
   * Whether this row is open. Expansion used to be local state; it is
   * controlled now because the board holds the open rows as a set — any number
   * can be open at once — and folds them all when the level changes, which no
   * single row can know on its own.
   */
  expanded: boolean;
  /** The click's meaning: asks the board to open this row, or close it again. */
  onToggleExpand: (id: number) => void;
  /**
   * Whether this row is the one under attention — the last open row the reader
   * opened or touched. Several rows can be `expanded`; at most one is
   * `focused`, and only the board can arbitrate which. Meaningless while
   * closed: the row only wears it (`data-focused`) when it is also open.
   */
  focused: boolean;
  /**
   * A press or a focus landed inside this row — asks the board to make it the
   * focused one. The row reports it only while open and not already focused,
   * so the board is never asked to restate what it already holds.
   */
  onFocusRow: (id: number) => void;
  /**
   * Which idea's card currently holds the composer; null = the top-of-list
   * instance. One board-wide value rather than a boolean per row, because
   * there is exactly one composer on the board at a time: naming its host is
   * what makes "open it here" also mean "close it wherever it was".
   */
  composerAt: number | null;
  /**
   * "Add an idea inside" was pressed on this row. The row asks; the board
   * moves the composer, exactly as it does for expansion and focus — a card
   * cannot know that opening a composer inside it must close one somewhere
   * else on the board.
   */
  onOpenComposerInside: (id: number) => void;
  /**
   * The inline composer committed. The draft goes straight up: creating the
   * idea and writing its parent links is the board's job here for the same
   * reason it is on the top-of-list composer — this row owns no create call,
   * only the edit of its own entry.
   */
  onComposerSubmit: (draft: IdeaComposerDraft) => void;
  /**
   * The inline composer was cancelled, or must be dismissed. The second case
   * is why this is not simply "cancelled": pressing Edit takes the whole card
   * for the edit form, so the row has to tell the board to let the composer
   * go rather than leave it hidden behind a form it would outlive.
   */
  onComposerCancel: () => void;
}

/**
 * One idea on the board: a card that carries its facts as pills — "✓ on a day"
 * when it is scheduled, one plum-wash pill saying what kind of idea it is and
 * how the votes stand ("Shopping · 👍 6"), "N inside ›" when other ideas nest
 * under it — and opens downwards into a panel where the idea can be read in
 * full and acted on.
 *
 * What the closed row no longer says: the meta line (place · duration · open
 * count). The redesign spends the closed row on the decisions the board is
 * actually for — is it planned, is it wanted, is there more underneath — and
 * everything descriptive moved into the panel one click away. The category is
 * the one word that stays: it rides in the plum pill, open or closed, beside
 * the tally it qualifies. The pills are words as well as colour, so nothing
 * rides on hue alone.
 *
 * Expansion is CONTROLLED, not local. It used to be `useState` here, on the
 * argument that a disclosure is a reading posture; the drill-down redesign
 * changed the terms — the board holds the open rows as a set (any number can
 * be open at once, because reading two ideas side by side is the point of
 * unfolding in place) and folds them all when the level changes, and only
 * TripBoard knows either of those things. So the row reports the click
 * (`onToggleExpand`) and obeys the prop (`expanded`), the same shape as
 * `selected`/`onToggleSelect` beside it. Focus follows the same shape: of the
 * open rows, the board names at most one as the FOCUSED one (`focused`), and
 * the row reports a press or a focus landing inside it (`onFocusRow`) so the
 * board can move that title to whichever open row the reader turns to.
 *
 * Drilling ("N inside ›") is the one click on this row that leaves it: it
 * descends into the idea's own list. The pill sits at the card's top right,
 * open or closed, and is the card's ONE drill affordance — it lives on a pill
 * rather than the row body so that the row's big target keeps the smaller,
 * reversible meaning: a click on a line of text opens the line of text, never
 * navigates.
 *
 * The open card's verbs sit on one line at the foot of the panel — Add to
 * plan, Add an idea inside, Edit, Move to Set aside — no overflow menu, no
 * verb further than one click. Editing swaps the card in place for the same
 * details form the capture bar's Tab opens (see IdeaComposer): local
 * `editing` state, because only this row can know its panel gave way to a
 * form, and it dies with the expansion — a closed row must never reopen
 * mid-edit.
 *
 * "Add an idea inside" opens that same composer BELOW the actions row, still
 * inside this card, with Inside already filled in with this idea. It is on
 * every open card, with or without children, because it is the only way to
 * put the first idea inside a childless one: "N inside ›" is derived from the
 * subtree, so a dead end draws no pill and has nothing to click. Which card
 * holds the composer is the board's to say (`composerAt`) — there is one
 * composer on the board and opening it here must close it wherever it was.
 *
 * The composer is a SIBLING of the actions row inside the panel, not a dialog
 * over the board and not a child of the row of buttons. Nesting it in the
 * flex row would make a form a wrapping flex item beside three buttons; a
 * dialog would take the answer to "inside what?" off the screen at the exact
 * moment it is being answered, and would cost a return trip to get back to
 * the card. Kept in place, the new idea is composed within the walls of the
 * idea it is going into, and nothing scrolls or moves under the hand.
 * Editing and the inline composer are mutually exclusive: the edit form
 * replaces the whole card, so pressing Edit dismisses the composer outright
 * (`onComposerCancel`) rather than hiding it behind a form.
 *
 * What is kept, and why:
 *   - The drag handle. Dragging an idea onto a plan is the core board gesture
 *     (`data: { entryId, title }` is what the plan drop targets read, and what
 *     TripBoard's onDragEnd turns into a link). Its pointer-free equivalent is
 *     the plan chips behind the panel's "Add to plan" button — every drag in
 *     Wend has one.
 *   - Multi-select, which is what `BulkBar` acts on — as a mode, taking the
 *     left slot. See the comment on the slot.
 *   - The plan chips, behind "Add to plan": they toggle the same links the
 *     drag writes, through the same mutations.
 *
 * Interaction: hover and press are opacity only, focus is the apricot ring,
 * there are no shadows. An open row thickens its border to the strong line so
 * open still reads as open, but with several rows open at once apricot cannot
 * mark them all — it is the design's "I'm here" edge, the same border the
 * capture bar and the composer wear, and "here" is one place. So only the
 * FOCUSED open row wears it (`data-focused`), and a selected row is bordered
 * apricot regardless: in select mode the picks are the attention.
 */
export function IdeaRow({
  entry,
  bundles,
  members,
  selectMode,
  selected,
  onToggleSelect,
  onToast,
  canEdit = true,
  insideCount,
  otherParents,
  allIdeas,
  onDrill,
  expanded,
  onToggleExpand,
  focused,
  onFocusRow,
  composerAt,
  onOpenComposerInside,
  onComposerSubmit,
  onComposerCancel,
}: IdeaRowProps) {
  const { show } = useToast();
  const panelId = useId();
  const plansLabelId = useId();
  const vote = useVote(entry.id);
  const deleteVote = useDeleteVote(entry.id);
  const updateEntry = useUpdateEntry(entry.id);
  const archiveEntry = useArchiveEntry();
  const { addLink, removeLink } = useLinkMutations();
  // Disabled, not merely un-gripped: dnd-kit binds its listeners to whatever
  // element takes them, and a viewer with a keyboard would still be able to
  // start a drag that the server is only going to refuse.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `idea-${entry.id}`,
    data: { entryId: entry.id, title: entry.title },
    disabled: !canEdit,
  });

  // The card has given way to the edit form. Local, unlike `expanded`, because
  // no one but this row cares that its panel is a form right now — and tied to
  // the expansion below, so a row the board closes comes back as a card.
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!expanded) setEditing(false);
  }, [expanded]);

  // The "Add to plan" popover in the panel's actions row: open/close state, a
  // click-away listener, and Escape handing focus back to the trigger.
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

  // The same two mutations and the same two sentences as a drag onto the rail,
  // because they are the same act — only reached without a pointer.
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

  /*
   * Editing: the card swaps in place for the same details form the capture
   * bar's Tab opens, seeded with this idea's facts. Everything below is
   * computed only on the branch that shows the form — a board of forty closed
   * rows must not walk forty subtrees per render.
   */
  if (expanded && editing && canEdit) {
    // Only parents the idea set can vouch for: `parent_ids` arrives unfiltered
    // (the trip entry, bundles — see tree.ts), and a parent the form cannot
    // name is not one it may offer to remove.
    const ideaIds = new Set(allIdeas.map((idea) => idea.id));
    const initialParentIds = entry.parent_ids.filter((id) => ideaIds.has(id));
    // Not itself, and nothing beneath it: filing an idea inside its own
    // subtree would make a loop out of the drill-down.
    const subtree = subtreeIdeaIds(allIdeas, entry.id);
    const parentChoices = allIdeas.filter((idea) => idea.id !== entry.id && !subtree.has(idea.id));

    // No category stays no category. The chips can all be unlit now, so an
    // idea kept without one is no longer quietly given 'place' by the form
    // that came to fix its name — `category` rides the draft through to the
    // PATCH, which has always taken null.
    //
    // The entry write first, then the link diff in parallel — the links need
    // nothing from the PATCH, but a failed title save with moved parents would
    // be half an edit. Any failure lands on the house sentence and STAYS in
    // the form: what was typed survives to be tried again.
    const save = async (draft: IdeaComposerDraft) => {
      try {
        await updateEntry.mutateAsync({
          entry: {
            title: draft.title,
            description: draft.description || null,
            address: draft.address || null,
            category: draft.category,
          },
        });
        await Promise.all([
          ...draft.parentIds
            .filter((id) => !initialParentIds.includes(id))
            .map((parentId) => addLink.mutateAsync({ parentId, childId: entry.id })),
          ...initialParentIds
            .filter((id) => !draft.parentIds.includes(id))
            .map((parentId) => removeLink.mutateAsync({ parentId, childId: entry.id })),
        ]);
        setEditing(false);
        onToast?.('Saved.');
      } catch {
        show(SAVE_FAILED, 'error');
      }
    };

    return (
      <IdeaComposer
        open
        initialTitle={entry.title}
        initialDescription={entry.description ?? ''}
        initialAddress={entry.address ?? ''}
        initialCategory={entry.category ?? null}
        initialParentIds={initialParentIds}
        parentChoices={parentChoices}
        submitLabel="Save"
        onSubmit={save}
        onCancel={() => setEditing(false)}
      />
    );
  }

  // Any press or focus landing anywhere in an open row claims the apricot
  // edge for it. Capture-phase, so a click on a vote stop or a to-do tick
  // counts as turning to this row without any child needing to know. Guarded
  // on `!focused` so an already-focused row never re-reports itself — the
  // board is only ever told something it does not already hold, which is also
  // what keeps this from looping.
  const claimFocus = () => {
    if (expanded && !focused) onFocusRow(entry.id);
  };

  return (
    <div
      className={styles.row}
      data-entry-id={entry.id}
      data-selected={selected || undefined}
      data-expanded={expanded || undefined}
      data-focused={(expanded && focused) || undefined}
      data-dragging={isDragging || undefined}
      onPointerDownCapture={claimFocus}
      onFocusCapture={claimFocus}
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
          plan chips behind the open row's "Add to plan" — is untouched while
          picking, and the handle returns the moment select mode ends.

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
            {/* Jade writes, it never fills: "on a day" is a confirmation, so it
                takes the feedback green as words, not as a box. */}
            {entry.scheduled && <span className={styles.onDay}>✓ on a day</span>}
          </span>
          {otherParents.length > 0 && (
            <span className={styles.alsoIn}>also in: {otherParents.join(' · ')}</span>
          )}
        </button>

        {/* Category and appetite in one plum-wash pill — "Shopping · 👍 6" —
            open or closed, so it meets the VoteBar's plum pills when the panel
            unfolds. Plum because a vote marks appetite for a destination, and
            words beside the number so the row can be scanned without a legend.
            Zero votes draws no number (a scoreboard on an idea nobody has
            judged), just the category word; no category and no votes draws no
            pill at all. */}
        {(entry.category !== null || entry.vote_tally.total !== 0) && (
          <span className={styles.votePill} title="Everyone's votes added up, from +2 to -2 each">
            {entry.category !== null && CATEGORY_LABELS[entry.category]}
            {entry.vote_tally.total !== 0 && (
              <>
                {entry.category !== null && <span aria-hidden="true">·</span>}
                {entry.vote_tally.total > 0 ? (
                  <ThumbsUp size={14} strokeWidth={2} aria-hidden="true" />
                ) : (
                  <ThumbsDown size={14} strokeWidth={2} aria-hidden="true" />
                )}
                {entry.vote_tally.total}
              </>
            )}
          </span>
        )}

        {/* The card's one drill affordance, at its top-right corner, open or
            closed. Stops its own propagation so descending never also unfolds
            (or folds) the row it leaves. */}
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
            The verbs, gathered on one line at the foot of the panel — every
            one of them, since the overflow menu is gone. A viewer gets the
            row's words and none of its verbs — not a greyed row, just no row —
            and keeps the answer to "which plans?" as tags, the same plum the
            plan names are written in everywhere else.
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

              {/* The only way to put the first idea inside this one, so it is
                  offered whether or not anything is inside already: the
                  "N inside ›" pill is derived from the subtree, and a
                  childless idea draws none. It opens the composer below,
                  inside this card — see the component comment for why it
                  belongs there rather than in a dialog. */}
              <Button
                variant="quiet"
                size="small"
                onClick={() => onOpenComposerInside(entry.id)}
              >
                Add an idea inside
              </Button>

              <Button
                variant="quiet"
                size="small"
                onClick={() => {
                  // The edit form replaces the whole card, composer included.
                  // Dismissed rather than left standing, or it would vanish
                  // without being cancelled and then reappear, half-typed,
                  // the moment the edit ended.
                  if (composerAt === entry.id) onComposerCancel();
                  setEditing(true);
                }}
              >
                Edit
              </Button>

              {/* Set aside, never delete — SetAsideSection at the foot of the
                  board is the way back, on the same screen as the way out. The
                  label names that list rather than the motion, so the way back
                  is already in the words on the way out. */}
              <Button
                variant="quiet"
                size="small"
                onClick={() =>
                  archiveEntry.mutate(entry.id, {
                    onSuccess: () => show('Set aside.', 'success'),
                    onError: () => show(SAVE_FAILED, 'error'),
                  })
                }
              >
                Move to Set aside
              </Button>
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

          {/*
            The composer, when this card is the one holding it: below the
            verbs, inside the panel, a sibling of the actions row rather than
            a fourth item wrapping around inside it.

            `parentChoices` is the WHOLE idea set, unfiltered — unlike the
            edit form above, which must cut out the entry's own subtree. An
            idea that does not exist yet has no descendants, so every idea on
            the trip is a legal parent for it; `initialParentIds` merely
            starts it inside this one.

            `hostTitle` is what makes it read as belonging to this card (the
            "NEW IDEA INSIDE <host>" heading and the nested paper surface),
            and `trimmed` opens it at Name and Short description with the rest
            a click away — nesting an idea should cost about what typing its
            name costs. The composer takes its own focus, so the card does not
            move under the hand.
          */}
          {canEdit && composerAt === entry.id && (
            <IdeaComposer
              open
              hostTitle={entry.title}
              trimmed
              initialTitle=""
              initialParentIds={[entry.id]}
              parentChoices={allIdeas}
              allIdeas={allIdeas}
              onSubmit={onComposerSubmit}
              onCancel={onComposerCancel}
            />
          )}
        </div>
      )}
    </div>
  );
}
