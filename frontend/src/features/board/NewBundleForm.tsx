import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { Button } from '../../design/components/core/Button';
import { useToast } from '../../components/Toast';
import { useCanEdit } from '../../auth/TripRoleContext';
import { useCreateEntry } from '../../api';
import styles from './NewBundleForm.module.css';

export interface NewBundleFormProps {
  /** The trip the new bundle nests under. */
  tripId: number;
  /** Success toast, routed through the board so every board message reads the same. */
  onToast: (message: string) => void;
  /** Put the form away — after a bundle is made, or when the name is abandoned. */
  onClose: () => void;
}

/**
 * One field and one button: the name of a bundle you are about to start.
 *
 * This used to be half of a component called NewBundleBox, and the other half
 * was the design's dashed "Drop ideas here to start a bundle" target. That
 * target is gone. It read as the main act of the rail — a permanent hole at the
 * top of the bundle list, sized like a card but holding nothing — and it made a
 * bundle out of a gesture that is very easy to make by accident: a drag aimed
 * at the first bundle card and released twenty pixels high produced a whole new
 * bundle, auto-named after the idea, that nobody asked for. Dropping an idea
 * onto a bundle that already exists still works exactly as it did; what went is
 * only the "and invent one for me" case, which is now the explicit act of
 * naming a thing. See BundlePanel for where the button that opens this lives.
 *
 * The form is mounted only while it is wanted, so it takes focus on mount
 * rather than watching an `open` prop: arriving and being ready to type are the
 * same event here. Enter confirms — this is a real `<form>`, so the browser
 * already knows that shape and no keydown handler is needed for it. Escape puts
 * the form away; an abandoned name costs nothing and leaves nothing behind.
 *
 * An empty bundle is explicitly allowed. It is a placeholder for a decision you
 * have not made yet ("day one dinner"), which is exactly the kind of thing this
 * product refuses to make you resolve up front — so nothing here blocks the
 * create for want of contents.
 *
 * The input is labelled with a real `<label for>`, visually hidden because the
 * heading and the button that opened this already say what it is for; the
 * placeholder is an example, never the label.
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

  // Asking for the form is asking to type in it.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmed || working) return;
    createEntry.mutate(
      { entry: { kind: 'bundle', title: trimmed }, parent_id: tripId },
      {
        onSuccess: () => {
          setName('');
          onClose();
          onToast(`Started ${trimmed}. Drop ideas in when you're ready.`);
        },
        onError: () => show("That didn't save. It's still here — try again.", 'error'),
      },
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Escape') return;
    // Nothing else on the board is listening for Escape here, but the drawer
    // and modals are one route away — don't let a cancelled name close them too.
    event.stopPropagation();
    setName('');
    onClose();
  }

  // A viewer never opens this — BundlePanel's "+ New bundle" is gone — but the
  // form is a create surface and nothing else, so it refuses to render rather
  // than trusting its one caller. Same call as the two modals.
  if (!canEdit) return null;

  return (
    <form className={styles.form} onSubmit={submit} onKeyDown={onKeyDown}>
      <label className={styles.srOnly} htmlFor={inputId}>
        Name a new bundle
      </label>
      <input
        id={inputId}
        ref={inputRef}
        className={styles.input}
        type="text"
        value={name}
        placeholder="Day one dinner"
        disabled={working}
        onChange={(event) => setName(event.target.value)}
      />
      <Button type="submit" variant="quiet" size="small" disabled={!trimmed || working}>
        Create
      </Button>
    </form>
  );
}
