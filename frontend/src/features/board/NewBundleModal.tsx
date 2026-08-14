import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { Field } from '../../components/Field';
import { Button } from '../../design/components/core/Button';
import { useToast } from '../../components/Toast';
import { useCreateEntry } from '../../api';
import type { Entry } from '../../api/types';

export interface NewBundleModalProps {
  open: boolean;
  onClose: () => void;
  /** The trip the bundle nests under — without it, it belongs to no trip. */
  tripId: number;
  /** The bundle that now exists. The caller decides what goes into it. */
  onCreated: (bundle: Entry) => void;
}

/**
 * Naming a bundle you are about to start, as a dialog rather than a field in
 * the rail.
 *
 * This exists because of one line in the design: the "Add to" popover ends with
 * "A new bundle", and the mock creates it silently, named "New bundle". A rail
 * full of bundles called "New bundle", "New bundle (2)" is not a plan — the
 * whole point of a bundle is that its name is the decision ("Tuesday south",
 * "if it rains"). So the last row of that popover opens this, and the bundle
 * arrives named. One extra keystroke buys a thing you can still recognise in a
 * week.
 *
 * It is deliberately NOT a second copy of NewBundleForm. That form lives inside
 * the bundle rail, is mounted only while wanted, and takes focus on mount; this
 * is raised over the board from a popover that has to close first, and a dialog
 * is what says "the board is waiting for this". They share the create call and
 * nothing else, which is the honest amount of sharing between a form and a
 * dialog.
 *
 * `parent_id: tripId` is not decoration: `useEntries({ trip_id, kind:
 * 'bundle' })` finds bundles by walking down from the trip, so a bundle created
 * without that link exists but appears nowhere. It is the same attach the new
 * idea modal does.
 *
 * `close` is memoized for the reason NewIdeaModal spells out: Modal's focus
 * effect depends on its identity, and a fresh function every render steals
 * focus back from the field mid-word.
 */
export function NewBundleModal({ open, onClose, tripId, onCreated }: NewBundleModalProps) {
  const { show } = useToast();
  const createEntry = useCreateEntry();
  const [name, setName] = useState('');

  // This stays mounted across opens, so an abandoned name has to be cleared
  // explicitly rather than by unmounting.
  useEffect(() => {
    if (open) setName('');
  }, [open]);

  const close = useCallback(() => {
    if (createEntry.isPending) return;
    setName('');
    onClose();
  }, [createEntry.isPending, onClose]);

  const trimmed = name.trim();

  function submit() {
    if (!trimmed || createEntry.isPending) return;
    createEntry.mutate(
      { entry: { kind: 'bundle', title: trimmed }, parent_id: tripId },
      {
        onSuccess: (bundle) => {
          setName('');
          onCreated(bundle);
          onClose();
        },
        onError: () => show("That didn't save. It's still here — try again.", 'error'),
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Start a bundle"
      actions={
        <>
          <Button variant="quiet" onClick={close} disabled={createEntry.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!trimmed || createEntry.isPending}>
            Start it
          </Button>
        </>
      }
    >
      <Field
        label="What are you calling it?"
        placeholder="Day one dinner"
        hint="↵"
        value={name}
        autoFocus
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit();
        }}
      />
    </Modal>
  );
}
