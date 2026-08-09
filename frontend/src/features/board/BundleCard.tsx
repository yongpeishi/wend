import { useDroppable } from '@dnd-kit/core';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/layout/Card';
import { Row, Stack } from '../../components/layout/Stack';
import { Chip, Tag } from '../../design/components/core/Chip';
import { Button } from '../../design/components/core/Button';
import { useForkEntry } from '../../api';
import type { Entry } from '../../api/types';
import { useLinkMutations } from './useLinkMutations';
import styles from './BundleCard.module.css';

export interface BundleCardProps {
  bundle: Entry;
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
 * Fork duplicates it to compare two versions. Ungroup removes every member
 * link but keeps every idea — deliberately the same one-click cost as adding
 * a member, per principle 2 ("ungroups just as cheaply").
 */
export function BundleCard({ bundle, members, compareSelected, onToggleCompare, onToast }: BundleCardProps) {
  const navigate = useNavigate();
  const fork = useForkEntry();
  const { removeLink } = useLinkMutations();
  const { setNodeRef, isOver } = useDroppable({
    id: `bundle-${bundle.id}`,
    data: { bundleId: bundle.id, title: bundle.title },
  });

  async function ungroup() {
    const count = members.length;
    await Promise.all(members.map((member) => removeLink.mutateAsync({ parentId: bundle.id, childId: member.id })));
    onToast(`Ungrouped ${bundle.title} — ${count} idea${count === 1 ? '' : 's'} still kept.`);
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
          <Tag tone="saved">{members.length} kept</Tag>
        </Row>

        {members.length === 0 ? (
          <p className={styles.emptyDrop}>Drag ideas here, or use "Add to bundle" on a row.</p>
        ) : (
          <Row wrap gap={1}>
            {members.map((member) => (
              <Tag key={member.id}>{member.title}</Tag>
            ))}
          </Row>
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
        </Row>
      </Stack>
    </Card>
  );
}
