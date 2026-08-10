import { GripVertical } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { useNavigate } from 'react-router-dom';
import { EntryRow } from '../../components/EntryRow';
import { VoteControl } from '../../components/VoteControl';
import { Tag } from '../../design/components/core/Chip';
import { Card } from '../../components/layout/Card';
import { Row } from '../../components/layout/Stack';
import { useToast } from '../../components/Toast';
import { useArchiveEntry, useDeleteVote, useVote } from '../../api';
import type { VoteScore } from '../../components/VoteControl';
import type { Entry } from '../../api/types';
import { CATEGORY_LABELS } from './filters';
import { formatDuration } from '../../lib/formatDates';
import { AddToBundleMenu } from './AddToBundleMenu';
import styles from './IdeaCard.module.css';

export interface IdeaCardProps {
  entry: Entry;
  bundles: Entry[];
  members: Map<number, Entry[]>;
  selected: boolean;
  onToggleSelect: (id: number, shiftKey: boolean) => void;
  onToast?: (message: string) => void;
}

/**
 * One idea in the middle column, as a card: hatch thumbnail, title,
 * `category · location · duration`, a vote control, open-todo count and the
 * keep toggle — the Card primitive (6px radius, card tone on paper tone, no
 * shadow) replacing the old single-line row. The checkbox (multi-select) and
 * drag handle (dragging onto a bundle copies the link — see TripBoard's
 * onDragEnd) sit above; "Add to bundle" is the keyboard/pointer-free
 * equivalent of that drag.
 *
 * The data model has no literal "kept" boolean — every idea reachable here
 * is definitionally already kept. The toggle is wired to set the idea aside
 * instead (`archived_at`), the closest real kept-vs-not state an Entry has;
 * clicking it never strikes anything through, it just archives (dimmed by
 * opacity elsewhere, same as everywhere else archiving shows up).
 */
export function IdeaCard({ entry, bundles, members, selected, onToggleSelect, onToast }: IdeaCardProps) {
  const navigate = useNavigate();
  const { show } = useToast();
  const vote = useVote(entry.id);
  const deleteVote = useDeleteVote(entry.id);
  const archiveEntry = useArchiveEntry();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `idea-${entry.id}`,
    data: { entryId: entry.id, title: entry.title },
  });

  const metadata = [
    entry.category ? CATEGORY_LABELS[entry.category] : null,
    entry.location_name,
    formatDuration(entry.duration_minutes),
  ].filter((part): part is string => Boolean(part));

  return (
    <Card bordered padding={3} className={styles.card} style={{ opacity: isDragging ? 0.4 : 1 }}>
      <Row justify="between" align="center" className={styles.controls}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={selected}
          aria-label={`Select ${entry.title}`}
          onChange={(event) => onToggleSelect(entry.id, (event.nativeEvent as MouseEvent).shiftKey)}
        />
        <button
          type="button"
          ref={setNodeRef}
          {...listeners}
          {...attributes}
          className={styles.grip}
          aria-label={`Drag ${entry.title} onto a bundle to add it there`}
        >
          <GripVertical size={18} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </Row>

      <EntryRow
        title={entry.title}
        metadata={metadata}
        kept
        onToggleKeep={() =>
          archiveEntry.mutate(entry.id, {
            onSuccess: () => show('Set aside.', 'success'),
            onError: () => show("That didn't save. It's still here — try again.", 'error'),
          })
        }
        onSelect={() => navigate(`/entries/${entry.id}`)}
      />

      <Row justify="between" align="center" wrap className={styles.footer}>
        <VoteControl
          aria-label={`Desire rating for ${entry.title}`}
          value={entry.my_vote}
          onChange={(score: VoteScore) => vote.mutate(score)}
          onClear={() => deleteVote.mutate()}
          average={entry.vote_tally.average}
          count={entry.vote_tally.count}
        />
        {entry.todos_open_count > 0 && <Tag>{entry.todos_open_count} open</Tag>}
      </Row>

      <AddToBundleMenu entry={entry} bundles={bundles} members={members} onToast={onToast} />
    </Card>
  );
}
