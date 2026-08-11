import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Button } from '../../design/components/core/Button';
import { useToast } from '../../components/Toast';
import { useCreateEntry } from '../../api';
import { NEW_BUNDLE_DROP_ID } from './useCreateBundle';
import styles from './NewBundleBox.module.css';

export interface NewBundleBoxProps {
  /** The trip the new bundle nests under. */
  tripId: number;
  /** Success toast, routed through the board so every board message reads the same. */
  onToast: (message: string) => void;
}

/**
 * Starting a bundle used to be a modal behind a "New bundle" button. The
 * backlog moves it inline, to a box sitting on top of the bundle list — a
 * bundle is a container you fill, so the thing that makes one should be where
 * the filling happens, not a dialog that covers it.
 *
 * Two ways in, and they are not a fallback pair — they are two different
 * intents:
 *
 *  1. Drop an idea on the box. One gesture creates the bundle AND puts that
 *     idea in it (see useCreateBundleWithIdea). The board's DndContext owns
 *     `onDragEnd`, so all this component contributes is the drop target: a
 *     `useDroppable` keyed NEW_BUNDLE_DROP_ID and marked `{ newBundle: true }`
 *     so the handler can tell it apart from a real bundle's card.
 *  2. Type a name. That makes an empty bundle — explicitly allowed; an empty
 *     bundle is a placeholder for a decision you have not made yet ("day one
 *     dinner"), which is exactly the kind of thing this product refuses to
 *     make you resolve up front.
 *
 * The typed path is also the accessible equivalent of the drop, per the
 * board-wide rule that no interaction is drag-only. The input is labelled with
 * a real `<label for>` (visually hidden — the box already reads as one thing,
 * and a second visible label would fight the design's single centred line);
 * the placeholder is an example, never the label.
 *
 * The over-state is a border-colour change only. This design system has no
 * shadows, and hover/press are opacity — so "a drag is above me" gets the one
 * remaining channel.
 */
export function NewBundleBox({ tripId, onToast }: NewBundleBoxProps) {
  const { show } = useToast();
  const createEntry = useCreateEntry();
  const [name, setName] = useState('');
  const inputId = useId();
  const { setNodeRef, isOver } = useDroppable({
    id: NEW_BUNDLE_DROP_ID,
    data: { newBundle: true },
  });

  const trimmed = name.trim();
  const working = createEntry.isPending;

  // A real <form>, so Enter submits without a keydown handler of its own —
  // the browser already knows this shape.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmed || working) return;
    createEntry.mutate(
      { entry: { kind: 'bundle', title: trimmed }, parent_id: tripId },
      {
        onSuccess: () => {
          setName('');
          onToast(`Started ${trimmed}. Drop ideas in when you're ready.`);
        },
        onError: () => show("That didn't save. It's still here — try again.", 'error'),
      },
    );
  }

  return (
    <div ref={setNodeRef} className={[styles.box, isOver ? styles.over : ''].filter(Boolean).join(' ')}>
      <p className={styles.dropLine}>Drop ideas here to start a bundle</p>

      <form className={styles.form} onSubmit={submit}>
        <label className={styles.srOnly} htmlFor={inputId}>
          Name a new bundle
        </label>
        <input
          id={inputId}
          className={styles.input}
          type="text"
          value={name}
          placeholder="Or name one: day one dinner"
          disabled={working}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" variant="quiet" disabled={!trimmed || working}>
          Start it
        </Button>
      </form>
    </div>
  );
}
