import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../design/components/core/Button';
import { Select } from '../design/components/core/Select';
import { useCanEdit } from '../auth/TripRoleContext';
import { Modal } from '../components/Modal';
import { Field } from '../components/Field';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { useEntry, useRestoreEntry, useUpdateEntry } from '../api/entries';
import type { EntryCategory } from '../api/types';
import { formatDuration } from '../lib/formatDates';
import styles from './EntryDetail.module.css';

const CATEGORIES: EntryCategory[] = ['place', 'food', 'activity', 'lodging', 'transport', 'other'];

/**
 * One fact, read rather than filled in.
 *
 * A viewer used to get this whole panel as ten boxes with `readOnly` and
 * `disabled` set: a form they are locked out of, which says "you may not" far
 * louder than it says what the idea is. Same label — it is what names each
 * fact — with the value as plain text beneath it, and no control in the tree at
 * all.
 *
 * An empty value is an em dash rather than a blank line, because a fact nobody
 * has filled in still has to read as a fact nobody has filled in; a bare gap
 * under a label reads as something broken.
 *
 * It lives in this file rather than in components/: one screen needs it, and a
 * second caller does not exist. <Field> gives its generated id to whatever
 * child it is handed, so the label points at this paragraph — a <label> cannot
 * be programmatically associated with a non-control, and the label text sitting
 * directly above the value it names is what carries the association here.
 */
function Fact({ label, value }: { label: string; value: ReactNode }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <Field label={label}>
      <p className={styles.fact}>{empty ? <span className={styles.factEmpty}>&mdash;</span> : value}</p>
    </Field>
  );
}

export interface EntryDetailModalProps {
  entryId: number | undefined;
  onClose: () => void;
}

/**
 * The detail panel itself, decoupled from the route.
 *
 * It is a centred modal over whatever you were looking at — the same dialog
 * "Add an idea" opens in (see NewIdeaModal.tsx), because opening an idea and
 * writing one down are the same act at two moments and they should not arrive
 * from two different edges of the screen. It used to slide in from the right as
 * a <Drawer>; that read as a second surface parallel to the board rather than
 * the one thing you had just pointed at.
 *
 * Being an overlay only holds if there is something underneath. Reached as a
 * route it covers an empty page, because /entries/:id renders nothing else; the
 * board therefore raises this component directly, over the board, and keeps its
 * own URL. Both ways in from the board — a row in the idea list and a member in
 * the bundle rail — go through TripBoard's single `editingId`, so they land in
 * this same dialog. The editing surface is the same one either way.
 *
 * What it holds is the idea's own facts and nothing else. It used to open with
 * a summary line — kind · place · how long — directly above the fields that say
 * those same three things, and to close with the two ways of moving the idea
 * somewhere else. Both are gone: the summary because a panel whose whole job is
 * the facts should not preview them, and the two moves because lifting an idea
 * out or setting it aside is something you do TO an idea, not something you
 * write down ABOUT one. They live on the board, in the ⋯ menu on the idea's own
 * row, beside Edit. Voting went the same way — deciding how much everyone wants
 * this is not a thing you edit, and the board's rows are where it is read. So
 * did the list of open todos, which is the checklist screen's subject and was
 * only ever a read-only echo of it here.
 *
 * The heading says what the dialog is for rather than which idea it holds. It
 * used to be the entry's own title, which meant the name was on the screen
 * twice — once as the heading and again in the field you edit it in, the second
 * one silently disagreeing with the first for as long as you were mid-word. The
 * name now lives in exactly one place, the field, and the heading answers the
 * question the panel actually raises: "Edit idea", or "Idea" for someone who
 * cannot edit and is only reading it.
 *
 * One deliberate difference from "Add an idea": focus settles on the dialog
 * itself rather than in the name field. Modal aims at the first control in its
 * body once, on open, and on open this is still the spinner — but that is where
 * it belongs anyway. A new idea opens for typing; an existing one opens for
 * reading, and a cursor sitting in a title someone already wrote invites
 * overwriting it (and raises a keyboard over the panel on a phone). Escape, Tab
 * and the heading read the same either way.
 */
export function EntryDetailModal({ entryId, onClose: close }: EntryDetailModalProps) {
  const { show } = useToast();
  // Raised over the board it belongs to, so the trip's role is already in the
  // tree. Opened at /entries/:id for a library idea there is no provider and no
  // trip, and the default is editable — which is right: nobody else is on it.
  const canEdit = useCanEdit();

  const { data, isLoading, isError } = useEntry(entryId);
  const updateEntry = useUpdateEntry(entryId ?? 0);
  const restoreEntry = useRestoreEntry();

  const [draft, setDraft] = useState<Record<string, string>>({});

  const entry = data?.entry;

  // Reset the edit buffer whenever a different entry is opened.
  useEffect(() => {
    if (!entry) return;
    setDraft({
      title: entry.title,
      description: entry.description ?? '',
      category: entry.category ?? '',
      location_name: entry.location_name ?? '',
      address: entry.address ?? '',
      lat: entry.lat == null ? '' : String(entry.lat),
      lng: entry.lng == null ? '' : String(entry.lng),
      duration_minutes: entry.duration_minutes == null ? '' : String(entry.duration_minutes),
      notes: entry.notes ?? '',
    });
  }, [entry?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function save(field: string, value: string) {
    if (!entry) return;
    const numeric = ['lat', 'lng', 'duration_minutes'];
    const parsed = numeric.includes(field)
      ? value.trim() === ''
        ? null
        : Number(value)
      : value.trim() === ''
        ? null
        : value;

    if (field === 'title' && (parsed === null || parsed === entry.title)) return;

    updateEntry.mutate(
      { entry: { [field]: parsed } },
      { onError: () => show("That didn't save. It's still here — try again.", 'error') },
    );
  }

  if (isLoading) {
    return (
      <Modal open title="Opening" onClose={close}>
        <Spinner label="Opening" />
      </Modal>
    );
  }

  if (isError || !entry || !data) {
    return (
      <Modal open title="Not here" onClose={close}>
        <p className={styles.note}>
          That one isn&rsquo;t here. It may have been set aside — everything you kept is
          still safe.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open
      title={canEdit ? 'Edit idea' : 'Idea'}
      onClose={close}
      size="wide"
      /* One button, and it does not say "Save". Every field here writes itself
         on blur, so there is nothing held back to commit and nothing to cancel —
         a Save/Cancel pair would promise an undo this panel cannot give. "Done"
         says what it does, and it says it to a viewer too: they are finished
         reading. Not "Close" — the dialog's own ✕ already carries that name, and
         two buttons answering to it is one target too many to say out loud. */
      actions={
        <Button variant="quiet" onClick={close}>
          Done
        </Button>
      }
    >
      <div className={styles.body}>
        {entry.archived_at && (
          <div className={styles.asideNote}>
            {/* The sentence stays for everyone — that this was set aside is part
                of what the entry says about itself. Only the way to undo it goes. */}
            <p className={styles.note}>Set aside. It&rsquo;s still here whenever you want it.</p>
            {canEdit && (
              <Button
                variant="secondary"
                onClick={() =>
                  restoreEntry.mutate(entry.id, {
                    onSuccess: () => show('Picked back up.', 'success'),
                  })
                }
              >
                Pick it back up
              </Button>
            )}
          </div>
        )}

        {/* The two halves of the same panel: the same facts, in the same order,
            under the same labels. Someone who can edit gets them as fields that
            save themselves on blur; someone reading gets them as text. The fork
            is here rather than a `readOnly` prop on each control because a
            locked-out form is the thing being got rid of — see <Fact>. */}
        {canEdit ? (
          <>
            <Field label="Name">
              <input
                className={styles.input}
                value={draft.title ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                onBlur={(e) => save('title', e.target.value)}
              />
            </Field>

            {/* Straight after the name, because it is the sentence you would
                say next if someone asked what the idea was. It used to sit near
                the bottom, under the coordinates, which put a latitude between
                an idea and its own description. */}
            <Field label="Short description">
              <textarea
                className={styles.textarea}
                rows={3}
                value={draft.description ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                onBlur={(e) => save('description', e.target.value)}
              />
            </Field>

            {/* Two short facts to a line, which is what the extra width bought.
                The grid collapses to one column under its own breakpoint, so a
                phone still reads them in order. */}
            <div className={styles.pair}>
              <Field label="Category">
                {/* <Select>, not a bare <select> with .input: .input styles a text
                    field, and a native select ignores that styling entirely unless
                    something resets `appearance`. Field clones this child to inject
                    id/aria-describedby, which Select spreads onto the real control. */}
                <Select
                  value={draft.category ?? ''}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, category: e.target.value }));
                    save('category', e.target.value);
                  }}
                >
                  <option value="">Not sure yet</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Estimated duration" hint="In minutes">
                <input
                  className={styles.input}
                  inputMode="numeric"
                  value={draft.duration_minutes ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, duration_minutes: e.target.value }))}
                  onBlur={(e) => save('duration_minutes', e.target.value)}
                />
              </Field>
            </div>

            <div className={styles.pair}>
              <Field label="Location">
                <input
                  className={styles.input}
                  placeholder="Name of the place"
                  value={draft.location_name ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, location_name: e.target.value }))}
                  onBlur={(e) => save('location_name', e.target.value)}
                />
              </Field>

              <Field label="Address">
                <input
                  className={styles.input}
                  value={draft.address ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
                  onBlur={(e) => save('address', e.target.value)}
                />
              </Field>
            </div>

            <div className={styles.pair}>
              <Field label="Latitude">
                <input
                  className={styles.input}
                  inputMode="decimal"
                  value={draft.lat ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, lat: e.target.value }))}
                  onBlur={(e) => save('lat', e.target.value)}
                />
              </Field>
              <Field label="Longitude">
                <input
                  className={styles.input}
                  inputMode="decimal"
                  value={draft.lng ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, lng: e.target.value }))}
                  onBlur={(e) => save('lng', e.target.value)}
                />
              </Field>
            </div>

            {/* The last box, and deliberately the only open one. "Where did you
                find it?" used to be a field of its own — one labelled box for
                one URL, which is a lot of panel for a thing most ideas do not
                have. The placeholder says the link belongs here now, along with
                whatever else did not deserve a field. */}
            <Field label="Notes">
              <textarea
                className={styles.textarea}
                rows={4}
                placeholder="Anything else — a link to where you found it, opening hours, who to ask."
                value={draft.notes ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                onBlur={(e) => save('notes', e.target.value)}
              />
            </Field>
          </>
        ) : (
          <>
            {/* Read off the entry, not the draft: the draft is the edit buffer,
                and there is no editing going on here. Same facts in the same
                order and the same two-up grid as the fields above. */}
            <Fact label="Name" value={entry.title} />
            <Fact label="Short description" value={entry.description} />

            <div className={styles.pair}>
              <Fact label="Category" value={entry.category} />
              {/* "2 hr", not "120". The minutes box exists because minutes are
                  what you type; reading it, how long it takes is a duration. */}
              <Fact label="Estimated duration" value={formatDuration(entry.duration_minutes)} />
            </div>

            <div className={styles.pair}>
              <Fact label="Location" value={entry.location_name} />
              <Fact label="Address" value={entry.address} />
            </div>

            <div className={styles.pair}>
              <Fact label="Latitude" value={entry.lat == null ? null : String(entry.lat)} />
              <Fact label="Longitude" value={entry.lng == null ? null : String(entry.lng)} />
            </div>

            <Fact label="Notes" value={entry.notes} />
          </>
        )}

        {data.children.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionLabel}>Holds</h3>
            <ul className={styles.linkList}>
              {data.children.map((child) => (
                <li key={child.id}>
                  <Link className={styles.link} to={`/entries/${child.id}`}>
                    {child.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

      </div>
    </Modal>
  );
}

/**
 * /entries/:id — the same modal, opened by URL. This is the deep-link and
 * back-button path (the library screen still navigates here); closing returns
 * you to wherever you came from. The board opens it in place instead, so
 * editing an idea never leaves the ideas you were reading.
 */
export function EntryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  return <EntryDetailModal entryId={id ? Number(id) : undefined} onClose={() => navigate(-1)} />;
}
