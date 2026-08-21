import { useNavigate } from 'react-router-dom';
import { EntryRow } from '../../components/EntryRow';
import { VoteControl } from '../../components/VoteControl';
import { Row } from '../../components/layout/Stack';
import { useDeleteVote, useVote } from '../../api';
import type { VoteScore } from '../../components/VoteControl';
import type { Entry } from '../../api/types';
import { CATEGORY_LABELS } from '../board/filters';
import styles from './LibraryRow.module.css';

export interface LibraryRowProps {
  entry: Entry;
  selected: boolean;
  onToggleSelect: (id: number, shiftKey: boolean) => void;
  /** Drives the hovered row -> highlighted pin sync described in screens.md. */
  onHoverChange?: (id: number | null) => void;
}

/**
 * One idea in the library's list column: checkbox for "by hand" selection,
 * the EntryRow specimen, and a vote control. Hovering reports itself so the
 * map side can highlight the matching pin — the map/list stay in sync both ways.
 */
export function LibraryRow({ entry, selected, onToggleSelect, onHoverChange }: LibraryRowProps) {
  const navigate = useNavigate();
  const vote = useVote(entry.id);
  const deleteVote = useDeleteVote(entry.id);

  const metadata = [
    entry.category ? CATEGORY_LABELS[entry.category] : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <Row
      gap={2}
      align="center"
      className={styles.row}
      onMouseEnter={() => onHoverChange?.(entry.id)}
      onMouseLeave={() => onHoverChange?.(null)}
    >
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={selected}
        aria-label={`Select ${entry.title}`}
        onChange={(event) => onToggleSelect(entry.id, (event.nativeEvent as MouseEvent).shiftKey)}
      />
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
    </Row>
  );
}
