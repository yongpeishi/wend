import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ProsCons } from './ProsCons';
import { Linkify } from '../../components';
import { useUpdateEntry } from '../../api/entries';
import { canDelete, canEdit } from '../../auth/tripRole';
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
 *
 * The description reads as prose and only becomes a field when asked, for the
 * same reason: a URL someone typed into it is a link, and a link cannot live
 * inside a textarea. So the read view is a paragraph (with `<Linkify>` doing
 * the URLs), and an explicit pencil — the description's own, mirroring the
 * title's — opens the textarea, which still holds and saves the raw text.
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
  const [editingDescription, setEditingDescription] = useState(false);
  const [titleDraft, setTitleDraft] = useState(trip.title);
  const [descriptionDraft, setDescriptionDraft] = useState(trip.description ?? '');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  // Escape reverts without saving; it flips editingTitle off directly rather
  // than going through the blur handler, so this flag tells that handler to
  // stand down when the resulting unmount blurs the input anyway.
  const skipTitleSave = useRef(false);
  const skipDescriptionSave = useRef(false);

  // Stay in sync with the trip prop (e.g. after another field's mutation
  // invalidates and refetches the list) without clobbering an in-progress edit.
  useEffect(() => {
    setTitleDraft(trip.title);
    setDescriptionDraft(trip.description ?? '');
  }, [trip.title, trip.description]);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.select();
  }, [editingTitle]);

  // Grows the borderless textarea to fit its content instead of scrolling, so
  // the field is the same shape as the paragraph it replaced and opening it
  // doesn't jump the card. Depends on editingDescription too: the textarea only
  // exists while editing, so its first measurement happens on that flip, not on
  // a change to the text.
  useEffect(() => {
    const el = descriptionRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [descriptionDraft, editingDescription]);

  // Opening the field puts you in it, caret at the end: you clicked a
  // description to add to it, not to retype it — unlike the title, which is one
  // line and gets selected whole.
  useEffect(() => {
    const el = descriptionRef.current;
    if (!editingDescription || !el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editingDescription]);

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

  // No re-seeding from the trip, unlike the title: the paragraph already shows
  // the draft, and after a save that failed the draft is the only copy of what
  // was typed — which is what the error toast promised was still here.
  function startEditingDescription() {
    setEditingDescription(true);
  }

  function cancelEditingDescription() {
    skipDescriptionSave.current = true;
    setDescriptionDraft(trip.description ?? '');
    setEditingDescription(false);
  }

  function saveDescription(value: string) {
    setEditingDescription(false);
    if (skipDescriptionSave.current) {
      skipDescriptionSave.current = false;
      return;
    }
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

      {/* A viewer with nothing to read gets nothing: an empty box would be an
          invitation nobody here can accept. Everyone else gets the paragraph,
          which for someone editing doubles as the prompt to write one. */}
      {(editable || descriptionDraft !== '') && (
        <div className={styles.descriptionField}>
          {editingDescription ? (
            <textarea
              ref={descriptionRef}
              className={styles.description}
              rows={1}
              placeholder="Add a description"
              aria-label={`Description for ${titleDraft}`}
              value={descriptionDraft}
              onChange={(e) => setDescriptionDraft(e.target.value)}
              onBlur={(e) => saveDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancelEditingDescription();
              }}
            />
          ) : (
            <>
              {/* descriptionDraft, not trip.description: straight after a save
                  it already holds the new words, so the paragraph doesn't
                  flicker back while the list query refetches. The click is a
                  convenience for the mouse — the pencil beside it is the real
                  control, and a link inside the prose stops its own click so
                  following it never opens the field. */}
              <p
                className={[
                  styles.descriptionText,
                  editable ? styles.descriptionEditable : '',
                  descriptionDraft === '' ? styles.descriptionEmpty : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={editable ? startEditingDescription : undefined}
              >
                {descriptionDraft === '' ? 'Add a description' : <Linkify>{descriptionDraft}</Linkify>}
              </p>
              {editable && (
                <button
                  type="button"
                  className={styles.editDescription}
                  title="Edit description"
                  aria-label={`Edit description for ${titleDraft}`}
                  onClick={startEditingDescription}
                >
                  <svg
                    width="14"
                    height="14"
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
            </>
          )}
        </div>
      )}

      {/* The prop, not a disabled fieldset: the reasons stay readable and the
          controls around them are simply not drawn (architecture.md §5). */}
      <div className={styles.reasons}>
        <ProsCons
          entryId={trip.id}
          tripTitle={titleDraft}
          pros={trip.pros}
          cons={trip.cons}
          canEdit={editable}
        />
      </div>

      <p className={styles.meta}>{metaLine(trip)}</p>
    </article>
  );
}
