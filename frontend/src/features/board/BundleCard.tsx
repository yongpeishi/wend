import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/layout/Card';
import { Input } from '../../design/components/core/Input';
import { useToast } from '../../components/Toast';
import { useArchiveEntry, useDeleteLink, useReorderLinks, useUpdateEntry, useUpdateLinkPosition } from '../../api';
import type { Entry } from '../../api/types';
import { useLinkMutations } from './useLinkMutations';
import styles from './BundleCard.module.css';

export interface BundleCardProps {
  bundle: Entry;
  /** Bundle members in entry_links.position order — see useBundleMembers.ts. */
  members: Entry[];
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
 *   The X at the top left removes the bundle. There is no destroy endpoint in
 *   this product and there should not be: "removing" here unlinks every member
 *   first and then archives the bundle entry, so every idea lands back in the
 *   idea list intact and the bundle itself is still recoverable from the
 *   rail's SetAsideSection. The unlinking is awaited before the archive so a
 *   failure part-way leaves a bundle that still holds its ideas, rather than
 *   an archived shell with orphaned links. Nothing in Wend is destroyed; this
 *   is the strongest verb on the card and it is still reversible.
 *
 * Members reorder two ways, per screens.md's "every drag interaction needs a
 * keyboard and pointer-free equivalent": native HTML5 drag-and-drop on each
 * row (an accelerator — useReorderLinks posts the whole new order at once),
 * and Move up / Move down buttons that always work with a mouse, keyboard or
 * switch device (useUpdateLinkPosition, swapping just the two affected
 * links' positions). Remove unlinks one member (useDeleteLink) — it must
 * never archive or touch the idea itself, only the entry_links row.
 *
 * Three pieces of the design carry data our model does not have, so all three
 * are derived from real fields rather than invented:
 *
 *   The meta line. The design shows an uppercase caption above the members;
 *   Entry has no bundle-level metadata at all. It reports how many members are
 *   already on the schedule (`Entry.scheduled`, a real serialized field) —
 *   which is the one thing about a bundle that changes as you use it, and is
 *   worth a glance when deciding which bundle is closest to being a plan.
 *
 *   The header count. The design's right-hand slot held an idea count, which
 *   the backlog dropped as noise (the members are right there to be counted).
 *   It carries the open to-do work instead: the members' `todos_open_count`
 *   plus the bundle's own, which is the one number that says whether this
 *   bundle still needs something done to it. Zero renders nothing at all,
 *   the same way the meta line stays silent rather than reading "0" — an
 *   absence of chores is not news.
 *
 *   The member dot. The design colours a dot per item from a state enum we
 *   don't have. It uses the same `scheduled` flag: leaf for on the schedule,
 *   the pale waiting tone for not yet. Colour is never the only carrier — each
 *   dot ships a visually-hidden phrase so the state is readable without it.
 */
export function BundleCard({ bundle, members, onToast }: BundleCardProps) {
  const navigate = useNavigate();
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
  const { setNodeRef, isOver } = useDroppable({
    id: `bundle-${bundle.id}`,
    data: { bundleId: bundle.id, title: bundle.title },
  });

  useEffect(() => {
    if (!editingName && returnFocus.current) {
      returnFocus.current = false;
      nameButtonRef.current?.focus();
    }
  }, [editingName]);

  // Honest stand-in for the design's meta caption — see the doc comment above.
  // Empty bundles get no line at all rather than "0 of 0": a bundle you just
  // named should read as waiting, not as failing at something.
  const meta = useMemo(() => {
    if (members.length === 0) return null;
    const scheduled = members.filter((member) => member.scheduled).length;
    if (scheduled === 0) return 'None on the schedule yet';
    return `${scheduled} of ${members.length} on the schedule`;
  }, [members]);

  // The bundle's own to-dos count too — a bundle can carry a "book this before
  // the 3rd" that belongs to no single idea in it.
  const openTodos = useMemo(
    () => members.reduce((total, member) => total + member.todos_open_count, 0) + bundle.todos_open_count,
    [members, bundle.todos_open_count],
  );

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
      padding={3}
      className={[styles.card, isOver ? styles.over : ''].filter(Boolean).join(' ')}
    >
      <div className={styles.header}>
        {/* Top left, ahead of the name, per the backlog. The label names the
            bundle because a rail of these otherwise offers a column of
            identical "Remove" buttons to anyone reading by label. */}
        <button
          type="button"
          className={styles.iconButton}
          aria-label={`Remove bundle ${bundle.title}`}
          onClick={removeBundle}
        >
          <X size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>

        {editingName ? (
          <Input
            aria-label="Bundle name"
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

        {openTodos > 0 && (
          <span className={styles.todoCount}>
            {openTodos} to-do{openTodos === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {meta && <p className={styles.meta}>{meta}</p>}

      {members.length === 0 ? (
        <p className={styles.emptyDrop}>Drag ideas here, or use "Add to bundle" on a row.</p>
      ) : (
        <ul className={styles.memberList}>
          {members.map((member, index) => (
            <li
              key={member.id}
              className={[styles.member, draggedId !== null && draggedId !== member.id ? styles.dropTarget : '']
                .filter(Boolean)
                .join(' ')}
              draggable
              onDragStart={() => setDraggedId(member.id)}
              onDragOver={(event: DragEvent<HTMLLIElement>) => event.preventDefault()}
              onDrop={(event: DragEvent<HTMLLIElement>) => {
                event.preventDefault();
                handleDrop(member.id);
              }}
              onDragEnd={() => setDraggedId(null)}
            >
              <span
                className={[styles.dot, member.scheduled ? styles.dotScheduled : styles.dotWaiting].join(' ')}
                aria-hidden="true"
              />
              <span className={styles.srOnly}>
                {member.scheduled ? 'On the schedule:' : 'Not on the schedule yet:'}
              </span>
              <button type="button" className={styles.memberTitle} onClick={() => navigate(`/entries/${member.id}`)}>
                {member.title}
              </button>
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
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
