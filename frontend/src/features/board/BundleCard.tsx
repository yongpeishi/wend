import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/layout/Card';
import { Input } from '../../design/components/core/Input';
import { useToast } from '../../components/Toast';
import { useCanEdit } from '../../auth/TripRoleContext';
import { useArchiveEntry, useDeleteLink, useReorderLinks, useUpdateEntry, useUpdateLinkPosition } from '../../api';
import type { Entry } from '../../api/types';
import { useLinkMutations } from './useLinkMutations';
import styles from './BundleCard.module.css';

export interface BundleCardProps {
  bundle: Entry;
  /** Bundle members in entry_links.position order — see useBundleMembers.ts. */
  members: Entry[];
  /** Open a member idea in place. Omitted, the card falls back to navigating. */
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
 * ungroup, set aside — is gone, and with it the "N kept" tag: in a 376px rail
 * five buttons per card meant the rail read as controls with some names
 * attached rather than as the bundles themselves. What survives is what the
 * card is FOR (the name, the members, their order) plus the two edits a
 * bundle actually needs, both reachable without leaving the card:
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
 * Members reorder two ways, per screens.md's "every drag interaction needs a
 * keyboard and pointer-free equivalent": native HTML5 drag-and-drop on each
 * row (an accelerator — useReorderLinks posts the whole new order at once),
 * and Move up / Move down buttons that always work with a mouse, keyboard or
 * switch device (useUpdateLinkPosition, swapping just the two affected
 * links' positions). Remove unlinks one member (useDeleteLink) — it must
 * never archive or touch the idea itself, only the entry_links row.
 *
 * The design's card carries state our model does not have, so every part of it
 * that looks like metadata is derived from a real serialized field rather than
 * invented:
 *
 *   The header meta. The approved mockup's right-hand header slot holds the
 *   idea count — "3 ideas", right-aligned and muted beside the name. An empty
 *   plan says "Empty so far" rather than "0 ideas": in a rail where every card
 *   speaks, a zero is a tally and this is a state, and it is the state the
 *   hint below exists to fix. This retires the "N open to-dos" line that sat
 *   under the name; the plum per-member labels below keep the outstanding work
 *   visible on the ideas that own it.
 *
 *   The member dot. The design colours a dot per item from a state enum we
 *   don't have. It uses `address`: solid leaf for a member that has one,
 *   hollow (line-strong ring) for one that doesn't — the same "is this a real
 *   place yet" question the map asks. Colour is never the only carrier — each
 *   dot ships a visually-hidden phrase so the state is readable without it.
 *
 *   The member to-do label. A member holding open to-dos says "2 to-dos" in
 *   plum just left of its row actions, so the outstanding work is visible on
 *   the ideas that own it without opening anything — it is the one to-do
 *   signal the card keeps now the header meta counts ideas instead. Members
 *   with nothing outstanding carry no label at all — here a
 *   mark on the exceptions beats a column of zeroes, because the reader is
 *   scanning for which row to deal with, not tallying. It is the only coloured
 *   text in the row, which is what makes it read as an annotation on the idea
 *   rather than a status the idea is in.
 *
 * A member's name opens it, and when the board offers `onOpen` it opens in
 * place rather than by navigating to /entries/:id — the same bargain IdeaRow
 * strikes with the board. Two things depend on staying put: the drawer's scrim
 * is paper at 0.92, so over the board the page shows faintly through and it
 * reads as see-through, while on a route of its own it covers an empty page
 * with nothing behind it to show and reads as opaque; and off the board the
 * member is outside the trip's TripRoleProvider, where the editable default
 * applies and a viewer would be handed the form. Opening over the board keeps
 * the page under the scrim and keeps the member inside the trip's role. The
 * prop is `onOpen` rather than `onEdit` because that is all it promises: a
 * viewer opens a member and gets it read-only. Without the prop the card still
 * navigates, which is what a card outside a board — the design gallery, its own
 * tests — has to do, since there is no drawer there to open into.
 */
export function BundleCard({ bundle, members, onOpen, onToast }: BundleCardProps) {
  const navigate = useNavigate();
  // The hook rather than a prop: unlike IdeaRow this card takes none of its
  // verbs from its caller — it owns its own mutations — so the capability comes
  // from the same tree the mutations do.
  const canEdit = useCanEdit();
  const { show } = useToast();
  const archiveEntry = useArchiveEntry();
  const updateEntry = useUpdateEntry(bundle.id);
  const { removeLink } = useLinkMutations();
  const deleteLink = useDeleteLink(bundle.id);
  const reorderLinks = useReorderLinks(bundle.id);
  const updateLinkPosition = useUpdateLinkPosition(bundle.id);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(bundle.title);
  const nameButtonRef = useRef<HTMLButtonElement>(null);
  // Set only by the key paths (Enter/Escape), never by blur: a blur commit
  // means the user has already moved on — pulling focus back to the name
  // would trap anyone Tabbing out of the card.
  const returnFocus = useRef(false);
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

  // One string rather than assembled in JSX, so the meta is a single text node:
  // one phrase to a screen reader, and one thing to assert on in a test.
  const meta = members.length === 0 ? 'Empty so far' : `${members.length} idea${members.length === 1 ? '' : 's'}`;

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
          show("That didn't save. It's still here — try again.", 'error');
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
      show("That didn't save. It's still here — try again.", 'error');
      return;
    }
    onToast(
      count === 0
        ? `Removed ${bundle.title}. It's set aside if you want it back.`
        : `Removed ${bundle.title}. ${count} idea${count === 1 ? '' : 's'} back in your list.`,
    );
  }

  function moveMember(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    const moving = members[index];
    const other = members[targetIndex];
    if (!moving || !other) return;
    // Swap the two links' positions directly — members is already in
    // position order, so the two array indices ARE the two target position
    // values. No need to know the underlying integer positions of anyone else.
    updateLinkPosition.mutate(
      { childId: moving.id, position: targetIndex },
      { onError: () => show("That didn't save. It's still here — try again.", 'error') },
    );
    updateLinkPosition.mutate(
      { childId: other.id, position: index },
      { onError: () => show("That didn't save. It's still here — try again.", 'error') },
    );
  }

  function openMember(member: Entry) {
    if (onOpen) onOpen(member.id);
    else navigate(`/entries/${member.id}`);
  }

  function removeMember(member: Entry) {
    deleteLink.mutate(member.id, {
      onSuccess: () => onToast(`Removed ${member.title} from ${bundle.title}. Still kept.`),
      onError: () => show("That didn't save. It's still here — try again.", 'error'),
    });
  }

  function handleDrop(targetId: number) {
    if (draggedId === null || draggedId === targetId) {
      setDraggedId(null);
      return;
    }
    const fromIndex = members.findIndex((m) => m.id === draggedId);
    const toIndex = members.findIndex((m) => m.id === targetId);
    setDraggedId(null);
    if (fromIndex === -1 || toIndex === -1) return;
    const reordered = members.slice();
    const [moved] = reordered.splice(fromIndex, 1);
    if (!moved) return;
    reordered.splice(toIndex, 0, moved);
    reorderLinks.mutate(
      reordered.map((m) => m.id),
      { onError: () => show("That didn't save. It's still here — try again.", 'error') },
    );
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

      {members.length === 0 ? (
        /* An empty plan still says it is empty for a viewer — but without the
           hint below, which names gestures they do not have. The sentence
           reports the state instead of instructing. */
        !canEdit && <p className={styles.emptyDrop}>Nothing in here yet.</p>
      ) : (
        <ul className={styles.memberList}>
          {members.map((member, index) => (
            <li
              key={member.id}
              className={[styles.member, draggedId !== null && draggedId !== member.id ? styles.dropTarget : '']
                .filter(Boolean)
                .join(' ')}
              /* The native reorder accelerator, dropped whole for a viewer —
                 the attribute AND its handlers, because `draggable` is what the
                 browser reads and leaving the handlers on a row that cannot
                 start a drag is dead wiring. */
              draggable={canEdit || undefined}
              onDragStart={canEdit ? () => setDraggedId(member.id) : undefined}
              onDragOver={canEdit ? (event: DragEvent<HTMLLIElement>) => event.preventDefault() : undefined}
              onDrop={
                canEdit
                  ? (event: DragEvent<HTMLLIElement>) => {
                      event.preventDefault();
                      handleDrop(member.id);
                    }
                  : undefined
              }
              onDragEnd={canEdit ? () => setDraggedId(null) : undefined}
            >
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
          ))}
        </ul>
      )}

      {/* The design's foot line. Plain text rather than a control: the card
          has no add-member affordance of its own — ideas arrive by drag or
          from the idea row's "Add to plan" — so a hint that named itself a
          button would promise a click it cannot honour. Editors only; the
          gestures it points at are theirs. */}
      {canEdit && <p className={styles.hint}>+ add idea — or send one over from the list</p>}
    </Card>
  );
}
