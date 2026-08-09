import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../../components/Modal';
import { Field } from '../../components/Field';
import { Button } from '../../design/components/core/Button';
import { useToast } from '../../components/Toast';
import { api, queryKeys, useCreateEntry } from '../../api';
import type { EntryLink } from '../../api/types';

export interface TakeSomewhereModalProps {
  open: boolean;
  onClose: () => void;
  selectedCount: number;
  selectedIds: number[];
  /** Called once the trip exists and every selected idea is linked into it. */
  onDone: (tripId: number) => void;
}

/**
 * screens.md's exact inspiration->trip flow: name a new trip, and every
 * selected idea gets a POST /entries/:id/links into it — a link, never a
 * move, so the same ideas keep whatever other parents they already had.
 *
 * useCreateLink(parentId) from src/api/links.ts bakes its parent id in at
 * hook-call time, which doesn't fit here — the parent (the new trip) doesn't
 * exist until this runs. This uses the underlying `api` client directly
 * (exported for exactly this) with the trip id known only once creation
 * resolves, instead of reaching into api/links.ts to add a variant.
 */
export function TakeSomewhereModal({ open, onClose, selectedCount, selectedIds, onDone }: TakeSomewhereModalProps) {
  const { show } = useToast();
  const queryClient = useQueryClient();
  const createEntry = useCreateEntry();
  const linkChild = useMutation({
    mutationFn: ({ parentId, childId }: { parentId: number; childId: number }) =>
      api.post<{ link: EntryLink }>(`/entries/${parentId}/links`, { child_id: childId }).then((r) => r.link),
  });
  const [title, setTitle] = useState('');
  const [working, setWorking] = useState(false);

  function close() {
    if (working) return;
    setTitle('');
    onClose();
  }

  async function start() {
    const name = title.trim();
    if (!name || working || selectedIds.length === 0) return;
    setWorking(true);
    try {
      const trip = await createEntry.mutateAsync({ entry: { kind: 'trip', title: name } });
      await Promise.all(selectedIds.map((childId) => linkChild.mutateAsync({ parentId: trip.id, childId })));
      await queryClient.invalidateQueries({ queryKey: queryKeys.entries.all });
      show(`${name} is started.`, 'success');
      setTitle('');
      onDone(trip.id);
    } catch {
      show("That didn't save. It's still here — try again.", 'error');
    } finally {
      setWorking(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Take these somewhere"
      actions={
        <>
          <Button variant="quiet" onClick={close} disabled={working}>
            Cancel
          </Button>
          <Button onClick={start} disabled={!title.trim() || working}>
            Start the trip
          </Button>
        </>
      }
    >
      <Field
        label="What's this trip called?"
        placeholder="Where are you going?"
        hint="↵"
        value={title}
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') start();
        }}
        description={`${selectedCount} ${selectedCount === 1 ? 'idea links' : 'ideas link'} into it. Linking never deletes or moves them.`}
      />
    </Modal>
  );
}
