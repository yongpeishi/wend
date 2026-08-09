import { Link } from 'react-router-dom';
import { EntryRow } from '../../components/EntryRow';
import type { Entry } from '../../api/types';
import { joinMeta } from '../../lib/formatDates';
import { pinStateForEntry, pinStateLabel } from './pins';
import styles from './PinPopover.module.css';

export interface PinPopoverProps {
  entry: Entry;
}

/**
 * The compact popover screens.md asks for: an EntryRow, the keep toggle, and
 * a link into the drawer. The pin's state is stated in words here too —
 * colour (the marker's fill) never carries meaning alone.
 */
export function PinPopover({ entry }: PinPopoverProps) {
  const state = pinStateForEntry(entry);
  const meta = joinMeta(entry.category ?? undefined, entry.location_name ?? undefined);

  return (
    <div className={styles.popover}>
      <EntryRow title={entry.title} metadata={meta ? [meta] : []} kept />
      <p className={styles.state}>{pinStateLabel(state)}</p>
      <Link to={`/entries/${entry.id}`} className={styles.link}>
        Open
      </Link>
    </div>
  );
}
