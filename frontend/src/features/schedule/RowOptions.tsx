import { useEntry, useUpdateScheduleItem } from '../../api';
import styles from './RowOptions.module.css';

export interface RowOptionsProps {
  /** The schedule_item whose `chosen_entry_id` the choice writes to. */
  itemId: number;
  /** The bundle the item points at; its children are the options. */
  bundleId: number;
  chosenEntryId: number | null;
  /** May you make the choice? Defaults to true, matching a null role. */
  canEdit?: boolean;
}

/**
 * "Five options for dinner, I choose which one on the night."
 *
 * The one component on this screen that is not purely presentational, and the
 * one thing on Final schedule you can still change. Everything else that used
 * to edit the plan here — placing an idea, moving one back — went to the
 * Itinerary, which owns editing. This stayed because it is not planning: the
 * choice is made standing in the street at eight in the evening, which is
 * exactly when this screen is open.
 *
 * The members arrive on their own request rather than through the route's
 * `useEntries`, because a bundle's children are not the trip's entries — they
 * hang under the bundle, and `GET /entries/:id` is what returns them.
 *
 * Reversible: a second tap on the chosen option clears it. The others stay
 * where they are, dimmed by opacity only and never struck through — an option
 * you did not take tonight is still an option tomorrow.
 */
export function RowOptions({ itemId, bundleId, chosenEntryId, canEdit = true }: RowOptionsProps) {
  const { data } = useEntry(bundleId);
  const updateItem = useUpdateScheduleItem(itemId);
  const members = data?.children ?? [];

  function choose(entryId: number) {
    updateItem.mutate({ chosen_entry_id: chosenEntryId === entryId ? null : entryId });
  }

  // A bundle nobody has filled yet has nothing to decide between, and the row
  // above already says "open". An eyebrow over no options would be a promise of
  // a choice the traveller cannot make.
  if (members.length === 0) return null;

  return (
    <div className={styles.options}>
      <p className={styles.eyebrow}>Decide on the night</p>

      {members.map((member) => {
        const chosen = chosenEntryId === member.id;
        const className = [
          styles.option,
          chosen ? styles.chosen : '',
          chosenEntryId !== null && !chosen ? styles.dimmed : '',
        ]
          .filter(Boolean)
          .join(' ');

        const body = (
          <>
            <span className={styles.name}>{member.title}</span>
            {/* An editor's chosen option says so through aria-pressed. A viewer
                has no buttons to press, so the answer has to be a word. */}
            {!canEdit && chosen && <span className={styles.mark}>Chosen</span>}
          </>
        );

        if (!canEdit) {
          return (
            <div key={member.id} className={className}>
              {body}
            </div>
          );
        }

        return (
          <button
            key={member.id}
            type="button"
            className={className}
            aria-pressed={chosen}
            onClick={() => choose(member.id)}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}
