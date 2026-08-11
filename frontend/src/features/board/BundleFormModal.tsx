import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { Field } from '../../components/Field';
import { Button } from '../../design/components/core/Button';
import { useToast } from '../../components/Toast';
import { useUpdateEntry } from '../../api';
import type { Entry } from '../../api/types';

export interface BundleFormModalProps {
  open: boolean;
  onClose: () => void;
  /** The bundle being renamed. */
  bundle: Entry;
}

/**
 * Renaming a bundle. That is now this form's whole job.
 *
 * It used to do double duty — name a new bundle, or rename an existing one —
 * with the create half reached from a "New bundle" button above the rail.
 * Creating moved inline to NewBundleBox, because a bundle is started either by
 * dropping an idea onto it (a gesture a dialog cannot receive) or by typing a
 * placeholder name, and neither is worth covering the board for. Renaming is
 * different: it is a deliberate edit of something that already exists, with
 * one field and a clear commit, which is exactly what a small modal is for.
 * The create branch was removed rather than left dormant, so `bundle` is now
 * required and there is no `tripId` to pass.
 *
 * `close` is memoized (see NewIdeaModal.tsx's doc comment for the full
 * explanation) — Modal's focus effect re-fires and steals focus back to its
 * own chrome whenever the onClose reference it was given changes, which is
 * every keystroke for a plain inline function. Verified bug in Modal.tsx,
 * outside this task's ownership; worked around here, flagged in the report.
 */
export function BundleFormModal({ open, onClose, bundle }: BundleFormModalProps) {
  const { show } = useToast();
  const updateEntry = useUpdateEntry(bundle.id);
  const [name, setName] = useState(bundle.title);
  const working = updateEntry.isPending;

  // Fresh name each time this opens — the bundle's current title, discarding
  // any half-typed edit from a previous open. BundleCard keeps its
  // BundleFormModal mounted across opens, so this can't rely on unmount.
  useEffect(() => {
    if (open) setName(bundle.title);
  }, [open, bundle.title]);

  const close = useCallback(() => {
    if (working) return;
    onClose();
  }, [working, onClose]);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed || working) return;

    updateEntry.mutate(
      { entry: { title: trimmed } },
      {
        onSuccess: () => {
          show('Renamed.', 'success');
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
      title="Rename bundle"
      actions={
        <>
          <Button variant="quiet" onClick={close} disabled={working}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim() || working}>
            Save
          </Button>
        </>
      }
    >
      <Field
        label="What's it called?"
        placeholder="Day one dinner options"
        hint="↵"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
      />
    </Modal>
  );
}
