import { useCallback, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/layout/Card';
import { Chip, Tag } from '../../design/components/core/Chip';
import { Button } from '../../design/components/core/Button';
import { useToast } from '../../components/Toast';
import { useArchiveEntry, useDeleteLink, useForkEntry, useReorderLinks, useUpdateLinkPosition } from '../../api';
import type { Entry } from '../../api/types';
import { useLinkMutations } from './useLinkMutations';
import { BundleFormModal } from './BundleFormModal';
import styles from './BundleCard.module.css';

export interface BundleCardProps {
  bundle: Entry;
  /** Bundle members in entry_links.position order — see useBundleMembers.ts. */
  members: Entry[];
  compareSelected: boolean;
  onToggleCompare: (id: number) => void;
  onToast: (message: string) => void;
}

/**
 * A bucket of ideas that goes together. Also the drop target: dropping an
 * idea here copies the link (TripBoard's onDragEnd creates a new link, never
 * removes the old one), so an idea can sit in many bundles at once.
 *
 * The layout follows the design's rail card: name and count on one line, a
 * quiet meta line under it, then the members as filled rows on paper tone
 * against the card. It is a tight card in a 376px rail, so the actions sit in
 * one quiet row at the foot rather than spread across the header — but none of
 * them were dropped in the tightening. Every one is a path the product
 * promises:
 *
 *   Rename    — opens BundleFormModal (its only remaining job; creating a
 *               bundle moved inline to NewBundleBox).
 *   Fork      — duplicates the bundle so two versions can be compared.
 *   Compare   — selects it for the side-by-side.
 *   Ungroup   — removes every member link and keeps every idea. Deliberately
 *               the same one-click cost as adding a member, per principle 2
 *               ("ungroups just as cheaply").
 *   Set aside — archives the bundle entry itself, recoverable from the rail's
 *               SetAsideSection like any archived entry. Never destroyed.
 *
 * Members reorder two ways, per screens.md's "every drag interaction needs a
 * keyboard and pointer-free equivalent": native HTML5 drag-and-drop on each
 * row (an accelerator — useReorderLinks posts the whole new order at once),
 * and Move up / Move down buttons that always work with a mouse, keyboard or
 * switch device (useUpdateLinkPosition, swapping just the two affected
 * links' positions). Remove unlinks one member (useDeleteLink) — it must
 * never archive or touch the idea itself, only the entry_links row.
 *
 * Two pieces of the design carry data our model does not have, so both are
 * derived from a real field rather than invented:
 *
 *   The meta line. The design shows an uppercase caption above the members;
 *   Entry has no bundle-level metadata at all. It reports how many members are
 *   already on the schedule (`Entry.scheduled`, a real serialized field) —
 *   which is the one thing about a bundle that changes as you use it, and is
 *   worth a glance when deciding which bundle is closest to being a plan.
 *
 *   The member dot. The design colours a dot per item from a state enum we
 *   don't have. It uses the same `scheduled` flag: leaf for on the schedule,
 *   the pale waiting tone for not yet. Colour is never the only carrier — each
 *   dot ships a visually-hidden phrase so the state is readable without it.
 */
export function BundleCard({ bundle, members, compareSelected, onToggleCompare, onToast }: BundleCardProps) {
  const navigate = useNavigate();
  const { show } = useToast();
  const fork = useForkEntry();
  const archiveEntry = useArchiveEntry();
  const { removeLink } = useLinkMutations();
  const deleteLink = useDeleteLink(bundle.id);
  const reorderLinks = useReorderLinks(bundle.id);
  const updateLinkPosition = useUpdateLinkPosition(bundle.id);
  const [renameOpen, setRenameOpen] = useState(false);
  // Stable handle for BundleFormModal's onClose — see NewIdeaModal.tsx's doc
  // comment on why an unmemoized inline arrow here would fight typing inside it.
  const closeRename = useCallback(() => setRenameOpen(false), []);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const { setNodeRef, isOver } = useDroppable({
    id: `bundle-${bundle.id}`,
    data: { bundleId: bundle.id, title: bundle.title },
  });

  // Honest stand-in for the design's meta caption — see the doc comment above.
  // Empty bundles get no line at all rather than "0 of 0": a bundle you just
  // named should read as waiting, not as failing at something.
  const meta = useMemo(() => {
    if (members.length === 0) return null;
    const scheduled = members.filter((member) => member.scheduled).length;
    if (scheduled === 0) return 'None on the schedule yet';
    return `${scheduled} of ${members.length} on the schedule`;
  }, [members]);

  async function ungroup() {
    const count = members.length;
    await Promise.all(members.map((member) => removeLink.mutateAsync({ parentId: bundle.id, childId: member.id })));
    onToast(`Ungrouped ${bundle.title} — ${count} idea${count === 1 ? '' : 's'} still kept.`);
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
        <button type="button" className={styles.title} onClick={() => navigate(`/entries/${bundle.id}`)}>
          {bundle.title}
        </button>
        <Tag tone="saved">{members.length} kept</Tag>
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

      <div className={styles.actions}>
        {/* Visible text is "Rename"; the label extends it with the bundle name
            so a screen-reader user hitting five of these in a rail knows which
            one they are on. The visible string is still a prefix of the
            accessible name, which is what "label in name" asks for. */}
        <Button variant="quiet" aria-label={`Rename ${bundle.title}`} onClick={() => setRenameOpen(true)}>
          Rename
        </Button>
        <Button
          variant="quiet"
          onClick={() =>
            fork.mutate(bundle.id, {
              onSuccess: () => onToast(`Forked ${bundle.title}. Keep both for now.`),
            })
          }
        >
          Fork
        </Button>
        <Chip selected={compareSelected} onClick={() => onToggleCompare(bundle.id)}>
          Compare
        </Chip>
        <Button variant="quiet" onClick={ungroup} disabled={members.length === 0}>
          Ungroup
        </Button>
        <Button
          variant="quiet"
          onClick={() =>
            archiveEntry.mutate(bundle.id, {
              onSuccess: () => onToast("Set aside. It's still here."),
              onError: () => show("That didn't save. It's still here — try again.", 'error'),
            })
          }
        >
          Set aside
        </Button>
      </div>

      <BundleFormModal open={renameOpen} onClose={closeRename} bundle={bundle} />
    </Card>
  );
}
