import { useEffect, useId, useState } from 'react';
import { Modal } from '../../components/Modal';
import { Field } from '../../components/Field';
import { Stack } from '../../components/layout/Stack';
import { Button } from '../../design/components/core/Button';
import { Select } from '../../design/components/core/Select';
import { useToast } from '../../components/Toast';
import { useCanEdit } from '../../auth/TripRoleContext';
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
  notes: string;
}

const EMPTY_DRAFT: Draft = {
  title: '',
  description: '',
  category: '',
  location_name: '',
  address: '',
  duration_minutes: '',
  notes: '',
};

/**
 * Capturing an idea, from a single word to the full picture. Collection
 * mode's whole point is that saving something costs almost nothing (an
 * Instagram find must land in seconds), so the name field is focused the
 * instant this opens and every other field is optional — type a name, hit
 * return, it exists.
 *
 * What it asks for is a subset of what an idea can hold: name, short
 * description, category, location, address, estimated duration, notes. The
 * coordinates are deliberately not here — nobody types a latitude at capture
 * speed, and the map fills them in later — so the full set lives in the panel
 * at /entries/:id (EntryDetail.tsx), which opens as the same <Modal> this one
 * does and which anything left blank here can be finished in.
 *
 * The labels are plain nouns on both surfaces — "Name", not "What's the
 * idea?". The questions were friendlier to read once and slower to read every
 * time after that, and two forms asking the same thing in two different
 * phrasings ("What is it?" here, "What's the idea?" there) read as two
 * different questions.
 *
 * Notes is the catch-all, and it is last on both surfaces: the link you found
 * it through, the opening hours, who to ask. It used to be a "Where did you
 * find it?" box of its own, which is a lot of form for one URL that most
 * ideas never have — and once the edit panel stopped showing that box, a link
 * typed here could be written and never read again.
 */
export function NewIdeaModal({ open, onClose, parentId, onCreated }: NewIdeaModalProps) {
  const canEdit = useCanEdit();
  const { show } = useToast();
  const createEntry = useCreateEntry();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const descriptionId = useId();
  const categoryId = useId();
  const notesId = useId();

  // Fresh form every time this opens — NewIdeaModal itself stays mounted
  // across opens/closes (TripBoard always renders it), so the draft has to
  // be reset explicitly rather than relying on unmount.
  useEffect(() => {
    if (open) setDraft(EMPTY_DRAFT);
  }, [open]);

  function close() {
    if (createEntry.isPending) return;
    setDraft(EMPTY_DRAFT);
    onClose();
  }

  function submit() {
    const title = draft.title.trim();
    if (!title || createEntry.isPending) return;

    const entry: EntryWritePayload = { kind: 'idea', title };
    if (draft.description.trim()) entry.description = draft.description.trim();
    if (draft.category) entry.category = draft.category;
    if (draft.location_name.trim()) entry.location_name = draft.location_name.trim();
    if (draft.address.trim()) entry.address = draft.address.trim();
    if (draft.notes.trim()) entry.notes = draft.notes.trim();
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

  // The board stays mounted around this dialog whether it is open or not, so a
  // viewer would otherwise be carrying a create form one state flag away from
  // the screen. There is no read-only version of "add an idea" worth showing —
  // an empty form nobody can submit is not content — so it is simply not here.
  // The "+ New idea" button that opens it is gone from FilterBar too; this is
  // the lock behind that door.
  if (!canEdit) return null;

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
          label="Name"
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
            Short description
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
            Category
          </label>
          <Select
            id={categoryId}
            value={draft.category}
            onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as EntryCategory | '' }))}
          >
            <option value="">Not sure yet</option>
            {CATEGORY_ORDER.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </Select>
        </div>

        <Field
          label="Location"
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
          label="Estimated duration"
          hint="In minutes"
          inputMode="numeric"
          value={draft.duration_minutes}
          onChange={(e) => setDraft((d) => ({ ...d, duration_minutes: e.target.value }))}
        />

        {/* A textarea rather than a <Field>, for the same reason the
            description above is one: this is the box that takes whatever did
            not deserve a label of its own, and the placeholder says so. Same
            wording as the edit panel's, so the two surfaces agree about what
            belongs here. */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor={notesId}>
            Notes
          </label>
          <textarea
            id={notesId}
            className={styles.textarea}
            rows={2}
            placeholder="Anything else — a link to where you found it, opening hours, who to ask."
            value={draft.notes}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
          />
        </div>
      </Stack>
    </Modal>
  );
}
