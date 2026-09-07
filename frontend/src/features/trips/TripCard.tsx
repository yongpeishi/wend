import { useEffect, useRef, useState } from 'react';
import type { FocusEvent } from 'react';
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
 * The card carries interactive controls (archive, the edit pencil, the fields
 * it opens, and the pros/cons list with its own buttons and input), so the card
 * itself is *not* a link — nesting buttons/inputs inside an anchor is invalid
 * HTML and unusable by keyboard. Instead the title is the real link and its
 * ::after stretches over the whole card, so a click anywhere in the quiet parts
 * still navigates while every control keeps its own tab stop. Controls sit
 * above the overlay via `position: relative`, which is also why none of them
 * needs to stop propagation.
 *
 * The card's own words — the title and the description — read as a link and a
 * paragraph until asked otherwise, and then they open *together*, as one edit
 * mode behind one pencil. They can't simply be always-on fields: the title is
 * the link, and a URL someone typed into the description is a link too, and a
 * link cannot live inside a textarea. And the mode is shared rather than
 * per-field because a card with a pencil per editable line is a card of
 * pencils — one gesture puts the whole card in hand.
 *
 * The mode ends when focus leaves the head-and-description region — tabbing on
 * into the reasons, clicking elsewhere, Enter in the title — or on Escape,
 * which puts both drafts back. Each field still saves on its own blur, so
 * moving between the two commits as you go.
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

  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(trip.title);
  const [descriptionDraft, setDescriptionDraft] = useState(trip.description ?? '');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  // Which field the gesture was aimed at — the pencil means the title, a click
  // on the description means the description. Both fields open either way; only
  // the caret differs.
  const focusOn = useRef<'title' | 'description'>('title');
  // Escape reverts without saving. It closes the mode directly, which blurs
  // whichever field was focused, so this tells the blur handlers to stand down.
  // One flag for both fields, cleared when the mode is next opened rather than
  // by the save it skipped: only one field can have been focused, and the other
  // one's handler must not be left armed.
  const cancelled = useRef(false);

  // Stay in sync with the trip prop (e.g. after another field's mutation
  // invalidates and refetches the list) without clobbering an in-progress edit.
  useEffect(() => {
    setTitleDraft(trip.title);
    setDescriptionDraft(trip.description ?? '');
  }, [trip.title, trip.description]);

  // Opening puts you in the field you reached for. The title is one line and is
  // selected whole; the description gets a caret at the end, because you opened
  // a description to add to it, not to retype it.
  useEffect(() => {
    if (!editing) return;
    if (focusOn.current === 'title') {
      // focus() before select(): selecting alone is enough in a browser, but
      // the point here is where the caret went, so say it rather than lean on
      // a side effect.
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
      return;
    }
    const el = descriptionRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  // Grows the borderless textarea to fit its content instead of scrolling, so
  // the field is the same shape as the paragraph it replaced and opening it
  // doesn't jump the card. Depends on `editing` too: the textarea only exists
  // while editing, so its first measurement happens on that flip, not on a
  // change to the text.
  useEffect(() => {
    const el = descriptionRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [descriptionDraft, editing]);

  function startEditing(field: 'title' | 'description') {
    focusOn.current = field;
    cancelled.current = false;
    setTitleDraft(trip.title);
    // The description is not re-seeded, unlike the title: the paragraph already
    // shows the draft, and after a save that failed the draft is the only copy
    // of what was typed — which is what the error toast promised was still here.
    setEditing(true);
  }

  function cancelEditing() {
    cancelled.current = true;
    setTitleDraft(trip.title);
    setDescriptionDraft(trip.description ?? '');
    setEditing(false);
  }

  /** The mode belongs to the region, so it ends when focus leaves the region. */
  function endEditingOnFocusLeaving(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setEditing(false);
  }

  function saveTitle(value: string) {
    if (cancelled.current) return;
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
    if (cancelled.current) return;
    const parsed = value.trim() === '' ? null : value;
    if (parsed === trip.description) return;
    updateTrip.mutate(
      { entry: { description: parsed } },
      { onError: () => show("That didn't save. It's still here — try again.", 'error') },
    );
  }

  return (
    <article className={styles.card}>
      {/* `display: contents`: the wrapper is here to own the mode's focus, not
          to lay anything out, so the head and the description stay direct flex
          items of the card and the spacing is the card's as before. */}
      <div className={styles.editRegion} onBlur={editing ? endEditingOnFocusLeaving : undefined}>
        <div className={styles.head}>
          <h2 className={styles.title}>
            {editing ? (
              <input
                ref={titleInputRef}
                className={styles.titleInput}
                value={titleDraft}
                aria-label={`Trip name for ${titleDraft}`}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={(e) => saveTitle(e.target.value)}
                onKeyDown={(e) => {
                  // Enter commits and steps out: blurring the input moves focus
                  // off the region, and that is what closes the mode.
                  if (e.key === 'Enter') e.currentTarget.blur();
                  else if (e.key === 'Escape') cancelEditing();
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
            {editable && !editing && (
              <button
                type="button"
                className={styles.edit}
                title="Edit"
                aria-label={`Edit ${titleDraft}`}
                onClick={() => startEditing('title')}
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
            {editing ? (
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
                  if (e.key === 'Escape') cancelEditing();
                }}
              />
            ) : (
              // descriptionDraft, not trip.description: straight after a save it
              // already holds the new words, so the paragraph doesn't flicker
              // back while the list query refetches. The click is the mouse's
              // way into the same mode the pencil opens — and a link inside the
              // prose stops its own click, so following one opens nothing.
              <p
                className={[
                  styles.descriptionText,
                  editable ? styles.descriptionEditable : '',
                  descriptionDraft === '' ? styles.descriptionEmpty : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={editable ? () => startEditing('description') : undefined}
              >
                {descriptionDraft === '' ? 'Add a description' : <Linkify>{descriptionDraft}</Linkify>}
              </p>
            )}
          </div>
        )}
      </div>

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
