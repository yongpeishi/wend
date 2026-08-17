import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../design/components/core/Button';
import { Select } from '../design/components/core/Select';
import { useCanEdit } from '../auth/TripRoleContext';
import { Drawer } from '../components/Drawer';
import { Field } from '../components/Field';
import { Spinner } from '../components/Spinner';
import { VoteControl } from '../components/VoteControl';
import { useToast } from '../components/Toast';
import {
  useArchiveEntry,
  useEntry,
  useLiftEntry,
  useRestoreEntry,
  useUpdateEntry,
} from '../api/entries';
import { useVote } from '../api/votes';
import type { EntryCategory } from '../api/types';
import { formatDuration, joinMeta } from '../lib/formatDates';
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

export interface EntryDetailDrawerProps {
  entryId: number | undefined;
  onClose: () => void;
}

/**
 * The detail panel itself, decoupled from the route.
 *
 * It is a drawer over whatever you were looking at — which only holds if there
 * is something underneath. Reached as a route it covers an empty page, because
 * /entries/:id renders nothing else; the board therefore raises this component
 * directly, over the board, and keeps its own URL. The editing surface is the
 * same one either way.
 */
export function EntryDetailDrawer({ entryId, onClose: close }: EntryDetailDrawerProps) {
  const { show } = useToast();
  // Raised over the board it belongs to, so the trip's role is already in the
  // tree. Opened at /entries/:id for a library idea there is no provider and no
  // trip, and the default is editable — which is right: nobody else is on it.
  const canEdit = useCanEdit();

  const { data, isLoading, isError } = useEntry(entryId);
  const updateEntry = useUpdateEntry(entryId ?? 0);
  const archiveEntry = useArchiveEntry();
  const restoreEntry = useRestoreEntry();
  const liftEntry = useLiftEntry();
  const vote = useVote(entryId ?? 0);

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
      source_url: entry.source_url ?? '',
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
      <Drawer open title="Opening" onClose={close}>
        <Spinner label="Opening" />
      </Drawer>
    );
  }

  if (isError || !entry || !data) {
    return (
      <Drawer open title="Not here" onClose={close}>
        <p className={styles.note}>
          That one isn&rsquo;t here. It may have been set aside — everything you kept is
          still safe.
        </p>
      </Drawer>
    );
  }

  const meta = joinMeta(
    entry.category ?? undefined,
    entry.location_name ?? undefined,
    formatDuration(entry.duration_minutes) ?? undefined,
  );

  return (
    <Drawer open title={entry.title} onClose={close}>
      <div className={styles.body}>
        {meta && <p className={styles.meta}>{meta}</p>}

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
            <Field label="What is it?">
              <input
                className={styles.input}
                value={draft.title ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                onBlur={(e) => save('title', e.target.value)}
              />
            </Field>

            <Field label="Anything worth remembering?">
              <textarea
                className={styles.textarea}
                rows={3}
                value={draft.description ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                onBlur={(e) => save('description', e.target.value)}
              />
            </Field>

            <Field label="What kind of thing?">
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

            <Field label="Where is it?">
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

            <Field label="How long does it take?" hint="In minutes">
              <input
                className={styles.input}
                inputMode="numeric"
                value={draft.duration_minutes ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, duration_minutes: e.target.value }))}
                onBlur={(e) => save('duration_minutes', e.target.value)}
              />
            </Field>

            <Field label="Where did you find it?">
              <input
                className={styles.input}
                placeholder="Paste a link"
                value={draft.source_url ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, source_url: e.target.value }))}
                onBlur={(e) => save('source_url', e.target.value)}
              />
            </Field>

            <Field label="Notes">
              <textarea
                className={styles.textarea}
                rows={3}
                value={draft.notes ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                onBlur={(e) => save('notes', e.target.value)}
              />
            </Field>
          </>
        ) : (
          <>
            {/* Read off the entry, not the draft: the draft is the edit buffer,
                and there is no editing going on here. */}
            <Fact label="What is it?" value={entry.title} />
            <Fact label="Anything worth remembering?" value={entry.description} />
            <Fact label="What kind of thing?" value={entry.category} />
            <Fact label="Where is it?" value={entry.location_name} />
            <Fact label="Address" value={entry.address} />

            <div className={styles.pair}>
              <Fact label="Latitude" value={entry.lat == null ? null : String(entry.lat)} />
              <Fact label="Longitude" value={entry.lng == null ? null : String(entry.lng)} />
            </div>

            {/* "2 hr", not "120". The minutes box exists because minutes are
                what you type; reading it, the answer to how long it takes is
                the same one the meta line at the top of the drawer gives. */}
            <Fact label="How long does it take?" value={formatDuration(entry.duration_minutes)} />

            <Fact
              label="Where did you find it?"
              value={
                entry.source_url && (
                  // A real link, since following it is the only thing anyone
                  // ever wanted this field for. New tab: the drawer is an
                  // overlay on a board, and navigating away would close both.
                  <a className={styles.link} href={entry.source_url} target="_blank" rel="noreferrer">
                    {entry.source_url}
                  </a>
                )
              }
            />

            <Fact label="Notes" value={entry.notes} />
          </>
        )}

        <section className={styles.section}>
          {/* A viewer is not being asked, so the heading stops asking. The
              question mark is the whole difference between a ballot and a
              result. */}
          <h3 className={styles.sectionLabel}>
            {canEdit ? 'How much do you want this?' : 'How much everyone wants this'}
          </h3>
          {/* Not greyed-out stops: five refusing radios read as being locked
              out of the vote rather than as its result. A viewer gets the
              average and the headcount, and the per-person list below — which
              everyone sees — is where the substance of "what others said"
              actually lives. Voting is a write on the backend too
              (VotePolicy#create? is write?), so nothing here is decoration. */}
          <VoteControl
            canEdit={canEdit}
            value={entry.my_vote}
            average={entry.vote_tally.average}
            count={entry.vote_tally.count}
            aria-label={
              canEdit ? `Your rating for ${entry.title}` : `Everyone's rating for ${entry.title}`
            }
            onChange={(score) =>
              vote.mutate(score, {
                onError: () => show("That didn't save. It's still here — try again.", 'error'),
              })
            }
          />
          {data.votes.length > 0 && (
            <ul className={styles.voteList}>
              {data.votes.map((v) => (
                <li key={v.id} className={styles.voteItem}>
                  <span>{v.user_name ?? 'Someone'}</span>
                  <span className={styles.voteScore}>
                    {v.score > 0 ? `+${v.score}` : v.score}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {data.parents.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionLabel}>Appears in</h3>
            <ul className={styles.linkList}>
              {data.parents.map((parent) => (
                <li key={parent.id}>
                  <Link
                    className={styles.link}
                    to={parent.kind === 'trip' ? `/trips/${parent.id}` : `/entries/${parent.id}`}
                  >
                    {parent.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
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

        {data.todos.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionLabel}>To do</h3>
            <ul className={styles.todoList}>
              {data.todos.map((todo) => (
                <li key={todo.id} className={todo.done_at ? styles.todoDone : undefined}>
                  {todo.title}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Both labels name where the idea ends up, and both carry a line
            saying what that costs. The board's ⋯ menu and its bulk bar are
            popups with room for a label and nothing else; the drawer has the
            room, so this is where the whole sentence gets said. */}
        <section className={styles.actions}>
          {canEdit && entry.kind === 'idea' && (
            <div className={styles.action}>
              <Button
                variant="secondary"
                onClick={() =>
                  liftEntry.mutate(entry.id, {
                    onSuccess: () =>
                      show('Lifted out. It&rsquo;s a trip of its own now.', 'success'),
                    onError: () => show("That didn't save. It's still here — try again.", 'error'),
                  })
                }
              >
                Make it a trip of its own
              </Button>
              <p className={styles.note}>
                Takes it off this trip. It keeps everything it has and gets a board of its own.
              </p>
            </div>
          )}
          {canEdit && !entry.archived_at && (
            <div className={styles.action}>
              <Button
                variant="quiet"
                onClick={() =>
                  archiveEntry.mutate(entry.id, {
                    onSuccess: () => show("Set aside. It's still here.", 'success'),
                    onError: () => show("That didn't save. It's still here — try again.", 'error'),
                  })
                }
              >
                Move to Set aside
              </Button>
              <p className={styles.note}>
                Stays on this trip, out of the idea list. The Set aside list at the foot of the
                board brings it back.
              </p>
            </div>
          )}
        </section>
      </div>
    </Drawer>
  );
}

/**
 * /entries/:id — the same drawer, opened by URL. This is the deep-link and
 * back-button path (the library screen still navigates here); closing returns
 * you to wherever you came from. The board opens the drawer in place instead,
 * so editing an idea never leaves the ideas you were reading.
 */
export function EntryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  return <EntryDetailDrawer entryId={id ? Number(id) : undefined} onClose={() => navigate(-1)} />;
}
