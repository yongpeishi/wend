import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ProsCons } from './ProsCons';
import { useUpdateEntry } from '../../api/entries';
import { canDelete, canEdit } from '../../auth/tripRole';
import { ReadOnly } from '../../components/ReadOnly';
import { useToast } from '../../components/Toast';
import { formatTripDates, joinMeta } from '../../lib/formatDates';
import type { Entry } from '../../api/types';
import styles from './TripCard.module.css';

export interface TripCardProps {
  trip: Entry;
  /** "Save for later" — archives the trip into the section below. */
  onArchive: () => void;
}

/** `12–17 Oct · 41 ideas`, or `No dates · 1 idea`. A dateless trip is normal. */
function metaLine(trip: Entry): string {
  const ideas = trip.children_count;
  return joinMeta(
    formatTripDates(trip.starts_on, trip.ends_on) ?? 'No dates',
    ideas === 1 ? '1 idea' : `${ideas} ideas`,
  );
}

/**
 * One trip in the grid on `/`.
 *
 * The card carries interactive controls (archive, title rename, the
 * description field, and the pros/cons list with its own buttons and input),
 * so the card itself is *not* a link — nesting buttons/inputs inside an anchor
 * is invalid HTML and unusable by keyboard. Instead the title is the real link
 * and its ::after stretches over the whole card, so a click anywhere in the
 * quiet parts still navigates while every control keeps its own tab stop.
 * Controls sit above the overlay via `position: relative`, which is also why
 * none of them needs to stop propagation. Renaming swaps the title link for an
 * input via an explicit edit button (`.editTitle`) rather than making the link
 * itself editable, so click-to-navigate and click-to-rename stay distinguishable.
 */
export function TripCard({ trip, onArchive }: TripCardProps) {
  const updateTrip = useUpdateEntry(trip.id);
  const { show } = useToast();

  // From the trip in hand, not from the trip-role context: `/` is outside every
  // trip, so there is no provider here and each card in the grid carries a
  // different answer. `?? null` because `my_role` is optional — see tripRole.ts.
  const editable = canEdit(trip.my_role ?? null);
  // Setting a trip aside is the owner's alone: a member can unmake their own
  // work, not the trip everyone else is standing on.
  const deletable = canDelete(trip.my_role ?? null);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(trip.title);
  const [descriptionDraft, setDescriptionDraft] = useState(trip.description ?? '');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  // Escape reverts without saving; it flips editingTitle off directly rather
  // than going through the blur handler, so this flag tells that handler to
  // stand down when the resulting unmount blurs the input anyway.
  const skipTitleSave = useRef(false);

  // Stay in sync with the trip prop (e.g. after another field's mutation
  // invalidates and refetches the list) without clobbering an in-progress edit.
  useEffect(() => {
    setTitleDraft(trip.title);
    setDescriptionDraft(trip.description ?? '');
  }, [trip.title, trip.description]);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.select();
  }, [editingTitle]);

  // Grows the borderless textarea to fit its content instead of scrolling,
  // so a saved multi-line description still reads like the old plain <p>.
  useEffect(() => {
    const el = descriptionRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [descriptionDraft]);

  function startEditingTitle() {
    setTitleDraft(trip.title);
    setEditingTitle(true);
  }

  function cancelEditingTitle() {
    skipTitleSave.current = true;
    setTitleDraft(trip.title);
    setEditingTitle(false);
  }

  function saveTitle(value: string) {
    setEditingTitle(false);
    if (skipTitleSave.current) {
      skipTitleSave.current = false;
      return;
    }
    // A trip always needs a name, so a blank title reverts instead of saving.
    const parsed = value.trim() === '' ? null : value;
    if (parsed === null || parsed === trip.title) {
      setTitleDraft(trip.title);
      return;
    }
    updateTrip.mutate(
      { entry: { title: parsed } },
      { onError: () => show("That didn't save. It's still here — try again.", 'error') },
    );
  }

  function saveDescription(value: string) {
    const parsed = value.trim() === '' ? null : value;
    if (parsed === trip.description) return;
    updateTrip.mutate(
      { entry: { description: parsed } },
      { onError: () => show("That didn't save. It's still here — try again.", 'error') },
    );
  }

  return (
    <article className={styles.card}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          {editingTitle ? (
            <input
              ref={titleInputRef}
              className={styles.titleInput}
              value={titleDraft}
              aria-label={`Trip name for ${titleDraft}`}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={(e) => saveTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                else if (e.key === 'Escape') cancelEditingTitle();
              }}
            />
          ) : (
            // titleDraft, not trip.title: right after a save it already holds
            // the new value, so the link doesn't flicker back to the old title
            // while the list query is still refetching.
            <Link to={`/trips/${trip.id}`} className={styles.titleLink}>
              {titleDraft}
            </Link>
          )}
        </h2>
        <div className={styles.headActions}>
          {editable && !editingTitle && (
            <button
              type="button"
              className={styles.editTitle}
              title="Rename"
              aria-label={`Rename ${titleDraft}`}
              onClick={startEditingTitle}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>
          )}
          {deletable && (
            <button
              type="button"
              className={styles.archive}
              title="Save for later"
              aria-label={`Save ${titleDraft} for later`}
              onClick={onArchive}
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="5" rx="1" />
                <path d="M5 9v9a2 2 0 002 2h10a2 2 0 002-2V9" />
                <path d="M10 13h4" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* readOnly, not disabled: a description is content, and a viewer keeps it
          at full contrast and still selectable. The placeholder goes with the
          capability — "Add a description" is an invitation nobody here can
          accept, and an empty box says the same thing more honestly. */}
      <textarea
        ref={descriptionRef}
        className={styles.description}
        rows={1}
        readOnly={!editable}
        placeholder={editable ? 'Add a description' : undefined}
        aria-label={`Description for ${titleDraft}`}
        value={descriptionDraft}
        onChange={(e) => setDescriptionDraft(e.target.value)}
        onBlur={(e) => saveDescription(e.target.value)}
      />

      {/* The region gate rather than a prop: ProsCons belongs to no slice of this
          change, so its remove and "+ add" buttons go inert inside a disabled
          fieldset instead of disappearing the way the house rule prefers. The
          reasons themselves stay fully readable, which is the half that matters.
          See the report accompanying this change. */}
      <div className={styles.reasons}>
        <ReadOnly canEdit={editable}>
          <ProsCons entryId={trip.id} tripTitle={titleDraft} pros={trip.pros} cons={trip.cons} />
        </ReadOnly>
      </div>

      <p className={styles.meta}>{metaLine(trip)}</p>
    </article>
  );
}
