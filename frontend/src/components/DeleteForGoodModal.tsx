import { Button } from '../design/components/core/Button';
import { Modal } from './Modal';
import type { DeleteForGoodPreview } from '../api/entries';
import styles from './DeleteForGoodModal.module.css';

export interface DeleteForGoodModalProps {
  open: boolean;
  /**
   * The counts the server refused with. Null before the refusal has come back
   * — there is nothing honest to say about a deletion until it arrives, so the
   * dialog does not render.
   */
  preview: DeleteForGoodPreview | null;
  /**
   * The trip whose screen this is, so "it's also in X" excludes it. The server
   * sends every trip the entry hangs under, because it has no idea which board
   * the request came from; naming the trip you are standing on back to you is
   * this component's job to avoid. An id, not a title: two trips can share a
   * name, and only one of them is the one you are on.
   */
  currentTripId?: number | null;
  onCancel: () => void;
  onConfirm: () => void;
  deleting?: boolean;
}

/**
 * `"Malaysia 2027"`, `"Malaysia 2027" and "Bali"`,
 * `"Malaysia 2027", "Bali" and "Hanoi"` — the same join
 * `DateShiftWarningModal.listDays` uses, with no comma before the "and". Trip
 * titles are quoted because they are arbitrary user text: without the quotes
 * a trip called "spring, maybe" would read as two trips.
 */
function listTitles(titles: string[]): string {
  const quoted = titles.map((title) => `"${title}"`);
  if (quoted.length <= 1) return quoted[0] ?? '';
  return `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`;
}

/**
 * Everything the dialog says, as plain strings.
 *
 * Two rules run through all of it. Singular and plural are written out rather
 * than pluralised with an "(s)" — one thing going with a trip is a different
 * sentence from fourteen, and the verb has to agree in both. And a count of
 * zero produces no line at all: "0 votes go too" is noise dressed as a fact,
 * and a dialog that lists what is about to be lost has to be readable at a
 * glance to be worth standing in front of a destroy.
 *
 * The descendant counts are called "things", not "ideas". The wire carries one
 * total per bucket and no breakdown by kind, and a subtree mixes ideas with
 * plans — the four bundles in a trip are plans in every other surface, so
 * "16 ideas" would be a false sentence in the one place a false sentence costs
 * the most. "Things" is true of both, and plain enough for the sentence before
 * an irreversible act. Votes and to-dos keep their own names: those counts are
 * exactly what they say.
 *
 * The order is: what this is, what goes with it, what survives, what is left
 * alone, and last the fact that lives outside this screen — the other trips
 * that lose it. The "inside it" facts stay together rather than being split
 * by the trips line.
 *
 * Kept unexported deliberately: this file exports one component, and a second
 * export from it costs a Fast Refresh warning for something the modal's own
 * test already reads through the rendered dialog.
 */
function deleteForGoodCopy(preview: DeleteForGoodPreview, currentTripId: number | null) {
  const isTrip = preview.kind === 'trip';
  const { votesCount: votes, todosCount: todos } = preview;
  const destroyed = preview.descendantsDestroyedCount;
  const surviving = preview.descendantsSurvivingCount;
  const leftBehind = preview.descendantsLeftBehindCount;

  const lines: string[] = [
    // Both branches carry the contrast — a trip is the more destructive of the
    // two and cannot be the one that says less. They differ only in the verb,
    // because the reversible step has a different name on each surface: the
    // trips list says "Saved for later" and offers "Bring back", a board says
    // "Set aside" and offers "Pick it back up".
    isTrip
      ? "This one can't be undone — unlike saving for later, there is no way back."
      : "This one can't be undone — unlike setting aside, there is no way back.",
  ];

  // Votes and to-dos are counted across everything that will be destroyed, not
  // only the target — so a trip says "in it", where an idea can say "on it".
  if (votes > 0 || todos > 0) {
    const parts: string[] = [];
    if (votes > 0) parts.push(`${votes} ${votes === 1 ? 'vote' : 'votes'}`);
    if (todos > 0) parts.push(`${todos} ${todos === 1 ? 'to-do' : 'to-dos'}`);
    // The verb agrees with the two counts together, not with either of them:
    // "1 vote and 1 to-do" is two things and goes plural.
    const one = votes + todos === 1;
    lines.push(`${parts.join(' and ')} ${isTrip ? 'in' : 'on'} it ${one ? 'goes' : 'go'} too.`);
  }

  if (destroyed > 0) {
    lines.push(
      isTrip
        ? `${destroyed} ${destroyed === 1 ? 'thing lives' : 'things live'} only in this trip and ${destroyed === 1 ? 'goes' : 'go'} with it.`
        : `${destroyed} ${destroyed === 1 ? 'thing inside it lives' : 'things inside it live'} nowhere else and ${destroyed === 1 ? 'goes' : 'go'} with it.`,
    );
  }

  if (surviving > 0) {
    // "6 more" only counts on from a line that has already named some — with
    // nothing destroyed there is nothing for these to be more than.
    const subject =
      destroyed > 0
        ? `${surviving} more ${surviving === 1 ? 'is' : 'are'}`
        : `${surviving} ${surviving === 1 ? 'thing inside it is' : 'things inside it are'}`;
    lines.push(
      `${subject} also in ${surviving === 1 ? 'another trip' : 'other trips'} and ${surviving === 1 ? 'stays where it is' : 'stay where they are'}.`,
    );
  }

  // Not a warning, a promise: these are somebody else's, so they are not yours
  // to destroy and the operation leaves them alive rather than refusing.
  if (leftBehind > 0) {
    lines.push(
      `${leftBehind} ${leftBehind === 1 ? 'thing inside was' : 'things inside were'} added by someone else and ${leftBehind === 1 ? 'stays' : 'stay'} in your library.`,
    );
  }

  // An idea in two trips is one row in both, not a copy in each, so deleting
  // it takes it out of both. Saying which other trips lose it is the whole
  // point of the line — "it's also elsewhere" would leave someone guessing.
  const otherTrips = preview.trips.filter((trip) => trip.id !== currentTripId);
  if (otherTrips.length > 0) {
    lines.push(
      `It's also in ${listTitles(otherTrips.map((trip) => trip.title))}, and it goes from ${otherTrips.length === 1 ? 'there' : 'all of them'} as well.`,
    );
  }

  return {
    title: `Delete "${preview.title}" for good?`,
    lines,
    // Names where the thing stays if you back out, in the words that surface
    // actually uses for it: "Set aside · N" on a board, "Saved for later" on
    // the trips list.
    cancelLabel: isTrip ? 'No, keep it saved for later' : 'No, keep it set aside',
    // Names the outcome, including the descendants — pressing a button that
    // says "delete it" and losing fourteen more things is the surprise this
    // dialog exists to prevent. Never a word that implies an undo: there is
    // none.
    confirmLabel: isTrip
      ? destroyed > 0
        ? `Yes, delete the trip and ${destroyed} ${destroyed === 1 ? 'thing' : 'things'}`
        : 'Yes, delete the trip for good'
      : destroyed > 0
        ? `Yes, delete it and ${destroyed} ${destroyed === 1 ? 'thing' : 'things'}`
        : 'Yes, delete it for good',
  };
}

/**
 * The second step, and the only one that destroys anything.
 *
 * Setting aside is one tap and always reversible; this is a separate act on
 * something already set aside, and it is the end of the road. The server
 * refuses the first, unconfirmed attempt and answers with the counts, so this
 * dialog — like DateShiftWarningModal, whose shape it copies — stands in front
 * of a change that has not happened. Cancelling therefore has nothing to undo;
 * confirming re-sends the same call with `confirm_permanent`.
 *
 * The copy says the true things and stops: that there is no way back, what
 * goes along with it, what survives because it lives somewhere else too, what
 * is left alone because it is not yours, and which other trips lose it.
 */
export function DeleteForGoodModal({
  open,
  preview,
  currentTripId = null,
  onCancel,
  onConfirm,
  deleting = false,
}: DeleteForGoodModalProps) {
  // No preview, nothing honest to say — and no dialog. The counts arrive with
  // the refusal, so this is the state between asking and being told.
  if (!preview) return null;

  const { title, lines, cancelLabel, confirmLabel } = deleteForGoodCopy(preview, currentTripId);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      actions={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={deleting} aria-busy={deleting || undefined}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {lines.map((line) => (
        <p key={line} className={styles.line}>
          {line}
        </p>
      ))}
    </Modal>
  );
}
