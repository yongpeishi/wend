import { useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { Field } from '../../components/Field';
import { Button } from '../../design/components/core/Button';
import { useToast } from '../../components/Toast';
import { useCreateEntry } from '../../api/entries';
import type { Entry } from '../../api/types';
import styles from './NewTripModal.module.css';

export interface NewTripModalProps {
  open: boolean;
  onClose: () => void;
  /** Called once the trip exists, so the caller can navigate to it. */
  onCreated: (trip: Entry) => void;
}

const NAME_FIELD_ID = 'new-trip-name';

/**
 * "+ New trip" from `/` — screens.md: "A trip needs only a title; dates
 * are optional and stay optional (the brief's Malaysia example starts with no
 * idea how long)." Name is the only required field. A dateless trip isn't an
 * unfinished one — it's a normal, permanent shape, so nothing here nags for
 * dates later.
 *
 * The design import asks for a single free-text "Dates" field. Kept as the
 * structured Starts/Ends pair instead (a user decision): free text can't fill
 * `starts_on` / `ends_on`, and every date on the schedule reads from those.
 *
 * A native `type="date"` input still shows date-shaped placeholder chrome
 * ("mm/dd/yyyy", a calendar icon) even while genuinely empty, which reads as
 * "a date is coming" for a field meant to look as optional as it is. So the
 * pair starts collapsed behind a quiet "+ Add dates" disclosure and only
 * mounts once opened — the default form shows no date-shaped UI at all.
 *
 * Follows the Field + Modal idiom EntryDetail.tsx establishes. Description and
 * the date pair need a textarea and a type="date" pair respectively, which
 * <Field> (a thin label+description wrapper around the single-line <Input>)
 * doesn't render as children, so those two are built directly here with the
 * same tokens Field.module.css uses, rather than routed through it.
 */
export function NewTripModal({ open, onClose, onCreated }: NewTripModalProps) {
  const { show } = useToast();
  const createEntry = useCreateEntry();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [touched, setTouched] = useState(false);
  // Whether the user has ever typed in Name. Blur alone must not raise the
  // "needs a name" error on a field that was never entered — the modal opens
  // with focus in Name, so clicking "+ Add dates" immediately would blur it
  // and scold before anything was typed. Same spirit as the tried-vs-live
  // split in TimeEditor/DatesGate: an empty field is not wrong yet, only not
  // done. Blur turns accusatory only after typing (typed-then-cleared is a
  // real mistake); pressing Add trip still asks for the error regardless.
  const [dirty, setDirty] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);

  const trimmedName = name.trim();
  const nameError = touched && !trimmedName ? 'A trip needs a name.' : undefined;
  const working = createEntry.isPending;

  // <Field> isn't ref-forwarding, so grab the input by id instead. Modal (a
  // child of this component in the tree) moves focus to the dialog itself in
  // its own mount effect (see components/Modal.tsx) — effects fire
  // children-before-parents, so this effect, defined here in the parent,
  // already runs after Modal's and safely lands focus in Name last. No
  // timer needed, which also avoids racing a user who starts typing
  // immediately.
  useEffect(() => {
    if (!open) return;
    document.getElementById(NAME_FIELD_ID)?.focus();
  }, [open]);

  // Runs after the disclosure swaps the button out for the date pair, so the
  // field it focuses is already in the DOM.
  useEffect(() => {
    if (!datesOpen) return;
    document.getElementById('new-trip-starts')?.focus();
  }, [datesOpen]);

  function reset() {
    setName('');
    setDescription('');
    setStartsOn('');
    setEndsOn('');
    setTouched(false);
    setDirty(false);
    setDatesOpen(false);
  }

  function close() {
    if (working) return;
    reset();
    onClose();
  }

  function submit() {
    if (!trimmedName) {
      setTouched(true);
      return;
    }
    createEntry.mutate(
      {
        entry: {
          kind: 'trip',
          title: trimmedName,
          description: description.trim() || null,
          starts_on: startsOn || null,
          ends_on: endsOn || null,
        },
      },
      {
        onSuccess: (trip) => {
          reset();
          onCreated(trip);
        },
        onError: () => show("That didn't save. It's still here — try again.", 'error'),
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="New trip"
      actions={
        <>
          <Button variant="quiet" onClick={close} disabled={working}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={working}>
            {working ? 'One moment' : 'Add trip'}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <Field
          id={NAME_FIELD_ID}
          label="Name"
          placeholder="Where are you going?"
          hint="↵"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          onBlur={() => {
            if (dirty) setTouched(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          error={nameError}
          required
        />

        <div className={styles.group}>
          <label className={styles.label} htmlFor="new-trip-description">
            Short description
          </label>
          <textarea
            id="new-trip-description"
            className={styles.textarea}
            rows={3}
            placeholder="Anything worth remembering?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {datesOpen ? (
          <div className={styles.group}>
            <span className={styles.label} id="new-trip-dates-label">
              Dates
            </span>
            <div className={styles.datePair} role="group" aria-labelledby="new-trip-dates-label">
              <Field
                id="new-trip-starts"
                label="Starts"
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
              <Field
                id="new-trip-ends"
                label="Ends"
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className={styles.group}>
            <button type="button" className={styles.addDates} onClick={() => setDatesOpen(true)}>
              + Add dates
            </button>
            <p className={styles.hintText}>A trip can start as one word. Dates can come later, or never.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
