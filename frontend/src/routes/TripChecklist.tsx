import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Button } from '../design/components/core/Button';
import { useCanEdit } from '../auth/TripRoleContext';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { useEntries } from '../api/entries';
import { useTodos, useUpdateTodo } from '../api/todos';
import type { Entry, Todo } from '../api/types';
import { splitDoneOpen, sortOpenTodos } from '../features/checklist/checklistModel';
import { DeadlineField } from '../features/checklist/DeadlineField';
import { NewTodoForm } from '../features/checklist/NewTodoForm';
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
  const canEdit = useCanEdit();

  const todosQuery = useTodos({ trip_id: trip.id });
  const entriesQuery = useEntries({ trip_id: trip.id });

  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);

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

  if (todosQuery.isLoading) return <Spinner label="Finding your checklist" />;

  return (
    <div className={styles.wrap}>
      {/* Nothing rendered rather than anything made readOnly. The rule that a
          text field goes readOnly is about fields holding something to read;
          a composer holds nothing by definition — it is a button with a place to
          type in it, and an inert one would be chrome standing where a control
          used to be. The share panel's own add form is hidden the same way for
          the same reason. The form refuses for a viewer on its own account too;
          this check is about not offering the door, not about locking it.

          The trigger stays here and the form does not: the route owns whether
          the composer is wanted, the composer owns everything about the todo
          being written. Same split as BundlePanel and NewBundleForm. */}
      {canEdit &&
        (adding ? (
          <NewTodoForm tripId={trip.id} entries={entries} onClose={() => setAdding(false)} />
        ) : (
          <div className={styles.addCta}>
            <Button variant="secondary" size="small" onClick={() => setAdding(true)}>
              + Add a todo
            </Button>
          </div>
        ))}

      {todos.length === 0 ? (
        <EmptyState message="Nothing to check off. That's either very good or very early." />
      ) : (
        <>
          <div className={styles.section}>
            {/* Counted like the Done toggle below and wearing the same label,
                but a heading rather than a button: there is nothing here to
                collapse, since the open list is what the page is for. */}
            {openSorted.length > 0 && <h2 className={styles.openHeading}>Todo · {openSorted.length}</h2>}
            <ul className={styles.list}>
              {openSorted.map((todo) => (
                <TodoRow key={todo.id} todo={todo} canEdit={canEdit} />
              ))}
            </ul>
          </div>

          {done.length > 0 && (
            <div className={styles.section}>
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
                    <TodoRow key={todo.id} todo={todo} canEdit={canEdit} />
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

/**
 * One checklist line, read left to right: the circle, what has to be done, then
 * what it belongs to and when it's due, both quiet and pushed to the right. The
 * two on the right are separate cells rather than one middot-joined string —
 * the deadline is a control, not text, and it has to keep its own edge.
 *
 * The circle is the same keep-toggle idiom as the board: filled when done,
 * ringed when open. Nothing is ever struck through.
 *
 * For a viewer the circle stays and stops being a button. It is the only place
 * this row says whether the thing is done, so removing it would remove the
 * answer along with the affordance — the mark is drawn on a span instead, with
 * the state still spelled out for a screen reader.
 */
function TodoRow({ todo, canEdit }: { todo: Todo; canEdit: boolean }) {
  const { show } = useToast();
  const updateTodo = useUpdateTodo(todo.id);
  const isDone = todo.done_at !== null;

  function save(payload: Parameters<typeof updateTodo.mutate>[0]) {
    updateTodo.mutate(payload, {
      onError: () => show("That didn't save. It's still here — try again.", 'error'),
    });
  }

  function toggle() {
    save({ done_at: isDone ? null : new Date().toISOString() });
  }

  // A trip-level todo prints no source at all. Saying "In general" on what is
  // usually most of the list would be noise, not information.
  const source = todo.entry && todo.entry.kind !== 'trip' ? todo.entry.title : null;
  // A viewer with neither a source nor a deadline has an empty right-hand pair,
  // and an empty cell would still take the row's gap.
  const hasMeta = source !== null || canEdit || todo.due_on !== null;

  return (
    <li className={isDone ? `${styles.row} ${styles.rowDone}` : styles.row}>
      {canEdit ? (
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
      ) : (
        <span
          className={[styles.toggle, styles.toggleStill, isDone ? styles.toggleDone : '']
            .filter(Boolean)
            .join(' ')}
        >
          <span className={styles.srOnly}>{isDone ? 'Done' : 'Still to do'}</span>
        </span>
      )}
      <span className={styles.body}>
        <span className={styles.title}>{todo.title}</span>
        {hasMeta && (
          <span className={styles.meta}>
            {source && <span className={styles.source}>{source}</span>}
            <DeadlineField
              className={styles.deadline}
              value={todo.due_on}
              onChange={(next) => save({ due_on: next })}
              readOnly={!canEdit}
              label={`By when for ${todo.title}`}
            />
          </span>
        )}
      </span>
    </li>
  );
}
