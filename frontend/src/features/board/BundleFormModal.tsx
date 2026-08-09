import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { Field } from '../../components/Field';
import { Button } from '../../design/components/core/Button';
import { useToast } from '../../components/Toast';
import { useCreateEntry, useUpdateEntry } from '../../api';
import type { Entry } from '../../api/types';

export interface BundleFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Present when renaming an existing bundle; omit to start a new one. */
  bundle?: Entry;
  /** Required when `bundle` is omitted — the trip the new bundle nests under. */
  tripId?: number;
}

/**
 * One small form, two jobs: name a new bundle, or rename an existing one.
 * A bundle is an Entry with kind: "bundle" (architecture.md §3 rule 4) — the
 * create path is just useCreateEntry with parent_id: tripId, same shape as
 * any other entry; membership and ordering live entirely in entry_links,
 * which this form doesn't touch.
 *
 * `close` is memoized (see NewIdeaModal.tsx's doc comment for the full
 * explanation) — Modal's focus effect re-fires and steals focus back to its
 * own chrome whenever the onClose reference it was given changes, which is
 * every keystroke for a plain inline function. Verified bug in Modal.tsx,
 * outside this task's ownership; worked around here, flagged in the report.
 */
export function BundleFormModal({ open, onClose, bundle, tripId }: BundleFormModalProps) {
  const { show } = useToast();
  const createEntry = useCreateEntry();
  const updateEntry = useUpdateEntry(bundle?.id ?? 0);
  const [name, setName] = useState('');
  const working = createEntry.isPending || updateEntry.isPending;

  // Fresh name each time this opens: the bundle's current title when
  // renaming, blank when starting a new one. BundleCard keeps its
  // BundleFormModal mounted across opens, so this can't rely on unmount.
  useEffect(() => {
    if (open) setName(bundle?.title ?? '');
  }, [open, bundle?.title]);

  const close = useCallback(() => {
    if (working) return;
    onClose();
  }, [working, onClose]);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed || working) return;

    if (bundle) {
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
      return;
    }

    if (tripId === undefined) return;
    createEntry.mutate(
      { entry: { kind: 'bundle', title: trimmed }, parent_id: tripId },
      {
        onSuccess: () => {
          show('Bundle started.', 'success');
          setName('');
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
      title={bundle ? 'Rename bundle' : 'New bundle'}
      actions={
        <>
          <Button variant="quiet" onClick={close} disabled={working}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim() || working}>
            {bundle ? 'Save' : 'Start the bundle'}
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
