import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Input } from '../design/components/core/Input';
import { Select } from '../design/components/core/Select';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { useEntries } from '../api/entries';
import { useCreateTodo, useTodos, useUpdateTodo } from '../api/todos';
import type { Entry, Todo } from '../api/types';
import { splitDoneOpen, sortOpenTodos } from '../features/checklist/checklistModel';
import { formatDay, joinMeta } from '../lib/formatDates';
import styles from './TripChecklist.module.css';

/**
 * /trips/:id/checklist — one list, two sources: trip-level todos ("apply for
 * visa") and todos hanging off any entry in the trip ("check opening time").
 * The API already merges both; this orders them and lets you check them off.
 *
 * Mobile-first, on paper — this is read in a queue, not on a desk.
 */
export function TripChecklist() {
  const { trip } = useOutletContext<{ trip: Entry }>();
  const { show } = useToast();

  const todosQuery = useTodos({ trip_id: trip.id });
  const entriesQuery = useEntries({ trip_id: trip.id });

  const [newTitle, setNewTitle] = useState('');
  const [forEntryId, setForEntryId] = useState<number | ''>('');
  const [showDone, setShowDone] = useState(false);

  const createTodo = useCreateTodo();

  const todos = useMemo(() => todosQuery.data ?? [], [todosQuery.data]);
  const entries = useMemo(() => entriesQuery.data ?? [], [entriesQuery.data]);

  // Todo.entry is a summary and carries no `scheduled` flag, so the ordering
  // rule ("a booking for tomorrow matters more than one for next week") needs
  // the trip's entries fetched alongside.
  const scheduledIds = useMemo(
    () => new Set(entries.filter((e) => e.scheduled).map((e) => e.id)),
    [entries],
  );

  const { open, done } = useMemo(() => splitDoneOpen(todos), [todos]);
  const openSorted = useMemo(() => sortOpenTodos(open, scheduledIds), [open, scheduledIds]);

  function handleAdd() {
    const title = newTitle.trim();
    if (!title) return;
    createTodo.mutate(
      {
        title,
        ...(forEntryId === '' ? { trip_id: trip.id } : { entry_id: Number(forEntryId) }),
      },
      {
        onSuccess: () => {
          setNewTitle('');
          setForEntryId('');
        },
        onError: () => show("That didn't save. It's still here — try again.", 'error'),
      },
    );
  }

  if (todosQuery.isLoading) return <Spinner label="Finding your checklist" />;

  return (
    <div className={styles.wrap}>
      <div className={styles.addRow}>
        <Input
          placeholder="What needs doing?"
          hint="↵"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
          }}
          aria-label="What needs doing?"
        />
        <label className={styles.forLabel}>
          <span className={styles.forLabelText}>For</span>
          {/* wrapperClassName, not className: the wrapper is the flex child of
              .forLabel, so `flex: 1` has to land there for the field to take
              the rest of the row. */}
          <Select
            wrapperClassName={styles.selectWrapper}
            value={forEntryId}
            onChange={(e) => setForEntryId(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">the whole trip</option>
            {entries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {todos.length === 0 ? (
        <EmptyState message="Nothing to check off. That's either very good or very early." />
      ) : (
        <>
          <ul className={styles.list}>
            {openSorted.map((todo) => (
              <TodoRow key={todo.id} todo={todo} />
            ))}
          </ul>

          {done.length > 0 && (
            <div className={styles.doneSection}>
              <button
                type="button"
                className={styles.doneToggle}
                onClick={() => setShowDone((v) => !v)}
                aria-expanded={showDone}
              >
                Done · {done.length}
              </button>
              {showDone && (
                <ul className={`${styles.list} ${styles.doneList}`}>
                  {done.map((todo) => (
                    <TodoRow key={todo.id} todo={todo} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** One checklist line. The circle is the same keep-toggle idiom as the board:
 * filled when done, ringed when open. Nothing is ever struck through. */
function TodoRow({ todo }: { todo: Todo }) {
  const { show } = useToast();
  const updateTodo = useUpdateTodo(todo.id);
  const isDone = todo.done_at !== null;

  function toggle() {
    updateTodo.mutate(
      { done_at: isDone ? null : new Date().toISOString() },
      { onError: () => show("That didn't save. It's still here — try again.", 'error') },
    );
  }

  const meta = joinMeta(
    todo.entry && todo.entry.kind !== 'trip' ? todo.entry.title : undefined,
    todo.due_on ? `by ${formatDay(todo.due_on)}` : undefined,
  );

  return (
    <li className={isDone ? `${styles.row} ${styles.rowDone}` : styles.row}>
      <button
        type="button"
        className={isDone ? `${styles.toggle} ${styles.toggleDone}` : styles.toggle}
        onClick={toggle}
        aria-pressed={isDone}
      >
        <span className={styles.srOnly}>
          {isDone ? `Mark ${todo.title} as still to do` : `Check off ${todo.title}`}
        </span>
      </button>
      <span className={styles.body}>
        <span className={styles.title}>{todo.title}</span>
        {meta && <span className={styles.meta}>{meta}</span>}
      </span>
    </li>
  );
}
