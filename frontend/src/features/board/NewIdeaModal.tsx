import { useCallback, useEffect, useId, useState } from 'react';
import { Modal } from '../../components/Modal';
import { Field } from '../../components/Field';
import { Stack } from '../../components/layout/Stack';
import { Button } from '../../design/components/core/Button';
import { useToast } from '../../components/Toast';
import { useCreateEntry } from '../../api';
import type { Entry, EntryCategory, EntryWritePayload } from '../../api/types';
import { CATEGORY_LABELS, CATEGORY_ORDER } from './filters';
import styles from './NewIdeaModal.module.css';

export interface NewIdeaModalProps {
  open: boolean;
  onClose: () => void;
  /** Where the idea nests — the trip root, or whichever tree node is scoped. */
  parentId: number;
  onCreated?: (entry: Entry) => void;
}

interface Draft {
  title: string;
  description: string;
  category: EntryCategory | '';
  location_name: string;
  address: string;
  duration_minutes: string;
  source_url: string;
}

const EMPTY_DRAFT: Draft = {
  title: '',
  description: '',
  category: '',
  location_name: '',
  address: '',
  duration_minutes: '',
  source_url: '',
};

/**
 * Capturing an idea, from a single word to the full picture. Collection
 * mode's whole point is that saving something costs almost nothing (an
 * Instagram find must land in seconds), so the name field is focused the
 * instant this opens and every other field is optional — type a name, hit
 * return, it exists. Description, category, location, duration and source
 * can be filled in now or edited later from the drawer at /entries/:id,
 * which is the same set of fields in the same order (see EntryDetail.tsx).
 *
 * Unlike EntryDetail's <Field label="…"><input/></Field> usage, every Field
 * here is given its value/onChange directly as props — Field renders its own
 * <Input> from props and does not forward children, so passing an <input> as
 * a child silently produces an uncontrolled, empty field (verified: it
 * actually throws, since the children prop ends up spread onto the native
 * void <input> element). That mismatch lives in a file this task does not
 * own; flagged in the report rather than fixed here.
 *
 * `close` is wrapped in useCallback rather than declared as a plain function.
 * Modal's own focus effect depends on `[open, onClose]` and calls
 * `dialogRef.current?.focus()` whenever it re-runs — with an unmemoized
 * onClose (a fresh function every render), that effect re-fires on every
 * keystroke here and steals focus back to the dialog chrome mid-word
 * (verified: typing more than one character into a Field inside <Modal>
 * loses everything after the first). Keeping `close`'s identity stable is
 * the workaround available from outside Modal.tsx, which this task doesn't
 * own; flagged in the report as a real, verified bug worth fixing at the
 * source.
 */
export function NewIdeaModal({ open, onClose, parentId, onCreated }: NewIdeaModalProps) {
  const { show } = useToast();
  const createEntry = useCreateEntry();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const descriptionId = useId();
  const categoryId = useId();

  // Fresh form every time this opens — NewIdeaModal itself stays mounted
  // across opens/closes (TripBoard always renders it), so the draft has to
  // be reset explicitly rather than relying on unmount.
  useEffect(() => {
    if (open) setDraft(EMPTY_DRAFT);
  }, [open]);

  const close = useCallback(() => {
    if (createEntry.isPending) return;
    setDraft(EMPTY_DRAFT);
    onClose();
  }, [createEntry.isPending, onClose]);

  function submit() {
    const title = draft.title.trim();
    if (!title || createEntry.isPending) return;

    const entry: EntryWritePayload = { kind: 'idea', title };
    if (draft.description.trim()) entry.description = draft.description.trim();
    if (draft.category) entry.category = draft.category;
    if (draft.location_name.trim()) entry.location_name = draft.location_name.trim();
    if (draft.address.trim()) entry.address = draft.address.trim();
    if (draft.source_url.trim()) entry.source_url = draft.source_url.trim();
    if (draft.duration_minutes.trim()) {
      const minutes = Number(draft.duration_minutes);
      if (!Number.isNaN(minutes)) entry.duration_minutes = minutes;
    }

    createEntry.mutate(
      { entry, parent_id: parentId },
      {
        onSuccess: (created) => {
          setDraft(EMPTY_DRAFT);
          onCreated?.(created);
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
      title="Add an idea"
      actions={
        <>
          <Button variant="quiet" onClick={close} disabled={createEntry.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!draft.title.trim() || createEntry.isPending}>
            Keep it
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        <Field
          label="What's the idea?"
          placeholder="Name it"
          hint="↵"
          value={draft.title}
          autoFocus
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />

        <div className={styles.field}>
          <label className={styles.label} htmlFor={descriptionId}>
            Anything worth remembering?
          </label>
          <textarea
            id={descriptionId}
            className={styles.textarea}
            rows={2}
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={categoryId}>
            What kind of thing?
          </label>
          <select
            id={categoryId}
            className={styles.select}
            value={draft.category}
            onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as EntryCategory | '' }))}
          >
            <option value="">Not sure yet</option>
            {CATEGORY_ORDER.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </div>

        <Field
          label="Where is it?"
          placeholder="Name of the place"
          value={draft.location_name}
          onChange={(e) => setDraft((d) => ({ ...d, location_name: e.target.value }))}
        />

        <Field
          label="Address"
          value={draft.address}
          onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
        />

        <Field
          label="How long does it take?"
          hint="In minutes"
          inputMode="numeric"
          value={draft.duration_minutes}
          onChange={(e) => setDraft((d) => ({ ...d, duration_minutes: e.target.value }))}
        />

        <Field
          label="Where did you find it?"
          placeholder="Paste a link"
          value={draft.source_url}
          onChange={(e) => setDraft((d) => ({ ...d, source_url: e.target.value }))}
        />
      </Stack>
    </Modal>
  );
}
