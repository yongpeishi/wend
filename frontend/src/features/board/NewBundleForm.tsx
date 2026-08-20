import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useToast } from '../../components/Toast';
import { useCanEdit } from '../../auth/TripRoleContext';
import { useCreateEntry } from '../../api';
import styles from './NewBundleForm.module.css';

export interface NewBundleFormProps {
  /** The trip the new plan nests under. */
  tripId: number;
  /** Success toast, routed through the board so every board message reads the same. */
  onToast: (message: string) => void;
  /** Put the form away — after a plan is made, or when the name is abandoned. */
  onClose: () => void;
}

/**
 * One field: the name of a plan you are about to start. It swaps in for the
 * rail's "+ New plan" button (see BundlePanel), so it wears the same 2px leaf
 * border on the same card radius — the button in its open state, not a second
 * object.
 *
 * This used to be half of a component called NewBundleBox, and the other half
 * was the design's dashed "Drop ideas here" target. That target is gone. It
 * made a plan out of a gesture that is very easy to make by accident: a drag
 * aimed at the first card and released twenty pixels high produced a whole new
 * plan, auto-named after the idea, that nobody asked for. Dropping an idea
 * onto a plan that already exists still works exactly as it did; what went is
 * only the "and invent one for me" case, which is now the explicit act of
 * naming a thing.
 *
 * The form is mounted only while it is wanted, so it takes focus on mount
 * rather than watching an `open` prop: arriving and being ready to type are the
 * same event here. Enter with text creates the plan — handled on the field
 * itself with preventDefault, so the browser's implicit single-field submission
 * can never fire a second create alongside it. Escape puts the form away; an
 * abandoned name costs nothing and leaves nothing behind.
 *
 * An empty plan is explicitly allowed. It is a placeholder for a decision you
 * have not made yet ("day one dinner"), which is exactly the kind of thing this
 * product refuses to make you resolve up front — so nothing here blocks the
 * create for want of contents.
 *
 * The input is labelled with a real `<label for>`, visually hidden because the
 * heading and the button this swapped in for already say what it is for; the
 * placeholder is an example of how little is needed, never the label.
 */
export function NewBundleForm({ tripId, onToast, onClose }: NewBundleFormProps) {
  const canEdit = useCanEdit();
  const { show } = useToast();
  const createEntry = useCreateEntry();
  const [name, setName] = useState('');
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = name.trim();
  const working = createEntry.isPending;

  // Asking for the field is asking to type in it.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function create() {
    if (!trimmed || working) return;
    createEntry.mutate(
      { entry: { kind: 'bundle', title: trimmed }, parent_id: tripId },
      {
        onSuccess: () => {
          setName('');
          onClose();
          onToast(`Made "${trimmed}". Drop ideas in whenever.`);
        },
        onError: () => show("That didn't save. It's still here — try again.", 'error'),
      },
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create();
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    // preventDefault so the form's own implicit submission cannot double up
    // with this create in a real browser.
    event.preventDefault();
    create();
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Escape') return;
    // Nothing else on the board is listening for Escape here, but the drawer
    // and modals are one route away — don't let a cancelled name close them too.
    event.stopPropagation();
    setName('');
    onClose();
  }

  // A viewer never opens this — BundlePanel's "+ New plan" is gone — but the
  // form is a create surface and nothing else, so it refuses to render rather
  // than trusting its one caller. Same call as the two modals.
  if (!canEdit) return null;

  return (
    <form className={styles.form} onSubmit={submit} onKeyDown={onKeyDown}>
      <label className={styles.srOnly} htmlFor={inputId}>
        Name a new plan
      </label>
      <input
        id={inputId}
        ref={inputRef}
        className={styles.input}
        type="text"
        value={name}
        placeholder="Name the plan — that's enough"
        disabled={working}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={onInputKeyDown}
      />
    </form>
  );
}
