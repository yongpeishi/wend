import { Fragment } from 'react';
import type { ItineraryItem } from '../../api/types';
import { BundleBand } from './BundleBand';
import { GapRow } from './GapRow';
import { ItemLine } from './ItemLine';
import { suggestSlots, withGaps } from './itineraryModel';
import { TimePrompt } from './TimePrompt';
import styles from './VersionItems.module.css';

export interface VersionItemsProps {
  items: ItineraryItem[];
  /** Opens the picker over the hours the gap leaves free. */
  onFill?: (slot: { start: number; end: number }) => void;
  onEditTime?: (itemId: number, startsAtMinutes: number | null, endsAtMinutes: number | null) => void;
  onRemoveItem?: (itemId: number) => void;
  /** Archived versions are shown, not edited. */
  readOnly?: boolean;
  /**
   * The item that just landed untimed, still waiting to be asked "when?". Its
   * row gets the TimePrompt opened under it, in place. Null or absent, no row
   * is being asked anything.
   */
  promptItemId?: number | null;
  /** e.g. "Wed 15" — the prompt's caption names the day it is asking about. */
  promptDayName?: string;
  /** Closes the prompt. Its absence keeps the prompt from rendering at all. */
  onPromptDismiss?: () => void;
}

/**
 * One version's running order: its items in clock order with the holes between
 * them drawn in. Shared by the open day, the side-by-side version columns and
 * the archived panel so all three read identically — the only difference
 * between them is which callbacks arrive.
 */
export function VersionItems({
  items,
  onFill,
  onEditTime,
  onRemoveItem,
  readOnly = false,
  promptItemId = null,
  promptDayName,
  onPromptDismiss,
}: VersionItemsProps) {
  return (
    <div className={styles.rows}>
      {withGaps(items).map((row) => {
        if (row.kind === 'gap') {
          return (
            <GapRow
              key={`gap-${row.startsAtMinutes}-${row.endsAtMinutes}`}
              row={row}
              readOnly={readOnly}
              onFill={onFill && (() => onFill({ start: row.startsAtMinutes, end: row.endsAtMinutes }))}
            />
          );
        }

        const { item } = row;
        const line =
          item.entry?.kind === 'bundle' ? (
            <BundleBand
              item={item}
              readOnly={readOnly}
              onEditTime={onEditTime && ((start, end) => onEditTime(item.id, start, end))}
              onRemove={onRemoveItem && (() => onRemoveItem(item.id))}
            />
          ) : (
            <ItemLine
              item={item}
              readOnly={readOnly}
              onEditTime={onEditTime && ((start, end) => onEditTime(item.id, start, end))}
              onRemove={onRemoveItem && (() => onRemoveItem(item.id))}
            />
          );

        // The row that just landed, still being asked "when?". The prompt opens
        // directly under it — band or line alike — and the wrap rings the pair
        // so the question is visibly about this row and no other. A viewer is
        // never asked: they cannot have placed anything, and without an
        // onEditTime there would be nothing to save an answer with.
        if (item.id === promptItemId && !readOnly && onEditTime && onPromptDismiss) {
          return (
            <div key={item.id} className={styles.promptWrap}>
              {line}
              <TimePrompt
                title={item.entry?.title ?? 'Something kept'}
                dayName={promptDayName ?? ''}
                // The landed row is excluded from its own suggestions: it is
                // untimed, but its optimistic twin from a refetch race must
                // never be an edge the prompt suggests around.
                suggestions={suggestSlots(
                  items.filter((other) => other.id !== promptItemId),
                  item.entry?.duration_minutes ?? null,
                )}
                onSave={(start, end) => {
                  // A pair of nulls is "leave it loose" — the item is already
                  // untimed, so there is nothing to write, only a prompt to close.
                  if (start !== null || end !== null) onEditTime(item.id, start, end);
                  onPromptDismiss();
                }}
                onDismiss={onPromptDismiss}
              />
            </div>
          );
        }

        return <Fragment key={item.id}>{line}</Fragment>;
      })}
    </div>
  );
}
