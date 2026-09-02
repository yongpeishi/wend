import { useEffect, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ChevronDown, ChevronUp, CircleDashed, GripVertical, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/layout/Card';
import { Input } from '../../design/components/core/Input';
import { useToast } from '../../components/Toast';
import { useCanEdit } from '../../auth/TripRoleContext';
import {
  useArchiveEntry,
  useCreateEntry,
  useCreateLink,
  useDeleteLink,
  usePendingLinkChildIds,
  useReorderLinks,
  useUpdateEntry,
} from '../../api';
import type { Entry } from '../../api/types';
import { useLinkMutations } from './useLinkMutations';
import {
  applyInsertion,
  insertionIndexFromPointer,
  isNoopInsertion,
  landingIndex,
  stepInsertion,
} from './reorderPreview';
import type { InsertionIndex } from './reorderPreview';
import styles from './BundleCard.module.css';

const SAVE_FAILED = "That didn't save. It's still here — try again.";

/**
 * A member reorder in progress — by pointer (native drag) or by the keyboard
 * grip. `fromId` rather than an index because the list can re-render under a
 * drag (a refetch settling, a sibling's optimistic move) and the row is looked
 * up by id at each step. `insertAt` is a gap in reorderPreview's sense: 0 is
 * above the first row, `members.length` below the last.
 */
interface DragState {
  fromId: number;
  insertAt: InsertionIndex | null;
  mode: 'pointer' | 'keyboard';
}

export interface BundleCardProps {
  bundle: Entry;
  /**
   * The trip this plan belongs to. The card needs it for exactly one write:
   * an idea born from the foot's "+ add idea" field is created under the trip
   * (like every idea) and only then linked into this bundle.
   */
  tripId: number;
  /** Bundle members in entry_links.position order — see useBundleMembers.ts. */
  members: Entry[];
  /**
   * Take the board to a member idea — it scrolls to the idea's row and opens
   * it. Omitted, the card falls back to navigating.
   */
  onOpen?: (id: number) => void;
  onToast: (message: string) => void;
}

/**
 * A bucket of ideas that goes together. Also the drop target: dropping an
 * idea here copies the link (TripBoard's onDragEnd creates a new link, never
 * removes the old one), so an idea can sit in many bundles at once.
 *
 * The card is deliberately quiet content, not a toolbar. The row of five
 * bundle actions that used to sit at its foot — rename, fork, compare,
 * ungroup, set aside — is gone, and with it the "N kept" tag: in a 420px rail
 * five buttons per card meant the rail read as controls with some names
 * attached rather than as the bundles themselves. What survives is what the
 * card is FOR (the name, the members, their order) plus the edits a bundle
 * actually needs, all reachable without leaving the card:
 *
 *   The name is the control. Click or focus it and it becomes a real input in
 *   place — Enter or blur commits, Escape reverts, and an empty or
 *   whitespace-only name is refused rather than saved, because a nameless
 *   bundle is unfindable in a rail of them. No modal: renaming is a one-field
 *   edit of something already on screen, and covering the board to make it is
 *   more ceremony than the edit is worth.
 *
 *   The X at the top right removes the bundle. It closes the header rather
 *   than opening it: this is the strongest verb on the card, and a rail where
 *   every card leads with a delete control puts both the eye and the Tab order
 *   on the destructive thing before either has read what the bundle is called.
 *   Top right is also simply where a card's dismiss control is looked for.
 *   There is no destroy endpoint in this product and there should not be:
 *   "removing" here unlinks every member first and then archives the bundle
 *   entry, so every idea lands back in the idea list intact and the bundle
 *   itself is still recoverable from the rail's SetAsideSection. The unlinking
 *   is awaited before the archive so a failure part-way leaves a bundle that
 *   still holds its ideas, rather than an archived shell with orphaned links.
 *   Nothing in Wend is destroyed; the strongest verb here is still reversible.
 *
 *   The "+ add idea" foot is a real control now. It started life as plain
 *   text — a hint at the drag and "Add to plan" gestures — because the card
 *   had no add-member write of its own; it has one today, so the text keeps
 *   its promise: click it and it swaps in place for a name field, exactly the
 *   bargain the rename above strikes. Enter creates the idea under the trip
 *   and then links it into this plan; Escape puts the hint back; a blank name
 *   is refused by simply closing the field, the same answer the rename field
 *   gives one. The two writes are sequential and awaited — the link needs the
 *   new idea's id — and a failure at either step keeps the field open with the
 *   name still in it, so "It's still here — try again" stays literally true.
 *
 * Members reorder three ways, per screens.md's "every drag interaction needs a
 * keyboard and pointer-free equivalent", and every one of them ends in the
 * same single write — useReorderLinks posts the whole new order at once, so
 * the row moves on screen the moment the gesture ends and slides back (with
 * the house error toast) only if the server refuses:
 *
 *   Native HTML5 drag-and-drop on each row, the accelerator. While a row is
 *   held, a 2px line shows the gap it will land in — the upper half of the row
 *   under the pointer means "above it", the lower half "below" — so the answer
 *   to "where will this end up?" is on screen before the drop, not after the
 *   round trip. The held row stays in place at reduced opacity so the list
 *   keeps its shape.
 *
 *   The grip at the head of each row is the keyboard path to the same
 *   preview: Space (or Enter) lifts the row, the arrows step it through the
 *   gaps with the same line following, Space drops it, Escape (or focus
 *   leaving the grip) puts it back without a request. A polite live region
 *   reads out where it will land after every step.
 *
 *   Move up / Move down are the buttons that always work — mouse, keyboard or
 *   switch device — for anyone who does not want to hold anything.
 *
 * The gap maths for all three live in reorderPreview.ts. While the save is
 * out, the moved row fades (usePendingLinkChildIds) rather than the plan
 * freezing or a spinner appearing; it lifts back to full when the server
 * agrees. Remove unlinks one member (useDeleteLink) — it must never archive or
 * touch the idea itself, only the entry_links row.
 *
 * The design's card carries state our model does not have, so every part of it
 * that looks like metadata is derived from a real serialized field rather than
 * invented:
 *
 *   The header meta. The approved mockup's right-hand header slot holds the
 *   idea count — "3 ideas", right-aligned and muted beside the name. An empty
 *   plan says "Empty so far" rather than "0 ideas": in a rail where every card
 *   speaks, a zero is a tally and this is a state, and it is the state the
 *   hint below exists to fix.
 *
 *   The open-to-dos line. Under the name: the members' open to-dos summed, as
 *   "N open to-dos" beside a small dashed-circle mark — an unfinished ring for
 *   unfinished work. The line was retired once in favour of the per-member
 *   labels alone, and the product owner has brought it back, so the card now
 *   says both: the total up here, and which members own it below. Zero renders
 *   too, as "0 open to-dos" — in a rail where some cards speak and some stay
 *   silent, "nothing outstanding" is a real answer about a plan, not an
 *   absence, and it is the answer you most want to see. The icon is
 *   aria-hidden decoration on the phrase; the words are one text node, so the
 *   line is one phrase to a screen reader and one thing to assert on in a
 *   test.
 *
 *   The member dot. The design colours a dot per item from a state enum we
 *   don't have. It uses `address`: solid leaf for a member that has one,
 *   hollow (line-strong ring) for one that doesn't — the same "is this a real
 *   place yet" question the map asks. Colour is never the only carrier — each
 *   dot ships a visually-hidden phrase so the state is readable without it.
 *
 *   The member to-do label. A member holding open to-dos says "2 to-dos" in
 *   plum just left of its row actions, so the total in the line above can be
 *   traced to the ideas that own it without opening anything. Members
 *   with nothing outstanding carry no label at all — here a
 *   mark on the exceptions beats a column of zeroes, because the reader is
 *   scanning for which row to deal with, not tallying. It is the only coloured
 *   text in the row, which is what makes it read as an annotation on the idea
 *   rather than a status the idea is in.
 *
 * A member's name opens it, and when the board offers `onOpen` it opens ON
 * the board rather than by navigating to /entries/:id: the list drills to the
 * idea's level, scrolls to its row and unfolds it, focused. Two things depend
 * on staying put: the reader keeps the page they were reading — the answer to
 * "where does this idea live?" is shown as the board standing on that level,
 * not told in a dialog over it — and the member stays inside the trip's
 * TripRoleProvider, where a viewer's row is read-only; off the board the
 * editable default applies and a viewer would be handed the form. The prop is
 * `onOpen` rather than `onEdit` because that is all it promises: a viewer
 * opens a member and gets the row without its verbs. Without the prop the
 * card still navigates, which is what a card outside a board — the design
 * gallery, its own tests — has to do, since there is no idea list there to
 * land on.
 */
export function BundleCard({ bundle, tripId, members, onOpen, onToast }: BundleCardProps) {
  const navigate = useNavigate();
  // The hook rather than a prop: unlike IdeaRow this card takes none of its
  // verbs from its caller — it owns its own mutations — so the capability comes
  // from the same tree the mutations do.
  const canEdit = useCanEdit();
  const { show } = useToast();
  const archiveEntry = useArchiveEntry();
  const updateEntry = useUpdateEntry(bundle.id);
  const { removeLink } = useLinkMutations();
  const createEntry = useCreateEntry();
  const createLink = useCreateLink(bundle.id);
  const deleteLink = useDeleteLink(bundle.id);
  const reorderLinks = useReorderLinks(bundle.id);
  const pendingIds = usePendingLinkChildIds(bundle.id);
  // The reorder in progress, held twice: state for rendering, and a ref the
  // handlers read and write synchronously. dragover fires many times a second
  // and the drop can follow the last one before React has flushed it, so the
  // commit must not depend on a closure over the last rendered state.
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  // What the live region says. Only the keyboard path speaks — a pointer user
  // is looking at the line — and it is empty whenever nothing is held.
  const [liveText, setLiveText] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(bundle.title);
  const [addingIdea, setAddingIdea] = useState(false);
  const [ideaDraft, setIdeaDraft] = useState('');
  const nameButtonRef = useRef<HTMLButtonElement>(null);
  const addIdeaButtonRef = useRef<HTMLButtonElement>(null);
  // Set only by the key paths (Enter/Escape), never by blur: a blur commit
  // means the user has already moved on — pulling focus back to the name
  // would trap anyone Tabbing out of the card.
  const returnFocus = useRef(false);
  // The add-idea field strikes the same bargain for the "+ add idea" button.
  const returnFocusToAdd = useRef(false);
  // A read-only card is not a drop target. Styling alone would not stop it:
  // dnd-kit resolves a drop against every registered droppable, so without this
  // a viewer could still land an idea here and watch the request be refused.
  const { setNodeRef, isOver } = useDroppable({
    id: `bundle-${bundle.id}`,
    data: { bundleId: bundle.id, title: bundle.title },
    disabled: !canEdit,
  });

  useEffect(() => {
    if (!editingName && returnFocus.current) {
      returnFocus.current = false;
      nameButtonRef.current?.focus();
    }
  }, [editingName]);

  useEffect(() => {
    if (!addingIdea && returnFocusToAdd.current) {
      returnFocusToAdd.current = false;
      addIdeaButtonRef.current?.focus();
    }
  }, [addingIdea]);

  // One string rather than assembled in JSX, so the meta is a single text node:
  // one phrase to a screen reader, and one thing to assert on in a test.
  const meta = members.length === 0 ? 'Empty so far' : `${members.length} idea${members.length === 1 ? '' : 's'}`;

  // The members' outstanding work, summed for the line under the name. One
  // string for the same reason as `meta`: one phrase, one assertion.
  const openTodos = members.reduce((total, member) => total + member.todos_open_count, 0);
  const todoLine = `${openTodos} open ${openTodos === 1 ? 'to-do' : 'to-dos'}`;

  function startEditingName() {
    setNameDraft(bundle.title);
    setEditingName(true);
  }

  function commitName() {
    setEditingName(false);
    const trimmed = nameDraft.trim();
    // A blank name is refused, not saved: the previous title stands and the
    // field simply closes, so nothing is lost and nothing needs explaining.
    if (!trimmed || trimmed === bundle.title) {
      setNameDraft(bundle.title);
      return;
    }
    updateEntry.mutate(
      { entry: { title: trimmed } },
      {
        onSuccess: () => onToast(`Renamed to ${trimmed}.`),
        onError: () => {
          setNameDraft(bundle.title);
          show(SAVE_FAILED, 'error');
        },
      },
    );
  }

  function cancelName() {
    setNameDraft(bundle.title);
    setEditingName(false);
  }

  /**
   * "Delete" without a delete endpoint — and without wanting one. Every member
   * link goes first (the ideas themselves are untouched, so they are back in
   * the idea list), then the bundle entry is archived, which leaves it sitting
   * in the rail's set-aside disclosure if this was a mistake.
   */
  async function removeBundle() {
    const count = members.length;
    try {
      await Promise.all(members.map((member) => removeLink.mutateAsync({ parentId: bundle.id, childId: member.id })));
      await archiveEntry.mutateAsync(bundle.id);
    } catch {
      show(SAVE_FAILED, 'error');
      return;
    }
    onToast(
      count === 0
        ? `Removed ${bundle.title}. It's set aside if you want it back.`
        : `Removed ${bundle.title}. ${count} idea${count === 1 ? '' : 's'} back in your list.`,
    );
  }

  /** The one write every reorder path ends in. No success toast: the row moving is the confirmation. */
  function sendOrder(next: Entry[], movedId: number) {
    reorderLinks.mutate(
      { childIds: next.map((m) => m.id), movedId },
      { onError: () => show(SAVE_FAILED, 'error') },
    );
  }

  function moveMember(index: number, direction: -1 | 1) {
    const moving = members[index];
    const target = index + direction;
    if (!moving || target < 0 || target >= members.length) return;
    // In gap terms: up is the gap above the row before this one, down is the
    // gap below the row after it. One request for the whole order, the same
    // as a drop — not a swap of two positions racing each other.
    sendOrder(applyInsertion(members, index, direction === -1 ? index - 1 : index + 2), moving.id);
  }

  function updateDrag(next: DragState | null) {
    dragRef.current = next;
    setDrag(next);
  }

  function cancelDrag() {
    updateDrag(null);
    setLiveText('');
  }

  function announceLanding(title: string, from: number, insertAt: InsertionIndex) {
    setLiveText(
      `Moving ${title}. Will land at ${landingIndex(from, insertAt) + 1} of ${members.length}. Space to drop, Escape to cancel.`,
    );
  }

  /**
   * Ends a drag from either path: reads the state, clears it, and posts the
   * new order once — or nothing at all when the row is going back where it
   * came from, since a request that changes nothing still fades the row and
   * still has a way to fail.
   */
  function commitReorder() {
    const current = dragRef.current;
    updateDrag(null);
    if (!current || current.insertAt === null) return;
    const from = members.findIndex((m) => m.id === current.fromId);
    if (from === -1 || isNoopInsertion(from, current.insertAt)) {
      if (current.mode === 'keyboard') setLiveText('');
      return;
    }
    if (current.mode === 'keyboard') {
      setLiveText(`Moved ${members[from]?.title ?? ''} to ${landingIndex(from, current.insertAt) + 1} of ${members.length}.`);
    }
    sendOrder(applyInsertion(members, from, current.insertAt), current.fromId);
  }

  function startPointerDrag(event: DragEvent<HTMLLIElement>, member: Entry, index: number) {
    // jsdom has no DataTransfer, hence the guard. Firefox will not start a
    // native drag that carries no data, hence the setData.
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(member.id));
    }
    updateDrag({ fromId: member.id, insertAt: index, mode: 'pointer' });
  }

  function pointerOverRow(event: DragEvent<HTMLLIElement>, index: number) {
    // Always allowed, as before: a native drop of anything onto a row must
    // never be left to the browser, which would navigate. The line, though,
    // follows only a pointer drag of one of this list's own rows — an idea
    // coming over from the list rides dnd-kit, not native DnD, and never
    // reaches here.
    event.preventDefault();
    const current = dragRef.current;
    if (!current || current.mode !== 'pointer') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const insertAt = insertionIndexFromPointer(index, event.clientY - rect.top, rect.height);
    if (insertAt !== current.insertAt) updateDrag({ ...current, insertAt });
  }

  /**
   * The grip's whole keyboard surface. Space or Enter lifts, and drops when
   * already lifted; the arrows step the landing gap; Escape puts the row back.
   * Every handled key is prevented: Space would otherwise click the button on
   * keyup and the arrows would scroll the page.
   */
  function gripKeyDown(event: KeyboardEvent<HTMLButtonElement>, member: Entry, index: number) {
    const current = dragRef.current;
    const lifted = current?.mode === 'keyboard' && current.fromId === member.id;
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (lifted) {
        commitReorder();
      } else {
        updateDrag({ fromId: member.id, insertAt: index, mode: 'keyboard' });
        announceLanding(member.title, index, index);
      }
      return;
    }
    if (!lifted || !current || current.insertAt === null) return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const insertAt = stepInsertion(index, current.insertAt, event.key === 'ArrowUp' ? -1 : 1, members.length);
      updateDrag({ ...current, insertAt });
      announceLanding(member.title, index, insertAt);
    } else if (event.key === 'Escape') {
      // Ours to cancel, not a panel's to close.
      event.preventDefault();
      event.stopPropagation();
      cancelDrag();
    }
  }

  // Where the line goes, if anywhere: the held gap, unless it is one of the
  // two hugging the held row — going home draws nothing and sends nothing.
  const fromIndex = drag ? members.findIndex((m) => m.id === drag.fromId) : -1;
  const indicatorAt =
    drag && drag.insertAt !== null && fromIndex !== -1 && !isNoopInsertion(fromIndex, drag.insertAt)
      ? drag.insertAt
      : null;

  function openMember(member: Entry) {
    if (onOpen) onOpen(member.id);
    else navigate(`/entries/${member.id}`);
  }

  function removeMember(member: Entry) {
    deleteLink.mutate(member.id, {
      onSuccess: () => onToast(`Removed ${member.title} from ${bundle.title}. Still kept.`),
      onError: () => show(SAVE_FAILED, 'error'),
    });
  }

  function closeAddIdea() {
    setIdeaDraft('');
    setAddingIdea(false);
  }

  /**
   * Two writes in a fixed order: make the idea (under the trip, where every
   * idea lives), then link it into this bundle — the link cannot exist first,
   * it needs the new id. On failure at either step the field stays open with
   * the name still in it, so the error toast's "It's still here" is literal.
   * The worst partial outcome — idea created, link refused — leaves a real
   * idea safe in the trip's list, never a dangling link.
   */
  async function submitIdea() {
    const trimmed = ideaDraft.trim();
    // A blank is refused, not saved — the field simply closes, the same answer
    // the rename field gives a blank name.
    if (!trimmed) {
      closeAddIdea();
      return;
    }
    if (createEntry.isPending || createLink.isPending) return;
    try {
      const idea = await createEntry.mutateAsync({ entry: { kind: 'idea', title: trimmed }, parent_id: tripId });
      await createLink.mutateAsync({ child_id: idea.id });
    } catch {
      show(SAVE_FAILED, 'error');
      return;
    }
    closeAddIdea();
    onToast(`Added ${trimmed} to ${bundle.title}.`);
  }

  return (
    <Card
      ref={setNodeRef}
      bordered
      /* 14px 16px from the design — off the 4px scale, so it rides the style
         escape hatch Card spreads after its own padding rather than minting a
         SpaceToken for one card. */
      style={{ padding: '14px 16px' }}
      className={[styles.card, isOver ? styles.over : ''].filter(Boolean).join(' ')}
    >
      <div className={styles.header}>
        {!canEdit ? (
          /* The name is still the anchor of the card, so it keeps its type and
             its place — it just stops being a control. A button labelled
             "Rename Kyoto dinner" that opens a field the server will refuse is
             a worse answer than plain text. */
          <p className={styles.titleReading}>{bundle.title}</p>
        ) : editingName ? (
          <Input
            aria-label="Plan name"
            autoFocus
            value={nameDraft}
            wrapperClassName={styles.titleInput}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== 'Escape') return;
              // Both keys close the field and hand focus back to the name
              // button. preventDefault matters: without it the rest of the
              // keypress lands on the button that has just taken focus, and
              // Enter on a button means "press it" — the field would spring
              // straight back open.
              event.preventDefault();
              returnFocus.current = true;
              if (event.key === 'Enter') commitName();
              else cancelName();
            }}
          />
        ) : (
          /* A real button, so Enter and Space open the field for a keyboard
             user through onClick — deliberately NOT onFocus, which would
             re-open the field the instant focus came back after a commit and
             make the name impossible to Tab past. */
          <button
            ref={nameButtonRef}
            type="button"
            className={styles.title}
            aria-label={`Rename ${bundle.title}`}
            onClick={startEditingName}
          >
            {bundle.title}
          </button>
        )}

        {/* Right-aligned, muted: the design's header meta. It sits between the
            name and the X so the X keeps the corner and stays last in the tab
            order. */}
        <span className={styles.meta}>{meta}</span>

        {/* Top right, after the name — last in the header and last in the
            card's tab order, so nothing has to be Tabbed past a delete to
            reach the plan. The label names the plan because a rail of these
            otherwise offers a column of identical "Remove" buttons to anyone
            reading by label. */}
        {canEdit && (
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`Remove plan ${bundle.title}`}
            onClick={removeBundle}
          >
            <X size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* The open work, totalled — see the doc comment above. The icon
          decorates the phrase and says nothing the words don't; the words stay
          one text node. */}
      <p className={styles.todoLine}>
        <CircleDashed size={14} strokeWidth={1.5} aria-hidden="true" />
        {todoLine}
      </p>

      {/* Where the keyboard path speaks: "Moving X. Will land at 2 of 3…" on
          lift and on every arrow step, empty when nothing is held. Always in
          the tree, so assistive tech is already listening when it fills. */}
      {canEdit && (
        <div role="status" aria-live="polite" className={styles.srOnly}>
          {liveText}
        </div>
      )}

      {members.length === 0 ? (
        /* An empty plan still says it is empty for a viewer — but without the
           hint below, which names gestures they do not have. The sentence
           reports the state instead of instructing. */
        !canEdit && <p className={styles.emptyDrop}>Nothing in here yet.</p>
      ) : (
        <ul
          className={styles.memberList}
          /* The list itself catches a drop that lands in the gap between two
             rows — the seam the line is drawn in, and exactly where a careful
             pointer aims. Only while one of our rows is held: anything else
             dropped on the gap stays the browser's business. */
          onDragOver={
            canEdit
              ? (event: DragEvent<HTMLUListElement>) => {
                  if (dragRef.current?.mode === 'pointer') event.preventDefault();
                }
              : undefined
          }
          onDrop={
            canEdit
              ? (event: DragEvent<HTMLUListElement>) => {
                  if (!dragRef.current) return;
                  event.preventDefault();
                  commitReorder();
                }
              : undefined
          }
        >
          {members.map((member, index) => {
            const grabbed = drag?.mode === 'keyboard' && drag.fromId === member.id;
            return (
              <li
                key={member.id}
                className={[
                  styles.member,
                  drag?.fromId === member.id ? styles.lifted : '',
                  pendingIds.has(member.id) ? styles.pending : '',
                  indicatorAt === index ? styles.insertBefore : '',
                  indicatorAt === members.length && index === members.length - 1 ? styles.insertAfter : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                /* The native reorder accelerator, dropped whole for a viewer —
                   the attribute AND its handlers, because `draggable` is what the
                   browser reads and leaving the handlers on a row that cannot
                   start a drag is dead wiring. */
                draggable={canEdit || undefined}
                onDragStart={canEdit ? (event: DragEvent<HTMLLIElement>) => startPointerDrag(event, member, index) : undefined}
                onDragOver={canEdit ? (event: DragEvent<HTMLLIElement>) => pointerOverRow(event, index) : undefined}
                onDrop={
                  canEdit
                    ? (event: DragEvent<HTMLLIElement>) => {
                        event.preventDefault();
                        // Handled here; the list's own onDrop is for the gaps.
                        event.stopPropagation();
                        commitReorder();
                      }
                    : undefined
                }
                onDragEnd={canEdit ? cancelDrag : undefined}
              >
                {/* The keyboard path's whole surface — see the doc comment.
                    First in the row so it is the first thing a Tab reaches, as
                    IdeaRow's grip is; aria-pressed carries "held". Blur cancels:
                    a row left lifted while focus is elsewhere would swallow the
                    next Space pressed anywhere. */}
                {canEdit && (
                  <button
                    type="button"
                    className={[styles.grip, grabbed ? styles.gripOn : ''].filter(Boolean).join(' ')}
                    aria-label={`Reorder ${member.title}`}
                    aria-pressed={grabbed}
                    onKeyDown={(event) => gripKeyDown(event, member, index)}
                    onBlur={() => {
                      if (dragRef.current?.mode === 'keyboard' && dragRef.current.fromId === member.id) cancelDrag();
                    }}
                  >
                    <GripVertical size={16} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                )}
                <span
                  className={[styles.dot, member.address ? styles.dotPlaced : styles.dotBare].join(' ')}
                  aria-hidden="true"
                />
                <span className={styles.srOnly}>{member.address ? 'Has an address:' : 'No address yet:'}</span>
                <button type="button" className={styles.memberTitle} onClick={() => openMember(member)}>
                  {member.title}
                </button>
                {member.todos_open_count > 0 && (
                  <span className={styles.memberTodos}>
                    {`${member.todos_open_count} ${member.todos_open_count === 1 ? 'to-do' : 'to-dos'}`}
                  </span>
                )}
                {/* The member itself — its dot, its name, its to-do count — is
                    content and stays. Only the three verbs on the end go. */}
                {canEdit && (
                  <span className={styles.memberActions}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`Move ${member.title} up`}
                      disabled={index === 0}
                      onClick={() => moveMember(index, -1)}
                    >
                      <ChevronUp size={16} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`Move ${member.title} down`}
                      disabled={index === members.length - 1}
                      onClick={() => moveMember(index, 1)}
                    >
                      <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`Remove ${member.title} from ${bundle.title}`}
                      onClick={() => removeMember(member)}
                    >
                      <X size={16} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* The design's foot line, and a real control now: the card grew an
          add-member write of its own, so the text finally honours the click it
          always looked like it promised. The button and the name field trade
          the same slot — see the add-idea section of the doc comment. Editors
          only; both the button and the gestures it mentions are theirs. */}
      {canEdit &&
        (addingIdea ? (
          <Input
            aria-label="New idea name"
            autoFocus
            value={ideaDraft}
            wrapperClassName={styles.addIdeaInput}
            onChange={(event) => setIdeaDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== 'Escape') return;
              // Same preventDefault bargain as the rename field: when the
              // field closes, focus lands back on the button, and an
              // un-prevented Enter would press it and spring the field open.
              event.preventDefault();
              returnFocusToAdd.current = true;
              if (event.key === 'Enter') void submitIdea();
              else closeAddIdea();
            }}
          />
        ) : (
          <button
            ref={addIdeaButtonRef}
            type="button"
            className={styles.addIdea}
            onClick={() => setAddingIdea(true)}
          >
            + add idea — or send one over from the list
          </button>
        ))}
    </Card>
  );
}
