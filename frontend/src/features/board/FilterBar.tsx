import { Chip } from '../../design/components/core/Chip';
import { Button } from '../../design/components/core/Button';
import { MIDDOT } from '../../lib/formatDates';
import { CATEGORY_LABELS, CATEGORY_ORDER, EMPTY_FILTERS, isNarrowed } from './filters';
import type { GroupMode, IdeaFilters } from './filters';
import styles from './FilterBar.module.css';

export interface FilterBarProps {
  filters: IdeaFilters;
  onChange: (filters: IdeaFilters) => void;
  visibleCount: number;
  totalCount: number;
  groupMode: GroupMode;
  onGroupModeChange: (mode: GroupMode) => void;
  /** Omit to leave the "+ New idea" button out and render the count line alone. */
  onNewIdea?: () => void;
}

/**
 * The board's controls: what to show, and how to stack it.
 *
 * Filtering and grouping are orthogonal and stay visually apart for that
 * reason. The chips narrow the list; the "Group by place" button only decides
 * what headings the survivors sit under. Every chip keeps working in every
 * group mode — filtering by Food while grouped by place is a normal thing to
 * want, not a mode conflict — which falls out of the two controls writing to
 * two different pieces of state, never to each other's.
 *
 * Filters hide, never delete: the "Showing N of M" line and its "widen again"
 * escape are always rendered, narrowed or not — every narrowing carries its own
 * way out, per screens.md. Grouping needs no such escape, because it hides
 * nothing: a collapsed section still counts its ideas in its own header.
 *
 * Text search was removed here (it lives on the library screen) but the escape
 * hatch stays wired exactly the same: category, "has location" and
 * scheduled/potential still narrow, and "widen again" clears whatever is set.
 */
export function FilterBar({
  filters,
  onChange,
  visibleCount,
  totalCount,
  groupMode,
  onGroupModeChange,
  onNewIdea,
}: FilterBarProps) {
  const narrowed = isNarrowed(filters);
  const groupedByPlace = groupMode === 'location';

  return (
    <div className={styles.bar}>
      <div className={styles.controlRow}>
        <div className={styles.chips}>
          <span className={styles.label}>What</span>
          {CATEGORY_ORDER.map((category) => (
            <Chip
              key={category}
              selected={filters.category === category}
              onClick={() => onChange({ ...filters, category: filters.category === category ? null : category })}
            >
              {CATEGORY_LABELS[category]}
            </Chip>
          ))}
        </div>

        {/*
          The label flips to the past tense once it is on, so the button reads as
          the state and not only as the action; `aria-pressed` says the same
          thing to assistive tech, and the variant carries it visually. Toggling
          off returns to a flat list rather than falling back to categories —
          "off" should mean off, not a different grouping the user didn't ask for.
        */}
        <Button
          className={styles.groupToggle}
          variant={groupedByPlace ? 'primary' : 'secondary'}
          aria-pressed={groupedByPlace}
          onClick={() => onGroupModeChange(groupedByPlace ? 'none' : 'location')}
        >
          {groupedByPlace ? 'Grouped by place' : 'Group by place'}
        </Button>
      </div>

      {/* The remaining filters. Same chip language, their own label, because
          "What" belongs to the categories above and these narrow by state. */}
      <div className={styles.chips}>
        <span className={styles.label}>State</span>
        <Chip selected={filters.hasLocation} onClick={() => onChange({ ...filters, hasLocation: !filters.hasLocation })}>
          Has location
        </Chip>
        <Chip
          selected={filters.scheduleState === 'scheduled'}
          onClick={() =>
            onChange({ ...filters, scheduleState: filters.scheduleState === 'scheduled' ? 'all' : 'scheduled' })
          }
        >
          Scheduled
        </Chip>
        <Chip
          selected={filters.scheduleState === 'potential'}
          onClick={() =>
            onChange({ ...filters, scheduleState: filters.scheduleState === 'potential' ? 'all' : 'potential' })
          }
        >
          Potential
        </Chip>
      </div>

      <div className={styles.countRow}>
        <p className={styles.summary}>
          Showing {visibleCount} of {totalCount}
          {MIDDOT}
          <button type="button" className={styles.widen} onClick={() => onChange(EMPTY_FILTERS)} disabled={!narrowed}>
            widen again
          </button>
        </p>
        {onNewIdea && (
          <Button variant="secondary" onClick={onNewIdea}>
            + New idea
          </Button>
        )}
      </div>
    </div>
  );
}
