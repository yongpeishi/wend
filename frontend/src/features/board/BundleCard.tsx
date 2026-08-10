import { useCallback, useState } from 'react';
import type { DragEvent } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ChevronDown, ChevronUp, Pencil, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/layout/Card';
import { Row, Stack } from '../../components/layout/Stack';
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
 * Full bundle CRUD lives here: Rename opens BundleFormModal in edit mode,
 * Set aside archives the bundle entry itself (recoverable from TripBoard's
 * SetAsideSection, same as any archived entry — never destroyed). Fork
 * duplicates it to compare two versions. Ungroup removes every member link
 * but keeps every idea — deliberately the same one-click cost as adding a
 * member, per principle 2 ("ungroups just as cheaply").
 *
 * Members reorder two ways, per screens.md's "every drag interaction needs a
 * keyboard and pointer-free equivalent": native HTML5 drag-and-drop on each
 * row (an accelerator — useReorderLinks posts the whole new order at once),
 * and Move up / Move down buttons that always work with a mouse, keyboard or
 * switch device (useUpdateLinkPosition, swapping just the two affected
 * links' positions). Remove unlinks one member (useDeleteLink) — it must
 * never archive or touch the idea itself, only the entry_links row.
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
      padding={4}
      className={[styles.card, isOver ? styles.over : ''].filter(Boolean).join(' ')}
    >
      <Stack gap={3}>
        <Row justify="between" align="start" gap={2}>
          <button type="button" className={styles.title} onClick={() => navigate(`/entries/${bundle.id}`)}>
            {bundle.title}
          </button>
          <Row gap={2}>
            <Tag tone="saved">{members.length} kept</Tag>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={`Rename ${bundle.title}`}
              onClick={() => setRenameOpen(true)}
            >
              <Pencil size={16} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </Row>
        </Row>

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
                <button
                  type="button"
                  className={styles.memberTitle}
                  onClick={() => navigate(`/entries/${member.id}`)}
                >
                  {member.title}
                </button>
                <Row gap={1} className={styles.memberActions}>
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
                </Row>
              </li>
            ))}
          </ul>
        )}

        <Row gap={2} wrap>
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
        </Row>
      </Stack>

      <BundleFormModal open={renameOpen} onClose={closeRename} bundle={bundle} />
    </Card>
  );
}
