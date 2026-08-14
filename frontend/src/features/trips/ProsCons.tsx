import { useRef, useState } from 'react';
import { useUpdateEntry } from '../../api/entries';
import type { EntryNote, EntryWritePayload } from '../../api/types';
import styles from './ProsCons.module.css';

type Side = 'pros' | 'cons';

export interface ProsConsProps {
  entryId: number;
  /** The trip's title, used only to keep the buttons' accessible names unique
   * across a grid of cards ("Add a pro to Malaysia"). */
  tripTitle: string;
  pros: EntryNote[];
  cons: EntryNote[];
  /**
   * May you change these reasons? Defaults to true, matching a null role — the
   * library and `/` are yours. False takes the verbs away and leaves the
   * reasons: the two columns are the content, not the controls.
   */
  canEdit?: boolean;
}

interface Column {
  side: Side;
  label: string;
  /** Singular, for button labels: "add pro" / "Remove pro". */
  noun: string;
  labelClass: string;
  rowClass: string;
}

const COLUMNS: Column[] = [
  { side: 'pros', label: 'Pros', noun: 'pro', labelClass: styles.prosLabel, rowClass: styles.proRow },
  { side: 'cons', label: 'Cons', noun: 'con', labelClass: styles.consLabel, rowClass: styles.conRow },
];

/**
 * The two-column reason list on a trip card — why this trip, and why not yet.
 *
 * There is no per-note endpoint: a note is a line in a JSON array on the entry,
 * so every add and remove PATCHes the whole array back through `useUpdateEntry`.
 * Ids are minted here (`crypto.randomUUID()`), which is what lets remove target
 * one line rather than an index that shifts under a concurrent edit.
 *
 * The design's prototype appended a literal "New pro" on click. Here the add
 * button opens an inline input instead: Enter or blur commits, Escape cancels,
 * and an empty value never becomes a note.
 *
 * Without `canEdit` the add buttons and the per-note removes are not rendered
 * at all, rather than disabled — a greyed control says "refused", and a viewer
 * was never offered this in the first place (architecture.md §5). The notes
 * themselves are untouched: full contrast, selectable, all of them.
 */
export function ProsCons({ entryId, tripTitle, pros, cons, canEdit = true }: ProsConsProps) {
  const update = useUpdateEntry(entryId);
  const [adding, setAdding] = useState<Side | null>(null);
  const [draft, setDraft] = useState('');
  // One input session ends exactly once. Enter commits and unmounts the input,
  // which fires blur straight after — without this the same text would be
  // added twice.
  const settled = useRef(true);

  const notesFor = (side: Side) => (side === 'pros' ? pros : cons);

  function save(side: Side, notes: EntryNote[]) {
    const entry: EntryWritePayload = side === 'pros' ? { pros: notes } : { cons: notes };
    update.mutate({ entry });
  }

  function openInput(side: Side) {
    settled.current = false;
    setDraft('');
    setAdding(side);
  }

  function closeInput(side: Side, keep: boolean) {
    if (settled.current) return;
    settled.current = true;
    const text = draft.trim();
    setAdding(null);
    setDraft('');
    if (!keep || !text) return;
    save(side, [...notesFor(side), { id: crypto.randomUUID(), text }]);
  }

  function removeNote(side: Side, id: string) {
    save(
      side,
      notesFor(side).filter((note) => note.id !== id),
    );
  }

  return (
    <div className={styles.columns}>
      {COLUMNS.map((column) => {
        const notes = notesFor(column.side);
        return (
          <div key={column.side} className={styles.column}>
            <div className={[styles.label, column.labelClass].join(' ')}>{column.label}</div>

            {notes.length > 0 && (
              <ul className={styles.list} aria-label={`${column.label} for ${tripTitle}`}>
                {notes.map((note) => (
                  <li key={note.id} className={[styles.row, column.rowClass].join(' ')}>
                    <span className={styles.text}>{note.text}</span>
                    {canEdit && (
                      <button
                        type="button"
                        className={styles.remove}
                        aria-label={`Remove ${column.noun}: ${note.text}`}
                        onClick={() => removeNote(column.side, note.id)}
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* The input is the add button mid-use, not a field holding
                something to read, so it goes with the button rather than
                turning readOnly — the same call the checklist's add row makes.
                It is unreachable without the button anyway. */}
            {canEdit &&
              (adding === column.side ? (
                <input
                  className={styles.input}
                  autoFocus
                  value={draft}
                  placeholder={column.side === 'pros' ? 'What makes it worth it?' : "What's in the way?"}
                  aria-label={`New ${column.noun} for ${tripTitle}`}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={() => closeInput(column.side, true)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      closeInput(column.side, true);
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      closeInput(column.side, false);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={styles.add}
                  aria-label={`Add a ${column.noun} to ${tripTitle}`}
                  onClick={() => openInput(column.side)}
                >
                  + add {column.noun}
                </button>
              ))}
          </div>
        );
      })}
    </div>
  );
}
