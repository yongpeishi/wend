import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../design/components/core/Button';
import { Select } from '../design/components/core/Select';
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
 * /entries/:id — the detail panel, a drawer over whatever you were looking at.
 * Closing returns you to where you came from; nothing here navigates away from
 * the board underneath.
 */
export function EntryDetail() {
  const { id } = useParams();
  const entryId = id ? Number(id) : undefined;
  const navigate = useNavigate();
  const { show } = useToast();

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

  function close() {
    navigate(-1);
  }

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
            <p className={styles.note}>Set aside. It&rsquo;s still here whenever you want it.</p>
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
          </div>
        )}

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

        <section className={styles.section}>
          <h3 className={styles.sectionLabel}>How much do you want this?</h3>
          <VoteControl
            value={entry.my_vote}
            average={entry.vote_tally.average}
            count={entry.vote_tally.count}
            aria-label={`Your rating for ${entry.title}`}
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

        <section className={styles.actions}>
          {entry.kind === 'idea' && (
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
              Lift out of trip
            </Button>
          )}
          {!entry.archived_at && (
            <Button
              variant="quiet"
              onClick={() =>
                archiveEntry.mutate(entry.id, {
                  onSuccess: () => show("Set aside. It's still here.", 'success'),
                  onError: () => show("That didn't save. It's still here — try again.", 'error'),
                })
              }
            >
              Set aside
            </Button>
          )}
        </section>
      </div>
    </Drawer>
  );
}
