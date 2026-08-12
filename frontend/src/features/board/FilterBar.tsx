import { Chip } from '../../design/components/core/Chip';
import { Button } from '../../design/components/core/Button';
import { TabBar } from '../../components/TabBar';
import { MIDDOT } from '../../lib/formatDates';
import { CATEGORY_LABELS, CATEGORY_ORDER, EMPTY_FILTERS, GROUP_MODES, isNarrowed } from './filters';
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
 * reason. The chips narrow the list; the grouping control only decides what
 * headings the survivors sit under. Every chip keeps working in every group
 * mode — filtering by Food while grouped by place is a normal thing to want,
 * not a mode conflict — which falls out of the two controls writing to two
 * different pieces of state, never to each other's.
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
          Every grouping is one click from every other. This used to be a
          two-state toggle — "Group by place" on, off — which made grouping by
          category unreachable once you had grouped by place: the way back led
          only to a flat list. A segmented control shows all three states at
          once, so none of them is a dead end (screens.md: every narrowing
          carries its own way out, and grouping is no different).

          It reuses the app's own TabBar rather than dressing up three buttons —
          same segmented look as the design's rail, and the arrow-key handling
          comes with it.
        */}
        <div className={styles.groupControl}>
          <TabBar
            aria-label="Group ideas"
            tabs={GROUP_MODES}
            activeKey={groupMode}
            onChange={(key) => onGroupModeChange(key as GroupMode)}
          />
        </div>
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
          <Button variant="secondary" size="small" onClick={onNewIdea}>
            + New idea
          </Button>
        )}
      </div>
    </div>
  );
}
