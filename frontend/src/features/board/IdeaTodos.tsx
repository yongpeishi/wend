import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../../design/components/core/Button';
import { useToast } from '../../components/Toast';
import { useCreateTodo, useTodos, useUpdateTodo } from '../../api';
import type { Todo } from '../../api/types';
import styles from './IdeaTodos.module.css';

export interface IdeaTodosProps {
  entryId: number;
  /** May you change this trip? A viewer sees the list, not the checkbox or the add row. */
  canEdit?: boolean;
}

const SAVE_FAILED = "That didn't save. It's still here — try again.";

/**
 * The to-dos hanging off one idea, shown inside its expanded row.
 *
 * The board's row already counts these ("2 open"); this is the count opened up,
 * so the answer to "which two?" no longer costs a trip to the checklist screen.
 * That framing sets the whole shape of the block: it is a glance and a tick,
 * not a second checklist. No deadlines, no reordering, no delete — those live
 * on the trip checklist, where there is room to mean them.
 *
 * The fetch is deliberately naive. One `useTodos({ entry_id })` per open row,
 * no prefetch and no shared cache warming, because the request only happens
 * once someone has asked for this idea specifically. Prefetching every row's
 * to-dos to save a request nobody may make is the more expensive mistake.
 */
export function IdeaTodos({ entryId, canEdit = true }: IdeaTodosProps) {
  const { show } = useToast();
  const todos = useTodos({ entry_id: entryId });
  const createTodo = useCreateTodo();
  const [title, setTitle] = useState('');
  const inputId = useId();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    // Nothing typed is not a failed save — it is someone who tabbed through the
    // row, or hit Enter twice. Say nothing and let them carry on.
    if (trimmed === '') return;
    createTodo.mutate(
      { title: trimmed, entry_id: entryId },
      {
        // Cleared on success only: a create that failed still has the words in
        // it, and taking them away would be the one thing worse than the error.
        onSuccess: () => setTitle(''),
        onError: () => show(SAVE_FAILED, 'error'),
      },
    );
  }

  return (
    <div className={styles.block}>
      <p className={styles.heading}>To-do</p>

      {/* No spinner. The panel has already opened and this strip is 30px tall;
          a spinner in it would be a second thing moving for a fetch that is
          usually over before the eye arrives. The heading and the add row stay
          put through the load, so nothing below them jumps when the list
          lands. */}
      {todos.isError && <p className={styles.failed}>Your to-dos didn&rsquo;t load.</p>}

      {todos.data && todos.data.length > 0 && (
        <ul className={styles.list}>
          {todos.data.map((todo) => (
            <TodoLine key={todo.id} todo={todo} canEdit={canEdit} />
          ))}
        </ul>
      )}

      {/* An empty list gets no empty state. The add row underneath is already a
          sentence about what to do with an idea that has no to-dos. */}

      {canEdit && (
        <form className={styles.addRow} onSubmit={submit}>
          {/* A real label, hidden from sight — the placeholder is the example
              (the three verbs), never the name of the field. */}
          <label className={styles.srOnly} htmlFor={inputId}>
            Add a to-do
          </label>
          <input
            id={inputId}
            className={styles.input}
            type="text"
            value={title}
            placeholder="+ to-do (book, reserve, buy...)"
            onChange={(event) => setTitle(event.target.value)}
          />
          {/* A real form, so Enter in the field is the whole interaction and the
              button is the pointer's copy of it — not the only way through. */}
          <Button type="submit" variant="secondary" size="small" disabled={createTodo.isPending}>
            Add
          </Button>
        </form>
      )}
    </div>
  );
}

/**
 * One to-do line: the box, then what has to be done.
 *
 * Its own component because `useUpdateTodo` fixes the id at hook-call time, so
 * the row that owns the id has to be the thing that calls the hook. Kept
 * unexported — this file's export surface is `IdeaTodos` alone.
 *
 * The box is a `<button role="checkbox">` rather than an `<input type=checkbox>`
 * for the same reason as the pick circle in IdeaRow: a native checkbox cannot
 * carry this border weight, this radius or the leaf fill without being hidden
 * and redrawn from a pseudo-element anyway, at which point it is a button with
 * extra steps and worse focus behaviour. The role keeps the semantics honest.
 *
 * For a viewer the box stays and stops being a button. It is the only place the
 * line says whether the thing is done, so deleting it would delete the answer
 * along with the affordance — and architecture.md §5 will not let a greyed-out
 * control stand in for "not yours to touch".
 */
function TodoLine({ todo, canEdit }: { todo: Todo; canEdit: boolean }) {
  const { show } = useToast();
  const updateTodo = useUpdateTodo(todo.id);
  const done = todo.done_at !== null;
  const titleId = useId();

  function toggle() {
    // No optimistic write: the mutation invalidates the list on success and the
    // round trip is one small PATCH. What the tick does need is to stop taking
    // clicks while it is in flight, so a double tap cannot send the reverse of
    // what the first one asked for.
    updateTodo.mutate(
      { done_at: done ? null : new Date().toISOString() },
      { onError: () => show(SAVE_FAILED, 'error') },
    );
  }

  const boxClass = [styles.box, done ? styles.boxDone : ''].filter(Boolean).join(' ');
  const tick = done ? (
    <span className={styles.tick} aria-hidden="true">
      ✓
    </span>
  ) : null;

  return (
    <li className={styles.item}>
      {canEdit ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-labelledby={titleId}
          className={boxClass}
          disabled={updateTodo.isPending}
          onClick={toggle}
        >
          {tick}
        </button>
      ) : (
        <span
          role="img"
          aria-label={done ? 'Done' : 'Not done'}
          className={[boxClass, styles.boxStill].join(' ')}
        >
          {tick}
        </span>
      )}
      <span id={titleId} className={done ? `${styles.title} ${styles.titleDone}` : styles.title}>
        {todo.title}
      </span>
    </li>
  );
}
