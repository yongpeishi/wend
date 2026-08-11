import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
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
 *  2. Ask for one by name. That makes an empty bundle — explicitly allowed; an
 *     empty bundle is a placeholder for a decision you have not made yet ("day
 *     one dinner"), which is exactly the kind of thing this product refuses to
 *     make you resolve up front.
 *
 * The name field is not standing open. A permanently-open input read as the
 * main act of the panel and gave the dashed box two jobs at once; now the box
 * says the two ways in, in words, and "create new bundle" opens a box for the
 * name at the top of the list. Enter confirms it, Escape puts it away — an
 * abandoned name costs nothing and leaves nothing behind.
 *
 * The typed path is the accessible equivalent of the drop, per the board-wide
 * rule that no interaction is drag-only. The input is labelled with a real
 * `<label for>` (visually hidden — the box it sits in already reads as one
 * thing); the placeholder is an example, never the label.
 *
 * The over-state is a border-colour change only. This design system has no
 * shadows, and hover/press are opacity — so "a drag is above me" gets the one
 * remaining channel.
 */
export function NewBundleBox({ tripId, onToast }: NewBundleBoxProps) {
  const { show } = useToast();
  const createEntry = useCreateEntry();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { setNodeRef, isOver } = useDroppable({
    id: NEW_BUNDLE_DROP_ID,
    data: { newBundle: true },
  });

  const trimmed = name.trim();
  const working = createEntry.isPending;

  // Asking for the box is asking to type in it.
  useEffect(() => {
    if (naming) inputRef.current?.focus();
  }, [naming]);

  function startNaming() {
    setNaming(true);
    // Already open: put the cursor back rather than doing nothing visible.
    inputRef.current?.focus();
  }

  function cancel() {
    setNaming(false);
    setName('');
  }

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
          setNaming(false);
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
    cancel();
  }

  return (
    <div className={styles.wrap}>
      <div ref={setNodeRef} className={[styles.box, isOver ? styles.over : ''].filter(Boolean).join(' ')}>
        <p className={styles.dropLine}>
          Drop ideas here to start a bundle,
          <br />
          or{' '}
          <button type="button" className={styles.link} onClick={startNaming}>
            create new bundle
          </button>
        </p>
      </div>

      {naming && (
        <form className={styles.namingBox} onSubmit={submit} onKeyDown={onKeyDown}>
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
          <Button type="submit" variant="quiet" disabled={!trimmed || working}>
            Start it
          </Button>
        </form>
      )}
    </div>
  );
}
