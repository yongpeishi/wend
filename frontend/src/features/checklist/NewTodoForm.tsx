import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { ArrowUp, X } from 'lucide-react';
import { Select } from '../../design/components/core/Select';
import { useToast } from '../../components/Toast';
import { useCanEdit } from '../../auth/TripRoleContext';
import { useCreateTodo } from '../../api/todos';
import type { Entry } from '../../api/types';
import { DeadlineField } from './DeadlineField';
import styles from './NewTodoForm.module.css';

export interface NewTodoFormProps {
  /** The trip a general todo hangs off when no idea is chosen. */
  tripId: number;
  /** Everything in the trip a todo could be about, for the "For" picker. */
  entries: Entry[];
  /** Put the composer away — on Escape, or on the cancel control. */
  onClose: () => void;
}

/**
 * The thing you are about to add to the checklist, and the two settings it can
 * carry: what it is for, and by when.
 *
 * This replaces an "add row" that could not be submitted. That row's only route
 * to a create was an Enter keydown on the title field, which is fine right up to
 * the moment you touch the deadline: setting one leaves focus on DeadlineField's
 * trigger, where Enter re-opens the picker, and Enter inside the picker commits
 * the day and hands focus back to that same trigger. So a todo with a deadline
 * could only be saved by knowing to click back into the title field first, and
 * on a phone — no keyboard, no Enter — not at all. A form with a submit button
 * in it is not a polish pass here; it is the fix.
 *
 * Shaped like the board's new-bundle row (NewBundleForm.tsx), for the same
 * reasons and with the same idioms: mounted only while it is wanted, so it takes
 * focus on mount rather than watching an `open` prop — asking for the composer
 * is asking to type in it. Enter confirms, because this is a real `<form>` and
 * the browser already knows that shape. Escape puts it away; an abandoned todo
 * costs nothing and leaves nothing behind.
 *
 * Laid out as one card rather than a stack of fields, which is the shape of
 * every inline task composer people already use: the title on the first line,
 * sitting straight on the card with no border of its own, and the settings
 * underneath as chips. The alternative — a bordered <Input> inside a bordered
 * card — draws two nested boxes for one thing being typed, and the field's own
 * 48px block makes "what needs doing" look like a form to fill in rather than a
 * line to write. The card carries the focus ring on the title's behalf, which is
 * exactly what <Input> does one level further in.
 *
 * A successful create clears the composer and leaves it open with focus back in
 * the title, rather than closing it. A checklist is written in bursts — visa,
 * then pass, then the hotel email — and closing after each one would charge a
 * click for every item after the first. The board's form closes on success
 * because a bundle is a considered thing you make one of; a todo is not.
 *
 * On failure nothing is cleared. The toast says the words the rest of the app
 * says, and everything typed is still there to try again with.
 *
 * A viewer never reaches this — the trigger that mounts it is behind the same
 * check — but a create surface refuses on its own account rather than trusting
 * its caller. Same call as NewBundleForm and the two modals.
 */
export function NewTodoForm({ tripId, entries, onClose }: NewTodoFormProps) {
  const canEdit = useCanEdit();
  const { show } = useToast();
  const createTodo = useCreateTodo();

  const [title, setTitle] = useState('');
  const [forEntryId, setForEntryId] = useState<number | ''>('');
  const [dueOn, setDueOn] = useState<string | null>(null);

  const titleId = useId();
  const forId = useId();
  const titleRef = useRef<HTMLInputElement>(null);

  const trimmed = title.trim();
  const working = createTodo.isPending;

  // Asking for the composer is asking to type in it.
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmed || working) return;
    createTodo.mutate(
      {
        title: trimmed,
        // "In general" is a todo about the trip, not about anything in it —
        // which is most of the list, so it is the default.
        ...(forEntryId === '' ? { trip_id: tripId } : { entry_id: Number(forEntryId) }),
        // Omitted rather than sent as null: no deadline is the absence of an
        // answer, and the API's default already says so.
        ...(dueOn === null ? {} : { due_on: dueOn }),
      },
      {
        onSuccess: () => {
          setTitle('');
          setForEntryId('');
          setDueOn(null);
          // The settings reset with the title because they belonged to the item
          // that just left. A deadline is the one that would hurt if it stuck:
          // it would silently land on the next three things typed.
          titleRef.current?.focus();
        },
        onError: () => show("That didn't save. It's still here — try again.", 'error'),
      },
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Escape') return;
    // DeadlineField stops Escape at the picker while the picker is open, so an
    // escaped date closes the date and nothing else — the composer only ever
    // sees the Escape that was meant for it. Stopped again here because the
    // drawer and the modals listen for Escape one route away.
    event.stopPropagation();
    onClose();
  }

  if (!canEdit) return null;

  return (
    <form className={styles.form} onSubmit={submit} onKeyDown={onKeyDown}>
      {/* Real labels, hidden from sight. The placeholder is the example, never
          the name of the field. */}
      <label className={styles.srOnly} htmlFor={titleId}>
        What needs doing?
      </label>
      <input
        id={titleId}
        ref={titleRef}
        className={styles.title}
        type="text"
        value={title}
        placeholder="What needs doing?"
        onChange={(event) => setTitle(event.target.value)}
      />

      {/* What it is for, by when, and the two ways out — one line of chips with
          the actions pushed to the far end of it. */}
      <div className={styles.controls}>
        <label className={styles.srOnly} htmlFor={forId}>
          For
        </label>
        <Select
          id={forId}
          className={styles.chipSelect}
          wrapperClassName={styles.chipWrapper}
          value={forEntryId}
          onChange={(event) => setForEntryId(event.target.value === '' ? '' : Number(event.target.value))}
        >
          <option value="">In general</option>
          {entries.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.title}
            </option>
          ))}
        </Select>

        <DeadlineField
          className={styles.chipDeadline}
          value={dueOn}
          onChange={setDueOn}
          label="By when for the new item"
        />

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onClose} aria-label="Cancel this todo">
            <X size={18} strokeWidth={1.5} aria-hidden="true" />
          </button>
          {/* An arrow, not the word "Add": the row it sits on is already three
              controls wide and a fourth label would be the loudest thing on a
              card whose job is to hold one line of typing. The accessible name
              still says it in words, and the shape — filled circle, forward
              arrow — is the one every composer in the world uses for send. */}
          <button
            type="submit"
            className={styles.submit}
            disabled={!trimmed || working}
            aria-label="Add this todo"
          >
            <ArrowUp size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
    </form>
  );
}
