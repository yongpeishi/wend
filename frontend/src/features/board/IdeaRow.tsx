import { GripVertical } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { useNavigate } from 'react-router-dom';
import { EntryRow } from '../../components/EntryRow';
import { VoteControl } from '../../components/VoteControl';
import { Tag } from '../../design/components/core/Chip';
import { Row } from '../../components/layout/Stack';
import { useDeleteVote, useVote } from '../../api';
import type { VoteScore } from '../../components/VoteControl';
import type { Entry } from '../../api/types';
import { CATEGORY_LABELS } from './filters';
import { formatDuration } from '../../lib/formatDates';
import { AddToBundleMenu } from './AddToBundleMenu';
import styles from './IdeaRow.module.css';

export interface IdeaRowProps {
  entry: Entry;
  bundles: Entry[];
  members: Map<number, Entry[]>;
  selected: boolean;
  onToggleSelect: (id: number, shiftKey: boolean) => void;
  onToast?: (message: string) => void;
}

/**
 * One idea in the middle column: checkbox (multi-select), a drag handle
 * (dragging onto a bundle copies the link — see TripBoard's onDragEnd), the
 * EntryRow specimen itself, a vote control, open-todo count, and the
 * "Add to bundle" menu — the keyboard/pointer-free equivalent of the drag.
 */
export function IdeaRow({ entry, bundles, members, selected, onToggleSelect, onToast }: IdeaRowProps) {
  const navigate = useNavigate();
  const vote = useVote(entry.id);
  const deleteVote = useDeleteVote(entry.id);
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
    <Row gap={2} align="center" className={styles.row} style={{ opacity: isDragging ? 0.4 : 1 }}>
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
      <div className={styles.main}>
        <EntryRow title={entry.title} metadata={metadata} kept onSelect={() => navigate(`/entries/${entry.id}`)} />
      </div>
      <VoteControl
        aria-label={`Desire rating for ${entry.title}`}
        value={entry.my_vote}
        onChange={(score: VoteScore) => vote.mutate(score)}
        onClear={() => deleteVote.mutate()}
        average={entry.vote_tally.average}
        count={entry.vote_tally.count}
      />
      {entry.todos_open_count > 0 && <Tag>{entry.todos_open_count} open</Tag>}
      <AddToBundleMenu entry={entry} bundles={bundles} members={members} onToast={onToast} />
    </Row>
  );
}
